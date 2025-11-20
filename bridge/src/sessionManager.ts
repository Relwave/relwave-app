type Session = {
  id: string;
  connectionId?: string;
  cancel?: () => Promise<void> | void;
  createdAt: number;
};

export class SessionManager {
  private sessions = new Map<string, Session>();

  create(sessionId: string, meta?: Partial<Session>) {
    const s: Session = { id: sessionId, createdAt: Date.now(), ...meta } as Session;
    this.sessions.set(sessionId, s);
    return s;
  }
  get(id: string) { return this.sessions.get(id); }
  remove(id: string) { return this.sessions.delete(id); }
  list() { return Array.from(this.sessions.values()); }
  registerCancel(id: string, fn: ()=>Promise<void> | void) {
    const s = this.sessions.get(id);
    if (s) s.cancel = fn;
  }
  async cancel(id: string) {
    const s = this.sessions.get(id);
    if (!s) return false;
    if (s.cancel) {
      await s.cancel();
      return true;
    }
    return false;
  }
}