import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  isBsonObject,
  countExpandableNodes,
  getAllExpandablePaths,
  LARGE_TREE_NODE_LIMIT,
  LARGE_TREE_DEPTH_LIMIT,
} from "../components/results/MongoTreeViewer";
import { analyzeExplainPlan } from "../components/results/MongoExplainView";
import { isExplainResult } from "../components/results/MongoResultsViewer";
import {
  MongoExplainResult,
  MongoFindMqlResult,
  MongoAggregateMqlResult,
  MongoCountMqlResult,
  MongoDistinctMqlResult,
} from "../types";

describe("MongoDB Results Viewer Unit Tests", () => {
  describe("MongoTreeViewer — BSON and Hierarchy Analysis", () => {
    it("differentiates BSON objects from ordinary nested objects", () => {
      // BSON Extended JSON v2 objects
      assert.strictEqual(isBsonObject({ $oid: "507f1f77bcf86cd799439011" }), true);
      assert.strictEqual(isBsonObject({ $date: "2026-10-30T10:00:00.000Z" }), true);
      assert.strictEqual(isBsonObject({ $date: { $numberLong: "1730282400000" } }), true);
      assert.strictEqual(isBsonObject({ $numberLong: "9007199254740993" }), true);
      assert.strictEqual(isBsonObject({ $numberDecimal: "123.456" }), true);
      assert.strictEqual(isBsonObject({ $numberInt: "42" }), true);
      assert.strictEqual(isBsonObject({ $numberDouble: "42.5" }), true);
      assert.strictEqual(isBsonObject({ $binary: { base64: "SGVsbG8=", subType: "00" } }), true);
      assert.strictEqual(isBsonObject({ $timestamp: { t: 1, i: 2 } }), true);
      assert.strictEqual(isBsonObject({ $regex: "pattern", $options: "i" }), true);
      assert.strictEqual(isBsonObject({ $undefined: true }), true);

      // Ordinary objects
      assert.strictEqual(isBsonObject({ name: "Alice" }), false);
      assert.strictEqual(isBsonObject({ user: { email: "a@b.com" } }), false);
      assert.strictEqual(isBsonObject({ $where: "invalid" }), false);
      assert.strictEqual(isBsonObject({}), false);
      assert.strictEqual(isBsonObject([]), false);
      assert.strictEqual(isBsonObject(null), false);
      assert.strictEqual(isBsonObject(undefined), false);
      assert.strictEqual(isBsonObject("507f1f77bcf86cd799439011"), false);
      assert.strictEqual(isBsonObject(12345), false);
    });

    it("counts expandable nodes while treating BSON objects as terminals", () => {
      const doc = {
        _id: { $oid: "507f1f77bcf86cd799439011" }, // BSON leaf (not expandable)
        user: {
          name: "John",
          createdAt: { $date: "2026-10-30T10:00:00.000Z" }, // BSON leaf
          profile: {
            bio: "Developer",
            location: {
              city: "San Francisco",
              state: "CA",
            },
          },
        },
        tags: ["mongodb", "database", "mql"],
      };

      // Root object (1), user (1), profile (1), location (1), tags (1) = 5 expandable nodes
      const count = countExpandableNodes(doc);
      assert.strictEqual(count, 5);
    });

    it("collects hierarchical paths with stable dot and bracket notation", () => {
      const doc = {
        title: "RelWave",
        items: [
          { id: 1, val: "A" },
          { id: 2, val: "B" },
        ],
      };

      const paths = getAllExpandablePaths(doc, "$", 0, 10);
      assert.deepStrictEqual(paths, ["$", "$.items", "$.items[0]", "$.items[1]"]);
    });

    it("respects large tree safeguard limits when expanding nodes", () => {
      // Build a deeply nested structure exceeding limits
      const hugeData: any = { level0: {} };
      let current = hugeData.level0;
      for (let i = 1; i <= 10; i++) {
        current[`level${i}`] = {};
        current = current[`level${i}`];
      }

      // Max depth limit
      const pathsCappedByDepth = getAllExpandablePaths(hugeData, "$", 0, 3, 100);
      assert.ok(pathsCappedByDepth.length <= 4);

      // Max node limit
      const pathsCappedByNodes = getAllExpandablePaths(hugeData, "$", 0, 15, 2);
      assert.strictEqual(pathsCappedByNodes.length, 2);

      assert.strictEqual(LARGE_TREE_NODE_LIMIT, 500);
      assert.strictEqual(LARGE_TREE_DEPTH_LIMIT, 5);
    });
  });

  describe("MongoExplainView — Plan & Performance Analysis", () => {
    it("accurately detects COLLSCAN and generates unindexed warning flag", () => {
      const collScanExplain: MongoExplainResult = {
        collection: "orders",
        operation: "find",
        executionTimeMs: 42,
        queryPlanner: {
          plannerVersion: 1,
          namespace: "test.orders",
          indexFilterSet: false,
          winningPlan: {
            stage: "COLLSCAN",
            direction: "forward",
          },
        },
        executionStats: {
          executionSuccess: true,
          nReturned: 10,
          executionTimeMillis: 42,
          totalKeysExamined: 0,
          totalDocsExamined: 50000,
          executionStages: {
            stage: "COLLSCAN",
            nReturned: 10,
            docsExamined: 50000,
          },
        },
        rawExplain: { explainVersion: "1" },
      };

      const analysis = analyzeExplainPlan(collScanExplain);

      assert.strictEqual(analysis.winningStage, "COLLSCAN");
      assert.strictEqual(analysis.isCollScan, true);
      assert.strictEqual(analysis.isIxScan, false);
      assert.strictEqual(analysis.indexName, undefined);
      assert.strictEqual(analysis.totalDocsExamined, 50000);
      assert.strictEqual(analysis.totalKeysExamined, 0);
      assert.strictEqual(analysis.nReturned, 10);
      assert.strictEqual(analysis.executionTimeMs, 42);
      assert.strictEqual(analysis.hasExecutionStats, true);
      assert.strictEqual(analysis.highScanRatio, true);
      assert.strictEqual(analysis.namespace, "test.orders");
    });

    it("accurately detects nested IXSCAN inside FETCH stages and extracts index name", () => {
      const ixScanExplain: MongoExplainResult = {
        collection: "users",
        operation: "find",
        executionTimeMs: 3,
        queryPlanner: {
          plannerVersion: 1,
          namespace: "test.users",
          indexFilterSet: false,
          winningPlan: {
            stage: "FETCH",
            inputStage: {
              stage: "IXSCAN",
              indexName: "email_unique_idx",
              direction: "forward",
              keyPattern: { email: 1 },
            },
          },
        },
        executionStats: {
          executionSuccess: true,
          nReturned: 1,
          executionTimeMillis: 3,
          totalKeysExamined: 1,
          totalDocsExamined: 1,
          executionStages: {
            stage: "FETCH",
            nReturned: 1,
            docsExamined: 1,
            inputStage: {
              stage: "IXSCAN",
              indexName: "email_unique_idx",
              keysExamined: 1,
            },
          },
        },
        rawExplain: { serverInfo: { version: "7.0.0" } },
      };

      const analysis = analyzeExplainPlan(ixScanExplain);

      assert.strictEqual(analysis.winningStage, "FETCH");
      assert.strictEqual(analysis.isCollScan, false);
      assert.strictEqual(analysis.isIxScan, true);
      assert.strictEqual(analysis.indexName, "email_unique_idx");
      assert.strictEqual(analysis.totalDocsExamined, 1);
      assert.strictEqual(analysis.totalKeysExamined, 1);
      assert.strictEqual(analysis.nReturned, 1);
      assert.strictEqual(analysis.executionTimeMs, 3);
      assert.strictEqual(analysis.highScanRatio, false);
    });

    it("handles explain plans without executionStats (queryPlanner verbosity)", () => {
      const plannerOnlyExplain: MongoExplainResult = {
        collection: "audit_logs",
        operation: "aggregate",
        executionTimeMs: 5,
        queryPlanner: {
          plannerVersion: 1,
          namespace: "test.audit_logs",
          indexFilterSet: false,
          winningPlan: {
            stage: "COLLSCAN",
          },
          rejectedPlans: [{ stage: "COLLSCAN" }],
        },
        rawExplain: {},
      };

      const analysis = analyzeExplainPlan(plannerOnlyExplain);

      assert.strictEqual(analysis.winningStage, "COLLSCAN");
      assert.strictEqual(analysis.isCollScan, true);
      assert.strictEqual(analysis.hasExecutionStats, false);
      assert.strictEqual(analysis.totalDocsExamined, undefined);
      assert.strictEqual(analysis.nReturned, undefined);
      assert.strictEqual(analysis.rejectedPlansCount, 1);
      assert.strictEqual(analysis.executionTimeMs, 5);
    });

    it("flags high scan-to-return ratio when examined docs far exceed returned", () => {
      const highRatioExplain: MongoExplainResult = {
        collection: "events",
        operation: "find",
        executionTimeMs: 120,
        queryPlanner: {
          plannerVersion: 1,
          namespace: "test.events",
          indexFilterSet: false,
          winningPlan: {
            stage: "FETCH",
            inputStage: {
              stage: "IXSCAN",
              indexName: "category_idx",
            },
          },
        },
        executionStats: {
          executionSuccess: true,
          nReturned: 5,
          executionTimeMillis: 120,
          totalKeysExamined: 5000,
          totalDocsExamined: 5000,
          executionStages: {
            stage: "FETCH",
            nReturned: 5,
            docsExamined: 5000,
          },
        },
        rawExplain: {},
      };

      const analysis = analyzeExplainPlan(highRatioExplain);

      assert.strictEqual(analysis.isIxScan, true);
      assert.strictEqual(analysis.highScanRatio, true);
      assert.strictEqual(analysis.efficiencyRatio, 1000); // 5000 / 5
    });
  });

  describe("MongoResultsViewer — Result Type Guards & Contracts", () => {
    it("accurately identifies explain results via isExplainResult", () => {
      const explainRes: MongoExplainResult = {
        collection: "coll",
        operation: "find",
        executionTimeMs: 10,
        queryPlanner: {
          plannerVersion: 1,
          namespace: "db.coll",
          indexFilterSet: false,
          winningPlan: { stage: "COLLSCAN" },
        },
        rawExplain: {},
      };

      assert.strictEqual(isExplainResult(explainRes), true);

      // Not explain results
      const findRes: MongoFindMqlResult = {
        operation: "find",
        collection: "coll",
        executionTimeMs: 15,
        documents: [{ _id: 1 }],
        totalReturned: 1,
      };
      assert.strictEqual(isExplainResult(findRes), false);

      const aggRes: MongoAggregateMqlResult = {
        operation: "aggregate",
        collection: "coll",
        executionTimeMs: 20,
        documents: [],
        stageCount: 2,
      };
      assert.strictEqual(isExplainResult(aggRes), false);

      const countRes: MongoCountMqlResult = {
        operation: "countDocuments",
        collection: "coll",
        executionTimeMs: 8,
        count: 100,
      };
      assert.strictEqual(isExplainResult(countRes), false);

      const distinctRes: MongoDistinctMqlResult = {
        operation: "distinct",
        collection: "coll",
        executionTimeMs: 12,
        field: "status",
        values: ["active", "pending"],
        count: 2,
      };
      assert.strictEqual(isExplainResult(distinctRes), false);

      assert.strictEqual(isExplainResult(null), false);
      assert.strictEqual(isExplainResult(undefined), false);
      assert.strictEqual(isExplainResult(""), false);
      assert.strictEqual(isExplainResult({}), false);
    });

    it("validates all 5 MQL execution result structures", () => {
      const findResult: MongoFindMqlResult = {
        operation: "find",
        collection: "users",
        executionTimeMs: 12,
        documents: [{ _id: { $oid: "507f1f77bcf86cd799439011" }, name: "John" }],
        totalReturned: 1,
      };
      assert.strictEqual(findResult.operation, "find");
      assert.strictEqual(findResult.documents.length, 1);

      const countResult: MongoCountMqlResult = {
        operation: "estimatedDocumentCount",
        collection: "orders",
        executionTimeMs: 1,
        count: 15420,
      };
      assert.strictEqual(countResult.operation, "estimatedDocumentCount");
      assert.strictEqual(countResult.count, 15420);

      const distinctResult: MongoDistinctMqlResult = {
        operation: "distinct",
        collection: "products",
        executionTimeMs: 5,
        field: "category",
        values: ["electronics", "apparel", "books"],
        count: 3,
      };
      assert.strictEqual(distinctResult.operation, "distinct");
      assert.strictEqual(distinctResult.values.length, 3);
    });
  });
});
