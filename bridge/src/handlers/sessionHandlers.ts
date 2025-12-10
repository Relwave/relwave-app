
// ----------------------------
// handlers/sessionHandlers.ts
// ----------------------------

import { Rpc } from '../types';
import { SessionManager } from '../sessionManager';
import { randomUUID } from 'node:crypto';

export class SessionHandlers {
  constructor(
    private rpc: Rpc,
    private logger: any,
    private sessions: SessionManager
  ) {}

  /**
   * Handle query.createSession
   * Creates a new query session with optional metadata
   */
  async handleCreateSession(params: any, id: number | string): Promise<void> {
    try {
      const sessionId = randomUUID();
      const meta = params?.meta || {};
      const connectionId = params?.connectionId;

      // Create session with optional metadata
      const session = this.sessions.create(sessionId, {
        connectionId,
        ...meta
      });

      this.logger?.info({ sessionId, connectionId, meta }, 'Session created');

      this.rpc.sendResponse(id, {
        ok: true,
        data: { 
          sessionId,
          createdAt: session.createdAt
        }
      });
    } catch (e: any) {
      this.logger?.error({ e, params }, 'query.createSession failed');
      this.rpc.sendError(id, {
        code: 'INTERNAL_ERROR',
        message: String(e)
      });
    }
  }

  /**
   * Handle query.cancel
   * Cancels an ongoing query session
   */
  async handleCancelSession(params: any, id: number | string): Promise<void> {
    try {
      const { sessionId } = params || {};

      if (!sessionId) {
        this.logger?.warn({ params }, 'query.cancel called without sessionId');
        return this.rpc.sendError(id, {
          code: 'BAD_REQUEST',
          message: 'Missing sessionId'
        });
      }

      const cancelled = await this.sessions.cancel(sessionId);

      this.logger?.info({ sessionId, cancelled }, 'Session cancel requested');

      this.rpc.sendResponse(id, {
        ok: true,
        data: { cancelled }
      });
    } catch (e: any) {
      this.logger?.error({ e, params }, 'query.cancel failed');
      this.rpc.sendError(id, {
        code: 'INTERNAL_ERROR',
        message: String(e)
      });
    }
  }

  /**
   * Handle query.getSession
   * Retrieves information about an active session
   */
  async handleGetSession(params: any, id: number | string): Promise<void> {
    try {
      const { sessionId } = params || {};

      if (!sessionId) {
        return this.rpc.sendError(id, {
          code: 'BAD_REQUEST',
          message: 'Missing sessionId'
        });
      }

      const session = this.sessions.get(sessionId);

      if (!session) {
        return this.rpc.sendError(id, {
          code: 'NOT_FOUND',
          message: 'Session not found'
        });
      }

      // Return session info without the cancel function
      this.rpc.sendResponse(id, {
        ok: true,
        data: {
          sessionId: session.id,
          connectionId: session.connectionId,
          createdAt: session.createdAt,
          hasCancel: !!session.cancel
        }
      });
    } catch (e: any) {
      this.logger?.error({ e, params }, 'query.getSession failed');
      this.rpc.sendError(id, {
        code: 'INTERNAL_ERROR',
        message: String(e)
      });
    }
  }

  /**
   * Handle query.listSessions
   * Lists all active sessions
   */
  async handleListSessions(params: any, id: number | string): Promise<void> {
    try {
      const activeSessions = this.sessions.list();

      this.rpc.sendResponse(id, {
        ok: true,
        data: {
          sessions: activeSessions.map(s => ({
            sessionId: s.id,
            connectionId: s.connectionId,
            createdAt: s.createdAt,
            hasCancel: !!s.cancel
          })),
          count: activeSessions.length
        }
      });
    } catch (e: any) {
      this.logger?.error({ e }, 'query.listSessions failed');
      this.rpc.sendError(id, {
        code: 'INTERNAL_ERROR',
        message: String(e)
      });
    }
  }

  /**
   * Handle query.destroySession
   * Removes a session without cancelling (for cleanup after completion)
   */
  async handleDestroySession(params: any, id: number | string): Promise<void> {
    try {
      const { sessionId } = params || {};

      if (!sessionId) {
        return this.rpc.sendError(id, {
          code: 'BAD_REQUEST',
          message: 'Missing sessionId'
        });
      }

      const removed = this.sessions.remove(sessionId);

      this.logger?.info({ sessionId, removed }, 'Session destroyed');

      this.rpc.sendResponse(id, {
        ok: true,
        data: { removed }
      });
    } catch (e: any) {
      this.logger?.error({ e, params }, 'query.destroySession failed');
      this.rpc.sendError(id, {
        code: 'INTERNAL_ERROR',
        message: String(e)
      });
    }
  }
}