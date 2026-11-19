import { describe, expect, test, jest } from "@jest/globals";
import { isOfflineError } from "../src/services/databaseService";
import { DatabaseHandlers } from "../src/handlers/databaseHandlers";
import { StatsHandlers } from "../src/handlers/statsHandlers";

describe("isOfflineError helper", () => {
  test("identifies standard Node network error codes as offline", () => {
    expect(isOfflineError({ code: "ENOTFOUND" })).toBe(true);
    expect(isOfflineError({ code: "ECONNREFUSED" })).toBe(true);
    expect(isOfflineError({ code: "ETIMEDOUT" })).toBe(true);
    expect(isOfflineError({ code: "EHOSTUNREACH" })).toBe(true);
    expect(isOfflineError({ code: "ENETUNREACH" })).toBe(true);
    expect(isOfflineError({ code: "ECONNRESET" })).toBe(true);
    expect(isOfflineError({ code: "EAI_AGAIN" })).toBe(true);
    expect(isOfflineError({ code: "EPIPE" })).toBe(true);
    expect(isOfflineError({ code: "PROTOCOL_CONNECTION_LOST" })).toBe(true);
  });

  test("identifies MongoDB driver network/topology error names as offline", () => {
    expect(isOfflineError({ name: "MongoServerSelectionError" })).toBe(true);
    expect(isOfflineError({ name: "MongoNetworkError" })).toBe(true);
    expect(isOfflineError({ name: "MongoNetworkTimeoutError" })).toBe(true);
    expect(isOfflineError({ name: "MongoTopologyClosedError" })).toBe(true);
  });

  test("identifies message text containing offline indicators", () => {
    expect(
      isOfflineError(
        new Error(
          "Failed to fetch MySQL database stats: getaddrinfo ENOTFOUND lms-yashh56.d.aivencloud.com",
        ),
      ),
    ).toBe(true);
    expect(isOfflineError(new Error("connect ECONNREFUSED 127.0.0.1:3306"))).toBe(true);
    expect(
      isOfflineError(
        new Error("Failed to fetch MySQL database stats: connect ECONNREFUSED 127.0.0.1:3306"),
      ),
    ).toBe(true);
    expect(isOfflineError(new Error("Server selection timed out after 30000 ms"))).toBe(true);
    expect(isOfflineError(new Error("Topology is closed"))).toBe(true);
    expect(isOfflineError(new Error("Connection terminated unexpectedly"))).toBe(true);
    expect(isOfflineError("Database is offline")).toBe(true);
  });

  test("identifies cause error as offline when cause matches", () => {
    const errorWithCause = new Error("Wrapper");
    (errorWithCause as any).cause = { code: "ECONNREFUSED" };
    expect(isOfflineError(errorWithCause)).toBe(true);
  });

  test("returns false for non-offline errors", () => {
    expect(isOfflineError(null)).toBe(false);
    expect(isOfflineError(undefined)).toBe(false);
    expect(isOfflineError(new Error("Table 'users' does not exist"))).toBe(false);
    expect(isOfflineError(new Error("Table 'offline_orders' does not exist"))).toBe(false);
    expect(
      isOfflineError(
        new Error(
          "Failed to fetch MySQL database stats: Access denied for user 'root'@'localhost'",
        ),
      ),
    ).toBe(false);
    expect(isOfflineError(new Error("Syntax error in SQL statement"))).toBe(false);
    expect(
      isOfflineError({ code: "ER_PARSE_ERROR", message: "You have an error in your SQL" }),
    ).toBe(false);
  });
});

describe("Handlers graceful offline error handling", () => {
  const createMockRpc = () => ({
    sendResponse: jest.fn(),
    sendError: jest.fn(),
  });

  const createMockLogger = () => ({
    error: jest.fn(),
    warn: jest.fn(),
    info: jest.fn(),
    debug: jest.fn(),
  });

  test("DatabaseHandlers.handleListTables returns empty data with isOffline: true when offline", async () => {
    const mockRpc = createMockRpc();
    const mockLogger = createMockLogger();
    const mockDbService = {
      withConnection: jest
        .fn<any>()
        .mockRejectedValue(new Error("getaddrinfo ENOTFOUND remote-cluster.example.com")),
    };
    const mockQueryExecutor = {};

    const handlers = new DatabaseHandlers(
      mockRpc as any,
      mockLogger as any,
      mockDbService as any,
      mockQueryExecutor as any,
    );

    await handlers.handleListTables({ id: "offline-db-1" }, 101);

    expect(mockRpc.sendResponse).toHaveBeenCalledWith(101, {
      ok: true,
      data: [],
      isOffline: true,
    });
    expect(mockRpc.sendError).not.toHaveBeenCalled();
    expect(mockLogger.error).not.toHaveBeenCalled();
    expect(mockLogger.warn).toHaveBeenCalled();
  });

  test("DatabaseHandlers.handleListSchemas returns empty data with isOffline: true when offline", async () => {
    const mockRpc = createMockRpc();
    const mockLogger = createMockLogger();
    const mockDbService = {
      withConnection: jest
        .fn<any>()
        .mockRejectedValue(new Error("connect ECONNREFUSED 127.0.0.1:5432")),
    };
    const mockQueryExecutor = {};

    const handlers = new DatabaseHandlers(
      mockRpc as any,
      mockLogger as any,
      mockDbService as any,
      mockQueryExecutor as any,
    );

    await handlers.handleListSchemas({ id: "offline-db-2" }, 102);

    expect(mockRpc.sendResponse).toHaveBeenCalledWith(102, {
      ok: true,
      data: [],
      isOffline: true,
    });
    expect(mockRpc.sendError).not.toHaveBeenCalled();
    expect(mockLogger.error).not.toHaveBeenCalled();
  });

  test("DatabaseHandlers.handleTestConnection returns disconnected with isOffline: true when offline", async () => {
    const mockRpc = createMockRpc();
    const mockLogger = createMockLogger();
    const mockDbService = {
      withConnection: jest
        .fn<any>()
        .mockRejectedValue(new Error("connect ETIMEDOUT 192.168.1.100:3306")),
    };
    const mockQueryExecutor = {};

    const handlers = new DatabaseHandlers(
      mockRpc as any,
      mockLogger as any,
      mockDbService as any,
      mockQueryExecutor as any,
    );

    await handlers.handleTestConnection({ id: "offline-db-3" }, 103);

    expect(mockRpc.sendResponse).toHaveBeenCalledWith(
      103,
      expect.objectContaining({
        ok: true,
        data: expect.objectContaining({
          ok: false,
          status: "disconnected",
          isOffline: true,
        }),
      }),
    );
    expect(mockLogger.error).not.toHaveBeenCalled();
    expect(mockLogger.warn).toHaveBeenCalled();
  });

  test("StatsHandlers.handleGetStats returns zeroed stats with isOffline: true when offline", async () => {
    const mockRpc = createMockRpc();
    const mockLogger = createMockLogger();
    const mockDbService = {
      getDatabaseConnection: jest
        .fn<any>()
        .mockRejectedValue(new Error("getaddrinfo ENOTFOUND my-cluster.mongodb.net")),
    };
    const mockQueryExecutor = {};

    const handlers = new StatsHandlers(
      mockRpc as any,
      mockLogger as any,
      mockDbService as any,
      mockQueryExecutor as any,
    );

    await handlers.handleGetStats({ id: "offline-mongo-1" }, 104);

    expect(mockRpc.sendResponse).toHaveBeenCalledWith(104, {
      ok: true,
      data: { tables: 0, rows: 0, sizeBytes: 0 },
      isOffline: true,
    });
    expect(mockRpc.sendError).not.toHaveBeenCalled();
    expect(mockLogger.error).not.toHaveBeenCalled();
    expect(mockLogger.warn).toHaveBeenCalled();
  });
});
