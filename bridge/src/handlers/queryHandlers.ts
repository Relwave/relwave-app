import { Rpc } from "../types";
import { DatabaseService } from "../services/databaseService";
import { QueryExecutor } from "../services/queryExecutor";
import { SessionManager } from "../sessionManager";
import { getConnector } from "../services/connectorRegistry";
import { MongoApiError, mapMongoError } from "../connectors/mongo";
import { Logger } from "pino";

export class QueryHandlers {
  constructor(
    private rpc: Rpc,
    private logger: Logger,
    private sessions: SessionManager,
    private dbService: DatabaseService,
    private queryExecutor: QueryExecutor,
  ) {}

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

      const { runner, totalRows, start } = await this.queryExecutor.executeQuery(
        { sessionId, dbId, sql, batchSize },
        conn,
        dbType,
        this.rpc,
        (cancelFn) => {
          cancelState.fn = cancelFn;
        },
      );

      this.sessions.registerCancel(sessionId, async () => {
        cancelled = true;
        if (cancelState.fn) await cancelState.fn();
      });

      // Run streaming in background
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
      this.rpc.sendError(id, { code: "SETUP_ERROR", message: String(initError) });
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
      const data = await (getConnector(dbType) as any).fetchTableData(
        conn,
        schemaName,
        tableName,
        limit,
        page,
      );
      this.rpc.sendResponse(id, { ok: true, data });
    } catch (e: any) {
      this.logger.error({ e }, "fetchTableData failed");
      this.rpc.sendError(id, { code: "IO_ERROR", message: String(e) });
    }
  }

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
      const primaryKeys = await (getConnector(dbType) as any).listPrimaryKeys(
        conn,
        schemaName,
        tableName,
      );
      this.rpc.sendResponse(id, { ok: true, primaryKeys });
    } catch (e: any) {
      this.logger.error({ e }, "fetchPrimaryKeys failed");
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
      const connector = getConnector(dbType) as any;
      const result = await connector.createTable(conn, schemaName, tableName, columns, foreignKeys);
      connector[`${dbType}Cache`]?.clearForConnection(conn);
      this.rpc.sendResponse(id, { ok: true, result });
    } catch (e: any) {
      this.logger.error({ e }, "createTable failed");
      this.rpc.sendError(id, { code: "IO_ERROR", message: String(e) });
    }
  }

  async handleCreateIndexes(params: any, id: number | string) {
    try {
      const { dbId, schemaName, indexes } = params || {};
      if (!dbId || !schemaName) {
        return this.rpc.sendError(id, {
          code: "BAD_REQUEST",
          message: "Missing dbId or schemaName",
        });
      }
      const { conn, dbType } = await this.dbService.getDatabaseConnection(dbId);
      const connector = getConnector(dbType) as any;
      const result = await connector.createIndexes(conn, schemaName, indexes);
      connector[`${dbType}Cache`]?.clearForConnection(conn);
      this.rpc.sendResponse(id, { ok: true, result });
    } catch (e: any) {
      this.logger.error({ e }, "createIndexes failed");
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
      const connector = getConnector(dbType) as any;
      const result = await connector.alterTable(conn, schemaName, tableName, operations);
      connector[`${dbType}Cache`]?.clearForConnection(conn);
      this.rpc.sendResponse(id, { ok: true, result });
    } catch (e: any) {
      this.logger.error({ e }, "alterTable failed");
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
      const connector = getConnector(dbType) as any;
      const result = await connector.dropTable(conn, schemaName, tableName);
      connector[`${dbType}Cache`]?.clearForConnection(conn);
      this.rpc.sendResponse(id, { ok: true, result });
    } catch (e: any) {
      this.logger.error({ e }, "dropTable failed");
      this.rpc.sendError(id, { code: "IO_ERROR", message: String(e) });
    }
  }

  async connectToDatabase(params: any, id: number | string) {
    try {
      const { dbId } = params || {};
      if (!dbId) {
        return this.rpc.sendError(id, { code: "BAD_REQUEST", message: "Missing dbId" });
      }
      const { conn, dbType } = await this.dbService.getDatabaseConnection(dbId);
      const result = await (getConnector(dbType) as any).connectToDatabase(conn, dbId);
      this.rpc.sendResponse(id, { ok: true, result });
    } catch (e: any) {
      this.logger.error({ e }, "connectToDatabase failed");
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
      const connector = getConnector(dbType) as any;
      const result = await connector.insertRow(conn, schemaName, tableName, rowData);
      connector[`${dbType}Cache`]?.clearForConnection(conn);
      this.rpc.sendResponse(id, { ok: true, result });
    } catch (e: any) {
      this.logger.error({ e }, "insertRow failed");
      this.rpc.sendError(id, { code: "IO_ERROR", message: String(e) });
    }
  }

  async handleUpdateRow(params: any, id: number | string) {
    try {
      const { dbId, schemaName, tableName, primaryKeyColumn, primaryKeyValue, rowData } =
        params || {};
      if (
        !dbId ||
        !schemaName ||
        !tableName ||
        !primaryKeyColumn ||
        primaryKeyValue === undefined ||
        !rowData
      ) {
        return this.rpc.sendError(id, {
          code: "BAD_REQUEST",
          message: "Missing required update fields",
        });
      }
      const { conn, dbType } = await this.dbService.getDatabaseConnection(dbId);
      const connector = getConnector(dbType) as any;
      const result = await connector.updateRow(
        conn,
        schemaName,
        tableName,
        primaryKeyColumn,
        primaryKeyValue,
        rowData,
      );
      connector[`${dbType}Cache`]?.clearForConnection(conn);
      this.rpc.sendResponse(id, { ok: true, result });
    } catch (e: any) {
      this.logger.error({ e }, "updateRow failed");
      this.rpc.sendError(id, { code: "IO_ERROR", message: String(e) });
    }
  }

  async handleDeleteRow(params: any, id: number | string) {
    try {
      const { dbId, schemaName, tableName, primaryKeyColumn, primaryKeyValue } = params || {};
      if (!dbId || !schemaName || !tableName) {
        return this.rpc.sendError(id, {
          code: "BAD_REQUEST",
          message: "Missing dbId, schemaName, or tableName",
        });
      }
      if (!primaryKeyColumn && (typeof primaryKeyValue !== "object" || primaryKeyValue === null)) {
        return this.rpc.sendError(id, {
          code: "BAD_REQUEST",
          message: "Either primaryKeyColumn or composite key object is required",
        });
      }
      const { conn, dbType } = await this.dbService.getDatabaseConnection(dbId);
      const connector = getConnector(dbType) as any;
      const result = await connector.deleteRow(
        conn,
        schemaName,
        tableName,
        primaryKeyColumn,
        primaryKeyValue,
      );
      connector[`${dbType}Cache`]?.clearForConnection(conn);
      this.rpc.sendResponse(id, { ok: true, deleted: result });
    } catch (e: any) {
      this.logger.error({ e }, "deleteRow failed");
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
      const result = await (getConnector(dbType) as any).searchTable(
        conn,
        schemaName,
        tableName,
        searchTerm,
        column,
        page || 1,
        pageSize || 50,
      );
      this.rpc.sendResponse(id, { ok: true, ...result });
    } catch (e: any) {
      this.logger.error({ e }, "searchTable failed");
      this.rpc.sendError(id, { code: "IO_ERROR", message: String(e) });
    }
  }

  // ---- M2: MongoDB document engine handlers (docs/MONGODB_M2_SPEC.md §13) ----

  /** Map a MongoApiError (or driver error) to the stable M2 error envelope. */
  private sendMongoError(id: number | string, e: unknown): void {
    const mapped =
      e instanceof MongoApiError ? { code: e.code, message: e.message } : mapMongoError(e);
    this.logger.error({ err: e, code: mapped.code }, "MongoDB document operation failed");
    this.rpc.sendError(id, { code: mapped.code, message: mapped.message });
  }

  async handleFetchDocuments(params: any, id: number | string) {
    try {
      const { dbId, collection, filter, sort, projection, page, pageSize } = params || {};
      if (!dbId || !collection) {
        return this.rpc.sendError(id, {
          code: "MONGO_VALIDATION_ERROR",
          message: "Missing dbId or collection",
        });
      }
      const { conn, dbType } = await this.dbService.getDatabaseConnection(dbId);
      const data = await this.queryExecutor.findDocuments(conn, dbType, {
        collection,
        filter,
        sort,
        projection,
        page,
        pageSize,
      });
      this.rpc.sendResponse(id, { ok: true, data });
    } catch (e) {
      this.sendMongoError(id, e);
    }
  }

  async handleInsertDocument(params: any, id: number | string) {
    try {
      const { dbId, collection, document } = params || {};
      if (!dbId || !collection || !document) {
        return this.rpc.sendError(id, {
          code: "MONGO_VALIDATION_ERROR",
          message: "Missing dbId, collection, or document",
        });
      }
      const { conn, dbType } = await this.dbService.getDatabaseConnection(dbId);
      const data = await this.queryExecutor.insertDocument(conn, dbType, { collection, document });
      this.rpc.sendResponse(id, { ok: true, data });
    } catch (e) {
      this.sendMongoError(id, e);
    }
  }

  async handleUpdateDocument(params: any, id: number | string) {
    try {
      const { dbId, collection, filter, update, options } = params || {};
      if (!dbId || !collection || !filter || !update) {
        return this.rpc.sendError(id, {
          code: "MONGO_VALIDATION_ERROR",
          message: "Missing dbId, collection, filter, or update",
        });
      }
      const { conn, dbType } = await this.dbService.getDatabaseConnection(dbId);
      const data = await this.queryExecutor.updateDocument(conn, dbType, {
        collection,
        filter,
        update,
        options,
      });
      this.rpc.sendResponse(id, { ok: true, data });
    } catch (e) {
      this.sendMongoError(id, e);
    }
  }

  async handleDeleteDocument(params: any, id: number | string) {
    try {
      const { dbId, collection, filter, options } = params || {};
      if (!dbId || !collection || !filter) {
        return this.rpc.sendError(id, {
          code: "MONGO_VALIDATION_ERROR",
          message: "Missing dbId, collection, or filter",
        });
      }
      const { conn, dbType } = await this.dbService.getDatabaseConnection(dbId);
      const data = await this.queryExecutor.deleteDocument(conn, dbType, {
        collection,
        filter,
        options,
      });
      this.rpc.sendResponse(id, { ok: true, data });
    } catch (e) {
      this.sendMongoError(id, e);
    }
  }

  async handleRunAggregation(params: any, id: number | string) {
    try {
      const { dbId, collection, pipeline, options } = params || {};
      if (!dbId || !collection || !pipeline) {
        return this.rpc.sendError(id, {
          code: "MONGO_VALIDATION_ERROR",
          message: "Missing dbId, collection, or pipeline",
        });
      }
      const { conn, dbType } = await this.dbService.getDatabaseConnection(dbId);
      const data = await this.queryExecutor.runAggregation(conn, dbType, {
        collection,
        pipeline,
        options,
      });
      this.rpc.sendResponse(id, { ok: true, data });
    } catch (e) {
      this.sendMongoError(id, e);
    }
  }

  async handleListCollections(params: any, id: number | string) {
    try {
      const { dbId } = params || {};
      if (!dbId) {
        return this.rpc.sendError(id, {
          code: "MONGO_VALIDATION_ERROR",
          message: "Missing dbId",
        });
      }
      const { conn, dbType } = await this.dbService.getDatabaseConnection(dbId);
      const data = await this.queryExecutor.listCollections(conn, dbType, params);
      this.rpc.sendResponse(id, { ok: true, data });
    } catch (e) {
      this.sendMongoError(id, e);
    }
  }

  async handleGetInferredSchema(params: any, id: number | string) {
    try {
      const { dbId, collection, sampleSize, maxDepth } = params || {};
      if (!dbId || !collection) {
        return this.rpc.sendError(id, {
          code: "MONGO_VALIDATION_ERROR",
          message: "Missing dbId or collection",
        });
      }
      const { conn, dbType } = await this.dbService.getDatabaseConnection(dbId);
      const data = await this.queryExecutor.inferCollectionSchema(conn, dbType, {
        collection,
        sampleSize,
        maxDepth,
      });
      this.rpc.sendResponse(id, { ok: true, data });
    } catch (e) {
      this.sendMongoError(id, e);
    }
  }
}
