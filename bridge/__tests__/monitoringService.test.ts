import { describe, expect, test, jest, beforeEach } from "@jest/globals";
import { DBType } from "../src/types";
import { ClickHouseConfig } from "../src/types/clickhouse";

const mockClickHouseClient = {
  query: jest.fn() as any,
};

jest.mock("../src/connectors/clickhouse", () => ({
  getClient: jest.fn(() => mockClickHouseClient),
}));

import { MonitoringService } from "../src/services/monitoringService";

describe("MonitoringService", () => {
  let service: MonitoringService;

  beforeEach(() => {
    jest.clearAllMocks();
    service = new MonitoringService();
  });

  test("throws for unsupported database types like sqlite or duckdb", async () => {
    await expect(service.getSnapshot("db-1", {}, DBType.SQLITE)).rejects.toThrow(
      "Monitoring is not supported for sqlite",
    );
    await expect(service.getSnapshot("db-2", {}, DBType.DUCKDB)).rejects.toThrow(
      "Monitoring is not supported for duckdb",
    );
  });

  test("generates complete ClickHouse monitoring snapshot on success", async () => {
    const config: ClickHouseConfig = {
      host: "localhost",
      port: 8123,
      user: "default",
      database: "default",
    };

    mockClickHouseClient.query.mockImplementation((params: any) => {
      const q = params.query;
      if (q.includes("SELECT 1;")) {
        return Promise.resolve({
          json: async () => [{ 1: 1 }],
        });
      }
      if (q.includes("FROM system.metrics")) {
        return Promise.resolve({
          json: async () => [
            { metric: "TCPConnection", value: 3 },
            { metric: "HTTPConnection", value: 2 },
            { metric: "Query", value: 1 },
          ],
        });
      }
      if (q.includes("FROM system.settings")) {
        return Promise.resolve({
          json: async () => [{ value: "200" }],
        });
      }
      if (q.includes("FROM system.events")) {
        return Promise.resolve({
          json: async () => [
            { event: "Query", value: 1000 },
            { event: "MarkCacheHits", value: 950 },
            { event: "MarkCacheMisses", value: 50 },
          ],
        });
      }
      if (q.includes("FROM system.processes")) {
        return Promise.resolve({
          json: async () => [
            {
              id: "query-abc",
              user: "analyst",
              query: "SELECT count() FROM logs",
              state: "running",
              durationSeconds: 3.45,
            },
          ],
        });
      }
      return Promise.resolve({ json: async () => [] });
    });

    const snapshot = await service.getSnapshot("ch-1", config, DBType.CLICKHOUSE);

    expect(snapshot.databaseType).toBe(DBType.CLICKHOUSE);
    expect(snapshot.health.ok).toBe(true);
    expect(typeof snapshot.health.latencyMs).toBe("number");
    expect(snapshot.connections).toEqual({
      active: 5,
      max: 200,
      usagePct: 2.5,
    });
    expect(snapshot.throughput.totalQueries).toBe(1000);
    expect(snapshot.throughput.qps).toBe(0); // first sample
    expect(snapshot.cacheHitRatio).toBe(95); // 950 / (950 + 50) * 100
    expect(snapshot.activeQueries).toEqual([
      {
        id: "query-abc",
        user: "analyst",
        query: "SELECT count() FROM logs",
        state: "running",
        durationSeconds: 3.45,
      },
    ]);
  });

  test("calculates QPS correctly on subsequent snapshot calls", async () => {
    const config: ClickHouseConfig = {
      host: "localhost",
      port: 8123,
    };

    mockClickHouseClient.query.mockImplementation((params: any) => {
      const q = params.query;
      if (q.includes("FROM system.events")) {
        return Promise.resolve({
          json: async () => [{ event: "Query", value: 1000 }],
        });
      }
      return Promise.resolve({ json: async () => [] });
    });

    await service.getSnapshot("ch-qps", config, DBType.CLICKHOUSE);

    // Mock next sample with 100 additional queries
    mockClickHouseClient.query.mockImplementation((params: any) => {
      const q = params.query;
      if (q.includes("FROM system.events")) {
        return Promise.resolve({
          json: async () => [{ event: "Query", value: 1100 }],
        });
      }
      return Promise.resolve({ json: async () => [] });
    });

    const secondSnapshot = await service.getSnapshot("ch-qps", config, DBType.CLICKHOUSE);
    expect(secondSnapshot.throughput.totalQueries).toBe(1100);
    expect(secondSnapshot.throughput.qps).toBeGreaterThanOrEqual(0);
  });

  test("handles partial metric query failures gracefully with defaults", async () => {
    const config: ClickHouseConfig = { host: "localhost" };

    mockClickHouseClient.query.mockImplementation((params: any) => {
      const q = params.query;
      if (q.includes("SELECT 1;")) {
        return Promise.resolve({ json: async () => [{ 1: 1 }] });
      }
      // Settings and processes fail (e.g. permission denied)
      if (q.includes("FROM system.settings") || q.includes("FROM system.processes")) {
        return Promise.reject(new Error("Permission denied"));
      }
      if (q.includes("FROM system.metrics")) {
        return Promise.resolve({
          json: async () => [{ metric: "TCPConnection", value: 1 }],
        });
      }
      if (q.includes("FROM system.events")) {
        return Promise.resolve({
          json: async () => [{ event: "Query", value: 50 }],
        });
      }
      return Promise.resolve({ json: async () => [] });
    });

    const snapshot = await service.getSnapshot("ch-partial", config, DBType.CLICKHOUSE);

    expect(snapshot.health.ok).toBe(true);
    expect(snapshot.connections.active).toBe(1);
    expect(snapshot.connections.max).toBe(100); // fallback default
    expect(snapshot.activeQueries).toEqual([]); // fallback gracefully
    expect(snapshot.cacheHitRatio).toBeNull();
  });

  test("returns empty snapshot when ClickHouse connection fails", async () => {
    const config: ClickHouseConfig = { host: "unreachable" };

    mockClickHouseClient.query.mockRejectedValue(new Error("Connection refused") as any);

    const snapshot = await service.getSnapshot("ch-down", config, DBType.CLICKHOUSE);

    expect(snapshot.databaseType).toBe(DBType.CLICKHOUSE);
    expect(snapshot.health.ok).toBe(false);
    expect(snapshot.health.latencyMs).toBeNull();
    expect(snapshot.health.message).toContain("Connection refused");
    expect(snapshot.connections).toEqual({ active: 0, max: 0, usagePct: 0 });
    expect(snapshot.throughput).toEqual({ qps: 0, totalQueries: 0 });
    expect(snapshot.activeQueries).toEqual([]);
  });
});
