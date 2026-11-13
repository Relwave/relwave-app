/**
 * MongoDB Milestone 7 Phase 4 Stage 5 — Store & Poller Unit Tests
 *
 * Exercises:
 * - Immediate registration and fallback expiresAt
 * - In-flight poller guard & request deduplication
 * - Authoritative expiresAt reconciliation & immutability
 * - Status transitions (pending -> in_progress -> completed)
 * - Transient backoff (2s -> 4s -> 8s -> 10s)
 * - 5+ consecutive errors transition to isUnreachable & 10s probing
 * - Recovery from unreachable state on probe success
 * - Manual retryPolling during in-flight (no duplicate RPC)
 * - Bridge MONGO_NOT_FOUND stale transition and informative reason
 * - Strictly sequenced import cancellation (shared AbortController, chunk settlement, single bridge RPC)
 * - Single-flight concurrent cancellation promise deduplication
 * - Expiration pruning (active operations immune, terminal pruned)
 * - Database switching isolation
 * - Store reset and beforeunload teardown
 * - Deduplicated single poller per operationId
 * - Multi-database independent polling isolation
 * - Delayed poll response dropped after terminal/cancelled transition
 */

import { describe, it, mock } from "node:test";
import assert from "node:assert/strict";
import {
  createMongoBulkOperationsStore,
  type BulkOperationsStoreServiceContract,
} from "../hooks/useMongoBulkOperationsStore";
import type {
  TrackedAsyncBulkOperation,
  MongoBulkOperationStatusResult,
} from "../types/bulk";

function createMockService(overrides?: Partial<BulkOperationsStoreServiceContract>): BulkOperationsStoreServiceContract & {
  calls: {
    status: string[];
    cancel: string[];
    cleanup: string[];
  };
} {
  const calls = {
    status: [] as string[],
    cancel: [] as string[],
    cleanup: [] as string[],
  };

  const service: BulkOperationsStoreServiceContract = {
    async getMongoBulkOperationStatus(req) {
      calls.status.push(req.operationId);
      if (overrides?.getMongoBulkOperationStatus) {
        return overrides.getMongoBulkOperationStatus(req);
      }
      return {
        operationId: req.operationId,
        type: "export",
        status: "in_progress",
        collection: "orders",
        format: "json",
        processedDocuments: 50,
        successfulDocuments: 50,
        failedDocuments: 0,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
        expiresAt: "2026-11-04T23:59:00.000Z",
      };
    },
    async cancelMongoBulkOperation(req) {
      calls.cancel.push(req.operationId);
      if (overrides?.cancelMongoBulkOperation) {
        return overrides.cancelMongoBulkOperation(req);
      }
      return {
        operationId: req.operationId,
        status: "cancelled",
        message: "Operation cancelled",
      };
    },
    async cleanupMongoBulkOperation(req) {
      calls.cleanup.push(req.operationId);
      if (overrides?.cleanupMongoBulkOperation) {
        return overrides.cleanupMongoBulkOperation(req);
      }
      return {
        operationId: req.operationId,
        success: true,
      };
    },
  };

  return Object.assign(service, { calls });
}

describe("useMongoBulkOperationsStore Unit Tests", { concurrency: 1 }, () => {
  it("registers operation with initial fallback expiresAt (+1 hr) and status pending", () => {
    const service = createMockService();
    const store = createMongoBulkOperationsStore(service);

    const now = Date.now();
    const op: TrackedAsyncBulkOperation = {
      kind: "async",
      operationId: "op-test-1",
      dbId: "db-alpha",
      collection: "users",
      type: "import",
      status: "pending",
      processedDocuments: 0,
      successfulDocuments: 0,
      failedDocuments: 0,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      expiresAt: "",
    };

    store.getSnapshot().registerAsyncOperation("db-alpha", op);

    const registered = store.getSnapshot().operationsByDb["db-alpha"][0] as TrackedAsyncBulkOperation;
    assert.equal(registered.operationId, "op-test-1");
    assert.equal(registered.status, "pending");
    assert.equal(registered.hasAuthoritativeExpiresAt, false);

    const expiryTime = new Date(registered.expiresAt).getTime();
    assert.ok(expiryTime >= now + 3500000 && expiryTime <= now + 3700000);
  });

  it("authoritative expiresAt reconciles and locks bridge value on first status RPC", () => {
    const service = createMockService();
    const store = createMongoBulkOperationsStore(service);

    const op: TrackedAsyncBulkOperation = {
      kind: "async",
      operationId: "op-test-2",
      dbId: "db-alpha",
      collection: "users",
      type: "export",
      status: "pending",
      processedDocuments: 0,
      successfulDocuments: 0,
      failedDocuments: 0,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      expiresAt: new Date(Date.now() + 3600000).toISOString(),
      hasAuthoritativeExpiresAt: false,
    };

    store.getSnapshot().registerAsyncOperation("db-alpha", op);

    // Update with authoritative bridge response
    const bridgeExpiresAt = "2026-11-04T23:45:00.000Z";
    store.getSnapshot().updateAsyncOperation("op-test-2", {
      status: "in_progress",
      expiresAt: bridgeExpiresAt,
      hasAuthoritativeExpiresAt: true,
    });

    let current = store.getSnapshot().operationsByDb["db-alpha"][0] as TrackedAsyncBulkOperation;
    assert.equal(current.expiresAt, bridgeExpiresAt);
    assert.equal(current.hasAuthoritativeExpiresAt, true);

    // Immutability test: subsequent estimated patch must not overwrite authoritative bridge timestamp
    store.getSnapshot().updateAsyncOperation("op-test-2", {
      expiresAt: "2026-11-05T01:00:00.000Z",
      hasAuthoritativeExpiresAt: false,
    });

    current = store.getSnapshot().operationsByDb["db-alpha"][0] as TrackedAsyncBulkOperation;
    assert.equal(current.expiresAt, bridgeExpiresAt);
  });

  it("transitions status to stale on bridge MONGO_NOT_FOUND and does not remove record", () => {
    const service = createMockService();
    const store = createMongoBulkOperationsStore(service);

    const op: TrackedAsyncBulkOperation = {
      kind: "async",
      operationId: "op-test-stale",
      dbId: "db-alpha",
      collection: "items",
      type: "export",
      status: "in_progress",
      processedDocuments: 200,
      successfulDocuments: 200,
      failedDocuments: 0,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      expiresAt: new Date(Date.now() + 3600000).toISOString(),
    };

    store.getSnapshot().registerAsyncOperation("db-alpha", op);
    store.getSnapshot().markOperationStale("op-test-stale", "Operation session is no longer available.");

    const entry = store.getSnapshot().operationsByDb["db-alpha"][0] as TrackedAsyncBulkOperation;
    assert.equal(entry.status, "stale");
    assert.ok(entry.error?.includes("no longer available"));
  });

  it("pruning with clearExpiredOperations keeps active operations strictly immune", () => {
    const service = createMockService();
    const store = createMongoBulkOperationsStore(service);

    const pastDate = new Date(Date.now() - 10000).toISOString();

    // Active operation with expired timestamp (due to clock skew) -> MUST NOT be pruned
    const activeOp: TrackedAsyncBulkOperation = {
      kind: "async",
      operationId: "op-active-clock-skew",
      dbId: "db-alpha",
      collection: "live_events",
      type: "import",
      status: "in_progress",
      processedDocuments: 10,
      successfulDocuments: 10,
      failedDocuments: 0,
      createdAt: pastDate,
      updatedAt: pastDate,
      expiresAt: pastDate,
    };

    // Terminal expired operation -> MUST be pruned
    const terminalOp: TrackedAsyncBulkOperation = {
      kind: "async",
      operationId: "op-terminal-expired",
      dbId: "db-alpha",
      collection: "logs",
      type: "export",
      status: "completed",
      processedDocuments: 500,
      successfulDocuments: 500,
      failedDocuments: 0,
      createdAt: pastDate,
      updatedAt: pastDate,
      expiresAt: pastDate,
    };

    // Terminal NOT expired operation -> MUST NOT be pruned
    const futureDate = new Date(Date.now() + 60000).toISOString();
    const validTerminalOp: TrackedAsyncBulkOperation = {
      kind: "async",
      operationId: "op-terminal-valid",
      dbId: "db-alpha",
      collection: "logs",
      type: "export",
      status: "completed",
      processedDocuments: 500,
      successfulDocuments: 500,
      failedDocuments: 0,
      createdAt: pastDate,
      updatedAt: pastDate,
      expiresAt: futureDate,
    };

    store.getSnapshot().registerAsyncOperation("db-alpha", activeOp);
    store.getSnapshot().registerAsyncOperation("db-alpha", terminalOp);
    store.getSnapshot().registerAsyncOperation("db-alpha", validTerminalOp);

    store.getSnapshot().clearExpiredOperations("db-alpha");

    const remaining = store.getSnapshot().operationsByDb["db-alpha"].map((o) => (o as TrackedAsyncBulkOperation).operationId);
    assert.ok(remaining.includes("op-active-clock-skew"), "Active operation must be immune from pruning");
    assert.ok(remaining.includes("op-terminal-valid"), "Non-expired terminal operation must remain");
    assert.ok(!remaining.includes("op-terminal-expired"), "Expired terminal operation must be pruned");
  });

  it("strictly sequenced import cancellation coordinates chunk settlement and single bridge RPC", async () => {
    let cancelCalls = 0;
    const service = createMockService({
      cancelMongoBulkOperation: async (req) => {
        cancelCalls++;
        return { operationId: req.operationId, status: "cancelled", message: "ok" };
      },
    });

    const store = createMongoBulkOperationsStore(service);
    const abortController = new AbortController();

    let inFlightChunkFinished = false;
    let cancelFnInvoked = false;

    const op: TrackedAsyncBulkOperation = {
      kind: "async",
      operationId: "import-op-cancel-seq",
      dbId: "db-alpha",
      collection: "users",
      type: "import",
      status: "in_progress",
      processedDocuments: 50,
      successfulDocuments: 50,
      failedDocuments: 0,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      expiresAt: new Date(Date.now() + 3600000).toISOString(),
    };

    const cancelFn = async () => {
      cancelFnInvoked = true;
      // Simulate awaiting in-flight chunk settlement
      await new Promise((resolve) => setTimeout(resolve, 20));
      inFlightChunkFinished = true;
      await service.cancelMongoBulkOperation({ operationId: op.operationId });
    };

    store.getSnapshot().registerAsyncOperation("db-alpha", op, {
      abortController,
      cancelFn,
    });

    // Concurrent double cancel invocation
    const p1 = store.getSnapshot().cancelOperation("import-op-cancel-seq");
    const p2 = store.getSnapshot().cancelOperation("import-op-cancel-seq");

    assert.equal(p1, p2, "Concurrent cancel requests must share the identical single-flight promise");

    await p1;

    assert.equal(abortController.signal.aborted, true, "AbortController must be signaled immediately");
    assert.equal(cancelFnInvoked, true);
    assert.equal(inFlightChunkFinished, true);
    assert.equal(cancelCalls, 1, "cancelMongoBulkOperation must be dispatched exactly once");

    const finalOp = store.getSnapshot().operationsByDb["db-alpha"][0] as TrackedAsyncBulkOperation;
    assert.equal(finalOp.status, "cancelled");
  });

  it("creates only one poller per operationId even across repeated registrations", () => {
    const service = createMockService();
    const store = createMongoBulkOperationsStore(service);
    try {
      const op: TrackedAsyncBulkOperation = {
        kind: "async",
        operationId: "op-dedupe-1",
        dbId: "db-1",
        collection: "users",
        type: "export",
        status: "pending",
        processedDocuments: 0,
        successfulDocuments: 0,
        failedDocuments: 0,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
        expiresAt: new Date(Date.now() + 3600000).toISOString(),
      };

      store.getSnapshot().registerAsyncOperation("db-1", op);
      assert.equal(store._activePollers.size, 1);
      const pollerControl = store._activePollers.get("op-dedupe-1");
      assert.ok(pollerControl);

      // Call startPoller multiple times
      store._startPoller("op-dedupe-1");
      store._startPoller("op-dedupe-1");
      // Register the same operation again
      store.getSnapshot().registerAsyncOperation("db-1", op);

      assert.equal(store._activePollers.size, 1);
      assert.strictEqual(store._activePollers.get("op-dedupe-1"), pollerControl);
    } finally {
      store.getSnapshot().resetStore();
    }
  });

  it("in-flight guard blocks overlapping status RPC requests during execution", async () => {
    let resolveStatus!: (val: MongoBulkOperationStatusResult) => void;
    let statusCallCount = 0;

    const service = createMockService({
      getMongoBulkOperationStatus: async (_req) => {
        statusCallCount++;
        return new Promise<MongoBulkOperationStatusResult>((res) => {
          resolveStatus = res;
        });
      },
    });

    const store = createMongoBulkOperationsStore(service);
    try {
      store._startPoller("op-inflight-guard");
      const control = store._activePollers.get("op-inflight-guard")!;

      // Trigger first poll via retryPolling
      store.getSnapshot().retryPolling("op-inflight-guard");
      assert.equal(control.inFlight, true);
      assert.equal(statusCallCount, 1);

      // Now call retryPolling again while inFlight is true
      store.getSnapshot().retryPolling("op-inflight-guard");
      assert.equal(statusCallCount, 1, "Duplicate RPC must not be dispatched while request is in flight");

      // Resolve the pending status
      resolveStatus({
        operationId: "op-inflight-guard",
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
      });

      await new Promise((resolve) => setTimeout(resolve, 20));
      assert.equal(control.inFlight, false);
    } finally {
      store.getSnapshot().resetStore();
    }
  });

  it("backoff progression (2s, 4s, 8s, 10s), marks unreachable on 5th error, and probe restores polling", async () => {
    mock.timers.enable({ apis: ["setTimeout"] });
    let pollAttempts = 0;
    let failPolling = true;

    const service = createMockService({
      getMongoBulkOperationStatus: async (req) => {
        pollAttempts++;
        if (failPolling) {
          throw new Error("Temporary network glitch");
        }
        return {
          operationId: req.operationId,
          type: "export",
          status: "in_progress",
          collection: "orders",
          format: "json",
          processedDocuments: 200,
          successfulDocuments: 200,
          failedDocuments: 0,
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
          expiresAt: new Date(Date.now() + 3600000).toISOString(),
        };
      },
    });

    const store = createMongoBulkOperationsStore(service);
    try {
      const op: TrackedAsyncBulkOperation = {
        kind: "async",
        operationId: "op-backoff-test",
        dbId: "db-1",
        collection: "orders",
        type: "export",
        status: "pending",
        processedDocuments: 0,
        successfulDocuments: 0,
        failedDocuments: 0,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
        expiresAt: new Date(Date.now() + 3600000).toISOString(),
      };

      store.getSnapshot().registerAsyncOperation("db-1", op);
      const control = store._activePollers.get("op-backoff-test")!;

      const advance = async (ms: number) => {
        mock.timers.tick(ms);
        await new Promise((r) => setImmediate(r));
      };

      // Initial delay is 500ms
      await advance(500);

      // 1st error occurred -> consecutiveErrors = 1. Backoff delay should be 2000ms.
      assert.equal(pollAttempts, 1);
      assert.equal(control.consecutiveErrors, 1);

      await advance(1999);
      assert.equal(pollAttempts, 1, "Should not trigger before 2000ms");

      await advance(1);
      // 2nd error -> consecutiveErrors = 2. Backoff delay should be 4000ms.
      assert.equal(pollAttempts, 2);
      assert.equal(control.consecutiveErrors, 2);

      await advance(4000);
      // 3rd error -> consecutiveErrors = 3. Backoff delay should be 8000ms.
      assert.equal(pollAttempts, 3);
      assert.equal(control.consecutiveErrors, 3);

      await advance(8000);
      // 4th error -> consecutiveErrors = 4. Backoff delay should be 10000ms.
      assert.equal(pollAttempts, 4);
      assert.equal(control.consecutiveErrors, 4);

      let opRecord = store.getSnapshot().operationsByDb["db-1"][0] as TrackedAsyncBulkOperation;
      assert.equal(opRecord.isUnreachable ?? false, false);

      await advance(10000);
      // 5th consecutive failure -> marks isUnreachable: true and schedules 10s probe
      assert.equal(pollAttempts, 5);
      assert.equal(control.consecutiveErrors, 5);
      opRecord = store.getSnapshot().operationsByDb["db-1"][0] as TrackedAsyncBulkOperation;
      assert.equal(opRecord.isUnreachable, true, "5th error must set isUnreachable to true");

      // Unreachable probe interval is 10s: advancing by 9999ms should not trigger poll
      await advance(9999);
      assert.equal(pollAttempts, 5);

      // Make next probe succeed
      failPolling = false;
      await advance(1);

      assert.equal(pollAttempts, 6);
      assert.equal(control.consecutiveErrors, 0, "Successful probe resets consecutive errors");
      opRecord = store.getSnapshot().operationsByDb["db-1"][0] as TrackedAsyncBulkOperation;
      assert.equal(opRecord.isUnreachable, false, "Successful probe clears isUnreachable");

      // Restores normal 1s polling interval
      await advance(1000);
      assert.equal(pollAttempts, 7, "Normal 1s dynamic polling restored after successful probe");
    } finally {
      mock.timers.reset();
      store.getSnapshot().resetStore();
    }
  });

  it("terminal status transitions stop poller and clear its timers", () => {
    const service = createMockService();
    const store = createMongoBulkOperationsStore(service);

    try {
      const statuses: Array<"completed" | "failed" | "cancelled" | "stale"> = [
        "completed",
        "failed",
        "cancelled",
        "stale",
      ];

      for (const termStatus of statuses) {
        const opId = `op-term-${termStatus}`;
        const op: TrackedAsyncBulkOperation = {
          kind: "async",
          operationId: opId,
          dbId: "db-1",
          collection: "items",
          type: "export",
          status: "in_progress",
          processedDocuments: 10,
          successfulDocuments: 10,
          failedDocuments: 0,
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
          expiresAt: new Date(Date.now() + 3600000).toISOString(),
        };

        store.getSnapshot().registerAsyncOperation("db-1", op);
        store._startPoller(opId);
        assert.ok(store._activePollers.has(opId));

        const control = store._activePollers.get(opId)!;
        assert.ok(control.timerId !== null, `Timer must be active for ${opId} prior to terminal transition`);
        assert.equal(control.isCancelled, false, `Poller must not be cancelled for ${opId} prior to transition`);

        if (termStatus === "stale") {
          store.getSnapshot().markOperationStale(opId, "session expired");
        } else {
          store.getSnapshot().updateAsyncOperation(opId, { status: termStatus });
        }

        assert.equal(control.timerId, null, `Timer must be cleared for ${opId} upon transition to ${termStatus}`);
        assert.equal(control.isCancelled, true, `Poller must be marked cancelled for ${opId} upon transition to ${termStatus}`);
        assert.equal(
          store._activePollers.has(opId),
          false,
          `Poller for ${opId} must be stopped and removed upon transition to ${termStatus}`,
        );
      }
    } finally {
      store.getSnapshot().resetStore();
    }
  });

  it("bridge MONGO_NOT_FOUND during polling transitions operation to stale and clears its poller and timer", async () => {
    mock.timers.enable({ apis: ["setTimeout"] });
    const service = createMockService({
      getMongoBulkOperationStatus: async () => {
        const error = new Error("Operation session not found");
        (error as any).code = "MONGO_NOT_FOUND";
        throw error;
      },
    });

    const store = createMongoBulkOperationsStore(service);
    try {
      const op: TrackedAsyncBulkOperation = {
        kind: "async",
        operationId: "op-not-found-poll",
        dbId: "db-1",
        collection: "items",
        type: "export",
        status: "pending",
        processedDocuments: 0,
        successfulDocuments: 0,
        failedDocuments: 0,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
        expiresAt: new Date(Date.now() + 3600000).toISOString(),
      };

      store.getSnapshot().registerAsyncOperation("db-1", op);
      const control = store._activePollers.get("op-not-found-poll")!;
      assert.ok(control);
      assert.ok(control.timerId !== null, "Timer must be scheduled initially");
      assert.equal(control.isCancelled, false);

      // Advance initial delay (500ms)
      mock.timers.tick(500);
      await new Promise((r) => setImmediate(r));

      // Operation should be marked stale
      const updatedOp = store.getSnapshot().operationsByDb["db-1"][0] as TrackedAsyncBulkOperation;
      assert.equal(updatedOp.status, "stale");
      assert.ok(updatedOp.error?.includes("no longer available"));

      // Poller and timer must be cleared
      assert.equal(control.timerId, null, "Timer must be cleared upon MONGO_NOT_FOUND stale transition");
      assert.equal(control.isCancelled, true, "Poller control must be marked cancelled");
      assert.equal(store._activePollers.has("op-not-found-poll"), false, "Poller must be removed from active pollers map");
    } finally {
      mock.timers.reset();
      store.getSnapshot().resetStore();
    }
  });

  it("operations across multiple databases are polled independently and isolated", async () => {
    mock.timers.enable({ apis: ["setTimeout"] });
    const statusCalls: string[] = [];
    const service = createMockService({
      getMongoBulkOperationStatus: async (req) => {
        statusCalls.push(req.operationId);
        return {
          operationId: req.operationId,
          type: "export",
          status: "in_progress",
          collection: "data",
          format: "json",
          processedDocuments: 100,
          successfulDocuments: 100,
          failedDocuments: 0,
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
          expiresAt: new Date(Date.now() + 3600000).toISOString(),
        };
      },
    });

    const store = createMongoBulkOperationsStore(service);
    try {
      const advance = async (ms: number) => {
        mock.timers.tick(ms);
        await new Promise((r) => setImmediate(r));
      };

      // 1. Initial active database context is db-1
      let activeDbId = "db-1";

      const op1: TrackedAsyncBulkOperation = {
        kind: "async",
        operationId: "op-db1-1",
        dbId: "db-1",
        collection: "users",
        type: "export",
        status: "pending",
        processedDocuments: 0,
        successfulDocuments: 0,
        failedDocuments: 0,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
        expiresAt: new Date(Date.now() + 3600000).toISOString(),
      };

      store.getSnapshot().registerAsyncOperation(activeDbId, op1);
      assert.ok(store._activePollers.has("op-db1-1"));

      // Execute initial poll tick (500ms) for db-1 operation
      await advance(500);
      const db1CallsBeforeSwitch = statusCalls.filter((id) => id === "op-db1-1").length;
      assert.equal(db1CallsBeforeSwitch, 1, "db-1 operation must execute its initial poll");

      // 2. Active database changes from db-1 to db-2 while db-1 operation is actively polling
      activeDbId = "db-2";

      const op2: TrackedAsyncBulkOperation = {
        kind: "async",
        operationId: "op-db2-1",
        dbId: "db-2",
        collection: "logs",
        type: "export",
        status: "pending",
        processedDocuments: 0,
        successfulDocuments: 0,
        failedDocuments: 0,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
        expiresAt: new Date(Date.now() + 3600000).toISOString(),
      };

      store.getSnapshot().registerAsyncOperation(activeDbId, op2);
      assert.ok(store._activePollers.has("op-db2-1"));

      // Advance time by 1000ms: db-1 operation's recurring tick fires while active database is db-2
      await advance(1000);

      const db1CallsAfterSwitch = statusCalls.filter((id) => id === "op-db1-1").length;
      assert.ok(
        db1CallsAfterSwitch > db1CallsBeforeSwitch,
        "db-1 polling must continue uninterrupted even when active database is changed to db-2",
      );

      // Verify isolated state snapshots
      const snapshot = store.getSnapshot();
      assert.equal(snapshot.operationsByDb["db-1"].length, 1);
      assert.equal(snapshot.operationsByDb["db-2"].length, 1);
      assert.equal((snapshot.operationsByDb["db-1"][0] as TrackedAsyncBulkOperation).processedDocuments, 100);

      // Complete db-1 op
      store.getSnapshot().updateAsyncOperation("op-db1-1", { status: "completed" });

      // db-1 poller is stopped, but db-2 poller remains active and polling
      assert.equal(store._activePollers.has("op-db1-1"), false);
      assert.equal(store._activePollers.has("op-db2-1"), true);
    } finally {
      mock.timers.reset();
      store.getSnapshot().resetStore();
    }
  });

  it("delayed poll response cannot overwrite terminal or cancelled status", async () => {
    let resolveDelayedStatus!: (val: MongoBulkOperationStatusResult) => void;
    const delayedPromise = new Promise<MongoBulkOperationStatusResult>((res) => {
      resolveDelayedStatus = res;
    });

    const service = createMockService({
      getMongoBulkOperationStatus: async () => delayedPromise,
    });

    const store = createMongoBulkOperationsStore(service);
    try {
      const op: TrackedAsyncBulkOperation = {
        kind: "async",
        operationId: "op-delayed-res",
        dbId: "db-1",
        collection: "users",
        type: "export",
        status: "in_progress",
        processedDocuments: 10,
        successfulDocuments: 10,
        failedDocuments: 0,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
        expiresAt: new Date(Date.now() + 3600000).toISOString(),
      };

      store.getSnapshot().registerAsyncOperation("db-1", op);
      // Trigger in-flight poll via retryPolling
      store.getSnapshot().retryPolling("op-delayed-res");

      const control = store._activePollers.get("op-delayed-res");
      assert.ok(control);
      assert.equal(control.inFlight, true);

      // Cancel operation while poll request is in flight
      await store.getSnapshot().cancelOperation("op-delayed-res");

      const opAfterCancel = store.getSnapshot().operationsByDb["db-1"][0] as TrackedAsyncBulkOperation;
      assert.equal(opAfterCancel.status, "cancelled");

      // Now resolve the delayed status with an older 'in_progress' result
      resolveDelayedStatus({
        operationId: "op-delayed-res",
        type: "export",
        status: "in_progress",
        collection: "users",
        format: "json",
        processedDocuments: 50,
        successfulDocuments: 50,
        failedDocuments: 0,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
        expiresAt: new Date(Date.now() + 3600000).toISOString(),
      });

      await Promise.resolve();
      await Promise.resolve();

      const opFinal = store.getSnapshot().operationsByDb["db-1"][0] as TrackedAsyncBulkOperation;
      assert.equal(opFinal.status, "cancelled", "Delayed poll response must be discarded and cannot overwrite cancelled state");
    } finally {
      store.getSnapshot().resetStore();
    }
  });

  it("maintains stable cached snapshot identity across repeated getSnapshot calls to avoid React re-render loops", () => {
    const mockService = createMockService();
    const store = createMongoBulkOperationsStore(mockService);

    // Initial snapshot should be reference-equal on repeated calls
    const snapshot1 = store.getSnapshot();
    const snapshot2 = store.getSnapshot();
    assert.strictEqual(snapshot1, snapshot2, "getSnapshot must return cached reference when store has not mutated");

    // Mutation triggers a snapshot reference change
    const op: TrackedAsyncBulkOperation = {
      kind: "async",
      type: "export",
      operationId: "op-snapshot-cache-1",
      dbId: "db-snap",
      collection: "users",
      format: "json",
      status: "pending",
      processedDocuments: 0,
      successfulDocuments: 0,
      failedDocuments: 0,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      expiresAt: new Date(Date.now() + 3600000).toISOString(),
    };

    store.getSnapshot().registerAsyncOperation("db-snap", op);

    const snapshot3 = store.getSnapshot();
    assert.notStrictEqual(snapshot3, snapshot1, "getSnapshot must return a new snapshot reference upon state mutation");

    // After mutation, repeated calls return the new stable cached reference
    const snapshot4 = store.getSnapshot();
    assert.strictEqual(snapshot3, snapshot4, "getSnapshot must return identical reference on subsequent reads after mutation");

    store.getSnapshot().resetStore();
  });
});
