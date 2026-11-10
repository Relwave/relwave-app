// ----------------------------
// services/connectionPool.ts
// ----------------------------
//
// Lightweight connection pool keyed by dbId with independent per-caller lease tracking.

import { DBType } from "../types";
import { TunnelInfo } from "./sshTunnelService";
import logger from "./logger";
import { getClientKey, closeMongoClientByKey, safeMongoError } from "../connectors/mongo";

export interface PoolEntry {
  conn: any;
  dbType: DBType;
  lastUsed: number;
  tunnel?: TunnelInfo;
  activeOperations: number;
  disposed: boolean;
}

export interface ConnectionLease {
  connection: PoolEntry;
  release: () => void;
}

const IDLE_TIMEOUT_MS = 10 * 60 * 1000;
const SWEEP_INTERVAL_MS = 5 * 60 * 1000;

export class ConnectionPool {
  private pool = new Map<string, PoolEntry>();
  private pendingDisposal = new Set<PoolEntry>();
  private buildingClientKeys = new Map<string, number>();
  private inProgressCleanups = new Set<Promise<void>>();
  private isShuttingDown = false;
  private _isForcedTeardownInitiated = false;
  private sweepTimer: ReturnType<typeof setInterval> | null = null;

  constructor() {
    this.sweepTimer = setInterval(() => this.sweep(), SWEEP_INTERVAL_MS);
    if (this.sweepTimer?.unref) this.sweepTimer.unref();
  }

  get isForcedTeardownInitiated(): boolean {
    return this._isForcedTeardownInitiated;
  }

  setForcedTeardownInitiated(val: boolean): void {
    this._isForcedTeardownInitiated = val;
  }

  setShuttingDown(val: boolean): void {
    this.isShuttingDown = val;
  }

  registerBuildingClient(clientKey: string): void {
    const current = this.buildingClientKeys.get(clientKey) || 0;
    this.buildingClientKeys.set(clientKey, current + 1);
  }

  unregisterBuildingClient(clientKey: string): void {
    const current = (this.buildingClientKeys.get(clientKey) || 0) - 1;
    if (current <= 0) {
      this.buildingClientKeys.delete(clientKey);
    } else {
      this.buildingClientKeys.set(clientKey, current);
    }
  }

  getBuildingClientCount(clientKey: string): number {
    return this.buildingClientKeys.get(clientKey) || 0;
  }

  getAllEntries(): PoolEntry[] {
    const set = new Set<PoolEntry>();
    for (const e of this.pool.values()) set.add(e);
    for (const e of this.pendingDisposal) set.add(e);
    return Array.from(set);
  }

  getInProgressCleanups(): Set<Promise<void>> {
    return this.inProgressCleanups;
  }

  getActiveOperationsCount(): number {
    let count = 0;
    for (const entry of this.pool.values()) count += entry.activeOperations;
    for (const entry of this.pendingDisposal) count += entry.activeOperations;
    return count;
  }

  acquire(dbId: string): ConnectionLease | null {
    if (this.isShuttingDown) return null;
    const entry = this.pool.get(dbId);
    if (!entry || entry.disposed) return null;

    entry.activeOperations++;
    entry.lastUsed = Date.now();

    let released = false;
    const release = () => {
      if (released) return;
      released = true;
      this.release(dbId, entry);
    };

    return { connection: entry, release };
  }

  release(dbId: string, entry: PoolEntry): void {
    entry.activeOperations = Math.max(0, entry.activeOperations - 1);
    if ((entry.disposed || this.pendingDisposal.has(entry)) && entry.activeOperations === 0) {
      this.pendingDisposal.delete(entry);
      this.triggerDeferredCleanup(entry);
    }
  }

  private triggerDeferredCleanup(entry: PoolEntry): void {
    if (this._isForcedTeardownInitiated) return;

    let cleanupPromise: Promise<void>;
    cleanupPromise = (async () => {
      try {
        if (this._isForcedTeardownInitiated) return;
        if (entry.tunnel) {
          try {
            entry.tunnel.close();
          } catch {}
        }
        if (entry.dbType === DBType.MONGODB && entry.conn) {
          await this.safeCloseMongoClient(entry.conn);
        }
      } catch (err: any) {
        logger.warn(
          { err: safeMongoError(err) },
          "Deferred cleanup error in ConnectionPool",
        );
      } finally {
        this.inProgressCleanups.delete(cleanupPromise);
      }
    })();

    this.inProgressCleanups.add(cleanupPromise);
  }

  async safeCloseMongoClient(cfg: any): Promise<void> {
    if (this._isForcedTeardownInitiated) return;
    const clientKey = getClientKey(cfg);

    const inPool = Array.from(this.pool.values()).some(
      (e) => !e.disposed && e.dbType === DBType.MONGODB && e.conn && getClientKey(e.conn) === clientKey,
    );
    const inPending = Array.from(this.pendingDisposal).some(
      (e) => e.activeOperations > 0 && e.dbType === DBType.MONGODB && e.conn && getClientKey(e.conn) === clientKey,
    );
    const buildingCount = this.buildingClientKeys.get(clientKey) || 0;

    if (inPool || inPending || buildingCount > 0) {
      return;
    }

    await closeMongoClientByKey(clientKey, { force: true });
  }

  set(dbId: string, conn: unknown, dbType: DBType, tunnel?: TunnelInfo): void {
    if (this.isShuttingDown) {
      throw new Error("Bridge is shutting down: connection publication rejected");
    }
    const existing = this.pool.get(dbId);
    if (existing) {
      existing.disposed = true;
      if (existing.activeOperations > 0) {
        this.pendingDisposal.add(existing);
      } else {
        this.triggerDeferredCleanup(existing);
      }
    }
    this.pool.set(dbId, {
      conn,
      dbType,
      lastUsed: Date.now(),
      tunnel,
      activeOperations: 0,
      disposed: false,
    });
  }

  get(dbId: string): { conn: unknown; dbType: DBType } | null {
    const entry = this.pool.get(dbId);
    if (!entry || entry.disposed) return null;
    entry.lastUsed = Date.now();
    return { conn: entry.conn, dbType: entry.dbType };
  }

  async invalidate(dbId: string): Promise<void> {
    const entry = this.pool.get(dbId);
    if (!entry) return;

    this.pool.delete(dbId);
    entry.disposed = true;

    if (entry.activeOperations > 0) {
      this.pendingDisposal.add(entry);
    } else {
      this.triggerDeferredCleanup(entry);
    }
  }

  private sweep(): void {
    const now = Date.now();
    for (const [id, entry] of Array.from(this.pool.entries())) {
      if (entry.activeOperations === 0 && now - entry.lastUsed > IDLE_TIMEOUT_MS) {
        this.pool.delete(id);
        entry.disposed = true;
        this.triggerDeferredCleanup(entry);
      }
    }
  }

  clear(): void {
    this.pool.clear();
    this.pendingDisposal.clear();
    this.buildingClientKeys.clear();
  }

  destroy(): void {
    if (this.sweepTimer) {
      clearInterval(this.sweepTimer);
      this.sweepTimer = null;
    }
    for (const entry of this.getAllEntries()) {
      if (entry.tunnel) {
        try {
          entry.tunnel.close();
        } catch {}
      }
    }
    this.clear();
  }
}

export const connectionPool = new ConnectionPool();
