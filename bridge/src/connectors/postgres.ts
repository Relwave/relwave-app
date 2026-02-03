// bridge/src/connectors/postgres.ts
import { Client } from "pg";
import QueryStream from "pg-query-stream";
import { Readable } from "stream";
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
  PGConfig,
  EnumInfo,
  SequenceInfo,
  PGSchemaMetadataBatch,
  PGAlterTableOperation,
  PGDropMode,
} from "../types/postgres";

export type {
  PGConfig,
  ColumnDetail,
  TableInfo,
  PrimaryKeyInfo,
  ForeignKeyInfo,
  IndexInfo,
  UniqueConstraintInfo,
  CheckConstraintInfo,
  EnumInfo,
  SequenceInfo,
  AppliedMigration,
};
import { PG_LIST_SCHEMAS, PG_LIST_TABLES, PG_LIST_TABLES_BY_SCHEMA, PG_LIST_ENUMS, PG_LIST_SEQUENCES } from "../queries/postgres/schema";
import { PG_GET_TABLE_DETAILS, PG_BATCH_GET_ALL_COLUMNS, PG_CANCEL_QUERY } from "../queries/postgres/tables";
import {
  PG_GET_PRIMARY_KEYS,
  PG_BATCH_GET_PRIMARY_KEYS,
  PG_GET_FOREIGN_KEYS,
  PG_BATCH_GET_FOREIGN_KEYS,
  PG_GET_INDEXES,
  PG_BATCH_GET_INDEXES,
  PG_GET_UNIQUE_CONSTRAINTS,
  PG_BATCH_GET_UNIQUE_CONSTRAINTS,
  PG_GET_CHECK_CONSTRAINTS,
  PG_BATCH_GET_CHECK_CONSTRAINTS
} from "../queries/postgres/constraints";
import { PG_GET_DB_STATS } from "../queries/postgres/stats";
import {
  PG_CREATE_MIGRATION_TABLE,
  PG_CHECK_MIGRATIONS_EXIST,
  PG_INSERT_MIGRATION,
  PG_LIST_APPLIED_MIGRATIONS,
  PG_DELETE_MIGRATION
} from "../queries/postgres/migrations";
import { pgQuoteIdentifier } from "../queries/postgres/crud";

// ============================================
// CACHING SYSTEM FOR POSTGRES CONNECTOR
// ============================================

/**
 * PostgreSQL Cache Manager - handles all caching for Postgres connector
 */
export class PostgresCacheManager {

  // Cache stores for different data types
  private tableListCache = new Map<string, CacheEntry<TableInfo[]>>();
  private primaryKeysCache = new Map<string, CacheEntry<PrimaryKeyInfo[]>>();
  private dbStatsCache = new Map<string, CacheEntry<DBStats>>();
  private schemasCache = new Map<string, CacheEntry<SchemaInfo[]>>();
  private tableDetailsCache = new Map<string, CacheEntry<ColumnDetail[]>>();
  private foreignKeysCache = new Map<string, CacheEntry<ForeignKeyInfo[]>>();
  private indexesCache = new Map<string, CacheEntry<IndexInfo[]>>();
  private uniqueCache = new Map<string, CacheEntry<UniqueConstraintInfo[]>>();
  private checksCache = new Map<string, CacheEntry<CheckConstraintInfo[]>>();
  private enumsCache = new Map<string, CacheEntry<EnumInfo[]>>();
  private sequencesCache = new Map<string, CacheEntry<SequenceInfo[]>>();

  /**
   * Generate cache key from config
   */
  private getConfigKey(cfg: PGConfig): string {
    return `${cfg.host}:${cfg.port || 5432}:${cfg.database || ""}`;
  }

  /**
   * Generate cache key for table-specific data
   */
  private getTableKey(cfg: PGConfig, schema: string, table: string): string {
    return `${this.getConfigKey(cfg)}:${schema}:${table}`;
  }

  /**
   * Generate cache key for schema-specific data
   */
  private getSchemaKey(cfg: PGConfig, schema: string): string {
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
  getTableList(cfg: PGConfig, schema?: string): TableInfo[] | null {
    const key = schema ? this.getSchemaKey(cfg, schema) : this.getConfigKey(cfg);
    const entry = this.tableListCache.get(key);
    if (this.isValid(entry)) {
      return entry!.data;
    }
    return null;
  }

  setTableList(cfg: PGConfig, data: TableInfo[], schema?: string): void {
    const key = schema ? this.getSchemaKey(cfg, schema) : this.getConfigKey(cfg);
    this.tableListCache.set(key, { data, timestamp: Date.now(), ttl: CACHE_TTL });
  }

  // ============ PRIMARY KEYS CACHE ============
  getPrimaryKeys(cfg: PGConfig, schema: string, table: string): PrimaryKeyInfo[] | null {
    const key = this.getTableKey(cfg, schema, table);
    const entry = this.primaryKeysCache.get(key);
    if (this.isValid(entry)) {
      return entry!.data;
    }
    return null;
  }

  setPrimaryKeys(cfg: PGConfig, schema: string, table: string, data: PrimaryKeyInfo[]): void {
    const key = this.getTableKey(cfg, schema, table);
    this.primaryKeysCache.set(key, { data, timestamp: Date.now(), ttl: CACHE_TTL });
  }

  // ============ DB STATS CACHE ============
  getDBStats(cfg: PGConfig): DBStats | null {
    const key = this.getConfigKey(cfg);
    const entry = this.dbStatsCache.get(key);
    if (this.isValid(entry)) {
      return entry!.data;
    }
    return null;
  }

  setDBStats(cfg: PGConfig, data: DBStats): void {
    const key = this.getConfigKey(cfg);
    this.dbStatsCache.set(key, { data, timestamp: Date.now(), ttl: STATS_CACHE_TTL });
  }

  // ============ SCHEMAS CACHE ============
  getSchemas(cfg: PGConfig): SchemaInfo[] | null {
    const key = this.getConfigKey(cfg);
    const entry = this.schemasCache.get(key);
    if (this.isValid(entry)) {
      return entry!.data;
    }
    return null;
  }

  setSchemas(cfg: PGConfig, data: SchemaInfo[]): void {
    const key = this.getConfigKey(cfg);
    this.schemasCache.set(key, { data, timestamp: Date.now(), ttl: SCHEMA_CACHE_TTL });
  }

  // ============ TABLE DETAILS CACHE ============
  getTableDetails(cfg: PGConfig, schema: string, table: string): ColumnDetail[] | null {
    const key = this.getTableKey(cfg, schema, table);
    const entry = this.tableDetailsCache.get(key);
    if (this.isValid(entry)) {
      return entry!.data;
    }
    return null;
  }

  setTableDetails(cfg: PGConfig, schema: string, table: string, data: ColumnDetail[]): void {
    const key = this.getTableKey(cfg, schema, table);
    this.tableDetailsCache.set(key, { data, timestamp: Date.now(), ttl: CACHE_TTL });
  }

  // ============ FOREIGN KEYS CACHE ============
  getForeignKeys(cfg: PGConfig, schema: string, table: string): ForeignKeyInfo[] | null {
    const key = this.getTableKey(cfg, schema, table);
    const entry = this.foreignKeysCache.get(key);
    if (this.isValid(entry)) {
      return entry!.data;
    }
    return null;
  }

  setForeignKeys(cfg: PGConfig, schema: string, table: string, data: ForeignKeyInfo[]): void {
    const key = this.getTableKey(cfg, schema, table);
    this.foreignKeysCache.set(key, { data, timestamp: Date.now(), ttl: CACHE_TTL });
  }

  // ============ INDEXES CACHE ============
  getIndexes(cfg: PGConfig, schema: string, table: string): IndexInfo[] | null {
    const key = this.getTableKey(cfg, schema, table);
    const entry = this.indexesCache.get(key);
    if (this.isValid(entry)) {
      return entry!.data;
    }
    return null;
  }

  setIndexes(cfg: PGConfig, schema: string, table: string, data: IndexInfo[]): void {
    const key = this.getTableKey(cfg, schema, table);
    this.indexesCache.set(key, { data, timestamp: Date.now(), ttl: CACHE_TTL });
  }

  // ============ UNIQUE CONSTRAINTS CACHE ============
  getUnique(cfg: PGConfig, schema: string, table: string): UniqueConstraintInfo[] | null {
    const key = this.getTableKey(cfg, schema, table);
    const entry = this.uniqueCache.get(key);
    if (this.isValid(entry)) {
      return entry!.data;
    }
    return null;
  }

  setUnique(cfg: PGConfig, schema: string, table: string, data: UniqueConstraintInfo[]): void {
    const key = this.getTableKey(cfg, schema, table);
    this.uniqueCache.set(key, { data, timestamp: Date.now(), ttl: CACHE_TTL });
  }

  // ============ CHECK CONSTRAINTS CACHE ============
  getChecks(cfg: PGConfig, schema: string, table: string): CheckConstraintInfo[] | null {
    const key = this.getTableKey(cfg, schema, table);
    const entry = this.checksCache.get(key);
    if (this.isValid(entry)) {
      return entry!.data;
    }
    return null;
  }

  setChecks(cfg: PGConfig, schema: string, table: string, data: CheckConstraintInfo[]): void {
    const key = this.getTableKey(cfg, schema, table);
    this.checksCache.set(key, { data, timestamp: Date.now(), ttl: CACHE_TTL });
  }

  // ============ ENUMS CACHE ============
  getEnums(cfg: PGConfig, schema: string): EnumInfo[] | null {
    const key = this.getSchemaKey(cfg, schema);
    const entry = this.enumsCache.get(key);
    if (this.isValid(entry)) {
      return entry!.data;
    }
    return null;
  }

  setEnums(cfg: PGConfig, schema: string, data: EnumInfo[]): void {
    const key = this.getSchemaKey(cfg, schema);
    this.enumsCache.set(key, { data, timestamp: Date.now(), ttl: CACHE_TTL });
  }

  // ============ SEQUENCES CACHE ============
  getSequences(cfg: PGConfig, schema: string): SequenceInfo[] | null {
    const key = this.getSchemaKey(cfg, schema);
    const entry = this.sequencesCache.get(key);
    if (this.isValid(entry)) {
      return entry!.data;
    }
    return null;
  }

  setSequences(cfg: PGConfig, schema: string, data: SequenceInfo[]): void {
    const key = this.getSchemaKey(cfg, schema);
    this.sequencesCache.set(key, { data, timestamp: Date.now(), ttl: CACHE_TTL });
  }

  // ============ CACHE MANAGEMENT ============

  /**
   * Clear all caches for a specific database connection
   */
  clearForConnection(cfg: PGConfig): void {
    const configKey = this.getConfigKey(cfg);

    // Clear all entries that start with this config key
    for (const [key] of this.tableListCache) {
      if (key.startsWith(configKey)) this.tableListCache.delete(key);
    }
    for (const [key] of this.primaryKeysCache) {
      if (key.startsWith(configKey)) this.primaryKeysCache.delete(key);
    }
    for (const [key] of this.tableDetailsCache) {
      if (key.startsWith(configKey)) this.tableDetailsCache.delete(key);
    }
    for (const [key] of this.foreignKeysCache) {
      if (key.startsWith(configKey)) this.foreignKeysCache.delete(key);
    }
    for (const [key] of this.indexesCache) {
      if (key.startsWith(configKey)) this.indexesCache.delete(key);
    }
    for (const [key] of this.uniqueCache) {
      if (key.startsWith(configKey)) this.uniqueCache.delete(key);
    }
    for (const [key] of this.checksCache) {
      if (key.startsWith(configKey)) this.checksCache.delete(key);
    }
    for (const [key] of this.enumsCache) {
      if (key.startsWith(configKey)) this.enumsCache.delete(key);
    }
    for (const [key] of this.sequencesCache) {
      if (key.startsWith(configKey)) this.sequencesCache.delete(key);
    }

    this.dbStatsCache.delete(configKey);
    this.schemasCache.delete(configKey);
  }

  /**
   * Clear table-specific cache (useful after DDL operations)
   */
  clearTableCache(cfg: PGConfig, schema: string, table: string): void {
    const key = this.getTableKey(cfg, schema, table);
    this.primaryKeysCache.delete(key);
    this.tableDetailsCache.delete(key);
    this.foreignKeysCache.delete(key);
    this.indexesCache.delete(key);
    this.uniqueCache.delete(key);
    this.checksCache.delete(key);
  }

  /**
   * Clear all caches
   */
  clearAll(): void {
    this.tableListCache.clear();
    this.primaryKeysCache.clear();
    this.dbStatsCache.clear();
    this.schemasCache.clear();
    this.tableDetailsCache.clear();
    this.foreignKeysCache.clear();
    this.indexesCache.clear();
    this.uniqueCache.clear();
    this.checksCache.clear();
    this.enumsCache.clear();
    this.sequencesCache.clear();
  }

  /**
   * Get cache statistics
   */
  getStats(): {
    tableLists: number;
    primaryKeys: number;
    dbStats: number;
    schemas: number;
    tableDetails: number;
    foreignKeys: number;
    indexes: number;
    unique: number;
    checks: number;
    enums: number;
    sequences: number;
  } {
    return {
      tableLists: this.tableListCache.size,
      primaryKeys: this.primaryKeysCache.size,
      dbStats: this.dbStatsCache.size,
      schemas: this.schemasCache.size,
      tableDetails: this.tableDetailsCache.size,
      foreignKeys: this.foreignKeysCache.size,
      indexes: this.indexesCache.size,
      unique: this.uniqueCache.size,
      checks: this.checksCache.size,
      enums: this.enumsCache.size,
      sequences: this.sequencesCache.size,
    };
  }
}

// Singleton cache manager instance
export const postgresCache = new PostgresCacheManager();

/**
 * Creates a new Client instance from the config.
 * Encapsulates the configuration mapping logic.
 */
function createClient(cfg: PGConfig): Client {
  // Build SSL configuration
  let sslConfig: boolean | { rejectUnauthorized: boolean } | undefined;

  if (cfg.ssl) {
    // For cloud databases (Supabase, Railway, etc.), we need to allow self-signed certs
    // sslmode=require or sslmode=prefer should use rejectUnauthorized: false
    sslConfig = {
      rejectUnauthorized: cfg.sslmode === 'verify-full' || cfg.sslmode === 'verify-ca'
    };
  }

  return new Client({
    host: cfg.host,
    port: cfg.port,
    user: cfg.user,
    ssl: sslConfig,
    password: cfg.password || undefined,
    database: cfg.database || undefined,
  });
}

/** test connection quickly */
export async function testConnection(cfg: PGConfig): Promise<{ ok: boolean; message?: string; status: 'connected' | 'disconnected' }> {
  const client = createClient(cfg);
  try {
    await client.connect();
    await client.end();
    return { ok: true, status: 'connected', message: "Connection successful" };
  } catch (err: any) {
    return { ok: false, message: err.message || String(err), status: 'disconnected' };
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
    const res = await c.query(PG_CANCEL_QUERY, [targetPid]);
    await c.end();
    return res.rows?.[0]?.cancelled === true;
  } catch (err) {
    try {
      await c.end();
    } catch (e) { }
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
  tableName: string,
  limit: number,
  page: number
): Promise<{ rows: any[]; total: number }> {

  const client = createClient(config);

  try {
    await client.connect();

    const safeSchema = `"${schemaName.replace(/"/g, '""')}"`;
    const safeTable = `"${tableName.replace(/"/g, '""')}"`;

    const offset = (page - 1) * limit;

    const pkResult = await listPrimaryKeys(config, schemaName, tableName);
    const pkColumns = pkResult.map((r: any) =>
      `"${r.column_name.replace(/"/g, '""')}"`
    );

    let orderBy = "";

    if (pkColumns.length > 0) {
      orderBy = `ORDER BY ${pkColumns.join(", ")}`;
    } else {
      const colQuery = `
        SELECT column_name
        FROM information_schema.columns
        WHERE table_schema = $1 AND table_name = $2
        ORDER BY ordinal_position;
      `;

      const colResult = await client.query(colQuery, [schemaName, tableName]);
      const columns = colResult.rows.map((r) => `"${r.column_name}"`);

      orderBy = columns.length > 0 ? `ORDER BY ${columns.join(", ")}` : "";
    }

    const countQuery = `
      SELECT COUNT(*) AS count
      FROM ${safeSchema}.${safeTable};
    `;
    const totalResult = await client.query(countQuery);
    const total = Number(totalResult.rows[0].count);

    const dataQuery = `
      SELECT *
      FROM ${safeSchema}.${safeTable}
      ${orderBy}
      LIMIT $1 OFFSET $2;
    `;

    const result = await client.query(dataQuery, [limit, offset]);

    return { rows: result.rows, total };
  } catch (error) {
    throw new Error(
      `Failed to fetch paginated data from ${schemaName}.${tableName}: ${error}`
    );
  } finally {
    try {
      await client.end();
    } catch (_) { }
  }
}


/**
 * listTables: Retrieves all user-defined tables and views.
 */

export async function listTables(connection: PGConfig, schemaName?: string) {
  // Check cache first
  const cached = postgresCache.getTableList(connection, schemaName);
  if (cached !== null) {
    return cached;
  }

  const client = createClient(connection);

  let query = PG_LIST_TABLES;
  let queryParams: string[] = [];

  // Add schema filter if provided
  if (schemaName) {
    query = PG_LIST_TABLES_BY_SCHEMA;
    queryParams.push(schemaName);
  }

  try {
    await client.connect();

    // Execute the dynamically constructed query
    const res = await client.query(query, queryParams);

    await client.end();

    const result = res.rows;

    // Cache the result
    postgresCache.setTableList(connection, result, schemaName);

    return result; // [{schema, name, type}, ...]
  } catch (err) {
    try {
      await client.end();
    } catch (e) { }
    throw err;
  }
}

export async function listPrimaryKeys(connection: PGConfig, schemaName: string = 'public', tableName: string) {
  // Check cache first
  const cached = postgresCache.getPrimaryKeys(connection, schemaName, tableName);
  if (cached !== null) {
    return cached;
  }

  const client = createClient(connection);

  try {
    await client.connect();
    const res = await client.query(PG_GET_PRIMARY_KEYS, [tableName]);

    const result = res.rows;

    // Cache the result
    postgresCache.setPrimaryKeys(connection, schemaName, tableName, result);

    return result;
  } catch (err) {
    try {
      await client.end();
    } catch (e) { }
    throw err;
  }
}

export async function listForeignKeys(
  connection: PGConfig,
  schemaName: string = "public",
  tableName: string
) {
  // Check cache
  const cached = postgresCache.getForeignKeys(connection, schemaName, tableName);
  if (cached !== null) return cached;

  const client = createClient(connection);

  try {
    await client.connect();
    const res = await client.query(PG_GET_FOREIGN_KEYS, [tableName, schemaName]);
    const result = res.rows;

    postgresCache.setForeignKeys(connection, schemaName, tableName, result);

    return result;
  } catch (err) {
    throw err;
  } finally {
    try {
      await client.end();
    } catch { }
  }
}



export async function listIndexes(connection: PGConfig, schemaName = "public", tableName: string) {
  const cached = postgresCache.getIndexes(connection, schemaName, tableName);
  if (cached !== null) return cached;

  const client = createClient(connection);

  try {
    await client.connect();
    const res = await client.query(PG_GET_INDEXES, [tableName, schemaName]);
    postgresCache.setIndexes(connection, schemaName, tableName, res.rows);
    return res.rows;
  } finally {
    try { await client.end(); } catch { }
  }
}

export async function listUniqueConstraints(connection: PGConfig, schemaName = "public", tableName: string) {
  const cached = postgresCache.getUnique(connection, schemaName, tableName);
  if (cached !== null) return cached;

  const client = createClient(connection);

  try {
    await client.connect();
    const res = await client.query(PG_GET_UNIQUE_CONSTRAINTS, [tableName, schemaName]);
    postgresCache.setUnique(connection, schemaName, tableName, res.rows);
    return res.rows;
  } finally {
    try { await client.end(); } catch { }
  }
}

export async function listCheckConstraints(connection: PGConfig, schemaName = "public", tableName: string) {
  const cached = postgresCache.getChecks(connection, schemaName, tableName);
  if (cached !== null) return cached;

  const client = createClient(connection);

  try {
    await client.connect();
    const res = await client.query(PG_GET_CHECK_CONSTRAINTS, [tableName, schemaName]);
    postgresCache.setChecks(connection, schemaName, tableName, res.rows);
    return res.rows;
  } finally {
    try { await client.end(); } catch { }
  }
}


export async function listEnumTypes(connection: PGConfig, schemaName = "public") {
  const cached = postgresCache.getEnums(connection, schemaName);
  if (cached !== null) return cached;

  const client = createClient(connection);

  try {
    await client.connect();
    const res = await client.query(PG_LIST_ENUMS, [schemaName]);
    postgresCache.setEnums(connection, schemaName, res.rows);
    return res.rows;
  } finally {
    try { await client.end(); } catch { }
  }
}

export async function listSequences(connection: PGConfig, schemaName = "public") {
  const cached = postgresCache.getSequences(connection, schemaName);
  if (cached !== null) return cached;

  const client = createClient(connection);

  try {
    await client.connect();
    const res = await client.query(PG_LIST_SEQUENCES, [schemaName]);
    postgresCache.setSequences(connection, schemaName, res.rows);
    return res.rows;
  } finally {
    try { await client.end(); } catch { }
  }
}


// ============================================
// BATCH QUERIES FOR PERFORMANCE OPTIMIZATION
// ============================================

/**
 * Fetch all table metadata (columns, PKs, FKs, indexes, constraints) in a single query per schema
 * This dramatically reduces the number of database round-trips
 */
export async function getSchemaMetadataBatch(
  connection: PGConfig,
  schemaName: string
): Promise<{
  tables: Map<string, {
    columns: ColumnDetail[];
    primaryKeys: PrimaryKeyInfo[];
    foreignKeys: ForeignKeyInfo[];
    indexes: IndexInfo[];
    uniqueConstraints: UniqueConstraintInfo[];
    checkConstraints: CheckConstraintInfo[];
  }>;
  enumTypes: EnumInfo[];
  sequences: SequenceInfo[];
}> {
  const client = createClient(connection);

  try {
    await client.connect();

    // Execute all queries in parallel using imported batch queries
    const [
      columnsResult,
      primaryKeysResult,
      foreignKeysResult,
      indexesResult,
      uniqueResult,
      checksResult,
      enumsResult,
      sequencesResult
    ] = await Promise.all([
      // All columns in schema
      client.query(PG_BATCH_GET_ALL_COLUMNS, [schemaName]),

      // All primary keys in schema
      client.query(PG_BATCH_GET_PRIMARY_KEYS, [schemaName]),

      // All foreign keys in schema
      client.query(PG_BATCH_GET_FOREIGN_KEYS, [schemaName]),

      // All indexes in schema
      client.query(PG_BATCH_GET_INDEXES, [schemaName]),

      // All unique constraints in schema
      client.query(PG_BATCH_GET_UNIQUE_CONSTRAINTS, [schemaName]),

      // All check constraints in schema
      client.query(PG_BATCH_GET_CHECK_CONSTRAINTS, [schemaName]),

      // All enum types in schema
      client.query(PG_LIST_ENUMS, [schemaName]),

      // All sequences in schema
      client.query(PG_LIST_SEQUENCES, [schemaName])
    ]);

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
    for (const row of columnsResult.rows) {
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
        not_nullable: row.not_nullable,
        default_value: row.default_value,
        is_primary_key: row.is_primary_key,
        is_foreign_key: row.is_foreign_key
      });
    }

    // Process primary keys
    for (const row of primaryKeysResult.rows) {
      if (tables.has(row.table_name)) {
        tables.get(row.table_name)!.primaryKeys.push({
          column_name: row.column_name
        });
      }
    }

    // Process foreign keys
    for (const row of foreignKeysResult.rows) {
      if (tables.has(row.source_table)) {
        tables.get(row.source_table)!.foreignKeys.push(row);
      }
    }

    // Process indexes
    for (const row of indexesResult.rows) {
      if (tables.has(row.table_name)) {
        tables.get(row.table_name)!.indexes.push(row);
      }
    }

    // Process unique constraints
    for (const row of uniqueResult.rows) {
      if (tables.has(row.table_name)) {
        tables.get(row.table_name)!.uniqueConstraints.push(row);
      }
    }

    // Process check constraints
    for (const row of checksResult.rows) {
      if (tables.has(row.table_name)) {
        tables.get(row.table_name)!.checkConstraints.push(row);
      }
    }

    return {
      tables,
      enumTypes: enumsResult.rows,
      sequences: sequencesResult.rows
    };
  } finally {
    try { await client.end(); } catch { }
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
              } catch { }
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
        } catch (e) { }
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
  // Check cache first
  const cached = postgresCache.getDBStats(connection);
  if (cached !== null) {
    return cached;
  }

  const client = createClient(connection);
  try {
    await client.connect();
    const res = await client.query(PG_GET_DB_STATS);

    // CRITICAL: Ensure the pg client is closed after a successful query
    await client.end();

    // CRITICAL: Update the return type structure
    const result = res.rows?.[0] as {
      total_tables: number;
      total_db_size_mb: number;
      total_rows: number;
    };

    // Cache the result
    postgresCache.setDBStats(connection, result);

    return result;
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
  // Check cache first
  const cached = postgresCache.getSchemas(connection);
  if (cached !== null) {
    return cached;
  }

  const client = createClient(connection);
  try {
    await client.connect();
    const res = await client.query(PG_LIST_SCHEMAS);
    await client.end();

    const result = res.rows;

    // Cache the result
    postgresCache.setSchemas(connection, result);

    return result; // [{ name: 'public' }, { name: 'analytics' }, ...]
  } catch (err) {
    try {
      await client.end();
    } catch (e) { }
    throw err;
  }
}

/** getTableDetails: Retrieves column details for a specific table. */
export async function getTableDetails(
  connection: PGConfig,
  schemaName: string,
  tableName: string
) {
  // Check cache first
  const cached = postgresCache.getTableDetails(connection, schemaName, tableName);
  if (cached !== null) {
    return cached;
  }

  const client = createClient(connection);
  try {
    await client.connect();
    const res = await client.query(PG_GET_TABLE_DETAILS, [`${schemaName}.${tableName}`]);
    await client.end();

    const result = res.rows;

    // Cache the result
    postgresCache.setTableDetails(connection, schemaName, tableName, result);

    return result;
  } catch (err) {
    // ... (Error handling)
    throw err;
  }
}
function quoteIdent(name: string) {
  return `"${name.replace(/"/g, '""')}"`;
}

const PG_TYPE_MAP: Record<string, string> = {
  INT: "INTEGER",
  BIGINT: "BIGINT",
  TEXT: "TEXT",
  BOOLEAN: "BOOLEAN",
  TIMESTAMP: "TIMESTAMP",
  JSON: "JSONB",
};

export async function createTable(
  conn: PGConfig,
  schemaName: string,
  tableName: string,
  columns: ColumnDetail[],
  foreignKeys: ForeignKeyInfo[] = []
) {
  const client = createClient(conn);

  const primaryKeys = columns
    .filter(c => c.is_primary_key)
    .map(c => quoteIdent(c.name));

  const columnDefs = columns.map(col => {
    if (!PG_TYPE_MAP[col.type]) {
      throw new Error(`Invalid type: ${col.type}`);
    }

    const parts = [
      quoteIdent(col.name),
      PG_TYPE_MAP[col.type],
      col.not_nullable || col.is_primary_key ? "NOT NULL" : "",
      col.default_value ? `DEFAULT ${col.default_value}` : ""
    ].filter(Boolean);

    return parts.join(" ");
  });

  if (primaryKeys.length > 0) {
    columnDefs.push(`PRIMARY KEY (${primaryKeys.join(", ")})`);
  }

  const createTableQuery = `
    CREATE TABLE IF NOT EXISTS ${quoteIdent(schemaName)}.${quoteIdent(tableName)} (
      ${columnDefs.join(",\n")}
    );
  `;

  try {
    await client.connect();
    await client.query("BEGIN");

    await client.query(createTableQuery);

    for (const fk of foreignKeys) {
      const fkQuery = `
        ALTER TABLE ${quoteIdent(fk.source_schema)}.${quoteIdent(fk.source_table)}
        ADD CONSTRAINT ${quoteIdent(fk.constraint_name)}
        FOREIGN KEY (${quoteIdent(fk.source_column)})
        REFERENCES ${quoteIdent(fk.target_schema)}.${quoteIdent(fk.target_table)}
          (${quoteIdent(fk.target_column)})
        ${fk.delete_rule ? `ON DELETE ${fk.delete_rule}` : ""}
        ${fk.update_rule ? `ON UPDATE ${fk.update_rule}` : ""};
      `;

      await client.query(fkQuery);
    }

    await client.query("COMMIT");
    return true;
  } catch (err) {
    await client.query("ROLLBACK");
    throw err;
  } finally {
    await client.end();
  }
}

function groupIndexes(indexes: IndexInfo[]) {
  const map = new Map<string, IndexInfo[]>();

  for (const idx of indexes) {
    if (!map.has(idx.index_name)) {
      map.set(idx.index_name, []);
    }
    map.get(idx.index_name)!.push(idx);
  }

  return [...map.values()].map(group =>
    group.sort((a, b) => a.ordinal_position - b.ordinal_position)
  );
}

export async function createIndexes(
  conn: PGConfig,
  schemaName: string,
  indexes: IndexInfo[]
): Promise<Boolean> {
  const client = createClient(conn);
  const grouped = groupIndexes(indexes);
  try {
    await client.connect();

    for (const group of grouped) {
      const first = group[0];

      // Skip PK indexes (already handled in CREATE TABLE)
      if (first.is_primary) continue;

      const columns = group.map(i => quoteIdent(i.column_name)).join(", ");

      const query = `
      CREATE ${first.is_unique ? "UNIQUE" : ""} INDEX IF NOT EXISTS
      ${quoteIdent(first.index_name)}
      ON ${quoteIdent(schemaName)}.${quoteIdent(first.table_name)}
      USING ${first.index_type || "btree"}
      (${columns})
      ${first.predicate ? `WHERE ${first.predicate}` : ""};
    `;

      await client.query(query);
    }

    return true;
  } catch (error) {
    throw error;
  } finally {
    await client.end();
  }
}


export async function alterTable(
  conn: PGConfig,
  schemaName: string,
  tableName: string,
  operations: PGAlterTableOperation[]
): Promise<boolean> {
  const client = createClient(conn);

  try {
    await client.connect();
    await client.query("BEGIN");

    for (const op of operations) {
      let query = "";

      switch (op.type) {
        case "ADD_COLUMN":
          query = `
            ALTER TABLE ${quoteIdent(schemaName)}.${quoteIdent(tableName)}
            ADD COLUMN ${quoteIdent(op.column.name)}
            ${PG_TYPE_MAP[op.column.type]}
            ${op.column.not_nullable ? "NOT NULL" : ""}
            ${op.column.default_value ? `DEFAULT ${op.column.default_value}` : ""};
          `;
          break;

        case "DROP_COLUMN":
          query = `
            ALTER TABLE ${quoteIdent(schemaName)}.${quoteIdent(tableName)}
            DROP COLUMN ${quoteIdent(op.column_name)};
          `;
          break;

        case "RENAME_COLUMN":
          query = `
            ALTER TABLE ${quoteIdent(schemaName)}.${quoteIdent(tableName)}
            RENAME COLUMN ${quoteIdent(op.from)} TO ${quoteIdent(op.to)};
          `;
          break;

        case "SET_NOT_NULL":
          query = `
            ALTER TABLE ${quoteIdent(schemaName)}.${quoteIdent(tableName)}
            ALTER COLUMN ${quoteIdent(op.column_name)} SET NOT NULL;
          `;
          break;

        case "DROP_NOT_NULL":
          query = `
            ALTER TABLE ${quoteIdent(schemaName)}.${quoteIdent(tableName)}
            ALTER COLUMN ${quoteIdent(op.column_name)} DROP NOT NULL;
          `;
          break;

        case "SET_DEFAULT":
          query = `
            ALTER TABLE ${quoteIdent(schemaName)}.${quoteIdent(tableName)}
            ALTER COLUMN ${quoteIdent(op.column_name)}
            SET DEFAULT ${op.default_value};
          `;
          break;

        case "DROP_DEFAULT":
          query = `
            ALTER TABLE ${quoteIdent(schemaName)}.${quoteIdent(tableName)}
            ALTER COLUMN ${quoteIdent(op.column_name)} DROP DEFAULT;
          `;
          break;

        case "ALTER_TYPE":
          query = `
            ALTER TABLE ${quoteIdent(schemaName)}.${quoteIdent(tableName)}
            ALTER COLUMN ${quoteIdent(op.column_name)}
            TYPE ${PG_TYPE_MAP[op.new_type]};
          `;
          break;
      }

      await client.query(query);
    }

    await client.query("COMMIT");
    return true;
  } catch (err) {
    await client.query("ROLLBACK");
    throw err;
  } finally {
    await client.end();
  }
}


export async function dropTable(
  conn: PGConfig,
  schemaName: string,
  tableName: string,
  mode: PGDropMode = "RESTRICT"
): Promise<boolean> {
  const client = createClient(conn);

  try {
    await client.connect();
    await client.query("BEGIN");

    if (mode !== "CASCADE") {
      const { rows } = await client.query(
        `
        SELECT 
          tc.constraint_name,
          tc.table_schema,
          tc.table_name
        FROM information_schema.table_constraints tc
        JOIN information_schema.constraint_column_usage ccu
          ON tc.constraint_name = ccu.constraint_name
          AND tc.table_schema = ccu.table_schema
        WHERE tc.constraint_type = 'FOREIGN KEY'
          AND ccu.table_schema = $1
          AND ccu.table_name = $2;
        `,
        [schemaName, tableName]
      );

      if (rows.length > 0 && mode === "RESTRICT") {
        throw new Error(
          `Cannot drop table "${tableName}" — referenced by ${rows.length} foreign key(s)`
        );
      }

      if (mode === "DETACH_FKS") {
        for (const fk of rows) {
          await client.query(`
            ALTER TABLE ${quoteIdent(fk.table_schema)}.${quoteIdent(fk.table_name)}
            DROP CONSTRAINT ${quoteIdent(fk.constraint_name)};
          `);
        }
      }
    }

    await client.query(`
      DROP TABLE ${quoteIdent(schemaName)}.${quoteIdent(tableName)}
      ${mode === "CASCADE" ? "CASCADE" : "RESTRICT"};
    `);

    await client.query("COMMIT");
    return true;
  } catch (err) {
    await client.query("ROLLBACK");
    throw err;
  } finally {
    await client.end();
  }
}

export async function ensureMigrationTable(client: PGConfig) {
  const connection = createClient(client)
  try {
    await connection.connect()
    await connection.query(PG_CREATE_MIGRATION_TABLE);
  } catch (error) {
    throw error;
  } finally {
    await connection.end();
  }
}

export async function hasAnyMigrations(connection: PGConfig): Promise<boolean> {
  const client = createClient(connection)

  try {
    await client.connect();
    const { rows } = await client.query(PG_CHECK_MIGRATIONS_EXIST);
    return rows.length > 0;
  } catch (error) {
    throw error;
  } finally {
    await client.end();
  }
}

export async function insertBaseline(
  conn: PGConfig,
  version: string,
  name: string,
  checksum: string
): Promise<boolean> {
  const client = createClient(conn)
  try {
    await client.connect();
    await client.query(PG_INSERT_MIGRATION, [version, name, checksum]);
    return true;
  } catch (error) {
    throw error;
  } finally {
    await client.end();
  }
}


export async function baselineIfNeeded(
  conn: PGConfig,
  migrationsDir: string
) {
  const client = createClient(conn);

  try {
    await client.connect();
    await ensureMigrationTable(client);

    const hasMigrations = await hasAnyMigrations(client);
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

    await insertBaseline(client, version, name, checksum);

    return { baselined: true, version };
  } finally {
    await client.end();
  }
}



export async function listAppliedMigrations(
  cfg: PGConfig,
): Promise<AppliedMigration[]> {
  const client = createClient(cfg);

  try {
    await client.connect();

    // Important: table may not exist yet
    const tableExists = await client.query(`
      SELECT 1
      FROM information_schema.tables
      WHERE table_name = 'schema_migrations'
      AND table_schema = current_schema()
      LIMIT 1;
    `);

    if (tableExists.rowCount === 0) {
      return [];
    }

    const res = await client.query(PG_LIST_APPLIED_MIGRATIONS);

    return res.rows as AppliedMigration[];
  } finally {
    await client.end();
  }
}



export async function connectToDatabase(
  cfg: PGConfig,
  connectionId: string,
  options?: { readOnly?: boolean }
) {
  // 1️⃣ Baseline (only if allowed)
  let baselineResult = { baselined: false };
  const migrationsDir = getMigrationsDir(connectionId);
  ensureDir(migrationsDir);

  if (!options?.readOnly) {
    baselineResult = await baselineIfNeeded(cfg, migrationsDir);
  }

  // 2️⃣ Load schema (read-only)
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
  cfg: PGConfig,
  migrationFilePath: string
): Promise<boolean> {
  const client = createClient(cfg);

  try {
    await client.connect();

    // Read and parse migration file
    const { readMigrationFile } = await import('../utils/migrationFileReader');
    const migration = readMigrationFile(migrationFilePath);

    // Begin transaction
    await client.query('BEGIN');

    // Execute up SQL
    await client.query(migration.upSQL);

    // Record in schema_migrations
    await client.query(
      `INSERT INTO schema_migrations (version, name, checksum)
       VALUES ($1, $2, $3)`,
      [migration.version, migration.name, migration.checksum]
    );

    // Commit transaction
    await client.query('COMMIT');

    // Clear cache
    postgresCache.clearForConnection(cfg);

    return true;
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    await client.end();
  }
}

/**
 * Rollback an applied migration
 */
export async function rollbackMigration(
  cfg: PGConfig,
  version: string,
  migrationFilePath: string
): Promise<boolean> {
  const client = createClient(cfg);

  try {
    await client.connect();

    // Read and parse migration file
    const { readMigrationFile } = await import('../utils/migrationFileReader');
    const migration = readMigrationFile(migrationFilePath);

    // Begin transaction
    await client.query('BEGIN');

    // Execute down SQL
    await client.query(migration.downSQL);

    // Remove from schema_migrations
    await client.query(PG_DELETE_MIGRATION, [version]);

    // Commit transaction
    await client.query('COMMIT');

    // Clear cache
    postgresCache.clearForConnection(cfg);

    return true;
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    await client.end();
  }
}

/**
 * Insert a row into a table
 * @param cfg - PostgreSQL connection config
 * @param schemaName - Schema name
 * @param tableName - Table name
 * @param rowData - Object with column names as keys and values to insert
 * @returns The inserted row
 */
export async function insertRow(
  cfg: PGConfig,
  schemaName: string,
  tableName: string,
  rowData: Record<string, any>
): Promise<any> {
  const client = createClient(cfg);

  try {
    await client.connect();

    const columns = Object.keys(rowData);
    const values = Object.values(rowData);

    if (columns.length === 0) {
      throw new Error("No data provided for insert");
    }

    // Build parameterized query
    const safeSchema = `"${schemaName.replace(/"/g, '""')}"`;
    const safeTable = `"${tableName.replace(/"/g, '""')}"`;
    const columnList = columns.map(col => `"${col.replace(/"/g, '""')}"`).join(", ");
    const placeholders = columns.map((_, i) => `$${i + 1}`).join(", ");

    const query = `
      INSERT INTO ${safeSchema}.${safeTable} (${columnList})
      VALUES (${placeholders})
      RETURNING *;
    `;

    const result = await client.query(query, values);

    // Clear cache to refresh table data
    postgresCache.clearForConnection(cfg);

    return result.rows[0];
  } catch (error) {
    throw new Error(`Failed to insert row into ${schemaName}.${tableName}: ${error}`);
  } finally {
    try {
      await client.end();
    } catch (_) { }
  }
}

/**
 * Update a row in a table
 * @param cfg - PostgreSQL connection config
 * @param schemaName - Schema name
 * @param tableName - Table name
 * @param primaryKeyColumn - Primary key column name
 * @param primaryKeyValue - Primary key value to identify the row
 * @param rowData - Object with column names as keys and new values
 * @returns The updated row
 */
export async function updateRow(
  cfg: PGConfig,
  schemaName: string,
  tableName: string,
  primaryKeyColumn: string,
  primaryKeyValue: any,
  rowData: Record<string, any>
): Promise<any> {
  const client = createClient(cfg);

  try {
    await client.connect();

    const columns = Object.keys(rowData);
    const values = Object.values(rowData);

    if (columns.length === 0) {
      throw new Error("No data provided for update");
    }

    // Build parameterized query
    const safeSchema = `"${schemaName.replace(/"/g, '""')}"`;
    const safeTable = `"${tableName.replace(/"/g, '""')}"`;

    const setClause = columns
      .map((col, i) => `"${col.replace(/"/g, '""')}" = $${i + 1}`)
      .join(", ");

    // Build WHERE clause from primary key column/value or whereConditions
    let whereClause: string;
    let whereValues: any[];

    if (typeof primaryKeyColumn === 'string' && primaryKeyColumn) {
      // Single primary key
      const safePkColumn = `"${primaryKeyColumn.replace(/"/g, '""')}"`;
      whereClause = `${safePkColumn} = $${columns.length + 1}`;
      whereValues = [primaryKeyValue];
    } else {
      throw new Error("Primary key column is required for update");
    }

    const query = `
      UPDATE ${safeSchema}.${safeTable}
      SET ${setClause}
      WHERE ${whereClause}
      RETURNING *;
    `;

    const result = await client.query(query, [...values, ...whereValues]);

    // Clear cache to refresh table data
    postgresCache.clearForConnection(cfg);

    return result.rows[0];
  } catch (error) {
    throw new Error(`Failed to update row in ${schemaName}.${tableName}: ${error}`);
  } finally {
    try {
      await client.end();
    } catch (_) { }
  }
}

/**
 * Delete a row from a table
 * @param cfg - PostgreSQL connection config
 * @param schemaName - Schema name
 * @param tableName - Table name
 * @param primaryKeyColumn - Primary key column name (or empty for composite)
 * @param primaryKeyValue - Primary key value or whereConditions object
 * @returns Success status
 */
export async function deleteRow(
  cfg: PGConfig,
  schemaName: string,
  tableName: string,
  primaryKeyColumn: string,
  primaryKeyValue: any
): Promise<boolean> {
  const client = createClient(cfg);

  try {
    await client.connect();

    const safeSchema = `"${schemaName.replace(/"/g, '""')}"`;
    const safeTable = `"${tableName.replace(/"/g, '""')}"`;

    let whereClause: string;
    let whereValues: any[];

    if (primaryKeyColumn && typeof primaryKeyColumn === 'string') {
      // Single primary key
      const safePkColumn = `"${primaryKeyColumn.replace(/"/g, '""')}"`;
      whereClause = `${safePkColumn} = $1`;
      whereValues = [primaryKeyValue];
    } else if (typeof primaryKeyValue === 'object' && primaryKeyValue !== null) {
      // Composite key - use all columns from the object
      const cols = Object.keys(primaryKeyValue);
      whereClause = cols
        .map((col, i) => `"${col.replace(/"/g, '""')}" = $${i + 1}`)
        .join(" AND ");
      whereValues = Object.values(primaryKeyValue);
    } else {
      throw new Error("Either primary key or where conditions required for delete");
    }

    const query = `
      DELETE FROM ${safeSchema}.${safeTable}
      WHERE ${whereClause};
    `;

    const result = await client.query(query, whereValues);

    // Clear cache to refresh table data
    postgresCache.clearForConnection(cfg);

    return result.rowCount ? result.rowCount > 0 : false;
  } catch (error) {
    throw new Error(`Failed to delete row from ${schemaName}.${tableName}: ${error}`);
  } finally {
    try {
      await client.end();
    } catch (_) { }
  }
}

/**
 * Search for rows in a table
 * @param cfg - PostgreSQL connection config
 * @param schemaName - Schema name
 * @param tableName - Table name
 * @param searchTerm - Term to search for
 * @param column - Optional specific column to search (searches all text columns if not specified)
 * @param limit - Max results (default 100)
 * @returns Matching rows
 */
export async function searchTable(
  cfg: PGConfig,
  schemaName: string,
  tableName: string,
  searchTerm: string,
  column?: string,
  page: number = 1,
  pageSize: number = 50
): Promise<{ rows: any[]; total: number }> {
  const client = createClient(cfg);

  try {
    await client.connect();

    const safeSchema = `"${schemaName.replace(/"/g, '""')}"`;
    const safeTable = `"${tableName.replace(/"/g, '""')}"`;
    const searchPattern = `%${searchTerm.replace(/[%_]/g, '\\$&')}%`;

    let whereClause: string;
    let values: any[];

    if (column) {
      // Search specific column
      const safeColumn = `"${column.replace(/"/g, '""')}"`;
      whereClause = `${safeColumn}::text ILIKE $1`;
      values = [searchPattern];
    } else {
      // Get all columns and search across text-compatible ones
      const colQuery = `
        SELECT column_name 
        FROM information_schema.columns 
        WHERE table_schema = $1 AND table_name = $2
      `;
      const colResult = await client.query(colQuery, [schemaName, tableName]);
      const columns = colResult.rows.map(r => r.column_name);

      if (columns.length === 0) {
        return { rows: [], total: 0 };
      }

      // Build OR clause for all columns cast to text
      whereClause = columns
        .map((col, i) => `"${col.replace(/"/g, '""')}"::text ILIKE $1`)
        .join(" OR ");
      values = [searchPattern];
    }

    // Count total matches
    const countQuery = `
      SELECT COUNT(*) as total 
      FROM ${safeSchema}.${safeTable} 
      WHERE ${whereClause}
    `;
    const countResult = await client.query(countQuery, values);
    const total = parseInt(countResult.rows[0]?.total || "0", 10);

    // Get matching rows with pagination
    const offset = (page - 1) * pageSize;
    const query = `
      SELECT * FROM ${safeSchema}.${safeTable}
      WHERE ${whereClause}
      LIMIT ${pageSize} OFFSET ${offset}
    `;
    const result = await client.query(query, values);

    return { rows: result.rows, total };
  } catch (error) {
    throw new Error(`Failed to search table ${schemaName}.${tableName}: ${error}`);
  } finally {
    try {
      await client.end();
    } catch (_) { }
  }
}

/**
 * listSchemaNames: Retrieves just the names of schemas.
 * Lightweight version of listSchemas.
 */
export async function listSchemaNames(connection: PGConfig): Promise<string[]> {
  // Check cache first (re-use schemas cache if available, or a new cache if needed)
  // For now, simpler to just query as it's very fast
  const client = createClient(connection);

  try {
    await client.connect();
    const res = await client.query(PG_LIST_SCHEMAS);
    return res.rows.map((r: any) => r.name);
  } finally {
    try {
      await client.end();
    } catch (e) { }
  }
}
