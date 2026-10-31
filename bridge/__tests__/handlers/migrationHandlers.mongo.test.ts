import { describe, expect, test, beforeEach, jest } from "@jest/globals";
import { MigrationHandlers } from "../../src/handlers/migrationHandlers";
import { MongoApiError } from "../../src/connectors/mongo";
import { DBType } from "../../src/types";
import { mongoMigrationEngine } from "../../src/services/mongoMigrationEngine";

describe("MigrationHandlers MongoDB Unit Tests (bridge/src/handlers/migrationHandlers.ts)", () => {
  let mockRpc: any;
  let mockLogger: any;
  let mockDbService: any;
  let mockQueryExecutor: any;
  let handlers: MigrationHandlers;

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
    mockDbService = {
      getDatabaseConnection: jest.fn().mockImplementation(() =>
        Promise.resolve({
          db: { id: "mongo-db-1" },
          conn: { uri: "mongodb://localhost:27017/testdb", database: "testdb" },
          dbType: DBType.MONGODB,
        }),
      ),
    };
    mockQueryExecutor = {
      listSchemas: jest.fn(),
    };

    handlers = new MigrationHandlers(
      mockRpc,
      mockLogger,
      mockDbService,
      mockQueryExecutor,
    );
  });

  describe("handleValidateMigration", () => {
    test("rejects missing manifest with BAD_REQUEST", async () => {
      await handlers.handleValidateMigration({}, 1);
      expect(mockRpc.sendError).toHaveBeenCalledWith(1, {
        code: "BAD_REQUEST",
        message: "Missing manifest",
      });
    });

    test("validates manifest for MongoDB database", async () => {
      const manifest: any = {
        version: "1.0",
        id: "20261031120000",
        name: "test_migration",
        up: [{ type: "createCollection", collection: "test" }],
      };

      await handlers.handleValidateMigration({ dbId: "mongo-db-1", manifest }, 2);
      expect(mockRpc.sendResponse).toHaveBeenCalledWith(
        2,
        expect.objectContaining({
          ok: true,
          data: expect.objectContaining({ valid: true }),
        }),
      );
    });
  });

  describe("handleListMigrations", () => {
    test("rejects missing dbId with BAD_REQUEST", async () => {
      await handlers.handleListMigrations({}, 1);
      expect(mockRpc.sendError).toHaveBeenCalledWith(1, {
        code: "BAD_REQUEST",
        message: "Missing dbId",
      });
    });

    test("delegates to mongoMigrationEngine.listMigrations for mongodb dbType", async () => {
      const spy = jest
        .spyOn(mongoMigrationEngine, "listMigrations")
        .mockImplementation(async () => ({
          appliedMigrations: [],
          pendingMigrations: [],
          isLocked: false,
        }));

      await handlers.handleListMigrations({ dbId: "mongo-db-1", projectRoot: "/fake/root" }, 2);

      expect(spy).toHaveBeenCalled();
      expect(mockRpc.sendResponse).toHaveBeenCalledWith(
        2,
        expect.objectContaining({
          ok: true,
          data: expect.objectContaining({ isLocked: false }),
        }),
      );
      spy.mockRestore();
    });
  });

  describe("handleGetMigrationStatus", () => {
    test("delegates to mongoMigrationEngine.getMigrationStatus", async () => {
      const spy = jest
        .spyOn(mongoMigrationEngine, "getMigrationStatus")
        .mockImplementation(async () => ({
          lockStatus: { isLocked: false, isExpired: false },
          pendingCount: 0,
        }));

      await handlers.handleGetMigrationStatus({ dbId: "mongo-db-1", migrationId: "20261031120000" }, 3);

      expect(spy).toHaveBeenCalled();
      expect(mockRpc.sendResponse).toHaveBeenCalledWith(
        3,
        expect.objectContaining({
          ok: true,
          data: expect.objectContaining({
            lockStatus: { isLocked: false, isExpired: false },
          }),
        }),
      );
      spy.mockRestore();
    });
  });

  describe("handleApplyMigration", () => {
    test("rejects read-only MongoDB database", async () => {
      mockDbService.getDatabaseConnection.mockImplementationOnce(() =>
        Promise.resolve({
          db: { id: "mongo-db-1", readOnly: true },
          conn: { uri: "mongodb://localhost:27017/testdb", database: "testdb" },
          dbType: DBType.MONGODB,
        }),
      );

      await handlers.handleApplyMigration({ dbId: "mongo-db-1", version: "20261031120000" }, 4);
      expect(mockRpc.sendError).toHaveBeenCalledWith(4, {
        code: "MONGO_READ_ONLY",
        message: "Database is in read-only mode",
      });
    });

    test("delegates apply to mongoMigrationEngine.applyMigration", async () => {
      const spy = jest
        .spyOn(mongoMigrationEngine, "applyMigration")
        .mockImplementation(async () => ({
          success: true,
          appliedCount: 1,
          results: [],
        }));

      await handlers.handleApplyMigration(
        { dbId: "mongo-db-1", version: "20261031120000", projectRoot: "/fake/root" },
        5,
      );

      expect(spy).toHaveBeenCalled();
      expect(mockRpc.sendResponse).toHaveBeenCalledWith(
        5,
        expect.objectContaining({
          ok: true,
          data: expect.objectContaining({ success: true, appliedCount: 1 }),
        }),
      );
      spy.mockRestore();
    });
  });

  describe("handleRollbackMigration", () => {
    test("rejects read-only MongoDB database", async () => {
      mockDbService.getDatabaseConnection.mockImplementationOnce(() =>
        Promise.resolve({
          db: { id: "mongo-db-1", readOnly: true },
          conn: { uri: "mongodb://localhost:27017/testdb", database: "testdb" },
          dbType: DBType.MONGODB,
        }),
      );

      await handlers.handleRollbackMigration({ dbId: "mongo-db-1", version: "20261031120000" }, 6);
      expect(mockRpc.sendError).toHaveBeenCalledWith(6, {
        code: "MONGO_READ_ONLY",
        message: "Database is in read-only mode",
      });
    });

    test("delegates rollback to mongoMigrationEngine.rollbackMigration", async () => {
      const spy = jest
        .spyOn(mongoMigrationEngine, "rollbackMigration")
        .mockImplementation(async () => ({
          success: true,
          version: "20261031120000",
          status: "ROLLED_BACK",
          executionTimeMs: 10,
          stepsCompensated: 1,
        }));

      await handlers.handleRollbackMigration(
        { dbId: "mongo-db-1", version: "20261031120000", projectRoot: "/fake/root" },
        7,
      );

      expect(spy).toHaveBeenCalled();
      expect(mockRpc.sendResponse).toHaveBeenCalledWith(
        7,
        expect.objectContaining({
          ok: true,
          data: expect.objectContaining({ status: "ROLLED_BACK", stepsCompensated: 1 }),
        }),
      );
      spy.mockRestore();
    });
  });
});
