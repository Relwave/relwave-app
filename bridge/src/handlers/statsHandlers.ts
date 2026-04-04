// ----------------------------
// handlers/statsHandlers.ts
// ----------------------------

import { Rpc } from "../types";
import { DatabaseService } from "../services/databaseService";
import { QueryExecutor } from "../services/queryExecutor";
import { Logger } from "pino";

const MB_TO_BYTES = 1024 * 1024;

/** Parse any connector's getDBStats result into the canonical shape */
function parseStats(stats: any): { tables: number; rows: number; sizeBytes: number } {
  return {
    tables: Number(stats.total_tables) || 0,
    rows: Number(stats.total_rows) || 0,
    sizeBytes: Math.round((Number(stats.total_db_size_mb) || 0) * MB_TO_BYTES),
  };
}

export class StatsHandlers {
  constructor(
    private rpc: Rpc,
    private logger: Logger,
    private dbService: DatabaseService,
    private queryExecutor: QueryExecutor
  ) {}

  /** Handle db.getStats — get statistics for a specific database */
  async handleGetStats(params: any, id: number | string): Promise<void> {
    try {
      const { id: dbId } = params || {};
      if (!dbId) {
        return this.rpc.sendError(id, { code: "BAD_REQUEST", message: "Missing id" });
      }

      const { conn, dbType } = await this.dbService.getDatabaseConnection(dbId);
      const rawStats = await this.queryExecutor.getStats(conn, dbType);
      this.rpc.sendResponse(id, { ok: true, data: parseStats(rawStats) });
    } catch (e: any) {
      this.logger.error({ e }, "db.getStats failed");
      this.rpc.sendError(id, { code: "IO_ERROR", message: String(e) });
    }
  }

  /** Handle db.getTotalStats — aggregated statistics across all databases */
  async handleGetTotalStats(params: any, id: number | string): Promise<void> {
    try {
      const dbs = await this.dbService.listDatabases();

      if (dbs.length === 0) {
        return this.rpc.sendResponse(id, {
          ok: true,
          data: { tables: 0, rows: 0, sizeBytes: 0 },
        });
      }

      let totalStats = { tables: 0, rows: 0, sizeBytes: 0 };

      for (const db of dbs) {
        try {
          const { conn, dbType } = await this.dbService.getDatabaseConnection(db.id);

          const connectionTest = await this.queryExecutor.testConnection(conn, dbType);
          if (!(connectionTest as any)?.ok) {
            this.logger.warn(
              `Skipping stats for DB ${db.name} (${db.id}) — connection test failed`
            );
            continue;
          }

          const stats = parseStats(await this.queryExecutor.getStats(conn, dbType));
          totalStats.tables += stats.tables;
          totalStats.rows += stats.rows;
          totalStats.sizeBytes += stats.sizeBytes;
        } catch (dbError: any) {
          this.logger.warn(
            { dbError, dbId: db.id, dbName: db.name },
            `Failed to get stats for database ${db.name}`
          );
        }
      }

      this.rpc.sendResponse(id, { ok: true, data: totalStats });
    } catch (e: any) {
      this.logger.error({ e }, "db.getTotalStats failed");
      this.rpc.sendError(id, { code: "IO_ERROR", message: String(e) });
    }
  }
}