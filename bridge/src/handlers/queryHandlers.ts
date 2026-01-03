import { Rpc } from "../types";
import { DatabaseService } from "../services/databaseService";
import { QueryExecutor } from "../services/queryExecutor";
import { SessionManager } from "../sessionManager";

export class QueryHandlers {
  constructor(
    private rpc: Rpc,
    private logger: any,
    private sessions: SessionManager,
    private dbService: DatabaseService,
    private queryExecutor: QueryExecutor
  ) { }

  async handleQueryRun(params: any, id: number | string) {
    const { sessionId, dbId, sql, batchSize = 200 } = params || {};

    if (!sessionId || !dbId || !sql) {
      return this.rpc.sendError(id, {
        code: "BAD_REQUEST",
        message: "Missing sessionId, dbId, or sql",
      });
    }

    try {
      const { conn, dbType } = await this.dbService.getDatabaseConnection(dbId);

      this.rpc.sendNotification?.("query.started", {
        sessionId,
        info: { sqlPreview: sql.slice(0, 200), dbId, dbType },
      });

      let cancelled = false;
      const cancelState: { fn: (() => Promise<void>) | null } = { fn: null };

      const { runner, totalRows, start } =
        await this.queryExecutor.executeQuery(
          { sessionId, dbId, sql, batchSize },
          conn,
          dbType,
          this.rpc,
          (cancelFn) => {
            cancelState.fn = cancelFn;
          }
        );

      this.sessions.registerCancel(sessionId, async () => {
        cancelled = true;
        if (cancelState.fn) await cancelState.fn();
      });

      // Run in background
      (async () => {
        try {
          await runner.promise;
        } catch (err: any) {
          if (String(err).toLowerCase().includes("cancel") || cancelled) {
            this.rpc.sendNotification?.("query.done", {
              sessionId,
              rows: totalRows,
              timeMs: Date.now() - start,
              status: "cancelled",
            });
          } else {
            this.logger.error({ err, sessionId }, "Query error");
            this.rpc.sendNotification?.("query.error", {
              sessionId,
              error: { message: String(err) },
            });
          }
        } finally {
          this.sessions.remove(sessionId);
          cancelState.fn = null;
        }
      })();

      this.rpc.sendResponse(id, { ok: true });
    } catch (initError: any) {
      this.sessions.remove(sessionId);
      this.logger.error({ initError }, "Query setup failed");
      this.rpc.sendError(id, {
        code: "SETUP_ERROR",
        message: String(initError),
      });
    }
  }

  async handleFetchTableData(params: any, id: number | string) {
    try {
      const { dbId, schemaName, tableName, limit, page } = params || {};

      if (!dbId || !tableName || !schemaName) {
        return this.rpc.sendError(id, {
          code: "BAD_REQUEST",
          message: "Missing dbId, schemaName, or tableName",
        });
      }

      const { conn, dbType } = await this.dbService.getDatabaseConnection(dbId);

      let data;
      if (dbType === "mysql") {
        data = await this.queryExecutor.mysql.fetchTableData(
          conn,
          schemaName,
          tableName,
          limit,
          page
        );
      } else {
        data = await this.queryExecutor.postgres.fetchTableData(
          conn,
          schemaName,
          tableName,
          limit,
          page
        );
      }

      this.rpc.sendResponse(id, { ok: true, data });
    } catch (e: any) {
      this.logger?.error({ e }, "fetchTableData failed");
      this.rpc.sendError(id, { code: "IO_ERROR", message: String(e) });
    }
  };

  async handleFetchPrimaryKeys(params: any, id: number | string) {
    try {
      const { dbId, schemaName, tableName } = params || {};
      if (!dbId || !tableName || !schemaName) {
        return this.rpc.sendError(id, {
          code: "BAD_REQUEST",
          message: "Missing dbId, schemaName, or tableName",
        });
      }
      const { conn, dbType } = await this.dbService.getDatabaseConnection(dbId);

      let primaryKeys;
      if (dbType === "mysql") {
        primaryKeys = await this.queryExecutor.mysql.listPrimaryKeys(
          conn,
          schemaName,
          tableName
        );
      } else {
        primaryKeys = await this.queryExecutor.postgres.listPrimaryKeys(
          conn,
          schemaName,
          tableName
        );
      }

      this.rpc.sendResponse(id, { ok: true, primaryKeys });
    } catch (e: any) {
      this.logger?.error({ e }, "fetchPrimaryKeys failed");
      this.rpc.sendError(id, { code: "IO_ERROR", message: String(e) });
    }
  }

  async handleCreateTable(params: any, id: number | string) {
    try {
      const { dbId, schemaName, tableName, columns, foreignKeys = [] } = params || {};
      if (!dbId || !tableName || !schemaName) {
        return this.rpc.sendError(id, {
          code: "BAD_REQUEST",
          message: "Missing dbId, schemaName, or tableName",
        });
      }
      const { conn, dbType } = await this.dbService.getDatabaseConnection(dbId);

      let result;
      if (dbType === "mysql") {
        result = await this.queryExecutor.mysql.createTable(
          conn,
          schemaName,
          tableName,
          columns,
          foreignKeys
        );
        // Clear MySQL cache after table creation
        this.queryExecutor.mysql.mysqlCache.clearForConnection(conn);
      } else {
        result = await this.queryExecutor.postgres.createTable(
          conn,
          schemaName,
          tableName,
          columns,
          foreignKeys
        );
        // Clear PostgreSQL cache after table creation
        this.queryExecutor.postgres.postgresCache.clearForConnection(conn);
      }

      this.rpc.sendResponse(id, { ok: true, result });
    } catch (e: any) {
      this.logger?.error({ e }, "createTable failed");
      this.rpc.sendError(id, { code: "IO_ERROR", message: String(e) });
    }
  }

  async handleCreateIndexes(params: any, id: number | string) {
    try {
      const { dbId, schemaName, indexes } = params || {};
      if (!dbId || !schemaName) {
        return this.rpc.sendError(id, {
          code: "BAD_REQUEST",
          message: "Missing dbId, schemaName, or tableName",
        });
      }
      const { conn, dbType } = await this.dbService.getDatabaseConnection(dbId);

      let result;
      if (dbType === "mysql") {
        result = await this.queryExecutor.mysql.createIndexes(
          conn,
          indexes
        );
        // Clear MySQL cache after table creation
        this.queryExecutor.mysql.mysqlCache.clearForConnection(conn);
      } else {
        result = await this.queryExecutor.postgres.createIndexes(
          conn,
          schemaName,
          indexes
        );
        // Clear PostgreSQL cache after table creation
        this.queryExecutor.postgres.postgresCache.clearForConnection(conn);
      }

      this.rpc.sendResponse(id, { ok: true, result });
    } catch (e: any) {
      this.logger?.error({ e }, "createIndexes failed");
      this.rpc.sendError(id, { code: "IO_ERROR", message: String(e) });
    }
  }

}