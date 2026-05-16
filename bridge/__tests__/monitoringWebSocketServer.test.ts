import { describe, expect, test, jest, beforeEach, afterEach } from "@jest/globals";
import { MonitoringWebSocketServer } from "../src/services/monitoringWebSocketServer";
import { DBType } from "../src/types";

const mockWebSocketServerInstances: any[] = [];

jest.mock("ws", () => ({
    WebSocketServer: jest.fn().mockImplementation((options) => {
        const listeners: Record<string, (...args: any[]) => void> = {};

        const instance = {
            options,
            on: jest.fn((event: string, handler: (...args: any[]) => void) => {
                listeners[event] = handler;
            }),
            close: jest.fn(),
            address: jest.fn(() => ({ port: 4567 })),
            emit: async (event: string, ...args: any[]) => {
                const handler = listeners[event];
                if (!handler) return undefined;
                return handler(...args);
            },
            _listeners: listeners,
        };

        mockWebSocketServerInstances.push(instance);
        return instance;
    }),
}));

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

function createMockSocket() {
    const listeners: Record<string, (...args: any[]) => void> = {};
    return {
        readyState: 1,
        send: jest.fn(),
        close: jest.fn(),
        on: jest.fn((event: string, handler: (...args: any[]) => void) => {
            listeners[event] = handler;
        }),
        emit: async (event: string, ...args: any[]) => {
            const handler = listeners[event];
            if (!handler) return undefined;
            return handler(...args);
        },
        _listeners: listeners,
    };
}

describe("MonitoringWebSocketServer", () => {
    let logger: any;
    let dbService: ReturnType<typeof createMockDbService>;
    let monitoringService: ReturnType<typeof createMockMonitoringService>;
    let server: MonitoringWebSocketServer;
    let setIntervalSpy: jest.SpiedFunction<typeof setInterval>;
    let clearIntervalSpy: jest.SpiedFunction<typeof clearInterval>;

    beforeEach(() => {
        mockWebSocketServerInstances.length = 0;
        logger = createMockLogger();
        dbService = createMockDbService();
        monitoringService = createMockMonitoringService();
        server = new MonitoringWebSocketServer(dbService as any, monitoringService as any, logger);
        setIntervalSpy = jest.spyOn(global, "setInterval").mockReturnValue(123 as any);
        clearIntervalSpy = jest.spyOn(global, "clearInterval").mockImplementation(() => undefined);
    });

    afterEach(() => {
        jest.restoreAllMocks();
        server.close();
    });

    test("starts once and exposes websocket info after listening", () => {
        expect(() => server.getInfo()).toThrow("Monitoring WebSocket server is not ready");

        server.start();
        server.start();

        expect(mockWebSocketServerInstances).toHaveLength(1);
        expect(mockWebSocketServerInstances[0].options).toEqual({
            host: "127.0.0.1",
            port: 0,
            path: "/monitoring",
        });

        mockWebSocketServerInstances[0].emit("listening");

        expect(logger.info).toHaveBeenCalledWith({ port: 4567 }, "Monitoring WebSocket server started");
        expect(server.getInfo()).toEqual({
            url: "ws://127.0.0.1:4567/monitoring",
            intervalMs: 5000,
        });
    });

    test("closes unsupported websocket connections immediately", async () => {
        server.start();
        const wsServer = mockWebSocketServerInstances[0];
        const socket = createMockSocket();

        (dbService.getDatabaseConnection as any).mockResolvedValue({ conn: { id: "conn" }, dbType: DBType.SQLITE });

        await wsServer.emit("connection", socket, { url: "/monitoring?dbId=db-1" } as any);

        expect(dbService.getDatabaseConnection).toHaveBeenCalledWith("db-1");
        expect(socket.send).toHaveBeenCalledWith(
            JSON.stringify({
                type: "unsupported",
                message: "Monitoring is not supported for sqlite",
            })
        );
        expect(socket.close).toHaveBeenCalledWith(1008, "Unsupported database type");
    });

    test("sends snapshots over websocket and enforces minimum interval", async () => {
        server.start();
        const wsServer = mockWebSocketServerInstances[0];
        const socket = createMockSocket();

        (dbService.getDatabaseConnection as any).mockResolvedValue({ conn: { id: "conn" }, dbType: DBType.POSTGRES });
        (monitoringService.getSnapshot as any).mockResolvedValue({
            databaseType: DBType.POSTGRES,
            sampledAt: "2026-05-16T00:00:00.000Z",
            health: { ok: true, latencyMs: 11 },
            connections: { active: 1, max: 50, usagePct: 2 },
            throughput: { qps: 5, totalQueries: 100 },
            cacheHitRatio: 98.5,
            activeQueries: [],
        });

        await wsServer.emit("connection", socket, { url: "/monitoring?dbId=db-1&intervalMs=1000" } as any);

        expect(dbService.getDatabaseConnection).toHaveBeenCalledWith("db-1");
        expect(monitoringService.getSnapshot).toHaveBeenCalledWith("db-1", { id: "conn" }, DBType.POSTGRES);
        expect(JSON.parse(socket.send.mock.calls[0][0] as string)).toMatchObject({
            type: "snapshot",
            data: expect.objectContaining({ databaseType: DBType.POSTGRES }),
        });
        expect(setIntervalSpy).toHaveBeenCalledWith(expect.any(Function), 2000);
        expect(clearIntervalSpy).not.toHaveBeenCalled();
    });
});
