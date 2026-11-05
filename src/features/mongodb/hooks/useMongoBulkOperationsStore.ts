/**
 * MongoDB Milestone 7 Phase 4 — Centralized Bulk Operations Store
 *
 * Implements the database-level singleton history store and authoritative poller:
 * - Single in-flight guarded poller per operationId
 * - authorative expiresAt lifecycle & immutability invariant
 * - strictly sequenced import cancellation pipeline
 * - transient backoff (2s -> 4s -> 8s -> 10s) and unreachable probing (10s)
 * - stale transition upon bridge MONGO_NOT_FOUND
 * - immune active operations during pruning
 * - teardown on beforeunload
 *
 * Adheres to docs/M7_PHASE4_SPEC.md §7, §13 and implementation_plan.md.
 */

import { useSyncExternalStore, useMemo } from "react";
import { databaseService } from "@/services/bridge/database";
import type {
  BulkHistoryEntry,
  TrackedAsyncBulkOperation,
  TrackedSyncBulkMutation,
  PollerControl,
  ImportExecutionControl,
  MongoBulkOperationsState,
  MongoBulkGetOperationStatusRequest,
  MongoBulkOperationStatusResult,
  MongoBulkCancelRequest,
  MongoBulkCancelResult,
  MongoBulkCleanupRequest,
  MongoBulkCleanupResult,
} from "../types/bulk";

export interface BulkOperationsStoreServiceContract {
  getMongoBulkOperationStatus: (req: MongoBulkGetOperationStatusRequest) => Promise<MongoBulkOperationStatusResult>;
  cancelMongoBulkOperation: (req: MongoBulkCancelRequest) => Promise<MongoBulkCancelResult>;
  cleanupMongoBulkOperation: (req: MongoBulkCleanupRequest) => Promise<MongoBulkCleanupResult>;
}

export function createMongoBulkOperationsStore(
  service: BulkOperationsStoreServiceContract = databaseService,
) {
  let operationsByDb: Record<string, BulkHistoryEntry[]> = {};
  const activePollers = new Map<string, PollerControl>();
  const activeExecutionControls = new Map<string, ImportExecutionControl>();
  const activeCancellationPromises = new Map<string, Promise<void>>();
  const listeners = new Set<() => void>();

  function notify() {
    for (const listener of listeners) {
      listener();
    }
  }

  function stopPoller(opId: string) {
    const control = activePollers.get(opId);
    if (control) {
      control.isCancelled = true;
      if (control.timerId !== null) {
        clearTimeout(control.timerId);
        control.timerId = null;
      }
      activePollers.delete(opId);
    }
  }

  function startPoller(opId: string) {
    if (activePollers.has(opId)) {
      return;
    }

    const control: PollerControl = {
      timerId: null,
      inFlight: false,
      consecutiveErrors: 0,
      isCancelled: false,
    };
    activePollers.set(opId, control);

    function scheduleNext(delayMs: number) {
      if (control.isCancelled) return;
      if (control.timerId !== null) {
        clearTimeout(control.timerId);
      }
      const timer = setTimeout(() => {
        executePoll();
      }, delayMs);
      if (typeof timer === "object" && timer !== null && typeof (timer as any).unref === "function") {
        (timer as any).unref();
      }
      control.timerId = timer;
    }

    async function executePoll() {
      if (control.isCancelled || control.inFlight) {
        return;
      }

      control.inFlight = true;
      try {
        const res = await service.getMongoBulkOperationStatus({ operationId: opId });
        if (control.isCancelled) return;

        control.consecutiveErrors = 0;

        updateAsyncOperation(opId, {
          status: res.status,
          processedDocuments: res.processedDocuments,
          successfulDocuments: res.successfulDocuments ?? res.processedDocuments,
          failedDocuments: res.failedDocuments ?? 0,
          fileSizeBytes: res.fileSizeBytes,
          expiresAt: res.expiresAt,
          hasAuthoritativeExpiresAt: true,
          isUnreachable: false,
          error: res.error,
        });

        if (res.status === "completed" || res.status === "failed" || res.status === "cancelled") {
          stopPoller(opId);
          return;
        }

        // Healthy dynamic polling tick: 1000ms
        scheduleNext(1000);
      } catch (err: unknown) {
        if (control.isCancelled) return;

        const errRecord = typeof err === "object" && err !== null ? (err as Record<string, unknown>) : null;
        const code = typeof errRecord?.code === "string" ? errRecord.code : "";
        const msg = err instanceof Error ? err.message : String(err);

        // MONGO_NOT_FOUND: mark stale with informative explanation, preserve history, halt poller
        if (code === "MONGO_NOT_FOUND" || msg.includes("MONGO_NOT_FOUND")) {
          markOperationStale(
            opId,
            "Operation session is no longer available (it may have expired after 1 hour, completed and been cleaned up, or the bridge process restarted).",
          );
          stopPoller(opId);
          return;
        }

        control.consecutiveErrors++;
        if (control.consecutiveErrors >= 5) {
          setOperationUnreachable(opId, true);
          scheduleNext(10000); // 10s unreachable background probe
        } else {
          // Backoff: 2s -> 4s -> 8s -> 10s
          const backoffSteps = [2000, 4000, 8000, 10000];
          const delay = backoffSteps[control.consecutiveErrors - 1] ?? 10000;
          scheduleNext(delay);
        }
      } finally {
        control.inFlight = false;
      }
    }

    // Initial query delay
    scheduleNext(500);
  }

  function registerAsyncOperation(
    dbId: string,
    op: TrackedAsyncBulkOperation,
    control?: ImportExecutionControl,
  ) {
    const dbOps = operationsByDb[dbId] ? [...operationsByDb[dbId]] : [];
    const existingIndex = dbOps.findIndex((o) => o.kind === "async" && o.operationId === op.operationId);

    const initialOp: TrackedAsyncBulkOperation = {
      ...op,
      expiresAt: op.expiresAt || new Date(Date.now() + 3600000).toISOString(),
      hasAuthoritativeExpiresAt: op.hasAuthoritativeExpiresAt ?? false,
    };

    if (existingIndex >= 0) {
      dbOps[existingIndex] = initialOp;
    } else {
      dbOps.unshift(initialOp);
    }
    operationsByDb = { ...operationsByDb, [dbId]: dbOps };

    if (control) {
      activeExecutionControls.set(op.operationId, control);
    }

    if (op.type === "export" && (op.status === "pending" || op.status === "in_progress")) {
      startPoller(op.operationId);
    }

    notify();
  }

  function updateAsyncOperation(operationId: string, patch: Partial<TrackedAsyncBulkOperation>) {
    let changed = false;
    const nextState: Record<string, BulkHistoryEntry[]> = {};

    for (const [dbId, ops] of Object.entries(operationsByDb)) {
      const idx = ops.findIndex((o) => o.kind === "async" && o.operationId === operationId);
      if (idx >= 0) {
        const existing = ops[idx] as TrackedAsyncBulkOperation;
        let nextExpiresAt = existing.expiresAt;
        let nextHasAuth = existing.hasAuthoritativeExpiresAt ?? false;

        if (patch.hasAuthoritativeExpiresAt) {
          nextExpiresAt = patch.expiresAt!;
          nextHasAuth = true;
        } else if (!nextHasAuth && patch.expiresAt) {
          nextExpiresAt = patch.expiresAt;
        }

        const updated: TrackedAsyncBulkOperation = {
          ...existing,
          ...patch,
          expiresAt: nextExpiresAt,
          hasAuthoritativeExpiresAt: nextHasAuth,
          updatedAt: patch.updatedAt || new Date().toISOString(),
        };

        const updatedOps = [...ops];
        updatedOps[idx] = updated;
        nextState[dbId] = updatedOps;
        changed = true;

        if (
          updated.status === "completed" ||
          updated.status === "failed" ||
          updated.status === "cancelled" ||
          updated.status === "stale"
        ) {
          stopPoller(operationId);
          activeExecutionControls.delete(operationId);
        }
      } else {
        nextState[dbId] = ops;
      }
    }

    if (changed) {
      operationsByDb = nextState;
      notify();
    }
  }

  function registerSyncMutation(dbId: string, mutation: TrackedSyncBulkMutation) {
    const dbOps = operationsByDb[dbId] ? [...operationsByDb[dbId]] : [];
    dbOps.unshift(mutation);
    operationsByDb = { ...operationsByDb, [dbId]: dbOps };
    notify();
  }

  function updateSyncMutation(id: string, patch: Partial<TrackedSyncBulkMutation>) {
    let changed = false;
    const nextState: Record<string, BulkHistoryEntry[]> = {};

    for (const [dbId, ops] of Object.entries(operationsByDb)) {
      const idx = ops.findIndex((m) => m.kind === "sync" && m.id === id);
      if (idx >= 0) {
        const existing = ops[idx] as TrackedSyncBulkMutation;
        const updatedOps = [...ops];
        updatedOps[idx] = { ...existing, ...patch };
        nextState[dbId] = updatedOps;
        changed = true;
      } else {
        nextState[dbId] = ops;
      }
    }

    if (changed) {
      operationsByDb = nextState;
      notify();
    }
  }

  function markOperationStale(operationId: string, reason: string) {
    updateAsyncOperation(operationId, {
      status: "stale",
      error: reason,
      updatedAt: new Date().toISOString(),
    });
    stopPoller(operationId);
  }

  function setOperationUnreachable(operationId: string, unreachable: boolean) {
    updateAsyncOperation(operationId, {
      isUnreachable: unreachable,
      updatedAt: new Date().toISOString(),
    });
  }

  function retryPolling(operationId: string) {
    const control = activePollers.get(operationId);
    if (!control) return;

    if (control.inFlight) {
      control.consecutiveErrors = 0;
      return;
    }

    if (control.timerId !== null) {
      clearTimeout(control.timerId);
      control.timerId = null;
    }
    control.consecutiveErrors = 0;
    setOperationUnreachable(operationId, false);

    // Trigger immediate probe
    control.inFlight = true;
    service
      .getMongoBulkOperationStatus({ operationId })
      .then((res) => {
        if (control.isCancelled) return;
        control.consecutiveErrors = 0;
        updateAsyncOperation(operationId, {
          status: res.status,
          processedDocuments: res.processedDocuments,
          successfulDocuments: res.successfulDocuments ?? res.processedDocuments,
          failedDocuments: res.failedDocuments ?? 0,
          fileSizeBytes: res.fileSizeBytes,
          expiresAt: res.expiresAt,
          hasAuthoritativeExpiresAt: true,
          isUnreachable: false,
        });
        if (res.status === "completed" || res.status === "failed" || res.status === "cancelled") {
          stopPoller(operationId);
        }
      })
      .catch((err: unknown) => {
        if (control.isCancelled) return;
        const errRecord = typeof err === "object" && err !== null ? (err as Record<string, unknown>) : null;
        if (errRecord?.code === "MONGO_NOT_FOUND" || String(err).includes("MONGO_NOT_FOUND")) {
          markOperationStale(operationId, "Operation session is no longer available.");
        }
      })
      .finally(() => {
        control.inFlight = false;
      });
  }

  function cancelOperation(operationId: string): Promise<void> {
    if (activeCancellationPromises.has(operationId)) {
      return activeCancellationPromises.get(operationId)!;
    }

    const control = activeExecutionControls.get(operationId);
    let cancelPromise: Promise<void>;

    if (control) {
      cancelPromise = (async () => {
        try {
          control.abortController.abort();
          await control.cancelFn();
          updateAsyncOperation(operationId, {
            status: "cancelled",
            updatedAt: new Date().toISOString(),
          });
        } finally {
          activeExecutionControls.delete(operationId);
          activeCancellationPromises.delete(operationId);
        }
      })();
    } else {
      cancelPromise = (async () => {
        try {
          stopPoller(operationId);
          await service.cancelMongoBulkOperation({ operationId });
          updateAsyncOperation(operationId, {
            status: "cancelled",
            updatedAt: new Date().toISOString(),
          });
        } catch (err: unknown) {
          const errRecord = typeof err === "object" && err !== null ? (err as Record<string, unknown>) : null;
          if (errRecord?.code === "MONGO_NOT_FOUND" || String(err).includes("MONGO_NOT_FOUND")) {
            markOperationStale(
              operationId,
              "Operation session is no longer available (it may have expired after 1 hour, completed and been cleaned up, or the bridge process restarted).",
            );
          } else {
            updateAsyncOperation(operationId, {
              status: "failed",
              error: err instanceof Error ? err.message : String(err),
            });
          }
        } finally {
          activeCancellationPromises.delete(operationId);
        }
      })();
    }

    activeCancellationPromises.set(operationId, cancelPromise);
    return cancelPromise;
  }

  async function cleanupOperation(operationId: string): Promise<void> {
    try {
      stopPoller(operationId);
      await service.cleanupMongoBulkOperation({ operationId });
    } catch {
      // Idempotent
    }
  }

  function removeOperation(operationId: string) {
    stopPoller(operationId);
    activeExecutionControls.delete(operationId);
    activeCancellationPromises.delete(operationId);

    const nextState: Record<string, BulkHistoryEntry[]> = {};
    for (const [dbId, ops] of Object.entries(operationsByDb)) {
      nextState[dbId] = ops.filter(
        (o) => !(o.kind === "async" ? o.operationId === operationId : o.id === operationId),
      );
    }
    operationsByDb = nextState;
    notify();
  }

  function clearExpiredOperations(dbId: string) {
    const now = Date.now();
    const current = operationsByDb[dbId] || [];

    const filtered = current.filter((op) => {
      // Active operations are strictly immune
      if (op.kind === "async" && (op.status === "pending" || op.status === "in_progress")) {
        return true;
      }
      if (op.kind === "sync" && op.status === "running") {
        return true;
      }

      // Terminal or stale records pruned only if now > expiresAt
      if (op.kind === "async") {
        const expiryTime = new Date(op.expiresAt).getTime();
        return now <= expiryTime;
      }

      return true;
    });

    operationsByDb = { ...operationsByDb, [dbId]: filtered };
    notify();
  }

  function resetStore() {
    for (const opId of [...activePollers.keys()]) {
      stopPoller(opId);
    }
    activePollers.clear();
    activeExecutionControls.clear();
    activeCancellationPromises.clear();
    operationsByDb = {};
    notify();
  }

  if (typeof window !== "undefined") {
    window.addEventListener("beforeunload", () => {
      for (const control of activePollers.values()) {
        control.isCancelled = true;
        if (control.timerId !== null) {
          clearTimeout(control.timerId);
          control.timerId = null;
        }
      }
    });
  }

  return {
    subscribe(listener: () => void) {
      listeners.add(listener);
      return () => {
        listeners.delete(listener);
      };
    },
    getSnapshot(): MongoBulkOperationsState {
      return {
        operationsByDb,
        activePollers,
        activeExecutionControls,
        registerAsyncOperation,
        updateAsyncOperation,
        registerSyncMutation,
        updateSyncMutation,
        markOperationStale,
        setOperationUnreachable,
        retryPolling,
        cancelOperation,
        cleanupOperation,
        removeOperation,
        clearExpiredOperations,
        resetStore,
      };
    },
    // Expose internal references for test inspection
    _activePollers: activePollers,
    _activeExecutionControls: activeExecutionControls,
    _activeCancellationPromises: activeCancellationPromises,
    _startPoller: startPoller,
    _stopPoller: stopPoller,
  };
}

export const defaultMongoBulkOperationsStore = createMongoBulkOperationsStore(databaseService);

export function useMongoBulkOperationsStore(options?: {
  service?: BulkOperationsStoreServiceContract;
}): MongoBulkOperationsState {
  const store = useMemo(() => {
    if (options?.service && options.service !== databaseService) {
      return createMongoBulkOperationsStore(options.service);
    }
    return defaultMongoBulkOperationsStore;
  }, [options?.service]);

  return useSyncExternalStore(store.subscribe, store.getSnapshot, store.getSnapshot);
}
