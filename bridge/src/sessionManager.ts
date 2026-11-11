import logger from "./services/logger";

export interface Session {
  id: string;
  connectionId?: string;
  cancel?: () => Promise<void> | void;
  isCancelled?: boolean;
  callbackDispatched?: boolean;
  createdAt: number;
}

/** Sessions idle longer than this are treated as stale and swept away */
const DEFAULT_MAX_AGE_MS = 30 * 60 * 1000; // 30 minutes

/** How often the cleanup sweep runs */
const SWEEP_INTERVAL_MS = 5 * 60 * 1000; // 5 minutes

export class SessionManager {
  private sessions = new Map<string, Session>();
  private sweepTimer: ReturnType<typeof setInterval> | null = null;
  private maxAgeMs: number;

  constructor(maxAgeMs = DEFAULT_MAX_AGE_MS) {
    this.maxAgeMs = maxAgeMs;
    this.sweepTimer = setInterval(() => this.sweepStale(), SWEEP_INTERVAL_MS);
    // Don't keep the process alive just for this timer
    if (this.sweepTimer?.unref) this.sweepTimer.unref();
  }

  create(sessionId: string, meta?: Partial<Session>) {
    const s: Session = { id: sessionId, createdAt: Date.now(), ...meta } as Session;
    this.sessions.set(sessionId, s);
    return s;
  }

  get(id: string) {
    return this.sessions.get(id);
  }

  remove(id: string) {
    return this.sessions.delete(id);
  }

  list() {
    return Array.from(this.sessions.values());
  }

  registerCancel(id: string, fn: () => Promise<void> | void) {
    const s = this.sessions.get(id);
    if (!s) return;
    s.cancel = fn;

    // If cancel was called before callback registration, dispatch exactly once
    if (s.isCancelled && !s.callbackDispatched) {
      s.callbackDispatched = true;
      try {
        const res = fn();
        if (res && typeof (res as Promise<void>).catch === "function") {
          (res as Promise<void>).catch(() => {});
        }
      } catch (err) {
        logger.warn({ id, err }, "Error in post-registered cancel callback");
      }
    }
  }

  /**
   * Synchronously triggers cancellation.
   * Dispatches callback at-most-once.
   * Returns false if session is unknown.
   * Returns true if session exists.
   * Repeated calls return true idempotently without duplicate callback dispatch.
   */
  cancel(id: string): boolean {
    const s = this.sessions.get(id);
    if (!s) return false;
    if (s.isCancelled) return true; // Idempotent repeated cancel

    s.isCancelled = true;
    if (s.cancel && !s.callbackDispatched) {
      s.callbackDispatched = true;
      try {
        const res = s.cancel();
        if (res && typeof (res as Promise<void>).catch === "function") {
          (res as Promise<void>).catch(() => {});
        }
      } catch (err) {
        logger.warn({ id, err }, "Error in synchronous cancel callback");
      }
    }
    return true;
  }

  /**
   * Remove sessions that have exceeded maxAgeMs AND have no active cancel
   * function (i.e., they are truly orphaned — their runner was never cleaned up).
   */
  private sweepStale() {
    const now = Date.now();
    for (const [id, session] of this.sessions) {
      if (now - session.createdAt > this.maxAgeMs && !session.cancel) {
        this.sessions.delete(id);
      }
    }
  }

  /** Stop the background sweep timer. Call on bridge shutdown. */
  destroy() {
    if (this.sweepTimer) {
      clearInterval(this.sweepTimer);
      this.sweepTimer = null;
    }
    this.sessions.clear();
  }
}
