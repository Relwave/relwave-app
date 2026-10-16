import { Client as PgClient } from "pg";
import mysql, { PoolConnection, RowDataPacket } from "mysql2/promise";
import { DBType } from "../types";
import { MySQLConfig } from "../types/mysql";
import { PGConfig } from "../types/postgres";
import { ClickHouseConfig } from "../types/clickhouse";
import { createPoolConfig as createMySQLPoolConfig } from "../connectors/mysql";
import { createPoolConfig as createMariaDBPoolConfig, MariaDBConfig } from "../connectors/mariadb";
import { getClient as getClickHouseClient } from "../connectors/clickhouse";

export interface MonitoringActiveQuery {
  id: string | number;
  user: string;
  query: string;
  state: string;
  durationSeconds: number;
}

export interface MonitoringSnapshot {
  databaseType: DBType;
  sampledAt: string;
  health: {
    ok: boolean;
    latencyMs: number | null;
    message?: string;
  };
  connections: {
    active: number;
    max: number;
    usagePct: number;
  };
  throughput: {
    qps: number;
    totalQueries: number;
  };
  cacheHitRatio: number | null;
  activeQueries: MonitoringActiveQuery[];
}

type CounterSample = {
  total: number;
  sampledAt: number;
};

export class MonitoringService {
  private previousTotals = new Map<string, CounterSample>();

  async getSnapshot(dbId: string, conn: any, dbType: DBType): Promise<MonitoringSnapshot> {
    if (![DBType.POSTGRES, DBType.MYSQL, DBType.MARIADB, DBType.CLICKHOUSE].includes(dbType)) {
      throw new Error(`Monitoring is not supported for ${dbType}`);
    }

    if (dbType === DBType.POSTGRES) {
      return this.getPostgresSnapshot(dbId, conn as PGConfig);
    }

    if (dbType === DBType.MYSQL || dbType === DBType.MARIADB) {
      return this.getMySQLLikeSnapshot(dbId, conn as MySQLConfig, dbType);
    }

    if (dbType === DBType.CLICKHOUSE) {
      return this.getClickHouseSnapshot(dbId, conn as ClickHouseConfig);
    }

    throw new Error(`Monitoring is not supported for ${dbType}`);
  }

  private async getPostgresSnapshot(dbId: string, cfg: PGConfig): Promise<MonitoringSnapshot> {
    const client = new PgClient({
      host: cfg.host,
      port: cfg.port,
      user: cfg.user,
      password: cfg.password || undefined,
      database: cfg.database || undefined,
      ssl: cfg.ssl
        ? { rejectUnauthorized: cfg.sslmode === "verify-full" || cfg.sslmode === "verify-ca" }
        : undefined,
    });

    const startedAt = Date.now();

    try {
      await client.connect();
      await client.query("SELECT 1;");
      const latencyMs = Date.now() - startedAt;

      const [connectionsResult, transactionResult, cacheResult, activeQueriesResult] =
        await Promise.all([
          client.query(`
          SELECT
            (SELECT count(*) FROM pg_stat_activity) AS active_connections,
            (SELECT setting::int FROM pg_settings WHERE name = 'max_connections') AS max_connections;
        `),
          client.query(
            `
          SELECT COALESCE(xact_commit + xact_rollback, 0) AS total_transactions
          FROM pg_stat_database
          WHERE datname = $1;
        `,
            [cfg.database],
          ),
          client.query(
            `
          SELECT round(100 * blks_hit / (blks_read + blks_hit + 1), 2) AS cache_hit_ratio
          FROM pg_stat_database
          WHERE datname = $1;
        `,
            [cfg.database],
          ),
          client.query(`
          SELECT
            pid,
            EXTRACT(EPOCH FROM (clock_timestamp() - query_start)) AS duration_seconds,
            usename,
            query,
            state
          FROM pg_stat_activity
          WHERE state != 'idle'
          ORDER BY query_start NULLS LAST
          LIMIT 25;
        `),
        ]);

      const active = Number(connectionsResult.rows[0]?.active_connections ?? 0);
      const max = Number(connectionsResult.rows[0]?.max_connections ?? 0);
      const totalQueries = Number(transactionResult.rows[0]?.total_transactions ?? 0);
      const cacheHitRatio = Number(cacheResult.rows[0]?.cache_hit_ratio ?? 0);

      return {
        databaseType: DBType.POSTGRES,
        sampledAt: new Date().toISOString(),
        health: { ok: true, latencyMs },
        connections: this.mapConnections(active, max),
        throughput: {
          qps: this.calculateRate(dbId, totalQueries),
          totalQueries,
        },
        cacheHitRatio,
        activeQueries: activeQueriesResult.rows.map((row: any) => ({
          id: row.pid,
          user: row.usename || "",
          query: row.query || "",
          state: row.state || "",
          durationSeconds: Number(row.duration_seconds ?? 0),
        })),
      };
    } catch (error: any) {
      return this.emptySnapshot(DBType.POSTGRES, error?.message || String(error));
    } finally {
      await client.end().catch(() => undefined);
    }
  }

  private async getMySQLLikeSnapshot(
    dbId: string,
    cfg: MySQLConfig,
    dbType: DBType.MYSQL | DBType.MARIADB,
  ): Promise<MonitoringSnapshot> {
    const poolConfig =
      dbType === DBType.MARIADB
        ? createMariaDBPoolConfig(cfg as MariaDBConfig)
        : createMySQLPoolConfig(cfg);
    const pool = mysql.createPool(poolConfig);
    let connection: PoolConnection | null = null;
    const startedAt = Date.now();

    try {
      connection = await pool.getConnection();
      await connection.query("SELECT 1;");
      const latencyMs = Date.now() - startedAt;

      const [
        activeConnectionsRows,
        maxConnectionsRows,
        queryCounterRows,
        bufferRequestRows,
        bufferReadRows,
        activeQueriesRows,
      ] = await Promise.all([
        connection.query<RowDataPacket[]>("SHOW GLOBAL STATUS LIKE 'Threads_connected';"),
        connection.query<RowDataPacket[]>("SHOW VARIABLES LIKE 'max_connections';"),
        connection.query<RowDataPacket[]>("SHOW GLOBAL STATUS LIKE 'Queries';"),
        connection.query<RowDataPacket[]>(
          "SHOW GLOBAL STATUS LIKE 'Innodb_buffer_pool_read_requests';",
        ),
        connection.query<RowDataPacket[]>("SHOW GLOBAL STATUS LIKE 'Innodb_buffer_pool_reads';"),
        connection.query<RowDataPacket[]>(`
          SELECT id, time, user, info AS query, state
          FROM information_schema.processlist
          WHERE command != 'Sleep'
          ORDER BY time DESC
          LIMIT 25;
        `),
      ]);

      const active = this.readMySQLValue(activeConnectionsRows[0]);
      const max = this.readMySQLValue(maxConnectionsRows[0]);
      const totalQueries = this.readMySQLValue(queryCounterRows[0]);
      const bufferRequests = this.readMySQLValue(bufferRequestRows[0]);
      const bufferReads = this.readMySQLValue(bufferReadRows[0]);
      const cacheHitRatio =
        bufferRequests > 0
          ? Math.max(0, Math.min(100, (1 - bufferReads / bufferRequests) * 100))
          : null;

      return {
        databaseType: dbType,
        sampledAt: new Date().toISOString(),
        health: { ok: true, latencyMs },
        connections: this.mapConnections(active, max),
        throughput: {
          qps: this.calculateRate(dbId, totalQueries),
          totalQueries,
        },
        cacheHitRatio: cacheHitRatio === null ? null : Number(cacheHitRatio.toFixed(2)),
        activeQueries: activeQueriesRows[0].map((row: any) => ({
          id: row.id,
          user: row.user || "",
          query: row.query || "",
          state: row.state || "",
          durationSeconds: Number(row.time ?? 0),
        })),
      };
    } catch (error: any) {
      return this.emptySnapshot(dbType, error?.message || String(error));
    } finally {
      if (connection) connection.release();
      await pool.end().catch(() => undefined);
    }
  }

  private async getClickHouseSnapshot(
    dbId: string,
    cfg: ClickHouseConfig,
  ): Promise<MonitoringSnapshot> {
    const startedAt = Date.now();
    try {
      const client = getClickHouseClient(cfg);
      await client.query({ query: "SELECT 1;", format: "JSONEachRow" });
      const latencyMs = Date.now() - startedAt;

      const [metricsSettled, settingsSettled, eventsSettled, processesSettled] =
        await Promise.allSettled([
          client
            .query({
              query:
                "SELECT metric, toInt64(value) AS value FROM system.metrics WHERE metric IN ('TCPConnection', 'HTTPConnection', 'Query');",
              format: "JSONEachRow",
            })
            .then(
              async (res) =>
                (await res.json()) as Array<{ metric: string; value: string | number }>,
            ),

          client
            .query({
              query:
                "SELECT value FROM system.settings WHERE name = 'max_concurrent_queries' LIMIT 1;",
              format: "JSONEachRow",
            })
            .then(async (res) => (await res.json()) as Array<{ value: string | number }>),

          client
            .query({
              query:
                "SELECT event, toUInt64(value) AS value FROM system.events WHERE event IN ('Query', 'MarkCacheHits', 'MarkCacheMisses');",
              format: "JSONEachRow",
            })
            .then(
              async (res) => (await res.json()) as Array<{ event: string; value: string | number }>,
            ),

          client
            .query({
              query: `
              SELECT
                query_id AS id,
                user,
                query,
                'running' AS state,
                round(elapsed, 2) AS durationSeconds
              FROM system.processes
              WHERE is_cancelled = 0 AND query NOT LIKE '%system.processes%'
              ORDER BY elapsed DESC
              LIMIT 25;
            `,
              format: "JSONEachRow",
            })
            .then(
              async (res) =>
                (await res.json()) as Array<{
                  id: string;
                  user: string;
                  query: string;
                  state: string;
                  durationSeconds: number;
                }>,
            ),
        ]);

      let active = 0;
      if (metricsSettled.status === "fulfilled" && Array.isArray(metricsSettled.value)) {
        for (const row of metricsSettled.value) {
          if (row.metric === "TCPConnection" || row.metric === "HTTPConnection") {
            active += Number(row.value ?? 0);
          }
        }
      }
      active = Math.max(1, active);

      let max = 100;
      if (
        settingsSettled.status === "fulfilled" &&
        Array.isArray(settingsSettled.value) &&
        settingsSettled.value.length > 0
      ) {
        const parsedMax = Number(settingsSettled.value[0]?.value);
        if (Number.isFinite(parsedMax) && parsedMax > 0) {
          max = parsedMax;
        }
      }

      let totalQueries = 0;
      let markCacheHits = 0;
      let markCacheMisses = 0;
      let hasMarkCache = false;

      if (eventsSettled.status === "fulfilled" && Array.isArray(eventsSettled.value)) {
        for (const row of eventsSettled.value) {
          if (row.event === "Query") {
            totalQueries = Number(row.value ?? 0);
          } else if (row.event === "MarkCacheHits") {
            markCacheHits = Number(row.value ?? 0);
            hasMarkCache = true;
          } else if (row.event === "MarkCacheMisses") {
            markCacheMisses = Number(row.value ?? 0);
            hasMarkCache = true;
          }
        }
      }

      const totalCacheRequests = markCacheHits + markCacheMisses;
      const cacheHitRatio =
        hasMarkCache && totalCacheRequests > 0
          ? Number(((markCacheHits / totalCacheRequests) * 100).toFixed(2))
          : null;

      const activeQueries: MonitoringActiveQuery[] =
        processesSettled.status === "fulfilled" && Array.isArray(processesSettled.value)
          ? processesSettled.value.map((row) => ({
              id: String(row.id ?? ""),
              user: String(row.user ?? ""),
              query: String(row.query ?? ""),
              state: String(row.state ?? "running"),
              durationSeconds: Number(row.durationSeconds ?? 0),
            }))
          : [];

      return {
        databaseType: DBType.CLICKHOUSE,
        sampledAt: new Date().toISOString(),
        health: { ok: true, latencyMs },
        connections: this.mapConnections(active, max),
        throughput: {
          qps: this.calculateRate(dbId, totalQueries),
          totalQueries,
        },
        cacheHitRatio,
        activeQueries,
      };
    } catch (error: any) {
      return this.emptySnapshot(DBType.CLICKHOUSE, error?.message || String(error));
    }
  }

  private mapConnections(active: number, max: number) {
    return {
      active,
      max,
      usagePct: max > 0 ? Number(((active / max) * 100).toFixed(2)) : 0,
    };
  }

  private calculateRate(dbId: string, total: number): number {
    const now = Date.now();
    const previous = this.previousTotals.get(dbId);
    this.previousTotals.set(dbId, { total, sampledAt: now });

    if (!previous || total < previous.total) return 0;

    const elapsedSeconds = (now - previous.sampledAt) / 1000;
    if (elapsedSeconds <= 0) return 0;

    return Number(((total - previous.total) / elapsedSeconds).toFixed(2));
  }

  private readMySQLValue(rows: RowDataPacket[] | undefined): number {
    const row = rows?.[0];
    return Number(row?.Value ?? row?.value ?? row?.VARIABLE_VALUE ?? 0);
  }

  private emptySnapshot(databaseType: DBType, message: string): MonitoringSnapshot {
    return {
      databaseType,
      sampledAt: new Date().toISOString(),
      health: { ok: false, latencyMs: null, message },
      connections: { active: 0, max: 0, usagePct: 0 },
      throughput: { qps: 0, totalQueries: 0 },
      cacheHitRatio: null,
      activeQueries: [],
    };
  }
}
