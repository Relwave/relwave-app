import { describe, expect, test, beforeEach, jest } from "@jest/globals";
import { MongoClient } from "mongodb";
import {
  assertCollectionName,
  clampMqlTimeout,
  executeMql,
  explainMql,
  mongoConnector,
} from "../../src/connectors/mongo";
import { QueryExecutor } from "../../src/services/queryExecutor";
import { DBType } from "../../src/types";
import type {
  MongoConfig,
  MongoMqlExecuteRequest,
  MongoExplainRequest,
} from "../../src/types/mongo";

describe("Mongo MQL Unit Tests (docs/MONGODB_M5_SPEC.md)", () => {
  const dummyConfig: MongoConfig = {
    uri: "mongodb://localhost:27017/testdb",
    database: "testdb",
  };

  let mockCursorDocs: any[];
  let mockCursor: any;
  let mockCollection: any;

  beforeEach(() => {
    mockCursorDocs = [];
    mockCursor = {
      [Symbol.asyncIterator]: async function* () {
        for (const doc of mockCursorDocs) {
          yield doc;
        }
      },
      close: jest.fn().mockImplementation(() => Promise.resolve()),
      toArray: jest.fn().mockImplementation(() => Promise.resolve(mockCursorDocs)),
      explain: jest.fn().mockImplementation((verbosity: string) =>
        Promise.resolve({
          queryPlanner: {
            plannerVersion: 1,
            namespace: "testdb.users",
            indexFilterSet: false,
            winningPlan: { stage: "COLLSCAN" },
          },
          executionStats:
            verbosity !== "queryPlanner"
              ? {
                  executionSuccess: true,
                  nReturned: 5,
                  executionTimeMillis: 2,
                  totalKeysExamined: 0,
                  totalDocsExamined: 5,
                  executionStages: { stage: "COLLSCAN" },
                }
              : undefined,
          serverInfo: {
            host: "localhost",
            port: 27017,
            version: "7.0.0",
          },
        }),
      ),
      sort: jest.fn().mockReturnThis(),
      project: jest.fn().mockReturnThis(),
      skip: jest.fn().mockReturnThis(),
      limit: jest.fn().mockReturnThis(),
    };

    mockCollection = {
      find: jest.fn().mockReturnValue(mockCursor),
      aggregate: jest.fn().mockReturnValue(mockCursor),
      countDocuments: jest.fn().mockImplementation(() => Promise.resolve(42)),
      estimatedDocumentCount: jest.fn().mockImplementation(() => Promise.resolve(100)),
      distinct: jest.fn().mockImplementation(() => Promise.resolve(["apple", "banana"])),
    };

    jest.spyOn(MongoClient.prototype, "db").mockReturnValue({
      collection: () => mockCollection,
    } as any);
  });

  describe("assertCollectionName", () => {
    test("accepts valid collection names including dots, dashes, underscores, and numbers", () => {
      expect(() => assertCollectionName("users")).not.toThrow();
      expect(() => assertCollectionName("audit.events")).not.toThrow();
      expect(() => assertCollectionName("logs.2026.10")).not.toThrow();
      expect(() => assertCollectionName("2026_events")).not.toThrow();
      expect(() => assertCollectionName("user-data")).not.toThrow();
      expect(() => assertCollectionName("collection with spaces")).not.toThrow();
      expect(() => assertCollectionName("a".repeat(120))).not.toThrow();
    });

    test("rejects empty or non-string collection names", () => {
      expect(() => assertCollectionName("")).toThrow(
        expect.objectContaining({ code: "MONGO_VALIDATION_ERROR" }),
      );
      expect(() => assertCollectionName(null)).toThrow(
        expect.objectContaining({ code: "MONGO_VALIDATION_ERROR" }),
      );
      expect(() => assertCollectionName(undefined)).toThrow(
        expect.objectContaining({ code: "MONGO_VALIDATION_ERROR" }),
      );
      expect(() => assertCollectionName(123)).toThrow(
        expect.objectContaining({ code: "MONGO_VALIDATION_ERROR" }),
      );
    });

    test("rejects collection names exceeding 120 bytes", () => {
      expect(() => assertCollectionName("a".repeat(121))).toThrow(
        expect.objectContaining({
          code: "MONGO_VALIDATION_ERROR",
          message: "collection name must not exceed 120 bytes",
        }),
      );
    });

    test("rejects collection names with null bytes or dollar signs", () => {
      expect(() => assertCollectionName("audit\0events")).toThrow(
        expect.objectContaining({
          code: "MONGO_VALIDATION_ERROR",
          message: "collection name must not contain '$' or null bytes",
        }),
      );
      expect(() => assertCollectionName("my$collection")).toThrow(
        expect.objectContaining({
          code: "MONGO_VALIDATION_ERROR",
          message: "collection name must not contain '$' or null bytes",
        }),
      );
    });

    test("rejects collection names starting with 'system.'", () => {
      expect(() => assertCollectionName("system.views")).toThrow(
        expect.objectContaining({
          code: "MONGO_VALIDATION_ERROR",
          message: "collection name must not start with 'system.'",
        }),
      );
      expect(() => assertCollectionName("system.profile")).toThrow(
        expect.objectContaining({
          code: "MONGO_VALIDATION_ERROR",
          message: "collection name must not start with 'system.'",
        }),
      );
    });
  });

  describe("clampMqlTimeout", () => {
    test("returns default when undefined or null", () => {
      expect(clampMqlTimeout(undefined, 5000)).toBe(5000);
      expect(clampMqlTimeout(null as any, 10000)).toBe(10000);
    });

    test("throws MONGO_VALIDATION_ERROR for non-integers, negative, or NaN", () => {
      expect(() => clampMqlTimeout(0, 5000)).toThrow(
        expect.objectContaining({
          code: "MONGO_VALIDATION_ERROR",
          message: "maxTimeMS must be a positive integer",
        }),
      );
      expect(() => clampMqlTimeout(-10, 5000)).toThrow(
        expect.objectContaining({
          code: "MONGO_VALIDATION_ERROR",
          message: "maxTimeMS must be a positive integer",
        }),
      );
      expect(() => clampMqlTimeout(NaN, 5000)).toThrow(
        expect.objectContaining({
          code: "MONGO_VALIDATION_ERROR",
          message: "maxTimeMS must be a positive integer",
        }),
      );
      expect(() => clampMqlTimeout(1.5, 5000)).toThrow(
        expect.objectContaining({
          code: "MONGO_VALIDATION_ERROR",
          message: "maxTimeMS must be a positive integer",
        }),
      );
    });

    test("clamps value between 1 and maxMs (default 60000)", () => {
      expect(clampMqlTimeout(100, 5000)).toBe(100);
      expect(clampMqlTimeout(50000, 5000)).toBe(50000);
      expect(clampMqlTimeout(120000, 5000)).toBe(60000);
      expect(clampMqlTimeout(80000, 5000, 30000)).toBe(30000);
    });
  });

  describe("executeMql: Mutating operations guard", () => {
    const mutatingOps = [
      "insertOne",
      "insertMany",
      "updateOne",
      "updateMany",
      "replaceOne",
      "deleteOne",
      "deleteMany",
      "drop",
      "dropDatabase",
      "rename",
      "createIndex",
      "dropIndex",
      "bulkWrite",
      "command",
      "runCommand",
      "eval",
    ];

    test.each(mutatingOps)("rejects mutating operation '%s'", async (op) => {
      const req = {
        collection: "users",
        op: { operation: op, payload: {} },
      } as any;

      await expect(executeMql(dummyConfig, req)).rejects.toMatchObject({
        code: "MONGO_FORBIDDEN_OPERATION",
        message: `Operation '${op}' is forbidden in read-only query workspace. Use RelWave document mutation actions.`,
      });
    });
  });

  describe("executeMql: 'find' operation", () => {
    test("rejects non-object filter with MONGO_INVALID_FILTER", async () => {
      for (const badFilter of ["string", 123, true, [1, 2]]) {
        await expect(
          executeMql(dummyConfig, {
            collection: "users",
            op: {
              operation: "find",
              payload: { filter: badFilter as any },
            },
          }),
        ).rejects.toMatchObject({
          code: "MONGO_INVALID_FILTER",
          message: "filter must be an object",
        });
      }
    });

    test("validates safe expressions and rejects $where in filter", async () => {
      const req: MongoMqlExecuteRequest = {
        collection: "users",
        op: {
          operation: "find",
          payload: {
            filter: { $where: "this.age > 21" },
          },
        },
      };

      await expect(executeMql(dummyConfig, req)).rejects.toMatchObject({
        code: "MONGO_FORBIDDEN_OPERATOR",
        message:
          "Operator '$where' is forbidden (server-side JavaScript execution is not permitted)",
      });
    });

    test("rejects negative skip", async () => {
      const req: MongoMqlExecuteRequest = {
        collection: "users",
        op: {
          operation: "find",
          payload: {
            filter: {},
            skip: -5,
          },
        },
      };

      await expect(executeMql(dummyConfig, req)).rejects.toMatchObject({
        code: "MONGO_VALIDATION_ERROR",
        message: "skip must be a non-negative integer",
      });
    });

    test("clamps limit between 1 and MAX_PAGE_SIZE (100) and defaults to 50", async () => {
      // 1. Omitted limit -> defaults to 50
      await executeMql(dummyConfig, {
        collection: "users",
        op: {
          operation: "find",
          payload: { filter: {} },
        },
      });
      expect(mockCollection.find).toHaveBeenCalledWith({}, expect.objectContaining({ limit: 50 }));

      // 2. Limit 200 -> clamped to 100
      await executeMql(dummyConfig, {
        collection: "users",
        op: {
          operation: "find",
          payload: { filter: {}, limit: 200 },
        },
      });
      expect(mockCollection.find).toHaveBeenCalledWith({}, expect.objectContaining({ limit: 100 }));

      // 3. Limit 0 or negative -> defaults to 50
      await executeMql(dummyConfig, {
        collection: "users",
        op: {
          operation: "find",
          payload: { filter: {}, limit: -10 },
        },
      });
      expect(mockCollection.find).toHaveBeenCalledWith({}, expect.objectContaining({ limit: 50 }));
    });

    test("executes find and converts results to EJSON", async () => {
      mockCursor.toArray.mockResolvedValueOnce([{ _id: "123", name: "Alice", age: 30 }]);

      const res = await executeMql(dummyConfig, {
        collection: "users",
        op: {
          operation: "find",
          payload: {
            filter: { name: "Alice" },
            sort: { age: 1 },
            skip: 10,
            limit: 25,
          },
        },
      });

      expect(res.operation).toBe("find");
      expect(res.collection).toBe("users");
      expect((res as any).totalReturned).toBe(1);
      expect((res as any).documents).toEqual([{ _id: "123", name: "Alice", age: 30 }]);
      expect(typeof res.executionTimeMs).toBe("number");
    });
  });

  describe("executeMql: 'aggregate' operation", () => {
    test("rejects $out in pipeline", async () => {
      const req: MongoMqlExecuteRequest = {
        collection: "users",
        op: {
          operation: "aggregate",
          payload: {
            pipeline: [{ $out: "target" }],
          },
        },
      };

      await expect(executeMql(dummyConfig, req)).rejects.toMatchObject({
        code: "MONGO_WRITE_STAGE_FORBIDDEN",
      });
    });

    test("executes empty pipeline [] successfully", async () => {
      mockCursorDocs = [{ _id: "doc1" }, { _id: "doc2" }];

      const res = await executeMql(dummyConfig, {
        collection: "users",
        op: {
          operation: "aggregate",
          payload: {
            pipeline: [],
          },
        },
      });

      expect(res.operation).toBe("aggregate");
      expect((res as any).stageCount).toBe(0);
      expect((res as any).documents).toHaveLength(2);
      expect(mockCursor.close).toHaveBeenCalledTimes(1);
    });

    test("terminates iteration at 1,001 documents, throws MONGO_LIMIT_EXCEEDED, and closes cursor", async () => {
      let yieldedCount = 0;
      mockCursor[Symbol.asyncIterator] = async function* () {
        for (let i = 1; i <= 1050; i++) {
          yieldedCount++;
          yield { _id: `doc_${i}` };
        }
      };

      await expect(
        executeMql(dummyConfig, {
          collection: "users",
          op: {
            operation: "aggregate",
            payload: {
              pipeline: [{ $match: {} }],
            },
          },
        }),
      ).rejects.toMatchObject({
        code: "MONGO_LIMIT_EXCEEDED",
        message: "aggregation returned more than 1000 documents (max 1000); add a $limit stage",
      });

      expect(yieldedCount).toBe(1001);
      expect(mockCursor.close).toHaveBeenCalledTimes(1);
    });

    test("passes allowDiskUse and batchSize options to aggregate", async () => {
      mockCursorDocs = [{ _id: 1 }];

      await executeMql(dummyConfig, {
        collection: "users",
        op: {
          operation: "aggregate",
          payload: {
            pipeline: [],
            allowDiskUse: true,
            batchSize: 100,
          },
        },
      });

      expect(mockCollection.aggregate).toHaveBeenCalledWith(
        [],
        expect.objectContaining({
          allowDiskUse: true,
          batchSize: 100,
        }),
      );
    });
  });

  describe("executeMql: 'countDocuments' operation", () => {
    test("rejects non-object filter with MONGO_INVALID_FILTER", async () => {
      for (const badFilter of ["string", 123, true, [1, 2]]) {
        await expect(
          executeMql(dummyConfig, {
            collection: "users",
            op: {
              operation: "countDocuments",
              payload: { filter: badFilter as any },
            },
          }),
        ).rejects.toMatchObject({
          code: "MONGO_INVALID_FILTER",
          message: "filter must be an object",
        });
      }
    });

    test("rejects $function in filter", async () => {
      const req: MongoMqlExecuteRequest = {
        collection: "users",
        op: {
          operation: "countDocuments",
          payload: {
            filter: {
              $function: { body: "function() {}", args: [], lang: "js" },
            } as any,
          },
        },
      };

      await expect(executeMql(dummyConfig, req)).rejects.toMatchObject({
        code: "MONGO_FORBIDDEN_OPERATOR",
      });
    });

    test("executes count with safe filter", async () => {
      mockCollection.countDocuments.mockResolvedValueOnce(88);

      const res = await executeMql(dummyConfig, {
        collection: "users",
        op: {
          operation: "countDocuments",
          payload: {
            filter: { active: true },
          },
        },
      });

      expect(res.operation).toBe("countDocuments");
      expect((res as any).count).toBe(88);
    });
  });

  describe("executeMql: 'estimatedDocumentCount' operation", () => {
    test("accepts empty or undefined payload", async () => {
      mockCollection.estimatedDocumentCount.mockResolvedValue(500);

      const res1 = await executeMql(dummyConfig, {
        collection: "users",
        op: {
          operation: "estimatedDocumentCount",
        },
      });
      expect((res1 as any).count).toBe(500);

      const res2 = await executeMql(dummyConfig, {
        collection: "users",
        op: {
          operation: "estimatedDocumentCount",
          payload: {},
        },
      });
      expect((res2 as any).count).toBe(500);
    });

    test("rejects non-empty filter or non-object payload with MONGO_VALIDATION_ERROR", async () => {
      for (const badPayload of [null, 123, "string", true, [1], { filter: {} }]) {
        const req: MongoMqlExecuteRequest = {
          collection: "users",
          op: {
            operation: "estimatedDocumentCount",
            payload: badPayload as any,
          },
        };

        await expect(executeMql(dummyConfig, req)).rejects.toMatchObject({
          code: "MONGO_VALIDATION_ERROR",
          message:
            "estimatedDocumentCount does not accept a filter; payload must be empty or undefined. Use countDocuments for filtered counts.",
        });
      }
    });

    test("passes signal and timeout to estimatedDocumentCount", async () => {
      mockCollection.estimatedDocumentCount.mockResolvedValueOnce(250);
      await executeMql(dummyConfig, {
        collection: "users",
        op: { operation: "estimatedDocumentCount" },
        options: { maxTimeMS: 5000 },
      });
      expect(mockCollection.estimatedDocumentCount).toHaveBeenCalledWith(
        expect.objectContaining({
          maxTimeMS: 5000,
          signal: expect.any(Object),
        }),
      );
    });
  });

  describe("executeMql: 'distinct' operation", () => {
    test("rejects non-object filter with MONGO_INVALID_FILTER", async () => {
      for (const badFilter of ["string", 123, true, [1, 2]]) {
        await expect(
          executeMql(dummyConfig, {
            collection: "users",
            op: {
              operation: "distinct",
              payload: { field: "category", filter: badFilter as any },
            },
          }),
        ).rejects.toMatchObject({
          code: "MONGO_INVALID_FILTER",
          message: "filter must be an object",
        });
      }
    });

    test("passes signal and timeout to distinct", async () => {
      mockCollection.distinct.mockResolvedValueOnce(["cat1", "cat2"]);
      await executeMql(dummyConfig, {
        collection: "users",
        op: {
          operation: "distinct",
          payload: { field: "category" },
        },
        options: { maxTimeMS: 4000 },
      });
      expect(mockCollection.distinct).toHaveBeenCalledWith(
        "category",
        {},
        expect.objectContaining({
          maxTimeMS: 4000,
          signal: expect.any(Object),
        }),
      );
    });

    test("rejects missing or empty field", async () => {
      await expect(
        executeMql(dummyConfig, {
          collection: "users",
          op: {
            operation: "distinct",
            payload: { field: "" },
          },
        }),
      ).rejects.toMatchObject({
        code: "MONGO_VALIDATION_ERROR",
        message: "field must be a non-empty string",
      });

      await expect(
        executeMql(dummyConfig, {
          collection: "users",
          op: {
            operation: "distinct",
            payload: { field: "   " },
          },
        }),
      ).rejects.toMatchObject({
        code: "MONGO_VALIDATION_ERROR",
        message: "field must be a non-empty string",
      });
    });

    test("caps distinct results at MAX_DISTINCT_VALUES (10000)", async () => {
      const bigValues = Array.from({ length: 10050 }, (_, i) => `val_${i}`);
      mockCollection.distinct.mockResolvedValueOnce(bigValues);

      const res = await executeMql(dummyConfig, {
        collection: "users",
        op: {
          operation: "distinct",
          payload: { field: "category" },
        },
      });

      expect(res.operation).toBe("distinct");
      expect((res as any).values).toHaveLength(10000);
      expect((res as any).count).toBe(10000);
    });
  });

  describe("explainMql", () => {
    test("rejects mutating target (e.g. insertOne)", async () => {
      const req: MongoExplainRequest = {
        collection: "users",
        target: { operation: "insertOne" } as any,
      };

      await expect(explainMql(dummyConfig, req)).rejects.toMatchObject({
        code: "MONGO_FORBIDDEN_OPERATION",
        message: "Explain is only supported for 'find' and 'aggregate' operations",
      });
    });

    test("rejects unsafe aggregate target containing $out", async () => {
      const req: MongoExplainRequest = {
        collection: "users",
        target: {
          operation: "aggregate",
          pipeline: [{ $out: "dump" }],
        },
      };

      await expect(explainMql(dummyConfig, req)).rejects.toMatchObject({
        code: "MONGO_WRITE_STAGE_FORBIDDEN",
      });
    });

    test("rejects non-object filter for find target with MONGO_INVALID_FILTER", async () => {
      for (const badFilter of ["string", 123, true, [1, 2]]) {
        await expect(
          explainMql(dummyConfig, {
            collection: "users",
            target: {
              operation: "find",
              filter: badFilter as any,
            },
          }),
        ).rejects.toMatchObject({
          code: "MONGO_INVALID_FILTER",
          message: "filter must be an object",
        });
      }
    });

    test("rejects unsafe find target containing $where", async () => {
      const req: MongoExplainRequest = {
        collection: "users",
        target: {
          operation: "find",
          filter: { $where: "this.active" },
        },
      };

      await expect(explainMql(dummyConfig, req)).rejects.toMatchObject({
        code: "MONGO_FORBIDDEN_OPERATOR",
      });
    });

    test("rejects invalid verbosity", async () => {
      const req: MongoExplainRequest = {
        collection: "users",
        verbosity: "unsupported" as any,
        target: {
          operation: "find",
          filter: {},
        },
      };

      await expect(explainMql(dummyConfig, req)).rejects.toMatchObject({
        code: "MONGO_VALIDATION_ERROR",
        message: "Invalid explain verbosity 'unsupported'",
      });
    });

    test("explains find and aggregate across supported verbosities", async () => {
      for (const verbosity of ["queryPlanner", "executionStats", "allPlansExecution"] as const) {
        const res = await explainMql(dummyConfig, {
          collection: "users",
          verbosity,
          target: {
            operation: "find",
            filter: { status: "active" },
          },
        });

        expect(res.operation).toBe("find");
        expect(res.collection).toBe("users");
        expect(res.queryPlanner).toBeDefined();
        expect(res.rawExplain).toBeDefined();
      }
    });
  });

  describe("QueryExecutor MQL routing", () => {
    const executor = new QueryExecutor();

    test("rejects executeMql on Postgres with MONGO_UNSUPPORTED_OPERATION", async () => {
      await expect(
        executor.executeMql(dummyConfig, DBType.POSTGRES, {
          collection: "users",
          op: { operation: "find", payload: { filter: {} } },
        }),
      ).rejects.toMatchObject({
        code: "MONGO_UNSUPPORTED_OPERATION",
      });
    });

    test("rejects explainMql on MySQL with MONGO_UNSUPPORTED_OPERATION", async () => {
      await expect(
        executor.explainMql(dummyConfig, DBType.MYSQL, {
          collection: "users",
          target: { operation: "find", filter: {} },
        }),
      ).rejects.toMatchObject({
        code: "MONGO_UNSUPPORTED_OPERATION",
      });
    });

    test("routes executeMql and explainMql on DBType.MONGODB to mongoConnector", async () => {
      const execSpy = jest.spyOn(mongoConnector, "executeMql").mockResolvedValueOnce({
        operation: "find",
        collection: "users",
        documents: [],
        totalReturned: 0,
        executionTimeMs: 1,
      });

      const explainSpy = jest.spyOn(mongoConnector, "explainMql").mockResolvedValueOnce({
        collection: "users",
        operation: "find",
        queryPlanner: {
          plannerVersion: 1,
          namespace: "testdb.users",
          indexFilterSet: false,
          winningPlan: {},
        },
        rawExplain: {},
        executionTimeMs: 1,
      });

      await executor.executeMql(dummyConfig, DBType.MONGODB, {
        collection: "users",
        op: { operation: "find", payload: { filter: {} } },
      });
      expect(execSpy).toHaveBeenCalled();

      await executor.explainMql(dummyConfig, DBType.MONGODB, {
        collection: "users",
        target: { operation: "find", filter: {} },
      });
      expect(explainSpy).toHaveBeenCalled();
    });
  });
});
