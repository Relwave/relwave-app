// bridge/src/connectors/postgres.ts
import { Client } from 'pg';
import QueryStream from 'pg-query-stream';
import { Readable } from 'stream';

export type PGConfig = {
  host: string;
  port?: number;
  user?: string;
  password?: string;
  database?: string;
  // add ssl?: boolean if needed
};

/** test connection quickly */
export async function testConnection(cfg: PGConfig) {
  const client = new Client(cfg);
  try {
    await client.connect();
    await client.end();
    return { ok: true };
  } catch (err: any) {
    return { ok: false, message: err.message || String(err) };
  }
}

/**
 * Request pg_cancel_backend on target PID using a fresh connection.
 * Returns true if successful (pg_cancel_backend returns boolean).
 */
export async function pgCancel(cfg: PGConfig, targetPid: number) {
  const c = new Client(cfg);
  try {
    await c.connect();
    const res = await c.query('SELECT pg_cancel_backend($1) AS cancelled', [targetPid]);
    await c.end();
    return res.rows?.[0]?.cancelled === true;
  } catch (err) {
    try { await c.end(); } catch (e) {}
    throw err;
  }
}

/**
 * streamQueryCancelable:
 * - uses pg-query-stream to stream results
 * - buffers rows up to batchSize, then calls onBatch(rows, columns)
 * - returns { promise, cancel } where cancel tries pg_cancel_backend(pid) then destroys stream
 */
export function streamQueryCancelable(
  cfg: PGConfig,
  sql: string,
  batchSize: number,
  onBatch: (rows: any[], columns: { name: string }[]) => Promise<void> | void,
  onDone?: () => void
): { promise: Promise<void>; cancel: () => Promise<void> } {
  const client = new Client(cfg);
  let stream: Readable | null = null;
  let finished = false;
  let cancelled = false;
  let backendPid: number | null = null;

  const promise = (async () => {
    await client.connect();

    // capture backend pid (node-postgres exposes processID)
    // @ts-ignore
    backendPid = (client as any).processID ?? null;

    const qs = new QueryStream(sql, [], { batchSize });
    // @ts-ignore - pg typings may not allow QueryStream here directly
    stream = (client.query as any)(qs) as Readable;

    let columns: { name: string }[] | null = null;
    let buffer: any[] = [];

    // helper to flush buffer
    const flush = async () => {
      if (buffer.length === 0) return;
      const rows = buffer.splice(0, buffer.length);
      await onBatch(rows, columns || []);
    };

    try {
      return await new Promise<void>((resolve, reject) => {
        stream!.on('data', (row: any) => {
          // collect columns lazily
          if (columns === null) {
            columns = Object.keys(row).map((k) => ({ name: k }));
          }
          buffer.push(row);
          if (buffer.length >= batchSize) {
            // flush asynchronously, but capture errors
            flush().catch((e) => {
              try { reject(e); } catch {}
            });
          }
        });

        stream!.on('end', async () => {
          try {
            await flush();
            finished = true;
            if (onDone) onDone();
            resolve();
          } catch (e) {
            reject(e);
          }
        });

        stream!.on('error', (err) => {
          reject(err);
        });
      });
    } finally {
      // ensure cleanup
      try {
        if (!finished) {
          // nothing special here
        }
      } finally {
        try { await client.end(); } catch (e) {}
      }
    }
  })();

  // cancel function: try pg_cancel_backend first (if we have pid), then destroy stream and end client
  async function cancel() {
    if (finished || cancelled) return;
    cancelled = true;

    // 1) Attempt server-side cancel if we have the backend PID and cfg present
    if (backendPid && typeof backendPid === 'number') {
      try {
        await pgCancel(cfg, backendPid);
        // After asking the server to cancel, still destroy local stream for immediate stop
      } catch (e) {
        // best-effort, ignore errors from pgCancel
      }
    }

    // 2) Destroy stream locally to stop 'data' events and let promise reject/resolve
    try {
      if (stream && typeof (stream as any).destroy === 'function') {
        (stream as any).destroy(new Error('cancelled'));
      }
    } catch (e) { /* ignore */ }

    // 3) Close client connection
    try { await client.end(); } catch (e) { /* ignore */ }
  }

  return { promise, cancel };
}
