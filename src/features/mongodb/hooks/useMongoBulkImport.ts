/**
 * MongoDB Milestone 7 Phase 4 — Bulk Import Hook
 *
 * Implements the client-side lifecycle for chunked bulk imports:
 * pre-validation, operation start, sequential upload loop with transient retry,
 * progress tracking, terminal MONGO_NOT_FOUND handling, and cancellation/cleanup.
 *
 * Adheres to docs/M7_PHASE4_SPEC.md §4.1, §4.2, and §4.3.
 */

import { useState, useRef, useCallback, useEffect } from "react";
import { databaseService } from "@/services/bridge/database";
import type {
  MongoBulkFormat,
  MongoBulkImportStartRequest,
  MongoBulkImportStartResult,
  MongoBulkImportChunkRequest,
  MongoBulkImportChunkResult,
  MongoBulkCancelRequest,
  MongoBulkCancelResult,
  MongoBulkCleanupRequest,
  MongoBulkCleanupResult,
  MongoBulkGetOperationStatusRequest,
  MongoBulkOperationStatusResult,
} from "../types/bulk";
import {
  createIncrementalChunkReader,
  type ImportChunk,
} from "../utils/importReader";
import {
  validateFileSize,
  MAX_IMPORT_TOTAL_SIZE_BYTES,
  ImportLimitExceededError,
  ZeroDocumentImportError,
} from "../utils/payloadAccounting";

export type ImportState =
  | "idle"
  | "validating"
  | "starting"
  | "uploading"
  | "cancelling"
  | "cancelled"
  | "completed"
  | "failed";

export interface ImportProgress {
  documentsParsed: number;
  documentsSubmitted: number;
  documentsAcknowledged: number;
  totalInserted: number;
  totalFailed: number;
  bytesAcknowledged: number;
  cumulativeBytesSent: number;
  currentChunkIndex: number;
  totalChunksExpected?: number;
}

export interface BulkImportServiceContract {
  startMongoBulkImport: (request: MongoBulkImportStartRequest) => Promise<MongoBulkImportStartResult>;
  importMongoBulkChunk: (request: MongoBulkImportChunkRequest) => Promise<MongoBulkImportChunkResult>;
  cancelMongoBulkOperation: (request: MongoBulkCancelRequest) => Promise<MongoBulkCancelResult>;
  cleanupMongoBulkOperation: (request: MongoBulkCleanupRequest) => Promise<MongoBulkCleanupResult>;
  getMongoBulkOperationStatus?: (request: MongoBulkGetOperationStatusRequest) => Promise<MongoBulkOperationStatusResult>;
}

export interface BulkImportCallbacks {
  onStateChange: (state: ImportState) => void;
  onProgressChange: (updater: (prev: ImportProgress) => ImportProgress) => void;
  onErrorChange: (error: string | null) => void;
  onOperationIdChange: (operationId: string | null) => void;
  isMounted?: () => boolean;
}

export interface UseMongoBulkImportReturn {
  state: ImportState;
  progress: ImportProgress;
  operationId: string | null;
  error: string | null;
  format: MongoBulkFormat | null;
  collection: string | null;
  startImport: (file: File, collection: string, format: MongoBulkFormat) => Promise<void>;
  cancelImport: () => Promise<void>;
  reset: () => Promise<void>;
}

export const INITIAL_IMPORT_PROGRESS: ImportProgress = {
  documentsParsed: 0,
  documentsSubmitted: 0,
  documentsAcknowledged: 0,
  totalInserted: 0,
  totalFailed: 0,
  bytesAcknowledged: 0,
  cumulativeBytesSent: 0,
  currentChunkIndex: 0,
};

/**
 * Predicate to classify whether an error during chunk upload is a transient
 * network/transport error that should be retried.
 */
export function isTransientTransportError(err: unknown): boolean {
  if (!err) return false;

  const errRecord = typeof err === "object" ? (err as Record<string, unknown>) : null;
  const code = typeof errRecord?.code === "string" ? errRecord.code : "";
  const name = typeof errRecord?.name === "string" ? errRecord.name : "";
  const message = err instanceof Error ? err.message : String(err);
  const lowerMsg = message.toLowerCase();

  // Terminal: MONGO_NOT_FOUND
  if (code === "MONGO_NOT_FOUND" || message.includes("MONGO_NOT_FOUND")) {
    return false;
  }

  // Terminal: Any bridge error with code starting with MONGO_
  if (code.startsWith("MONGO_")) {
    return false;
  }

  // Terminal: Syntax errors, validation errors, security violations
  if (
    lowerMsg.includes("syntax error") ||
    lowerMsg.includes("validation") ||
    lowerMsg.includes("security") ||
    name === "SyntaxError" ||
    name === "ZeroDocumentImportError" ||
    name === "ImportLimitExceededError" ||
    name === "ImportSerializationError"
  ) {
    return false;
  }

  // Transient network codes
  const transientCodes = new Set([
    "ECONNRESET",
    "ETIMEDOUT",
    "ECONNREFUSED",
    "EPIPE",
    "ENOTFOUND",
    "EAI_AGAIN",
    "UND_ERR_SOCKET",
    "ERR_SOCKET_TIMEOUT",
  ]);
  if (transientCodes.has(code)) {
    return true;
  }

  // Transient network messages
  if (
    lowerMsg.includes("failed to fetch") ||
    lowerMsg.includes("networkerror") ||
    lowerMsg.includes("network error") ||
    lowerMsg.includes("timeout") ||
    lowerMsg.includes("socket hang up") ||
    lowerMsg.includes("connection reset")
  ) {
    return true;
  }

  return false;
}

/**
 * Core orchestration engine for bulk imports.
 * Executes pre-validation, handshake RPC, sequential chunk uploads with retry,
 * and error handling / cleanup.
 */
export async function executeMongoBulkImport(
  dbId: string,
  file: File,
  targetCollection: string,
  importFormat: MongoBulkFormat,
  abortController: AbortController,
  callbacks: BulkImportCallbacks,
  service: BulkImportServiceContract = databaseService,
): Promise<void> {
  const isMounted = callbacks.isMounted ?? (() => true);

  // 1. Pre-validation
  callbacks.onStateChange("validating");
  callbacks.onErrorChange(null);
  callbacks.onProgressChange(() => INITIAL_IMPORT_PROGRESS);

  const sizeCheck = validateFileSize(file.size);
  if (!sizeCheck.valid) {
    const errorMsg = sizeCheck.error ?? "Invalid file size";
    callbacks.onErrorChange(errorMsg);
    callbacks.onStateChange("failed");
    if (file.size <= 0) {
      throw new ZeroDocumentImportError(errorMsg);
    }
    throw new ImportLimitExceededError(errorMsg);
  }

  let currentOpId: string | null = null;
  let cumulativeBytesSent = 0;
  let totalInsertedDocs = 0;
  let totalFailedDocs = 0;
  let docsParsed = 0;
  let docsSubmitted = 0;
  let docsAcknowledged = 0;
  let bytesAck = 0;
  let cancellationHandled = false;
  let cancellationError: unknown = null;

  async function handleCancellation(opId: string | null): Promise<void> {
    if (cancellationHandled) {
      if (cancellationError) {
        throw cancellationError;
      }
      return;
    }
    cancellationHandled = true;
    if (opId) {
      try {
        const cancelRes = await service.cancelMongoBulkOperation({ operationId: opId });
        if (cancelRes.status !== "cancelled") {
          const errorMsg = `Bridge failed to cancel operation ${opId}: status is ${cancelRes.status}`;
          if (isMounted()) {
            callbacks.onErrorChange(errorMsg);
          }
          callbacks.onStateChange("failed");
          const err = new Error(errorMsg);
          cancellationError = err;
          throw err;
        }
      } catch (err: unknown) {
        const errorMsg = err instanceof Error ? err.message : String(err);
        if (isMounted()) {
          callbacks.onErrorChange(errorMsg);
        }
        callbacks.onStateChange("failed");
        cancellationError = err;
        throw err;
      }
    }
    callbacks.onStateChange("cancelled");
  }

  try {
    // Create incremental reader.
    const reader = createIncrementalChunkReader(file, importFormat, {
      signal: abortController.signal,
    });

    // Advance reader to read the first chunk. If file has 0 documents (empty file, empty array, header-only CSV),
    // reader.next() will immediately throw ZeroDocumentImportError before startMongoBulkImport is called!
    const firstChunkResult = await reader.next();
    if (firstChunkResult.done) {
      throw new ZeroDocumentImportError("File contains no documents to import.");
    }
    const firstChunk = firstChunkResult.value;

    if (abortController.signal.aborted) {
      await handleCancellation(null);
      return;
    }

    // 2. Start Handshake RPC with Bridge
    callbacks.onStateChange("starting");
    const startResult = await service.startMongoBulkImport({
      dbId,
      collection: targetCollection,
      format: importFormat,
    });

    currentOpId = startResult.operationId;
    callbacks.onOperationIdChange(currentOpId);

    // If cancellation arrived while handshake was in flight, cancel bridge operation immediately!
    if (abortController.signal.aborted) {
      await handleCancellation(currentOpId);
      return;
    }

    // 3. Sequential Chunk Upload Loop
    callbacks.onStateChange("uploading");

    async function sendChunk(chunk: ImportChunk): Promise<void> {
      if (abortController.signal.aborted) {
        await handleCancellation(currentOpId);
        return;
      }

      // Pre-send cumulative 16 MB session limit check
      if (cumulativeBytesSent + chunk.byteLength > MAX_IMPORT_TOTAL_SIZE_BYTES) {
        throw new ImportLimitExceededError(
          `Import halted: next chunk would exceed the cumulative 16 MB session limit ` +
            `(${cumulativeBytesSent} bytes sent + ${chunk.byteLength} bytes pending > 16 MB). ` +
            `${totalInsertedDocs} documents remain committed in MongoDB.`,
        );
      }

      docsParsed += chunk.documentCount;
      docsSubmitted += chunk.documentCount;
      cumulativeBytesSent += chunk.byteLength;

      callbacks.onProgressChange((prev) => ({
        ...prev,
        documentsParsed: docsParsed,
        documentsSubmitted: docsSubmitted,
        cumulativeBytesSent,
        currentChunkIndex: chunk.chunkIndex,
      }));

      // Send chunk with automatic idempotent retry for transient transport failures
      let lastChunkError: unknown = null;
      let chunkSuccess = false;
      let lastChunkRes: MongoBulkImportChunkResult | null = null;
      const maxRetries = 2;

      for (let attempt = 0; attempt <= maxRetries; attempt++) {
        try {
          // Track chunk promise so that if cancellation triggers while in-flight, it is awaited
          const chunkPromise = service.importMongoBulkChunk({
            operationId: currentOpId as string,
            chunkIndex: chunk.chunkIndex,
            isLastChunk: chunk.isLastChunk,
            payload: chunk.payload,
          });

          const res = await chunkPromise;
          lastChunkRes = res;

          docsAcknowledged += chunk.documentCount;
          totalInsertedDocs = res.totalInserted;
          totalFailedDocs = res.totalFailed;
          bytesAck += chunk.byteLength;

          callbacks.onProgressChange((prev) => ({
            ...prev,
            documentsAcknowledged: docsAcknowledged,
            totalInserted: totalInsertedDocs,
            totalFailed: totalFailedDocs,
            bytesAcknowledged: bytesAck,
          }));

          chunkSuccess = true;
          break;
        } catch (err: unknown) {
          lastChunkError = err;
          const errStr = String(err);
          const errCode = (err as Record<string, unknown>)?.code;

          // If cancelled during in-flight chunk failure
          if (abortController.signal.aborted) {
            break;
          }

          // MONGO_NOT_FOUND: unavailable session / bridge restarted. Immediate halt without retry!
          if (errStr.includes("MONGO_NOT_FOUND") || errCode === "MONGO_NOT_FOUND") {
            throw new Error(
              `MONGO_NOT_FOUND: Operation session is no longer available in bridge memory. ${totalInsertedDocs} documents remain committed.`,
            );
          }

          // Classify transient vs non-retryable
          if (!isTransientTransportError(err)) {
            // Non-retryable terminal error
            throw err;
          }

          if (attempt < maxRetries) {
            // Exponential backoff between retries (50ms -> 100ms)
            await new Promise((resolve) => setTimeout(resolve, 50 * Math.pow(2, attempt)));
          }
        }
      }

      if (abortController.signal.aborted) {
        await handleCancellation(currentOpId);
        return;
      }

      if (!chunkSuccess || !lastChunkRes) {
        throw lastChunkError;
      }

      // If this was the last chunk, verify final completion status
      if (chunk.isLastChunk) {
        if (lastChunkRes.status === "failed") {
          const errorMsg = `Bulk import failed on final chunk for operation ${currentOpId}`;
          callbacks.onErrorChange(errorMsg);
          callbacks.onStateChange("failed");
          throw new Error(errorMsg);
        }

        if (lastChunkRes.status === "completed" && lastChunkRes.isComplete === true) {
          // Fully verified completed
          return;
        }

        // Status remained in_progress or isComplete is false: reconcile via getMongoBulkOperationStatus
        if (service.getMongoBulkOperationStatus) {
          const statusRes = await service.getMongoBulkOperationStatus({
            operationId: currentOpId as string,
          });
          if (statusRes.status === "completed") {
            return;
          } else if (statusRes.status === "failed") {
            const errorMsg = statusRes.error ?? `Operation ${currentOpId} failed on bridge`;
            callbacks.onErrorChange(errorMsg);
            callbacks.onStateChange("failed");
            throw new Error(errorMsg);
          } else {
            const errorMsg = `Operation ${currentOpId} remained in_progress after final chunk`;
            callbacks.onErrorChange(errorMsg);
            callbacks.onStateChange("failed");
            throw new Error(errorMsg);
          }
        } else {
          const errorMsg = `Operation ${currentOpId} not marked complete after final chunk`;
          callbacks.onErrorChange(errorMsg);
          callbacks.onStateChange("failed");
          throw new Error(errorMsg);
        }
      }
    }

    // Send first chunk
    await sendChunk(firstChunk);

    if (abortController.signal.aborted) {
      await handleCancellation(currentOpId);
      return;
    }

    // Send subsequent chunks if any remain
    if (!firstChunk.isLastChunk) {
      for await (const chunk of reader) {
        if (abortController.signal.aborted) {
          await handleCancellation(currentOpId);
          return;
        }
        await sendChunk(chunk);
        if (abortController.signal.aborted) {
          return;
        }
      }
    }

    if (abortController.signal.aborted) {
      await handleCancellation(currentOpId);
      return;
    }

    // Upload loop finished successfully
    callbacks.onStateChange("completed");
  } catch (err: unknown) {
    if (cancellationError || err === cancellationError) {
      throw (cancellationError ?? err);
    }

    if (abortController.signal.aborted) {
      try {
        await handleCancellation(currentOpId);
        return;
      } catch (cancelErr) {
        throw cancelErr;
      }
    }

    const msg = err instanceof Error ? err.message : String(err);
    if (isMounted()) {
      callbacks.onErrorChange(msg);
    }
    callbacks.onStateChange("failed");

    // Cleanup operation on failure ONLY after operation has settled and failed (not cancelling/in-progress)
    if (currentOpId && !abortController.signal.aborted) {
      try {
        await service.cleanupMongoBulkOperation({ operationId: currentOpId });
      } catch {
        // Ignore cleanup failure during error reporting
      }
    }
    throw err;
  }
}

export function useMongoBulkImport(
  dbId: string,
  service: BulkImportServiceContract = databaseService,
): UseMongoBulkImportReturn {
  const [state, setState] = useState<ImportState>("idle");
  const [progress, setProgress] = useState<ImportProgress>(INITIAL_IMPORT_PROGRESS);
  const [operationId, setOperationId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [format, setFormat] = useState<MongoBulkFormat | null>(null);
  const [collection, setCollection] = useState<string | null>(null);

  const abortControllerRef = useRef<AbortController | null>(null);
  const operationIdRef = useRef<string | null>(null);
  const isMountedRef = useRef<boolean>(true);
  const activeExecutionPromiseRef = useRef<Promise<void> | null>(null);
  const activeCancellationPromiseRef = useRef<Promise<void> | null>(null);

  // Keep ref synchronized with state for callbacks
  useEffect(() => {
    isMountedRef.current = true;
    return () => {
      isMountedRef.current = false;
      if (abortControllerRef.current) {
        abortControllerRef.current.abort();
      }
      const currentOpId = operationIdRef.current;
      if (currentOpId) {
        service.cancelMongoBulkOperation({ operationId: currentOpId }).catch((err: unknown) => {
          console.warn("Unmount cancellation error:", err);
        });
      }
    };
  }, [service]);

  const safeSetState = useCallback((stateOrUpdater: ImportState | ((prev: ImportState) => ImportState)) => {
    if (isMountedRef.current) {
      setState(stateOrUpdater);
    }
  }, []);

  const safeSetProgress = useCallback((updater: (prev: ImportProgress) => ImportProgress) => {
    if (isMountedRef.current) {
      setProgress(updater);
    }
  }, []);

  const cancelImport = useCallback((): Promise<void> => {
    // If a cancellation is already in flight, return the existing cancellation promise
    if (activeCancellationPromiseRef.current) {
      return activeCancellationPromiseRef.current;
    }

    const cancelPromise = (async () => {
      safeSetState("cancelling");
      if (abortControllerRef.current) {
        abortControllerRef.current.abort();
      }

      // If active execution is in progress, await it so in-flight chunks and handshake complete/cancel
      const activeExec = activeExecutionPromiseRef.current;
      if (activeExec) {
        try {
          await activeExec;
        } catch {
          // Handled within executeMongoBulkImport
        }
      } else {
        const currentOpId = operationIdRef.current;
        if (currentOpId) {
          try {
            const cancelRes = await service.cancelMongoBulkOperation({ operationId: currentOpId });
            if (cancelRes.status !== "cancelled") {
              if (isMountedRef.current) {
                setError(`Cancellation failed with status ${cancelRes.status}`);
              }
              safeSetState("failed");
              return;
            }
          } catch (err: unknown) {
            const msg = err instanceof Error ? err.message : String(err);
            if (isMountedRef.current) {
              setError(msg);
            }
            safeSetState("failed");
            return;
          }
        }
        safeSetState("cancelled");
      }
    })();

    activeCancellationPromiseRef.current = cancelPromise;
    cancelPromise.finally(() => {
      activeCancellationPromiseRef.current = null;
    });

    return cancelPromise;
  }, [safeSetState, service]);

  const reset = useCallback(async (): Promise<void> => {
    if (activeExecutionPromiseRef.current) {
      try {
        await cancelImport();
      } catch {
        // ignore
      }
    }
    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
      abortControllerRef.current = null;
    }
    operationIdRef.current = null;
    safeSetState("idle");
    safeSetProgress(() => INITIAL_IMPORT_PROGRESS);
    if (isMountedRef.current) {
      setOperationId(null);
      setError(null);
      setFormat(null);
      setCollection(null);
    }
  }, [safeSetState, safeSetProgress, cancelImport]);

  const startImport = useCallback(
    async (file: File, targetCollection: string, importFormat: MongoBulkFormat): Promise<void> => {
      // Prevent duplicate imports
      if (activeExecutionPromiseRef.current) {
        throw new Error("An import operation is already in progress");
      }

      if (isMountedRef.current) {
        setFormat(importFormat);
        setCollection(targetCollection);
      }

      const abortController = new AbortController();
      abortControllerRef.current = abortController;

      const execPromise = (async () => {
        try {
          await executeMongoBulkImport(
            dbId,
            file,
            targetCollection,
            importFormat,
            abortController,
            {
              onStateChange: safeSetState,
              onProgressChange: safeSetProgress,
              onErrorChange: (err) => {
                if (isMountedRef.current) setError(err);
              },
              onOperationIdChange: (opId) => {
                operationIdRef.current = opId;
                if (isMountedRef.current) setOperationId(opId);
              },
              isMounted: () => isMountedRef.current,
            },
            service,
          );
        } finally {
          activeExecutionPromiseRef.current = null;
        }
      })();

      activeExecutionPromiseRef.current = execPromise;
      await execPromise;
    },
    [dbId, safeSetState, safeSetProgress, service],
  );

  return {
    state,
    progress,
    operationId,
    error,
    format,
    collection,
    startImport,
    cancelImport,
    reset,
  };
}
