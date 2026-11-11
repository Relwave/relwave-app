import { describe, expect, test, jest, beforeEach, afterEach } from "@jest/globals";
import {
  createDriverSettlementSignal,
  ZombieOperationRegistry,
  UnrecoverableZombieRegistry,
  executeIndependentTeardown,
  OperationLifecycleSupervisor,
} from "../../src/handlers/queryHandlers";
import { SessionManager } from "../../src/sessionManager";
import { OperationLifecycleHandle, TeardownOutcome } from "../../src/types/mongo";
import { DatabaseService } from "../../src/services/databaseService";

function createDeferred<T = void>() {
  let resolve!: (value: T | PromiseLike<T>) => void;
  let reject!: (reason?: any) => void;
  const promise = new Promise<T>((res, rej) => {
    resolve = res;
    reject = rej;
  });
  return { promise, resolve, reject };
}

describe("MongoDB Stage 8 Phase 3 Query Cancellation & Lifecycle Supervision Suite", () => {
  beforeEach(() => {
    ZombieOperationRegistry.resetForTesting();
    UnrecoverableZombieRegistry.resetForTesting();
    jest.restoreAllMocks();
  });

  afterEach(() => {
    ZombieOperationRegistry.resetForTesting();
    UnrecoverableZombieRegistry.resetForTesting();
  });

  // -------------------------------------------------------------------------
  // 1. Authoritative Lease-Release Invariant Tests
  // -------------------------------------------------------------------------

  test("1. Condition A: Natural driver settlement permits release, exactly once", () => {
    let releaseCount = 0;
    const { signal, markSettled } = createDriverSettlementSignal();
    const handle: OperationLifecycleHandle = {
      id: "op-1",
      dbId: "db-1",
      state: "running",
      settlementSignal: signal,
    };

    const supervisor = new OperationLifecycleSupervisor(
      handle,
      () => { releaseCount++; },
      {} as any,
      { uri: "mongodb://localhost:27017", database: "testdb" },
    );

    // Prior to settlement, safeReleaseLease does nothing
    supervisor.safeReleaseLease();
    expect(releaseCount).toBe(0);
    expect(handle.hasReleasedLease).toBeFalsy();

    // Natural settlement occurs
    markSettled("fulfilled");
    expect(signal.isSettled).toBe(true);

    supervisor.safeReleaseLease();
    expect(releaseCount).toBe(1);
    expect(handle.hasReleasedLease).toBe(true);
    expect(handle.state).toBe("completed");

    // Repeated calls are idempotent (exactly once)
    supervisor.safeReleaseLease();
    expect(releaseCount).toBe(1);
  });

  test("2. Condition B: Confirmed socket destruction must await actual driver settlement before releasing lease", async () => {
    let releaseCount = 0;
    const { signal, markSettled } = createDriverSettlementSignal();
    const handle: OperationLifecycleHandle = {
      id: "op-2",
      dbId: "db-1",
      state: "running",
      settlementSignal: signal,
    };

    const mockDbService = {
      connectionPool: { getActiveOperationsCount: () => 1 },
      invalidateConnection: jest.fn().mockImplementation(() => Promise.resolve()),
    };

    const supervisor = new OperationLifecycleSupervisor(
      handle,
      () => { releaseCount++; },
      mockDbService as any,
      { uri: "mongodb://localhost:27017", database: "testdb" },
    );

    // Mock executeDebouncedTeardown to return destroy_confirmed
    const registry = ZombieOperationRegistry.getInstance();
    jest.spyOn(registry, "executeDebouncedTeardown").mockResolvedValue({
      status: "destroy_confirmed",
      invalidationSucceeded: true,
      socketsDestroyed: 2,
      durationMs: 15,
    });

    const teardownPromise = supervisor.runTeardownLoop("client-key-test");

    // Sockets are confirmed destroyed, but driver promise has not settled yet!
    await new Promise((resolve) => setTimeout(resolve, 10));
    expect(releaseCount).toBe(0);
    expect(signal.isSettled).toBe(false);

    // Driver promise rejects due to MongoNetworkError from severed socket
    markSettled("rejected", new Error("MongoNetworkError: connection closed"));

    await teardownPromise;
    expect(releaseCount).toBe(1);
    expect(handle.hasReleasedLease).toBe(true);
  });

  test("3. Strict Prohibitions: Failed teardown and shutdown handoff NEVER release lease", async () => {
    let releaseCount = 0;
    const { signal } = createDriverSettlementSignal();
    const handle: OperationLifecycleHandle = {
      id: "op-3",
      dbId: "db-1",
      state: "running",
      settlementSignal: signal,
    };

    const supervisor = new OperationLifecycleSupervisor(
      handle,
      () => { releaseCount++; },
      {} as any,
      { uri: "mongodb://localhost:27017", database: "testdb" },
    );

    const registry = ZombieOperationRegistry.getInstance();

    // 3a: Shutdown handoff
    jest.spyOn(registry, "executeDebouncedTeardown").mockResolvedValueOnce({
      status: "shutdown_handoff",
      reason: "shutdown_adopted",
      durationMs: 0,
    });

    await supervisor.runTeardownLoop("client-key-test");
    expect(handle.state).toBe("shutdown_adopted");
    expect(releaseCount).toBe(0);
    expect(handle.hasReleasedLease).toBeFalsy();

    // 3b: Unrecoverable failure
    jest.spyOn(registry, "executeDebouncedTeardown").mockResolvedValue({
      status: "unrecoverable_failure",
      invalidationSucceeded: false,
      totalAttempts: 3,
      durationMs: 50,
    });

    await supervisor.runTeardownLoop("client-key-test");
    expect(handle.state).toBe("unrecoverable_pinned");
    expect(releaseCount).toBe(0);
    expect(UnrecoverableZombieRegistry.getInstance().has("op-3")).toBe(true);
  });

  // -------------------------------------------------------------------------
  // 2. Pre-Driver Cancellation Gates & Signal Racing Tests
  // -------------------------------------------------------------------------

  test("4. Pre-driver cancellation gate: Cancel before driver promise unwinds and releases lease", async () => {
    let releaseCount = 0;
    const { signal } = createDriverSettlementSignal();
    const handle: OperationLifecycleHandle = {
      id: "op-gate",
      dbId: "db-gate",
      state: "running",
      settlementSignal: signal,
    };

    const supervisor = new OperationLifecycleSupervisor(
      handle,
      () => { releaseCount++; },
      {} as any,
      { uri: "mongodb://localhost:27017", database: "testdb" },
    );

    // Rejected outer promise prior to driver invocation
    const outerRejection = Promise.reject(new Error("Pre-driver aborted"));

    await supervisor.superviseTimeoutOrCancel(undefined, outerRejection);

    expect(signal.isSettled).toBe(true);
    expect(releaseCount).toBe(1);
    expect(handle.hasReleasedLease).toBe(true);
  });

  test("5. Fast Pre-Check: Already settled driver returns status: driver_settled immediately", async () => {
    const { signal, markSettled } = createDriverSettlementSignal();
    markSettled("fulfilled");

    const handle: OperationLifecycleHandle = {
      id: "op-fast",
      dbId: "db-fast",
      state: "running",
      settlementSignal: signal,
    };

    const outcome = await executeIndependentTeardown(
      {} as any,
      "db-fast",
      {},
      handle,
      1,
      3,
    );

    expect(outcome.status).toBe("driver_settled");
  });

  test("6. Invalidation racing: Driver settling during pool invalidation aborts teardown", async () => {
    const { signal, markSettled } = createDriverSettlementSignal();
    const handle: OperationLifecycleHandle = {
      id: "op-inval-race",
      dbId: "db-inval",
      state: "running",
      settlementSignal: signal,
    };

    const invalDeferred = createDeferred<void>();
    const mockDbService = {
      invalidateConnection: jest.fn().mockReturnValue(invalDeferred.promise),
    };

    const teardownPromise = executeIndependentTeardown(
      mockDbService as any,
      "db-inval",
      {},
      handle,
      1,
      3,
    );

    // Driver settles while invalidation is in-flight
    markSettled("fulfilled");
    invalDeferred.resolve();

    const outcome = await teardownPromise;
    expect(outcome.status).toBe("driver_settled");
  });

  // -------------------------------------------------------------------------
  // 3. Concurrency, Zombie Registry & Escalation
  // -------------------------------------------------------------------------

  test("7. Deadlock-free sole-op recovery: poolActiveOps <= 1 enters teardown immediately", async () => {
    const { signal } = createDriverSettlementSignal();
    const handle: OperationLifecycleHandle = {
      id: "op-sole",
      dbId: "db-sole",
      state: "running",
      settlementSignal: signal,
    };

    const mockDbService = {
      connectionPool: { getActiveOperationsCount: () => 1 },
    };

    const supervisor = new OperationLifecycleSupervisor(
      handle,
      () => {},
      mockDbService as any,
      { uri: "mongodb://localhost:27017", database: "testdb" },
    );

    const teardownSpy = jest.spyOn(supervisor, "runTeardownLoop").mockResolvedValue();

    const outerPromise = Promise.reject(new Error("Timeout")).catch(() => {});
    const driverDeferred = createDeferred<void>();

    await supervisor.superviseTimeoutOrCancel(driverDeferred.promise, outerPromise as any, 10);

    // Teardown should have been invoked immediately without registering a 60s zombie
    expect(teardownSpy).toHaveBeenCalledTimes(1);
    expect(ZombieOperationRegistry.getInstance().getZombiesForDb("db-sole")).toHaveLength(0);
  });

  test("8. Sibling concurrency: poolActiveOps > 1 pins zombie with active 60s escalation timer", async () => {
    const { signal } = createDriverSettlementSignal();
    const handle: OperationLifecycleHandle = {
      id: "op-sibling",
      dbId: "db-sibling",
      state: "running",
      settlementSignal: signal,
    };

    let escalated = false;
    const registry = ZombieOperationRegistry.getInstance();
    registry.registerZombie(handle, "client-key-sibling", () => {
      escalated = true;
    });

    expect(handle.state).toBe("zombie_pinned");
    expect(registry.getZombiesForDb("db-sibling")).toHaveLength(1);
    expect(escalated).toBe(false);

    // Unregister cancels the timer cleanly
    registry.unregisterZombie(handle.id);
    expect(registry.getZombiesForDb("db-sibling")).toHaveLength(0);
  });

  test("9. Shutdown handoff: snapshotAndDisarm disarms timers and snapshots in-flight teardowns", async () => {
    const registry = ZombieOperationRegistry.getInstance();

    const { signal } = createDriverSettlementSignal();
    const handle: OperationLifecycleHandle = {
      id: "op-shutdown",
      dbId: "db-shutdown",
      state: "running",
      settlementSignal: signal,
    };

    registry.registerZombie(handle, "key-shut", () => {});
    expect(registry.getZombiesForDb("db-shutdown")).toHaveLength(1);

    // Mock an in-flight teardown
    const inFlightOutcome: TeardownOutcome = {
      status: "destroy_confirmed",
      invalidationSucceeded: true,
      socketsDestroyed: 1,
      durationMs: 20,
    };
    registry.executeDebouncedTeardown("db-shutdown", "key-shut", async () => inFlightOutcome);

    const adopted = registry.snapshotAndDisarm();
    expect(adopted.length).toBeGreaterThanOrEqual(1);
    expect(registry.getZombiesForDb("db-shutdown")).toHaveLength(0);

    // Adoption with Promise.allSettled is rejection-safe
    const results = await Promise.allSettled(adopted);
    expect(results[0].status).toBe("fulfilled");
  });

  // -------------------------------------------------------------------------
  // 4. SessionManager Synchronous Non-Blocking Cancel
  // -------------------------------------------------------------------------

  test("10. SessionManager synchronous non-blocking cancel and at-most-once callback", () => {
    const sm = new SessionManager();
    const sid = "sess-123";
    sm.create(sid);

    let callbackCount = 0;
    sm.registerCancel(sid, () => {
      callbackCount++;
    });

    // Synchronous cancel returns boolean
    const res1 = sm.cancel(sid);
    expect(res1).toBe(true);
    expect(callbackCount).toBe(1);

    // Repeated cancel is idempotent and does not dispatch duplicate callback
    const res2 = sm.cancel(sid);
    expect(res2).toBe(true);
    expect(callbackCount).toBe(1);

    // Unknown session returns false
    const resUnknown = sm.cancel("unknown-session-id");
    expect(resUnknown).toBe(false);

    sm.destroy();
  });

  test("11. SessionManager post-registration cancel dispatch", () => {
    const sm = new SessionManager();
    const sid = "sess-early-cancel";
    sm.create(sid);

    // Cancel arrives before cancel callback is registered
    const cancelled = sm.cancel(sid);
    expect(cancelled).toBe(true);

    let callbackFired = false;
    sm.registerCancel(sid, () => {
      callbackFired = true;
    });

    // Callback is dispatched immediately upon registration
    expect(callbackFired).toBe(true);

    sm.destroy();
  });
});
