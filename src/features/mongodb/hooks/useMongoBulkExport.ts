/**
 * MongoDB Milestone 7 Phase 4 — Bulk Export Hook
 *
 * Implements the client-side lifecycle for streaming bulk exports:
 * initialization, dynamic in-flight guarded polling with backoff,
 * stale response rejection, polling deadline timeout, terminal transitions,
 * cancellation, cleanup, and two-phase failure-safe save-to-disk publication.
 *
 * Adheres to docs/M7_PHASE4_SPEC.md §5, §6, §7.1, §7.2, and §13 (Stage 4).
 */

import { useState, useRef, useCallback, useEffect } from "react";
import { databaseService } from "@/services/bridge/database";
import type {
  MongoBulkFormat,
  MongoBulkDocument,
  MongoBulkExportStartRequest,
  MongoBulkExportStartResult,
  MongoBulkGetOperationStatusRequest,
  MongoBulkOperationStatusResult,
  MongoBulkCancelRequest,
  MongoBulkCancelResult,
  MongoBulkCleanupRequest,
  MongoBulkCleanupResult,
  MongoBulkExportSaveToRequest,
  MongoBulkExportSaveToResult,
} from "../types/bulk";

export type ExportState =
  | "idle"
  | "starting"
  | "exporting"
  | "ready-to-save"
  | "saving"
  | "completed"
  | "cancelled"
  | "failed";

export type SaveStatus = "not_saved" | "saving" | "saved" | "save_failed";

export interface ExportProgress {
  processedDocuments: number;
  successfulDocuments: number;
  failedDocuments: number;
  fileSizeBytes?: number;
  bytesWritten?: number;
  destinationPath?: string;
}

export interface BulkExportServiceContract {
  startMongoBulkExport: (req: MongoBulkExportStartRequest) => Promise<MongoBulkExportStartResult>;
  getMongoBulkOperationStatus: (req: MongoBulkGetOperationStatusRequest) => Promise<MongoBulkOperationStatusResult>;
  cancelMongoBulkOperation: (req: MongoBulkCancelRequest) => Promise<MongoBulkCancelResult>;
  cleanupMongoBulkOperation: (req: MongoBulkCleanupRequest) => Promise<MongoBulkCleanupResult>;
  saveMongoBulkExportTo: (req: MongoBulkExportSaveToRequest) => Promise<MongoBulkExportSaveToResult>;
}

export interface ExportConfig {
  collection: string;
  format: MongoBulkFormat;
  filter?: Record<string, unknown>;
  projection?: Record<string, unknown>;
  sort?: Record<string, 1 | -1>;
  limit?: number;
}

export interface MongoBulkExportOptions {
  pollingTimeoutMs?: number;
  initialIntervalMs?: number;
  maxIntervalMs?: number;
}

export interface UseMongoBulkExportReturn {
  state: ExportState;
  saveStatus: SaveStatus;
  progress: ExportProgress;
  operationId: string | null;
  error: string | null;
  warning: string | null;
  format: MongoBulkFormat | null;
  collection: string | null;
  destinationPath: string | null;
  startExport: (config: ExportConfig) => Promise<void>;
  cancelExport: () => Promise<void>;
  saveToFile: (destinationPath: string, overwrite?: boolean) => Promise<MongoBulkExportSaveToResult>;
  reset: () => Promise<void>;
  unmount: () => void;
}

export const INITIAL_EXPORT_PROGRESS: ExportProgress = {
  processedDocuments: 0,
  successfulDocuments: 0,
  failedDocuments: 0,
};

export const DEFAULT_POLLING_INITIAL_INTERVAL_MS = 500;
export const DEFAULT_POLLING_MAX_INTERVAL_MS = 2000;
export const DEFAULT_POLLING_TIMEOUT_MS = 30 * 60 * 1000; // 30 minutes

export function useMongoBulkExport(
  dbId: string,
  service: BulkExportServiceContract = databaseService,
  options?: MongoBulkExportOptions,
): UseMongoBulkExportReturn {
  const [state, setState] = useState<ExportState>("idle");
  const [saveStatus, setSaveStatus] = useState<SaveStatus>("not_saved");
  const [progress, setProgress] = useState<ExportProgress>(INITIAL_EXPORT_PROGRESS);
  const [operationId, setOperationId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [warning, setWarning] = useState<string | null>(null);
  const [format, setFormat] = useState<MongoBulkFormat | null>(null);
  const [collection, setCollection] = useState<string | null>(null);
  const [destinationPath, setDestinationPath] = useState<string | null>(null);

  const stateRef = useRef<ExportState>("idle");
  const saveStatusRef = useRef<SaveStatus>("not_saved");
  const progressRef = useRef<ExportProgress>(INITIAL_EXPORT_PROGRESS);
  const operationIdRef = useRef<string | null>(null);
  const errorRef = useRef<string | null>(null);
  const warningRef = useRef<string | null>(null);
  const formatRef = useRef<MongoBulkFormat | null>(null);
  const collectionRef = useRef<string | null>(null);
  const destinationPathRef = useRef<string | null>(null);
  const isMountedRef = useRef<boolean>(true);

  const pollingTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const isPollingInFlightRef = useRef<boolean>(false);
  const pollSequenceRef = useRef<number>(0);
  const pollingStartTimeRef = useRef<number>(0);
  const currentIntervalRef = useRef<number>(options?.initialIntervalMs ?? DEFAULT_POLLING_INITIAL_INTERVAL_MS);
  const isCancelledRef = useRef<boolean>(false);

  const activeExecutionPromiseRef = useRef<Promise<void> | null>(null);
  const activeCancellationPromiseRef = useRef<Promise<void> | null>(null);

  const pollingTimeoutMs = options?.pollingTimeoutMs ?? DEFAULT_POLLING_TIMEOUT_MS;
  const initialIntervalMs = options?.initialIntervalMs ?? DEFAULT_POLLING_INITIAL_INTERVAL_MS;
  const maxIntervalMs = options?.maxIntervalMs ?? DEFAULT_POLLING_MAX_INTERVAL_MS;

  const safeSetState = useCallback((stateOrUpdater: ExportState | ((prev: ExportState) => ExportState)) => {
    const next = typeof stateOrUpdater === "function" ? stateOrUpdater(stateRef.current) : stateOrUpdater;
    stateRef.current = next;
    if (isMountedRef.current) {
      setState(next);
    }
  }, []);

  const safeSetSaveStatus = useCallback((statusOrUpdater: SaveStatus | ((prev: SaveStatus) => SaveStatus)) => {
    const next = typeof statusOrUpdater === "function" ? statusOrUpdater(saveStatusRef.current) : statusOrUpdater;
    saveStatusRef.current = next;
    if (isMountedRef.current) {
      setSaveStatus(next);
    }
  }, []);

  const safeSetProgress = useCallback((updater: (prev: ExportProgress) => ExportProgress) => {
    const next = updater(progressRef.current);
    progressRef.current = next;
    if (isMountedRef.current) {
      setProgress(next);
    }
  }, []);

  const safeSetError = useCallback((err: string | null) => {
    errorRef.current = err;
    if (isMountedRef.current) {
      setError(err);
    }
  }, []);

  const safeSetWarning = useCallback((warn: string | null) => {
    warningRef.current = warn;
    if (isMountedRef.current) {
      setWarning(warn);
    }
  }, []);

  const safeSetDestinationPath = useCallback((path: string | null) => {
    destinationPathRef.current = path;
    if (isMountedRef.current) {
      setDestinationPath(path);
    }
  }, []);

  const clearPollingTimer = useCallback(() => {
    if (pollingTimerRef.current !== null) {
      clearTimeout(pollingTimerRef.current);
      pollingTimerRef.current = null;
    }
  }, []);

  const stopPolling = useCallback(() => {
    clearPollingTimer();
    isPollingInFlightRef.current = false;
  }, [clearPollingTimer]);

  const pollStatus = useCallback(
    async (opId: string): Promise<void> => {
      if (!isMountedRef.current || isCancelledRef.current) {
        return;
      }

      if (isPollingInFlightRef.current) {
        return;
      }

      // Check polling deadline timeout
      if (Date.now() - pollingStartTimeRef.current > pollingTimeoutMs) {
        stopPolling();
        safeSetError("Export operation timed out after exceeding polling deadline");
        safeSetState("failed");
        return;
      }

      isPollingInFlightRef.current = true;
      const sequence = ++pollSequenceRef.current;

      try {
        const statusRes = await service.getMongoBulkOperationStatus({ operationId: opId });

        // Stale response guard or post-cancel/post-unmount guard
        if (sequence < pollSequenceRef.current || isCancelledRef.current || !isMountedRef.current) {
          return;
        }

        // Terminal: completed
        if (statusRes.status === "completed") {
          stopPolling();
          safeSetProgress((prev) => ({
            ...prev,
            processedDocuments: statusRes.processedDocuments,
            successfulDocuments: statusRes.successfulDocuments ?? statusRes.processedDocuments,
            failedDocuments: statusRes.failedDocuments ?? 0,
            fileSizeBytes: statusRes.fileSizeBytes ?? prev.fileSizeBytes,
          }));
          safeSetState("ready-to-save");
          return;
        }

        // Terminal: failed
        if (statusRes.status === "failed") {
          stopPolling();
          safeSetProgress((prev) => ({
            ...prev,
            processedDocuments: statusRes.processedDocuments,
            failedDocuments: statusRes.failedDocuments ?? 0,
            fileSizeBytes: statusRes.fileSizeBytes ?? prev.fileSizeBytes,
          }));
          safeSetError(statusRes.error || "Export operation failed on bridge");
          safeSetState("failed");
          return;
        }

        // Terminal: cancelled
        if (statusRes.status === "cancelled") {
          stopPolling();
          safeSetState("cancelled");
          return;
        }

        // Non-terminal: pending or in_progress
        safeSetProgress((prev) => ({
          ...prev,
          processedDocuments: statusRes.processedDocuments,
          successfulDocuments: statusRes.successfulDocuments ?? 0,
          failedDocuments: statusRes.failedDocuments ?? 0,
          fileSizeBytes: statusRes.fileSizeBytes ?? prev.fileSizeBytes,
        }));
        safeSetState("exporting");

        // Backoff interval up to maxIntervalMs
        currentIntervalRef.current = Math.min(
          maxIntervalMs,
          Math.floor(currentIntervalRef.current * 1.5),
        );

        if (isMountedRef.current && !isCancelledRef.current) {
          pollingTimerRef.current = setTimeout(() => {
            pollStatus(opId);
          }, currentIntervalRef.current);
        }
      } catch (err: unknown) {
        if (sequence < pollSequenceRef.current || isCancelledRef.current || !isMountedRef.current) {
          return;
        }

        const errRecord = typeof err === "object" && err !== null ? (err as Record<string, unknown>) : null;
        const code = typeof errRecord?.code === "string" ? errRecord.code : "";
        const msg = err instanceof Error ? err.message : String(err);

        // Terminal: Bridge operation not found (restarted or expired after TTL)
        if (code === "MONGO_NOT_FOUND" || msg.includes("MONGO_NOT_FOUND")) {
          stopPolling();
          safeSetError(
            "Export operation session is no longer available (it may have expired, been cleaned up, or the bridge restarted)",
          );
          safeSetState("failed");
          return;
        }

        // Transient error during status query: continue polling with max backoff
        currentIntervalRef.current = maxIntervalMs;
        if (isMountedRef.current && !isCancelledRef.current) {
          pollingTimerRef.current = setTimeout(() => {
            pollStatus(opId);
          }, currentIntervalRef.current);
        }
      } finally {
        isPollingInFlightRef.current = false;
      }
    },
    [
      pollingTimeoutMs,
      maxIntervalMs,
      service,
      stopPolling,
      safeSetState,
      safeSetProgress,
      safeSetError,
    ],
  );

  const handleUnmount = useCallback(() => {
    isMountedRef.current = false;
    clearPollingTimer();
    isCancelledRef.current = true;

    if (stateRef.current === "starting" || stateRef.current === "exporting") {
      const opId = operationIdRef.current;
      if (opId) {
        service.cancelMongoBulkOperation({ operationId: opId }).catch((err: unknown) => {
          console.warn("Unmount export cancellation error:", err);
        });
      }
    }
  }, [service, clearPollingTimer]);

  // Unmount cleanup
  useEffect(() => {
    isMountedRef.current = true;
    return handleUnmount;
  }, [handleUnmount]);

  const cancelExport = useCallback((): Promise<void> => {
    if (activeCancellationPromiseRef.current) {
      return activeCancellationPromiseRef.current;
    }

    const cancelPromise = (async () => {
      isCancelledRef.current = true;
      stopPolling();

      const opId = operationIdRef.current;
      if (opId) {
        try {
          await service.cancelMongoBulkOperation({ operationId: opId });
        } catch (err: unknown) {
          console.warn("Error cancelling bulk export on bridge:", err);
        }
      }

      safeSetState("cancelled");
    })();

    activeCancellationPromiseRef.current = cancelPromise;
    cancelPromise.finally(() => {
      activeCancellationPromiseRef.current = null;
    });

    return cancelPromise;
  }, [service, stopPolling, safeSetState]);

  const reset = useCallback(async (): Promise<void> => {
    stopPolling();
    isCancelledRef.current = true;

    const opId = operationIdRef.current;
    if (opId) {
      try {
        await service.cleanupMongoBulkOperation({ operationId: opId });
      } catch {
        // ignore
      }
    }

    operationIdRef.current = null;
    safeSetState("idle");
    safeSetSaveStatus("not_saved");
    safeSetProgress(() => INITIAL_EXPORT_PROGRESS);
    safeSetError(null);
    safeSetWarning(null);
    safeSetDestinationPath(null);

    formatRef.current = null;
    collectionRef.current = null;
    if (isMountedRef.current) {
      setOperationId(null);
      setFormat(null);
      setCollection(null);
    }
  }, [
    service,
    stopPolling,
    safeSetState,
    safeSetSaveStatus,
    safeSetProgress,
    safeSetError,
    safeSetWarning,
    safeSetDestinationPath,
  ]);

  const startExport = useCallback(
    async (config: ExportConfig): Promise<void> => {
      // Prevent duplicate exports
      if (
        stateRef.current === "starting" ||
        stateRef.current === "exporting" ||
        stateRef.current === "saving" ||
        activeExecutionPromiseRef.current !== null
      ) {
        throw new Error("An export operation is already in progress");
      }

      clearPollingTimer();
      isCancelledRef.current = false;
      pollSequenceRef.current = 0;
      currentIntervalRef.current = initialIntervalMs;

      safeSetState("starting");
      safeSetSaveStatus("not_saved");
      safeSetProgress(() => INITIAL_EXPORT_PROGRESS);
      safeSetError(null);
      safeSetWarning(null);
      safeSetDestinationPath(null);

      formatRef.current = config.format;
      collectionRef.current = config.collection;
      if (isMountedRef.current) {
        setFormat(config.format);
        setCollection(config.collection);
      }

      const execPromise = (async () => {
        try {
          const res = await service.startMongoBulkExport({
            dbId,
            collection: config.collection,
            format: config.format,
            filter: config.filter as MongoBulkDocument | undefined,
            projection: config.projection as MongoBulkDocument | undefined,
            sort: config.sort,
            limit: config.limit,
          });

          if (isCancelledRef.current) {
            try {
              await service.cancelMongoBulkOperation({ operationId: res.operationId });
            } catch {
              // ignore
            }
            safeSetState("cancelled");
            return;
          }

          operationIdRef.current = res.operationId;
          if (isMountedRef.current) {
            setOperationId(res.operationId);
          }

          safeSetState("exporting");
          pollingStartTimeRef.current = Date.now();

          // Begin polling
          pollingTimerRef.current = setTimeout(() => {
            pollStatus(res.operationId);
          }, currentIntervalRef.current);
        } catch (err: unknown) {
          if (isCancelledRef.current) {
            safeSetState("cancelled");
            return;
          }
          const msg = err instanceof Error ? err.message : String(err);
          safeSetError(msg);
          safeSetState("failed");
          throw err;
        } finally {
          activeExecutionPromiseRef.current = null;
        }
      })();

      activeExecutionPromiseRef.current = execPromise;
      await execPromise;
    },
    [
      dbId,
      initialIntervalMs,
      service,
      clearPollingTimer,
      pollStatus,
      safeSetState,
      safeSetSaveStatus,
      safeSetProgress,
      safeSetError,
      safeSetWarning,
      safeSetDestinationPath,
    ],
  );

  const saveToFile = useCallback(
    async (
      destPath: string,
      overwrite?: boolean,
    ): Promise<MongoBulkExportSaveToResult> => {
      const opId = operationIdRef.current;
      if (!opId) {
        throw new Error("Cannot save: export operation ID is missing");
      }

      if (
        stateRef.current !== "ready-to-save" &&
        !(stateRef.current === "failed" && saveStatusRef.current === "save_failed")
      ) {
        throw new Error(`Cannot save export in '${stateRef.current}' state`);
      }

      if (!destPath || typeof destPath !== "string" || destPath.trim() === "") {
        throw new Error("Destination path is required");
      }

      safeSetState("saving");
      safeSetSaveStatus("saving");
      safeSetError(null);

      try {
        const res = await service.saveMongoBulkExportTo({
          operationId: opId,
          destinationPath: destPath,
          options: { overwrite },
        });

        safeSetSaveStatus("saved");
        safeSetState("completed");
        safeSetDestinationPath(res.destinationPath);
        if (res.warning) {
          safeSetWarning(res.warning);
        }
        safeSetProgress((prev) => ({
          ...prev,
          bytesWritten: res.bytesWritten,
          destinationPath: res.destinationPath,
        }));

        return res;
      } catch (err: unknown) {
        const errRecord = typeof err === "object" && err !== null ? (err as Record<string, unknown>) : null;
        const code = typeof errRecord?.code === "string" ? errRecord.code : "";
        const msg = err instanceof Error ? err.message : String(err);

        // MONGO_FILE_EXISTS: revert to ready-to-save, reset saveStatus, re-throw for overwrite prompt
        if (code === "MONGO_FILE_EXISTS" || msg.includes("MONGO_FILE_EXISTS") || msg.includes("already exists")) {
          safeSetSaveStatus("not_saved");
          safeSetState("ready-to-save");
          throw err;
        }

        // Other save failures: mark save_failed, preserve source export for retry
        safeSetSaveStatus("save_failed");
        safeSetState("failed");
        safeSetError(msg);
        throw err;
      }
    },
    [
      service,
      safeSetState,
      safeSetSaveStatus,
      safeSetError,
      safeSetWarning,
      safeSetDestinationPath,
      safeSetProgress,
    ],
  );

  return {
    get state() {
      return stateRef.current;
    },
    get saveStatus() {
      return saveStatusRef.current;
    },
    get progress() {
      return progressRef.current;
    },
    get operationId() {
      return operationIdRef.current;
    },
    get error() {
      return errorRef.current;
    },
    get warning() {
      return warningRef.current;
    },
    get format() {
      return formatRef.current;
    },
    get collection() {
      return collectionRef.current;
    },
    get destinationPath() {
      return destinationPathRef.current;
    },
    startExport,
    cancelExport,
    saveToFile,
    reset,
    unmount: handleUnmount,
  };
}
