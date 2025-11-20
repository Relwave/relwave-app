import { EventEmitter } from 'events';
import logger from './services/logger';

export type RpcRequest = { id?: number | string; method: string; params?: any };
export type RpcResponse = { id?: number | string; result?: any; error?: any };
export type RpcNotification = { method: string; params?: any };

/**
 * JsonStdio
 * - newline-delimited JSON framing
 * - emits 'request' events for incoming requests
 * - emits 'notification' events for incoming notifications (no id)
 * - provides sendResponse, sendError, sendNotification helpers
 *
 * Usage:
 * const rpc = new JsonStdio();
 * rpc.on('request', (req) => { ... });
 * rpc.sendResponse(id, payload);
 * rpc.sendNotification('query.result', { ... });
 */
export class JsonStdio extends EventEmitter {
  private _id = 1;
  private closed = false;

  constructor() {
    super();
    process.stdin.setEncoding('utf8');
    let buffer = '';
    process.stdin.on('data', chunk => {
      buffer += chunk.toString();
      let idx;
      while ((idx = buffer.indexOf('\n')) >= 0) {
        const line = buffer.slice(0, idx).trim();
        buffer = buffer.slice(idx + 1);
        if (!line) continue;
        this._handleLine(line);
      }
    });

    process.stdin.on('end', () => {
      this.closed = true;
      this.emit('end');
    });

    process.stdin.on('error', (err) => {
      logger.error({ err }, 'stdin error');
      this.emit('error', err);
    });
  }

  private _handleLine(line: string) {
    let obj: any = null;
    try {
      obj = JSON.parse(line);
    } catch (err: any) {
      // Handle invalid JSON gracefully: emit a parse error notification
      const parseErr = { code: 'PARSE_ERROR', message: String(err), raw: line };
      // Try to notify consumer in a safe manner
      try {
        this.sendNotification('bridge.parse_error', parseErr);
      } catch (e) {
        // ignore
      }
      logger.warn({ err, raw: line }, 'invalid JSON from stdin');
      return;
    }

    // distinguish requests (have id) vs notifications (no id)
    if (obj && typeof obj === 'object') {
      if (obj.method && obj.id !== undefined) {
        // Request: { id, method, params }
        this.emit('request', obj as RpcRequest);
      } else if (obj.method && obj.id === undefined) {
        // Notification
        this.emit('notification', obj as RpcNotification);
      } else {
        // Unknown shape — treat as request if id present else notification
        if (obj.id !== undefined) this.emit('request', obj as RpcRequest);
        else this.emit('notification', obj as RpcNotification);
      }
    } else {
      logger.warn({ line }, 'received non-object JSON line');
    }
  }

  sendResponse(id: number | string, payload: any) {
    if (this.closed) return;
    const msg = JSON.stringify({ id, result: payload });
    process.stdout.write(msg + '\n');
  }

  sendError(id: number | string, error: { code?: string; message?: string; details?: any }) {
    if (this.closed) return;
    const msg = JSON.stringify({ id, error });
    process.stdout.write(msg + '\n');
  }

  sendNotification(method: string, params?: any) {
    if (this.closed) return;
    const msg = JSON.stringify({ method, params });
    process.stdout.write(msg + '\n');
  }

  newId(): number {
    return this._id++;
  }
}
