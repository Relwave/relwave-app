// ----------------------------
// handlers/statsHandlers.ts
// ----------------------------

import { Rpc, DBType } from "../types";
import { DatabaseService } from "../services/databaseService";
import { QueryExecutor } from "../services/queryExecutor";

const MB_TO_BYTES = 1024 * 1024;

export class StatsHandlers {
  constructor(
    private rpc: Rpc,
    private logger: any,
    private dbService: DatabaseService,
    private queryExecutor: QueryExecutor
  ) { }

  /**
   * Handle db.getStats - Get statistics for a specific database
   */
  async handleGetStats(params: any, id: number | string): Promise<void> {
    try {
      const { id: dbId } = params || {};
      if (!dbId) {
        return this.rpc.sendError(id, {
          code: "BAD_REQUEST",
          message: "Missing id",
        });
      }

      const { conn, dbType } =
        await this.dbService.getDatabaseConnection(dbId);

      const rawStats = await this.queryExecutor.getStats(conn, dbType);

      const stats = {
        tables: Number(rawStats.total_tables) || 0,
        rows: Number(rawStats.total_rows) || 0,
        sizeBytes: Math.round((Number(rawStats.total_db_size_mb) || 0) * MB_TO_BYTES),
      };

      this.rpc.sendResponse(id, {
        ok: true,
        data: stats,
      });
    } catch (e: any) {
      this.logger?.error({ e }, "db.getStats failed");
      this.rpc.sendError(id, { code: "IO_ERROR", message: String(e) });
    }
  }

  /**
   * Handle db.getTotalStats - Get aggregated statistics across all databases
   */
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
          const { conn, dbType } = await this.dbService.getDatabaseConnection(
            db.id
          );

          // Test connection first
          const connectionTest = await this.queryExecutor.testConnection(
            conn,
            dbType
          );

          if (!connectionTest.ok) {
            this.logger?.warn(
              `Skipping stats for DB ${db.name} (${db.id}) due to connection test failure`
            );
            continue;
          }

          // Get stats
          const stats = await this.queryExecutor.getStats(conn, dbType);

          // Parse and accumulate stats
          const dbStats = this.parseStats(stats, dbType);
          totalStats.tables += dbStats.tables;
          totalStats.rows += dbStats.rows;
          totalStats.sizeBytes += dbStats.sizeBytes;
        } catch (dbError: any) {
          this.logger?.warn(
            { dbError, dbId: db.id, dbName: db.name },
            `Failed to get stats for database ${db.name}`
          );
          // Continue with other databases
        }
      }

      this.rpc.sendResponse(id, { ok: true, data: totalStats });
    } catch (e: any) {
      this.logger?.error({ e }, "db.getTotalStats failed");
      this.rpc.sendError(id, { code: "IO_ERROR", message: String(e) });
    }
  }

  /**
   * Parse database statistics from connector response
   */
  private parseStats(
    stats: any,
    dbType: DBType
  ): { tables: number; rows: number; sizeBytes: number } {
    if (dbType === DBType.MYSQL) {
      const tables = Number(stats.total_tables) || 0;
      const rows = Number(stats.total_rows) || 0;
      const sizeMB = Number(stats.total_db_size_mb) || 0;
      const sizeBytes = sizeMB * MB_TO_BYTES;

      return { tables, rows, sizeBytes };
    } else if (dbType === DBType.POSTGRES) {
      const tables = Number(stats.total_tables) || 0;
      const rows = Number(stats.total_rows) || 0;
      const sizeMB = Number(stats.total_db_size_mb) || 0;
      const sizeBytes = sizeMB * MB_TO_BYTES;

      return { tables, rows, sizeBytes };
    } else if (dbType === DBType.MARIADB) {
      const tables = Number(stats.total_tables) || 0;
      const rows = Number(stats.total_rows) || 0;
      const sizeMB = Number(stats.total_db_size_mb) || 0;
      const sizeBytes = sizeMB * MB_TO_BYTES;

      return { tables, rows, sizeBytes };
    }
  }
}

// ----------------------------
// __tests__/handlers/statsHandlers.test.ts
// ----------------------------
/*
import { StatsHandlers } from '../../handlers/statsHandlers';
import { Rpc, DBType } from '../../types';

describe('StatsHandlers', () => {
  let handlers: StatsHandlers;
  let mockRpc: Rpc;
  let mockLogger: any;
  let mockDbService: any;
  let mockQueryExecutor: any;

  beforeEach(() => {
    mockRpc = {
      sendResponse: jest.fn(),
      sendError: jest.fn(),
      sendNotification: jest.fn(),
    };

    mockLogger = {
      info: jest.fn(),
      warn: jest.fn(),
      error: jest.fn(),
    };

    mockDbService = {
      getDatabaseConnection: jest.fn(),
      listAllDatabases: jest.fn(),
    };

    mockQueryExecutor = {
      getStats: jest.fn(),
      testConnection: jest.fn(),
    };

    handlers = new StatsHandlers(mockRpc, mockLogger, mockDbService, mockQueryExecutor);
  });

  describe('handleGetStats', () => {
    it('should return stats for a database', async () => {
      const db = { id: '1', name: 'test' };
      const conn = { host: 'localhost' };
      const stats = { total_tables: 5, total_rows: 1000, total_db_size_mb: 10 };

      mockDbService.getDatabaseConnection.mockResolvedValue({
        db,
        conn,
        dbType: DBType.POSTGRES,
      });
      mockQueryExecutor.getStats.mockResolvedValue(stats);

      await handlers.handleGetStats({ id: '1' }, 1);

      expect(mockRpc.sendResponse).toHaveBeenCalledWith(1, {
        ok: true,
        data: { stats, db },
      });
    });

    it('should return error if id is missing', async () => {
      await handlers.handleGetStats({}, 1);

      expect(mockRpc.sendError).toHaveBeenCalledWith(1, {
        code: 'BAD_REQUEST',
        message: 'Missing id',
      });
    });
  });

  describe('handleGetTotalStats', () => {
    it('should return aggregated stats for all databases', async () => {
      const dbs = [
        { id: '1', name: 'db1' },
        { id: '2', name: 'db2' },
      ];
      mockDbService.listAllDatabases.mockResolvedValue(dbs);

      mockDbService.getDatabaseConnection
        .mockResolvedValueOnce({
          conn: {},
          dbType: DBType.POSTGRES,
        })
        .mockResolvedValueOnce({
          conn: {},
          dbType: DBType.MYSQL,
        });

      mockQueryExecutor.testConnection.mockResolvedValue({ ok: true });
      mockQueryExecutor.getStats
        .mockResolvedValueOnce({
          total_tables: 5,
          total_rows: 1000,
          total_db_size_mb: 10,
        })
        .mockResolvedValueOnce({
          total_tables: 3,
          total_rows: 500,
          total_db_size_mb: 5,
        });

      await handlers.handleGetTotalStats({}, 1);

      expect(mockRpc.sendResponse).toHaveBeenCalledWith(1, {
        ok: true,
        data: {
          tables: 8,
          rows: 1500,
          sizeBytes: 15 * 1024 * 1024,
        },
      });
    });

    it('should return zero stats when no databases', async () => {
      mockDbService.listAllDatabases.mockResolvedValue([]);

      await handlers.handleGetTotalStats({}, 1);

      expect(mockRpc.sendResponse).toHaveBeenCalledWith(1, {
        ok: true,
        data: { tables: 0, rows: 0, sizeBytes: 0 },
      });
    });

    it('should skip databases with failed connections', async () => {
      const dbs = [
        { id: '1', name: 'db1' },
        { id: '2', name: 'db2' },
      ];
      mockDbService.listAllDatabases.mockResolvedValue(dbs);

      mockDbService.getDatabaseConnection
        .mockResolvedValueOnce({ conn: {}, dbType: DBType.POSTGRES })
        .mockResolvedValueOnce({ conn: {}, dbType: DBType.MYSQL });

      mockQueryExecutor.testConnection
        .mockResolvedValueOnce({ ok: true })
        .mockResolvedValueOnce({ ok: false });

      mockQueryExecutor.getStats.mockResolvedValueOnce({
        total_tables: 5,
        total_rows: 1000,
        total_db_size_mb: 10,
      });

      await handlers.handleGetTotalStats({}, 1);

      expect(mockLogger.warn).toHaveBeenCalled();
      expect(mockRpc.sendResponse).toHaveBeenCalledWith(1, {
        ok: true,
        data: {
          tables: 5,
          rows: 1000,
          sizeBytes: 10 * 1024 * 1024,
        },
      });
    });
  });
});
*/