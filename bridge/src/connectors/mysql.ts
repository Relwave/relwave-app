import mysql, {
  FieldPacket,
  PoolOptions,
  RowDataPacket,
  PoolConnection,
} from "mysql2/promise";
import { EventEmitter } from "node:events";
import type { Connection as RawConnection } from "mysql2";

export type MySQLConfig = {
  host: string;
  port?: number;
  user?: string;
  password?: string;
  database?: string;
  ssl?: boolean;
  sslmode?: string;
  connectionLimit?: number;
}

// Cache for table lists to avoid repeated slow queries
const tableListCache = new Map<
  string,
  { data: TableInfo[]; timestamp: number }
>();
const CACHE_TTL = 60000; // 1 minute cache

function getCacheKey(cfg: MySQLConfig): string {
  return `${cfg.host}:${cfg.port}:${cfg.database}`;
}

function createPoolConfig(cfg: MySQLConfig): PoolOptions {
  const sslOption: unknown = (cfg as unknown as { ssl?: unknown }).ssl;

  const ssl =
    sslOption && typeof sslOption === "object"
      ? (sslOption as PoolOptions["ssl"])
      : sslOption === true
      ? undefined
      : undefined;

  return {
    host: cfg.host,
    port: cfg.port ?? 3306,
    user: cfg.user,
    password: cfg.password,
    database: cfg.database,
    ssl,
    connectionLimit: cfg.connectionLimit ?? 10,
    connectTimeout: 10000,
    idleTimeout: 30000,
    enableKeepAlive: true,
    keepAliveInitialDelay: 0,
    waitForConnections: true,
    queueLimit: 0,
  };
}

export async function testConnection(
  cfg: MySQLConfig
): Promise<{ ok: boolean; message?: string }> {
  const pool = mysql.createPool(createPoolConfig(cfg));
  let connection: PoolConnection | null = null;

  try {
    connection = await pool.getConnection();
    await connection.ping();
    return { ok: true };
  } catch (error) {
    return { ok: false, message: (error as Error).message };
  } finally {
    if (connection) {
      try {
        connection.release();
      } catch (e) {
        // Ignore
      }
    }
    try {
      await pool.end();
    } catch (e) {
      // Ignore
    }
  }
}

export async function fetchTableData(
  cfg: MySQLConfig,
  schemaName: string,
  tableName: string
): Promise<RowDataPacket[]> {
  const pool = mysql.createPool(createPoolConfig(cfg));
  let connection: PoolConnection | null = null;

  try {
    connection = await pool.getConnection();

    const safeSchema = `\`${schemaName.replace(/`/g, "``")}\``;
    const safeTable = `\`${tableName.replace(/`/g, "``")}\``;
    const query = `SELECT * FROM ${safeSchema}.${safeTable} LIMIT 1000;`;

    const [rows] = await connection.execute<RowDataPacket[]>(query);
    return rows;
  } catch (error) {
    throw new Error(`Failed to fetch data: ${(error as Error).message}`);
  } finally {
    if (connection) {
      try {
        connection.release();
      } catch (e) {
        // Ignore
      }
    }
    try {
      await pool.end();
    } catch (e) {
      // Ignore
    }
  }
}

export async function listColumns(
  cfg: MySQLConfig,
  tableName: string,
  schemaName?: string
): Promise<RowDataPacket[]> {
  const pool = mysql.createPool(createPoolConfig(cfg));
  let connection: PoolConnection | null = null;

  try {
    connection = await pool.getConnection();

    const query = `
      SELECT 
        column_name, 
        data_type 
      FROM 
        information_schema.columns 
      WHERE 
        table_schema = ? AND table_name = ?
      ORDER BY 
        ordinal_position;
    `;
    const [rows] = await connection.execute<RowDataPacket[]>(query, [
      schemaName,
      tableName,
    ]);

    return rows;
  } catch (error) {
    throw new Error(`Failed to list columns: ${(error as Error).message}`);
  } finally {
    if (connection) {
      try {
        connection.release();
      } catch (e) {
        // Ignore
      }
    }
    try {
      await pool.end();
    } catch (e) {
      // Ignore
    }
  }
}

export async function mysqlKillQuery(cfg: MySQLConfig, targetPid: number) {
  const conn = await mysql.createConnection(createPoolConfig(cfg));
  try {
    await conn.execute(`KILL QUERY ?`, [targetPid]);
    return true;
  } catch (error) {
    return false;
  } finally {
    try {
      await conn.end();
    } catch (e) {
      // Ignore
    }
  }
}

export function streamQueryCancelable(
  cfg: MySQLConfig,
  sql: string,
  batchSize: number,
  onBatch: (
    rows: RowDataPacket[],
    columns: FieldPacket[]
  ) => Promise<void> | void,
  onDone?: () => void
): { promise: Promise<void>; cancel: () => Promise<void> } {
  let connection: PoolConnection | null = null;
  let queryStream: EventEmitter | null = null;
  let finished = false;
  let cancelled = false;
  let backendPid: number | null = null;
  const pool = mysql.createPool(createPoolConfig(cfg));

  const promise = (async () => {
    try {
      connection = await pool.getConnection();

      const [rows] = await connection.execute<RowDataPacket[]>(
        "SELECT CONNECTION_ID() AS pid"
      );
      backendPid = (rows[0] as any).pid as number;

      const rawConnection = connection as unknown as RawConnection;
      queryStream = rawConnection.query(sql);

      let columns: FieldPacket[] | null = null;
      let buffer: RowDataPacket[] = [];

      const flush = async () => {
        if (buffer.length === 0) return;
        const rowsToSend = buffer.splice(0, buffer.length);
        await onBatch(rowsToSend, columns || []);
      };

      await new Promise<void>((resolve, reject) => {
        const timeoutId = setTimeout(() => {
          reject(new Error("Query timeout exceeded"));
        }, 300000);

        queryStream!.on("fields", (fields: FieldPacket[]) => {
          columns = fields;
        });

        queryStream!.on("result", async (row: RowDataPacket) => {
          if (cancelled) {
            clearTimeout(timeoutId);
            queryStream!.emit("error", new Error("Query cancelled"));
            return;
          }

          buffer.push(row);
          if (buffer.length >= batchSize) {
            (queryStream as any).pause();

            try {
              await flush();
              (queryStream as any).resume();
            } catch (err) {
              clearTimeout(timeoutId);
              reject(err);
            }
          }
        });

        queryStream!.on("end", async () => {
          clearTimeout(timeoutId);
          try {
            await flush();
            finished = true;
            if (onDone) onDone();
            resolve();
          } catch (e) {
            reject(e);
          }
        });

        queryStream!.on("error", (err) => {
          clearTimeout(timeoutId);
          reject(err);
        });
      });
    } finally {
      if (connection) {
        try {
          connection.release();
        } catch (e) {
          // Ignore
        }
      }

      try {
        await pool.end();
      } catch (e) {
        // Ignore
      }
    }
  })();

  async function cancel() {
    if (finished || cancelled) return;
    cancelled = true;

    if (backendPid && typeof backendPid === "number") {
      try {
        await mysqlKillQuery(cfg, backendPid);
      } catch (e) {
        // Ignore
      }
    }

    if (queryStream) {
      try {
        queryStream.emit("error", new Error("Cancelled"));
      } catch (e) {
        // Ignore
      }
    }
  }

  return { promise, cancel };
}

export interface ColumnDetail {
  name: string;
  type: string;
  not_nullable: boolean;
  default_value: string | null;
  is_primary_key: boolean;
  is_foreign_key: boolean;
}

export interface TableInfo {
  schema: string;
  name: string;
  type: string;
}

export async function getDBStats(cfg: MySQLConfig): Promise<{
  total_tables: number;
  total_db_size_mb: number;
  total_rows: number;
}> {
  const pool = mysql.createPool(createPoolConfig(cfg));
  let connection: PoolConnection | null = null;

  try {
    connection = await pool.getConnection();

    // MODIFIED: Added SUM(table_rows) AS total_rows
    const query = `
      SELECT
        COUNT(*) AS total_tables,
        SUM(table_rows) AS total_rows,  -- <-- NEW: Aggregated row count
        COALESCE(
          ROUND(SUM(data_length + index_length) / (1024 * 1024), 2),
          0
        ) AS total_db_size_mb
      FROM 
        information_schema.tables
      WHERE 
        table_schema = DATABASE() 
        AND table_type = 'BASE TABLE';
    `;

    const [rows] = await connection.execute<RowDataPacket[]>(query);
    // CRITICAL: Update the return type structure
    return rows[0] as {
      total_tables: number;
      total_db_size_mb: number;
      total_rows: number;
    };
  } catch (error) {
    throw new Error(
      `Failed to fetch MySQL database stats: ${(error as Error).message}`
    );
  } finally {
    // ... (finally block remains the same for connection release and pool end)
    if (connection) {
      try {
        connection.release();
      } catch (e) {
        // Ignore
      }
    }
    try {
      await pool.end();
    } catch (e) {
      // Ignore
    }
  }
}

export async function listSchemas(
  cfg: MySQLConfig
): Promise<{ name: string }[]> {
  const pool = mysql.createPool(createPoolConfig(cfg));
  let connection: PoolConnection | null = null;

  try {
    connection = await pool.getConnection();

    const query = `
      SELECT
        schema_name AS name
      FROM
        information_schema.schemata
      WHERE
        schema_name NOT IN ('information_schema', 'mysql', 'performance_schema', 'sys')
      ORDER BY
        schema_name;
    `;

    const [rows] = await connection.execute<RowDataPacket[]>(query);
    return rows as { name: string }[];
  } catch (error) {
    throw new Error(`Failed to list schemas: ${(error as Error).message}`);
  } finally {
    if (connection) {
      try {
        connection.release();
      } catch (e) {
        // Ignore
      }
    }
    try {
      await pool.end();
    } catch (e) {
      // Ignore
    }
  }
}

export async function listTables(
  cfg: MySQLConfig,
  schemaName?: string
): Promise<TableInfo[]> {
  // Check cache first
  const cacheKey = getCacheKey(cfg);
  const cached = tableListCache.get(cacheKey);
  if (cached && Date.now() - cached.timestamp < CACHE_TTL) {
    console.log("[MySQL] Using cached table list");
    return schemaName
      ? cached.data.filter((t) => t.schema === schemaName)
      : cached.data;
  }

  const pool = mysql.createPool(createPoolConfig(cfg));
  let connection: PoolConnection | null = null;

  try {
    connection = await pool.getConnection();

    // CRITICAL OPTIMIZATION: Query only the current database schema
    // This avoids scanning the entire information_schema which can be VERY slow
    let query: string;
    let queryParams: string[] = [];

    if (schemaName) {
      // If specific schema requested, only fetch that
      query = `
        SELECT 
          table_schema AS \`schema\`, 
          table_name AS name, 
          table_type AS type 
        FROM 
          information_schema.tables
        WHERE 
          table_schema = ?
          AND table_type IN ('BASE TABLE', 'VIEW')
        ORDER BY table_name;
      `;
      queryParams = [schemaName];
    } else {
      // Otherwise, only fetch tables from the CURRENT database (not all databases!)
      query = `
        SELECT 
          table_schema AS \`schema\`, 
          table_name AS name, 
          table_type AS type 
        FROM 
          information_schema.tables
        WHERE 
          table_schema = DATABASE()
          AND table_type IN ('BASE TABLE', 'VIEW')
        ORDER BY table_name;
      `;
    }

    console.log(
      `[MySQL] Executing listTables query for schema: ${
        schemaName || "DATABASE()"
      }`
    );
    const startTime = Date.now();

    const [rows] = await connection.execute<RowDataPacket[]>(
      query,
      queryParams
    );

    const elapsed = Date.now() - startTime;
    console.log(
      `[MySQL] listTables completed in ${elapsed}ms, found ${rows.length} tables`
    );

    const result = rows as TableInfo[];

    // Cache the full result (only when not filtering by schema)
    if (!schemaName) {
      tableListCache.set(cacheKey, { data: result, timestamp: Date.now() });
    }

    return result;
  } catch (error) {
    console.error("[MySQL] listTables error:", error);
    throw new Error(`Failed to list tables: ${(error as Error).message}`);
  } finally {
    if (connection) {
      try {
        connection.release();
      } catch (e) {
        // Ignore
      }
    }
    try {
      await pool.end();
    } catch (e) {
      // Ignore
    }
  }
}

// Function to clear cache for a specific database (call after schema changes)
export function clearTableListCache(cfg: MySQLConfig) {
  const cacheKey = getCacheKey(cfg);
  tableListCache.delete(cacheKey);
  console.log(`[MySQL] Cleared table list cache for ${cacheKey}`);
}

export async function getTableDetails(
  cfg: MySQLConfig,
  schemaName: string,
  tableName: string
): Promise<ColumnDetail[]> {
  const pool = mysql.createPool(createPoolConfig(cfg));
  let connection: PoolConnection | null = null;

  try {
    connection = await pool.getConnection();

    const query = `
      SELECT
        c.COLUMN_NAME AS name,
        c.DATA_TYPE AS type,
        (c.IS_NULLABLE = 'NO') AS not_nullable,
        c.COLUMN_DEFAULT AS default_value,
        (c.COLUMN_KEY = 'PRI') AS is_primary_key,
        EXISTS (
          SELECT 1
          FROM information_schema.key_column_usage kcu
          JOIN information_schema.table_constraints tc 
            ON tc.CONSTRAINT_NAME = kcu.CONSTRAINT_NAME
            AND tc.TABLE_SCHEMA = kcu.TABLE_SCHEMA
            AND tc.TABLE_NAME = kcu.TABLE_NAME
          WHERE
            tc.CONSTRAINT_TYPE = 'FOREIGN KEY'
            AND kcu.TABLE_SCHEMA = c.TABLE_SCHEMA
            AND kcu.TABLE_NAME = c.TABLE_NAME
            AND kcu.COLUMN_NAME = c.COLUMN_NAME
        ) AS is_foreign_key
      FROM
        information_schema.columns c
      WHERE
        c.TABLE_SCHEMA = ? AND c.TABLE_NAME = ?
      ORDER BY
        c.ORDINAL_POSITION;
    `;

    const [rows] = await connection.execute<RowDataPacket[]>(query, [
      schemaName,
      tableName,
    ]);

    return rows as ColumnDetail[];
  } catch (error) {
    throw new Error(
      `Failed to fetch table details: ${(error as Error).message}`
    );
  } finally {
    if (connection) {
      try {
        connection.release();
      } catch (e) {
        // Ignore
      }
    }
    try {
      await pool.end();
    } catch (e) {
      // Ignore
    }
  }
}
