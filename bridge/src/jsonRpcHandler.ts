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
} from "./connectors/postgres"; // <-- ADDED fetchTableData
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
        // You can store any initial configuration or state here
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
      // Call the cancel function registered in the SessionManager
      const ok = await sessions.cancel(sessionId);
      rpc.sendResponse(id, { ok: true, data: { cancelled: ok } });
    } catch (e: any) {
      logger?.error({ e }, "query.cancel failed");
      rpc.sendError(id, { code: "INTERNAL_ERROR", message: String(e) });
    }
  });

  // --- QUERY HANDLERS (query.*) ---

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
    // ... (unchanged db.list implementation)
    try {
      const dbs = await dbStore.listDBs();
      // Do not return credentialId/passwords in list — just metadata
      const safe = dbs.map((d) => ({ ...d, credentialId: undefined }));
      rpc.sendResponse(id, { ok: true, data: safe });
    } catch (e: any) {
      logger?.error({ e }, "db.list failed");
      rpc.sendError(id, { code: "IO_ERROR", message: String(e) });
    }
  });

  // db.get
  rpcRegister("db.get", async (params: any, id: number | string) => {
    // ... (unchanged db.get implementation)
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
    // ... (unchanged db.add implementation)
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
    // ... (unchanged db.update implementation)
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
    // ... (unchanged db.delete implementation)
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
    // ... (unchanged db.connectTest implementation)
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
    // ... (unchanged db.listTables implementation)
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
