import { Logger } from "pino";
import { Rpc } from "../types";
import { DatabaseService } from "../services/databaseService";
import { QueryExecutor } from "../services/queryExecutor";
import { MongoApiError, mapMongoError } from "../connectors/mongo";

export class IndexHandlers {
  constructor(
    private rpc: Rpc,
    private logger: Logger,
    private dbService: DatabaseService,
    private queryExecutor: QueryExecutor,
  ) {}

  /** Map a MongoApiError (or driver error) to the stable error envelope. */
  private sendMongoError(id: number | string, e: unknown): void {
    const mapped =
      e instanceof MongoApiError ? { code: e.code, message: e.message } : mapMongoError(e);
    this.logger.error({ err: e, code: mapped.code }, "MongoDB index operation failed");
    this.rpc.sendError(id, { code: mapped.code, message: mapped.message });
  }

  async handleListIndexes(params: any, id: number | string): Promise<void> {
    try {
      const { dbId, collection } = params || {};
      if (!dbId || !collection) {
        return this.rpc.sendError(id, {
          code: "MONGO_VALIDATION_ERROR",
          message: "Missing dbId or collection",
        });
      }
      const data = await this.dbService.withConnection(dbId, (conn, _db, dbType) =>
        this.queryExecutor.listIndexes(conn, dbType, { collection }),
      );
      this.rpc.sendResponse(id, { ok: true, data });
    } catch (e) {
      this.sendMongoError(id, e);
    }
  }

  async handleCreateIndex(params: any, id: number | string): Promise<void> {
    try {
      const { dbId, collection, key, options } = params || {};
      if (!dbId || !collection || !key) {
        return this.rpc.sendError(id, {
          code: "MONGO_VALIDATION_ERROR",
          message: "Missing dbId, collection, or key",
        });
      }
      const data = await this.dbService.withConnection(dbId, (conn, db, dbType) => {
        const readOnly = Boolean(
          (db as any)?.readonly ||
          (db as any)?.readOnly ||
          (conn as any)?.readonly ||
          (conn as any)?.readOnly,
        );
        return this.queryExecutor.createIndex(
          conn,
          dbType,
          { collection, key, options },
          { readOnly },
        );
      });
      this.rpc.sendResponse(id, { ok: true, data });
    } catch (e) {
      this.sendMongoError(id, e);
    }
  }

  async handleDropIndex(params: any, id: number | string): Promise<void> {
    try {
      const { dbId, collection, indexName } = params || {};
      if (!dbId || !collection || !indexName) {
        return this.rpc.sendError(id, {
          code: "MONGO_VALIDATION_ERROR",
          message: "Missing dbId, collection, or indexName",
        });
      }
      const data = await this.dbService.withConnection(dbId, (conn, db, dbType) => {
        const readOnly = Boolean(
          (db as any)?.readonly ||
          (db as any)?.readOnly ||
          (conn as any)?.readonly ||
          (conn as any)?.readOnly,
        );
        return this.queryExecutor.dropIndex(conn, dbType, { collection, indexName }, { readOnly });
      });
      this.rpc.sendResponse(id, { ok: true, data });
    } catch (e) {
      this.sendMongoError(id, e);
    }
  }

  async handleGetIndexStats(params: any, id: number | string): Promise<void> {
    try {
      const { dbId, collection } = params || {};
      if (!dbId || !collection) {
        return this.rpc.sendError(id, {
          code: "MONGO_VALIDATION_ERROR",
          message: "Missing dbId or collection",
        });
      }
      const data = await this.dbService.withConnection(dbId, (conn, _db, dbType) =>
        this.queryExecutor.getIndexStats(conn, dbType, { collection }),
      );
      this.rpc.sendResponse(id, { ok: true, data });
    } catch (e) {
      this.sendMongoError(id, e);
    }
  }

  async handleHideIndex(params: any, id: number | string): Promise<void> {
    try {
      const { dbId, collection, indexName, hidden } = params || {};
      if (!dbId || !collection || !indexName || typeof hidden !== "boolean") {
        return this.rpc.sendError(id, {
          code: "MONGO_VALIDATION_ERROR",
          message: "Missing dbId, collection, indexName, or hidden (must be a boolean)",
        });
      }
      const data = await this.dbService.withConnection(dbId, (conn, db, dbType) => {
        const readOnly = Boolean(
          (db as any)?.readonly ||
          (db as any)?.readOnly ||
          (conn as any)?.readonly ||
          (conn as any)?.readOnly,
        );
        return this.queryExecutor.hideIndex(
          conn,
          dbType,
          { collection, indexName, hidden },
          { readOnly },
        );
      });
      this.rpc.sendResponse(id, { ok: true, data });
    } catch (e) {
      this.sendMongoError(id, e);
    }
  }
}
