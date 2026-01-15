import mysql, {
  FieldPacket,
  PoolOptions,
  RowDataPacket,
  PoolConnection,
} from "mysql2/promise";
import { loadLocalMigrations, writeBaselineMigration } from "../utils/baselineMigration";
import crypto from "crypto";
import fs from "fs";
import { ensureDir, getMigrationsDir } from "../services/dbStore";
import {
  CacheEntry,
  CACHE_TTL,
  STATS_CACHE_TTL,
  SCHEMA_CACHE_TTL
} from "../types/cache";
import {
  TableInfo,
  DBStats,
  SchemaInfo,
  ColumnDetail,
  PrimaryKeyInfo,
  ForeignKeyInfo,
  IndexInfo,
  UniqueConstraintInfo,
  CheckConstraintInfo,
  AppliedMigration,
} from "../types/common";
import {
  MySQLConfig,
  EnumColumnInfo,
  AutoIncrementInfo,
  SchemaMetadataBatch,
  MySQLAlterTableOperation,
  MySQLDropMode,
} from "../types/mysql";

// Re-export types for backward compatibility
export type {
  MySQLConfig,
  ColumnDetail,
  TableInfo,
  PrimaryKeyInfo,
  ForeignKeyInfo,
  IndexInfo,
  UniqueConstraintInfo,
  CheckConstraintInfo,
  EnumColumnInfo,
  AutoIncrementInfo,
};
export type { AppliedMigration } from "../types/common";

// Import centralized queries
import { LIST_SCHEMAS, LIST_TABLES_BY_SCHEMA, LIST_TABLES_CURRENT_DB } from "../queries/mysql/schema";
import { GET_TABLE_DETAILS, LIST_COLUMNS, KILL_QUERY, GET_CONNECTION_ID } from "../queries/mysql/tables";
import { BATCH_GET_ALL_COLUMNS, BATCH_GET_ENUM_COLUMNS, BATCH_GET_AUTO_INCREMENTS } from "../queries/mysql/columns";
import {
  GET_PRIMARY_KEYS,
  BATCH_GET_PRIMARY_KEYS,
  BATCH_GET_FOREIGN_KEYS,
  BATCH_GET_INDEXES,
  BATCH_GET_UNIQUE_CONSTRAINTS,
  BATCH_GET_CHECK_CONSTRAINTS
} from "../queries/mysql/constraints";
import { GET_DB_STATS } from "../queries/mysql/stats";
import {
  CREATE_MIGRATION_TABLE,
  CHECK_MIGRATIONS_EXIST,
  INSERT_MIGRATION,
  LIST_APPLIED_MIGRATIONS,
  DELETE_MIGRATION
} from "../queries/mysql/migrations";
import { quoteIdentifier } from "../queries/mysql/crud";

// ============================================
// CACHING SYSTEM FOR MYSQL CONNECTOR
// ============================================

/**
 * MySQL Cache Manager - handles all caching for MySQL connector
 */
class MySQLCacheManager {
  // Cache stores for different data types
  private tableListCache = new Map<string, CacheEntry<TableInfo[]>>();
  private columnsCache = new Map<string, CacheEntry<RowDataPacket[]>>();
  private primaryKeysCache = new Map<string, CacheEntry<string[]>>();
  private dbStatsCache = new Map<string, CacheEntry<DBStats>>();
  private schemasCache = new Map<string, CacheEntry<{ name: string }[]>>();
  private tableDetailsCache = new Map<string, CacheEntry<ColumnDetail[]>>();
  private schemaMetadataBatchCache = new Map<string, CacheEntry<SchemaMetadataBatch>>();

  /**
   * Generate cache key from config
   */
  private getConfigKey(cfg: MySQLConfig): string {
    return `${cfg.host}:${cfg.port || 3306}:${cfg.database || ""}`;
  }

  /**
   * Generate cache key for table-specific data
   */
  private getTableKey(cfg: MySQLConfig, schema: string, table: string): string {
    return `${this.getConfigKey(cfg)}:${schema}:${table}`;
  }

  /**
   * Generate cache key for schema-specific data
   */
  private getSchemaKey(cfg: MySQLConfig, schema: string): string {
    return `${this.getConfigKey(cfg)}:${schema}`;
  }

  /**
   * Check if cache entry is valid
   */
  private isValid<T>(entry: CacheEntry<T> | undefined): boolean {
    if (!entry) return false;
    return Date.now() - entry.timestamp < entry.ttl;
  }

  // ============ TABLE LIST CACHE ============
  getTableList(cfg: MySQLConfig, schema?: string): TableInfo[] | null {
    const key = schema ? this.getSchemaKey(cfg, schema) : this.getConfigKey(cfg);
    const entry = this.tableListCache.get(key);
    if (this.isValid(entry)) {
      console.log(`[MySQL Cache] HIT: tableList for ${key}`);
      return entry!.data;
    }
    return null;
  }

  setTableList(cfg: MySQLConfig, data: TableInfo[], schema?: string): void {
    const key = schema ? this.getSchemaKey(cfg, schema) : this.getConfigKey(cfg);
    this.tableListCache.set(key, { data, timestamp: Date.now(), ttl: CACHE_TTL });
    console.log(`[MySQL Cache] SET: tableList for ${key}`);
  }

  // ============ COLUMNS CACHE ============
  getColumns(cfg: MySQLConfig, schema: string, table: string): RowDataPacket[] | null {
    const key = this.getTableKey(cfg, schema, table);
    const entry = this.columnsCache.get(key);
    if (this.isValid(entry)) {
      console.log(`[MySQL Cache] HIT: columns for ${key}`);
      return entry!.data;
    }
    return null;
  }

  setColumns(cfg: MySQLConfig, schema: string, table: string, data: RowDataPacket[]): void {
    const key = this.getTableKey(cfg, schema, table);
    this.columnsCache.set(key, { data, timestamp: Date.now(), ttl: CACHE_TTL });
    console.log(`[MySQL Cache] SET: columns for ${key}`);
  }

  // ============ PRIMARY KEYS CACHE ============
  getPrimaryKeys(cfg: MySQLConfig, schema: string, table: string): string[] | null {
    const key = this.getTableKey(cfg, schema, table);
    const entry = this.primaryKeysCache.get(key);
    if (this.isValid(entry)) {
      console.log(`[MySQL Cache] HIT: primaryKeys for ${key}`);
      return entry!.data;
    }
    return null;
  }

  setPrimaryKeys(cfg: MySQLConfig, schema: string, table: string, data: string[]): void {
    const key = this.getTableKey(cfg, schema, table);
    this.primaryKeysCache.set(key, { data, timestamp: Date.now(), ttl: CACHE_TTL });
    console.log(`[MySQL Cache] SET: primaryKeys for ${key}`);
  }

  // ============ DB STATS CACHE ============
  getDBStats(cfg: MySQLConfig): DBStats | null {
    const key = this.getConfigKey(cfg);
    const entry = this.dbStatsCache.get(key);
    if (this.isValid(entry)) {
      console.log(`[MySQL Cache] HIT: dbStats for ${key}`);
      return entry!.data;
    }
    return null;
  }

  setDBStats(cfg: MySQLConfig, data: DBStats): void {
    const key = this.getConfigKey(cfg);
    this.dbStatsCache.set(key, { data, timestamp: Date.now(), ttl: STATS_CACHE_TTL });
    console.log(`[MySQL Cache] SET: dbStats for ${key}`);
  }

  // ============ SCHEMAS CACHE ============
  getSchemas(cfg: MySQLConfig): { name: string }[] | null {
    const key = this.getConfigKey(cfg);
    const entry = this.schemasCache.get(key);
    if (this.isValid(entry)) {
      console.log(`[MySQL Cache] HIT: schemas for ${key}`);
      return entry!.data;
    }
    return null;
  }

  setSchemas(cfg: MySQLConfig, data: { name: string }[]): void {
    const key = this.getConfigKey(cfg);
    this.schemasCache.set(key, { data, timestamp: Date.now(), ttl: SCHEMA_CACHE_TTL });
    console.log(`[MySQL Cache] SET: schemas for ${key}`);
  }

  // ============ TABLE DETAILS CACHE ============
  getTableDetails(cfg: MySQLConfig, schema: string, table: string): ColumnDetail[] | null {
    const key = this.getTableKey(cfg, schema, table);
    const entry = this.tableDetailsCache.get(key);
    if (this.isValid(entry)) {
      console.log(`[MySQL Cache] HIT: tableDetails for ${key}`);
      return entry!.data;
    }
    return null;
  }

  setTableDetails(cfg: MySQLConfig, schema: string, table: string, data: ColumnDetail[]): void {
    const key = this.getTableKey(cfg, schema, table);
    this.tableDetailsCache.set(key, { data, timestamp: Date.now(), ttl: CACHE_TTL });
    console.log(`[MySQL Cache] SET: tableDetails for ${key}`);
  }

  // ============ SCHEMA METADATA BATCH CACHE ============
  getSchemaMetadataBatch(cfg: MySQLConfig, schema: string): SchemaMetadataBatch | null {
    const key = this.getSchemaKey(cfg, schema);
    const entry = this.schemaMetadataBatchCache.get(key);
    if (this.isValid(entry)) {
      console.log(`[MySQL Cache] HIT: schemaMetadataBatch for ${key}`);
      return entry!.data;
    }
    return null;
  }

  setSchemaMetadataBatch(cfg: MySQLConfig, schema: string, data: SchemaMetadataBatch): void {
    const key = this.getSchemaKey(cfg, schema);
    this.schemaMetadataBatchCache.set(key, { data, timestamp: Date.now(), ttl: CACHE_TTL });
    console.log(`[MySQL Cache] SET: schemaMetadataBatch for ${key}`);
  }

  // ============ CACHE MANAGEMENT ============

  /**
   * Clear all caches for a specific database connection
   */
  clearForConnection(cfg: MySQLConfig): void {
    const configKey = this.getConfigKey(cfg);

    // Clear all entries that start with this config key
    for (const [key] of this.tableListCache) {
      if (key.startsWith(configKey)) this.tableListCache.delete(key);
    }
    for (const [key] of this.columnsCache) {
      if (key.startsWith(configKey)) this.columnsCache.delete(key);
    }
    for (const [key] of this.primaryKeysCache) {
      if (key.startsWith(configKey)) this.primaryKeysCache.delete(key);
    }
    for (const [key] of this.tableDetailsCache) {
      if (key.startsWith(configKey)) this.tableDetailsCache.delete(key);
    }
    for (const [key] of this.schemaMetadataBatchCache) {
      if (key.startsWith(configKey)) this.schemaMetadataBatchCache.delete(key);
    }

    this.dbStatsCache.delete(configKey);
    this.schemasCache.delete(configKey);

    console.log(`[MySQL Cache] Cleared all caches for ${configKey}`);
  }

  /**
   * Clear table-specific cache (useful after DDL operations)
   */
  clearTableCache(cfg: MySQLConfig, schema: string, table: string): void {
    const key = this.getTableKey(cfg, schema, table);
    this.columnsCache.delete(key);
    this.primaryKeysCache.delete(key);
    this.tableDetailsCache.delete(key);
    console.log(`[MySQL Cache] Cleared table cache for ${key}`);
  }

  /**
   * Clear all caches
   */
  clearAll(): void {
    this.tableListCache.clear();
    this.columnsCache.clear();
    this.primaryKeysCache.clear();
    this.dbStatsCache.clear();
    this.schemasCache.clear();
    this.tableDetailsCache.clear();
    this.schemaMetadataBatchCache.clear();
    console.log(`[MySQL Cache] Cleared all caches`);
  }

  /**
   * Get cache statistics
   */
  getStats(): {
    tableLists: number;
    columns: number;
    primaryKeys: number;
    dbStats: number;
    schemas: number;
    tableDetails: number;
    schemaMetadataBatch: number;
  } {
    return {
      tableLists: this.tableListCache.size,
      columns: this.columnsCache.size,
      primaryKeys: this.primaryKeysCache.size,
      dbStats: this.dbStatsCache.size,
      schemas: this.schemasCache.size,
      tableDetails: this.tableDetailsCache.size,
      schemaMetadataBatch: this.schemaMetadataBatchCache.size,
    };
  }
}

// Singleton cache manager instance
export const mysqlCache = new MySQLCacheManager();

// Legacy cache support (for backward compatibility)
const tableListCache = new Map<
  string,
  { data: TableInfo[]; timestamp: number }
>();

function getCacheKey(cfg: MySQLConfig): string {
  return `${cfg.host}:${cfg.port}:${cfg.database}`;
}

export function createPoolConfig(cfg: MySQLConfig): MySQLConfig & PoolOptions {
  return {
    host: cfg.host,
    port: cfg.port ?? 3306,
    user: cfg.user,
    password: cfg.password,
    database: cfg.database,
  };
}

export async function testConnection(
  cfg: MySQLConfig
): Promise<{ ok: boolean; message?: string; status: 'connected' | 'disconnected' }> {
  let connection;
  try {
    connection = await mysql.createConnection(cfg);
    return { ok: true, status: 'connected', message: "Connection successful" };
  } catch (err) {
    return { ok: false, message: (err as Error).message, status: 'disconnected' };
  } finally {
    if (connection) {
      try {
        await connection.end();
      } catch (e) {
        // Ignore
      }
    }
  }
}

export async function fetchTableData(
  cfg: MySQLConfig,
  schemaName: string,
  tableName: string,
  limit: number,
  page: number
): Promise<{ rows: RowDataPacket[]; total: number }> {
  const pool = mysql.createPool(createPoolConfig(cfg));
  let connection: PoolConnection | null = null;

  try {
    connection = await pool.getConnection();

    const safeSchema = `\`${schemaName.replace(/`/g, "``")}\``;
    const safeTable = `\`${tableName.replace(/`/g, "``")}\``;
    const offset = (page - 1) * limit;

    // Get primary keys
    const pkColumns = await listPrimaryKeys(cfg, schemaName, tableName);

    let orderBy = "";
    if (pkColumns.length > 0) {
      const safePks = pkColumns.map(col => `\`${col.replace(/`/g, "``")}\``);
      orderBy = `ORDER BY ${safePks.join(", ")}`;
    } else {
      const colQuery = `
        SELECT COLUMN_NAME
        FROM information_schema.COLUMNS
        WHERE TABLE_SCHEMA = ?
        AND TABLE_NAME = ?
        ORDER BY ORDINAL_POSITION;
      `;
      const [colRows] = await connection.execute<RowDataPacket[]>(colQuery, [
        schemaName,
        tableName,
      ]);
      const safeCols = colRows.map(r => `\`${r.COLUMN_NAME}\``);
      orderBy = safeCols.length ? `ORDER BY ${safeCols.join(", ")}` : "";
    }

    // Count query
    const countQuery = `
      SELECT COUNT(*) AS total
      FROM ${safeSchema}.${safeTable};
    `;
    const [countRows] = await connection.execute<RowDataPacket[]>(countQuery);
    const total = Number(countRows[0].total);

    const dataQuery = `
      SELECT *
      FROM ${safeSchema}.${safeTable}
      ${orderBy}
      LIMIT ${Number(limit)}
      OFFSET ${Number(offset)};
    `;

    const [rows] = await connection.execute<RowDataPacket[]>(dataQuery);

    return { rows, total };
  } catch (error) {
    throw new Error(`Failed to fetch data: ${(error as Error).message}`);
  } finally {
    if (connection) connection.release();
    await pool.end();
  }
}


export async function listColumns(
  cfg: MySQLConfig,
  tableName: string,
  schemaName?: string
): Promise<RowDataPacket[]> {
  // Check cache first
  if (schemaName) {
    const cached = mysqlCache.getColumns(cfg, schemaName, tableName);
    if (cached !== null) {
      return cached;
    }
  }

  const pool = mysql.createPool(createPoolConfig(cfg));
  let connection: PoolConnection | null = null;

  try {
    connection = await pool.getConnection();

    const [rows] = await connection.execute<RowDataPacket[]>(LIST_COLUMNS, [
      schemaName,
      tableName,
    ]);

    // Cache the result
    if (schemaName) {
      mysqlCache.setColumns(cfg, schemaName, tableName, rows);
    }

    return rows;
  } catch (error) {
    throw new Error(`Failed to list columns: ${(error as Error).message}`);
  } finally {
    if (connection) connection.release();
    await pool.end();
  }
}

export async function mysqlKillQuery(cfg: MySQLConfig, targetPid: number) {
  const conn = await mysql.createConnection(createPoolConfig(cfg));
  try {
    await conn.execute(KILL_QUERY, [targetPid]);
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

export async function listPrimaryKeys(
  cfg: MySQLConfig,
  schemaName: string,
  tableName: string
): Promise<string[]> {
  // Check cache first
  const cached = mysqlCache.getPrimaryKeys(cfg, schemaName, tableName);
  if (cached !== null) {
    return cached;
  }

  const connection = await mysql.createConnection(createPoolConfig(cfg));

  try {
    const [rows] = await connection.execute<RowDataPacket[]>(GET_PRIMARY_KEYS, [
      schemaName,
      tableName,
    ]);

    const result = rows.map((row) => row.COLUMN_NAME as string);

    // Cache the result
    mysqlCache.setPrimaryKeys(cfg, schemaName, tableName, result);

    return result;
  } catch (error) {
    throw new Error(`Failed to list primary keys: ${(error as Error).message}`);
  } finally {
    await connection.end();
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
) {
  let query: any = null;
  let finished = false;
  let cancelled = false;
  let backendPid: number | null = null;

  const pool = mysql.createPool(cfg);

  const promise = (async () => {
    let conn: PoolConnection | null = null;

    try {
      conn = await pool.getConnection();

      const [pidRows] = await conn.execute(GET_CONNECTION_ID);
      backendPid = pidRows[0].pid;

      const raw = (conn as any).connection;
      query = raw.query(sql);

      let columns: FieldPacket[] | null = null;
      let buffer: RowDataPacket[] = [];

      const flush = async () => {
        if (buffer.length === 0) return;
        const batch = buffer.splice(0, buffer.length);
        await onBatch(batch, columns || []);
      };

      await new Promise<void>((resolve, reject) => {
        query.on("fields", (flds: FieldPacket[]) => {
          columns = flds;
        });

        query.on("result", async (row: RowDataPacket) => {
          if (cancelled) {
            reject(new Error("Query cancelled"));
            return;
          }

          buffer.push(row);

          if (buffer.length >= batchSize) {
            query.pause();
            await flush();
            query.resume();
          }
        });

        query.on("end", async () => {
          await flush();
          finished = true;
          onDone?.();
          resolve();
        });

        query.on("error", (err: Error) => {
          reject(err);
        });
      });
    } finally {
      conn?.release();
      await pool.end();
    }
  })();

  async function cancel() {
    if (finished || cancelled) return;
    cancelled = true;

    if (backendPid) {
      await mysqlKillQuery(cfg, backendPid).catch(() => { });
    }

    query?.emit("error", new Error("Cancelled"));
  }

  return { promise, cancel };
}

export async function getDBStats(cfg: MySQLConfig): Promise<{
  total_tables: number;
  total_db_size_mb: number;
  total_rows: number;
}> {
  // Check cache first - this is called frequently!
  const cached = mysqlCache.getDBStats(cfg);
  if (cached !== null) {
    return cached;
  }

  const pool = mysql.createPool(createPoolConfig(cfg));
  let connection: PoolConnection | null = null;

  try {
    connection = await pool.getConnection();

    const [rows] = await connection.execute<RowDataPacket[]>(GET_DB_STATS);

    const result = rows[0] as {
      total_tables: number;
      total_db_size_mb: number;
      total_rows: number;
    };

    // Cache the result (shorter TTL since stats change)
    mysqlCache.setDBStats(cfg, result);

    return result;
  } catch (error) {
    throw new Error(
      `Failed to fetch MySQL database stats: ${(error as Error).message}`
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

export async function listSchemas(
  cfg: MySQLConfig
): Promise<{ name: string }[]> {
  // Check cache first
  const cached = mysqlCache.getSchemas(cfg);
  if (cached !== null) {
    return cached;
  }

  const pool = mysql.createPool(createPoolConfig(cfg));
  let connection: PoolConnection | null = null;

  try {
    connection = await pool.getConnection();

    const [rows] = await connection.execute<RowDataPacket[]>(LIST_SCHEMAS);
    const result = rows as { name: string }[];

    // Cache the result (longer TTL since schemas rarely change)
    mysqlCache.setSchemas(cfg, result);

    return result;
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
  // Check new cache manager first
  const cached = mysqlCache.getTableList(cfg, schemaName);
  if (cached !== null) {
    return cached;
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
      query = LIST_TABLES_BY_SCHEMA;
      queryParams = [schemaName];
    } else {
      // Otherwise, only fetch tables from the CURRENT database (not all databases!)
      query = LIST_TABLES_CURRENT_DB;
    }

    console.log(
      `[MySQL] Executing listTables query for schema: ${schemaName || "DATABASE()"
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

    // Cache the result using new cache manager
    mysqlCache.setTableList(cfg, result, schemaName);

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
  mysqlCache.clearForConnection(cfg);
}

export async function getTableDetails(
  cfg: MySQLConfig,
  schemaName: string,
  tableName: string
): Promise<ColumnDetail[]> {
  // Check cache first
  const cached = mysqlCache.getTableDetails(cfg, schemaName, tableName);
  if (cached !== null) {
    return cached;
  }

  const pool = mysql.createPool(createPoolConfig(cfg));
  let connection: PoolConnection | null = null;

  try {
    connection = await pool.getConnection();

    const [rows] = await connection.execute<RowDataPacket[]>(GET_TABLE_DETAILS, [
      schemaName,
      tableName,
    ]);

    const result = rows as ColumnDetail[];

    // Cache the result
    mysqlCache.setTableDetails(cfg, schemaName, tableName, result);

    return result;
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

// ============================================
// BATCH QUERY FUNCTION FOR OPTIMIZED DATA FETCHING
// ============================================

/**
 * Fetch all schema metadata in a single batch using parallel queries.
 * This is much faster than making individual queries per table.
 * 
 * Note: MySQL doesn't have true sequences or standalone enum types like PostgreSQL.
 * - Auto-increment columns are MySQL's equivalent to sequences
 * - Enum columns are defined inline in table definitions
 */
export async function getSchemaMetadataBatch(
  cfg: MySQLConfig,
  schemaName: string
): Promise<SchemaMetadataBatch> {
  // Check cache first
  const cached = mysqlCache.getSchemaMetadataBatch(cfg, schemaName);
  if (cached !== null) {
    return cached;
  }

  const pool = mysql.createPool(createPoolConfig(cfg));
  let connection: PoolConnection | null = null;

  try {
    connection = await pool.getConnection();
    console.log(`[MySQL] Starting batch metadata fetch for schema: ${schemaName}`);
    const startTime = Date.now();

    // Execute all queries in parallel using imported queries
    const [
      columnsResult,
      primaryKeysResult,
      foreignKeysResult,
      indexesResult,
      uniqueResult,
      checksResult,
      enumColumnsResult,
      autoIncrementsResult
    ] = await Promise.all([
      // 1. All columns in schema with PK/FK info
      connection.execute<RowDataPacket[]>(BATCH_GET_ALL_COLUMNS, [schemaName, schemaName]),

      // 2. All primary keys in schema
      connection.execute<RowDataPacket[]>(BATCH_GET_PRIMARY_KEYS, [schemaName]),

      // 3. All foreign keys in schema
      connection.execute<RowDataPacket[]>(BATCH_GET_FOREIGN_KEYS, [schemaName]),

      // 4. All indexes in schema
      connection.execute<RowDataPacket[]>(BATCH_GET_INDEXES, [schemaName]),

      // 5. All unique constraints in schema (exclude primary keys)
      connection.execute<RowDataPacket[]>(BATCH_GET_UNIQUE_CONSTRAINTS, [schemaName]),

      // 6. All check constraints in schema (MySQL 8.0.16+)
      connection.execute<RowDataPacket[]>(BATCH_GET_CHECK_CONSTRAINTS, [schemaName]).catch(() => [[], []]),

      // 7. All enum columns in schema (MySQL defines enums inline)
      connection.execute<RowDataPacket[]>(BATCH_GET_ENUM_COLUMNS, [schemaName]),

      // 8. All auto_increment columns (MySQL's equivalent to sequences)
      connection.execute<RowDataPacket[]>(BATCH_GET_AUTO_INCREMENTS, [schemaName])
    ]);

    const elapsed = Date.now() - startTime;
    console.log(`[MySQL] Batch queries completed in ${elapsed}ms`);

    // Extract rows from results (mysql2 returns [rows, fields])
    const columns = columnsResult[0] as RowDataPacket[];
    const primaryKeys = primaryKeysResult[0] as RowDataPacket[];
    const foreignKeys = foreignKeysResult[0] as RowDataPacket[];
    const indexes = indexesResult[0] as RowDataPacket[];
    const uniqueConstraints = uniqueResult[0] as RowDataPacket[];
    const checkConstraints = (checksResult[0] || []) as RowDataPacket[];
    const enumColumns = enumColumnsResult[0] as RowDataPacket[];
    const autoIncrements = autoIncrementsResult[0] as RowDataPacket[];

    // Group results by table
    const tables = new Map<string, {
      columns: ColumnDetail[];
      primaryKeys: PrimaryKeyInfo[];
      foreignKeys: ForeignKeyInfo[];
      indexes: IndexInfo[];
      uniqueConstraints: UniqueConstraintInfo[];
      checkConstraints: CheckConstraintInfo[];
    }>();

    // Process columns
    for (const row of columns) {
      if (!tables.has(row.table_name)) {
        tables.set(row.table_name, {
          columns: [],
          primaryKeys: [],
          foreignKeys: [],
          indexes: [],
          uniqueConstraints: [],
          checkConstraints: []
        });
      }
      tables.get(row.table_name)!.columns.push({
        name: row.name,
        type: row.type,
        not_nullable: Boolean(row.not_nullable),
        default_value: row.default_value,
        is_primary_key: Boolean(row.is_primary_key),
        is_foreign_key: Boolean(row.is_foreign_key)
      });
    }

    // Process primary keys
    for (const row of primaryKeys) {
      if (tables.has(row.table_name)) {
        tables.get(row.table_name)!.primaryKeys.push({
          column_name: row.column_name
        });
      }
    }

    // Process foreign keys
    for (const row of foreignKeys) {
      if (tables.has(row.source_table)) {
        tables.get(row.source_table)!.foreignKeys.push({
          constraint_name: row.constraint_name,
          source_schema: row.source_schema,
          source_table: row.source_table,
          source_column: row.source_column,
          target_schema: row.target_schema,
          target_table: row.target_table,
          target_column: row.target_column,
          update_rule: row.update_rule,
          delete_rule: row.delete_rule
        });
      }
    }

    // Process indexes
    for (const row of indexes) {
      if (tables.has(row.table_name)) {
        tables.get(row.table_name)!.indexes.push({
          table_name: row.table_name,
          index_name: row.index_name,
          column_name: row.column_name,
          is_unique: Boolean(row.is_unique),
          is_primary: Boolean(row.is_primary),
          index_type: row.index_type,
          seq_in_index: row.seq_in_index
        });
      }
    }

    // Process unique constraints
    for (const row of uniqueConstraints) {
      if (tables.has(row.table_name)) {
        tables.get(row.table_name)!.uniqueConstraints.push({
          constraint_name: row.constraint_name,
          table_schema: row.table_schema,
          table_name: row.table_name,
          column_name: row.column_name,
          ordinal_position: row.ordinal_position
        });
      }
    }

    // Process check constraints
    for (const row of checkConstraints) {
      if (tables.has(row.table_name)) {
        tables.get(row.table_name)!.checkConstraints.push({
          constraint_name: row.constraint_name,
          table_schema: row.table_schema,
          table_name: row.table_name,
          check_clause: row.check_clause
        });
      }
    }

    // Process enum columns - extract values from ENUM('val1','val2',...)
    const processedEnumColumns: EnumColumnInfo[] = enumColumns.map(row => {
      const match = row.column_type.match(/^enum\((.+)\)$/i);
      let enumValues: string[] = [];
      if (match) {
        // Parse enum values: 'val1','val2','val3'
        enumValues = match[1].split(',').map((v: string) => v.trim().replace(/^'|'$/g, ''));
      }
      return {
        table_name: row.table_name,
        column_name: row.column_name,
        enum_values: enumValues
      };
    });

    // Process auto_increment info
    const processedAutoIncrements: AutoIncrementInfo[] = autoIncrements.map(row => ({
      table_name: row.table_name,
      column_name: row.column_name,
      auto_increment_value: row.auto_increment_value
    }));

    const result: SchemaMetadataBatch = {
      tables,
      enumColumns: processedEnumColumns,
      autoIncrements: processedAutoIncrements
    };

    // Cache the result
    mysqlCache.setSchemaMetadataBatch(cfg, schemaName, result);

    console.log(`[MySQL] Batch metadata fetch complete: ${tables.size} tables, ${processedEnumColumns.length} enum columns, ${processedAutoIncrements.length} auto_increments`);

    return result;
  } catch (error) {
    throw new Error(`Failed to fetch schema metadata batch: ${(error as Error).message}`);
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

const TYPE_MAP: Record<string, string> = {
  INT: "INT",
  BIGINT: "BIGINT",
  TEXT: "TEXT",
  BOOLEAN: "BOOLEAN",
  DATETIME: "DATETIME",
  TIMESTAMP: "TIMESTAMP",
  JSON: "JSON",
};

function quoteIdent(name: string) {
  return `\`${name.replace(/`/g, "``")}\``;
}

export async function createTable(
  conn: MySQLConfig,
  schemaName: string,
  tableName: string,
  columns: ColumnDetail[],
  foreignKeys: ForeignKeyInfo[] = []
) {
  const connection = await mysql.createPool(conn).getConnection();

  const primaryKeys = columns
    .filter(c => c.is_primary_key)
    .map(c => quoteIdent(c.name));

  const columnDefs = columns.map(col => {
    if (!TYPE_MAP[col.type]) {
      throw new Error(`Invalid type: ${col.type}`);
    }

    const parts = [
      quoteIdent(col.name),
      TYPE_MAP[col.type],
      col.not_nullable || col.is_primary_key ? "NOT NULL" : "",
      col.default_value ? `DEFAULT ${col.default_value}` : ""
    ].filter(Boolean);

    return parts.join(" ");
  });

  if (primaryKeys.length > 0) {
    columnDefs.push(`PRIMARY KEY (${primaryKeys.join(", ")})`);
  }

  const createTableQuery = `
    CREATE TABLE IF NOT EXISTS ${quoteIdent(tableName)} (
      ${columnDefs.join(",\n")}
    ) ENGINE=InnoDB;
  `;

  try {
    await connection.beginTransaction();

    await connection.query(createTableQuery);

    for (const fk of foreignKeys) {
      const fkQuery = `
    ALTER TABLE ${quoteIdent(fk.source_table)}
    ADD CONSTRAINT ${quoteIdent(fk.constraint_name)}
    FOREIGN KEY (${quoteIdent(fk.source_column)})
    REFERENCES ${quoteIdent(fk.target_table)}
      (${quoteIdent(fk.target_column)})
    ${fk.delete_rule ? `ON DELETE ${fk.delete_rule}` : ""}
    ${fk.update_rule ? `ON UPDATE ${fk.update_rule}` : ""};
  `;
      await connection.query(fkQuery);
    }

    await connection.commit();
    return true;
  } catch (err) {
    await connection.rollback();
    throw err;
  } finally {
    connection.release();
  }
}

function groupMySQLIndexes(indexes: IndexInfo[]) {
  const map = new Map<string, IndexInfo[]>();

  for (const idx of indexes) {
    if (!map.has(idx.index_name)) {
      map.set(idx.index_name, []);
    }
    map.get(idx.index_name)!.push(idx);
  }

  return [...map.values()].map(group =>
    group.sort((a, b) => a.seq_in_index - b.seq_in_index)
  );
}


export async function createIndexes(
  conn: MySQLConfig,
  indexes: IndexInfo[]
): Promise<boolean> {
  const pool = mysql.createPool(conn);
  const groupedIndexes = groupMySQLIndexes(indexes);

  try {
    for (const group of groupedIndexes) {
      const first = group[0];

      // Skip primary key (handled during CREATE TABLE)
      if (first.is_primary) continue;

      const columns = group
        .map(i => quoteIdent(i.column_name))
        .join(", ");

      const query = `
        CREATE ${first.is_unique ? "UNIQUE" : ""} INDEX
        ${quoteIdent(first.index_name)}
        ON ${quoteIdent(first.table_name)}
        (${columns})
        USING ${first.index_type || "BTREE"};
      `;

      try {
        await pool.query(query);
      } catch (err: any) {
        // Ignore duplicate index creation
        if (err.code !== "ER_DUP_KEYNAME") {
          throw err;
        }
      }
    }

    return true;
  } finally {
    await pool.end();
  }
}



export async function alterTable(
  conn: MySQLConfig,
  tableName: string,
  operations: MySQLAlterTableOperation[]
): Promise<boolean> {
  const pool = mysql.createPool(conn);
  const connection = await pool.getConnection();

  try {
    await connection.beginTransaction();

    for (const op of operations) {
      let query = "";

      switch (op.type) {
        case "ADD_COLUMN":
          query = `
            ALTER TABLE ${quoteIdent(tableName)}
            ADD COLUMN ${quoteIdent(op.column.name)}
            ${TYPE_MAP[op.column.type]}
            ${op.column.not_nullable ? "NOT NULL" : ""}
            ${op.column.default_value ? `DEFAULT ${op.column.default_value}` : ""};
          `;
          break;

        case "DROP_COLUMN":
          query = `
            ALTER TABLE ${quoteIdent(tableName)}
            DROP COLUMN ${quoteIdent(op.column_name)};
          `;
          break;

        case "RENAME_COLUMN":
          query = `
            ALTER TABLE ${quoteIdent(tableName)}
            RENAME COLUMN ${quoteIdent(op.from)} TO ${quoteIdent(op.to)};
          `;
          break;

        case "SET_NOT_NULL":
          query = `
            ALTER TABLE ${quoteIdent(tableName)}
            MODIFY ${quoteIdent(op.column_name)} ${TYPE_MAP[op.new_type]} NOT NULL;
          `;
          break;

        case "DROP_NOT_NULL":
          query = `
            ALTER TABLE ${quoteIdent(tableName)}
            MODIFY ${quoteIdent(op.column_name)} ${TYPE_MAP[op.new_type]};
          `;
          break;

        case "SET_DEFAULT":
          query = `
            ALTER TABLE ${quoteIdent(tableName)}
            ALTER ${quoteIdent(op.column_name)}
            SET DEFAULT ${op.default_value};
          `;
          break;

        case "DROP_DEFAULT":
          query = `
            ALTER TABLE ${quoteIdent(tableName)}
            ALTER ${quoteIdent(op.column_name)} DROP DEFAULT;
          `;
          break;

        case "ALTER_TYPE":
          query = `
            ALTER TABLE ${quoteIdent(tableName)}
            MODIFY ${quoteIdent(op.column_name)} ${TYPE_MAP[op.new_type]};
          `;
          break;
      }

      await connection.query(query);
    }

    await connection.commit();
    return true;
  } catch (err) {
    await connection.rollback();
    throw err;
  } finally {
    connection.release();
    await pool.end();
  }
}

export async function dropTable(
  conn: MySQLConfig,
  tableName: string,
  mode: MySQLDropMode = "RESTRICT"
): Promise<boolean> {
  const pool = mysql.createPool(conn);
  const connection = await pool.getConnection();

  try {
    await connection.beginTransaction();

    if (mode !== "CASCADE") {
      const [rows] = await connection.query<any[]>(
        `
        SELECT CONSTRAINT_NAME, TABLE_NAME
        FROM information_schema.KEY_COLUMN_USAGE
        WHERE REFERENCED_TABLE_NAME = ?
          AND REFERENCED_TABLE_SCHEMA = DATABASE();
        `,
        [tableName]
      );

      if (rows.length > 0 && mode === "RESTRICT") {
        throw new Error(
          `Cannot drop table "${tableName}" — referenced by ${rows.length} foreign key(s)`
        );
      }

      if (mode === "DETACH_FKS") {
        for (const fk of rows) {
          await connection.query(`
            ALTER TABLE ${quoteIdent(fk.TABLE_NAME)}
            DROP FOREIGN KEY ${quoteIdent(fk.CONSTRAINT_NAME)};
          `);
        }
      }
    }

    await connection.query(`
      DROP TABLE IF EXISTS ${quoteIdent(tableName)};
    `);

    await connection.commit();
    return true;
  } catch (err) {
    await connection.rollback();
    throw err;
  } finally {
    connection.release();
    await pool.end();
  }
}

export async function ensureMigrationTable(conn: MySQLConfig) {
  const pool = mysql.createPool(conn);
  const connection = await pool.getConnection();

  await connection.query(CREATE_MIGRATION_TABLE);
}


export async function hasAnyMigrations(conn: MySQLConfig): Promise<boolean> {
  const pool = mysql.createPool(conn);
  const connection = await pool.getConnection();

  const [rows] = await connection.query<any[]>(CHECK_MIGRATIONS_EXIST);
  return rows.length > 0;
}


export async function insertBaseline(
  conn: MySQLConfig,
  version: string,
  name: string,
  checksum: string
) {
  const pool = mysql.createPool(conn);
  const connection = await pool.getConnection();

  await connection.query(INSERT_MIGRATION, [version, name, checksum]);
}


export async function baselineIfNeeded(
  conn: MySQLConfig,
  migrationsDir: string
) {
  try {
    await ensureMigrationTable(conn);

    const hasMigrations = await hasAnyMigrations(conn);
    if (hasMigrations) return { baselined: false };

    const version = Date.now().toString();
    const name = "baseline_existing_schema";

    const filePath = writeBaselineMigration(
      migrationsDir,
      version,
      name
    );

    const checksum = crypto
      .createHash("sha256")
      .update(fs.readFileSync(filePath))
      .digest("hex");

    await insertBaseline(conn, version, name, checksum);

    return { baselined: true, version };
  } catch (err) {
    throw err;
  }
}

export async function listAppliedMigrations(
  cfg: MySQLConfig
): Promise<AppliedMigration[]> {
  const pool = mysql.createPool(cfg);
  const connection = await pool.getConnection();

  try {
    // Check if schema_migrations table exists in current database
    const [tables] = await connection.query<any[]>(
      `
      SELECT 1
      FROM information_schema.tables
      WHERE table_schema = DATABASE()
        AND table_name = 'schema_migrations'
      LIMIT 1;
      `
    );

    if (tables.length === 0) {
      return [];
    }

    const [rows] = await connection.query<any[]>(LIST_APPLIED_MIGRATIONS);

    return rows as AppliedMigration[];
  } finally {
    connection.release();
    await pool.end();
  }
}


export async function connectToDatabase(
  cfg: MySQLConfig,
  connectionId: string,
  options?: { readOnly?: boolean }
) {
  let baselineResult = { baselined: false };
  const migrationsDir = getMigrationsDir(connectionId);
  ensureDir(migrationsDir);
  // 1️⃣ Baseline (ONLY if not read-only)
  if (!options?.readOnly) {
    baselineResult = await baselineIfNeeded(cfg, migrationsDir);
  }

  // 2️⃣ Load schema (read-only introspection)
  const schema = await listSchemas(cfg);

  // 3️⃣ Load local migrations from AppData
  const localMigrations = await loadLocalMigrations(migrationsDir);

  // 4️⃣ Load applied migrations from DB
  const appliedMigrations = await listAppliedMigrations(cfg);

  return {
    baselined: baselineResult.baselined,
    schema,
    migrations: {
      local: localMigrations,
      applied: appliedMigrations
    }
  };
}

/**
 * Apply a pending migration
 */
export async function applyMigration(
  cfg: MySQLConfig,
  migrationFilePath: string
): Promise<boolean> {
  const pool = mysql.createPool(cfg);
  const connection = await pool.getConnection();

  try {
    // Read and parse migration file
    const { readMigrationFile } = await import('../utils/migrationFileReader');
    const migration = readMigrationFile(migrationFilePath);

    // Begin transaction
    await connection.beginTransaction();

    // Execute up SQL
    await connection.query(migration.upSQL);

    // Record in schema_migrations
    await connection.query(
      `INSERT INTO schema_migrations (version, name, checksum)
       VALUES (?, ?, ?)`,
      [migration.version, migration.name, migration.checksum]
    );

    // Commit transaction
    await connection.commit();

    // Clear cache
    mysqlCache.clearForConnection(cfg);

    return true;
  } catch (error) {
    await connection.rollback();
    throw error;
  } finally {
    connection.release();
    await pool.end();
  }
}

/**
 * Rollback an applied migration
 */
export async function rollbackMigration(
  cfg: MySQLConfig,
  version: string,
  migrationFilePath: string
): Promise<boolean> {
  const pool = mysql.createPool(cfg);
  const connection = await pool.getConnection();

  try {
    // Read and parse migration file
    const { readMigrationFile } = await import('../utils/migrationFileReader');
    const migration = readMigrationFile(migrationFilePath);

    // Begin transaction
    await connection.beginTransaction();

    // Execute down SQL
    await connection.query(migration.downSQL);

    // Remove from schema_migrations
    await connection.query(DELETE_MIGRATION, [version]);

    // Commit transaction
    await connection.commit();

    // Clear cache
    mysqlCache.clearForConnection(cfg);

    return true;
  } catch (error) {
    await connection.rollback();
    throw error;
  } finally {
    connection.release();
    await pool.end();
  }
}

/**
 * Insert a row into a table
 * @param cfg - MySQL connection config
 * @param schemaName - Schema/database name
 * @param tableName - Table name
 * @param rowData - Object with column names as keys and values to insert
 * @returns The inserted row data with insertId
 */
export async function insertRow(
  cfg: MySQLConfig,
  schemaName: string,
  tableName: string,
  rowData: Record<string, any>
): Promise<any> {
  const pool = mysql.createPool(cfg);
  const connection = await pool.getConnection();

  try {
    const columns = Object.keys(rowData);
    const values = Object.values(rowData);

    if (columns.length === 0) {
      throw new Error("No data provided for insert");
    }

    // Build parameterized query
    const columnList = columns.map(col => quoteIdent(col)).join(", ");
    const placeholders = columns.map(() => "?").join(", ");

    const query = `
      INSERT INTO ${quoteIdent(tableName)} (${columnList})
      VALUES (${placeholders});
    `;

    const [result] = await connection.execute(query, values);

    // Clear cache to refresh table data
    mysqlCache.clearForConnection(cfg);

    return {
      success: true,
      insertId: (result as any).insertId,
      affectedRows: (result as any).affectedRows
    };
  } catch (error) {
    throw new Error(`Failed to insert row into ${schemaName}.${tableName}: ${error}`);
  } finally {
    connection.release();
    await pool.end();
  }
}

/**
 * Update a row in a table
 * @param cfg - MySQL connection config
 * @param schemaName - Schema/database name
 * @param tableName - Table name
 * @param primaryKeyColumn - Primary key column name
 * @param primaryKeyValue - Primary key value to identify the row
 * @param rowData - Object with column names as keys and new values
 * @returns The update result
 */
export async function updateRow(
  cfg: MySQLConfig,
  schemaName: string,
  tableName: string,
  primaryKeyColumn: string,
  primaryKeyValue: any,
  rowData: Record<string, any>
): Promise<any> {
  const pool = mysql.createPool(cfg);
  const connection = await pool.getConnection();

  try {
    const columns = Object.keys(rowData);
    const values = Object.values(rowData);

    if (columns.length === 0) {
      throw new Error("No data provided for update");
    }

    const setClause = columns.map(col => `${quoteIdent(col)} = ?`).join(", ");

    const query = `
      UPDATE ${quoteIdent(tableName)}
      SET ${setClause}
      WHERE ${quoteIdent(primaryKeyColumn)} = ?;
    `;

    const [result] = await connection.execute(query, [...values, primaryKeyValue]);

    // Clear cache to refresh table data
    mysqlCache.clearForConnection(cfg);

    return {
      success: true,
      affectedRows: (result as any).affectedRows
    };
  } catch (error) {
    throw new Error(`Failed to update row in ${schemaName}.${tableName}: ${error}`);
  } finally {
    connection.release();
    await pool.end();
  }
}

/**
 * Delete a row from a table
 * @param cfg - MySQL connection config
 * @param schemaName - Schema/database name
 * @param tableName - Table name
 * @param primaryKeyColumn - Primary key column name (or empty for composite)
 * @param primaryKeyValue - Primary key value or whereConditions object
 * @returns Success status
 */
export async function deleteRow(
  cfg: MySQLConfig,
  schemaName: string,
  tableName: string,
  primaryKeyColumn: string,
  primaryKeyValue: any
): Promise<boolean> {
  const pool = mysql.createPool(cfg);
  const connection = await pool.getConnection();

  try {
    let whereClause: string;
    let whereValues: any[];

    if (primaryKeyColumn && typeof primaryKeyColumn === 'string') {
      // Single primary key
      whereClause = `${quoteIdent(primaryKeyColumn)} = ?`;
      whereValues = [primaryKeyValue];
    } else if (typeof primaryKeyValue === 'object' && primaryKeyValue !== null) {
      // Composite key - use all columns from the object
      const cols = Object.keys(primaryKeyValue);
      whereClause = cols.map(col => `${quoteIdent(col)} = ?`).join(" AND ");
      whereValues = Object.values(primaryKeyValue);
    } else {
      throw new Error("Either primary key or where conditions required for delete");
    }

    const query = `
      DELETE FROM ${quoteIdent(tableName)}
      WHERE ${whereClause};
    `;

    const [result] = await connection.execute(query, whereValues);

    // Clear cache to refresh table data
    mysqlCache.clearForConnection(cfg);

    return (result as any).affectedRows > 0;
  } catch (error) {
    throw new Error(`Failed to delete row from ${schemaName}.${tableName}: ${error}`);
  } finally {
    connection.release();
    await pool.end();
  }
}

/**
 * Search for rows in a table
 * @param cfg - MySQL connection config
 * @param schemaName - Schema/database name
 * @param tableName - Table name
 * @param searchTerm - Term to search for
 * @param column - Optional specific column to search (searches all columns if not specified)
 * @param limit - Max results (default 100)
 * @returns Matching rows
 */
export async function searchTable(
  cfg: MySQLConfig,
  schemaName: string,
  tableName: string,
  searchTerm: string,
  column?: string,
  page: number = 1,
  pageSize: number = 50
): Promise<{ rows: any[]; total: number }> {
  const pool = mysql.createPool(cfg);
  const connection = await pool.getConnection();

  try {
    const searchPattern = `%${searchTerm.replace(/[%_]/g, '\\$&')}%`;

    let whereClause: string;
    let values: any[];

    if (column) {
      // Search specific column
      whereClause = `${quoteIdent(column)} LIKE ?`;
      values = [searchPattern];
    } else {
      // Get all columns and search across them
      const [colRows] = await connection.query(
        `SELECT COLUMN_NAME FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_SCHEMA = ? AND TABLE_NAME = ?`,
        [schemaName, tableName]
      );
      const columns = (colRows as any[]).map(r => r.COLUMN_NAME);

      if (columns.length === 0) {
        return { rows: [], total: 0 };
      }

      // Build OR clause for all columns
      whereClause = columns
        .map(col => `${quoteIdent(col)} LIKE ?`)
        .join(" OR ");
      values = Array(columns.length).fill(searchPattern);
    }

    // Count total matches
    const [countRows] = await connection.query(
      `SELECT COUNT(*) as total FROM ${quoteIdent(tableName)} WHERE ${whereClause}`,
      values
    );
    const total = (countRows as any[])[0]?.total || 0;

    // Get matching rows with pagination
    const offset = (page - 1) * pageSize;
    const [rows] = await connection.query(
      `SELECT * FROM ${quoteIdent(tableName)} WHERE ${whereClause} LIMIT ? OFFSET ?`,
      [...values, pageSize, offset]
    );

    return { rows: rows as any[], total };
  } catch (error) {
    throw new Error(`Failed to search table ${schemaName}.${tableName}: ${error}`);
  } finally {
    connection.release();
    await pool.end();
  }
}
