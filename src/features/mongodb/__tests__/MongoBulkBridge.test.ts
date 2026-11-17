import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { DatabaseBridge, databaseBridge } from "@/services/bridge/databaseBridge";
import { databaseService } from "@/services/bridge/database";
import {
  isAsyncBulkOperation,
  isSyncBulkMutation,
  type BulkHistoryEntry,
  type TrackedAsyncBulkOperation,
  type TrackedSyncBulkMutation,
  type MongoBulkDocument,
  type MongoBulkFilter,
  type MongoBulkImportStartRequest,
  type MongoBulkImportStartResult,
  type MongoBulkImportChunkRequest,
  type MongoBulkImportChunkResult,
  type MongoBulkExportStartRequest,
  type MongoBulkExportStartResult,
  type MongoBulkGetOperationStatusRequest,
  type MongoBulkOperationStatusResult,
  type MongoBulkCancelRequest,
  type MongoBulkCancelResult,
  type MongoBulkCleanupRequest,
  type MongoBulkCleanupResult,
  type MongoBulkInsertRequest,
  type MongoBulkInsertResult,
  type MongoBulkUpdateRequest,
  type MongoBulkUpdateResult,
  type MongoBulkDeleteRequest,
  type MongoBulkDeleteResult,
  type MongoBulkExportSaveToRequest,
  type MongoBulkExportSaveToResult,
} from "@/features/mongodb/types";

describe("MongoDB Bulk Operations — Bridge Service & Types (Stage 2)", () => {
  // =========================================================================
  // 1. DatabaseBridge RPC Method Dispatch Tests
  // =========================================================================
  describe("DatabaseBridge RPC Method Dispatches", () => {
    it("startMongoBulkImport dispatches mongo.bulk.importStart and unwraps data", async () => {
      let dispatchedMethod = "";
      let dispatchedParams: unknown = null;

      const expectedResult: MongoBulkImportStartResult = {
        operationId: "import-op-123",
        status: "pending",
        format: "json",
        collection: "orders",
      };

      const mockBridge = async (method: string, params?: unknown) => {
        dispatchedMethod = method;
        dispatchedParams = params;
        return { data: expectedResult };
      };

      const bridge = new DatabaseBridge(mockBridge);
      const request: MongoBulkImportStartRequest = {
        dbId: "test-db",
        collection: "orders",
        format: "json",
        options: { totalChunksExpected: 4 },
      };

      const result = await bridge.startMongoBulkImport(request);

      assert.strictEqual(dispatchedMethod, "mongo.bulk.importStart");
      assert.deepStrictEqual(dispatchedParams, request);
      assert.deepStrictEqual(result, expectedResult);
    });

    it("importMongoBulkChunk accepts payload as string and unwraps data", async () => {
      let dispatchedMethod = "";
      let dispatchedParams: unknown = null;

      const expectedResult: MongoBulkImportChunkResult = {
        operationId: "import-op-123",
        chunkIndex: 0,
        status: "in_progress",
        insertedCount: 500,
        failedCount: 0,
        isComplete: false,
        totalInserted: 500,
        totalFailed: 0,
      };

      const mockBridge = async (method: string, params?: unknown) => {
        dispatchedMethod = method;
        dispatchedParams = params;
        return { data: expectedResult };
      };

      const bridge = new DatabaseBridge(mockBridge);
      const request: MongoBulkImportChunkRequest = {
        operationId: "import-op-123",
        chunkIndex: 0,
        isLastChunk: false,
        payload: '[{"sku": "A1"}, {"sku": "A2"}]',
      };

      const result = await bridge.importMongoBulkChunk(request);

      assert.strictEqual(dispatchedMethod, "mongo.bulk.importChunk");
      assert.deepStrictEqual(dispatchedParams, request);
      assert.deepStrictEqual(result, expectedResult);
    });

    it("importMongoBulkChunk accepts payload as MongoBulkDocument[] with deeply nested structures", async () => {
      let dispatchedMethod = "";
      let dispatchedParams: unknown = null;

      const expectedResult: MongoBulkImportChunkResult = {
        operationId: "import-op-123",
        chunkIndex: 1,
        status: "completed",
        insertedCount: 2,
        failedCount: 0,
        isComplete: true,
        totalInserted: 502,
        totalFailed: 0,
      };

      const mockBridge = async (method: string, params?: unknown) => {
        dispatchedMethod = method;
        dispatchedParams = params;
        return { data: expectedResult };
      };

      const bridge = new DatabaseBridge(mockBridge);

      // Deeply nested documents exercising MongoBulkDocument and MongoBulkValue recursion
      const nestedDocs: MongoBulkDocument[] = [
        {
          _id: { $oid: "64b1f2e8f1a2b3c4d5e6f7a8" },
          sku: "GADGET-01",
          price: 299.99,
          active: true,
          tags: ["tech", "portable", "new"],
          metadata: {
            dimensions: { width: 10, height: 20, unit: "cm" },
            suppliers: [
              { name: "Supplier A", code: "SUP-A", rating: 4.8 },
              { name: "Supplier B", code: "SUP-B", rating: 4.5 },
            ],
            notes: null,
            legacyCode: undefined,
          },
        },
        {
          _id: { $oid: "64b1f2e8f1a2b3c4d5e6f7a9" },
          sku: "GADGET-02",
          variants: [
            { color: "red", stock: 15 },
            { color: "blue", stock: 0 },
          ],
        },
      ];

      const request: MongoBulkImportChunkRequest = {
        operationId: "import-op-123",
        chunkIndex: 1,
        isLastChunk: true,
        payload: nestedDocs,
      };

      const result = await bridge.importMongoBulkChunk(request);

      assert.strictEqual(dispatchedMethod, "mongo.bulk.importChunk");
      assert.deepStrictEqual(dispatchedParams, request);
      assert.deepStrictEqual(result, expectedResult);
      assert.strictEqual(
        Array.isArray((dispatchedParams as MongoBulkImportChunkRequest).payload),
        true,
      );
    });

    it("startMongoBulkExport dispatches mongo.bulk.exportStart with typed MongoBulkFilter and projection", async () => {
      let dispatchedMethod = "";
      let dispatchedParams: unknown = null;

      const expectedResult: MongoBulkExportStartResult = {
        operationId: "export-op-456",
        status: "pending",
        collection: "users",
        format: "ndjson",
      };

      const mockBridge = async (method: string, params?: unknown) => {
        dispatchedMethod = method;
        dispatchedParams = params;
        return { data: expectedResult };
      };

      const bridge = new DatabaseBridge(mockBridge);

      // Strongly-typed MongoBulkFilter using query operators
      const filter: MongoBulkFilter = {
        status: { $in: ["active", "verified"] },
        age: { $gte: 21 },
        "address.city": "San Francisco",
        roles: { $in: ["admin", "editor"] },
      };

      const projection: MongoBulkDocument = {
        password: 0,
        internalTokens: 0,
        "audit.secret": 0,
      };

      const request: MongoBulkExportStartRequest = {
        dbId: "test-db",
        collection: "users",
        format: "ndjson",
        filter,
        projection,
        sort: { createdAt: -1 },
        limit: 1000,
      };

      const result = await bridge.startMongoBulkExport(request);

      assert.strictEqual(dispatchedMethod, "mongo.bulk.exportStart");
      assert.deepStrictEqual(dispatchedParams, request);
      assert.deepStrictEqual(result, expectedResult);
    });

    it("getMongoBulkOperationStatus dispatches mongo.bulk.getOperationStatus and unwraps data", async () => {
      let dispatchedMethod = "";
      let dispatchedParams: unknown = null;

      const expectedResult: MongoBulkOperationStatusResult = {
        operationId: "op-789",
        type: "export",
        status: "in_progress",
        collection: "products",
        format: "csv",
        processedDocuments: 1500,
        successfulDocuments: 1500,
        failedDocuments: 0,
        fileSizeBytes: 45000,
        createdAt: "2026-11-03T10:00:00.000Z",
        updatedAt: "2026-11-03T10:01:00.000Z",
        expiresAt: "2026-11-03T11:00:00.000Z",
      };

      const mockBridge = async (method: string, params?: unknown) => {
        dispatchedMethod = method;
        dispatchedParams = params;
        return { data: expectedResult };
      };

      const bridge = new DatabaseBridge(mockBridge);
      const request: MongoBulkGetOperationStatusRequest = { operationId: "op-789" };

      const result = await bridge.getMongoBulkOperationStatus(request);

      assert.strictEqual(dispatchedMethod, "mongo.bulk.getOperationStatus");
      assert.deepStrictEqual(dispatchedParams, request);
      assert.deepStrictEqual(result, expectedResult);
    });

    it("cancelMongoBulkOperation dispatches mongo.bulk.cancelOperation and unwraps data", async () => {
      let dispatchedMethod = "";
      let dispatchedParams: unknown = null;

      const expectedResult: MongoBulkCancelResult = {
        operationId: "op-789",
        status: "cancelled",
        message: "Operation cancelled by user",
      };

      const mockBridge = async (method: string, params?: unknown) => {
        dispatchedMethod = method;
        dispatchedParams = params;
        return { data: expectedResult };
      };

      const bridge = new DatabaseBridge(mockBridge);
      const request: MongoBulkCancelRequest = { operationId: "op-789" };

      const result = await bridge.cancelMongoBulkOperation(request);

      assert.strictEqual(dispatchedMethod, "mongo.bulk.cancelOperation");
      assert.deepStrictEqual(dispatchedParams, request);
      assert.deepStrictEqual(result, expectedResult);
    });

    it("cleanupMongoBulkOperation dispatches mongo.bulk.cleanupOperation and unwraps data (including alreadyCleaned)", async () => {
      let dispatchedMethod = "";
      let dispatchedParams: unknown = null;

      const expectedResult: MongoBulkCleanupResult = {
        operationId: "op-789",
        success: true,
        alreadyCleaned: true,
      };

      const mockBridge = async (method: string, params?: unknown) => {
        dispatchedMethod = method;
        dispatchedParams = params;
        return { data: expectedResult };
      };

      const bridge = new DatabaseBridge(mockBridge);
      const request: MongoBulkCleanupRequest = { operationId: "op-789" };

      const result = await bridge.cleanupMongoBulkOperation(request);

      assert.strictEqual(dispatchedMethod, "mongo.bulk.cleanupOperation");
      assert.deepStrictEqual(dispatchedParams, request);
      assert.deepStrictEqual(result, expectedResult);
      assert.strictEqual(result.alreadyCleaned, true);
    });

    it("bulkInsertMongoDocuments dispatches mongo.bulk.insert with strongly-typed MongoBulkDocument[]", async () => {
      let dispatchedMethod = "";
      let dispatchedParams: unknown = null;

      const expectedResult: MongoBulkInsertResult = {
        collection: "items",
        insertedCount: 2,
        failedCount: 0,
      };

      const mockBridge = async (method: string, params?: unknown) => {
        dispatchedMethod = method;
        dispatchedParams = params;
        return { data: expectedResult };
      };

      const bridge = new DatabaseBridge(mockBridge);

      // Strongly typed MongoBulkDocument items with nested objects and arrays
      const documents: MongoBulkDocument[] = [
        {
          _id: { $oid: "507f1f77bcf86cd799439011" },
          title: "First Post",
          views: 120,
          published: true,
          tags: ["mongodb", "database"],
          author: {
            name: "Alice",
            handle: "@alice",
            verified: true,
          },
        },
        {
          _id: { $oid: "507f1f77bcf86cd799439012" },
          title: "Second Post",
          views: 45,
          published: false,
          tags: ["draft"],
          author: {
            name: "Bob",
            handle: "@bob",
            verified: false,
          },
        },
      ];

      const request: MongoBulkInsertRequest = {
        dbId: "test-db",
        collection: "items",
        documents,
        options: { ordered: false },
      };

      const result = await bridge.bulkInsertMongoDocuments(request);

      assert.strictEqual(dispatchedMethod, "mongo.bulk.insert");
      assert.deepStrictEqual(dispatchedParams, request);
      assert.deepStrictEqual(result, expectedResult);
    });

    it("bulkUpdateMongoDocuments dispatches mongo.bulk.update with typed operators and supports unknown upsertedId", async () => {
      let dispatchedMethod = "";
      let dispatchedParams: unknown = null;

      // upsertedId typed as unknown with $oid object
      const expectedUpsertResult: MongoBulkUpdateResult = {
        collection: "items",
        matchedCount: 0,
        modifiedCount: 0,
        upsertedId: { $oid: "507f1f77bcf86cd799439099" },
        advisoryWarning: undefined,
      };

      const mockBridge = async (method: string, params?: unknown) => {
        dispatchedMethod = method;
        dispatchedParams = params;
        return { data: expectedUpsertResult };
      };

      const bridge = new DatabaseBridge(mockBridge);

      const filter: MongoBulkDocument = {
        _id: { $oid: "507f1f77bcf86cd799439099" },
        status: { $in: ["draft", "pending"] },
        views: { $gte: 100 },
      };

      const update: MongoBulkDocument = {
        $set: {
          status: "published",
          "meta.publishedAt": "2026-11-03T00:00:00Z",
        },
        $inc: { version: 1 },
      };

      const request: MongoBulkUpdateRequest = {
        dbId: "test-db",
        collection: "items",
        filter,
        update,
        options: { multi: true, upsert: true },
      };

      const result = await bridge.bulkUpdateMongoDocuments(request);

      assert.strictEqual(dispatchedMethod, "mongo.bulk.update");
      assert.deepStrictEqual(dispatchedParams, request);
      assert.deepStrictEqual(result, expectedUpsertResult);
      assert.deepStrictEqual(result.upsertedId, { $oid: "507f1f77bcf86cd799439099" });
    });

    it("bulkDeleteMongoDocuments dispatches mongo.bulk.delete with typed MongoBulkFilter and advisoryWarning", async () => {
      let dispatchedMethod = "";
      let dispatchedParams: unknown = null;

      const expectedResult: MongoBulkDeleteResult = {
        collection: "logs",
        deletedCount: 250,
        advisoryWarning: "Bulk delete removed 250 documents.",
      };

      const mockBridge = async (method: string, params?: unknown) => {
        dispatchedMethod = method;
        dispatchedParams = params;
        return { data: expectedResult };
      };

      const bridge = new DatabaseBridge(mockBridge);

      const filter: MongoBulkDocument = {
        level: { $in: ["debug", "trace"] },
        "meta.server": "api-worker-1",
        count: { $gte: 50 },
      };

      const request: MongoBulkDeleteRequest = {
        dbId: "test-db",
        collection: "logs",
        filter,
        options: { allowUnrestricted: false },
      };

      const result = await bridge.bulkDeleteMongoDocuments(request);

      assert.strictEqual(dispatchedMethod, "mongo.bulk.delete");
      assert.deepStrictEqual(dispatchedParams, request);
      assert.deepStrictEqual(result, expectedResult);
      assert.strictEqual(result.advisoryWarning, "Bulk delete removed 250 documents.");
    });

    it("saveMongoBulkExportTo dispatches mongo.bulk.exportSaveTo and unwraps data (with warning)", async () => {
      let dispatchedMethod = "";
      let dispatchedParams: unknown = null;

      const expectedResult: MongoBulkExportSaveToResult = {
        operationId: "export-op-456",
        destinationPath: "/home/user/exports/data.json",
        bytesWritten: 1048576,
        success: true,
        warning: "Staging cleanup retry queued; file remains temporarily on disk",
      };

      const mockBridge = async (method: string, params?: unknown) => {
        dispatchedMethod = method;
        dispatchedParams = params;
        return { data: expectedResult };
      };

      const bridge = new DatabaseBridge(mockBridge);
      const request: MongoBulkExportSaveToRequest = {
        operationId: "export-op-456",
        destinationPath: "/home/user/exports/data.json",
        options: { overwrite: true },
      };

      const result = await bridge.saveMongoBulkExportTo(request);

      assert.strictEqual(dispatchedMethod, "mongo.bulk.exportSaveTo");
      assert.deepStrictEqual(dispatchedParams, request);
      assert.deepStrictEqual(result, expectedResult);
      assert.strictEqual(
        result.warning,
        "Staging cleanup retry queued; file remains temporarily on disk",
      );
    });
  });

  // =========================================================================
  // 2. Error Propagation Tests
  // =========================================================================
  describe("Error Propagation", () => {
    it("propagates bridge rejection on startMongoBulkImport", async () => {
      const mockBridge = async () => {
        throw new Error("MONGO_LIMIT_EXCEEDED: payload too large");
      };

      const bridge = new DatabaseBridge(mockBridge);
      await assert.rejects(
        async () => {
          await bridge.startMongoBulkImport({
            dbId: "db1",
            collection: "col1",
            format: "json",
          });
        },
        {
          name: "Error",
          message: "MONGO_LIMIT_EXCEEDED: payload too large",
        },
      );
    });

    it("propagates bridge rejection on saveMongoBulkExportTo", async () => {
      const mockBridge = async () => {
        const err = new Error("MONGO_UNSUPPORTED_FILESYSTEM: hard links not supported");
        (err as any).code = "MONGO_UNSUPPORTED_FILESYSTEM";
        throw err;
      };

      const bridge = new DatabaseBridge(mockBridge);
      await assert.rejects(
        async () => {
          await bridge.saveMongoBulkExportTo({
            operationId: "op-1",
            destinationPath: "/mnt/fat32/export.json",
          });
        },
        (err: any) => {
          assert.strictEqual(err.code, "MONGO_UNSUPPORTED_FILESYSTEM");
          return true;
        },
      );
    });

    it("propagates bridge rejection on bulkDeleteMongoDocuments", async () => {
      const mockBridge = async () => {
        throw new Error("MONGO_BULK_OP_FORBIDDEN: empty filter requires allowUnrestricted: true");
      };

      const bridge = new DatabaseBridge(mockBridge);
      await assert.rejects(
        async () => {
          await bridge.bulkDeleteMongoDocuments({
            dbId: "db1",
            collection: "col1",
            filter: {},
          });
        },
        {
          name: "Error",
          message: "MONGO_BULK_OP_FORBIDDEN: empty filter requires allowUnrestricted: true",
        },
      );
    });
  });

  // =========================================================================
  // 3. DatabaseService Delegation Tests
  // =========================================================================
  describe("DatabaseService Bulk Method Delegation", () => {
    it("verifies all 10 bulk methods exist on databaseBridge and databaseService", () => {
      const methodNames = [
        "startMongoBulkImport",
        "importMongoBulkChunk",
        "startMongoBulkExport",
        "getMongoBulkOperationStatus",
        "cancelMongoBulkOperation",
        "cleanupMongoBulkOperation",
        "bulkInsertMongoDocuments",
        "bulkUpdateMongoDocuments",
        "bulkDeleteMongoDocuments",
        "saveMongoBulkExportTo",
      ] as const;

      for (const method of methodNames) {
        assert.strictEqual(
          typeof (databaseBridge as any)[method],
          "function",
          `databaseBridge.${method} should be a function`,
        );
        assert.strictEqual(
          typeof (databaseService as any)[method],
          "function",
          `databaseService.${method} should be a function`,
        );
      }
    });

    it("delegates all 10 databaseService calls directly to databaseBridge", async () => {
      const calls: string[] = [];

      const orig1 = databaseBridge.startMongoBulkImport;
      const orig2 = databaseBridge.importMongoBulkChunk;
      const orig3 = databaseBridge.startMongoBulkExport;
      const orig4 = databaseBridge.getMongoBulkOperationStatus;
      const orig5 = databaseBridge.cancelMongoBulkOperation;
      const orig6 = databaseBridge.cleanupMongoBulkOperation;
      const orig7 = databaseBridge.bulkInsertMongoDocuments;
      const orig8 = databaseBridge.bulkUpdateMongoDocuments;
      const orig9 = databaseBridge.bulkDeleteMongoDocuments;
      const orig10 = databaseBridge.saveMongoBulkExportTo;

      try {
        databaseBridge.startMongoBulkImport = async (req) => {
          calls.push(`startMongoBulkImport:${req.dbId}`);
          return {
            operationId: "id-1",
            status: "pending",
            format: req.format,
            collection: req.collection,
          };
        };
        databaseBridge.importMongoBulkChunk = async (req) => {
          calls.push(`importMongoBulkChunk:${req.operationId}:${req.chunkIndex}`);
          return {
            operationId: req.operationId,
            chunkIndex: req.chunkIndex,
            status: "in_progress",
            insertedCount: 1,
            failedCount: 0,
            isComplete: false,
            totalInserted: 1,
            totalFailed: 0,
          };
        };
        databaseBridge.startMongoBulkExport = async (req) => {
          calls.push(`startMongoBulkExport:${req.dbId}:${req.collection}`);
          return {
            operationId: "id-2",
            status: "pending",
            collection: req.collection,
            format: req.format,
          };
        };
        databaseBridge.getMongoBulkOperationStatus = async (req) => {
          calls.push(`getMongoBulkOperationStatus:${req.operationId}`);
          return {
            operationId: req.operationId,
            type: "export",
            status: "completed",
            collection: "c",
            format: "json",
            processedDocuments: 10,
            successfulDocuments: 10,
            failedDocuments: 0,
            createdAt: "",
            updatedAt: "",
            expiresAt: "",
          };
        };
        databaseBridge.cancelMongoBulkOperation = async (req) => {
          calls.push(`cancelMongoBulkOperation:${req.operationId}`);
          return { operationId: req.operationId, status: "cancelled", message: "ok" };
        };
        databaseBridge.cleanupMongoBulkOperation = async (req) => {
          calls.push(`cleanupMongoBulkOperation:${req.operationId}`);
          return { operationId: req.operationId, success: true };
        };
        databaseBridge.bulkInsertMongoDocuments = async (req) => {
          calls.push(`bulkInsertMongoDocuments:${req.collection}`);
          return {
            collection: req.collection,
            insertedCount: req.documents.length,
            failedCount: 0,
          };
        };
        databaseBridge.bulkUpdateMongoDocuments = async (req) => {
          calls.push(`bulkUpdateMongoDocuments:${req.collection}`);
          return { collection: req.collection, matchedCount: 1, modifiedCount: 1 };
        };
        databaseBridge.bulkDeleteMongoDocuments = async (req) => {
          calls.push(`bulkDeleteMongoDocuments:${req.collection}`);
          return { collection: req.collection, deletedCount: 1 };
        };
        databaseBridge.saveMongoBulkExportTo = async (req) => {
          calls.push(`saveMongoBulkExportTo:${req.operationId}`);
          return {
            operationId: req.operationId,
            destinationPath: req.destinationPath,
            bytesWritten: 100,
            success: true,
          };
        };

        // Dispatch via databaseService
        await databaseService.startMongoBulkImport({
          dbId: "db1",
          collection: "c1",
          format: "json",
        });
        await databaseService.importMongoBulkChunk({
          operationId: "id-1",
          chunkIndex: 0,
          payload: "[]",
        });
        await databaseService.startMongoBulkExport({
          dbId: "db1",
          collection: "c1",
          format: "ndjson",
        });
        await databaseService.getMongoBulkOperationStatus({ operationId: "id-1" });
        await databaseService.cancelMongoBulkOperation({ operationId: "id-1" });
        await databaseService.cleanupMongoBulkOperation({ operationId: "id-1" });
        await databaseService.bulkInsertMongoDocuments({
          dbId: "db1",
          collection: "c1",
          documents: [{ a: 1 }],
        });
        await databaseService.bulkUpdateMongoDocuments({
          dbId: "db1",
          collection: "c1",
          filter: { a: 1 },
          update: { $set: { b: 2 } },
        });
        await databaseService.bulkDeleteMongoDocuments({
          dbId: "db1",
          collection: "c1",
          filter: { a: 1 },
        });
        await databaseService.saveMongoBulkExportTo({
          operationId: "id-1",
          destinationPath: "/tmp/out.json",
        });

        assert.deepStrictEqual(calls, [
          "startMongoBulkImport:db1",
          "importMongoBulkChunk:id-1:0",
          "startMongoBulkExport:db1:c1",
          "getMongoBulkOperationStatus:id-1",
          "cancelMongoBulkOperation:id-1",
          "cleanupMongoBulkOperation:id-1",
          "bulkInsertMongoDocuments:c1",
          "bulkUpdateMongoDocuments:c1",
          "bulkDeleteMongoDocuments:c1",
          "saveMongoBulkExportTo:id-1",
        ]);
      } finally {
        databaseBridge.startMongoBulkImport = orig1;
        databaseBridge.importMongoBulkChunk = orig2;
        databaseBridge.startMongoBulkExport = orig3;
        databaseBridge.getMongoBulkOperationStatus = orig4;
        databaseBridge.cancelMongoBulkOperation = orig5;
        databaseBridge.cleanupMongoBulkOperation = orig6;
        databaseBridge.bulkInsertMongoDocuments = orig7;
        databaseBridge.bulkUpdateMongoDocuments = orig8;
        databaseBridge.bulkDeleteMongoDocuments = orig9;
        databaseBridge.saveMongoBulkExportTo = orig10;
      }
    });
  });

  // =========================================================================
  // 4. Type Discrimination Helpers & Unknown UpsertedId Tests
  // =========================================================================
  describe("BulkHistoryEntry Type Discrimination Helpers & Typing Invariants", () => {
    const asyncOp: TrackedAsyncBulkOperation = {
      kind: "async",
      operationId: "uuid-async-1",
      dbId: "db1",
      collection: "orders",
      type: "export",
      status: "in_progress",
      saveStatus: "not_saved",
      isUnreachable: false,
      format: "json",
      processedDocuments: 100,
      successfulDocuments: 100,
      failedDocuments: 0,
      createdAt: "2026-11-03T12:00:00Z",
      updatedAt: "2026-11-03T12:01:00Z",
      expiresAt: "2026-11-03T13:00:00Z",
    };

    const syncMutationWithObjectId: TrackedSyncBulkMutation = {
      kind: "sync",
      id: "uuid-sync-1",
      dbId: "db1",
      collection: "orders",
      type: "insert",
      status: "completed",
      timestamp: "2026-11-03T12:05:00Z",
      insertedCount: 1,
      upsertedId: { $oid: "507f1f77bcf86cd799439011" },
    };

    const syncMutationWithStringId: TrackedSyncBulkMutation = {
      kind: "sync",
      id: "uuid-sync-2",
      dbId: "db1",
      collection: "orders",
      type: "update",
      status: "completed",
      timestamp: "2026-11-03T12:06:00Z",
      matchedCount: 0,
      modifiedCount: 0,
      upsertedId: "string-custom-id-999",
    };

    it("isAsyncBulkOperation correctly identifies async operations and narrows type", () => {
      const entry1: BulkHistoryEntry = asyncOp;
      const entry2: BulkHistoryEntry = syncMutationWithObjectId;

      assert.strictEqual(isAsyncBulkOperation(entry1), true);
      assert.strictEqual(isAsyncBulkOperation(entry2), false);

      if (isAsyncBulkOperation(entry1)) {
        // TypeScript narrows entry1 to TrackedAsyncBulkOperation
        assert.strictEqual(entry1.operationId, "uuid-async-1");
        assert.strictEqual(entry1.type, "export");
      } else {
        assert.fail("Should have narrowed to TrackedAsyncBulkOperation");
      }
    });

    it("isSyncBulkMutation correctly identifies sync mutations and narrows type", () => {
      const entry1: BulkHistoryEntry = syncMutationWithObjectId;
      const entry2: BulkHistoryEntry = asyncOp;

      assert.strictEqual(isSyncBulkMutation(entry1), true);
      assert.strictEqual(isSyncBulkMutation(entry2), false);

      if (isSyncBulkMutation(entry1)) {
        // TypeScript narrows entry1 to TrackedSyncBulkMutation
        assert.strictEqual(entry1.id, "uuid-sync-1");
        assert.strictEqual(entry1.type, "insert");
        assert.strictEqual(entry1.insertedCount, 1);
        assert.deepStrictEqual(entry1.upsertedId, { $oid: "507f1f77bcf86cd799439011" });
      } else {
        assert.fail("Should have narrowed to TrackedSyncBulkMutation");
      }
    });

    it("verifies upsertedId unknown typing safely accommodates diverse ID shapes", () => {
      // Test unknown accommodates string, number, object id, and undefined safely
      const testCases: Array<{ mutation: TrackedSyncBulkMutation; expectedId: unknown }> = [
        { mutation: syncMutationWithObjectId, expectedId: { $oid: "507f1f77bcf86cd799439011" } },
        { mutation: syncMutationWithStringId, expectedId: "string-custom-id-999" },
        {
          mutation: {
            kind: "sync",
            id: "uuid-sync-3",
            dbId: "db1",
            collection: "orders",
            type: "update",
            status: "completed",
            timestamp: "2026-11-03T12:07:00Z",
            upsertedId: 42,
          },
          expectedId: 42,
        },
        {
          mutation: {
            kind: "sync",
            id: "uuid-sync-4",
            dbId: "db1",
            collection: "orders",
            type: "delete",
            status: "completed",
            timestamp: "2026-11-03T12:08:00Z",
          },
          expectedId: undefined,
        },
      ];

      for (const { mutation, expectedId } of testCases) {
        assert.deepStrictEqual(mutation.upsertedId, expectedId);
      }
    });
  });
});
