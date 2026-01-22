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
      } else if (dbType === "postgres") {
        data = await this.queryExecutor.postgres.fetchTableData(
          conn,
          schemaName,
          tableName,
          limit,
          page
        );
      } else if (dbType === 'mariadb') {
        data = await this.queryExecutor.mariadb.fetchTableData(
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
      } else if (dbType === "postgres") {
        primaryKeys = await this.queryExecutor.postgres.listPrimaryKeys(
          conn,
          schemaName,
          tableName
        );
      } else if (dbType === 'mariadb') {
        primaryKeys = await this.queryExecutor.mariadb.listPrimaryKeys(
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
        this.queryExecutor.mysql.mysqlCache.clearForConnection(conn);
      } else if (dbType === "postgres") {
        result = await this.queryExecutor.postgres.createTable(
          conn,
          schemaName,
          tableName,
          columns,
          foreignKeys
        );
        this.queryExecutor.postgres.postgresCache.clearForConnection(conn);
      } else if (dbType === 'mariadb') {
        result = await this.queryExecutor.mariadb.createTable(
          conn,
          schemaName,
          tableName,
          columns,
          foreignKeys
        );
        this.queryExecutor.mariadb.mariadbCache.clearForConnection(conn);
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
        this.queryExecutor.mysql.mysqlCache.clearForConnection(conn);
      } else if (dbType === "postgres") {
        result = await this.queryExecutor.postgres.createIndexes(
          conn,
          schemaName,
          indexes
        );
        this.queryExecutor.postgres.postgresCache.clearForConnection(conn);
      } else if (dbType === 'mariadb') {
        result = await this.queryExecutor.mariadb.createIndexes(
          conn,
          indexes
        );
        this.queryExecutor.mariadb.mariadbCache.clearForConnection(conn);
      }

      this.rpc.sendResponse(id, { ok: true, result });
    } catch (e: any) {
      this.logger?.error({ e }, "createIndexes failed");
      this.rpc.sendError(id, { code: "IO_ERROR", message: String(e) });
    }
  }

  async handleAlterTable(params: any, id: number | string) {
    try {
      const { dbId, schemaName, tableName, operations } = params || {};
      if (!dbId || !schemaName || !tableName) {
        return this.rpc.sendError(id, {
          code: "BAD_REQUEST",
          message: "Missing dbId, schemaName, or tableName",
        });
      }
      const { conn, dbType } = await this.dbService.getDatabaseConnection(dbId);

      let result;
      if (dbType === "mysql") {
        result = await this.queryExecutor.mysql.alterTable(
          conn,
          tableName,
          operations
        );
        this.queryExecutor.mysql.mysqlCache.clearForConnection(conn);
      } else if (dbType === "postgres") {
        result = await this.queryExecutor.postgres.alterTable(
          conn,
          schemaName,
          tableName,
          operations
        );
        this.queryExecutor.postgres.postgresCache.clearForConnection(conn);
      } else if (dbType === 'mariadb') {
        result = await this.queryExecutor.mariadb.alterTable(
          conn,
          tableName,
          operations
        );
        this.queryExecutor.mariadb.mariadbCache.clearForConnection(conn);
      }

      this.rpc.sendResponse(id, { ok: true, result });
    } catch (e: any) {
      this.logger?.error({ e }, "alterTable failed");
      this.rpc.sendError(id, { code: "IO_ERROR", message: String(e) });
    }
  }

  async handleDropTable(params: any, id: number | string) {
    try {
      const { dbId, schemaName, tableName } = params || {};
      if (!dbId || !schemaName || !tableName) {
        return this.rpc.sendError(id, {
          code: "BAD_REQUEST",
          message: "Missing dbId, schemaName, or tableName",
        });
      }
      const { conn, dbType } = await this.dbService.getDatabaseConnection(dbId);

      let result;
      if (dbType === "mysql") {
        result = await this.queryExecutor.mysql.dropTable(
          conn,
          tableName
        );
        this.queryExecutor.mysql.mysqlCache.clearForConnection(conn);
      } else if (dbType === "postgres") {
        result = await this.queryExecutor.postgres.dropTable(
          conn,
          schemaName,
          tableName
        );
        this.queryExecutor.postgres.postgresCache.clearForConnection(conn);
      } else if (dbType === 'mariadb') {
        result = await this.queryExecutor.mariadb.dropTable(
          conn,
          tableName
        );
        this.queryExecutor.mariadb.mariadbCache.clearForConnection(conn);
      }

      this.rpc.sendResponse(id, { ok: true, result });
    } catch (e: any) {
      this.logger?.error({ e }, "dropTable failed");
      this.rpc.sendError(id, { code: "IO_ERROR", message: String(e) });
    }
  }

  async connectToDatabase(params: any, id: number | string) {
    try {
      const { dbId } = params || {};
      if (!dbId) {
        return this.rpc.sendError(id, {
          code: "BAD_REQUEST",
          message: "Missing dbId",
        });
      }
      let result;
      const { conn, dbType } = await this.dbService.getDatabaseConnection(dbId);
      if (dbType === "mysql") {
        result = await this.queryExecutor.mysql.connectToDatabase(conn, dbId)
      } else if (dbType === "postgres") {
        result = await this.queryExecutor.postgres.connectToDatabase(conn, dbId)
      } else if (dbType === 'mariadb') {
        result = await this.queryExecutor.mariadb.connectToDatabase(conn, dbId)
      }
      this.rpc.sendResponse(id, { ok: true, result });
    } catch (e: any) {
      this.logger?.error({ e }, "connectToDatabase failed");
      this.rpc.sendError(id, { code: "IO_ERROR", message: String(e) });
    }
  }

  async handleInsertRow(params: any, id: number | string) {
    try {
      const { dbId, schemaName, tableName, rowData } = params || {};
      if (!dbId || !schemaName || !tableName || !rowData) {
        return this.rpc.sendError(id, {
          code: "BAD_REQUEST",
          message: "Missing dbId, schemaName, tableName, or rowData",
        });
      }
      const { conn, dbType } = await this.dbService.getDatabaseConnection(dbId);

      let result;
      if (dbType === "mysql") {
        result = await this.queryExecutor.mysql.insertRow(
          conn,
          schemaName,
          tableName,
          rowData
        );
        this.queryExecutor.mysql.mysqlCache.clearForConnection(conn);
      } else if (dbType === "postgres") {
        result = await this.queryExecutor.postgres.insertRow(
          conn,
          schemaName,
          tableName,
          rowData
        );
        this.queryExecutor.postgres.postgresCache.clearForConnection(conn);
      } else if (dbType === 'mariadb') {
        result = await this.queryExecutor.mariadb.insertRow(
          conn,
          schemaName,
          tableName,
          rowData
        );
        this.queryExecutor.mariadb.mariadbCache.clearForConnection(conn);
      }

      this.rpc.sendResponse(id, { ok: true, result });
    } catch (e: any) {
      this.logger?.error({ e }, "insertRow failed");
      this.rpc.sendError(id, { code: "IO_ERROR", message: String(e) });
    }
  }

  async handleUpdateRow(params: any, id: number | string) {
    try {
      const { dbId, schemaName, tableName, primaryKeyColumn, primaryKeyValue, rowData } = params || {};
      if (!dbId || !schemaName || !tableName || !primaryKeyColumn || primaryKeyValue === undefined || !rowData) {
        return this.rpc.sendError(id, {
          code: "BAD_REQUEST",
          message: "Missing dbId, schemaName, tableName, primaryKeyColumn, primaryKeyValue, or rowData",
        });
      }
      const { conn, dbType } = await this.dbService.getDatabaseConnection(dbId);

      let result;
      if (dbType === "mysql") {
        result = await this.queryExecutor.mysql.updateRow(
          conn,
          schemaName,
          tableName,
          primaryKeyColumn,
          primaryKeyValue,
          rowData
        );
        this.queryExecutor.mysql.mysqlCache.clearForConnection(conn);
      } else if (dbType === "postgres") {
        result = await this.queryExecutor.postgres.updateRow(
          conn,
          schemaName,
          tableName,
          primaryKeyColumn,
          primaryKeyValue,
          rowData
        );
        this.queryExecutor.postgres.postgresCache.clearForConnection(conn);
      } else if (dbType === 'mariadb') {
        result = await this.queryExecutor.mariadb.updateRow(
          conn,
          schemaName,
          tableName,
          primaryKeyColumn,
          primaryKeyValue,
          rowData
        );
        this.queryExecutor.mariadb.mariadbCache.clearForConnection(conn);
      }

      this.rpc.sendResponse(id, { ok: true, result });
    } catch (e: any) {
      this.logger?.error({ e }, "updateRow failed");
      this.rpc.sendError(id, { code: "IO_ERROR", message: String(e) });
    }
  }

  async handleDeleteRow(params: any, id: number | string) {
    try {
      const { dbId, schemaName, tableName, primaryKeyColumn, primaryKeyValue } = params || {};
      // Allow empty primaryKeyColumn if primaryKeyValue is an object (composite key)
      if (!dbId || !schemaName || !tableName) {
        return this.rpc.sendError(id, {
          code: "BAD_REQUEST",
          message: "Missing dbId, schemaName, or tableName",
        });
      }
      if (!primaryKeyColumn && (typeof primaryKeyValue !== 'object' || primaryKeyValue === null)) {
        return this.rpc.sendError(id, {
          code: "BAD_REQUEST",
          message: "Either primaryKeyColumn or composite key object is required",
        });
      }
      const { conn, dbType } = await this.dbService.getDatabaseConnection(dbId);

      let result;
      if (dbType === "mysql") {
        result = await this.queryExecutor.mysql.deleteRow(
          conn,
          schemaName,
          tableName,
          primaryKeyColumn,
          primaryKeyValue
        );
        this.queryExecutor.mysql.mysqlCache.clearForConnection(conn);
      } else if (dbType === "postgres") {
        result = await this.queryExecutor.postgres.deleteRow(
          conn,
          schemaName,
          tableName,
          primaryKeyColumn,
          primaryKeyValue
        );
        this.queryExecutor.postgres.postgresCache.clearForConnection(conn);
      } else if (dbType === 'mariadb') {
        result = await this.queryExecutor.mariadb.deleteRow(
          conn,
          schemaName,
          tableName,
          primaryKeyColumn,
          primaryKeyValue
        );
        this.queryExecutor.mariadb.mariadbCache.clearForConnection(conn);
      }

      this.rpc.sendResponse(id, { ok: true, deleted: result });
    } catch (e: any) {
      this.logger?.error({ e }, "deleteRow failed");
      this.rpc.sendError(id, { code: "IO_ERROR", message: String(e) });
    }
  }

  async handleSearchTable(params: any, id: number | string) {
    try {
      const { dbId, schemaName, tableName, searchTerm, column, page, pageSize } = params || {};
      if (!dbId || !schemaName || !tableName || !searchTerm) {
        return this.rpc.sendError(id, {
          code: "BAD_REQUEST",
          message: "Missing dbId, schemaName, tableName, or searchTerm",
        });
      }
      const { conn, dbType } = await this.dbService.getDatabaseConnection(dbId);

      let result;
      if (dbType === "mysql") {
        result = await this.queryExecutor.mysql.searchTable(
          conn,
          schemaName,
          tableName,
          searchTerm,
          column,
          page || 1,
          pageSize || 50
        );
      } else if (dbType === "postgres") {
        result = await this.queryExecutor.postgres.searchTable(
          conn,
          schemaName,
          tableName,
          searchTerm,
          column,
          page || 1,
          pageSize || 50
        );
      } else if (dbType === 'mariadb') {
        result = await this.queryExecutor.mariadb.searchTable(
          conn,
          schemaName,
          tableName,
          searchTerm,
          column,
          page || 1,
          pageSize || 50
        );
      }

      this.rpc.sendResponse(id, { ok: true, ...result });
    } catch (e: any) {
      this.logger?.error({ e }, "searchTable failed");
      this.rpc.sendError(id, { code: "IO_ERROR", message: String(e) });
    }
  }

}