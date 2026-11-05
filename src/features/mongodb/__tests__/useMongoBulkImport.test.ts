/**
 * MongoDB Milestone 7 Phase 4 — Bulk Import Hook and Engine Unit Tests
 *
 * Exercises the complete client-side import lifecycle:
 * - Pre-validation and file size limits
 * - Zero-document rejection before bridge handshake
 * - Handshake RPC and sequential chunk upload
 * - Progress tracking accuracy
 * - Transient retry mechanism with identical payloads
 * - Terminal MONGO_NOT_FOUND and MONGO_VALIDATION_ERROR halt without retry
 * - In-flight chunk awaiting and reconciliation on cancellation
 * - Handshake cancellation safety (no orphaned operations)
 * - Final operation completion and status reconciliation
 * - Hook-level duplicate import prevention and cancellation deduplication
 * - Stage 5 cancellation between chunks (halts reader, 0 subsequent chunks, 1 cancel RPC)
 * - Stage 5 in-flight chunk success/failure progress reconciliation
 * - Stage 5 delegated unmount (cancelOnUnmount: false) vs standalone unmount (cancelOnUnmount: true)
 */

import { describe, it } from "node:test";
import assert from "node:assert/strict";
import React from "react";
import ReactDOMServer from "react-dom/server";
import {
  executeMongoBulkImport,
  useMongoBulkImport,
  type BulkImportServiceContract,
  type ImportState,
  type ImportProgress,
  type UseMongoBulkImportReturn,
  INITIAL_IMPORT_PROGRESS,
} from "../hooks/useMongoBulkImport";
import {
  ZeroDocumentImportError,
  ImportLimitExceededError,
  MAX_FILE_SIZE_BYTES,
} from "../utils/payloadAccounting";
import type {
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

function createMockService(overrides?: Partial<BulkImportServiceContract>): BulkImportServiceContract & {
  calls: {
    start: MongoBulkImportStartRequest[];
    chunk: MongoBulkImportChunkRequest[];
    cancel: MongoBulkCancelRequest[];
    cleanup: MongoBulkCleanupRequest[];
    status: MongoBulkGetOperationStatusRequest[];
  };
} {
  const calls = {
    start: [] as MongoBulkImportStartRequest[],
    chunk: [] as MongoBulkImportChunkRequest[],
    cancel: [] as MongoBulkCancelRequest[],
    cleanup: [] as MongoBulkCleanupRequest[],
    status: [] as MongoBulkGetOperationStatusRequest[],
  };

  const service: BulkImportServiceContract = {
    async startMongoBulkImport(req) {
      calls.start.push(req);
      if (overrides?.startMongoBulkImport) {
        return overrides.startMongoBulkImport(req);
      }
      return {
        operationId: "mock-op-123",
        status: "in_progress",
        createdAt: new Date().toISOString(),
        format: req.format,
        collection: req.collection,
      };
    },
    async importMongoBulkChunk(req) {
      calls.chunk.push(req);
      if (overrides?.importMongoBulkChunk) {
        return overrides.importMongoBulkChunk(req);
      }
      return {
        operationId: req.operationId,
        chunkIndex: req.chunkIndex,
        insertedCount: 10,
        failedCount: 0,
        totalInserted: 10,
        totalFailed: 0,
        status: req.isLastChunk ? "completed" : "in_progress",
        isComplete: req.isLastChunk ?? false,
      };
    },
    async cancelMongoBulkOperation(req) {
      calls.cancel.push(req);
      if (overrides?.cancelMongoBulkOperation) {
        return overrides.cancelMongoBulkOperation(req);
      }
      return {
        operationId: req.operationId,
        status: "cancelled",
        message: "Operation cancelled successfully",
        cancelledAt: new Date().toISOString(),
      };
    },
    async cleanupMongoBulkOperation(req) {
      calls.cleanup.push(req);
      if (overrides?.cleanupMongoBulkOperation) {
        return overrides.cleanupMongoBulkOperation(req);
      }
      return {
        operationId: req.operationId,
        success: true,
      };
    },
    async getMongoBulkOperationStatus(req) {
      calls.status.push(req);
      if (overrides?.getMongoBulkOperationStatus) {
        return overrides.getMongoBulkOperationStatus(req);
      }
      return {
        operationId: req.operationId,
        type: "import",
        status: "completed",
        collection: "users",
        format: "json",
        processedDocuments: 10,
        successfulDocuments: 10,
        failedDocuments: 0,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
        expiresAt: new Date().toISOString(),
      };
    },
  };

  return Object.assign(service, { calls });
}

function createCallbackTracker() {
  const stateTransitions: ImportState[] = [];
  let latestProgress: ImportProgress = { ...INITIAL_IMPORT_PROGRESS };
  let latestError: string | null = null;
  let latestOpId: string | null = null;

  return {
    stateTransitions,
    get progress() {
      return latestProgress;
    },
    get error() {
      return latestError;
    },
    get operationId() {
      return latestOpId;
    },
    callbacks: {
      onStateChange: (s: ImportState) => {
        stateTransitions.push(s);
      },
      onProgressChange: (updater: (prev: ImportProgress) => ImportProgress) => {
        latestProgress = updater(latestProgress);
      },
      onErrorChange: (err: string | null) => {
        latestError = err;
      },
      onOperationIdChange: (opId: string | null) => {
        latestOpId = opId;
      },
    },
  };
}

describe("useMongoBulkImport / executeMongoBulkImport Workflow", () => {
  it("successfully completes import for a valid JSON array", async () => {
    const jsonContent = JSON.stringify([
      { name: "Alice", age: 30 },
      { name: "Bob", age: 25 },
    ]);
    const file = new File([jsonContent], "users.json", { type: "application/json" });
    const mockService = createMockService({
      importMongoBulkChunk: async (req) => ({
        operationId: req.operationId,
        chunkIndex: req.chunkIndex,
        insertedCount: 2,
        failedCount: 0,
        totalInserted: 2,
        totalFailed: 0,
        status: "completed",
        isComplete: true,
      }),
    });
    const tracker = createCallbackTracker();
    const abortController = new AbortController();

    await executeMongoBulkImport(
      "db-1",
      file,
      "users",
      "json",
      abortController,
      tracker.callbacks,
      mockService,
    );

    // Verify state progression
    assert.deepEqual(tracker.stateTransitions, ["validating", "starting", "uploading", "completed"]);
    assert.equal(tracker.error, null);
    assert.equal(tracker.operationId, "mock-op-123");

    // Verify service calls
    assert.equal(mockService.calls.start.length, 1);
    assert.equal(mockService.calls.start[0].dbId, "db-1");
    assert.equal(mockService.calls.start[0].collection, "users");
    assert.equal(mockService.calls.start[0].format, "json");

    assert.equal(mockService.calls.chunk.length, 1);
    assert.equal(mockService.calls.chunk[0].chunkIndex, 0);
    assert.equal(mockService.calls.chunk[0].isLastChunk, true);

    // Verify progress tracking
    assert.equal(tracker.progress.documentsParsed, 2);
    assert.equal(tracker.progress.documentsAcknowledged, 2);
    assert.equal(tracker.progress.totalInserted, 2);
    assert.equal(tracker.progress.totalFailed, 0);
  });

  it("successfully handles multi-chunk sequential uploads with correct chunkIndex and isLastChunk", async () => {
    // Generate 1500 documents so reader creates 2 chunks (MAX_IMPORT_CHUNK_DOCS = 1000)
    const docs = Array.from({ length: 1500 }, (_, i) => ({ id: i, name: `User_${i}` }));
    const file = new File([JSON.stringify(docs)], "users_large.json", { type: "application/json" });

    let runningInserted = 0;
    const mockService = createMockService({
      importMongoBulkChunk: async (req) => {
        const chunkDocs = JSON.parse(req.payload as string) as unknown[];
        runningInserted += chunkDocs.length;
        return {
          operationId: req.operationId,
          chunkIndex: req.chunkIndex,
          insertedCount: chunkDocs.length,
          failedCount: 0,
          totalInserted: runningInserted,
          totalFailed: 0,
          status: req.isLastChunk ? "completed" : "in_progress",
          isComplete: req.isLastChunk ?? false,
        };
      },
    });

    const tracker = createCallbackTracker();
    const abortController = new AbortController();

    await executeMongoBulkImport(
      "db-1",
      file,
      "users",
      "json",
      abortController,
      tracker.callbacks,
      mockService,
    );

    assert.deepEqual(tracker.stateTransitions, ["validating", "starting", "uploading", "completed"]);
    assert.equal(mockService.calls.chunk.length, 2);

    // Chunk 0
    assert.equal(mockService.calls.chunk[0].chunkIndex, 0);
    assert.equal(mockService.calls.chunk[0].isLastChunk, false);

    // Chunk 1
    assert.equal(mockService.calls.chunk[1].chunkIndex, 1);
    assert.equal(mockService.calls.chunk[1].isLastChunk, true);

    // Final progress
    assert.equal(tracker.progress.documentsParsed, 1500);
    assert.equal(tracker.progress.documentsAcknowledged, 1500);
    assert.equal(tracker.progress.totalInserted, 1500);
  });

  it("rejects files exceeding MAX_FILE_SIZE_BYTES (32 MB) before reader or handshake", async () => {
    const oversizedFile = {
      name: "giant.json",
      size: MAX_FILE_SIZE_BYTES + 1024,
      slice: () => new Blob(),
    } as unknown as File;

    const mockService = createMockService();
    const tracker = createCallbackTracker();
    const abortController = new AbortController();

    await assert.rejects(
      async () => {
        await executeMongoBulkImport(
          "db-1",
          oversizedFile,
          "users",
          "json",
          abortController,
          tracker.callbacks,
          mockService,
        );
      },
      (err: Error) => {
        assert.ok(err instanceof ImportLimitExceededError);
        assert.ok(err.message.includes("exceeds maximum allowable size (32 MB)"));
        return true;
      },
    );

    assert.deepEqual(tracker.stateTransitions, ["validating", "failed"]);
    assert.equal(mockService.calls.start.length, 0);
    assert.equal(mockService.calls.chunk.length, 0);
  });

  it("rejects 0-byte file before startMongoBulkImport handshake is called", async () => {
    const emptyFile = new File([], "empty.json", { type: "application/json" });
    const mockService = createMockService();
    const tracker = createCallbackTracker();
    const abortController = new AbortController();

    await assert.rejects(
      async () => {
        await executeMongoBulkImport(
          "db-1",
          emptyFile,
          "users",
          "json",
          abortController,
          tracker.callbacks,
          mockService,
        );
      },
      ZeroDocumentImportError,
    );

    assert.equal(mockService.calls.start.length, 0);
    assert.equal(mockService.calls.chunk.length, 0);
    assert.deepEqual(tracker.stateTransitions, ["validating", "failed"]);
  });

  it("rejects empty JSON array [] before startMongoBulkImport handshake is called", async () => {
    const emptyArrayFile = new File(["[]"], "empty_array.json", { type: "application/json" });
    const mockService = createMockService();
    const tracker = createCallbackTracker();
    const abortController = new AbortController();

    await assert.rejects(
      async () => {
        await executeMongoBulkImport(
          "db-1",
          emptyArrayFile,
          "users",
          "json",
          abortController,
          tracker.callbacks,
          mockService,
        );
      },
      ZeroDocumentImportError,
    );

    assert.equal(mockService.calls.start.length, 0);
    assert.deepEqual(tracker.stateTransitions, ["validating", "failed"]);
  });

  it("rejects header-only CSV before startMongoBulkImport handshake is called", async () => {
    const headerOnlyCsv = new File(["id,name,role\n"], "empty.csv", { type: "text/csv" });
    const mockService = createMockService();
    const tracker = createCallbackTracker();
    const abortController = new AbortController();

    await assert.rejects(
      async () => {
        await executeMongoBulkImport(
          "db-1",
          headerOnlyCsv,
          "users",
          "csv",
          abortController,
          tracker.callbacks,
          mockService,
        );
      },
      ZeroDocumentImportError,
    );

    assert.equal(mockService.calls.start.length, 0);
    assert.deepEqual(tracker.stateTransitions, ["validating", "failed"]);
  });

  it("retries transient transport errors (e.g. ECONNRESET, socket hang up) up to 2 times and succeeds", async () => {
    const file = new File([JSON.stringify([{ id: 1 }])], "single.json", { type: "application/json" });

    let attempts = 0;
    const mockService = createMockService({
      importMongoBulkChunk: async (req) => {
        attempts++;
        if (attempts === 1) {
          const err = new Error("socket hang up");
          (err as unknown as Record<string, unknown>).code = "ECONNRESET";
          throw err;
        }
        return {
          operationId: req.operationId,
          chunkIndex: req.chunkIndex,
          insertedCount: 1,
          failedCount: 0,
          totalInserted: 1,
          totalFailed: 0,
          status: "completed",
          isComplete: true,
        };
      },
    });

    const tracker = createCallbackTracker();
    const abortController = new AbortController();

    await executeMongoBulkImport(
      "db-1",
      file,
      "users",
      "json",
      abortController,
      tracker.callbacks,
      mockService,
    );

    assert.equal(attempts, 2);
    assert.equal(mockService.calls.chunk.length, 2);
    assert.equal(mockService.calls.chunk[0].chunkIndex, 0);
    assert.equal(mockService.calls.chunk[1].chunkIndex, 0);
    assert.equal(mockService.calls.chunk[0].payload, mockService.calls.chunk[1].payload);

    assert.deepEqual(tracker.stateTransitions, ["validating", "starting", "uploading", "completed"]);
    assert.equal(tracker.progress.totalInserted, 1);
  });

  it("halts immediately on terminal non-transient errors (e.g. MONGO_VALIDATION_ERROR) without retrying", async () => {
    const file = new File([JSON.stringify([{ id: 1 }])], "single.json", { type: "application/json" });

    let attempts = 0;
    const mockService = createMockService({
      importMongoBulkChunk: async () => {
        attempts++;
        const error = new Error("Document validation failed");
        (error as unknown as Record<string, unknown>).code = "MONGO_VALIDATION_ERROR";
        throw error;
      },
    });

    const tracker = createCallbackTracker();
    const abortController = new AbortController();

    await assert.rejects(
      async () => {
        await executeMongoBulkImport(
          "db-1",
          file,
          "users",
          "json",
          abortController,
          tracker.callbacks,
          mockService,
        );
      },
      (err: Error) => {
        assert.ok(err.message.includes("Document validation failed"));
        return true;
      },
    );

    assert.equal(attempts, 1);
    assert.deepEqual(tracker.stateTransitions, ["validating", "starting", "uploading", "failed"]);
  });

  it("halts immediately on MONGO_NOT_FOUND without retrying", async () => {
    const file = new File([JSON.stringify([{ id: 1 }])], "single.json", { type: "application/json" });

    let attempts = 0;
    const mockService = createMockService({
      importMongoBulkChunk: async () => {
        attempts++;
        const error = new Error("MONGO_NOT_FOUND: Operation session is no longer available in bridge memory");
        (error as unknown as Record<string, unknown>).code = "MONGO_NOT_FOUND";
        throw error;
      },
    });

    const tracker = createCallbackTracker();
    const abortController = new AbortController();

    await assert.rejects(
      async () => {
        await executeMongoBulkImport(
          "db-1",
          file,
          "users",
          "json",
          abortController,
          tracker.callbacks,
          mockService,
        );
      },
      (err: Error) => {
        assert.ok(err.message.includes("MONGO_NOT_FOUND"));
        return true;
      },
    );

    assert.equal(attempts, 1);
    assert.deepEqual(tracker.stateTransitions, ["validating", "starting", "uploading", "failed"]);
  });

  it("awaits in-flight chunk when cancelled during upload and reconciles acknowledged progress", async () => {
    const docs = Array.from({ length: 2500 }, (_, i) => ({ id: i }));
    const file = new File([JSON.stringify(docs)], "large.json", { type: "application/json" });
    const abortController = new AbortController();

    let inFlightChunkCompleted = false;

    const mockService = createMockService({
      importMongoBulkChunk: async (req) => {
        if (req.chunkIndex === 0) {
          abortController.abort();
          await new Promise((resolve) => setTimeout(resolve, 20));
          inFlightChunkCompleted = true;
        }
        return {
          operationId: req.operationId,
          chunkIndex: req.chunkIndex,
          insertedCount: 1000,
          failedCount: 0,
          totalInserted: 1000,
          totalFailed: 0,
          status: "in_progress",
          isComplete: false,
        };
      },
    });

    const tracker = createCallbackTracker();

    await executeMongoBulkImport(
      "db-1",
      file,
      "users",
      "json",
      abortController,
      tracker.callbacks,
      mockService,
    );

    assert.equal(inFlightChunkCompleted, true);
    assert.equal(tracker.progress.documentsAcknowledged, 1000);
    assert.equal(tracker.progress.totalInserted, 1000);

    assert.equal(mockService.calls.cancel.length, 1);
    assert.equal(mockService.calls.cancel[0].operationId, "mock-op-123");
    assert.ok(tracker.stateTransitions.includes("cancelled"));
    assert.equal(mockService.calls.chunk.length, 1);
  });

  it("cancellation between chunks halts reader, submits zero subsequent chunks, and dispatches 1 cancel RPC", async () => {
    // 3000 documents -> 3 chunks (chunk 0, 1, 2)
    const docs = Array.from({ length: 3000 }, (_, i) => ({ id: i }));
    const file = new File([JSON.stringify(docs)], "multi_cancel.json", { type: "application/json" });
    const abortController = new AbortController();

    const mockService = createMockService({
      importMongoBulkChunk: async (req) => {
        return {
          operationId: req.operationId,
          chunkIndex: req.chunkIndex,
          insertedCount: 1000,
          failedCount: 0,
          totalInserted: (req.chunkIndex + 1) * 1000,
          totalFailed: 0,
          status: "in_progress",
          isComplete: false,
        };
      },
    });

    const tracker = createCallbackTracker();

    // Trigger abort right after chunk 0 acknowledges
    const origOnProgress = tracker.callbacks.onProgressChange;
    tracker.callbacks.onProgressChange = (updater) => {
      origOnProgress(updater);
      if (tracker.progress.documentsAcknowledged === 1000) {
        abortController.abort();
      }
    };

    await executeMongoBulkImport(
      "db-1",
      file,
      "users",
      "json",
      abortController,
      tracker.callbacks,
      mockService,
    );

    // Only chunk 0 was submitted; zero subsequent chunks (chunk 1 and 2 halted)
    assert.equal(mockService.calls.chunk.length, 1);
    assert.equal(mockService.calls.cancel.length, 1);
    assert.equal(tracker.progress.documentsAcknowledged, 1000);
    assert.equal(tracker.stateTransitions[tracker.stateTransitions.length - 1], "cancelled");
  });

  it("failed in-flight chunk preserves previous acknowledged counts and transitions to cancelled", async () => {
    const docs = Array.from({ length: 2500 }, (_, i) => ({ id: i }));
    const file = new File([JSON.stringify(docs)], "chunk_fail_cancel.json", { type: "application/json" });
    const abortController = new AbortController();

    const mockService = createMockService({
      importMongoBulkChunk: async (req) => {
        if (req.chunkIndex === 0) {
          return {
            operationId: req.operationId,
            chunkIndex: 0,
            insertedCount: 1000,
            failedCount: 0,
            totalInserted: 1000,
            totalFailed: 0,
            status: "in_progress",
            isComplete: false,
          };
        }
        // Chunk 1 is aborted while in flight, then fails
        abortController.abort();
        await new Promise((resolve) => setTimeout(resolve, 15));
        const err = new Error("Transport failure while aborting");
        (err as unknown as Record<string, unknown>).code = "ECONNRESET";
        throw err;
      },
    });

    const tracker = createCallbackTracker();

    await executeMongoBulkImport(
      "db-1",
      file,
      "users",
      "json",
      abortController,
      tracker.callbacks,
      mockService,
    );

    // Acknowledged count strictly preserved from successful chunk 0
    assert.equal(tracker.progress.documentsAcknowledged, 1000);
    assert.equal(tracker.progress.totalInserted, 1000);
    assert.equal(mockService.calls.cancel.length, 1);
    assert.equal(tracker.stateTransitions[tracker.stateTransitions.length - 1], "cancelled");
  });

  it("cancels bridge operation immediately if cancelled during startMongoBulkImport handshake", async () => {
    const file = new File([JSON.stringify([{ id: 1 }])], "test.json", { type: "application/json" });
    const abortController = new AbortController();

    const mockService = createMockService({
      startMongoBulkImport: async (req) => {
        abortController.abort();
        return {
          operationId: "handshake-cancelled-op-456",
          status: "in_progress",
          createdAt: new Date().toISOString(),
          format: req.format,
          collection: req.collection,
        };
      },
    });

    const tracker = createCallbackTracker();

    await executeMongoBulkImport(
      "db-1",
      file,
      "users",
      "json",
      abortController,
      tracker.callbacks,
      mockService,
    );

    assert.equal(mockService.calls.cancel.length, 1);
    assert.equal(mockService.calls.cancel[0].operationId, "handshake-cancelled-op-456");
    assert.equal(tracker.stateTransitions[tracker.stateTransitions.length - 1], "cancelled");
    assert.equal(mockService.calls.chunk.length, 0);
  });

  it("surfaces error and marks failed if bridge cancel returns non-cancelled status", async () => {
    const file = new File([JSON.stringify([{ id: 1 }])], "test.json", { type: "application/json" });
    const abortController = new AbortController();

    const mockService = createMockService({
      importMongoBulkChunk: async () => {
        abortController.abort();
        return {
          operationId: "mock-op-123",
          chunkIndex: 0,
          insertedCount: 1,
          failedCount: 0,
          totalInserted: 1,
          totalFailed: 0,
          status: "completed",
          isComplete: true,
        };
      },
      cancelMongoBulkOperation: async () => {
        return {
          operationId: "mock-op-123",
          status: "failed",
          message: "Internal error preventing cancellation",
        } as unknown as MongoBulkCancelResult;
      },
    });

    const tracker = createCallbackTracker();

    await assert.rejects(
      async () => {
        await executeMongoBulkImport(
          "db-1",
          file,
          "users",
          "json",
          abortController,
          tracker.callbacks,
          mockService,
        );
      },
      /Bridge failed to cancel operation/,
    );

    assert.equal(tracker.stateTransitions[tracker.stateTransitions.length - 1], "failed");
  });

  it("reconciles completion via getMongoBulkOperationStatus when last chunk returns in_progress", async () => {
    const file = new File([JSON.stringify([{ id: 1 }])], "test.json", { type: "application/json" });
    const abortController = new AbortController();

    const mockService = createMockService({
      importMongoBulkChunk: async (req) => ({
        operationId: req.operationId,
        chunkIndex: 0,
        insertedCount: 1,
        failedCount: 0,
        totalInserted: 1,
        totalFailed: 0,
        status: "in_progress",
        isComplete: false,
      }),
      getMongoBulkOperationStatus: async (req) => ({
        operationId: req.operationId,
        type: "import",
        status: "completed",
        collection: "users",
        format: "json",
        processedDocuments: 1,
        successfulDocuments: 1,
        failedDocuments: 0,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
        expiresAt: new Date().toISOString(),
      }),
    });

    const tracker = createCallbackTracker();

    await executeMongoBulkImport(
      "db-1",
      file,
      "users",
      "json",
      abortController,
      tracker.callbacks,
      mockService,
    );

    assert.equal(mockService.calls.status.length, 1);
    assert.deepEqual(tracker.stateTransitions, ["validating", "starting", "uploading", "completed"]);
  });

  it("marks state as failed if final chunk reports status failed", async () => {
    const file = new File([JSON.stringify([{ id: 1 }])], "test.json", { type: "application/json" });
    const abortController = new AbortController();

    const mockService = createMockService({
      importMongoBulkChunk: async (req) => ({
        operationId: req.operationId,
        chunkIndex: 0,
        insertedCount: 0,
        failedCount: 1,
        totalInserted: 0,
        totalFailed: 1,
        status: "failed",
        isComplete: true,
      }),
    });

    const tracker = createCallbackTracker();

    await assert.rejects(
      async () => {
        await executeMongoBulkImport(
          "db-1",
          file,
          "users",
          "json",
          abortController,
          tracker.callbacks,
          mockService,
        );
      },
      /Bulk import failed on final chunk/,
    );

    assert.equal(tracker.stateTransitions[tracker.stateTransitions.length - 1], "failed");
  });

  it("cleans up operation on bridge when import fails after retries exhausted (settled failure)", async () => {
    const file = new File([JSON.stringify([{ id: 1 }])], "fail.json", { type: "application/json" });

    let attempts = 0;
    const mockService = createMockService({
      importMongoBulkChunk: async () => {
        attempts++;
        const err = new Error("Connection reset by peer");
        (err as unknown as Record<string, unknown>).code = "ECONNRESET";
        throw err;
      },
    });

    const tracker = createCallbackTracker();
    const abortController = new AbortController();

    await assert.rejects(
      async () => {
        await executeMongoBulkImport(
          "db-1",
          file,
          "users",
          "json",
          abortController,
          tracker.callbacks,
          mockService,
        );
      },
      (err: Error) => {
        assert.equal(err.message, "Connection reset by peer");
        return true;
      },
    );

    assert.equal(attempts, 3);
    assert.deepEqual(tracker.stateTransitions, ["validating", "starting", "uploading", "failed"]);
    assert.equal(mockService.calls.cleanup.length, 1);
    assert.equal(mockService.calls.cleanup[0].operationId, "mock-op-123");
  });

  it("useMongoBulkImport hook prevents duplicate imports while an import is in progress", async () => {
    let hookInstance!: UseMongoBulkImportReturn;
    const file = new File([JSON.stringify([{ id: 1 }])], "test.json", { type: "application/json" });

    const mockService = createMockService({
      importMongoBulkChunk: async (req) => {
        await new Promise((resolve) => setTimeout(resolve, 50));
        return {
          operationId: req.operationId,
          chunkIndex: 0,
          insertedCount: 1,
          failedCount: 0,
          totalInserted: 1,
          totalFailed: 0,
          status: "completed",
          isComplete: true,
        };
      },
    });

    function TestComp() {
      hookInstance = useMongoBulkImport("db-1", mockService);
      return null;
    }

    ReactDOMServer.renderToString(React.createElement(TestComp));

    const firstPromise = hookInstance.startImport(file, "users", "json");

    await assert.rejects(
      async () => {
        await hookInstance.startImport(file, "users", "json");
      },
      /An import operation is already in progress/,
    );

    await firstPromise;
  });

  it("useMongoBulkImport hook deduplicates concurrent cancelImport calls", async () => {
    let hookInstance!: UseMongoBulkImportReturn;
    const file = new File([JSON.stringify([{ id: 1 }, { id: 2 }])], "test.json", { type: "application/json" });

    const mockService = createMockService({
      importMongoBulkChunk: async (req) => {
        await new Promise((resolve) => setTimeout(resolve, 50));
        return {
          operationId: req.operationId,
          chunkIndex: 0,
          insertedCount: 2,
          failedCount: 0,
          totalInserted: 2,
          totalFailed: 0,
          status: "in_progress",
          isComplete: false,
        };
      },
    });

    function TestComp() {
      hookInstance = useMongoBulkImport("db-1", mockService);
      return null;
    }

    ReactDOMServer.renderToString(React.createElement(TestComp));

    const importPromise = hookInstance.startImport(file, "users", "json");

    await new Promise((resolve) => setTimeout(resolve, 10));

    const cancelP1 = hookInstance.cancelImport();
    const cancelP2 = hookInstance.cancelImport();

    assert.strictEqual(cancelP1, cancelP2);

    await Promise.all([cancelP1, cancelP2]);
    try {
      await importPromise;
    } catch {
      // ignore abort error
    }

    assert.equal(mockService.calls.cancel.length, 1);
  });

  it("delegated unmount (cancelOnUnmount: false) does not abort or cancel background import", async () => {
    let cleanupFn: (() => void) | undefined;
    const internals = (React as any).__CLIENT_INTERNALS_DO_NOT_USE_OR_WARN_USERS_THEY_CANNOT_UPGRADE;

    let hookInstance!: UseMongoBulkImportReturn;
    const file = new File([JSON.stringify([{ id: 1 }])], "delegated.json", { type: "application/json" });

    const mockService = createMockService({
      importMongoBulkChunk: async (req) => {
        await new Promise((resolve) => setTimeout(resolve, 20));
        return {
          operationId: req.operationId,
          chunkIndex: 0,
          insertedCount: 1,
          failedCount: 0,
          totalInserted: 1,
          totalFailed: 0,
          status: "completed",
          isComplete: true,
        };
      },
    });

    function TestComp() {
      const origUseEffect = internals.H.useEffect;
      internals.H.useEffect = (cb: any) => {
        const res = cb();
        if (typeof res === "function") cleanupFn = res;
      };
      try {
        hookInstance = useMongoBulkImport("db-1", mockService, { cancelOnUnmount: false });
      } finally {
        internals.H.useEffect = origUseEffect;
      }
      return null;
    }
    ReactDOMServer.renderToString(React.createElement(TestComp));

    const importPromise = hookInstance.startImport(file, "users", "json");

    // Unmount hook while import is running
    assert.ok(cleanupFn, "Cleanup function must be captured");
    cleanupFn!();

    await importPromise;

    // Zero cancel calls dispatched because cancelOnUnmount was false
    assert.equal(mockService.calls.cancel.length, 0, "No cancel RPC should be sent when cancelOnUnmount is false");
  });

  it("standalone unmount (default cancelOnUnmount: true) dispatches cancel RPC to bridge", async () => {
    let cleanupFn: (() => void) | undefined;
    const internals = (React as any).__CLIENT_INTERNALS_DO_NOT_USE_OR_WARN_USERS_THEY_CANNOT_UPGRADE;

    let hookInstance!: UseMongoBulkImportReturn;
    const file = new File([JSON.stringify([{ id: 1 }])], "standalone.json", { type: "application/json" });

    const mockService = createMockService({
      importMongoBulkChunk: async (req) => {
        await new Promise((resolve) => setTimeout(resolve, 40));
        return {
          operationId: req.operationId,
          chunkIndex: 0,
          insertedCount: 1,
          failedCount: 0,
          totalInserted: 1,
          totalFailed: 0,
          status: "completed",
          isComplete: true,
        };
      },
    });

    function TestComp() {
      const origUseEffect = internals.H.useEffect;
      internals.H.useEffect = (cb: any) => {
        const res = cb();
        if (typeof res === "function") cleanupFn = res;
      };
      try {
        hookInstance = useMongoBulkImport("db-1", mockService); // default cancelOnUnmount: true
      } finally {
        internals.H.useEffect = origUseEffect;
      }
      return null;
    }
    ReactDOMServer.renderToString(React.createElement(TestComp));

    const importPromise = hookInstance.startImport(file, "users", "json");

    // Wait until start handshake completes and operationId is set
    await new Promise((resolve) => setTimeout(resolve, 10));

    // Unmount hook
    assert.ok(cleanupFn, "Cleanup function must be captured");
    cleanupFn!();

    try {
      await importPromise;
    } catch {
      // ignore
    }

    // Cancel RPC was dispatched to bridge
    assert.ok(mockService.calls.cancel.length >= 1, "Cancel RPC must be sent upon unmount when cancelOnUnmount is true");
    assert.equal(mockService.calls.cancel[0].operationId, "mock-op-123");
  });
});
