import { Rpc } from "../types";
import { DatabaseService } from "../services/databaseService";
import { QueryExecutor } from "../services/queryExecutor";
import { Logger } from "pino";

export class DatabaseHandlers {
  constructor(
    private rpc: Rpc,
    private logger: Logger,
    private dbService: DatabaseService,
    private queryExecutor: QueryExecutor
  ) { }

  async handleListDatabases(params: any, id: number | string) {
    try {
      const dbs = await this.dbService.listDatabases();
      this.rpc.sendResponse(id, { ok: true, data: dbs });
    } catch (e: any) {
      this.logger?.error({ e }, "db.list failed");
      this.rpc.sendError(id, { code: "IO_ERROR", message: String(e) });
    }
  }

  async handleGetDatabase(params: any, id: number | string) {
    try {
      const { id: dbId } = params || {};
      if (!dbId) {
        return this.rpc.sendError(id, {
          code: "BAD_REQUEST",
          message: "Missing id",
        });
      }

      const db = await this.dbService.getDatabase(dbId);
      if (!db) {
        return this.rpc.sendError(id, {
          code: "NOT_FOUND",
          message: "DB not found",
        });
      }

      const safe = { ...db, credentialId: undefined };
      this.rpc.sendResponse(id, { ok: true, data: safe });
    } catch (e: any) {
      this.logger?.error({ e }, "db.get failed");
      this.rpc.sendError(id, { code: "IO_ERROR", message: String(e) });
    }
  }

  async handleAddDatabase(params: any, id: number | string) {
    try {
      const res = await this.dbService.addDatabase(params);
      this.rpc.sendResponse(id, { ok: true, data: { id: res.id } });
    } catch (e: any) {
      this.logger?.error({ e }, "db.add failed");
      this.rpc.sendError(id, { code: "IO_ERROR", message: String(e) });
    }
  }

  async handleDeleteDatabase(params: any, id: number | string) {
    try {
      const { id: dbId } = params || {};
      if (!dbId) {
        return this.rpc.sendError(id, {
          code: "BAD_REQUEST",
          message: "Missing id",
        });
      }
      await this.dbService.deleteDatabase(dbId);
      this.rpc.sendResponse(id, { ok: true });
    } catch (e: any) {
      this.logger?.error({ e }, "db.delete failed");
      this.rpc.sendError(id, { code: "IO_ERROR", message: String(e) });
    }
  }

  async handleListTables(params: any, id: number | string) {
    try {
      const { id: dbId } = params || {};
      if (!dbId) {
        return this.rpc.sendError(id, {
          code: "BAD_REQUEST",
          message: "Missing id",
        });
      }

      const { conn, dbType } = await this.dbService.getDatabaseConnection(dbId);
      const tables = await this.queryExecutor.listTables(conn, dbType, params.schema);
      this.rpc.sendResponse(id, { ok: true, data: tables });
    } catch (e: any) {
      this.logger?.error({ e }, "db.listTables failed");
      this.rpc.sendError(id, { code: "IO_ERROR", message: String(e) });
    }
  }

  async handleListSchemas(params: any, id: number | string) {
    try {
      const { id: dbId } = params || {};
      if (!dbId) {
        return this.rpc.sendError(id, {
          code: "BAD_REQUEST",
          message: "Missing id",
        });
      }
      const { conn, dbType } = await this.dbService.getDatabaseConnection(dbId);
      const schemas = await this.queryExecutor.listSchemaNames(conn, dbType);
      this.rpc.sendResponse(id, { ok: true, data: schemas });
    } catch (e: any) {
      this.logger?.error({ e }, "db.listSchemas failed");
      this.rpc.sendError(id, { code: "IO_ERROR", message: String(e) });
    }
  }

  async handleGetSchema(params: any, id: number | string) {
    try {
      const { id: dbId, schema } = params || {};
      if (!dbId) {
        return this.rpc.sendError(id, {
          code: "BAD_REQUEST",
          message: "Missing id",
        });
      }
      const { conn, dbType } = await this.dbService.getDatabaseConnection(dbId);
      const dbSchema = await this.queryExecutor.listSchemas(conn, dbType);
      this.rpc.sendResponse(id, { ok: true, data: dbSchema });
    } catch (e: any) {
      this.logger?.error({ e }, "db.getSchema failed");
      this.rpc.sendError(id, { code: "IO_ERROR", message: String(e) });
    }
  }

  async handleUpdateDatabase(params: any, id: number | string) {
    try {
      const { id: dbId, ...updateData } = params || {};
      if (!dbId) {
        return this.rpc.sendError(id, {
          code: "BAD_REQUEST",
          message: "Missing id",
        });
      }
      await this.dbService.updateDatabase(dbId, updateData);
      this.rpc.sendResponse(id, { ok: true });
    } catch (error: any) {
      this.logger?.error({ error }, "db.update failed");
      this.rpc.sendError(id, { code: "IO_ERROR", message: String(error) });
    }
  }

  async handleTestConnection(params: any, id: number | string) {
    try {
      const { id: dbId, connection } = params || {};

      if (!dbId && !connection) {
        return this.rpc.sendError(id, {
          code: "BAD_REQUEST",
          message: "Missing dbId or connection",
        });
      }

      let conn, dbType;

      if (dbId) {
        const result = await this.dbService.getDatabaseConnection(dbId);
        conn = result.conn;
        dbType = result.dbType;
      } else {
        conn = connection;
        if (connection.type?.toLowerCase().includes("mariadb")) {
          dbType = "mariadb";
        } else if (connection.type?.toLowerCase().includes("mysql")) {
          dbType = "mysql";
        } else if (connection.type?.toLowerCase().includes("postgres")) {
          dbType = "postgres";
        } else {
          dbType = connection.type;
        }
      }
      const result = await this.queryExecutor.testConnection(conn, dbType);
      this.rpc.sendResponse(id, { ok: true, data: result });
    } catch (err: any) {
      this.logger.error({ err }, '[Handler] testConnection error');
      this.rpc.sendResponse(id, { ok: false, message: String(err) });
    }
  }

  async handleTouchDatabase(params: any, id: number | string) {
    try {
      const { id: dbId } = params || {};
      if (!dbId) {
        return this.rpc.sendError(id, {
          code: "BAD_REQUEST",
          message: "Missing id",
        });
      }
      await this.dbService.touchDatabase(dbId);
      this.rpc.sendResponse(id, { ok: true });
    } catch (e: any) {
      this.logger?.error({ e }, "db.touch failed");
      this.rpc.sendError(id, { code: "IO_ERROR", message: String(e) });
    }
  }
}
