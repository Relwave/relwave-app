import { describe, expect, test, jest, beforeEach } from "@jest/globals";
import { MonitoringHandlers } from "../src/handlers/monitoringHandlers";
import { DBType } from "../src/types";
import type { Rpc } from "../src/types";

function createMockRpc(): Rpc & { _responses: any[]; _errors: any[] } {
    const responses: any[] = [];
    const errors: any[] = [];

    return {
        sendResponse: jest.fn((id: number | string, payload: any) => {
            responses.push({ id, payload });
        }),
        sendError: jest.fn((id: number | string, err: any) => {
            errors.push({ id, err });
        }),
        _responses: responses,
        _errors: errors,
    };
}

function createMockLogger(): any {
    return {
        info: jest.fn(),
        warn: jest.fn(),
        error: jest.fn(),
        debug: jest.fn(),
        child: jest.fn().mockReturnThis(),
    };
}

function createMockDbService() {
    return {
        getDatabaseConnection: jest.fn(),
    };
}

function createMockMonitoringService() {
    return {
        getSnapshot: jest.fn(),
    };
}

describe("MonitoringHandlers", () => {
    let rpc: ReturnType<typeof createMockRpc>;
    let logger: any;
    let dbService: ReturnType<typeof createMockDbService>;
    let monitoringService: ReturnType<typeof createMockMonitoringService>;
    let handlers: MonitoringHandlers;

    beforeEach(() => {
        rpc = createMockRpc();
        logger = createMockLogger();
        dbService = createMockDbService();
        monitoringService = createMockMonitoringService();
        handlers = new MonitoringHandlers(rpc, logger, dbService as any, monitoringService as any);
    });

    test("returns BAD_REQUEST when db id is missing", async () => {
        await handlers.handleGetSnapshot({}, 1);

        expect(rpc.sendError).toHaveBeenCalledWith(1, {
            code: "BAD_REQUEST",
            message: "Missing id",
        });
        expect(dbService.getDatabaseConnection).not.toHaveBeenCalled();
    });

    test("returns monitoring snapshot for a valid database", async () => {
        const conn = { connection: true };
        const snapshot = {
            databaseType: DBType.POSTGRES,
            sampledAt: "2026-05-16T00:00:00.000Z",
            health: { ok: true, latencyMs: 12 },
            connections: { active: 2, max: 100, usagePct: 2 },
            throughput: { qps: 3.5, totalQueries: 1000 },
            cacheHitRatio: 99.2,
            activeQueries: [],
        };

        (dbService.getDatabaseConnection as any).mockResolvedValue({ conn, dbType: DBType.POSTGRES });
        (monitoringService.getSnapshot as any).mockResolvedValue(snapshot);

        await handlers.handleGetSnapshot({ id: "db-1" }, 2);

        expect(dbService.getDatabaseConnection).toHaveBeenCalledWith("db-1");
        expect(monitoringService.getSnapshot).toHaveBeenCalledWith("db-1", conn, DBType.POSTGRES);
        expect(rpc.sendResponse).toHaveBeenCalledWith(2, {
            ok: true,
            data: snapshot,
        });
    });

    test("returns MONITORING_ERROR when snapshot generation fails", async () => {
        (dbService.getDatabaseConnection as any).mockResolvedValue({ conn: {}, dbType: DBType.POSTGRES });
        (monitoringService.getSnapshot as any).mockRejectedValue(new Error("snapshot failed"));

        await handlers.handleGetSnapshot({ id: "db-1" }, 3);

        expect(logger.error).toHaveBeenCalled();
        expect(rpc.sendError).toHaveBeenCalledWith(3, {
            code: "MONITORING_ERROR",
            message: "snapshot failed",
        });
    });
});
