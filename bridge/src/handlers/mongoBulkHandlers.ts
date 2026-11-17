/**
 * MongoDB Milestone 7 Phase 3 — Bulk Operations JSON-RPC Handlers.
 *
 * Exposes methods under the `mongo.bulk.*` namespace:
 * - mongo.bulk.importStart
 * - mongo.bulk.importChunk
 * - mongo.bulk.exportStart
 * - mongo.bulk.getOperationStatus
 * - mongo.bulk.cancelOperation
 * - mongo.bulk.cleanupOperation
 * - mongo.bulk.insert
 * - mongo.bulk.update
 * - mongo.bulk.delete
 */

import { Logger } from "pino";
import { Rpc } from "../types";
import { MongoBulkEngine, isValidUuidV4 } from "../services/mongoBulkEngine";
import { MongoBulkFormat } from "../types/mongoBulk";
import { MongoApiError, safeMongoError } from "../connectors/mongo";

function isNonEmptyString(val: any): val is string {
  return typeof val === "string" && val.trim().length > 0;
}

export class MongoBulkHandlers {
  constructor(
    private rpc: Rpc,
    private logger: Logger,
    private engine: MongoBulkEngine,
  ) {}

  private sendError(id: number | string, err: any, contextMsg: string): void {
    this.logger?.error({ err }, contextMsg);
    if (err instanceof MongoApiError) {
      this.rpc.sendError(id, { code: err.code, message: err.message });
    } else {
      this.rpc.sendError(id, {
        code: err?.code || "INTERNAL_ERROR",
        message: err?.message ? safeMongoError(err.message) : String(err),
      });
    }
  }

  async handleImportStart(params: any, id: number | string): Promise<void> {
    try {
      const { dbId, collection, format, options } = params || {};
      if (!isNonEmptyString(dbId)) {
        return this.rpc.sendError(id, {
          code: "BAD_REQUEST",
          message: "Missing or invalid required parameter: dbId",
        });
      }
      if (!isNonEmptyString(collection)) {
        return this.rpc.sendError(id, {
          code: "BAD_REQUEST",
          message: "Missing or invalid required parameter: collection",
        });
      }
      if (!isNonEmptyString(format) || !["json", "ndjson", "csv"].includes(format)) {
        return this.rpc.sendError(id, {
          code: "BAD_REQUEST",
          message:
            "Missing or invalid required parameter: format must be 'json', 'ndjson', or 'csv'",
        });
      }

      const data = await this.engine.importStart({
        dbId,
        collection,
        format: format as MongoBulkFormat,
        options,
      });
      this.rpc.sendResponse(id, { ok: true, data });
    } catch (err: any) {
      this.sendError(id, err, "mongo.bulk.importStart failed");
    }
  }

  async handleImportChunk(params: any, id: number | string): Promise<void> {
    try {
      const { operationId, chunkIndex, isLastChunk, payload } = params || {};
      if (!isNonEmptyString(operationId) || !isValidUuidV4(operationId)) {
        return this.rpc.sendError(id, {
          code: "BAD_REQUEST",
          message: "Missing or invalid required parameter: operationId must be a valid UUIDv4",
        });
      }
      if (typeof chunkIndex !== "number" || !Number.isInteger(chunkIndex) || chunkIndex < 0) {
        return this.rpc.sendError(id, {
          code: "BAD_REQUEST",
          message:
            "Missing or invalid required parameter: chunkIndex must be a non-negative integer",
        });
      }
      if (payload === undefined || payload === null) {
        return this.rpc.sendError(id, {
          code: "BAD_REQUEST",
          message: "Missing required parameter: payload",
        });
      }

      const data = await this.engine.importChunk({
        operationId,
        chunkIndex,
        isLastChunk,
        payload,
      });
      this.rpc.sendResponse(id, { ok: true, data });
    } catch (err: any) {
      this.sendError(id, err, "mongo.bulk.importChunk failed");
    }
  }

  async handleExportStart(params: any, id: number | string): Promise<void> {
    try {
      const { dbId, collection, format, filter, projection, sort, limit } = params || {};
      if (!isNonEmptyString(dbId)) {
        return this.rpc.sendError(id, {
          code: "BAD_REQUEST",
          message: "Missing or invalid required parameter: dbId",
        });
      }
      if (!isNonEmptyString(collection)) {
        return this.rpc.sendError(id, {
          code: "BAD_REQUEST",
          message: "Missing or invalid required parameter: collection",
        });
      }
      if (!isNonEmptyString(format) || !["json", "ndjson", "csv"].includes(format)) {
        return this.rpc.sendError(id, {
          code: "BAD_REQUEST",
          message:
            "Missing or invalid required parameter: format must be 'json', 'ndjson', or 'csv'",
        });
      }

      const data = await this.engine.exportStart({
        dbId,
        collection,
        format: format as MongoBulkFormat,
        filter,
        projection,
        sort,
        limit,
      });
      this.rpc.sendResponse(id, { ok: true, data });
    } catch (err: any) {
      this.sendError(id, err, "mongo.bulk.exportStart failed");
    }
  }

  async handleGetOperationStatus(params: any, id: number | string): Promise<void> {
    try {
      const { operationId } = params || {};
      if (!isNonEmptyString(operationId) || !isValidUuidV4(operationId)) {
        return this.rpc.sendError(id, {
          code: "BAD_REQUEST",
          message: "Missing or invalid required parameter: operationId must be a valid UUIDv4",
        });
      }

      const data = await this.engine.getOperationStatus(operationId);
      this.rpc.sendResponse(id, { ok: true, data });
    } catch (err: any) {
      this.sendError(id, err, "mongo.bulk.getOperationStatus failed");
    }
  }

  async handleCancelOperation(params: any, id: number | string): Promise<void> {
    try {
      const { operationId } = params || {};
      if (!isNonEmptyString(operationId) || !isValidUuidV4(operationId)) {
        return this.rpc.sendError(id, {
          code: "BAD_REQUEST",
          message: "Missing or invalid required parameter: operationId must be a valid UUIDv4",
        });
      }

      const data = await this.engine.cancelOperation(operationId);
      this.rpc.sendResponse(id, { ok: true, data });
    } catch (err: any) {
      this.sendError(id, err, "mongo.bulk.cancelOperation failed");
    }
  }

  async handleCleanupOperation(params: any, id: number | string): Promise<void> {
    try {
      const { operationId } = params || {};
      if (!isNonEmptyString(operationId) || !isValidUuidV4(operationId)) {
        return this.rpc.sendError(id, {
          code: "BAD_REQUEST",
          message: "Missing or invalid required parameter: operationId must be a valid UUIDv4",
        });
      }

      const data = await this.engine.cleanupOperation(operationId);
      this.rpc.sendResponse(id, { ok: true, data });
    } catch (err: any) {
      this.sendError(id, err, "mongo.bulk.cleanupOperation failed");
    }
  }

  async handleExportSaveTo(params: any, id: number | string): Promise<void> {
    try {
      const { operationId, destinationPath, options } = params || {};
      if (!isNonEmptyString(operationId) || !isValidUuidV4(operationId)) {
        return this.rpc.sendError(id, {
          code: "BAD_REQUEST",
          message: "Missing or invalid required parameter: operationId must be a valid UUIDv4",
        });
      }
      if (!isNonEmptyString(destinationPath)) {
        return this.rpc.sendError(id, {
          code: "BAD_REQUEST",
          message:
            "Missing or invalid required parameter: destinationPath must be a non-empty string",
        });
      }
      if (
        options !== undefined &&
        (typeof options !== "object" || options === null || Array.isArray(options))
      ) {
        return this.rpc.sendError(id, {
          code: "BAD_REQUEST",
          message: "Invalid optional parameter: options must be an object",
        });
      }
      if (options?.overwrite !== undefined && typeof options.overwrite !== "boolean") {
        return this.rpc.sendError(id, {
          code: "BAD_REQUEST",
          message: "Invalid optional parameter: options.overwrite must be a boolean",
        });
      }

      const data = await this.engine.exportSaveTo({
        operationId,
        destinationPath,
        options,
      });
      this.rpc.sendResponse(id, { ok: true, data });
    } catch (err: any) {
      this.sendError(id, err, "mongo.bulk.exportSaveTo failed");
    }
  }

  async handleBulkInsert(params: any, id: number | string): Promise<void> {
    try {
      const { dbId, collection, documents, options } = params || {};
      if (!isNonEmptyString(dbId)) {
        return this.rpc.sendError(id, {
          code: "BAD_REQUEST",
          message: "Missing or invalid required parameter: dbId",
        });
      }
      if (!isNonEmptyString(collection)) {
        return this.rpc.sendError(id, {
          code: "BAD_REQUEST",
          message: "Missing or invalid required parameter: collection",
        });
      }
      if (!Array.isArray(documents) || documents.length === 0) {
        return this.rpc.sendError(id, {
          code: "BAD_REQUEST",
          message: "Missing or invalid required parameter: documents must be a non-empty array",
        });
      }

      const data = await this.engine.bulkInsert({ dbId, collection, documents, options });
      this.rpc.sendResponse(id, { ok: true, data });
    } catch (err: any) {
      this.sendError(id, err, "mongo.bulk.insert failed");
    }
  }

  async handleBulkUpdate(params: any, id: number | string): Promise<void> {
    try {
      const { dbId, collection, filter, update, options } = params || {};
      if (!isNonEmptyString(dbId)) {
        return this.rpc.sendError(id, {
          code: "BAD_REQUEST",
          message: "Missing or invalid required parameter: dbId",
        });
      }
      if (!isNonEmptyString(collection)) {
        return this.rpc.sendError(id, {
          code: "BAD_REQUEST",
          message: "Missing or invalid required parameter: collection",
        });
      }
      if (typeof filter !== "object" || filter === null || Array.isArray(filter)) {
        return this.rpc.sendError(id, {
          code: "BAD_REQUEST",
          message: "Missing or invalid required parameter: filter must be an object",
        });
      }
      if (typeof update !== "object" || update === null || Array.isArray(update)) {
        return this.rpc.sendError(id, {
          code: "BAD_REQUEST",
          message: "Missing or invalid required parameter: update must be an object",
        });
      }

      const data = await this.engine.bulkUpdate({ dbId, collection, filter, update, options });
      this.rpc.sendResponse(id, { ok: true, data });
    } catch (err: any) {
      this.sendError(id, err, "mongo.bulk.update failed");
    }
  }

  async handleBulkDelete(params: any, id: number | string): Promise<void> {
    try {
      const { dbId, collection, filter, options } = params || {};
      if (!isNonEmptyString(dbId)) {
        return this.rpc.sendError(id, {
          code: "BAD_REQUEST",
          message: "Missing or invalid required parameter: dbId",
        });
      }
      if (!isNonEmptyString(collection)) {
        return this.rpc.sendError(id, {
          code: "BAD_REQUEST",
          message: "Missing or invalid required parameter: collection",
        });
      }
      if (typeof filter !== "object" || filter === null || Array.isArray(filter)) {
        return this.rpc.sendError(id, {
          code: "BAD_REQUEST",
          message: "Missing or invalid required parameter: filter must be an object",
        });
      }

      const data = await this.engine.bulkDelete({ dbId, collection, filter, options });
      this.rpc.sendResponse(id, { ok: true, data });
    } catch (err: any) {
      this.sendError(id, err, "mongo.bulk.delete failed");
    }
  }
}
