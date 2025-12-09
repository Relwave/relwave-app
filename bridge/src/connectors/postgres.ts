// bridge/src/connectors/postgres.ts
import { Client } from "pg";
import QueryStream from "pg-query-stream";
import { Readable } from "stream";

export type PGConfig = {
  host: string;
  port?: number;
  user?: string;
  password?: string;
  database?: string;
  ssl?: boolean;
  sslmode?: string;
};

/**
 * Creates a new Client instance from the config.
 * Encapsulates the configuration mapping logic.
 */
function createClient(cfg: PGConfig): Client {
  return new Client({
    host: cfg.host,
    port: cfg.port,
    user: cfg.user,
    ssl: cfg.ssl || undefined,
    password: cfg.password || undefined,
    database: cfg.database || undefined,
  });
}

/** test connection quickly */
export async function testConnection(cfg: PGConfig) {
  const client = createClient(cfg);
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
  const c = createClient(cfg);
  try {
    await c.connect();
    const res = await c.query("SELECT pg_cancel_backend($1) AS cancelled", [
      targetPid,
    ]);
    await c.end();
    return res.rows?.[0]?.cancelled === true;
  } catch (err) {
    try {
      await c.end();
    } catch (e) {}
    throw err;
  }
}

/**
 * Executes a simple SELECT * query to fetch all data from a single table.
 * @param config - The PostgreSQL connection configuration.
 * @param schemaName - The schema the table belongs to (e.g., 'public').
 * @param tableName - The name of the table to query.
 * @returns A Promise resolving to the query result rows (Array<any>).
 */
export async function fetchTableData(
  config: PGConfig,
  schemaName: string,
  tableName: string
): Promise<any[]> {
  const client = createClient(config);
  try {
    await client.connect();

    // Use quoting for identifiers to prevent SQL injection vulnerabilities from table/schema names.
    const safeSchema = `"${schemaName.replace(/"/g, '""')}"`;
    const safeTable = `"${tableName.replace(/"/g, '""')}"`;

    const query = `SELECT * FROM ${safeSchema}.${safeTable};`;

    const result = await client.query(query);

    return result.rows;
  } catch (error) {
    throw new Error(
      `Failed to fetch data from ${schemaName}.${tableName}: ${error}`
    );
  } finally {
    try {
      await client.end();
    } catch (e) {
      /* ignore client end errors */
    }
  }
}

/**
 * listTables: Retrieves all user-defined tables and views.
 */

export async function listTables(connection: PGConfig, schemaName?: string) {
  const client = createClient(connection);

  let query = `
    SELECT table_schema AS schema, table_name AS name, table_type AS type
    FROM information_schema.tables
    WHERE table_schema NOT IN ('pg_catalog', 'information_schema', 'pg_toast')
      AND table_type = 'BASE TABLE'
  `;
  let queryParams: string[] = [];

  // Add schema filter if provided
  if (schemaName) {
    query += ` AND table_schema = $1`;
    queryParams.push(schemaName);
  }

  query += ` ORDER BY table_schema, table_name;`;

  try {
    await client.connect();

    // Execute the dynamically constructed query
    const res = await client.query(query, queryParams);

    await client.end();
    return res.rows; // [{schema, name, type}, ...]
  } catch (err) {
    try {
      await client.end();
    } catch (e) {}
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
  const client = createClient(cfg);
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
        stream!.on("data", (row: any) => {
          // collect columns lazily
          if (columns === null) {
            columns = Object.keys(row).map((k) => ({ name: k }));
          }
          buffer.push(row);
          if (buffer.length >= batchSize) {
            // flush asynchronously, but capture errors
            flush().catch((e) => {
              try {
                reject(e);
              } catch {}
            });
          }
        });

        stream!.on("end", async () => {
          try {
            await flush();
            finished = true;
            if (onDone) onDone();
            resolve();
          } catch (e) {
            reject(e);
          }
        });

        stream!.on("error", (err) => {
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
        try {
          await client.end();
        } catch (e) {}
      }
    }
  })();

  // cancel function: try pg_cancel_backend first (if we have pid), then destroy stream and end client
  async function cancel() {
    if (finished || cancelled) return;
    cancelled = true;

    // 1) Attempt server-side cancel if we have the backend PID and cfg present
    if (backendPid && typeof backendPid === "number") {
      try {
        await pgCancel(cfg, backendPid);
        // After asking the server to cancel, still destroy local stream for immediate stop
      } catch (e) {
        // best-effort, ignore errors from pgCancel
      }
    }

    // 2) Destroy stream locally to stop 'data' events and let promise reject/resolve
    try {
      if (stream && typeof (stream as any).destroy === "function") {
        (stream as any).destroy(new Error("cancelled"));
      }
    } catch (e) {
      /* ignore */
    }

    // 3) Close client connection
    try {
      await client.end();
    } catch (e) {
      /* ignore */
    }
  }

  return { promise, cancel };
}

export async function getDBStats(connection: PGConfig): Promise<{
  total_tables: number;
  total_db_size_mb: number;
  total_rows: number;
}> {
  const client = createClient(connection);
  try {
    await client.connect();
    const res = await client.query(`
      SELECT
        (SELECT COUNT(*) 
         FROM information_schema.tables
         WHERE table_schema = current_schema() AND table_type = 'BASE TABLE') AS total_tables,
        (SELECT COALESCE(SUM(n_live_tup), 0)
         FROM pg_stat_user_tables 
         WHERE schemaname = current_schema()) AS total_rows, -- <-- NEW: Aggregated row count
        (pg_database_size(current_database()) / (1024.0 * 1024.0)) AS total_db_size_mb;
    `);

    // CRITICAL: Ensure the pg client is closed after a successful query
    await client.end();

    // CRITICAL: Update the return type structure
    return res.rows?.[0] as {
      total_tables: number;
      total_db_size_mb: number;
      total_rows: number;
    };
  } catch (error) {
    // 5. CRITICAL: Handle the error (log it and re-throw it or return null/undefined)
    console.error("Error fetching database stats:", error);
    // Attempt to close the client even if an error occurred during connection/query
    try {
      await client.end();
    } catch (endError) {
      console.error("Error closing client after failure:", endError);
    }
    // Re-throw the error so the calling function knows something went wrong
    throw error;
  }
}
/**
 * Retrieves list of schemas in the database.
 */
export async function listSchemas(connection: PGConfig) {
  const client = createClient(connection);
  try {
    await client.connect();
    const res = await client.query(
      `SELECT nspname AS name
             FROM pg_namespace
             WHERE nspname NOT IN ('pg_catalog', 'information_schema', 'pg_toast')
             AND nspname NOT LIKE 'pg_temp_%' AND nspname NOT LIKE 'pg_toast_temp_%'
             ORDER BY nspname;`
    );
    await client.end();
    return res.rows; // [{ name: 'public' }, { name: 'analytics' }, ...]
  } catch (err) {
    try {
      await client.end();
    } catch (e) {}
    throw err;
  }
}

/** getTableDetails: Retrieves column details for a specific table. */
export async function getTableDetails(
  connection: PGConfig,
  schemaName: string,
  tableName: string
) {
  const client = createClient(connection);
  try {
    await client.connect();
    const res = await client.query(
      `SELECT
                a.attname AS name,
                format_type(a.atttypid, a.atttypmod) AS type,
                a.attnotnull AS not_nullable,
                pg_get_expr(d.adbin, d.adrelid) AS default_value,
                (SELECT TRUE FROM pg_constraint pc WHERE pc.conrelid = a.attrelid AND a.attnum = ANY(pc.conkey) AND pc.contype = 'p') AS is_primary_key,
                (SELECT TRUE FROM pg_constraint fc WHERE fc.conrelid = a.attrelid AND a.attnum = ANY(fc.conkey) AND fc.contype = 'f') AS is_foreign_key
             FROM 
                pg_attribute a
             LEFT JOIN 
                pg_attrdef d ON d.adrelid = a.attrelid AND d.adnum = a.attnum
             WHERE 
                a.attrelid = $1::regclass -- Use $1::regclass for direct comparison against OID/regclass
                AND a.attnum > 0
                AND NOT a.attisdropped
             ORDER BY a.attnum;`,
      [`${schemaName}.${tableName}`]
    );
    await client.end();

    return res.rows;
  } catch (err) {
    // ... (Error handling)
    throw err;
  }
}
