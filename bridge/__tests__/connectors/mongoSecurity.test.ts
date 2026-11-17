import { describe, expect, test, jest } from "@jest/globals";
import {
  assertSafeExpressions,
  assertMongoNotReadOnly,
  mongoConnector,
  MongoApiError,
} from "../../src/connectors/mongo";
import type { MongoConfig } from "../../src/types/mongo";
import { MongoBulkEngine, assertNotReadOnly } from "../../src/services/mongoBulkEngine";
import { MigrationHandlers } from "../../src/handlers/migrationHandlers";
import { DBType } from "../../src/types";

describe("Mongo Security Test Suite", () => {
  describe("assertSafeExpressions", () => {
    test("throws on $where at top level", () => {
      expect(() => {
        assertSafeExpressions({ $where: "this.a > 3" });
      }).toThrow(
        expect.objectContaining({
          code: "MONGO_FORBIDDEN_OPERATOR",
          message: expect.stringContaining("Operator '$where' is forbidden"),
        }),
      );
    });

    test("throws on $where nested in objects", () => {
      expect(() => {
        assertSafeExpressions({
          query: {
            nested: {
              $where: "function() { return true; }",
            },
          },
        });
      }).toThrow(
        expect.objectContaining({
          code: "MONGO_FORBIDDEN_OPERATOR",
          message: expect.stringContaining("Operator '$where' is forbidden"),
        }),
      );
    });

    test("throws on $where nested in arrays", () => {
      expect(() => {
        assertSafeExpressions({
          items: [{ field: "valid" }, { $where: "sleep(5000)" }],
        });
      }).toThrow(
        expect.objectContaining({
          code: "MONGO_FORBIDDEN_OPERATOR",
          message: expect.stringContaining("Operator '$where' is forbidden"),
        }),
      );
    });

    test("throws on $function at top level and nested", () => {
      expect(() => {
        assertSafeExpressions({
          $function: {
            body: "function() { return 1; }",
            args: [],
            lang: "js",
          },
        });
      }).toThrow(
        expect.objectContaining({
          code: "MONGO_FORBIDDEN_OPERATOR",
          message: expect.stringContaining("Operator '$function' is forbidden"),
        }),
      );

      expect(() => {
        assertSafeExpressions({
          $match: {
            val: {
              $function: {
                body: "function(v) { return v > 10; }",
                args: ["$val"],
                lang: "js",
              },
            },
          },
        });
      }).toThrow(
        expect.objectContaining({
          code: "MONGO_FORBIDDEN_OPERATOR",
          message: expect.stringContaining("Operator '$function' is forbidden"),
        }),
      );
    });

    test("throws on $accumulator at top level and nested", () => {
      expect(() => {
        assertSafeExpressions({
          $accumulator: {
            init: "function() { return 0; }",
            accumulate: "function(state, val) { return state + val; }",
            accumulateArgs: ["$val"],
            merge: "function(s1, s2) { return s1 + s2; }",
            lang: "js",
          },
        });
      }).toThrow(
        expect.objectContaining({
          code: "MONGO_FORBIDDEN_OPERATOR",
          message: expect.stringContaining("Operator '$accumulator' is forbidden"),
        }),
      );

      expect(() => {
        assertSafeExpressions({
          $group: {
            _id: "$dept",
            total: {
              $accumulator: {
                init: "function() { return 0; }",
                accumulate: "function(s, v) { return s + v; }",
                accumulateArgs: ["$salary"],
                merge: "function(s1, s2) { return s1 + s2; }",
                lang: "js",
              },
            },
          },
        });
      }).toThrow(
        expect.objectContaining({
          code: "MONGO_FORBIDDEN_OPERATOR",
          message: expect.stringContaining("Operator '$accumulator' is forbidden"),
        }),
      );
    });

    test("permits standard operators and normal fields", () => {
      expect(() => {
        assertSafeExpressions({
          $set: { status: "active", count: 10 },
          $inc: { score: 5 },
          $match: { age: { $gte: 18, $lte: 65 } },
          $group: { _id: "$dept", total: { $sum: "$salary" } },
        });
      }).not.toThrow();

      expect(() => {
        assertSafeExpressions({
          name: "Alice",
          email: "alice@example.com",
          profile: {
            bio: "Engineer",
            tags: ["typescript", "mongodb"],
          },
          scores: [95, 87, 92],
          isActive: true,
          count: null,
        });
      }).not.toThrow();
    });

    test("handles deep nesting (>20 levels without stack overflow)", () => {
      let nested: any = { leaf: "value" };
      for (let i = 0; i < 30; i++) {
        nested = { child: nested };
      }

      // Must terminate gracefully with MONGO_LIMIT_EXCEEDED instead of RangeError (Call stack exceeded)
      expect(() => {
        assertSafeExpressions(nested);
      }).toThrow(
        expect.objectContaining({
          code: "MONGO_LIMIT_EXCEEDED",
          message: expect.stringContaining("Expression nesting exceeds maximum depth"),
        }),
      );

      // Verify with nested arrays
      let nestedArr: any = ["leaf"];
      for (let i = 0; i < 30; i++) {
        nestedArr = [nestedArr];
      }

      expect(() => {
        assertSafeExpressions(nestedArr);
      }).toThrow(
        expect.objectContaining({
          code: "MONGO_LIMIT_EXCEEDED",
        }),
      );
    });
  });

  describe("assertMongoNotReadOnly", () => {
    test("throws when conn.readonly: true", () => {
      const conn: MongoConfig = { uri: "mongodb://localhost:27017/test", readonly: true };
      expect(() => {
        assertMongoNotReadOnly(conn, "insertDocument");
      }).toThrow("Database is configured as read-only. 'insertDocument' is prohibited.");

      try {
        assertMongoNotReadOnly(conn, "testOp");
      } catch (err: any) {
        expect(err).toBeInstanceOf(MongoApiError);
        expect(err.code).toBe("MONGO_READ_ONLY");
      }
    });

    test("throws when (conn as any).readOnly: true", () => {
      const conn = { uri: "mongodb://localhost:27017/test", readOnly: true } as any;
      expect(() => {
        assertMongoNotReadOnly(conn, "dropIndex");
      }).toThrow("Database is configured as read-only. 'dropIndex' is prohibited.");
    });

    test("permits when conn.readonly is false or undefined", () => {
      expect(() => {
        assertMongoNotReadOnly(
          { uri: "mongodb://localhost:27017/test", readonly: false },
          "insertDocument",
        );
      }).not.toThrow();

      expect(() => {
        assertMongoNotReadOnly({ uri: "mongodb://localhost:27017/test" }, "insertDocument");
      }).not.toThrow();
    });

    describe("rejects through connector mutating operations", () => {
      const readOnlyConn: MongoConfig = {
        uri: "mongodb://localhost:27017/test",
        database: "test",
        readonly: true,
      };

      test("insertDocument rejects", async () => {
        await expect(
          mongoConnector.insertDocument(readOnlyConn, {
            collection: "users",
            document: { name: "test" },
          }),
        ).rejects.toThrow("Database is configured as read-only. 'insertDocument' is prohibited.");
      });

      test("updateDocument rejects", async () => {
        await expect(
          mongoConnector.updateDocument(readOnlyConn, {
            collection: "users",
            filter: { name: "test" },
            update: { $set: { age: 30 } },
          }),
        ).rejects.toThrow("Database is configured as read-only. 'updateDocument' is prohibited.");
      });

      test("replaceDocument rejects", async () => {
        await expect(
          mongoConnector.replaceDocument(readOnlyConn, {
            collection: "users",
            filter: { name: "test" },
            replacement: { name: "test2", age: 31 },
          }),
        ).rejects.toThrow("Database is configured as read-only. 'replaceDocument' is prohibited.");
      });

      test("deleteDocument rejects", async () => {
        await expect(
          mongoConnector.deleteDocument(readOnlyConn, {
            collection: "users",
            filter: { name: "test" },
          }),
        ).rejects.toThrow("Database is configured as read-only. 'deleteDocument' is prohibited.");
      });

      test("createCollection rejects", async () => {
        await expect(
          mongoConnector.createCollection(readOnlyConn, {
            collection: "new_users",
          }),
        ).rejects.toThrow("Database is configured as read-only. 'createCollection' is prohibited.");
      });

      test("dropCollection rejects", async () => {
        await expect(
          mongoConnector.dropCollection(readOnlyConn, {
            collection: "users",
          }),
        ).rejects.toThrow("Database is configured as read-only. 'dropCollection' is prohibited.");
      });

      test("createIndexes rejects", async () => {
        await expect(
          mongoConnector.createIndexes(readOnlyConn, {
            collection: "users",
            key: { email: 1 },
          }),
        ).rejects.toThrow("Database is configured as read-only. 'createIndexes' is prohibited.");
      });

      test("dropIndex rejects", async () => {
        await expect(
          mongoConnector.dropIndex(readOnlyConn, {
            collection: "users",
            indexName: "idx_email",
          }),
        ).rejects.toThrow("Database is configured as read-only. 'dropIndex' is prohibited.");
      });

      test("hideIndex rejects", async () => {
        await expect(
          mongoConnector.hideIndex(readOnlyConn, {
            collection: "users",
            indexName: "idx_email",
            hidden: true,
          }),
        ).rejects.toThrow("Database is configured as read-only. 'hideIndex' is prohibited.");
      });
    });
  });

  describe("Bulk engine mutations read-only rejection", () => {
    test("assertNotReadOnly directly throws MONGO_READ_ONLY", () => {
      expect(() => {
        assertNotReadOnly({ readonly: true }, {});
      }).toThrow("Database is in read-only mode");

      expect(() => {
        assertNotReadOnly({}, { readonly: true });
      }).toThrow("Database is in read-only mode");

      expect(() => {
        assertNotReadOnly({ readOnly: true }, {});
      }).toThrow("Database is in read-only mode");

      expect(() => {
        assertNotReadOnly({}, { readOnly: true });
      }).toThrow("Database is in read-only mode");

      expect(() => {
        assertNotReadOnly({ readonly: false }, { readonly: false });
      }).not.toThrow();
    });

    test("bulkInsert rejects when conn.readonly: true", async () => {
      const mockDbService = {
        getDatabaseConnection: jest.fn<any>().mockResolvedValue({
          dbType: DBType.MONGODB,
          db: { id: "test_db", readonly: false },
          conn: { uri: "mongodb://localhost:27017/test", readonly: true },
        }),
      } as any;
      const engine = new MongoBulkEngine(mockDbService);

      await expect(
        engine.bulkInsert({
          dbId: "test_db",
          collection: "items",
          documents: [{ x: 1 }],
        }),
      ).rejects.toMatchObject({
        code: "MONGO_READ_ONLY",
        message: "Database is in read-only mode",
      });
    });

    test("bulkUpdate rejects when conn.readonly: true", async () => {
      const mockDbService = {
        getDatabaseConnection: jest.fn<any>().mockResolvedValue({
          dbType: DBType.MONGODB,
          db: { id: "test_db", readonly: false },
          conn: { uri: "mongodb://localhost:27017/test", readonly: true },
        }),
      } as any;
      const engine = new MongoBulkEngine(mockDbService);

      await expect(
        engine.bulkUpdate({
          dbId: "test_db",
          collection: "items",
          filter: { x: 1 },
          update: { $set: { y: 2 } },
        }),
      ).rejects.toMatchObject({
        code: "MONGO_READ_ONLY",
        message: "Database is in read-only mode",
      });
    });

    test("bulkDelete rejects when conn.readonly: true", async () => {
      const mockDbService = {
        getDatabaseConnection: jest.fn<any>().mockResolvedValue({
          dbType: DBType.MONGODB,
          db: { id: "test_db", readonly: false },
          conn: { uri: "mongodb://localhost:27017/test", readonly: true },
        }),
      } as any;
      const engine = new MongoBulkEngine(mockDbService);

      await expect(
        engine.bulkDelete({
          dbId: "test_db",
          collection: "items",
          filter: { x: 1 },
        }),
      ).rejects.toMatchObject({
        code: "MONGO_READ_ONLY",
        message: "Database is in read-only mode",
      });
    });

    test("importChunk rejects when conn.readonly: true", async () => {
      const mockDbService = {
        getDatabaseConnection: jest.fn<any>().mockResolvedValue({
          dbType: DBType.MONGODB,
          db: { id: "test_db", readonly: false },
          conn: { uri: "mongodb://localhost:27017/test", readonly: true },
        }),
      } as any;
      const engine = new MongoBulkEngine(mockDbService);

      // Create an active import operation in OpManager
      const state = engine.opManager.createOperation("import", "test_db", "items", "json");

      await expect(
        engine.importChunk({
          operationId: state.operation.operationId,
          chunkIndex: 0,
          isLastChunk: true,
          payload: JSON.stringify([{ a: 1 }]),
        }),
      ).rejects.toMatchObject({
        code: "MONGO_READ_ONLY",
        message: "Database is in read-only mode",
      });
    });
  });

  describe("Migration apply/rollback read-only rejection", () => {
    test("applyMigration rejects when conn.readonly: true", async () => {
      const mockRpc = { sendResponse: jest.fn(), sendError: jest.fn() };
      const mockLogger = { info: jest.fn(), error: jest.fn(), warn: jest.fn() } as any;
      const mockDbService = {
        getDatabaseConnection: jest.fn<any>().mockResolvedValue({
          dbType: DBType.MONGODB,
          db: { id: "test_db", readonly: false },
          conn: { uri: "mongodb://localhost:27017/test", readonly: true },
        }),
      } as any;

      const handlers = new MigrationHandlers(mockRpc as any, mockLogger, mockDbService, {} as any);

      await handlers.handleApplyMigration({ dbId: "test_db", version: 1 }, 101);

      expect(mockRpc.sendError).toHaveBeenCalledWith(101, {
        code: "MONGO_READ_ONLY",
        message: "Database is in read-only mode",
      });
      expect(mockRpc.sendResponse).not.toHaveBeenCalled();
    });

    test("applyMigration rejects when db.readonly: true", async () => {
      const mockRpc = { sendResponse: jest.fn(), sendError: jest.fn() };
      const mockLogger = { info: jest.fn(), error: jest.fn(), warn: jest.fn() } as any;
      const mockDbService = {
        getDatabaseConnection: jest.fn<any>().mockResolvedValue({
          dbType: DBType.MONGODB,
          db: { id: "test_db", readonly: true },
          conn: { uri: "mongodb://localhost:27017/test", readonly: false },
        }),
      } as any;

      const handlers = new MigrationHandlers(mockRpc as any, mockLogger, mockDbService, {} as any);

      await handlers.handleApplyMigration({ dbId: "test_db", version: 1 }, 102);

      expect(mockRpc.sendError).toHaveBeenCalledWith(102, {
        code: "MONGO_READ_ONLY",
        message: "Database is in read-only mode",
      });
    });

    test("rollbackMigration rejects when conn.readonly: true", async () => {
      const mockRpc = { sendResponse: jest.fn(), sendError: jest.fn() };
      const mockLogger = { info: jest.fn(), error: jest.fn(), warn: jest.fn() } as any;
      const mockDbService = {
        getDatabaseConnection: jest.fn<any>().mockResolvedValue({
          dbType: DBType.MONGODB,
          db: { id: "test_db", readonly: false },
          conn: { uri: "mongodb://localhost:27017/test", readonly: true },
        }),
      } as any;

      const handlers = new MigrationHandlers(mockRpc as any, mockLogger, mockDbService, {} as any);

      await handlers.handleRollbackMigration({ dbId: "test_db", version: 1 }, 201);

      expect(mockRpc.sendError).toHaveBeenCalledWith(201, {
        code: "MONGO_READ_ONLY",
        message: "Database is in read-only mode",
      });
      expect(mockRpc.sendResponse).not.toHaveBeenCalled();
    });

    test("rollbackMigration rejects when db.readonly: true", async () => {
      const mockRpc = { sendResponse: jest.fn(), sendError: jest.fn() };
      const mockLogger = { info: jest.fn(), error: jest.fn(), warn: jest.fn() } as any;
      const mockDbService = {
        getDatabaseConnection: jest.fn<any>().mockResolvedValue({
          dbType: DBType.MONGODB,
          db: { id: "test_db", readonly: true },
          conn: { uri: "mongodb://localhost:27017/test", readonly: false },
        }),
      } as any;

      const handlers = new MigrationHandlers(mockRpc as any, mockLogger, mockDbService, {} as any);

      await handlers.handleRollbackMigration({ dbId: "test_db", version: 1 }, 202);

      expect(mockRpc.sendError).toHaveBeenCalledWith(202, {
        code: "MONGO_READ_ONLY",
        message: "Database is in read-only mode",
      });
    });
  });
});
