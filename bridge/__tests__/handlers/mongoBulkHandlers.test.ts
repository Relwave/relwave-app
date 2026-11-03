import { describe, expect, test, beforeEach, jest } from "@jest/globals";
import { MongoBulkHandlers } from "../../src/handlers/mongoBulkHandlers";
import { MongoApiError } from "../../src/connectors/mongo";

describe("MongoBulkHandlers JSON-RPC Dispatch & Parameter Validation Tests", () => {
  let mockRpc: any;
  let mockLogger: any;
  let mockEngine: any;
  let handlers: MongoBulkHandlers;

  const validUuid = "12345678-1234-4234-8234-123456789abc";

  beforeEach(() => {
    mockRpc = {
      sendResponse: jest.fn(),
      sendError: jest.fn(),
    };
    mockLogger = {
      error: jest.fn(),
      info: jest.fn(),
      warn: jest.fn(),
      debug: jest.fn(),
    };
    mockEngine = {
      importStart: jest.fn<any>().mockResolvedValue({
        operationId: validUuid,
        status: "pending",
        format: "json",
        collection: "users",
      }),
      importChunk: jest.fn<any>().mockResolvedValue({
        operationId: validUuid,
        chunkIndex: 0,
        status: "in_progress",
        insertedCount: 10,
        failedCount: 0,
        isComplete: false,
        totalInserted: 10,
        totalFailed: 0,
      }),
      exportStart: jest.fn<any>().mockResolvedValue({
        operationId: validUuid,
        status: "pending",
        collection: "orders",
        format: "csv",
      }),
      getOperationStatus: jest.fn<any>().mockResolvedValue({
        operationId: validUuid,
        type: "import",
        status: "completed",
        collection: "users",
        format: "json",
        processedDocuments: 10,
        successfulDocuments: 10,
        failedDocuments: 0,
      }),
      cancelOperation: jest.fn<any>().mockResolvedValue({
        operationId: validUuid,
        status: "cancelled",
        message: "Operation cancelled",
      }),
      cleanupOperation: jest.fn<any>().mockResolvedValue({
        operationId: validUuid,
        success: true,
      }),
      exportSaveTo: jest.fn<any>().mockResolvedValue({
        operationId: validUuid,
        destinationPath: "/abs/path/export.json",
        bytesWritten: 1234,
        success: true,
      }),
      bulkInsert: jest.fn<any>().mockResolvedValue({
        collection: "products",
        insertedCount: 5,
        failedCount: 0,
      }),
      bulkUpdate: jest.fn<any>().mockResolvedValue({
        collection: "products",
        matchedCount: 5,
        modifiedCount: 5,
      }),
      bulkDelete: jest.fn<any>().mockResolvedValue({
        collection: "products",
        deletedCount: 2,
      }),
    };

    handlers = new MongoBulkHandlers(mockRpc, mockLogger, mockEngine);
  });

  test("handleImportStart dispatches successfully and validates params", async () => {
    await handlers.handleImportStart(
      { dbId: "db-1", collection: "users", format: "json" },
      1
    );
    expect(mockEngine.importStart).toHaveBeenCalledWith({
      dbId: "db-1",
      collection: "users",
      format: "json",
      options: undefined,
    });
    expect(mockRpc.sendResponse).toHaveBeenCalledWith(1, {
      ok: true,
      data: expect.objectContaining({ operationId: validUuid }),
    });

    // Invalid format
    await handlers.handleImportStart(
      { dbId: "db-1", collection: "users", format: "xml" },
      2
    );
    expect(mockRpc.sendError).toHaveBeenCalledWith(2, {
      code: "BAD_REQUEST",
      message: expect.stringContaining("format must be 'json', 'ndjson', or 'csv'"),
    });
  });

  test("handleImportChunk validates UUIDv4 and dispatches", async () => {
    await handlers.handleImportChunk(
      { operationId: validUuid, chunkIndex: 0, payload: "[]" },
      3
    );
    expect(mockEngine.importChunk).toHaveBeenCalledWith({
      operationId: validUuid,
      chunkIndex: 0,
      isLastChunk: undefined,
      payload: "[]",
    });
    expect(mockRpc.sendResponse).toHaveBeenCalledWith(3, {
      ok: true,
      data: expect.objectContaining({ chunkIndex: 0 }),
    });

    // Invalid operationId (path traversal attempt)
    await handlers.handleImportChunk(
      { operationId: "../malicious", chunkIndex: 0, payload: "[]" },
      4
    );
    expect(mockRpc.sendError).toHaveBeenCalledWith(4, {
      code: "BAD_REQUEST",
      message: expect.stringContaining("operationId must be a valid UUIDv4"),
    });
  });

  test("handleExportStart validates params and dispatches", async () => {
    await handlers.handleExportStart(
      { dbId: "db-1", collection: "orders", format: "csv" },
      5
    );
    expect(mockEngine.exportStart).toHaveBeenCalled();
    expect(mockRpc.sendResponse).toHaveBeenCalledWith(5, {
      ok: true,
      data: expect.objectContaining({ format: "csv" }),
    });
  });

  test("handleGetOperationStatus, handleCancelOperation, and handleCleanupOperation validate operationId", async () => {
    await handlers.handleGetOperationStatus({ operationId: validUuid }, 6);
    expect(mockRpc.sendResponse).toHaveBeenCalledWith(6, {
      ok: true,
      data: expect.objectContaining({ operationId: validUuid }),
    });

    await handlers.handleCancelOperation({ operationId: validUuid }, 7);
    expect(mockRpc.sendResponse).toHaveBeenCalledWith(7, {
      ok: true,
      data: expect.objectContaining({ status: "cancelled" }),
    });

    await handlers.handleCleanupOperation({ operationId: validUuid }, 8);
    expect(mockRpc.sendResponse).toHaveBeenCalledWith(8, {
      ok: true,
      data: { operationId: validUuid, success: true },
    });
  });

  test("handleBulkInsert, handleBulkUpdate, handleBulkDelete validate mutations", async () => {
    await handlers.handleBulkInsert(
      { dbId: "db-1", collection: "products", documents: [{ sku: "A" }] },
      9
    );
    expect(mockEngine.bulkInsert).toHaveBeenCalled();

    await handlers.handleBulkUpdate(
      { dbId: "db-1", collection: "products", filter: { sku: "A" }, update: { $set: { price: 10 } } },
      10
    );
    expect(mockEngine.bulkUpdate).toHaveBeenCalled();

    await handlers.handleBulkDelete(
      { dbId: "db-1", collection: "products", filter: { sku: "A" } },
      11
    );
    expect(mockEngine.bulkDelete).toHaveBeenCalled();
  });

  test("propagates MongoApiError code and message correctly", async () => {
    mockEngine.bulkInsert.mockRejectedValueOnce(
      new MongoApiError("MONGO_READ_ONLY", "Database is in read-only mode")
    );

    await handlers.handleBulkInsert(
      { dbId: "db-1", collection: "products", documents: [{ sku: "A" }] },
      12
    );

    expect(mockRpc.sendError).toHaveBeenCalledWith(12, {
      code: "MONGO_READ_ONLY",
      message: "Database is in read-only mode",
    });
  });

  describe("handleExportSaveTo", () => {
    test("dispatches successfully with valid arguments", async () => {
      await handlers.handleExportSaveTo(
        {
          operationId: validUuid,
          destinationPath: "/abs/path/export.json",
          options: { overwrite: true },
        },
        13,
      );

      expect(mockEngine.exportSaveTo).toHaveBeenCalledWith({
        operationId: validUuid,
        destinationPath: "/abs/path/export.json",
        options: { overwrite: true },
      });
      expect(mockRpc.sendResponse).toHaveBeenCalledWith(13, {
        ok: true,
        data: expect.objectContaining({
          operationId: validUuid,
          destinationPath: "/abs/path/export.json",
          bytesWritten: 1234,
          success: true,
        }),
      });
    });

    test("validates operationId is valid UUIDv4", async () => {
      await handlers.handleExportSaveTo(
        {
          operationId: "invalid-uuid",
          destinationPath: "/abs/path/export.json",
        },
        14,
      );

      expect(mockRpc.sendError).toHaveBeenCalledWith(14, {
        code: "BAD_REQUEST",
        message: expect.stringContaining("operationId must be a valid UUIDv4"),
      });
      expect(mockEngine.exportSaveTo).not.toHaveBeenCalled();
    });

    test("validates destinationPath is non-empty string", async () => {
      await handlers.handleExportSaveTo(
        {
          operationId: validUuid,
          destinationPath: "   ",
        },
        15,
      );

      expect(mockRpc.sendError).toHaveBeenCalledWith(15, {
        code: "BAD_REQUEST",
        message: expect.stringContaining("destinationPath must be a non-empty string"),
      });

      await handlers.handleExportSaveTo(
        {
          operationId: validUuid,
          destinationPath: null,
        },
        16,
      );

      expect(mockRpc.sendError).toHaveBeenCalledWith(16, {
        code: "BAD_REQUEST",
        message: expect.stringContaining("destinationPath must be a non-empty string"),
      });
    });

    test("validates options must be object", async () => {
      await handlers.handleExportSaveTo(
        {
          operationId: validUuid,
          destinationPath: "/abs/path/export.json",
          options: "not-an-object",
        },
        17,
      );

      expect(mockRpc.sendError).toHaveBeenCalledWith(17, {
        code: "BAD_REQUEST",
        message: expect.stringContaining("options must be an object"),
      });
    });

    test("validates options.overwrite must be boolean", async () => {
      await handlers.handleExportSaveTo(
        {
          operationId: validUuid,
          destinationPath: "/abs/path/export.json",
          options: { overwrite: "yes" as any },
        },
        18,
      );

      expect(mockRpc.sendError).toHaveBeenCalledWith(18, {
        code: "BAD_REQUEST",
        message: expect.stringContaining("options.overwrite must be a boolean"),
      });
    });

    test("propagates MongoApiError from engine", async () => {
      mockEngine.exportSaveTo.mockRejectedValueOnce(
        new MongoApiError("MONGO_FILE_EXISTS", "Destination file already exists"),
      );

      await handlers.handleExportSaveTo(
        {
          operationId: validUuid,
          destinationPath: "/abs/path/export.json",
        },
        19,
      );

      expect(mockRpc.sendError).toHaveBeenCalledWith(19, {
        code: "MONGO_FILE_EXISTS",
        message: "Destination file already exists",
      });
    });
  });
});
