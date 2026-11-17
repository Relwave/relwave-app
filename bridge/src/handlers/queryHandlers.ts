import { Rpc } from "../types";
import { DatabaseService } from "../services/databaseService";
import { QueryExecutor } from "../services/queryExecutor";
import { SessionManager } from "../sessionManager";
import { getConnector } from "../services/connectorRegistry";
import {
  MongoApiError,
  mapMongoError,
  getClientKey,
  closeMongoClientByKey,
  initiateCursorClose,
} from "../connectors/mongo";
import { Logger } from "pino";
import logger from "../services/logger";
import { v4 as uuidv4 } from "uuid";
import {
  DriverSettlementSignal,
  MongoExecutionContext,
  OperationLifecycleHandle,
  TeardownOutcome,
} from "../types/mongo";

// ---------------------------------------------------------------------------
// Driver Settlement Signal Constructor
// ---------------------------------------------------------------------------

export function createDriverSettlementSignal(driverPromise?: Promise<any>): {
  signal: DriverSettlementSignal;
  markSettled: (outcome?: "fulfilled" | "rejected", error?: unknown) => void;
  attachPromise: (promise: Promise<any>) => void;
} {
  let isSettled = false;
  let settledAt: number | undefined;
  let settledOutcome: "fulfilled" | "rejected" | undefined;
  let settledError: unknown;
  let resolveSettlement!: (val: { outcome: "fulfilled" | "rejected"; error?: unknown }) => void;

  const settlementPromise = new Promise<{ outcome: "fulfilled" | "rejected"; error?: unknown }>(
    (resolve) => {
      resolveSettlement = resolve;
    },
  );

  const markSettled = (outcome: "fulfilled" | "rejected" = "fulfilled", error?: unknown) => {
    if (isSettled) return;
    isSettled = true;
    settledAt = Date.now();
    settledOutcome = outcome;
    settledError = error;
    resolveSettlement({ outcome, error });
  };

  const attachPromise = (promise: Promise<any>) => {
    promise.then(() => markSettled("fulfilled")).catch((err) => markSettled("rejected", err));
  };

  if (driverPromise) {
    attachPromise(driverPromise);
  }

  const signal: DriverSettlementSignal = {
    get isSettled() {
      return isSettled;
    },
    get settledAt() {
      return settledAt;
    },
    get outcome() {
      return settledOutcome;
    },
    get error() {
      return settledError;
    },
    promise: settlementPromise,
    markSettled,
  };

  return { signal, markSettled, attachPromise };
}

// ---------------------------------------------------------------------------
// Zombie Operation Registry & Active 60s Escalation
// ---------------------------------------------------------------------------

export interface ZombieOperation {
  dbId: string;
  clientKey: string;
  handle: OperationLifecycleHandle;
  timer: NodeJS.Timeout;
  registeredAt: number;
}

export class ZombieOperationRegistry {
  private static instance: ZombieOperationRegistry;
  private zombies = new Map<string, ZombieOperation>();
  private teardownInFlight = new Map<string, Promise<TeardownOutcome>>();
  public clientTeardownInFlight = new Map<string, Promise<TeardownOutcome>>();
  private isShuttingDown = false;

  public static readonly MAX_ZOMBIES_PER_DB = 5;
  public static readonly ZOMBIE_MAX_TTL_MS = 60000;

  public static getInstance(): ZombieOperationRegistry {
    if (!ZombieOperationRegistry.instance) {
      ZombieOperationRegistry.instance = new ZombieOperationRegistry();
    }
    return ZombieOperationRegistry.instance;
  }

  public static resetForTesting(): void {
    if (ZombieOperationRegistry.instance) {
      ZombieOperationRegistry.instance.snapshotAndDisarm();
      ZombieOperationRegistry.instance = new ZombieOperationRegistry();
    }
  }

  registerZombie(
    handle: OperationLifecycleHandle,
    clientKey: string,
    onEscalate: () => void,
  ): boolean {
    if (this.isShuttingDown) return false;

    // Disarm previous timer if any
    const existing = this.zombies.get(handle.id);
    if (existing) {
      clearTimeout(existing.timer);
    }

    const timer = setTimeout(() => {
      this.zombies.delete(handle.id);
      onEscalate();
    }, ZombieOperationRegistry.ZOMBIE_MAX_TTL_MS);

    if (timer.unref) timer.unref();

    this.zombies.set(handle.id, {
      dbId: handle.dbId,
      clientKey,
      handle,
      timer,
      registeredAt: Date.now(),
    });

    handle.state = "zombie_pinned";
    return true;
  }

  unregisterZombie(handleId: string): void {
    const zombie = this.zombies.get(handleId);
    if (zombie) {
      clearTimeout(zombie.timer);
      this.zombies.delete(handleId);
    }
  }

  getZombiesForDb(dbId: string): ZombieOperation[] {
    return Array.from(this.zombies.values()).filter((z) => z.dbId === dbId);
  }

  snapshotAndDisarm(): Promise<TeardownOutcome>[] {
    this.isShuttingDown = true;

    // Disarm all active 60s timers and retry timers
    for (const zombie of this.zombies.values()) {
      clearTimeout(zombie.timer);
      if (zombie.handle.retryTimer) {
        clearTimeout(zombie.handle.retryTimer);
      }
    }
    this.zombies.clear();

    // Snapshot in-flight teardown promises (adopted by shutdown drain via Promise.allSettled)
    return Array.from(this.teardownInFlight.values());
  }

  async executeDebouncedTeardown(
    dbId: string,
    clientKey: string,
    action: () => Promise<TeardownOutcome>,
  ): Promise<TeardownOutcome> {
    if (this.isShuttingDown) {
      return { status: "shutdown_handoff", reason: "shutdown_adopted", durationMs: 0 };
    }

    let pending = this.teardownInFlight.get(dbId);
    if (!pending) {
      pending = (async () => {
        try {
          return await action();
        } finally {
          this.teardownInFlight.delete(dbId);
          this.clientTeardownInFlight.delete(clientKey);
        }
      })();
      this.teardownInFlight.set(dbId, pending);
      this.clientTeardownInFlight.set(clientKey, pending);
    }
    return pending;
  }
}

// ---------------------------------------------------------------------------
// Unrecoverable Zombie Registry
// ---------------------------------------------------------------------------

export class UnrecoverableZombieRegistry {
  private static instance: UnrecoverableZombieRegistry;
  private unrecoverable = new Map<string, OperationLifecycleHandle>();

  public static getInstance(): UnrecoverableZombieRegistry {
    if (!UnrecoverableZombieRegistry.instance) {
      UnrecoverableZombieRegistry.instance = new UnrecoverableZombieRegistry();
    }
    return UnrecoverableZombieRegistry.instance;
  }

  public static resetForTesting(): void {
    UnrecoverableZombieRegistry.instance = new UnrecoverableZombieRegistry();
  }

  register(handle: OperationLifecycleHandle): void {
    handle.state = "unrecoverable_pinned";
    this.unrecoverable.set(handle.id, handle);
  }

  unregister(handleId: string): void {
    // Strictly does NOT release lease!
    this.unrecoverable.delete(handleId);
  }

  get(handleId: string): OperationLifecycleHandle | undefined {
    return this.unrecoverable.get(handleId);
  }

  has(handleId: string): boolean {
    return this.unrecoverable.has(handleId);
  }

  size(): number {
    return this.unrecoverable.size;
  }
}

// ---------------------------------------------------------------------------
// Resilient Independent Teardown Engine with Signal Racing
// ---------------------------------------------------------------------------

export async function executeIndependentTeardown(
  dbService: DatabaseService,
  dbId: string,
  conn: any,
  handle: OperationLifecycleHandle,
  attempt: number,
  maxAttempts: number,
): Promise<TeardownOutcome> {
  const startedAt = Date.now();

  // 1. Fast Pre-Check: Was the driver promise already settled?
  if (handle.settlementSignal?.isSettled) {
    return { status: "driver_settled", durationMs: Date.now() - startedAt };
  }

  let invalidationSucceeded = false;
  let invalidationError: unknown;

  // 2. Race Invalidation against Natural Settlement
  try {
    const invalPromise = dbService.invalidateConnection(dbId);
    const raceResult = await Promise.race([
      invalPromise.then(() => ({ type: "inval_done" as const })),
      handle.settlementSignal.promise.then(() => ({ type: "driver_settled" as const })),
    ]);

    if (raceResult.type === "driver_settled" || handle.settlementSignal.isSettled) {
      return { status: "driver_settled", durationMs: Date.now() - startedAt };
    }
    invalidationSucceeded = true;
  } catch (err) {
    invalidationError = err;
    logger.warn(
      { dbId, err },
      "Pool invalidation threw; proceeding to independent socket teardown",
    );
  }

  // 3. Post-Invalidation Settlement Check
  if (handle.settlementSignal.isSettled) {
    return { status: "driver_settled", durationMs: Date.now() - startedAt };
  }

  // 4. Race Forced Socket Destruction against Natural Settlement
  let socketResult: { status: string; destroyedCount?: number; error?: unknown };
  try {
    const clientKey = getClientKey(conn);
    const socketDestructionPromise = closeMongoClientByKey(clientKey, {
      force: true,
      timeoutMs: 100,
    });

    const socketRace = await Promise.race([
      socketDestructionPromise.then((res: any) => ({ type: "destroyed" as const, res })),
      handle.settlementSignal.promise.then(() => ({ type: "driver_settled" as const })),
    ]);

    if (socketRace.type === "driver_settled" || handle.settlementSignal.isSettled) {
      return { status: "driver_settled", durationMs: Date.now() - startedAt };
    }

    socketResult = (socketRace as any).res || { status: "destroy_confirmed" };
  } catch (err) {
    socketResult = { status: "destroy_failed", error: err };
  }

  const durationMs = Date.now() - startedAt;

  // 5. Outcome Evaluation
  if (socketResult.status === "destroy_confirmed") {
    return {
      status: "destroy_confirmed",
      invalidationSucceeded,
      socketsDestroyed: socketResult.destroyedCount ?? 1,
      durationMs,
    };
  }

  if (attempt < maxAttempts) {
    return {
      status: "retryable_failure",
      invalidationSucceeded,
      socketError: socketResult.error,
      invalidationError,
      attempt,
      durationMs,
    };
  }

  return {
    status: "unrecoverable_failure",
    invalidationSucceeded,
    socketError: socketResult.error,
    invalidationError,
    totalAttempts: attempt,
    durationMs,
  };
}

// ---------------------------------------------------------------------------
// Authoritative Operation Lifecycle Supervisor
// ---------------------------------------------------------------------------

export class OperationLifecycleSupervisor {
  private hasReleasedLease = false;
  private readonly maxTeardownAttempts = 3;

  constructor(
    private handle: OperationLifecycleHandle,
    private leaseReleaseFn: () => void,
    private dbService: DatabaseService,
    private conn: any,
    private zombieRegistry: ZombieOperationRegistry = ZombieOperationRegistry.getInstance(),
    private unrecoverableRegistry: UnrecoverableZombieRegistry = UnrecoverableZombieRegistry.getInstance(),
  ) {}

  /**
   * The Authoritative Lease-Release Invariant:
   * Exclusive Ownership: OperationLifecycleSupervisor alone possesses and calls safeReleaseLease().
   * Condition A: Driver promise settled naturally (handle.settlementSignal.isSettled === true).
   * Condition B: Sockets confirmed destroyed (status === "destroy_confirmed"), AND supervisor has subsequently awaited actual driver settlement (await handle.settlementSignal.promise).
   */
  public safeReleaseLease(): void {
    if (this.hasReleasedLease) return;
    if (!this.handle.settlementSignal.isSettled) {
      // Lease release is forbidden while driver promise remains unsettled!
      return;
    }
    this.hasReleasedLease = true;
    this.handle.hasReleasedLease = true;
    this.handle.state = "completed";
    try {
      this.leaseReleaseFn();
    } catch (err) {
      logger.error({ err, handleId: this.handle.id }, "Error releasing connection lease");
    }
  }

  async superviseTimeoutOrCancel(
    driverPromiseRef: Promise<any> | undefined,
    outerPromise: Promise<any>,
    cleanRecoveryTimeoutMs: number = 5000,
  ): Promise<void> {
    this.handle.state = "rpc_rejected_driver_pending";

    // Pre-driver cancellation gate: If cancelled before driver promise creation
    if (!driverPromiseRef) {
      await outerPromise.catch(() => {});
      this.handle.settlementSignal.markSettled();
      this.safeReleaseLease();
      return;
    }

    // Launch cursor close with 2000ms deadline if cursor exists
    if (this.handle.cursor) {
      initiateCursorClose(this.handle.cursor)
        .then((outcome) => {
          this.handle.cursorCloseOutcome = outcome;
        })
        .catch(() => {});
    }

    // Fast check: did driver promise already settle?
    if (this.handle.settlementSignal.isSettled) {
      this.safeReleaseLease();
      return;
    }

    // clean recovery deadline racing
    let deadlineTimer: NodeJS.Timeout | undefined;
    const cleanDeadlinePromise = new Promise<{ type: "deadline" }>((resolve) => {
      deadlineTimer = setTimeout(() => resolve({ type: "deadline" }), cleanRecoveryTimeoutMs);
    });

    const race5s = await Promise.race([
      this.handle.settlementSignal.promise.then(() => ({ type: "driver_settled" as const })),
      cleanDeadlinePromise,
    ]);

    if (deadlineTimer) clearTimeout(deadlineTimer);

    if (race5s.type === "driver_settled" || this.handle.settlementSignal.isSettled) {
      this.safeReleaseLease();
      return;
    }

    // Operation is hung past deadline. Check sibling concurrency.
    const clientKey = getClientKey(this.conn);
    const poolActiveOps = (this.dbService as any).connectionPool?.getActiveOperationsCount() ?? 1;

    if (poolActiveOps <= 1) {
      // Deadlock-free sole op recovery: initiate teardown immediately
      await this.runTeardownLoop(clientKey);
    } else {
      // Sibling concurrency: pin as zombie with active 60s escalation timer
      this.zombieRegistry.registerZombie(this.handle, clientKey, async () => {
        await this.runTeardownLoop(clientKey);
      });
    }
  }

  public async runTeardownLoop(clientKey: string): Promise<void> {
    this.handle.state = "teardown_initiated";

    const delays = [0, 1000, 3000];

    for (let attempt = 1; attempt <= this.maxTeardownAttempts; attempt++) {
      // Check settlement before retry delay
      if (this.handle.settlementSignal.isSettled) {
        this.safeReleaseLease();
        return;
      }

      const delay = delays[attempt - 1];
      if (delay > 0) {
        let retryTimer: NodeJS.Timeout | undefined;
        const delayPromise = new Promise<{ type: "delay" }>((resolve) => {
          retryTimer = setTimeout(() => resolve({ type: "delay" }), delay);
        });
        this.handle.retryTimer = retryTimer;

        const delayRace = await Promise.race([
          this.handle.settlementSignal.promise.then(() => ({ type: "driver_settled" as const })),
          delayPromise,
        ]);

        if (retryTimer) clearTimeout(retryTimer);
        this.handle.retryTimer = undefined;

        if (delayRace.type === "driver_settled" || this.handle.settlementSignal.isSettled) {
          this.safeReleaseLease();
          return;
        }
      }

      const outcome = await this.zombieRegistry.executeDebouncedTeardown(
        this.handle.dbId,
        clientKey,
        () =>
          executeIndependentTeardown(
            this.dbService,
            this.handle.dbId,
            this.conn,
            this.handle,
            attempt,
            this.maxTeardownAttempts,
          ),
      );

      if (outcome.status === "driver_settled" || this.handle.settlementSignal.isSettled) {
        this.safeReleaseLease();
        return;
      }

      if (outcome.status === "destroy_confirmed") {
        // Condition B: Sockets confirmed destroyed.
        // Await actual driver settlement (caused by MongoNetworkError from destroyed socket)
        await this.handle.settlementSignal.promise;
        this.safeReleaseLease();
        return;
      }

      if (outcome.status === "shutdown_handoff") {
        this.handle.state = "shutdown_adopted";
        // Lease remains held until Phase 4 socket destruction unblocks driver
        return;
      }

      if (outcome.status === "retryable_failure") {
        this.handle.state = "teardown_failed_pinned";
        // Continue to next retry attempt
        continue;
      }

      if (outcome.status === "unrecoverable_failure") {
        this.handle.state = "unrecoverable_pinned";
        this.unrecoverableRegistry.register(this.handle);
        // Lease remains held until driver settlement or process termination
        return;
      }
    }
  }
}

export class QueryHandlers {
  constructor(
    private rpc: Rpc,
    private logger: Logger,
    private sessions: SessionManager,
    private dbService: DatabaseService,
    private queryExecutor: QueryExecutor,
  ) {}

  async handleQueryRun(params: any, id: number | string) {
    const { sessionId, dbId, sql, batchSize = 200 } = params || {};

    if (!sessionId || !dbId || !sql) {
      return this.rpc.sendError(id, {
        code: "BAD_REQUEST",
        message: "Missing sessionId, dbId, or sql",
      });
    }

    try {
      const { conn, dbType } = await this.dbService.getDatabaseConnection(dbId);

      this.rpc.sendNotification?.("query.started", {
        sessionId,
        info: { sqlPreview: sql.slice(0, 200), dbId, dbType },
      });

      let cancelled = false;
      const cancelState: { fn: (() => Promise<void>) | null } = { fn: null };

      const { runner, totalRows, start } = await this.queryExecutor.executeQuery(
        { sessionId, dbId, sql, batchSize },
        conn,
        dbType,
        this.rpc,
        (cancelFn) => {
          cancelState.fn = cancelFn;
        },
      );

      this.sessions.registerCancel(sessionId, async () => {
        cancelled = true;
        if (cancelState.fn) await cancelState.fn();
      });

      // Run streaming in background
      (async () => {
        try {
          await runner.promise;
        } catch (err: any) {
          if (String(err).toLowerCase().includes("cancel") || cancelled) {
            this.rpc.sendNotification?.("query.done", {
              sessionId,
              rows: totalRows,
              timeMs: Date.now() - start,
              status: "cancelled",
            });
          } else {
            this.logger.error({ err, sessionId }, "Query error");
            this.rpc.sendNotification?.("query.error", {
              sessionId,
              error: { message: String(err) },
            });
          }
        } finally {
          this.sessions.remove(sessionId);
          cancelState.fn = null;
        }
      })();

      this.rpc.sendResponse(id, { ok: true });
    } catch (initError: any) {
      this.sessions.remove(sessionId);
      this.logger.error({ initError }, "Query setup failed");
      this.rpc.sendError(id, { code: "SETUP_ERROR", message: String(initError) });
    }
  }

  async handleFetchTableData(params: any, id: number | string) {
    try {
      const { dbId, schemaName, tableName, limit, page } = params || {};
      if (!dbId || !tableName || !schemaName) {
        return this.rpc.sendError(id, {
          code: "BAD_REQUEST",
          message: "Missing dbId, schemaName, or tableName",
        });
      }
      const { conn, dbType } = await this.dbService.getDatabaseConnection(dbId);
      const data = await (getConnector(dbType) as any).fetchTableData(
        conn,
        schemaName,
        tableName,
        limit,
        page,
      );
      this.rpc.sendResponse(id, { ok: true, data });
    } catch (e: any) {
      this.logger.error({ e }, "fetchTableData failed");
      this.rpc.sendError(id, { code: "IO_ERROR", message: String(e) });
    }
  }

  async handleFetchPrimaryKeys(params: any, id: number | string) {
    try {
      const { dbId, schemaName, tableName } = params || {};
      if (!dbId || !tableName || !schemaName) {
        return this.rpc.sendError(id, {
          code: "BAD_REQUEST",
          message: "Missing dbId, schemaName, or tableName",
        });
      }
      const { conn, dbType } = await this.dbService.getDatabaseConnection(dbId);
      const primaryKeys = await (getConnector(dbType) as any).listPrimaryKeys(
        conn,
        schemaName,
        tableName,
      );
      this.rpc.sendResponse(id, { ok: true, primaryKeys });
    } catch (e: any) {
      this.logger.error({ e }, "fetchPrimaryKeys failed");
      this.rpc.sendError(id, { code: "IO_ERROR", message: String(e) });
    }
  }

  async handleCreateTable(params: any, id: number | string) {
    try {
      const { dbId, schemaName, tableName, columns, foreignKeys = [] } = params || {};
      if (!dbId || !tableName || !schemaName) {
        return this.rpc.sendError(id, {
          code: "BAD_REQUEST",
          message: "Missing dbId, schemaName, or tableName",
        });
      }
      const { conn, dbType } = await this.dbService.getDatabaseConnection(dbId);
      const connector = getConnector(dbType) as any;
      const result = await connector.createTable(conn, schemaName, tableName, columns, foreignKeys);
      connector[`${dbType}Cache`]?.clearForConnection(conn);
      this.rpc.sendResponse(id, { ok: true, result });
    } catch (e: any) {
      this.logger.error({ e }, "createTable failed");
      this.rpc.sendError(id, { code: "IO_ERROR", message: String(e) });
    }
  }

  async handleCreateIndexes(params: any, id: number | string) {
    try {
      const { dbId, schemaName, indexes } = params || {};
      if (!dbId || !schemaName) {
        return this.rpc.sendError(id, {
          code: "BAD_REQUEST",
          message: "Missing dbId or schemaName",
        });
      }
      const { conn, dbType } = await this.dbService.getDatabaseConnection(dbId);
      const connector = getConnector(dbType) as any;
      const result = await connector.createIndexes(conn, schemaName, indexes);
      connector[`${dbType}Cache`]?.clearForConnection(conn);
      this.rpc.sendResponse(id, { ok: true, result });
    } catch (e: any) {
      this.logger.error({ e }, "createIndexes failed");
      this.rpc.sendError(id, { code: "IO_ERROR", message: String(e) });
    }
  }

  async handleAlterTable(params: any, id: number | string) {
    try {
      const { dbId, schemaName, tableName, operations } = params || {};
      if (!dbId || !schemaName || !tableName) {
        return this.rpc.sendError(id, {
          code: "BAD_REQUEST",
          message: "Missing dbId, schemaName, or tableName",
        });
      }
      const { conn, dbType } = await this.dbService.getDatabaseConnection(dbId);
      const connector = getConnector(dbType) as any;
      const result = await connector.alterTable(conn, schemaName, tableName, operations);
      connector[`${dbType}Cache`]?.clearForConnection(conn);
      this.rpc.sendResponse(id, { ok: true, result });
    } catch (e: any) {
      this.logger.error({ e }, "alterTable failed");
      this.rpc.sendError(id, { code: "IO_ERROR", message: String(e) });
    }
  }

  async handleDropTable(params: any, id: number | string) {
    try {
      const { dbId, schemaName, tableName } = params || {};
      if (!dbId || !schemaName || !tableName) {
        return this.rpc.sendError(id, {
          code: "BAD_REQUEST",
          message: "Missing dbId, schemaName, or tableName",
        });
      }
      const { conn, dbType } = await this.dbService.getDatabaseConnection(dbId);
      const connector = getConnector(dbType) as any;
      const result = await connector.dropTable(conn, schemaName, tableName);
      connector[`${dbType}Cache`]?.clearForConnection(conn);
      this.rpc.sendResponse(id, { ok: true, result });
    } catch (e: any) {
      this.logger.error({ e }, "dropTable failed");
      this.rpc.sendError(id, { code: "IO_ERROR", message: String(e) });
    }
  }

  async connectToDatabase(params: any, id: number | string) {
    try {
      const { dbId } = params || {};
      if (!dbId) {
        return this.rpc.sendError(id, { code: "BAD_REQUEST", message: "Missing dbId" });
      }
      const { conn, dbType } = await this.dbService.getDatabaseConnection(dbId);
      const result = await (getConnector(dbType) as any).connectToDatabase(conn, dbId);
      this.rpc.sendResponse(id, { ok: true, result });
    } catch (e: any) {
      this.logger.error({ e }, "connectToDatabase failed");
      this.rpc.sendError(id, { code: "IO_ERROR", message: String(e) });
    }
  }

  async handleInsertRow(params: any, id: number | string) {
    try {
      const { dbId, schemaName, tableName, rowData } = params || {};
      if (!dbId || !schemaName || !tableName || !rowData) {
        return this.rpc.sendError(id, {
          code: "BAD_REQUEST",
          message: "Missing dbId, schemaName, tableName, or rowData",
        });
      }
      const { conn, dbType } = await this.dbService.getDatabaseConnection(dbId);
      const connector = getConnector(dbType) as any;
      const result = await connector.insertRow(conn, schemaName, tableName, rowData);
      connector[`${dbType}Cache`]?.clearForConnection(conn);
      this.rpc.sendResponse(id, { ok: true, result });
    } catch (e: any) {
      this.logger.error({ e }, "insertRow failed");
      this.rpc.sendError(id, { code: "IO_ERROR", message: String(e) });
    }
  }

  async handleUpdateRow(params: any, id: number | string) {
    try {
      const { dbId, schemaName, tableName, primaryKeyColumn, primaryKeyValue, rowData } =
        params || {};
      if (
        !dbId ||
        !schemaName ||
        !tableName ||
        !primaryKeyColumn ||
        primaryKeyValue === undefined ||
        !rowData
      ) {
        return this.rpc.sendError(id, {
          code: "BAD_REQUEST",
          message: "Missing required update fields",
        });
      }
      const { conn, dbType } = await this.dbService.getDatabaseConnection(dbId);
      const connector = getConnector(dbType) as any;
      const result = await connector.updateRow(
        conn,
        schemaName,
        tableName,
        primaryKeyColumn,
        primaryKeyValue,
        rowData,
      );
      connector[`${dbType}Cache`]?.clearForConnection(conn);
      this.rpc.sendResponse(id, { ok: true, result });
    } catch (e: any) {
      this.logger.error({ e }, "updateRow failed");
      this.rpc.sendError(id, { code: "IO_ERROR", message: String(e) });
    }
  }

  async handleDeleteRow(params: any, id: number | string) {
    try {
      const { dbId, schemaName, tableName, primaryKeyColumn, primaryKeyValue } = params || {};
      if (!dbId || !schemaName || !tableName) {
        return this.rpc.sendError(id, {
          code: "BAD_REQUEST",
          message: "Missing dbId, schemaName, or tableName",
        });
      }
      if (!primaryKeyColumn && (typeof primaryKeyValue !== "object" || primaryKeyValue === null)) {
        return this.rpc.sendError(id, {
          code: "BAD_REQUEST",
          message: "Either primaryKeyColumn or composite key object is required",
        });
      }
      const { conn, dbType } = await this.dbService.getDatabaseConnection(dbId);
      const connector = getConnector(dbType) as any;
      const result = await connector.deleteRow(
        conn,
        schemaName,
        tableName,
        primaryKeyColumn,
        primaryKeyValue,
      );
      connector[`${dbType}Cache`]?.clearForConnection(conn);
      this.rpc.sendResponse(id, { ok: true, deleted: result });
    } catch (e: any) {
      this.logger.error({ e }, "deleteRow failed");
      this.rpc.sendError(id, { code: "IO_ERROR", message: String(e) });
    }
  }

  async handleSearchTable(params: any, id: number | string) {
    try {
      const { dbId, schemaName, tableName, searchTerm, column, page, pageSize } = params || {};
      if (!dbId || !schemaName || !tableName || !searchTerm) {
        return this.rpc.sendError(id, {
          code: "BAD_REQUEST",
          message: "Missing dbId, schemaName, tableName, or searchTerm",
        });
      }
      const { conn, dbType } = await this.dbService.getDatabaseConnection(dbId);
      const result = await (getConnector(dbType) as any).searchTable(
        conn,
        schemaName,
        tableName,
        searchTerm,
        column,
        page || 1,
        pageSize || 50,
      );
      this.rpc.sendResponse(id, { ok: true, ...result });
    } catch (e: any) {
      this.logger.error({ e }, "searchTable failed");
      this.rpc.sendError(id, { code: "IO_ERROR", message: String(e) });
    }
  }

  // ---- M2: MongoDB document engine handlers (docs/MONGODB_M2_SPEC.md §13) ----

  /** Map a MongoApiError (or driver error) to the stable M2 error envelope. */
  private sendMongoError(id: number | string, e: unknown): void {
    const mapped =
      e instanceof MongoApiError ? { code: e.code, message: e.message } : mapMongoError(e);
    this.logger.error({ err: e, code: mapped.code }, "MongoDB document operation failed");
    this.rpc.sendError(id, { code: mapped.code, message: mapped.message });
  }

  async handleFetchDocuments(params: any, id: number | string) {
    try {
      const { dbId, collection, filter, sort, projection, page, pageSize } = params || {};
      if (!dbId || !collection) {
        return this.rpc.sendError(id, {
          code: "MONGO_VALIDATION_ERROR",
          message: "Missing dbId or collection",
        });
      }
      const data = await this.dbService.withConnection(dbId, (conn, _db, dbType) =>
        this.queryExecutor.findDocuments(conn, dbType, {
          collection,
          filter,
          sort,
          projection,
          page,
          pageSize,
        }),
      );
      this.rpc.sendResponse(id, { ok: true, data });
    } catch (e) {
      this.sendMongoError(id, e);
    }
  }

  async handleInsertDocument(params: any, id: number | string) {
    try {
      const { dbId, collection, document } = params || {};
      if (!dbId || !collection || !document) {
        return this.rpc.sendError(id, {
          code: "MONGO_VALIDATION_ERROR",
          message: "Missing dbId, collection, or document",
        });
      }
      const data = await this.dbService.withConnection(dbId, (conn, _db, dbType) =>
        this.queryExecutor.insertDocument(conn, dbType, { collection, document }),
      );
      this.rpc.sendResponse(id, { ok: true, data });
    } catch (e) {
      this.sendMongoError(id, e);
    }
  }

  async handleUpdateDocument(params: any, id: number | string) {
    try {
      const { dbId, collection, filter, update, options } = params || {};
      if (!dbId || !collection || !filter || !update) {
        return this.rpc.sendError(id, {
          code: "MONGO_VALIDATION_ERROR",
          message: "Missing dbId, collection, filter, or update",
        });
      }
      const data = await this.dbService.withConnection(dbId, (conn, _db, dbType) =>
        this.queryExecutor.updateDocument(conn, dbType, {
          collection,
          filter,
          update,
          options,
        }),
      );
      this.rpc.sendResponse(id, { ok: true, data });
    } catch (e) {
      this.sendMongoError(id, e);
    }
  }

  async handleDeleteDocument(params: any, id: number | string) {
    try {
      const { dbId, collection, filter, options } = params || {};
      if (!dbId || !collection || !filter) {
        return this.rpc.sendError(id, {
          code: "MONGO_VALIDATION_ERROR",
          message: "Missing dbId, collection, or filter",
        });
      }
      const data = await this.dbService.withConnection(dbId, (conn, _db, dbType) =>
        this.queryExecutor.deleteDocument(conn, dbType, {
          collection,
          filter,
          options,
        }),
      );
      this.rpc.sendResponse(id, { ok: true, data });
    } catch (e) {
      this.sendMongoError(id, e);
    }
  }

  async handleRunAggregation(params: any, id: number | string) {
    try {
      const { dbId, collection, pipeline, options } = params || {};
      if (!dbId || !collection || !pipeline) {
        return this.rpc.sendError(id, {
          code: "MONGO_VALIDATION_ERROR",
          message: "Missing dbId, collection, or pipeline",
        });
      }
      const data = await this.dbService.withConnection(dbId, (conn, _db, dbType) =>
        this.queryExecutor.runAggregation(conn, dbType, {
          collection,
          pipeline,
          options,
        }),
      );
      this.rpc.sendResponse(id, { ok: true, data });
    } catch (e) {
      this.sendMongoError(id, e);
    }
  }

  async handleListCollections(params: any, id: number | string) {
    try {
      const { dbId } = params || {};
      if (!dbId) {
        return this.rpc.sendError(id, {
          code: "MONGO_VALIDATION_ERROR",
          message: "Missing dbId",
        });
      }
      const data = await this.dbService.withConnection(dbId, (conn, _db, dbType) =>
        this.queryExecutor.listCollections(conn, dbType, params),
      );
      this.rpc.sendResponse(id, { ok: true, data });
    } catch (e) {
      this.sendMongoError(id, e);
    }
  }

  async handleGetInferredSchema(params: any, id: number | string) {
    try {
      const { dbId, collection, sampleSize, maxDepth } = params || {};
      if (!dbId || !collection) {
        return this.rpc.sendError(id, {
          code: "MONGO_VALIDATION_ERROR",
          message: "Missing dbId or collection",
        });
      }
      const data = await this.dbService.withConnection(dbId, (conn, _db, dbType) =>
        this.queryExecutor.inferCollectionSchema(conn, dbType, {
          collection,
          sampleSize,
          maxDepth,
        }),
      );
      this.rpc.sendResponse(id, { ok: true, data });
    } catch (e) {
      this.sendMongoError(id, e);
    }
  }

  async handleReplaceDocument(params: any, id: number | string) {
    try {
      const { dbId, collection, filter, replacement, options } = params || {};
      if (!dbId || !collection || !filter || !replacement) {
        return this.rpc.sendError(id, {
          code: "MONGO_VALIDATION_ERROR",
          message: "Missing dbId, collection, filter, or replacement",
        });
      }
      const data = await this.dbService.withConnection(dbId, (conn, _db, dbType) =>
        this.queryExecutor.replaceDocument(conn, dbType, {
          collection,
          filter,
          replacement,
          options,
        }),
      );
      this.rpc.sendResponse(id, { ok: true, data });
    } catch (e) {
      this.sendMongoError(id, e);
    }
  }

  async handleCreateCollection(params: any, id: number | string) {
    try {
      const { dbId, collection, options } = params || {};
      if (!dbId || !collection) {
        return this.rpc.sendError(id, {
          code: "MONGO_VALIDATION_ERROR",
          message: "Missing dbId or collection",
        });
      }
      const data = await this.dbService.withConnection(dbId, (conn, _db, dbType) =>
        this.queryExecutor.createCollection(conn, dbType, {
          collection,
          options,
        }),
      );
      this.rpc.sendResponse(id, { ok: true, data });
    } catch (e) {
      this.sendMongoError(id, e);
    }
  }

  async handleDropCollection(params: any, id: number | string) {
    try {
      const { dbId, collection } = params || {};
      if (!dbId || !collection) {
        return this.rpc.sendError(id, {
          code: "MONGO_VALIDATION_ERROR",
          message: "Missing dbId or collection",
        });
      }
      const data = await this.dbService.withConnection(dbId, (conn, _db, dbType) =>
        this.queryExecutor.dropCollection(conn, dbType, {
          collection,
        }),
      );
      this.rpc.sendResponse(id, { ok: true, data });
    } catch (e) {
      this.sendMongoError(id, e);
    }
  }

  async handleExecuteMql(params: any, id: number | string) {
    const { dbId, collection, op, options, sessionId } = params || {};
    if (!dbId || !collection || !op) {
      return this.rpc.sendError(id, {
        code: "MONGO_VALIDATION_ERROR",
        message: "Missing dbId, collection, or op",
      });
    }

    const sid = sessionId || uuidv4();
    let lease: { conn: any; db: any; dbType: any; release: () => void } | null = null;
    let driverPromiseRef: Promise<any> | undefined;

    try {
      if (typeof (this.dbService as any).acquireConnection === "function") {
        lease = await this.dbService.acquireConnection(dbId);
      } else {
        const connInfo = await this.dbService.getDatabaseConnection(dbId);
        lease = {
          conn: connInfo.conn,
          dbType: connInfo.dbType,
          db: undefined,
          release: () => {},
        };
      }
    } catch (err: any) {
      return this.sendMongoError(id, err);
    }

    const abortController = new AbortController();
    const {
      signal: settlementSignal,
      markSettled: _markSettled,
      attachPromise,
    } = createDriverSettlementSignal();

    const handle: OperationLifecycleHandle = {
      id: sid,
      dbId,
      state: "running",
      settlementSignal,
    };

    const supervisor = new OperationLifecycleSupervisor(
      handle,
      () => {
        if (lease) {
          lease.release();
          lease = null;
        }
      },
      this.dbService,
      lease.conn,
    );

    let isRpcCompleted = false;

    // Register cancel in SessionManager
    this.sessions.registerCancel(sid, () => {
      abortController.abort();
    });

    const context: MongoExecutionContext = {
      signal: abortController.signal,
      onCursorCreated: (cursor) => {
        handle.cursor = cursor;
      },
      onDriverPromiseCreated: (p) => {
        driverPromiseRef = p;
        attachPromise(p);
      },
    };

    const outerPromise = this.queryExecutor.executeMql(
      lease.conn,
      lease.dbType,
      {
        collection,
        op,
        options,
      },
      context,
    );

    try {
      const data = await outerPromise;
      if (!isRpcCompleted) {
        isRpcCompleted = true;
        this.rpc.sendResponse(id, { ok: true, data });
      }
      supervisor.safeReleaseLease();
      this.sessions?.remove?.(sid);
    } catch (err: any) {
      if (!isRpcCompleted) {
        isRpcCompleted = true;
        if (abortController.signal.aborted) {
          this.rpc.sendError(id, {
            code: "MONGO_OPERATION_CANCELLED",
            message: "Operation was cancelled by user",
          });
        } else if (
          err?.code === "MONGO_OPERATION_TIMEOUT" ||
          String(err?.message).includes("timed out")
        ) {
          this.rpc.sendError(id, {
            code: "MONGO_OPERATION_TIMEOUT",
            message: "Operation timed out",
          });
        } else {
          this.sendMongoError(id, err);
        }
      }

      if (
        abortController.signal.aborted ||
        err?.code === "MONGO_OPERATION_TIMEOUT" ||
        String(err?.message).includes("timed out")
      ) {
        await supervisor.superviseTimeoutOrCancel(driverPromiseRef, outerPromise);
      } else {
        supervisor.safeReleaseLease();
      }
      this.sessions?.remove?.(sid);
    }
  }

  async handleExplainMql(params: any, id: number | string) {
    const { dbId, collection, target, verbosity, options, sessionId } = params || {};
    if (!dbId || !collection || !target) {
      return this.rpc.sendError(id, {
        code: "MONGO_VALIDATION_ERROR",
        message: "Missing dbId, collection, or target",
      });
    }

    const sid = sessionId || uuidv4();
    let lease: { conn: any; db: any; dbType: any; release: () => void } | null = null;
    let driverPromiseRef: Promise<any> | undefined;

    try {
      if (typeof (this.dbService as any).acquireConnection === "function") {
        lease = await this.dbService.acquireConnection(dbId);
      } else {
        const connInfo = await this.dbService.getDatabaseConnection(dbId);
        lease = {
          conn: connInfo.conn,
          dbType: connInfo.dbType,
          db: undefined,
          release: () => {},
        };
      }
    } catch (err: any) {
      return this.sendMongoError(id, err);
    }

    const abortController = new AbortController();
    const {
      signal: settlementSignal,
      markSettled: _markSettled,
      attachPromise,
    } = createDriverSettlementSignal();

    const handle: OperationLifecycleHandle = {
      id: sid,
      dbId,
      state: "running",
      settlementSignal,
    };

    const supervisor = new OperationLifecycleSupervisor(
      handle,
      () => {
        if (lease) {
          lease.release();
          lease = null;
        }
      },
      this.dbService,
      lease.conn,
    );

    let isRpcCompleted = false;

    this.sessions.registerCancel(sid, () => {
      abortController.abort();
    });

    const context: MongoExecutionContext = {
      signal: abortController.signal,
      onCursorCreated: (cursor) => {
        handle.cursor = cursor;
      },
      onDriverPromiseCreated: (p) => {
        driverPromiseRef = p;
        attachPromise(p);
      },
    };

    const outerPromise = this.queryExecutor.explainMql(
      lease.conn,
      lease.dbType,
      { collection, target, verbosity, options },
      context,
    );

    try {
      const data = await outerPromise;
      if (!isRpcCompleted) {
        isRpcCompleted = true;
        this.rpc.sendResponse(id, { ok: true, data });
      }
      supervisor.safeReleaseLease();
      this.sessions?.remove?.(sid);
    } catch (err: any) {
      if (!isRpcCompleted) {
        isRpcCompleted = true;
        if (abortController.signal.aborted) {
          this.rpc.sendError(id, {
            code: "MONGO_OPERATION_CANCELLED",
            message: "Operation was cancelled by user",
          });
        } else if (
          err?.code === "MONGO_OPERATION_TIMEOUT" ||
          String(err?.message).includes("timed out")
        ) {
          this.rpc.sendError(id, {
            code: "MONGO_OPERATION_TIMEOUT",
            message: "Operation timed out",
          });
        } else {
          this.sendMongoError(id, err);
        }
      }

      if (
        abortController.signal.aborted ||
        err?.code === "MONGO_OPERATION_TIMEOUT" ||
        String(err?.message).includes("timed out")
      ) {
        await supervisor.superviseTimeoutOrCancel(driverPromiseRef, outerPromise);
      } else {
        supervisor.safeReleaseLease();
      }
      this.sessions?.remove?.(sid);
    }
  }
}
