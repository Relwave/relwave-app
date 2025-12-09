// ----------------------------
// bridge/src/jsonRpcHandlers.ts
// ----------------------------

/*
  Usage:
    import * as dbStore from './services/dbStore';
    import { registerDbHandlers } from './jsonRpcHandlers';

    registerDbHandlers(rpc, logger, sessions);

  The `rpc` object must implement:
    - sendResponse(id, payload)
    - sendError(id, { code, message })
    - sendNotification(method, params)
*/

import * as postgresConnector from "./connectors/postgres";
import * as mysqlConnector from "./connectors/mysql";
import * as dbStore from "./services/dbStore";
import { SessionManager } from "./sessionManager";
import { randomUUID } from "node:crypto";

type Rpc = {
  sendResponse: (id: number | string, payload: any) => void;
  sendError: (
    id: number | string,
    err: { code?: string; message: string }
  ) => void;
  sendNotification?: (method: string, params?: any) => void;
};

// Database type enum
enum DBType {
  POSTGRES = "postgres",
  MYSQL = "mysql",
}

// Utility: helper to send a query error notification
function notifyQueryError(rpc: Rpc, sessionId: string, err: any) {
  try {
    if (rpc.sendNotification) {
      rpc.sendNotification("query.error", {
        sessionId,
        error: { message: String(err) },
      });
    }
  } catch (e) {
    /* ignore */
  }
}

// Utility: Determine database type from DB metadata
function getDBType(db: any): DBType {
  // Check if there's an explicit type field
  if (db.type) {
    const normalizedType = db.type.toLowerCase();
    if (normalizedType.includes("mysql")) return DBType.MYSQL;
    if (normalizedType.includes("postgres") || normalizedType.includes("pg"))
      return DBType.POSTGRES;
  }

  // Default to postgres for backwards compatibility
  return DBType.POSTGRES;
}

// Utility: Build connection config for PostgreSQL
function buildPostgresConnection(db: any, pwd: string | null) {
  return {
    host: db.host,
    port: db.port,
    user: db.user,
    password: pwd ?? undefined,
    ssl: db.ssl,
    database: db.database,
  };
}

// Utility: Build connection config for MySQL
function buildMySQLConnection(db: any, pwd: string | null) {
  return {
    host: db.host,
    port: db.port || 3306,
    user: db.user,
    password: pwd ?? undefined,
    ssl: db.ssl,
    database: db.database,
  };
}

export function registerDbHandlers(
  rpc: Rpc,
  logger: any,
  sessions: SessionManager
) {
  // --- SESSION MANAGEMENT HANDLERS (query.*) ---

  // query.createSession
  rpcRegister(
    "query.createSession",
    async (params: any, id: number | string) => {
      try {
        const sessionId = randomUUID();
        sessions.create(sessionId, params?.config || {});
        rpc.sendResponse(id, { ok: true, data: { sessionId } });
      } catch (e: any) {
        logger?.error({ e }, "query.createSession failed");
        rpc.sendError(id, { code: "INTERNAL_ERROR", message: String(e) });
      }
    }
  );

  // query.cancel
  rpcRegister("query.cancel", async (params: any, id: number | string) => {
    try {
      const { sessionId } = params || {};
      if (!sessionId) {
        return rpc.sendError(id, {
          code: "BAD_REQUEST",
          message: "Missing sessionId",
        });
      }
      const ok = await sessions.cancel(sessionId);
      rpc.sendResponse(id, { ok: true, data: { cancelled: ok } });
    } catch (e: any) {
      logger?.error({ e }, "query.cancel failed");
      rpc.sendError(id, { code: "INTERNAL_ERROR", message: String(e) });
    }
  });

  // --- QUERY HANDLERS (query.*) ---

  // query.run - Custom SQL execution with database-specific handling
  rpcRegister("query.run", async (params: any, id: number | string) => {
    const { sessionId, dbId, sql, batchSize = 200 } = params || {};

    if (!sessionId || !dbId || !sql) {
      return rpc.sendError(id, {
        code: "BAD_REQUEST",
        message: "Missing sessionId, dbId, or sql",
      });
    }

    const db = await dbStore.getDB(dbId);
    if (!db) {
      return rpc.sendError(id, { code: "NOT_FOUND", message: "DB not found" });
    }

    const pwd = await dbStore.getPasswordFor(db);
    const dbType = getDBType(db);

    let cancelled = false;
    const cancelState: { fn: (() => Promise<void>) | null } = { fn: null };

    // Notify the client that the query is starting
    rpc.sendNotification?.("query.started", {
      sessionId,
      info: { sqlPreview: (sql || "").slice(0, 200), dbId, dbType },
    });

    // State for progress tracking
    const start = Date.now();
    let batchIndex = 0;
    let totalRows = 0;
    let lastProgressEmit = Date.now();

    try {
      let runner: { promise: Promise<void>; cancel: () => Promise<void> };

      // Select the appropriate connector based on database type
      if (dbType === DBType.MYSQL) {
        const conn = buildMySQLConnection(db, pwd);
        runner = mysqlConnector.streamQueryCancelable(
          conn,
          sql,
          batchSize,
          async (rows, columns) => {
            if (cancelled) throw new Error("query cancelled");
            totalRows += rows.length;

            // Send batch results to the client
            rpc.sendNotification?.("query.result", {
              sessionId,
              batchIndex: batchIndex++,
              rows,
              columns,
              complete: false,
            });

            // Emit progress every 500ms
            const now = Date.now();
            if (now - lastProgressEmit >= 500) {
              lastProgressEmit = now;
              rpc.sendNotification?.("query.progress", {
                sessionId,
                rowsSoFar: totalRows,
                elapsedMs: now - start,
              });
            }
          },
          () => {
            // onDone callback
            rpc.sendNotification?.("query.done", {
              sessionId,
              rows: totalRows,
              timeMs: Date.now() - start,
              status: "success",
            });
          }
        );
      } else {
        // PostgreSQL
        const conn = buildPostgresConnection(db, pwd);
        runner = postgresConnector.streamQueryCancelable(
          conn,
          sql,
          batchSize,
          async (rows, columns) => {
            if (cancelled) throw new Error("query cancelled");
            totalRows += rows.length;

            // Send batch results to the client
            rpc.sendNotification?.("query.result", {
              sessionId,
              batchIndex: batchIndex++,
              rows,
              columns,
              complete: false,
            });

            // Emit progress every 500ms
            const now = Date.now();
            if (now - lastProgressEmit >= 500) {
              lastProgressEmit = now;
              rpc.sendNotification?.("query.progress", {
                sessionId,
                rowsSoFar: totalRows,
                elapsedMs: now - start,
              });
            }
          },
          () => {
            // onDone callback
            rpc.sendNotification?.("query.done", {
              sessionId,
              rows: totalRows,
              timeMs: Date.now() - start,
              status: "success",
            });
          }
        );
      }

      // Set cancel function synchronously to avoid race conditions
      cancelState.fn = async () => {
        try {
          await runner.cancel();
        } catch (e) {
          /* ignore */
        }
      };

      // Register cancel handler with session manager
      sessions.registerCancel(sessionId, async () => {
        cancelled = true;
        if (cancelState.fn) await cancelState.fn();
      });

      // Run the query promise in the background
      (async () => {
        try {
          await runner.promise;
        } catch (err: any) {
          if (String(err).toLowerCase().includes("cancel") || cancelled) {
            // Send cancelled status
            rpc.sendNotification?.("query.done", {
              sessionId,
              rows: totalRows,
              timeMs: Date.now() - start,
              status: "cancelled",
            });
          } else {
            // Send query error
            logger.error({ err, sessionId }, "streamQuery error");
            notifyQueryError(rpc, sessionId, err);
          }
        } finally {
          // Cleanup: final progress and session removal
          try {
            rpc.sendNotification?.("query.progress", {
              sessionId,
              rowsSoFar: totalRows,
              elapsedMs: Date.now() - start,
            });
          } catch (e) {}
          sessions.remove(sessionId);
          cancelState.fn = null;
        }
      })();

      // Respond immediately to the request, indicating the background job started
      rpc.sendResponse(id, { ok: true });
    } catch (initError: any) {
      // Catch errors during setup (e.g., connection failure before streaming starts)
      sessions.remove(sessionId);
      logger.error({ initError }, "query.run initial setup failed");
      rpc.sendError(id, { code: "SETUP_ERROR", message: String(initError) });
    }
  });

  // query.fetchTableData - Fetch table data with database-specific handling
  rpcRegister(
    "query.fetchTableData",
    async (params: any, id: number | string) => {
      try {
        const { dbId, schemaName, tableName } = params || {};
        if (!dbId || !tableName || !schemaName)
          return rpc.sendError(id, {
            code: "BAD_REQUEST",
            message: "Missing dbId, schemaName, or tableName",
          });

        const db = await dbStore.getDB(dbId);
        if (!db)
          return rpc.sendError(id, {
            code: "NOT_FOUND",
            message: "DB not found",
          });

        const pwd = await dbStore.getPasswordFor(db);
        const dbType = getDBType(db);

        let data: any;

        if (dbType === DBType.MYSQL) {
          const conn = buildMySQLConnection(db, pwd);
          data = await mysqlConnector.fetchTableData(
            conn,
            schemaName,
            tableName
          );
        } else {
          // PostgreSQL
          const conn = buildPostgresConnection(db, pwd);
          data = await postgresConnector.fetchTableData(
            conn,
            schemaName,
            tableName
          );
        }

        rpc.sendResponse(id, { ok: true, data: data });
      } catch (e: any) {
        logger?.error({ e }, "query.fetchTableData failed");
        rpc.sendError(id, { code: "IO_ERROR", message: String(e) });
      }
    }
  );

  // --- DATABASE HANDLERS (db.*) ---

  // db.list
  rpcRegister("db.list", async (params: any, id: number | string) => {
    try {
      const dbs = await dbStore.listDBs();
      const safe = dbs.map((d) => ({ ...d, credentialId: undefined }));
      rpc.sendResponse(id, { ok: true, data: safe });
    } catch (e: any) {
      logger?.error({ e }, "db.list failed");
      rpc.sendError(id, { code: "IO_ERROR", message: String(e) });
    }
  });

  // db.get
  rpcRegister("db.get", async (params: any, id: number | string) => {
    try {
      const { id: dbId } = params || {};
      if (!dbId)
        return rpc.sendError(id, {
          code: "BAD_REQUEST",
          message: "Missing id",
        });
      const db = await dbStore.getDB(dbId);
      if (!db)
        return rpc.sendError(id, {
          code: "NOT_FOUND",
          message: "DB not found",
        });
      const safe = { ...db, credentialId: undefined };
      rpc.sendResponse(id, { ok: true, data: safe });
    } catch (e: any) {
      logger?.error({ e }, "db.get failed");
      rpc.sendError(id, { code: "IO_ERROR", message: String(e) });
    }
  });

  // db.add
  rpcRegister("db.add", async (params: any, id: number | string) => {
    try {
      const payload = params || {};
      const required = ["name", "host", "port", "user", "database", "type"];
      for (const r of required)
        if (!payload[r])
          return rpc.sendError(id, {
            code: "BAD_REQUEST",
            message: `Missing ${r}`,
          });
      const res = await dbStore.addDB(payload);
      rpc.sendResponse(id, { ok: true, data: { id: res.id } });
    } catch (e: any) {
      logger?.error({ e }, "db.add failed");
      rpc.sendError(id, { code: "IO_ERROR", message: String(e) });
    }
  });

  // db.update
  rpcRegister("db.update", async (params: any, id: number | string) => {
    try {
      const payload = params || {};
      if (!payload.id)
        return rpc.sendError(id, {
          code: "BAD_REQUEST",
          message: "Missing id",
        });
      await dbStore.updateDB(payload.id, payload);
      rpc.sendResponse(id, { ok: true });
    } catch (e: any) {
      logger?.error({ e }, "db.update failed");
      rpc.sendError(id, { code: "IO_ERROR", message: String(e) });
    }
  });

  // db.delete
  rpcRegister("db.delete", async (params: any, id: number | string) => {
    try {
      const { id: dbId } = params || {};
      if (!dbId)
        return rpc.sendError(id, {
          code: "BAD_REQUEST",
          message: "Missing id",
        });
      await dbStore.deleteDB(dbId);
      rpc.sendResponse(id, { ok: true });
    } catch (e: any) {
      logger?.error({ e }, "db.delete failed");
      rpc.sendError(id, { code: "IO_ERROR", message: String(e) });
    }
  });

  // db.connectTest - Test connection with database-specific handling
  rpcRegister("db.connectTest", async (params: any, id: number | string) => {
    try {
      const { id: dbId, connection } = params || {};
      let conn: any = null;
      let dbType = DBType.POSTGRES; // default

      if (dbId) {
        const db = await dbStore.getDB(dbId);
        if (!db)
          return rpc.sendError(id, {
            code: "NOT_FOUND",
            message: "DB not found",
          });
        const pwd = await dbStore.getPasswordFor(db);
        dbType = getDBType(db);

        if (dbType === DBType.MYSQL) {
          conn = buildMySQLConnection(db, pwd);
        } else {
          conn = buildPostgresConnection(db, pwd);
        }
      } else if (connection) {
        conn = connection;
        // Try to detect from connection object
        if (connection.type) {
          dbType = connection.type.toLowerCase().includes("mysql")
            ? DBType.MYSQL
            : DBType.POSTGRES;
        }
      } else {
        return rpc.sendError(id, {
          code: "BAD_REQUEST",
          message: "Missing dbId or connection",
        });
      }

      // Call appropriate connector test function
      try {
        let result: any;
        if (dbType === DBType.MYSQL) {
          result = await mysqlConnector.testConnection(conn);
        } else {
          await postgresConnector.testConnection(conn);
          result = { ok: true };
        }
        rpc.sendResponse(id, { ok: true, data: result });
      } catch (err: any) {
        rpc.sendResponse(id, { ok: false, message: String(err) });
      }
    } catch (e: any) {
      logger?.error({ e }, "db.connectTest failed");
      rpc.sendError(id, { code: "IO_ERROR", message: String(e) });
    }
  });

  // db.listTables - List tables with database-specific handling
  rpcRegister("db.listTables", async (params: any, id: number | string) => {
    try {
      const { id: dbId } = params || {};
      if (!dbId)
        return rpc.sendError(id, {
          code: "BAD_REQUEST",
          message: "Missing id",
        });
      const db = await dbStore.getDB(dbId);
      if (!db)
        return rpc.sendError(id, {
          code: "NOT_FOUND",
          message: "DB not found",
        });

      const pwd = await dbStore.getPasswordFor(db);
      const dbType = getDBType(db);

      let tables: any;

      if (dbType === DBType.MYSQL) {
        const conn = buildMySQLConnection(db, pwd);
        tables = await mysqlConnector.listTables(conn);
      } else {
        const conn = buildPostgresConnection(db, pwd);
        tables = await postgresConnector.listTables(conn);
      }

      rpc.sendResponse(id, { ok: true, data: tables });
    } catch (e: any) {
      logger?.error({ e }, "db.listTables failed");
      rpc.sendError(id, { code: "IO_ERROR", message: String(e) });
    }
  });

  // db.getStats
  rpcRegister("db.getStats", async (params: any, id: number | string) => {
    try {
      const { id: dbId } = params || {};
      if (!dbId)
        return rpc.sendError(id, {
          code: "BAD_REQUEST",
          message: "Missing id",
        });
      const db = await dbStore.getDB(dbId);
      if (!db)
        return rpc.sendError(id, {
          code: "NOT_FOUND",
          message: "DB not found",
        });

      const pwd = await dbStore.getPasswordFor(db);
      const dbType = getDBType(db);

      // Only PostgreSQL supports getDBStats currently
      if (dbType === DBType.MYSQL) {
        // Return basic stats for MySQL or implement MySQL-specific stats
        const conn = buildMySQLConnection(db, pwd);
        const stats = await mysqlConnector.getDBStats(conn);
        return rpc.sendResponse(id, {
          ok: true,
          data: {
            stats: stats,
            db: db,
          },
        });
      } else {
        const conn = buildPostgresConnection(db, pwd);
        const stats = await postgresConnector.getDBStats(conn);
        return rpc.sendResponse(id, {
          ok: true,
          data: {
            stats: stats,
            db: db,
          },
        });
      }
    } catch (error) {
      logger?.error({ error }, "db.getStats failed");
      rpc.sendError(id, { code: "IO_ERROR", message: String(error) });
    }
  });

  rpcRegister("db.getTotalStats", async (params: any, id: number | string) => {
    try {
      const dbs = await dbStore.listDBs();

      if (dbs.length === 0) {
        return rpc.sendResponse(id, {
          ok: true,
          data: { tables: 0, rows: 0, sizeBytes: 0 },
        });
      }

      let totalStats = { tables: 0, rows: 0, sizeBytes: 0 };
      const MB_TO_BYTES = 1024 * 1024;
      for (const db of dbs) {
        const pwd = await dbStore.getPasswordFor(db);
        const dbType = getDBType(db);

        if (dbType === DBType.MYSQL) {
          const conn = buildMySQLConnection(db, pwd);
          const tests = await mysqlConnector.testConnection(conn);
          if (!tests.ok) {
            logger.warn(
              `Skipping stats for DB ${db.name} (${db.id}) due to connection test failure`
            );
            continue;
          }

          const stats = await mysqlConnector.getDBStats(conn);
          const mysqlTables = Number(stats.total_tables) || 0;
          const mysqlRows = Number(stats.total_rows) || 0;
          const mysqlSizeMB = Number(stats.total_db_size_mb) || 0;
          const mysqlSizeBytes = mysqlSizeMB * MB_TO_BYTES;

          totalStats.tables += mysqlTables;
          totalStats.rows += mysqlRows;
          totalStats.sizeBytes += mysqlSizeBytes;
        } else {
          const conn = buildPostgresConnection(db, pwd);
          const stats = await postgresConnector.getDBStats(conn);
          const tests = await postgresConnector.testConnection(conn);
          if (!tests.ok) {
            logger.warn(
              `Skipping stats for DB ${db.name} (${db.id}) due to connection test failure`
            );
            continue;
          }
          const pgTables = Number(stats.total_tables) || 0;
          const pgRows = Number(stats.total_rows) || 0;
          const pgSizeMB = Number(stats.total_db_size_mb) || 0;
          const pgSizeBytes = pgSizeMB * MB_TO_BYTES;
          totalStats.tables += pgTables;
          totalStats.rows += pgRows;
          totalStats.sizeBytes += pgSizeBytes;
        }
      }

      // 2. Send the final response with corrected numeric totals
      return rpc.sendResponse(id, { ok: true, data: totalStats });
    } catch (error) {
      logger?.error({ error }, "db.getTotalStats failed");
      rpc.sendError(id, { code: "IO_ERROR", message: String(error) });
    }
  });

  // db.getSchema
  rpcRegister("db.getSchema", async (params: any, id: number | string) => {
    try {
      const { id: dbId } = params || {};
      if (!dbId) {
        return rpc.sendError(id, {
          code: "BAD_REQUEST",
          message: "Missing id",
        });
      }

      const dbMeta = await dbStore.getDB(dbId);
      if (!dbMeta) {
        return rpc.sendError(id, {
          code: "NOT_FOUND",
          message: "DB not found",
        });
      }

      const pwd = await dbStore.getPasswordFor(dbMeta);
      const dbType = getDBType(dbMeta);

      // Only PostgreSQL supports full schema retrieval currently
      if (dbType === DBType.MYSQL) {
        // Basic MySQL schema support
        const conn = buildMySQLConnection(dbMeta, pwd);
        const schemas = await mysqlConnector.listSchemas(conn);

        const finalSchemas = [];
        for (const schema of schemas) {
          const tablesInSchema = await mysqlConnector.listTables(
            conn,
            schema.name
          );
          const finalTables = [];
          for (const table of tablesInSchema) {
            const tableDetails = await mysqlConnector.getTableDetails(
              conn,
              table.schema,
              table.name
            );
            const columns = tableDetails.map((col) => ({
              name: col.name,
              type: col.type,
              nullable: !col.not_nullable,
              isPrimaryKey: col.is_primary_key === true,
              isForeignKey: col.is_foreign_key === true,
              defaultValue: col.default_value || null,
              isUnique: false,
            }));
            finalTables.push({
              name: table.name,
              type: table.type,
              columns: columns,
            });
          }
          finalSchemas.push({
            name: schema.name,
            tables: finalTables,
          });
        }
        const responseData = {
          name: dbMeta.name,
          schemas: finalSchemas,
        };
        return rpc.sendResponse(id, { ok: true, data: responseData });
      } else {
        // PostgreSQL full schema
        const conn = buildPostgresConnection(dbMeta, pwd);
        const schemas = await postgresConnector.listSchemas(conn);

        const finalSchemas = [];

        for (const schema of schemas) {
          try {
            logger.info(`Processing schema: ${schema.name}`);
            const tablesInSchema = await postgresConnector.listTables(
              conn,
              schema.name
            );
            const finalTables = [];

            for (const table of tablesInSchema) {
              const tableDetails = await postgresConnector.getTableDetails(
                conn,
                table.schema,
                table.name
              );

              const columns = tableDetails.map((col) => ({
                name: col.name,
                type: col.type,
                nullable: !col.not_nullable,
                isPrimaryKey: col.is_primary_key === true,
                isForeignKey: col.is_foreign_key === true,
                defaultValue: col.default_value || null,
                isUnique: false,
              }));

              finalTables.push({
                name: table.name,
                type: table.type,
                columns: columns,
              });
            }

            finalSchemas.push({
              name: schema.name,
              tables: finalTables,
            });
          } catch (error) {
            rpc.sendError(id, {
              code: "IO_ERROR",
              message: `Failed to process schema ${schema.name}: ${String(
                error
              )}`,
            });
            return;
          }
        }

        const responseData = {
          name: dbMeta.name,
          schemas: finalSchemas,
        };

        rpc.sendResponse(id, { ok: true, data: responseData });
      }
    } catch (e: any) {
      logger?.error({ e }, "db.getSchema failed");
      rpc.sendError(id, { code: "IO_ERROR", message: String(e) });
    }
  });

  // Helper to register methods into the bridge's rpc dispatcher
  function rpcRegister(
    method: string,
    fn: (params: any, id: number | string) => Promise<void> | void
  ) {
    if (
      (globalThis as any).rpcRegister &&
      typeof (globalThis as any).rpcRegister === "function"
    ) {
      (globalThis as any).rpcRegister(method, fn);
    } else {
      (globalThis as any).rpcHandlers = (globalThis as any).rpcHandlers || {};
      (globalThis as any).rpcHandlers[method] = fn;
    }
  }
}

// Export convenience for direct import
export default { registerDbHandlers };
