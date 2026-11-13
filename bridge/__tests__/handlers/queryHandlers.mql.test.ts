import { describe, expect, test, beforeEach, jest } from "@jest/globals";
import { QueryHandlers } from "../../src/handlers/queryHandlers";
import { MongoApiError } from "../../src/connectors/mongo";
import { DBType } from "../../src/types";

describe("QueryHandlers MQL Unit Tests (bridge/src/handlers/queryHandlers.ts)", () => {
  let mockRpc: any;
  let mockLogger: any;
  let mockSessions: any;
  let mockDbService: any;
  let mockQueryExecutor: any;
  let handlers: QueryHandlers;

  beforeEach(() => {
    mockRpc = {
      sendResponse: jest.fn(),
      sendError: jest.fn(),
      sendNotification: jest.fn(),
    };
    mockLogger = {
      error: jest.fn(),
      warn: jest.fn(),
      info: jest.fn(),
      debug: jest.fn(),
    };
    mockSessions = {
      registerCancel: jest.fn(),
    };
    mockDbService = {
      getDatabaseConnection: jest.fn().mockImplementation(() =>
        Promise.resolve({
          conn: { uri: "mongodb://localhost:27017/testdb", database: "testdb" },
          dbType: DBType.MONGODB,
        }),
      ),
    };
    mockQueryExecutor = {
      executeMql: jest.fn(),
      explainMql: jest.fn(),
    };

    handlers = new QueryHandlers(
      mockRpc,
      mockLogger,
      mockSessions,
      mockDbService,
      mockQueryExecutor,
    );
  });

  describe("handleExecuteMql", () => {
    test("rejects missing dbId with MONGO_VALIDATION_ERROR", async () => {
      await handlers.handleExecuteMql(
        { collection: "users", op: { operation: "find", payload: { filter: {} } } },
        1,
      );

      expect(mockRpc.sendError).toHaveBeenCalledWith(1, {
        code: "MONGO_VALIDATION_ERROR",
        message: "Missing dbId, collection, or op",
      });
      expect(mockQueryExecutor.executeMql).not.toHaveBeenCalled();
    });

    test("rejects missing collection with MONGO_VALIDATION_ERROR", async () => {
      await handlers.handleExecuteMql(
        { dbId: "conn-1", op: { operation: "find", payload: { filter: {} } } },
        2,
      );

      expect(mockRpc.sendError).toHaveBeenCalledWith(2, {
        code: "MONGO_VALIDATION_ERROR",
        message: "Missing dbId, collection, or op",
      });
      expect(mockQueryExecutor.executeMql).not.toHaveBeenCalled();
    });

    test("rejects missing op with MONGO_VALIDATION_ERROR", async () => {
      await handlers.handleExecuteMql({ dbId: "conn-1", collection: "users" }, 3);

      expect(mockRpc.sendError).toHaveBeenCalledWith(3, {
        code: "MONGO_VALIDATION_ERROR",
        message: "Missing dbId, collection, or op",
      });
      expect(mockQueryExecutor.executeMql).not.toHaveBeenCalled();
    });

    test("handles database connection lookup failure via sendMongoError", async () => {
      mockDbService.getDatabaseConnection.mockRejectedValueOnce(new Error("Connection not found"));

      await handlers.handleExecuteMql(
        {
          dbId: "invalid-id",
          collection: "users",
          op: { operation: "find", payload: { filter: {} } },
        },
        4,
      );

      expect(mockRpc.sendError).toHaveBeenCalledWith(
        4,
        expect.objectContaining({
          code: "MONGO_CONNECTION_ERROR",
        }),
      );
      expect(mockRpc.sendResponse).not.toHaveBeenCalled();
    });

    test("successfully dispatches executeMql and sends response", async () => {
      const mockResult = {
        operation: "find",
        collection: "users",
        documents: [{ _id: "1", name: "Alice" }],
        totalReturned: 1,
        executionTimeMs: 5,
      };
      mockQueryExecutor.executeMql.mockResolvedValueOnce(mockResult);

      const params = {
        dbId: "mongo-1",
        collection: "users",
        op: { operation: "find", payload: { filter: { name: "Alice" } } },
        options: { maxTimeMS: 5000 },
      };

      await handlers.handleExecuteMql(params, 5);

      expect(mockDbService.getDatabaseConnection).toHaveBeenCalledWith("mongo-1");
      expect(mockQueryExecutor.executeMql).toHaveBeenCalledWith(
        expect.objectContaining({ database: "testdb" }),
        DBType.MONGODB,
        {
          collection: "users",
          op: params.op,
          options: params.options,
        },
        expect.any(Object),
      );
      expect(mockRpc.sendResponse).toHaveBeenCalledWith(5, {
        ok: true,
        data: mockResult,
      });
    });

    test("forwards MongoApiError from queryExecutor to rpc.sendError", async () => {
      mockQueryExecutor.executeMql.mockRejectedValueOnce(
        new MongoApiError(
          "MONGO_FORBIDDEN_OPERATION",
          "Operation 'drop' is forbidden in read-only query workspace. Use RelWave document mutation actions.",
        ),
      );

      await handlers.handleExecuteMql(
        {
          dbId: "mongo-1",
          collection: "users",
          op: { operation: "drop" as any },
        },
        6,
      );

      expect(mockRpc.sendError).toHaveBeenCalledWith(6, {
        code: "MONGO_FORBIDDEN_OPERATION",
        message:
          "Operation 'drop' is forbidden in read-only query workspace. Use RelWave document mutation actions.",
      });
      expect(mockRpc.sendResponse).not.toHaveBeenCalled();
    });
  });

  describe("handleExplainMql", () => {
    test("rejects missing dbId with MONGO_VALIDATION_ERROR", async () => {
      await handlers.handleExplainMql(
        { collection: "users", target: { operation: "find", filter: {} } },
        11,
      );

      expect(mockRpc.sendError).toHaveBeenCalledWith(11, {
        code: "MONGO_VALIDATION_ERROR",
        message: "Missing dbId, collection, or target",
      });
      expect(mockQueryExecutor.explainMql).not.toHaveBeenCalled();
    });

    test("rejects missing collection with MONGO_VALIDATION_ERROR", async () => {
      await handlers.handleExplainMql(
        { dbId: "conn-1", target: { operation: "find", filter: {} } },
        12,
      );

      expect(mockRpc.sendError).toHaveBeenCalledWith(12, {
        code: "MONGO_VALIDATION_ERROR",
        message: "Missing dbId, collection, or target",
      });
      expect(mockQueryExecutor.explainMql).not.toHaveBeenCalled();
    });

    test("rejects missing target with MONGO_VALIDATION_ERROR", async () => {
      await handlers.handleExplainMql({ dbId: "conn-1", collection: "users" }, 13);

      expect(mockRpc.sendError).toHaveBeenCalledWith(13, {
        code: "MONGO_VALIDATION_ERROR",
        message: "Missing dbId, collection, or target",
      });
      expect(mockQueryExecutor.explainMql).not.toHaveBeenCalled();
    });

    test("handles database lookup failure via sendMongoError", async () => {
      mockDbService.getDatabaseConnection.mockRejectedValueOnce(new Error("Lookup failed"));

      await handlers.handleExplainMql(
        {
          dbId: "invalid-id",
          collection: "users",
          target: { operation: "find", filter: {} },
        },
        14,
      );

      expect(mockRpc.sendError).toHaveBeenCalledWith(
        14,
        expect.objectContaining({
          code: "MONGO_CONNECTION_ERROR",
        }),
      );
      expect(mockRpc.sendResponse).not.toHaveBeenCalled();
    });

    test("successfully dispatches explainMql and sends response", async () => {
      const mockExplainResult = {
        collection: "users",
        operation: "find",
        queryPlanner: {
          plannerVersion: 1,
          namespace: "testdb.users",
          indexFilterSet: false,
          winningPlan: { stage: "COLLSCAN" },
        },
        rawExplain: {},
        executionTimeMs: 3,
      };
      mockQueryExecutor.explainMql.mockResolvedValueOnce(mockExplainResult);

      const params = {
        dbId: "mongo-1",
        collection: "users",
        target: { operation: "find", filter: { status: "active" } } as const,
        verbosity: "queryPlanner" as const,
        options: { maxTimeMS: 5000 },
      };

      await handlers.handleExplainMql(params, 15);

      expect(mockDbService.getDatabaseConnection).toHaveBeenCalledWith("mongo-1");
      expect(mockQueryExecutor.explainMql).toHaveBeenCalledWith(
        expect.objectContaining({ database: "testdb" }),
        DBType.MONGODB,
        {
          collection: "users",
          target: params.target,
          verbosity: params.verbosity,
          options: params.options,
        },
        expect.any(Object),
      );
      expect(mockRpc.sendResponse).toHaveBeenCalledWith(15, {
        ok: true,
        data: mockExplainResult,
      });
    });

    test("forwards MongoApiError from explainMql to rpc.sendError", async () => {
      mockQueryExecutor.explainMql.mockRejectedValueOnce(
        new MongoApiError(
          "MONGO_WRITE_STAGE_FORBIDDEN",
          "Stage '$out' is forbidden in read-only aggregation queries",
        ),
      );

      await handlers.handleExplainMql(
        {
          dbId: "mongo-1",
          collection: "users",
          target: { operation: "aggregate", pipeline: [{ $out: "dump" }] },
        },
        16,
      );

      expect(mockRpc.sendError).toHaveBeenCalledWith(16, {
        code: "MONGO_WRITE_STAGE_FORBIDDEN",
        message: "Stage '$out' is forbidden in read-only aggregation queries",
      });
      expect(mockRpc.sendResponse).not.toHaveBeenCalled();
    });
  });
});
