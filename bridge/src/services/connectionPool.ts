// ----------------------------
// services/connectionPool.ts
// ----------------------------
//
// Lightweight connection pool keyed by dbId.
// Reuses the connector config object so each database is connected once
// per bridge lifetime and is reconnected on-demand after idle eviction.

import { DBType } from "../types";

interface PoolEntry {
  conn: unknown;
  dbType: DBType;
  lastUsed: number;
}

/** Idle timeout before a connection is evicted (10 minutes) */
const IDLE_TIMEOUT_MS = 10 * 60 * 1000;

/** How frequently the sweeper checks for idle connections (5 minutes) */
const SWEEP_INTERVAL_MS = 5 * 60 * 1000;

export class ConnectionPool {
  private pool = new Map<string, PoolEntry>();
  private sweepTimer: ReturnType<typeof setInterval> | null = null;

  constructor() {
    this.sweepTimer = setInterval(() => this.sweep(), SWEEP_INTERVAL_MS);
    // Allow the process to exit even if this timer is still running
    if (this.sweepTimer?.unref) this.sweepTimer.unref();
  }

  /**
   * Get a cached connection for the given dbId, or null if not cached.
   * Updates lastUsed on hit.
   */
  get(dbId: string): { conn: unknown; dbType: DBType } | null {
    const entry = this.pool.get(dbId);
    if (!entry) return null;
    entry.lastUsed = Date.now();
    return { conn: entry.conn, dbType: entry.dbType };
  }

  /**
   * Store a connection for the given dbId.
   */
  set(dbId: string, conn: unknown, dbType: DBType): void {
    this.pool.set(dbId, { conn, dbType, lastUsed: Date.now() });
  }

  /**
   * Invalidate (evict) the connection for a specific dbId.
   * Call this after db.delete, db.update (when credentials change), etc.
   */
  invalidate(dbId: string): void {
    this.pool.delete(dbId);
  }

  /**
   * Invalidate all cached connections.
   * Call this on bridge shutdown.
   */
  invalidateAll(): void {
    this.pool.clear();
  }

  /**
   * Remove connections that have been idle longer than IDLE_TIMEOUT_MS.
   */
  private sweep(): void {
    const now = Date.now();
    for (const [id, entry] of this.pool) {
      if (now - entry.lastUsed > IDLE_TIMEOUT_MS) {
        this.pool.delete(id);
      }
    }
  }

  /** Stop the background sweep timer (call on shutdown). */
  destroy(): void {
    if (this.sweepTimer) {
      clearInterval(this.sweepTimer);
      this.sweepTimer = null;
    }
    this.pool.clear();
  }
}

/** Singleton pool instance shared across the bridge process */
export const connectionPool = new ConnectionPool();
