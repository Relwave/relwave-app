/**
 * MongoDB Milestone 7 Phase 4 Stage 6 — Bulk Mutations Hook
 *
 * Orchestrates synchronous bulk update, delete, and insert operations:
 * - Pre-registers mutations in store with status: "running"
 * - Excludes synchronous mutations from polling
 * - Isolates mutations per target database ID
 * - Prevents duplicate concurrent calls via isSubmitting guard
 * - Defensively validates bridge responses and classifies outcomes
 * - Invalidates document, collection, and schema caches on success/partial success
 */

import React, { useState, useRef, useCallback } from "react";
import { databaseService } from "@/services/bridge/database";
import { defaultMongoBulkOperationsStore } from "./useMongoBulkOperationsStore";
import type {
  MongoBulkUpdateRequest,
  MongoBulkUpdateResult,
  MongoBulkDeleteRequest,
  MongoBulkDeleteResult,
  MongoBulkInsertRequest,
  MongoBulkInsertResult,
} from "../types/bulk";
import {
  sanitizeErrorMessage,
  sanitizeMutationErrors,
  hasPrototypePollution,
} from "../utils/mongoSemanticEmpty";

export interface BulkMutationsServiceContract {
  bulkUpdateMongoDocuments?: (req: MongoBulkUpdateRequest) => Promise<MongoBulkUpdateResult>;
  bulkDeleteMongoDocuments?: (req: MongoBulkDeleteRequest) => Promise<MongoBulkDeleteResult>;
  bulkInsertMongoDocuments?: (req: MongoBulkInsertRequest) => Promise<MongoBulkInsertResult>;
  bulkStore?: any;
}

export interface ExecuteBulkUpdateParams {
  collection: string;
  filter: Record<string, any>;
  update: Record<string, any>;
  options?: {
    multi?: boolean;
    upsert?: boolean;
    allowUnrestricted?: boolean;
  };
}

export interface ExecuteBulkDeleteParams {
  collection: string;
  filter: Record<string, any>;
  options?: {
    allowUnrestricted?: boolean;
  };
}

export interface ExecuteBulkInsertParams {
  collection: string;
  documents: Record<string, any>[];
  options?: {
    ordered?: boolean;
  };
}

function generateClientUuid(): string {
  if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") {
    return crypto.randomUUID();
  }
  return `sync-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
}

export function useMongoBulkMutations(
  dbId: string,
  service: BulkMutationsServiceContract = databaseService,
  options?: { store?: any; queryClient?: any },
) {
  const inReact = Boolean(
    typeof React !== "undefined" &&
    (React as any).__CLIENT_INTERNALS_DO_NOT_USE_OR_WARN_USERS_THEY_CANNOT_UPGRADE?.H,
  );

  const [isSubmitting, setIsSubmittingState] = inReact ? useState(false) : [false, () => {}];
  const isSubmittingRef = inReact ? useRef(false) : { current: false };

  const setIsSubmitting = (val: boolean) => {
    isSubmittingRef.current = val;
    if (inReact) {
      setIsSubmittingState(val);
    }
  };

  const wrapCallback = <T extends (...args: any[]) => any>(fn: T, deps: any[]): T => {
    return inReact ? useCallback(fn, deps) : fn;
  };

  const getStore = wrapCallback(() => {
    if (options?.store)
      return options.store.getSnapshot ? options.store.getSnapshot() : options.store;
    if (service?.bulkStore) {
      return service.bulkStore.getSnapshot ? service.bulkStore.getSnapshot() : service.bulkStore;
    }
    return defaultMongoBulkOperationsStore.getSnapshot();
  }, [options?.store, service]);

  const tryInvalidate = wrapCallback(
    (targetDbId: string) => {
      const qc = options?.queryClient;
      if (qc && typeof qc.invalidateQueries === "function") {
        try {
          qc.invalidateQueries({ queryKey: ["mongoDocuments", targetDbId] });
          qc.invalidateQueries({ queryKey: ["mongoCollections", targetDbId] });
          qc.invalidateQueries({ queryKey: ["mongoSchema", targetDbId] });
        } catch {
          // ignore
        }
      }
    },
    [options?.queryClient],
  );

  const executeBulkUpdate = wrapCallback(
    async (params: ExecuteBulkUpdateParams) => {
      if (isSubmittingRef.current) {
        return;
      }
      isSubmittingRef.current = true;
      setIsSubmitting(true);

      const targetDbId = dbId;
      const mutationId = generateClientUuid();
      const now = new Date().toISOString();
      const store = getStore();

      store.registerSyncMutation(targetDbId, {
        kind: "sync",
        id: mutationId,
        dbId: targetDbId,
        collection: params.collection,
        type: "update",
        status: "running",
        timestamp: now,
      });

      try {
        const dispatchFn =
          service.bulkUpdateMongoDocuments || databaseService.bulkUpdateMongoDocuments;
        const res = await dispatchFn({
          dbId: targetDbId,
          collection: params.collection,
          filter: params.filter,
          update: params.update,
          options: params.options,
        });

        const isValidResponse =
          typeof res === "object" &&
          res !== null &&
          typeof res.matchedCount === "number" &&
          Number.isSafeInteger(res.matchedCount) &&
          res.matchedCount >= 0 &&
          typeof res.modifiedCount === "number" &&
          Number.isSafeInteger(res.modifiedCount) &&
          res.modifiedCount >= 0;

        if (!isValidResponse) {
          store.updateSyncMutation(mutationId, {
            status: "failed",
            error: "Malformed bridge response: invalid document counts",
          });
          return { status: "failed" as const, error: "Malformed bridge response" };
        }

        store.updateSyncMutation(mutationId, {
          status: "completed",
          matchedCount: res.matchedCount,
          modifiedCount: res.modifiedCount,
          upsertedId: res.upsertedId,
          advisoryWarning: res.advisoryWarning,
        });

        tryInvalidate(targetDbId);
        return { status: "completed" as const, result: res };
      } catch (err: any) {
        const errorMsg = sanitizeErrorMessage(err?.message || "Bulk update failed");
        store.updateSyncMutation(mutationId, {
          status: "failed",
          error: errorMsg,
        });
        return { status: "failed" as const, error: errorMsg };
      } finally {
        isSubmittingRef.current = false;
        setIsSubmitting(false);
      }
    },
    [dbId, getStore, service, tryInvalidate],
  );

  const executeBulkDelete = wrapCallback(
    async (params: ExecuteBulkDeleteParams) => {
      if (isSubmittingRef.current) {
        return;
      }
      isSubmittingRef.current = true;
      setIsSubmitting(true);

      const targetDbId = dbId;
      const mutationId = generateClientUuid();
      const now = new Date().toISOString();
      const store = getStore();

      store.registerSyncMutation(targetDbId, {
        kind: "sync",
        id: mutationId,
        dbId: targetDbId,
        collection: params.collection,
        type: "delete",
        status: "running",
        timestamp: now,
      });

      try {
        const dispatchFn =
          service.bulkDeleteMongoDocuments || databaseService.bulkDeleteMongoDocuments;
        const res = await dispatchFn({
          dbId: targetDbId,
          collection: params.collection,
          filter: params.filter,
          options: params.options,
        });

        const isValidResponse =
          typeof res === "object" &&
          res !== null &&
          typeof res.deletedCount === "number" &&
          Number.isSafeInteger(res.deletedCount) &&
          res.deletedCount >= 0;

        if (!isValidResponse) {
          store.updateSyncMutation(mutationId, {
            status: "failed",
            error: "Malformed bridge response: invalid document counts",
          });
          return { status: "failed" as const, error: "Malformed bridge response" };
        }

        store.updateSyncMutation(mutationId, {
          status: "completed",
          deletedCount: res.deletedCount,
          advisoryWarning: res.advisoryWarning,
        });

        tryInvalidate(targetDbId);
        return { status: "completed" as const, result: res };
      } catch (err: any) {
        const errorMsg = sanitizeErrorMessage(err?.message || "Bulk delete failed");
        store.updateSyncMutation(mutationId, {
          status: "failed",
          error: errorMsg,
        });
        return { status: "failed" as const, error: errorMsg };
      } finally {
        isSubmittingRef.current = false;
        setIsSubmitting(false);
      }
    },
    [dbId, getStore, service, tryInvalidate],
  );

  const executeBulkInsert = wrapCallback(
    async (params: ExecuteBulkInsertParams) => {
      if (isSubmittingRef.current) {
        return;
      }

      if (!Array.isArray(params.documents) || params.documents.length === 0) {
        throw new Error("Documents array cannot be empty");
      }
      if (params.documents.length > 5000) {
        throw new Error("Bulk insert exceeds maximum limit of 5,000 documents");
      }

      const payloadStr = JSON.stringify(params.documents);
      const byteLength =
        typeof Buffer !== "undefined"
          ? Buffer.byteLength(payloadStr, "utf8")
          : new TextEncoder().encode(payloadStr).length;

      if (byteLength > 16 * 1024 * 1024) {
        throw new Error(`Bulk insert payload size (${byteLength} bytes) exceeds 16 MB limit`);
      }

      for (const doc of params.documents) {
        if (typeof doc !== "object" || doc === null || Array.isArray(doc)) {
          throw new Error("Each item in documents must be an object");
        }
        if (hasPrototypePollution(doc)) {
          throw new Error(
            "Security violation: documents contain forbidden keys (__proto__, constructor, prototype)",
          );
        }
      }

      isSubmittingRef.current = true;
      setIsSubmitting(true);

      const targetDbId = dbId;
      const mutationId = generateClientUuid();
      const now = new Date().toISOString();
      const store = getStore();

      store.registerSyncMutation(targetDbId, {
        kind: "sync",
        id: mutationId,
        dbId: targetDbId,
        collection: params.collection,
        type: "insert",
        status: "running",
        timestamp: now,
      });

      try {
        const dispatchFn =
          service.bulkInsertMongoDocuments || databaseService.bulkInsertMongoDocuments;
        const res = await dispatchFn({
          dbId: targetDbId,
          collection: params.collection,
          documents: params.documents,
          options: params.options,
        });

        const isValidResponse =
          typeof res === "object" &&
          res !== null &&
          typeof res.insertedCount === "number" &&
          Number.isSafeInteger(res.insertedCount) &&
          res.insertedCount >= 0 &&
          typeof res.failedCount === "number" &&
          Number.isSafeInteger(res.failedCount) &&
          res.failedCount >= 0;

        if (!isValidResponse) {
          store.updateSyncMutation(mutationId, {
            status: "failed",
            error: "Malformed bridge response: invalid document counts",
          });
          return { status: "failed" as const, error: "Malformed bridge response" };
        }

        if (res.insertedCount === 0 && res.failedCount === 0 && params.documents.length > 0) {
          store.updateSyncMutation(mutationId, {
            status: "failed",
            error: "Bridge reported 0 inserted and 0 failed documents for non-empty insert",
          });
          return {
            status: "failed" as const,
            error: "Bridge reported 0 inserted and 0 failed documents for non-empty insert",
          };
        }

        if (res.insertedCount + res.failedCount !== params.documents.length) {
          store.updateSyncMutation(mutationId, {
            status: "failed",
            error:
              "Malformed bridge response: insertedCount + failedCount does not match total documents",
          });
          return { status: "failed" as const, error: "Malformed bridge response: count mismatch" };
        }

        const { sanitizedErrors, totalErrors } = sanitizeMutationErrors(res.errors, 10);

        if (res.failedCount === 0) {
          store.updateSyncMutation(mutationId, {
            status: "completed",
            insertedCount: res.insertedCount,
            failedCount: 0,
          });
          tryInvalidate(targetDbId);
          return { status: "completed" as const, result: res };
        } else if (res.insertedCount > 0 && res.failedCount > 0) {
          store.updateSyncMutation(mutationId, {
            status: "partial_success",
            insertedCount: res.insertedCount,
            failedCount: res.failedCount,
            errors: sanitizedErrors,
            totalErrors: totalErrors > 0 ? totalErrors : res.failedCount,
          });
          tryInvalidate(targetDbId);
          return { status: "partial_success" as const, result: res };
        } else {
          store.updateSyncMutation(mutationId, {
            status: "failed",
            insertedCount: 0,
            failedCount: res.failedCount,
            errors: sanitizedErrors,
            totalErrors: totalErrors > 0 ? totalErrors : res.failedCount,
            error:
              sanitizedErrors.length > 0
                ? sanitizedErrors[0].message
                : "All documents failed to insert",
          });
          return { status: "failed" as const, result: res };
        }
      } catch (err: any) {
        const errorMsg = sanitizeErrorMessage(err?.message || "Bulk insert failed");
        store.updateSyncMutation(mutationId, {
          status: "failed",
          error: errorMsg,
        });
        return { status: "failed" as const, error: errorMsg };
      } finally {
        isSubmittingRef.current = false;
        setIsSubmitting(false);
      }
    },
    [dbId, getStore, service, tryInvalidate],
  );

  return {
    isSubmitting,
    executeBulkUpdate,
    executeBulkDelete,
    executeBulkInsert,
  };
}
