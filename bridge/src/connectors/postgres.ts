import { Client } from 'pg';
import QueryStream from 'pg-query-stream';
import { Readable } from 'stream';

export type PGConfig = {
  host: string;
  port?: number;
  user?: string;
  password?: string;
  database?: string;
  // optionally add ssl, application_name, etc.
};

/** existing testConnection (unchanged) */
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
 * streamQueryCancelable
 * - Returns an object { promise, cancel }.
 * - promise resolves when streaming completes (or rejects on error).
 * - cancel attempts to stop the stream and close the client/connection.
 *
 * onBatch(rows, columns) is called with arrays of rows and a columns descriptor.
 * onDone() is called when stream ends successfully.
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

  const promise = (async () => {
    await client.connect();
    const qs = new QueryStream(sql, [], { batchSize });
    // @ts-ignore - pg typings may not allow QueryStream here directly
    stream = (client.query as any)(qs) as Readable;

    let columns: { name: string }[] | null = null;
    let buffer: any[] = [];

    const flush = async () => {
      if (buffer.length === 0) return;
      const rows = buffer.splice(0, buffer.length);
      await onBatch(rows, columns || []);
    };

    try {
      return await new Promise<void>((resolve, reject) => {
        stream!.on('data', async (row: any) => {
          if (columns === null) {
            columns = Object.keys(row).map((k) => ({ name: k }));
          }
          buffer.push(row);
          if (buffer.length >= batchSize) {
            // flush but don't await to avoid blocking the event loop inside 'data'
            flush().catch((e) => {
              // forward error to reject
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
      // ensure client clean-up
      try {
        if (!finished) {
          // attempt to drain/close
          // nothing special here, just end
        }
      } finally {
        try { await client.end(); } catch (e) {}
      }
    }
  })();

  // cancel function: best-effort
  async function cancel() {
    if (finished || cancelled) return;
    cancelled = true;
    // attempt to destroy the stream if possible
    try {
      if (stream && typeof (stream as any).destroy === 'function') {
        (stream as any).destroy(new Error('cancelled'));
      }
    } catch (e) {
      // ignore
    }
    // additionally try to close client
    try {
      await client.end();
    } catch (e) {
      // ignore
    }
  }

  return { promise, cancel };
}

/**
 * pgCancel: use a new connection to request pg_cancel_backend on target PID.
 * Returns true if cancel command succeeded (note: pg_cancel_backend returns bool).
 */
export async function pgCancel(cfg: PGConfig, targetPid: number) {
  const c = new Client(cfg);
  try {
    await c.connect();
    // pg_cancel_backend returns boolean; use parameterized query
    const res = await c.query('SELECT pg_cancel_backend($1) AS cancelled', [targetPid]);
    await c.end();
    return res.rows?.[0]?.cancelled === true;
  } catch (err) {
    try { await c.end(); } catch (e) {}
    throw err;
  }
}
