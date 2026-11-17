import { Logger } from "pino";
import { Rpc } from "../types";
import { MongoRelationshipEngine } from "../services/mongoRelationshipEngine";

function isNonEmptyString(val: any): val is string {
  return typeof val === "string" && val.trim().length > 0;
}

export class MongoRelationshipHandlers {
  constructor(
    private rpc: Rpc,
    private logger: Logger,
    private engine: MongoRelationshipEngine,
  ) {}

  async handleInfer(params: any, id: number | string): Promise<void> {
    try {
      const { dbId, projectId, collections, sampleSize, timeoutMs, maxCollections } = params || {};
      if (!isNonEmptyString(dbId)) {
        return this.rpc.sendError(id, {
          code: "BAD_REQUEST",
          message: "Missing or invalid required parameter: dbId",
        });
      }
      if (projectId !== undefined && !isNonEmptyString(projectId)) {
        return this.rpc.sendError(id, {
          code: "BAD_REQUEST",
          message: "Invalid parameter: projectId must be a non-empty string",
        });
      }
      if (
        collections !== undefined &&
        (!Array.isArray(collections) || !collections.every((c) => isNonEmptyString(c)))
      ) {
        return this.rpc.sendError(id, {
          code: "BAD_REQUEST",
          message: "Invalid parameter: collections must be an array of non-empty strings",
        });
      }
      if (
        sampleSize !== undefined &&
        (typeof sampleSize !== "number" || isNaN(sampleSize) || sampleSize <= 0)
      ) {
        return this.rpc.sendError(id, {
          code: "BAD_REQUEST",
          message: "Invalid parameter: sampleSize must be a positive number",
        });
      }
      if (
        timeoutMs !== undefined &&
        (typeof timeoutMs !== "number" || isNaN(timeoutMs) || timeoutMs <= 0)
      ) {
        return this.rpc.sendError(id, {
          code: "BAD_REQUEST",
          message: "Invalid parameter: timeoutMs must be a positive number",
        });
      }

      const data = await this.engine.inferRelationships(dbId, {
        projectId,
        collections,
        sampleSize,
        timeoutMs,
        maxCollections: typeof maxCollections === "number" ? maxCollections : undefined,
      });

      this.rpc.sendResponse(id, { ok: true, data });
    } catch (err: any) {
      this.logger.error({ err, params }, "mongo.relationship.infer failed");
      this.rpc.sendError(id, {
        code: err?.code || "INTERNAL_ERROR",
        message: err?.message || String(err),
      });
    }
  }

  async handleList(params: any, id: number | string): Promise<void> {
    try {
      const { dbId, projectId } = params || {};
      if (!isNonEmptyString(dbId)) {
        return this.rpc.sendError(id, {
          code: "BAD_REQUEST",
          message: "Missing or invalid required parameter: dbId",
        });
      }
      if (projectId !== undefined && !isNonEmptyString(projectId)) {
        return this.rpc.sendError(id, {
          code: "BAD_REQUEST",
          message: "Invalid parameter: projectId must be a non-empty string",
        });
      }

      const data = await this.engine.listRelationships(dbId, projectId);
      this.rpc.sendResponse(id, { ok: true, data });
    } catch (err: any) {
      this.logger.error({ err, params }, "mongo.relationship.list failed");
      this.rpc.sendError(id, {
        code: err?.code || "INTERNAL_ERROR",
        message: err?.message || String(err),
      });
    }
  }

  async handleSetStatus(params: any, id: number | string): Promise<void> {
    try {
      const { dbId, projectId, relationshipId, status } = params || {};
      if (!isNonEmptyString(dbId)) {
        return this.rpc.sendError(id, {
          code: "BAD_REQUEST",
          message: "Missing or invalid required parameter: dbId",
        });
      }
      if (!isNonEmptyString(relationshipId)) {
        return this.rpc.sendError(id, {
          code: "BAD_REQUEST",
          message: "Missing or invalid required parameter: relationshipId",
        });
      }
      if (status !== "confirmed" && status !== "rejected") {
        return this.rpc.sendError(id, {
          code: "BAD_REQUEST",
          message: 'Parameter status must be either "confirmed" or "rejected"',
        });
      }
      if (projectId !== undefined && !isNonEmptyString(projectId)) {
        return this.rpc.sendError(id, {
          code: "BAD_REQUEST",
          message: "Invalid parameter: projectId must be a non-empty string",
        });
      }

      const data = await this.engine.setRelationshipStatus(dbId, relationshipId, status, projectId);
      this.rpc.sendResponse(id, { ok: true, data });
    } catch (err: any) {
      this.logger.error({ err, params }, "mongo.relationship.setStatus failed");
      this.rpc.sendError(id, {
        code: err?.code || "INTERNAL_ERROR",
        message: err?.message || String(err),
      });
    }
  }

  async handleSave(params: any, id: number | string): Promise<void> {
    try {
      const { dbId, projectId, relationship } = params || {};
      if (!isNonEmptyString(dbId)) {
        return this.rpc.sendError(id, {
          code: "BAD_REQUEST",
          message: "Missing or invalid required parameter: dbId",
        });
      }
      if (projectId !== undefined && !isNonEmptyString(projectId)) {
        return this.rpc.sendError(id, {
          code: "BAD_REQUEST",
          message: "Invalid parameter: projectId must be a non-empty string",
        });
      }
      if (!relationship || typeof relationship !== "object" || Array.isArray(relationship)) {
        return this.rpc.sendError(id, {
          code: "BAD_REQUEST",
          message: "Missing or invalid required parameter: relationship",
        });
      }

      const {
        id: relId,
        sourceCollection,
        sourceField,
        targetCollection,
        targetField,
        cardinality,
      } = relationship;
      if (
        !isNonEmptyString(relId) ||
        !isNonEmptyString(sourceCollection) ||
        !isNonEmptyString(sourceField) ||
        !isNonEmptyString(targetCollection) ||
        !isNonEmptyString(targetField)
      ) {
        return this.rpc.sendError(id, {
          code: "BAD_REQUEST",
          message:
            "Relationship object missing required non-empty string fields (id, sourceCollection, sourceField, targetCollection, targetField)",
        });
      }

      const validCardinalities = [
        "one-to-one",
        "one-to-many",
        "many-to-one",
        "many-to-many",
        "unknown",
        "insufficient-evidence",
      ];
      if (!validCardinalities.includes(cardinality)) {
        return this.rpc.sendError(id, {
          code: "BAD_REQUEST",
          message:
            'Invalid cardinality: must be one of "one-to-one", "one-to-many", "many-to-one", "many-to-many", "unknown", "insufficient-evidence"',
        });
      }

      const data = await this.engine.saveRelationship(dbId, relationship, projectId);
      this.rpc.sendResponse(id, { ok: true, data });
    } catch (err: any) {
      this.logger.error({ err, params }, "mongo.relationship.save failed");
      this.rpc.sendError(id, {
        code: err?.code || "INTERNAL_ERROR",
        message: err?.message || String(err),
      });
    }
  }

  async handleDelete(params: any, id: number | string): Promise<void> {
    try {
      const { dbId, projectId, relationshipId } = params || {};
      if (!isNonEmptyString(dbId)) {
        return this.rpc.sendError(id, {
          code: "BAD_REQUEST",
          message: "Missing or invalid required parameter: dbId",
        });
      }
      if (!isNonEmptyString(relationshipId)) {
        return this.rpc.sendError(id, {
          code: "BAD_REQUEST",
          message: "Missing or invalid required parameter: relationshipId",
        });
      }
      if (projectId !== undefined && !isNonEmptyString(projectId)) {
        return this.rpc.sendError(id, {
          code: "BAD_REQUEST",
          message: "Invalid parameter: projectId must be a non-empty string",
        });
      }

      const data = await this.engine.deleteRelationship(dbId, relationshipId, projectId);
      this.rpc.sendResponse(id, { ok: true, data });
    } catch (err: any) {
      this.logger.error({ err, params }, "mongo.relationship.delete failed");
      this.rpc.sendError(id, {
        code: err?.code || "INTERNAL_ERROR",
        message: err?.message || String(err),
      });
    }
  }
}
