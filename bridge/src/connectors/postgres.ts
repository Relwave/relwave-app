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

// ============================================
// CACHING SYSTEM FOR POSTGRES CONNECTOR
// ============================================

// Cache configuration
const CACHE_TTL = 60000; // 1 minute default TTL
const STATS_CACHE_TTL = 30000; // 30 seconds for stats (changes more frequently)
const SCHEMA_CACHE_TTL = 300000; // 5 minutes for schemas (rarely change)

/**
 * Generic cache entry with TTL support
 */
type CacheEntry<T> = {
  data: T;
  timestamp: number;
  ttl: number;
};

/**
 * Type definitions for cached data
 */
type TableInfo = {
  schema: string;
  name: string;
  type: string;
};

type PrimaryKeyInfo = {
  column_name: string;
};

type DBStats = {
  total_tables: number;
  total_db_size_mb: number;
  total_rows: number;
};

type SchemaInfo = {
  name: string;
};

type ColumnDetail = {
  name: string;
  type: string;
  not_nullable: boolean;
  default_value: string | null;
  is_primary_key: boolean;
  is_foreign_key: boolean;
};

type ForeignKeyInfo = {
  constraint_name: string;
  source_schema: string;
  source_table: string;
  source_column: string;
  target_schema: string;
  target_table: string;
  target_column: string;
  update_rule: string;
  delete_rule: string;
  ordinal_position: number;
};

type IndexInfo = {
  table_name: string;
  index_name: string;
  column_name: string;
  is_unique: boolean;
  is_primary: boolean;
  index_type: string;
  predicate: string | null;
  ordinal_position: number;
};

type UniqueConstraintInfo = {
  constraint_name: string;
  table_schema: string;
  table_name: string;
  column_name: string;
  ordinal_position: number;
};

type CheckConstraintInfo = {
  constraint_name: string;
  table_schema: string;
  table_name: string;
  definition: string;
};

type EnumInfo = {
  schema_name: string;
  enum_name: string;
  enum_value: string;
};

type SequenceInfo = {
  sequence_name: string;
  sequence_schema: string;
  table_name: string | null;
  column_name: string | null;
};


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
    const res = await c.query("SELECT pg_cancel_backend($1) AS cancelled", [
      targetPid,
    ]);
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

  const query = `
   SELECT 
    tc.table_schema,
    tc.table_name,
    kcu.column_name,
    kcu.ordinal_position
FROM 
    information_schema.table_constraints tc
JOIN 
    information_schema.key_column_usage kcu
    ON tc.constraint_name = kcu.constraint_name
WHERE 
    tc.constraint_type = 'PRIMARY KEY'
    AND tc.table_name = $1
ORDER BY 
    kcu.ordinal_position;

  `;

  try {
    await client.connect();
    const res = await client.query(query, [tableName]);

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

  const query = `
    SELECT
        tc.constraint_name,
        tc.table_schema AS source_schema,
        tc.table_name AS source_table,
        kcu.column_name AS source_column,
        ccu.table_schema AS target_schema,
        ccu.table_name AS target_table,
        ccu.column_name AS target_column,
        rc.update_rule,
        rc.delete_rule,
        kcu.ordinal_position
    FROM information_schema.table_constraints tc
    JOIN information_schema.key_column_usage kcu
        ON tc.constraint_name = kcu.constraint_name
       AND tc.table_schema = kcu.table_schema
    JOIN information_schema.constraint_column_usage ccu
        ON ccu.constraint_name = tc.constraint_name
    JOIN information_schema.referential_constraints rc
        ON rc.constraint_name = tc.constraint_name
    WHERE 
        tc.constraint_type = 'FOREIGN KEY'
        AND tc.table_schema = $2
        AND tc.table_name = $1
    ORDER BY 
        tc.constraint_name,
        kcu.ordinal_position;
  `;

  try {
    await client.connect();
    const res = await client.query(query, [tableName, schemaName]);
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

  const query = ` SELECT
    t.relname AS table_name,
    i.relname AS index_name,
    a.attname AS column_name,
    ix.indisunique AS is_unique,
    ix.indisprimary AS is_primary,
    am.amname AS index_type,
    pg_get_expr(ix.indpred, ix.indrelid) AS predicate,
    array_position(ix.indkey, a.attnum) AS ordinal_position
FROM pg_class t
JOIN pg_index ix ON t.oid = ix.indrelid
JOIN pg_class i ON i.oid = ix.indexrelid
JOIN pg_am am ON am.oid = i.relam
JOIN pg_attribute a ON a.attrelid = t.oid AND a.attnum = ANY(ix.indkey)
JOIN pg_namespace n ON n.oid = t.relnamespace
WHERE
    n.nspname = $2
    AND t.relname = $1
ORDER BY index_name, ordinal_position;
`;

  try {
    await client.connect();
    const res = await client.query(query, [tableName, schemaName]);
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
  const query = `SELECT
  tc.constraint_name,
  tc.table_schema,
  tc.table_name,
  kcu.column_name,
  kcu.ordinal_position
FROM information_schema.table_constraints tc
JOIN information_schema.key_column_usage kcu
  ON tc.constraint_name = kcu.constraint_name
  AND tc.table_schema = kcu.table_schema
WHERE
  tc.constraint_type = 'UNIQUE'
  AND tc.table_schema = $2
  AND tc.table_name = $1
ORDER BY
  tc.constraint_name,
  kcu.ordinal_position;
 `;

  try {
    await client.connect();
    const res = await client.query(query, [tableName, schemaName]);
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
  const query = `SELECT
    c.conname AS constraint_name,
    n.nspname AS table_schema,
    t.relname AS table_name,
    pg_get_constraintdef(c.oid) AS definition
FROM pg_constraint c
JOIN pg_class t ON c.conrelid = t.oid
JOIN pg_namespace n ON n.oid = t.relnamespace
WHERE
    c.contype = 'c'
    AND n.nspname = $2
    AND t.relname = $1;
 `;

  try {
    await client.connect();
    const res = await client.query(query, [tableName, schemaName]);
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
  const query = `SELECT
    n.nspname AS schema_name,
    t.typname AS enum_name,
    e.enumlabel AS enum_value
FROM pg_type t
JOIN pg_enum e ON t.oid = e.enumtypid
JOIN pg_namespace n ON n.oid = t.typnamespace
WHERE
    n.nspname = $1
ORDER BY enum_name, e.enumsortorder;
  `;

  try {
    await client.connect();
    const res = await client.query(query, [schemaName]);
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
  const query = `SELECT
    seq.relname AS sequence_name,
    ns.nspname AS sequence_schema,
    tab.relname AS table_name,
    col.attname AS column_name
FROM pg_class seq
JOIN pg_namespace ns ON ns.oid = seq.relnamespace
LEFT JOIN pg_depend dep ON dep.objid = seq.oid AND dep.deptype = 'a'
LEFT JOIN pg_class tab ON tab.oid = dep.refobjid
LEFT JOIN pg_attribute col ON col.attrelid = tab.oid AND col.attnum = dep.refobjsubid
WHERE
    seq.relkind = 'S'
    AND ns.nspname = $1;
 `;

  try {
    await client.connect();
    const res = await client.query(query, [schemaName]);
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

    // Execute all queries in parallel using a single connection
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
      client.query(`
        SELECT 
          c.table_name,
          c.column_name AS name,
          c.data_type AS type,
          c.is_nullable = 'NO' AS not_nullable,
          c.column_default AS default_value,
          c.ordinal_position,
          c.character_maximum_length AS max_length,
          CASE WHEN pk.column_name IS NOT NULL THEN true ELSE false END AS is_primary_key,
          CASE WHEN fk.column_name IS NOT NULL THEN true ELSE false END AS is_foreign_key
        FROM information_schema.columns c
        LEFT JOIN (
          SELECT kcu.table_name, kcu.column_name
          FROM information_schema.table_constraints tc
          JOIN information_schema.key_column_usage kcu 
            ON tc.constraint_name = kcu.constraint_name AND tc.table_schema = kcu.table_schema
          WHERE tc.constraint_type = 'PRIMARY KEY' AND tc.table_schema = $1
        ) pk ON c.table_name = pk.table_name AND c.column_name = pk.column_name
        LEFT JOIN (
          SELECT DISTINCT kcu.table_name, kcu.column_name
          FROM information_schema.table_constraints tc
          JOIN information_schema.key_column_usage kcu 
            ON tc.constraint_name = kcu.constraint_name AND tc.table_schema = kcu.table_schema
          WHERE tc.constraint_type = 'FOREIGN KEY' AND tc.table_schema = $1
        ) fk ON c.table_name = fk.table_name AND c.column_name = fk.column_name
        WHERE c.table_schema = $1
        ORDER BY c.table_name, c.ordinal_position
      `, [schemaName]),

      // All primary keys in schema
      client.query(`
        SELECT tc.table_name, kcu.column_name, kcu.ordinal_position
        FROM information_schema.table_constraints tc
        JOIN information_schema.key_column_usage kcu
          ON tc.constraint_name = kcu.constraint_name AND tc.table_schema = kcu.table_schema
        WHERE tc.constraint_type = 'PRIMARY KEY' AND tc.table_schema = $1
        ORDER BY tc.table_name, kcu.ordinal_position
      `, [schemaName]),

      // All foreign keys in schema
      client.query(`
        SELECT
          tc.constraint_name,
          tc.table_schema AS source_schema,
          tc.table_name AS source_table,
          kcu.column_name AS source_column,
          ccu.table_schema AS target_schema,
          ccu.table_name AS target_table,
          ccu.column_name AS target_column,
          rc.update_rule,
          rc.delete_rule,
          kcu.ordinal_position
        FROM information_schema.table_constraints tc
        JOIN information_schema.key_column_usage kcu
          ON tc.constraint_name = kcu.constraint_name AND tc.table_schema = kcu.table_schema
        JOIN information_schema.constraint_column_usage ccu
          ON ccu.constraint_name = tc.constraint_name
        JOIN information_schema.referential_constraints rc
          ON rc.constraint_name = tc.constraint_name
        WHERE tc.constraint_type = 'FOREIGN KEY' AND tc.table_schema = $1
        ORDER BY tc.table_name, tc.constraint_name, kcu.ordinal_position
      `, [schemaName]),

      // All indexes in schema
      client.query(`
        SELECT
          t.relname AS table_name,
          i.relname AS index_name,
          a.attname AS column_name,
          ix.indisunique AS is_unique,
          ix.indisprimary AS is_primary,
          am.amname AS index_type,
          pg_get_expr(ix.indpred, ix.indrelid) AS predicate,
          array_position(ix.indkey, a.attnum) AS ordinal_position
        FROM pg_class t
        JOIN pg_index ix ON t.oid = ix.indrelid
        JOIN pg_class i ON i.oid = ix.indexrelid
        JOIN pg_am am ON am.oid = i.relam
        JOIN pg_attribute a ON a.attrelid = t.oid AND a.attnum = ANY(ix.indkey)
        JOIN pg_namespace n ON n.oid = t.relnamespace
        WHERE n.nspname = $1
        ORDER BY t.relname, i.relname, ordinal_position
      `, [schemaName]),

      // All unique constraints in schema
      client.query(`
        SELECT
          tc.constraint_name,
          tc.table_schema,
          tc.table_name,
          kcu.column_name,
          kcu.ordinal_position
        FROM information_schema.table_constraints tc
        JOIN information_schema.key_column_usage kcu
          ON tc.constraint_name = kcu.constraint_name AND tc.table_schema = kcu.table_schema
        WHERE tc.constraint_type = 'UNIQUE' AND tc.table_schema = $1
        ORDER BY tc.table_name, tc.constraint_name, kcu.ordinal_position
      `, [schemaName]),

      // All check constraints in schema
      client.query(`
        SELECT
          c.conname AS constraint_name,
          n.nspname AS table_schema,
          t.relname AS table_name,
          pg_get_constraintdef(c.oid) AS check_clause
        FROM pg_constraint c
        JOIN pg_class t ON c.conrelid = t.oid
        JOIN pg_namespace n ON n.oid = t.relnamespace
        WHERE c.contype = 'c' AND n.nspname = $1
      `, [schemaName]),

      // All enum types in schema
      client.query(`
        SELECT
          n.nspname AS schema_name,
          t.typname AS enum_name,
          e.enumlabel AS enum_value
        FROM pg_type t
        JOIN pg_enum e ON t.oid = e.enumtypid
        JOIN pg_namespace n ON n.oid = t.typnamespace
        WHERE n.nspname = $1
        ORDER BY enum_name, e.enumsortorder
      `, [schemaName]),

      // All sequences in schema
      client.query(`
        SELECT
          seq.relname AS sequence_name,
          ns.nspname AS sequence_schema,
          tab.relname AS table_name,
          col.attname AS column_name
        FROM pg_class seq
        JOIN pg_namespace ns ON ns.oid = seq.relnamespace
        LEFT JOIN pg_depend dep ON dep.objid = seq.oid AND dep.deptype = 'a'
        LEFT JOIN pg_class tab ON tab.oid = dep.refobjid
        LEFT JOIN pg_attribute col ON col.attrelid = tab.oid AND col.attnum = dep.refobjsubid
        WHERE seq.relkind = 'S' AND ns.nspname = $1
      `, [schemaName])
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
    const res = await client.query(
      `SELECT nspname AS name
             FROM pg_namespace
             WHERE nspname NOT IN ('pg_catalog', 'information_schema', 'pg_toast')
             AND nspname NOT LIKE 'pg_temp_%' AND nspname NOT LIKE 'pg_toast_temp_%'
             ORDER BY nspname;`
    );
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

type AlterTableOperation =
  | { type: "ADD_COLUMN"; column: ColumnDetail }
  | { type: "DROP_COLUMN"; column_name: string }
  | { type: "RENAME_COLUMN"; from: string; to: string }
  | { type: "SET_NOT_NULL"; column_name: string }
  | { type: "DROP_NOT_NULL"; column_name: string }
  | { type: "SET_DEFAULT"; column_name: string; default_value: string }
  | { type: "DROP_DEFAULT"; column_name: string }
  | { type: "ALTER_TYPE"; column_name: string; new_type: string };


export async function alterTable(
  conn: PGConfig,
  schemaName: string,
  tableName: string,
  operations: AlterTableOperation[]
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
type DropMode =
  | "RESTRICT"      // fail if dependencies exist
  | "DETACH_FKS"    // drop dependent foreign keys first
  | "CASCADE";      // explicit nuclear option


export async function dropTable(
  conn: PGConfig,
  schemaName: string,
  tableName: string,
  mode: DropMode = "RESTRICT"
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
