import { describe, it, beforeEach } from "node:test";
import assert from "node:assert/strict";
import {
  OPERATION_TEMPLATES,
  MONGOSH_DEFAULT_TEMPLATE,
  isExplainSupported,
  getExplainDisabledReason,
  EXPLAIN_SUPPORTED_OPERATIONS,
  MongoWorkspaceOpType,
} from "../components/workspace/MongoWorkspacePanel";
import { parseMongoshQuery } from "../parser";
import {
  isExplainResult,
  analyzeExplainPlan,
} from "../components/results";
import {
  getHistory,
  addHistoryEntry,
  clearHistory,
  getHistorySettings,
  updateHistorySettings,
  setStorageAdapterForTesting,
  StorageAdapter,
} from "../history";
import {
  MongoFindMqlResult,
  MongoAggregateMqlResult,
  MongoCountMqlResult,
  MongoDistinctMqlResult,
  MongoExplainResult,
} from "../types";

function createMockStorage(): StorageAdapter {
  const store = new Map<string, string>();
  return {
    getItem: (key: string) => store.get(key) ?? null,
    setItem: (key: string, value: string) => {
      store.set(key, value);
    },
    removeItem: (key: string) => {
      store.delete(key);
    },
  };
}

describe("MongoWorkspacePanel — Step 4 Integration Tests", () => {
  let mockStorage: StorageAdapter;

  beforeEach(() => {
    mockStorage = createMockStorage();
    setStorageAdapterForTesting(mockStorage);
  });

  describe("1. Input Mode Integration (JSON vs mongosh)", () => {
    it("maintains operational templates for all 5 JSON operations", () => {
      assert.strictEqual(typeof OPERATION_TEMPLATES.find, "string");
      assert.strictEqual(typeof OPERATION_TEMPLATES.aggregate, "string");
      assert.strictEqual(typeof OPERATION_TEMPLATES.countDocuments, "string");
      assert.strictEqual(typeof OPERATION_TEMPLATES.estimatedDocumentCount, "string");
      assert.strictEqual(typeof OPERATION_TEMPLATES.distinct, "string");

      const parsedFind = JSON.parse(OPERATION_TEMPLATES.find);
      assert.deepStrictEqual(parsedFind, { filter: {} });

      const parsedAgg = JSON.parse(OPERATION_TEMPLATES.aggregate);
      assert.ok(Array.isArray(parsedAgg));
      assert.strictEqual(parsedAgg.length, 1);
      assert.deepStrictEqual(parsedAgg[0], { $match: {} });
    });

    it("provides idiomatic mongosh default template", () => {
      assert.strictEqual(MONGOSH_DEFAULT_TEMPLATE, "db.users.find({})");

      // Verify mongosh starter parses cleanly with the deterministic parser
      const parsed = parseMongoshQuery(MONGOSH_DEFAULT_TEMPLATE);
      assert.strictEqual(parsed.collection, "users");
      assert.strictEqual(parsed.op.operation, "find");
      assert.deepStrictEqual(parsed.op.payload.filter, {});
    });

    it("verifies explain support restrictions across operations", () => {
      assert.strictEqual(isExplainSupported("find"), true);
      assert.strictEqual(isExplainSupported("aggregate"), true);
      assert.strictEqual(isExplainSupported("countDocuments"), false);
      assert.strictEqual(isExplainSupported("estimatedDocumentCount"), false);
      assert.strictEqual(isExplainSupported("distinct"), false);

      assert.strictEqual(getExplainDisabledReason("find"), null);
      assert.strictEqual(getExplainDisabledReason("aggregate"), null);
      assert.ok(
        getExplainDisabledReason("countDocuments")?.includes("only supported for find() and aggregate()")
      );
      assert.ok(
        getExplainDisabledReason("distinct")?.includes("only supported for find() and aggregate()")
      );

      assert.strictEqual(EXPLAIN_SUPPORTED_OPERATIONS.size, 2);
    });
  });

  describe("2. Mongosh Parser-to-RPC Pipeline Integration", () => {
    it("parses valid mongosh query into strongly typed MQL operation", () => {
      const query = `db.orders.find({ status: "PAID", total: { $gte: 100 } }).sort({ createdAt: -1 }).limit(25)`;
      const parsed = parseMongoshQuery(query);

      assert.strictEqual(parsed.collection, "orders");
      assert.strictEqual(parsed.op.operation, "find");
      assert.deepStrictEqual(parsed.op.payload.filter, {
        status: "PAID",
        total: { $gte: 100 },
      });
      assert.deepStrictEqual(parsed.op.payload.sort, { createdAt: -1 });
      assert.strictEqual(parsed.op.payload.limit, 25);
    });

    it("rejects invalid mongosh query without invoking bridge RPC", () => {
      const invalidQuery = `db.orders.find({ unclosedBrace: 123`;
      assert.throws(() => {
        parseMongoshQuery(invalidQuery);
      });
    });

    it("rejects unsafe JavaScript constructs before dispatch", () => {
      const unsafeQuery = `db.users.find(); var x = 1;`;
      assert.throws(() => {
        parseMongoshQuery(unsafeQuery);
      });
    });

    it("enforces explain restrictions on mongosh operations", () => {
      // 1. Valid find is explainable
      const findQuery = `db.users.find({ active: true })`;
      const findParsed = parseMongoshQuery(findQuery);
      assert.strictEqual(isExplainSupported(findParsed.op.operation as MongoWorkspaceOpType), true);

      // 2. Valid aggregate is explainable
      const aggQuery = `db.orders.aggregate([{ $match: { total: { $gt: 50 } } }])`;
      const aggParsed = parseMongoshQuery(aggQuery);
      assert.strictEqual(isExplainSupported(aggParsed.op.operation as MongoWorkspaceOpType), true);

      // 3. Count in mongosh is NOT explainable in M5
      const countQuery = `db.users.countDocuments({ active: true })`;
      const countParsed = parseMongoshQuery(countQuery);
      assert.strictEqual(isExplainSupported(countParsed.op.operation as MongoWorkspaceOpType), false);
      assert.ok(
        getExplainDisabledReason(countParsed.op.operation as MongoWorkspaceOpType)?.includes("only supported for find()")
      );

      // 4. Distinct in mongosh is NOT explainable in M5
      const distinctQuery = `db.users.distinct("email")`;
      const distinctParsed = parseMongoshQuery(distinctQuery);
      assert.strictEqual(isExplainSupported(distinctParsed.op.operation as MongoWorkspaceOpType), false);
    });
  });

  describe("3. Results Viewer Integration Contracts", () => {
    it("handles find and aggregate document array results", () => {
      const findRes: MongoFindMqlResult = {
        operation: "find",
        collection: "users",
        executionTimeMs: 14,
        documents: [
          { _id: { $oid: "507f1f77bcf86cd799439011" }, name: "Alice", active: true },
          { _id: { $oid: "507f1f77bcf86cd799439012" }, name: "Bob", active: false },
        ],
        totalReturned: 2,
      };

      assert.strictEqual(isExplainResult(findRes), false);
      assert.strictEqual(findRes.documents.length, 2);

      const aggRes: MongoAggregateMqlResult = {
        operation: "aggregate",
        collection: "orders",
        executionTimeMs: 32,
        documents: [{ _id: "PAID", count: 120 }],
        stageCount: 2,
      };

      assert.strictEqual(isExplainResult(aggRes), false);
      assert.strictEqual(aggRes.documents.length, 1);
    });

    it("handles countDocuments and estimatedDocumentCount primitive metric results", () => {
      const countRes: MongoCountMqlResult = {
        operation: "countDocuments",
        collection: "events",
        executionTimeMs: 8,
        count: 4210,
      };

      assert.strictEqual(isExplainResult(countRes), false);
      assert.strictEqual(countRes.count, 4210);

      const estRes: MongoCountMqlResult = {
        operation: "estimatedDocumentCount",
        collection: "events",
        executionTimeMs: 1,
        count: 500000,
      };

      assert.strictEqual(isExplainResult(estRes), false);
      assert.strictEqual(estRes.count, 500000);
    });

    it("handles distinct result structures", () => {
      const distinctRes: MongoDistinctMqlResult = {
        operation: "distinct",
        collection: "products",
        executionTimeMs: 9,
        field: "brand",
        values: ["Apple", "Samsung", "Sony"],
        count: 3,
      };

      assert.strictEqual(isExplainResult(distinctRes), false);
      assert.strictEqual(distinctRes.values.length, 3);
      assert.strictEqual(distinctRes.field, "brand");
    });

    it("handles structured explain result and plan analysis", () => {
      const explainRes: MongoExplainResult = {
        collection: "users",
        operation: "find",
        executionTimeMs: 6,
        queryPlanner: {
          plannerVersion: 1,
          namespace: "test.users",
          indexFilterSet: false,
          winningPlan: {
            stage: "FETCH",
            inputStage: {
              stage: "IXSCAN",
              indexName: "email_1",
            },
          },
        },
        executionStats: {
          executionSuccess: true,
          nReturned: 1,
          executionTimeMillis: 6,
          totalKeysExamined: 1,
          totalDocsExamined: 1,
          executionStages: {
            stage: "FETCH",
            docsExamined: 1,
            inputStage: { stage: "IXSCAN", keysExamined: 1 },
          },
        },
        rawExplain: {},
      };

      assert.strictEqual(isExplainResult(explainRes), true);
      const analysis = analyzeExplainPlan(explainRes);
      assert.strictEqual(analysis.winningStage, "FETCH");
      assert.strictEqual(analysis.isIxScan, true);
      assert.strictEqual(analysis.indexName, "email_1");
    });
  });

  describe("4. Query History Workspace Integration", () => {
    it("persists execution metadata to history scoped to connection dbId", () => {
      const dbId = "workspace-test-db";

      // 1. Record success
      addHistoryEntry(dbId, {
        collection: "users",
        operation: "find",
        queryText: `db.users.find({ email: "secret@company.com" })`,
        durationMs: 18,
        status: "success",
        resultCount: 1,
      });

      const history = getHistory(dbId);
      assert.strictEqual(history.length, 1);
      assert.strictEqual(history[0].collection, "users");
      assert.strictEqual(history[0].status, "success");
      assert.strictEqual(history[0].isRedacted, true);
      assert.strictEqual(
        history[0].redactedQueryText,
        `db.users.find({ email: "<string>" })`
      );
      assert.ok(!history[0].redactedQueryText.includes("secret@company.com"));
    });

    it("persists failed execution metadata without sensitive information", () => {
      const dbId = "workspace-fail-db";

      addHistoryEntry(dbId, {
        collection: "accounts",
        operation: "find",
        queryText: `db.accounts.find({ pin: 1234 })`,
        durationMs: 0,
        status: "error",
        errorMessage: "Auth failed on mongodb://admin:secretPass@localhost:27017",
      });

      const history = getHistory(dbId);
      assert.strictEqual(history.length, 1);
      assert.strictEqual(history[0].status, "error");
      assert.ok(!history[0].errorMessage?.includes("secretPass"));
      assert.ok(history[0].errorMessage?.includes("<redacted-password>"));
      assert.strictEqual(
        history[0].redactedQueryText,
        `db.accounts.find({ pin: <number> })`
      );
    });

    it("respects raw query opt-in preference when user explicitly toggles", () => {
      const dbId = "raw-optin-db";

      // Disabled by default
      assert.strictEqual(getHistorySettings(dbId).storeRawQueries, false);

      // Explicit opt-in
      updateHistorySettings(dbId, { storeRawQueries: true });
      assert.strictEqual(getHistorySettings(dbId).storeRawQueries, true);

      addHistoryEntry(dbId, {
        collection: "users",
        operation: "find",
        queryText: `db.users.find({ role: "ADMIN" })`,
        durationMs: 10,
        status: "success",
      });

      const history = getHistory(dbId);
      assert.strictEqual(history[0].isRedacted, false);
      assert.strictEqual(history[0].rawQueryText, `db.users.find({ role: "ADMIN" })`);
    });

    it("clears connection history completely", () => {
      const dbId = "clear-db";
      addHistoryEntry(dbId, {
        collection: "c",
        operation: "find",
        queryText: "{}",
        durationMs: 1,
        status: "success",
      });

      assert.strictEqual(getHistory(dbId).length, 1);
      clearHistory(dbId);
      assert.strictEqual(getHistory(dbId).length, 0);
    });
  });

  describe("5. Connection Switching & Isolation Guarantees", () => {
    it("guarantees independent query history between distinct connections", () => {
      const dbA = "conn-cluster-primary";
      const dbB = "conn-cluster-analytics";

      addHistoryEntry(dbA, {
        collection: "orders",
        operation: "find",
        queryText: "db.orders.find({})",
        durationMs: 5,
        status: "success",
      });

      addHistoryEntry(dbB, {
        collection: "metrics",
        operation: "aggregate",
        queryText: "db.metrics.aggregate([])",
        durationMs: 20,
        status: "success",
      });

      assert.strictEqual(getHistory(dbA).length, 1);
      assert.strictEqual(getHistory(dbA)[0].collection, "orders");

      assert.strictEqual(getHistory(dbB).length, 1);
      assert.strictEqual(getHistory(dbB)[0].collection, "metrics");

      // Clear dbA must not affect dbB
      clearHistory(dbA);
      assert.strictEqual(getHistory(dbA).length, 0);
      assert.strictEqual(getHistory(dbB).length, 1);
    });
  });
});
