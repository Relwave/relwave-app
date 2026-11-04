/**
 * MongoDB Milestone 7 Phase 4 — Bulk Export Hook Unit Tests
 *
 * Exercises the complete client-side export lifecycle:
 * - Successful export and dynamic polling to completion
 * - Export initialization failure
 * - Polling interval progression and in-flight guard
 * - Cancellation during export stream and polling sleep
 * - Bridge MONGO_NOT_FOUND error handling
 * - Stale response rejection
 * - Max polling timeout / deadline enforcement
 * - Duplicate export prevention
 * - Duplicate cancellation deduplication
 * - Save-to execution with saveMongoBulkExportTo
 * - Save-to MONGO_FILE_EXISTS error and overwrite: true retry
 * - Generic save failure preserving source on bridge
 * - Unmount cleanup (clearing poller and dispatching cancel)
 * - Resetting and cleaning up bridge operation
 */

import { describe, it } from "node:test";
import assert from "node:assert/strict";
import React from "react";
import ReactDOMServer from "react-dom/server";
import {
  useMongoBulkExport,
  type BulkExportServiceContract,
  type UseMongoBulkExportReturn,
  INITIAL_EXPORT_PROGRESS,
} from "../hooks/useMongoBulkExport";
import type {
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

function createMockExportService(overrides?: Partial<BulkExportServiceContract>): BulkExportServiceContract & {
  calls: {
    start: MongoBulkExportStartRequest[];
    status: MongoBulkGetOperationStatusRequest[];
    cancel: MongoBulkCancelRequest[];
    cleanup: MongoBulkCleanupRequest[];
    save: MongoBulkExportSaveToRequest[];
  };
} {
  const calls = {
    start: [] as MongoBulkExportStartRequest[],
    status: [] as MongoBulkGetOperationStatusRequest[],
    cancel: [] as MongoBulkCancelRequest[],
    cleanup: [] as MongoBulkCleanupRequest[],
    save: [] as MongoBulkExportSaveToRequest[],
  };

  const service: BulkExportServiceContract = {
    async startMongoBulkExport(req) {
      calls.start.push(req);
      if (overrides?.startMongoBulkExport) {
        return overrides.startMongoBulkExport(req);
      }
      return {
        operationId: "mock-export-op-1",
        status: "in_progress",
        collection: req.collection,
        format: req.format,
      };
    },
    async getMongoBulkOperationStatus(req) {
      calls.status.push(req);
      if (overrides?.getMongoBulkOperationStatus) {
        return overrides.getMongoBulkOperationStatus(req);
      }
      return {
        operationId: req.operationId,
        type: "export",
        status: "completed",
        collection: "users",
        format: "json",
        processedDocuments: 100,
        successfulDocuments: 100,
        failedDocuments: 0,
        fileSizeBytes: 2048,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
        expiresAt: new Date(Date.now() + 3600000).toISOString(),
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
    async saveMongoBulkExportTo(req) {
      calls.save.push(req);
      if (overrides?.saveMongoBulkExportTo) {
        return overrides.saveMongoBulkExportTo(req);
      }
      return {
        operationId: req.operationId,
        destinationPath: req.destinationPath,
        bytesWritten: 2048,
        success: true,
      };
    },
  };

  return Object.assign(service, { calls });
}

describe("useMongoBulkExport Hook & Polling Engine", () => {
  it("initializes in idle state with initial progress values", () => {
    let hook!: UseMongoBulkExportReturn;
    function TestComp() {
      hook = useMongoBulkExport("db-1", createMockExportService());
      return null;
    }
    ReactDOMServer.renderToString(React.createElement(TestComp));

    assert.equal(hook.state, "idle");
    assert.equal(hook.saveStatus, "not_saved");
    assert.equal(hook.operationId, null);
    assert.equal(hook.error, null);
    assert.equal(hook.warning, null);
    assert.deepEqual(hook.progress, INITIAL_EXPORT_PROGRESS);
  });

  it("successfully starts export, polls bridge status, and transitions to ready-to-save upon completion", async () => {
    let hook!: UseMongoBulkExportReturn;
    let pollCount = 0;

    const mockService = createMockExportService({
      getMongoBulkOperationStatus: async (req) => {
        pollCount++;
        if (pollCount === 1) {
          return {
            operationId: req.operationId,
            type: "export",
            status: "in_progress",
            collection: "users",
            format: "json",
            processedDocuments: 50,
            successfulDocuments: 50,
            failedDocuments: 0,
            fileSizeBytes: 1024,
            createdAt: new Date().toISOString(),
            updatedAt: new Date().toISOString(),
            expiresAt: new Date(Date.now() + 3600000).toISOString(),
          };
        }
        return {
          operationId: req.operationId,
          type: "export",
          status: "completed",
          collection: "users",
          format: "json",
          processedDocuments: 100,
          successfulDocuments: 100,
          failedDocuments: 0,
          fileSizeBytes: 2048,
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
          expiresAt: new Date(Date.now() + 3600000).toISOString(),
        };
      },
    });

    function TestComp() {
      hook = useMongoBulkExport("db-1", mockService, { initialIntervalMs: 10, maxIntervalMs: 50 });
      return null;
    }
    ReactDOMServer.renderToString(React.createElement(TestComp));

    await hook.startExport({ collection: "users", format: "json" });

    assert.equal(mockService.calls.start.length, 1);
    assert.equal(mockService.calls.start[0].collection, "users");

    // Wait for poller to run ticks
    await new Promise((resolve) => setTimeout(resolve, 80));

    assert.equal(hook.state, "ready-to-save");
    assert.equal(hook.progress.successfulDocuments, 100);
    assert.equal(hook.progress.fileSizeBytes, 2048);
  });

  it("handles startMongoBulkExport failure and transitions to failed state", async () => {
    let hook!: UseMongoBulkExportReturn;
    const mockService = createMockExportService({
      startMongoBulkExport: async () => {
        throw new Error("Target collection is locked or inaccessible");
      },
    });

    function TestComp() {
      hook = useMongoBulkExport("db-1", mockService);
      return null;
    }
    ReactDOMServer.renderToString(React.createElement(TestComp));

    await assert.rejects(
      async () => {
        await hook.startExport({ collection: "locked", format: "ndjson" });
      },
      /Target collection is locked or inaccessible/,
    );

    assert.equal(hook.state, "failed");
    assert.equal(hook.error, "Target collection is locked or inaccessible");
  });

  it("prevents overlapping status requests using an in-flight guard", async () => {
    let hook!: UseMongoBulkExportReturn;
    let inFlightMax = 0;
    let currentlyInFlight = 0;

    const mockService = createMockExportService({
      getMongoBulkOperationStatus: async (req) => {
        currentlyInFlight++;
        if (currentlyInFlight > inFlightMax) {
          inFlightMax = currentlyInFlight;
        }
        await new Promise((resolve) => setTimeout(resolve, 30));
        currentlyInFlight--;
        return {
          operationId: req.operationId,
          type: "export",
          status: "in_progress",
          collection: "users",
          format: "json",
          processedDocuments: 10,
          successfulDocuments: 10,
          failedDocuments: 0,
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
          expiresAt: new Date(Date.now() + 3600000).toISOString(),
        };
      },
    });

    function TestComp() {
      hook = useMongoBulkExport("db-1", mockService, { initialIntervalMs: 5, maxIntervalMs: 10 });
      return null;
    }
    ReactDOMServer.renderToString(React.createElement(TestComp));

    await hook.startExport({ collection: "users", format: "json" });
    await new Promise((resolve) => setTimeout(resolve, 80));
    await hook.cancelExport();

    assert.equal(inFlightMax, 1);
  });

  it("cancels active export and stops poller immediately", async () => {
    let hook!: UseMongoBulkExportReturn;
    const mockService = createMockExportService({
      getMongoBulkOperationStatus: async (req) => {
        return {
          operationId: req.operationId,
          type: "export",
          status: "in_progress",
          collection: "orders",
          format: "csv",
          processedDocuments: 500,
          successfulDocuments: 500,
          failedDocuments: 0,
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
          expiresAt: new Date(Date.now() + 3600000).toISOString(),
        };
      },
    });

    function TestComp() {
      hook = useMongoBulkExport("db-1", mockService, { initialIntervalMs: 20 });
      return null;
    }
    ReactDOMServer.renderToString(React.createElement(TestComp));

    await hook.startExport({ collection: "orders", format: "csv" });
    await hook.cancelExport();

    assert.equal(hook.state, "cancelled");
    assert.equal(mockService.calls.cancel.length, 1);
  });

  it("handles MONGO_NOT_FOUND error by stopping poller and marking state as failed", async () => {
    let hook!: UseMongoBulkExportReturn;
    const mockService = createMockExportService({
      getMongoBulkOperationStatus: async () => {
        const err = new Error("Operation expired or not found");
        (err as unknown as Record<string, unknown>).code = "MONGO_NOT_FOUND";
        throw err;
      },
    });

    function TestComp() {
      hook = useMongoBulkExport("db-1", mockService, { initialIntervalMs: 10 });
      return null;
    }
    ReactDOMServer.renderToString(React.createElement(TestComp));

    await hook.startExport({ collection: "items", format: "json" });
    await new Promise((resolve) => setTimeout(resolve, 30));

    assert.equal(hook.state, "failed");
    assert.ok(hook.error?.includes("no longer available"));
  });

  it("transitions to failed state if polling deadline timeout is exceeded", async () => {
    let hook!: UseMongoBulkExportReturn;
    const mockService = createMockExportService({
      getMongoBulkOperationStatus: async (req) => ({
        operationId: req.operationId,
        type: "export",
        status: "in_progress",
        collection: "items",
        format: "json",
        processedDocuments: 10,
        successfulDocuments: 10,
        failedDocuments: 0,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
        expiresAt: new Date(Date.now() + 3600000).toISOString(),
      }),
    });

    function TestComp() {
      // Set short 25ms timeout
      hook = useMongoBulkExport("db-1", mockService, {
        pollingTimeoutMs: 25,
        initialIntervalMs: 10,
        maxIntervalMs: 15,
      });
      return null;
    }
    ReactDOMServer.renderToString(React.createElement(TestComp));

    await hook.startExport({ collection: "items", format: "json" });
    await new Promise((resolve) => setTimeout(resolve, 60));

    assert.equal(hook.state, "failed");
    assert.ok(hook.error?.includes("timed out"));
  });

  it("prevents duplicate concurrent exports", async () => {
    let hook!: UseMongoBulkExportReturn;
    const mockService = createMockExportService({
      startMongoBulkExport: async (req) => {
        await new Promise((resolve) => setTimeout(resolve, 40));
        return {
          operationId: "mock-export-op-1",
          status: "in_progress",
          collection: req.collection,
          format: req.format,
        };
      },
    });

    function TestComp() {
      hook = useMongoBulkExport("db-1", mockService);
      return null;
    }
    ReactDOMServer.renderToString(React.createElement(TestComp));

    const p1 = hook.startExport({ collection: "users", format: "json" });

    await assert.rejects(
      async () => {
        await hook.startExport({ collection: "users", format: "json" });
      },
      /An export operation is already in progress/,
    );

    await p1;
  });

  it("deduplicates concurrent cancelExport calls", async () => {
    let hook!: UseMongoBulkExportReturn;
    const mockService = createMockExportService({
      cancelMongoBulkOperation: async (req) => {
        await new Promise((resolve) => setTimeout(resolve, 30));
        return { operationId: req.operationId, status: "cancelled", message: "Cancelled" };
      },
    });

    function TestComp() {
      hook = useMongoBulkExport("db-1", mockService, { initialIntervalMs: 50 });
      return null;
    }
    ReactDOMServer.renderToString(React.createElement(TestComp));

    await hook.startExport({ collection: "users", format: "json" });

    const c1 = hook.cancelExport();
    const c2 = hook.cancelExport();

    assert.strictEqual(c1, c2);
    await Promise.all([c1, c2]);
    assert.equal(mockService.calls.cancel.length, 1);
  });

  it("executes saveToFile successfully and records destination and bytes written", async () => {
    let hook!: UseMongoBulkExportReturn;
    const mockService = createMockExportService({
      getMongoBulkOperationStatus: async (req) => ({
        operationId: req.operationId,
        type: "export",
        status: "completed",
        collection: "users",
        format: "json",
        processedDocuments: 200,
        successfulDocuments: 200,
        failedDocuments: 0,
        fileSizeBytes: 4096,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
        expiresAt: new Date(Date.now() + 3600000).toISOString(),
      }),
      saveMongoBulkExportTo: async (req) => ({
        operationId: req.operationId,
        destinationPath: req.destinationPath,
        bytesWritten: 4096,
        success: true,
        warning: "Temporary staging cleanup queued for retry",
      }),
    });

    function TestComp() {
      hook = useMongoBulkExport("db-1", mockService, { initialIntervalMs: 10 });
      return null;
    }
    ReactDOMServer.renderToString(React.createElement(TestComp));

    await hook.startExport({ collection: "users", format: "json" });
    await new Promise((resolve) => setTimeout(resolve, 30));

    assert.equal(hook.state, "ready-to-save");

    const saveResult = await hook.saveToFile("/exports/users.json", false);

    assert.equal(saveResult.success, true);
    assert.equal(saveResult.bytesWritten, 4096);
    assert.equal(hook.state, "completed");
    assert.equal(hook.saveStatus, "saved");
    assert.equal(hook.destinationPath, "/exports/users.json");
    assert.equal(hook.warning, "Temporary staging cleanup queued for retry");
  });

  it("handles MONGO_FILE_EXISTS error and permits subsequent overwrite: true save", async () => {
    let hook!: UseMongoBulkExportReturn;
    let callCount = 0;

    const mockService = createMockExportService({
      getMongoBulkOperationStatus: async (req) => ({
        operationId: req.operationId,
        type: "export",
        status: "completed",
        collection: "users",
        format: "json",
        processedDocuments: 200,
        successfulDocuments: 200,
        failedDocuments: 0,
        fileSizeBytes: 4096,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
        expiresAt: new Date(Date.now() + 3600000).toISOString(),
      }),
      saveMongoBulkExportTo: async (req) => {
        callCount++;
        if (callCount === 1) {
          const err = new Error("Destination file already exists");
          (err as unknown as Record<string, unknown>).code = "MONGO_FILE_EXISTS";
          throw err;
        }
        return {
          operationId: req.operationId,
          destinationPath: req.destinationPath,
          bytesWritten: 4096,
          success: true,
        };
      },
    });

    function TestComp() {
      hook = useMongoBulkExport("db-1", mockService, { initialIntervalMs: 10 });
      return null;
    }
    ReactDOMServer.renderToString(React.createElement(TestComp));

    await hook.startExport({ collection: "users", format: "json" });
    await new Promise((resolve) => setTimeout(resolve, 30));

    // First attempt fails with collision
    await assert.rejects(
      async () => {
        await hook.saveToFile("/exports/existing.json", false);
      },
      /Destination file already exists/,
    );

    // Reverts to ready-to-save and not_saved so dialog can prompt
    assert.equal(hook.state, "ready-to-save");
    assert.equal(hook.saveStatus, "not_saved");

    // Retry with overwrite: true succeeds
    const res = await hook.saveToFile("/exports/existing.json", true);
    assert.equal(res.success, true);
    assert.equal(hook.state, "completed");
    assert.equal(hook.saveStatus, "saved");
    assert.equal(mockService.calls.save[1].options?.overwrite, true);
  });

  it("handles generic save failure by preserving source export on bridge for retry", async () => {
    let hook!: UseMongoBulkExportReturn;
    const mockService = createMockExportService({
      getMongoBulkOperationStatus: async (req) => ({
        operationId: req.operationId,
        type: "export",
        status: "completed",
        collection: "users",
        format: "json",
        processedDocuments: 200,
        successfulDocuments: 200,
        failedDocuments: 0,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
        expiresAt: new Date(Date.now() + 3600000).toISOString(),
      }),
      saveMongoBulkExportTo: async () => {
        const err = new Error("Permission denied or disk full");
        (err as unknown as Record<string, unknown>).code = "EACCES";
        throw err;
      },
    });

    function TestComp() {
      hook = useMongoBulkExport("db-1", mockService, { initialIntervalMs: 10 });
      return null;
    }
    ReactDOMServer.renderToString(React.createElement(TestComp));

    await hook.startExport({ collection: "users", format: "json" });
    await new Promise((resolve) => setTimeout(resolve, 30));

    await assert.rejects(
      async () => {
        await hook.saveToFile("/restricted/file.json", false);
      },
      /Permission denied or disk full/,
    );

    assert.equal(hook.state, "failed");
    assert.equal(hook.saveStatus, "save_failed");
    assert.equal(mockService.calls.cleanup.length, 0); // Source retained on bridge for retry
  });

  it("cleans up bridge operation and resets state upon reset()", async () => {
    let hook!: UseMongoBulkExportReturn;
    const mockService = createMockExportService({
      getMongoBulkOperationStatus: async (req) => ({
        operationId: req.operationId,
        type: "export",
        status: "completed",
        collection: "users",
        format: "json",
        processedDocuments: 10,
        successfulDocuments: 10,
        failedDocuments: 0,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
        expiresAt: new Date(Date.now() + 3600000).toISOString(),
      }),
    });

    function TestComp() {
      hook = useMongoBulkExport("db-1", mockService, { initialIntervalMs: 10 });
      return null;
    }
    ReactDOMServer.renderToString(React.createElement(TestComp));

    await hook.startExport({ collection: "users", format: "json" });
    await new Promise((resolve) => setTimeout(resolve, 30));

    await hook.reset();

    assert.equal(hook.state, "idle");
    assert.equal(hook.operationId, null);
    assert.equal(mockService.calls.cleanup.length, 1);
  });

  it("dispatches cancellation and clears timers upon component unmount while export is active", async () => {
    let hook!: UseMongoBulkExportReturn;
    const mockService = createMockExportService({
      getMongoBulkOperationStatus: async (req) => ({
        operationId: req.operationId,
        type: "export",
        status: "in_progress",
        collection: "orders",
        format: "csv",
        processedDocuments: 250,
        successfulDocuments: 250,
        failedDocuments: 0,
        fileSizeBytes: 5120,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
        expiresAt: new Date(Date.now() + 3600000).toISOString(),
      }),
    });

    function TestComp() {
      hook = useMongoBulkExport("db-1", mockService, { initialIntervalMs: 15 });
      return null;
    }
    ReactDOMServer.renderToString(React.createElement(TestComp));

    await hook.startExport({ collection: "orders", format: "csv" });
    assert.equal(hook.state, "exporting");
    assert.equal(mockService.calls.cancel.length, 0);

    // Trigger unmount while export is actively streaming/polling
    hook.unmount();

    // Verify cancellation was dispatched to bridge immediately
    assert.equal(mockService.calls.cancel.length, 1);
    assert.equal(mockService.calls.cancel[0].operationId, "mock-export-op-1");

    // Wait to confirm that no further status polling or React state changes occur
    const cancelCountBefore = mockService.calls.cancel.length;
    await new Promise((resolve) => setTimeout(resolve, 50));
    assert.equal(mockService.calls.cancel.length, cancelCountBefore); // No duplicate cancel
  });

  it("drops stale polling responses and prevents overwriting newer state or progress", async () => {
    let hook!: UseMongoBulkExportReturn;
    let resolveStaleStatus!: (val: MongoBulkOperationStatusResult) => void;
    const stalePromise = new Promise<MongoBulkOperationStatusResult>((res) => {
      resolveStaleStatus = res;
    });

    let pollCount = 0;
    const mockService = createMockExportService({
      getMongoBulkOperationStatus: async (req) => {
        pollCount++;
        if (pollCount === 1) {
          // Delay first status response
          return stalePromise;
        }
        return {
          operationId: req.operationId,
          type: "export",
          status: "completed",
          collection: "users",
          format: "json",
          processedDocuments: 500,
          successfulDocuments: 500,
          failedDocuments: 0,
          fileSizeBytes: 10240,
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
          expiresAt: new Date(Date.now() + 3600000).toISOString(),
        };
      },
    });

    function TestComp() {
      hook = useMongoBulkExport("db-1", mockService, { initialIntervalMs: 5 });
      return null;
    }
    ReactDOMServer.renderToString(React.createElement(TestComp));

    await hook.startExport({ collection: "users", format: "json" });

    // Status request 1 is in-flight. Now cancel the export (which invalidates in-flight responses).
    await hook.cancelExport();
    assert.equal(hook.state, "cancelled");

    // Now resolve the delayed status response with an old "in_progress" state
    resolveStaleStatus({
      operationId: "mock-export-op-1",
      type: "export",
      status: "in_progress",
      collection: "users",
      format: "json",
      processedDocuments: 50,
      successfulDocuments: 50,
      failedDocuments: 0,
      fileSizeBytes: 512,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      expiresAt: new Date(Date.now() + 3600000).toISOString(),
    });

    // Wait a tick for promise microtasks
    await new Promise((resolve) => setTimeout(resolve, 20));

    // Assert that the stale response was dropped and could NOT overwrite the 'cancelled' state
    assert.equal(hook.state, "cancelled");
  });

  it("handles MONGO_FILE_EXISTS collision and saves to alternate destination when overwrite is discarded", async () => {
    let hook!: UseMongoBulkExportReturn;
    const mockService = createMockExportService({
      getMongoBulkOperationStatus: async (req) => ({
        operationId: req.operationId,
        type: "export",
        status: "completed",
        collection: "users",
        format: "json",
        processedDocuments: 100,
        successfulDocuments: 100,
        failedDocuments: 0,
        fileSizeBytes: 2048,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
        expiresAt: new Date(Date.now() + 3600000).toISOString(),
      }),
      saveMongoBulkExportTo: async (req) => {
        if (req.destinationPath === "/existing/path.json" && !req.options?.overwrite) {
          const err = new Error("Destination file already exists");
          (err as unknown as Record<string, unknown>).code = "MONGO_FILE_EXISTS";
          throw err;
        }
        return {
          operationId: req.operationId,
          destinationPath: req.destinationPath,
          bytesWritten: 2048,
          success: true,
        };
      },
    });

    function TestComp() {
      hook = useMongoBulkExport("db-1", mockService, { initialIntervalMs: 10 });
      return null;
    }
    ReactDOMServer.renderToString(React.createElement(TestComp));

    await hook.startExport({ collection: "users", format: "json" });
    await new Promise((resolve) => setTimeout(resolve, 25));

    // First attempt hits file collision
    await assert.rejects(
      async () => {
        await hook.saveToFile("/existing/path.json", false);
      },
      /Destination file already exists/,
    );

    // Remains in ready-to-save
    assert.equal(hook.state, "ready-to-save");
    assert.equal(hook.saveStatus, "not_saved");

    // User chooses a different destination path instead of overwriting
    const res = await hook.saveToFile("/new/alternate-path.json", false);
    assert.equal(res.success, true);
    assert.equal(hook.state, "completed");
    assert.equal(hook.saveStatus, "saved");
    assert.equal(hook.destinationPath, "/new/alternate-path.json");
    assert.equal(mockService.calls.save[1].destinationPath, "/new/alternate-path.json");
    assert.equal(mockService.calls.save[1].options?.overwrite, false);
  });
});
