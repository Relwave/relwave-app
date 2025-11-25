// ----------------------------
// bridge/src/jsonRpcHandlers.ts
// ----------------------------

/*
  Usage:
    import * as dbStore from './services/dbStore';
    import connectors from './connectors'; // your existing connectors object
    import { registerDbHandlers } from './jsonRpcHandlers';

    registerDbHandlers(rpc, dbStore, connectors, logger);

  The `rpc` object must implement:
    - sendResponse(id, payload)
    - sendError(id, { code, message })
*/

import {
  listTables,
  testConnection,
  fetchTableData,
  streamQueryCancelable,
} from "./connectors/postgres";
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

// utility: helper to send a query error notification
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

// 1. UPDATED: Added SessionManager to the function signature
export function registerDbHandlers(
  rpc: Rpc,
  logger: any,
  sessions: SessionManager // <-- NEW PARAMETER
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

  // query.run - NEW HANDLER for custom SQL execution
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
    const conn = {
      host: db.host,
      port: db.port,
      user: db.user,
      password: pwd ?? undefined,
      ssl: db.ssl,
      database: db.database,
    };

    let cancelled = false;
    const cancelState: { fn: (() => Promise<void>) | null } = { fn: null };

    // Notify the client that the query is starting
    rpc.sendNotification?.("query.started", {
      sessionId,
      info: { sqlPreview: (sql || "").slice(0, 200), dbId },
    });

    // State for progress tracking
    const start = Date.now();
    let batchIndex = 0;
    let totalRows = 0;
    let lastProgressEmit = Date.now();

    try {
      // Create cancellable runner from postgres.ts
      const runner = streamQueryCancelable(
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

  // query.fetchTableData - NEW HANDLER
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
        const conn = {
          host: db.host,
          port: db.port,
          user: db.user,
          password: pwd ?? undefined,
          ssl: db.ssl,
          database: db.database,
        };

        // Call the new connector function
        const data = await fetchTableData(conn, schemaName, tableName);

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
      const required = ["name", "host", "port", "user", "database"];
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

  // db.connectTest
  rpcRegister("db.connectTest", async (params: any, id: number | string) => {
    try {
      const { id: dbId, connection } = params || {};
      let conn: any = null;
      if (dbId) {
        const db = await dbStore.getDB(dbId);
        if (!db)
          return rpc.sendError(id, {
            code: "NOT_FOUND",
            message: "DB not found",
          });
        const pwd = await dbStore.getPasswordFor(db);
        conn = {
          host: db.host,
          port: db.port,
          user: db.user,
          password: pwd,
          database: db.database,
        };
      } else if (connection) {
        conn = connection;
      } else {
        return rpc.sendError(id, {
          code: "BAD_REQUEST",
          message: "Missing dbId or connection",
        });
      }

      // call postgres connector test function
      try {
        await testConnection(conn);
        rpc.sendResponse(id, { ok: true, data: { ok: true } });
      } catch (err: any) {
        rpc.sendResponse(id, { ok: false, message: String(err) });
      }
    } catch (e: any) {
      logger?.error({ e }, "db.connectTest failed");
      rpc.sendError(id, { code: "IO_ERROR", message: String(e) });
    }
  });

  // db.listTables
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
      const conn = {
        host: db.host,
        port: db.port,
        user: db.user,
        password: pwd ?? undefined,
        ssl: db.ssl,
        database: db.database,
      };
      const tables = await listTables(conn);
      rpc.sendResponse(id, { ok: true, data: tables });
    } catch (e: any) {
      logger?.error({ e }, "db.listTables failed");
      rpc.sendError(id, { code: "IO_ERROR", message: String(e) });
    }
  });

  // helper to register methods into the bridge's rpc dispatcher
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
