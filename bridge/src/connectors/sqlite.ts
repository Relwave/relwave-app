// bridge/src/connectors/sqlite.ts
import Database from "better-sqlite3";
import { loadLocalMigrations, writeBaselineMigration } from "../utils/baselineMigration";
import crypto from "crypto";
import fs from "fs";
import { ensureDir, getMigrationsDir } from "../utils/config";
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
  SQLiteConfig,
  SQLiteSchemaMetadataBatch,
  SQLiteAlterTableOperation,
  SQLiteDropMode,
} from "../types/sqlite";

export type {
  SQLiteConfig,
  ColumnDetail,
  TableInfo,
  PrimaryKeyInfo,
  ForeignKeyInfo,
  IndexInfo,
  UniqueConstraintInfo,
  CheckConstraintInfo,
  AppliedMigration,
};

import { SQLITE_LIST_TABLES } from "../queries/sqlite/schema";
import { SQLITE_COUNT_TABLES } from "../queries/sqlite/stats";
import {
  SQLITE_CREATE_MIGRATION_TABLE,
  SQLITE_CHECK_MIGRATIONS_EXIST,
  SQLITE_INSERT_MIGRATION,
  SQLITE_LIST_APPLIED_MIGRATIONS,
  SQLITE_DELETE_MIGRATION
} from "../queries/sqlite/migrations";
import { SQLITE_GET_TABLE_SQL } from "../queries/sqlite/constraints";
import { sqliteQuoteIdentifier } from "../queries/sqlite/crud";

// ============================================
// CACHING SYSTEM FOR SQLITE CONNECTOR
// ============================================

export class SQLiteCacheManager {
  private tableListCache = new Map<string, CacheEntry<TableInfo[]>>();
  private primaryKeysCache = new Map<string, CacheEntry<PrimaryKeyInfo[]>>();
  private dbStatsCache = new Map<string, CacheEntry<DBStats>>();
  private schemasCache = new Map<string, CacheEntry<SchemaInfo[]>>();
  private tableDetailsCache = new Map<string, CacheEntry<ColumnDetail[]>>();
  private foreignKeysCache = new Map<string, CacheEntry<ForeignKeyInfo[]>>();
  private indexesCache = new Map<string, CacheEntry<IndexInfo[]>>();
  private uniqueCache = new Map<string, CacheEntry<UniqueConstraintInfo[]>>();
  private checksCache = new Map<string, CacheEntry<CheckConstraintInfo[]>>();

  private getConfigKey(cfg: SQLiteConfig): string {
    return cfg.path;
  }

  private getTableKey(cfg: SQLiteConfig, schema: string, table: string): string {
    return `${this.getConfigKey(cfg)}:${schema}:${table}`;
  }

  private getSchemaKey(cfg: SQLiteConfig, schema: string): string {
    return `${this.getConfigKey(cfg)}:${schema}`;
  }

  private isValid<T>(entry: CacheEntry<T> | undefined): boolean {
    if (!entry) return false;
    return Date.now() - entry.timestamp < entry.ttl;
  }

  // ============ TABLE LIST CACHE ============
  getTableList(cfg: SQLiteConfig, schema?: string): TableInfo[] | null {
    const key = schema ? this.getSchemaKey(cfg, schema) : this.getConfigKey(cfg);
    const entry = this.tableListCache.get(key);
    return this.isValid(entry) ? entry!.data : null;
  }

  setTableList(cfg: SQLiteConfig, data: TableInfo[], schema?: string): void {
    const key = schema ? this.getSchemaKey(cfg, schema) : this.getConfigKey(cfg);
    this.tableListCache.set(key, { data, timestamp: Date.now(), ttl: CACHE_TTL });
  }

  // ============ PRIMARY KEYS CACHE ============
  getPrimaryKeys(cfg: SQLiteConfig, schema: string, table: string): PrimaryKeyInfo[] | null {
    const key = this.getTableKey(cfg, schema, table);
    const entry = this.primaryKeysCache.get(key);
    return this.isValid(entry) ? entry!.data : null;
  }

  setPrimaryKeys(cfg: SQLiteConfig, schema: string, table: string, data: PrimaryKeyInfo[]): void {
    const key = this.getTableKey(cfg, schema, table);
    this.primaryKeysCache.set(key, { data, timestamp: Date.now(), ttl: CACHE_TTL });
  }

  // ============ DB STATS CACHE ============
  getDBStats(cfg: SQLiteConfig): DBStats | null {
    const key = this.getConfigKey(cfg);
    const entry = this.dbStatsCache.get(key);
    return this.isValid(entry) ? entry!.data : null;
  }

  setDBStats(cfg: SQLiteConfig, data: DBStats): void {
    const key = this.getConfigKey(cfg);
    this.dbStatsCache.set(key, { data, timestamp: Date.now(), ttl: STATS_CACHE_TTL });
  }

  // ============ SCHEMAS CACHE ============
  getSchemas(cfg: SQLiteConfig): SchemaInfo[] | null {
    const key = this.getConfigKey(cfg);
    const entry = this.schemasCache.get(key);
    return this.isValid(entry) ? entry!.data : null;
  }

  setSchemas(cfg: SQLiteConfig, data: SchemaInfo[]): void {
    const key = this.getConfigKey(cfg);
    this.schemasCache.set(key, { data, timestamp: Date.now(), ttl: SCHEMA_CACHE_TTL });
  }

  // ============ TABLE DETAILS CACHE ============
  getTableDetails(cfg: SQLiteConfig, schema: string, table: string): ColumnDetail[] | null {
    const key = this.getTableKey(cfg, schema, table);
    const entry = this.tableDetailsCache.get(key);
    return this.isValid(entry) ? entry!.data : null;
  }

  setTableDetails(cfg: SQLiteConfig, schema: string, table: string, data: ColumnDetail[]): void {
    const key = this.getTableKey(cfg, schema, table);
    this.tableDetailsCache.set(key, { data, timestamp: Date.now(), ttl: CACHE_TTL });
  }

  // ============ FOREIGN KEYS CACHE ============
  getForeignKeys(cfg: SQLiteConfig, schema: string, table: string): ForeignKeyInfo[] | null {
    const key = this.getTableKey(cfg, schema, table);
    const entry = this.foreignKeysCache.get(key);
    return this.isValid(entry) ? entry!.data : null;
  }

  setForeignKeys(cfg: SQLiteConfig, schema: string, table: string, data: ForeignKeyInfo[]): void {
    const key = this.getTableKey(cfg, schema, table);
    this.foreignKeysCache.set(key, { data, timestamp: Date.now(), ttl: CACHE_TTL });
  }

  // ============ INDEXES CACHE ============
  getIndexes(cfg: SQLiteConfig, schema: string, table: string): IndexInfo[] | null {
    const key = this.getTableKey(cfg, schema, table);
    const entry = this.indexesCache.get(key);
    return this.isValid(entry) ? entry!.data : null;
  }

  setIndexes(cfg: SQLiteConfig, schema: string, table: string, data: IndexInfo[]): void {
    const key = this.getTableKey(cfg, schema, table);
    this.indexesCache.set(key, { data, timestamp: Date.now(), ttl: CACHE_TTL });
  }

  // ============ UNIQUE CONSTRAINTS CACHE ============
  getUnique(cfg: SQLiteConfig, schema: string, table: string): UniqueConstraintInfo[] | null {
    const key = this.getTableKey(cfg, schema, table);
    const entry = this.uniqueCache.get(key);
    return this.isValid(entry) ? entry!.data : null;
  }

  setUnique(cfg: SQLiteConfig, schema: string, table: string, data: UniqueConstraintInfo[]): void {
    const key = this.getTableKey(cfg, schema, table);
    this.uniqueCache.set(key, { data, timestamp: Date.now(), ttl: CACHE_TTL });
  }

  // ============ CHECK CONSTRAINTS CACHE ============
  getChecks(cfg: SQLiteConfig, schema: string, table: string): CheckConstraintInfo[] | null {
    const key = this.getTableKey(cfg, schema, table);
    const entry = this.checksCache.get(key);
    return this.isValid(entry) ? entry!.data : null;
  }

  setChecks(cfg: SQLiteConfig, schema: string, table: string, data: CheckConstraintInfo[]): void {
    const key = this.getTableKey(cfg, schema, table);
    this.checksCache.set(key, { data, timestamp: Date.now(), ttl: CACHE_TTL });
  }

  // ============ CACHE MANAGEMENT ============
  clearForConnection(cfg: SQLiteConfig): void {
    const configKey = this.getConfigKey(cfg);
    for (const cache of [
      this.tableListCache, this.primaryKeysCache, this.tableDetailsCache,
      this.foreignKeysCache, this.indexesCache, this.uniqueCache,
      this.checksCache
    ]) {
      for (const [key] of cache) {
        if (key.startsWith(configKey)) cache.delete(key);
      }
    }
    this.dbStatsCache.delete(configKey);
    this.schemasCache.delete(configKey);
  }

  clearTableCache(cfg: SQLiteConfig, schema: string, table: string): void {
    const key = this.getTableKey(cfg, schema, table);
    this.primaryKeysCache.delete(key);
    this.tableDetailsCache.delete(key);
    this.foreignKeysCache.delete(key);
    this.indexesCache.delete(key);
    this.uniqueCache.delete(key);
    this.checksCache.delete(key);
  }

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
  }

  getStats() {
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
    };
  }
}

// Singleton cache manager instance
export const sqliteCache = new SQLiteCacheManager();

// ============================================
// DATABASE HELPER
// ============================================

function openDB(cfg: SQLiteConfig): Database.Database {
  return new Database(cfg.path, {
    readonly: cfg.readonly ?? false,
  });
}

function quoteIdent(name: string): string {
  return `"${name.replace(/"/g, '""')}"`;
}

// ============================================
// CONNECTOR FUNCTIONS
// ============================================

/** Test connection to SQLite database (checks if file is accessible) */
export async function testConnection(cfg: SQLiteConfig): Promise<{ ok: boolean; message?: string; status: 'connected' | 'disconnected' }> {
  try {
    // Ensure the database file exists to avoid implicitly creating a new empty DB
    if (!fs.existsSync(cfg.path)) {
      return {
        ok: false,
        status: "disconnected",
        message: `Database file does not exist at path: ${cfg.path}`,
      };
    }
    // Use fileMustExist so better-sqlite3 will not create a new file during connection test
    const db = new Database(cfg.path, {
      readonly: cfg.readonly ?? false,
      fileMustExist: true,
    });
    db.pragma("journal_mode");
    db.close();
    return { ok: true, status: "connected", message: "Connection successful" };
  } catch (err: any) {
    return { ok: false, message: err.message || String(err), status: "disconnected" };
  }
}

/** List all user tables */
export async function listTables(cfg: SQLiteConfig, _schemaName?: string): Promise<TableInfo[]> {
  const cached = sqliteCache.getTableList(cfg, _schemaName);
  if (cached !== null) return cached;

  const db = openDB(cfg);
  try {
    const rows = db.prepare(SQLITE_LIST_TABLES).all() as TableInfo[];
    sqliteCache.setTableList(cfg, rows, _schemaName);
    return rows;
  } finally {
    db.close();
  }
}

/** List primary keys for a table */
export async function listPrimaryKeys(cfg: SQLiteConfig, schemaName: string = 'main', tableName: string): Promise<PrimaryKeyInfo[]> {
  const cached = sqliteCache.getPrimaryKeys(cfg, schemaName, tableName);
  if (cached !== null) return cached;

  const db = openDB(cfg);
  try {
    const columns = db.pragma(`table_xinfo(${quoteIdent(tableName)})`) as any[];
    const result: PrimaryKeyInfo[] = columns
      .filter((col: any) => col.pk > 0)
      .map((col: any) => ({ column_name: col.name }));

    sqliteCache.setPrimaryKeys(cfg, schemaName, tableName, result);
    return result;
  } finally {
    db.close();
  }
}

/** List foreign keys for a table */
export async function listForeignKeys(cfg: SQLiteConfig, schemaName: string = 'main', tableName: string): Promise<ForeignKeyInfo[]> {
  const cached = sqliteCache.getForeignKeys(cfg, schemaName, tableName);
  if (cached !== null) return cached;

  const db = openDB(cfg);
  try {
    const fks = db.pragma(`foreign_key_list(${quoteIdent(tableName)})`) as any[];
    const result: ForeignKeyInfo[] = fks.map((fk: any) => ({
      constraint_name: `fk_${tableName}_${fk.from}_${fk.id}`,
      source_schema: schemaName,
      source_table: tableName,
      source_column: fk.from,
      target_schema: schemaName,
      target_table: fk.table,
      target_column: fk.to,
      update_rule: fk.on_update || 'NO ACTION',
      delete_rule: fk.on_delete || 'NO ACTION',
      ordinal_position: fk.seq,
    }));

    sqliteCache.setForeignKeys(cfg, schemaName, tableName, result);
    return result;
  } finally {
    db.close();
  }
}

/** List indexes for a table */
export async function listIndexes(cfg: SQLiteConfig, schemaName: string = 'main', tableName: string): Promise<IndexInfo[]> {
  const cached = sqliteCache.getIndexes(cfg, schemaName, tableName);
  if (cached !== null) return cached;

  const db = openDB(cfg);
  try {
    const indexes = db.pragma(`index_list(${quoteIdent(tableName)})`) as any[];
    const result: IndexInfo[] = [];

    for (const idx of indexes) {
      const cols = db.pragma(`index_info(${quoteIdent(idx.name)})`) as any[];
      for (const col of cols) {
        result.push({
          table_name: tableName,
          index_name: idx.name,
          column_name: col.name,
          is_unique: idx.unique === 1,
          is_primary: idx.origin === 'pk',
          index_type: 'btree',
          ordinal_position: col.seqno,
        });
      }
    }

    sqliteCache.setIndexes(cfg, schemaName, tableName, result);
    return result;
  } finally {
    db.close();
  }
}

/** List unique constraints for a table */
export async function listUniqueConstraints(cfg: SQLiteConfig, schemaName: string = 'main', tableName: string): Promise<UniqueConstraintInfo[]> {
  const cached = sqliteCache.getUnique(cfg, schemaName, tableName);
  if (cached !== null) return cached;

  const db = openDB(cfg);
  try {
    const indexes = db.pragma(`index_list(${quoteIdent(tableName)})`) as any[];
    const result: UniqueConstraintInfo[] = [];

    for (const idx of indexes) {
      if (idx.unique !== 1 || idx.origin === 'pk') continue;
      const cols = db.pragma(`index_info(${quoteIdent(idx.name)})`) as any[];
      for (const col of cols) {
        result.push({
          constraint_name: idx.name,
          table_schema: schemaName,
          table_name: tableName,
          column_name: col.name,
          ordinal_position: col.seqno,
        });
      }
    }

    sqliteCache.setUnique(cfg, schemaName, tableName, result);
    return result;
  } finally {
    db.close();
  }
}

/** List check constraints for a table (best-effort via CREATE TABLE SQL parsing) */
export async function listCheckConstraints(cfg: SQLiteConfig, schemaName: string = 'main', tableName: string): Promise<CheckConstraintInfo[]> {
  const cached = sqliteCache.getChecks(cfg, schemaName, tableName);
  if (cached !== null) return cached;

  const db = openDB(cfg);
  try {
    const row = db.prepare(SQLITE_GET_TABLE_SQL).get(tableName) as any;
    const result: CheckConstraintInfo[] = [];

    if (row?.sql) {
      const checkRegex = /CHECK\s*\(([^)]+)\)/gi;
      let match;
      let idx = 0;
      while ((match = checkRegex.exec(row.sql)) !== null) {
        result.push({
          constraint_name: `check_${tableName}_${idx++}`,
          table_schema: schemaName,
          table_name: tableName,
          definition: `CHECK(${match[1]})`,
        });
      }
    }

    sqliteCache.setChecks(cfg, schemaName, tableName, result);
    return result;
  } finally {
    db.close();
  }
}

/** Get database statistics */
export async function getDBStats(cfg: SQLiteConfig): Promise<DBStats> {
  const cached = sqliteCache.getDBStats(cfg);
  if (cached !== null) return cached;

  const db = openDB(cfg);
  try {
    // Count tables
    const tableCount = db.prepare(SQLITE_COUNT_TABLES).get() as any;
    const totalTables = Number(tableCount?.total_tables) || 0;

    // Get DB file size
    const pageCount = db.pragma("page_count", { simple: true }) as number;
    const pageSize = db.pragma("page_size", { simple: true }) as number;
    const totalSizeMB = (pageCount * pageSize) / (1024 * 1024);

    // Count total rows across all tables.
    // On large databases this can be very expensive and will block the event loop
    // because better-sqlite3 is synchronous. To keep stats fetching responsive,
    // only compute total_rows for databases up to a certain size.
    const MAX_DB_SIZE_MB_FOR_ROWCOUNT = 50;
    let totalRows = 0;
    if (totalSizeMB <= MAX_DB_SIZE_MB_FOR_ROWCOUNT) {
      const tables = db.prepare(SQLITE_LIST_TABLES).all() as any[];
      for (const t of tables) {
        try {
          const countRow = db
            .prepare(`SELECT COUNT(*) AS cnt FROM ${quoteIdent(t.name)}`)
            .get() as any;
          totalRows += Number(countRow?.cnt) || 0;
        } catch {
          // Skip tables that can't be counted
        }
      }
    }

    const result: DBStats = {
      total_tables: totalTables,
      total_db_size_mb: totalSizeMB,
      total_rows: totalRows,
    };

    sqliteCache.setDBStats(cfg, result);
    return result;
  } finally {
    db.close();
  }
}

/** List schemas (SQLite only has 'main' by default) */
export async function listSchemas(cfg: SQLiteConfig): Promise<SchemaInfo[]> {
  const cached = sqliteCache.getSchemas(cfg);
  if (cached !== null) return cached;

  const result: SchemaInfo[] = [{ name: 'main' }];
  sqliteCache.setSchemas(cfg, result);
  return result;
}

/** List schema names */
export async function listSchemaNames(cfg: SQLiteConfig): Promise<string[]> {
  return ['main'];
}

/** Get table column details */
export async function getTableDetails(cfg: SQLiteConfig, schemaName: string, tableName: string): Promise<ColumnDetail[]> {
  const cached = sqliteCache.getTableDetails(cfg, schemaName, tableName);
  if (cached !== null) return cached;

  const db = openDB(cfg);
  try {
    const columns = db.pragma(`table_xinfo(${quoteIdent(tableName)})`) as any[];
    const fks = db.pragma(`foreign_key_list(${quoteIdent(tableName)})`) as any[];
    const fkColumns = new Set(fks.map((fk: any) => fk.from));

    const result: ColumnDetail[] = columns
      .filter((col: any) => !col.hidden || col.hidden === 0)
      .map((col: any) => ({
        name: col.name,
        type: col.type || 'TEXT',
        not_nullable: col.notnull === 1,
        default_value: col.dflt_value,
        is_primary_key: col.pk > 0,
        is_foreign_key: fkColumns.has(col.name),
      }));

    sqliteCache.setTableDetails(cfg, schemaName, tableName, result);
    return result;
  } finally {
    db.close();
  }
}

/** Fetch all table metadata in batch for a schema */
export async function getSchemaMetadataBatch(
  cfg: SQLiteConfig,
  _schemaName: string
): Promise<SQLiteSchemaMetadataBatch> {
  const db = openDB(cfg);
  try {
    const tableRows = db.prepare(SQLITE_LIST_TABLES).all() as any[];
    const tables = new Map<string, {
      columns: ColumnDetail[];
      primaryKeys: PrimaryKeyInfo[];
      foreignKeys: ForeignKeyInfo[];
      indexes: IndexInfo[];
      uniqueConstraints: UniqueConstraintInfo[];
      checkConstraints: CheckConstraintInfo[];
    }>();

    for (const t of tableRows) {
      const tableName = t.name;

      // Columns
      const cols = db.pragma(`table_xinfo(${quoteIdent(tableName)})`) as any[];
      const fks = db.pragma(`foreign_key_list(${quoteIdent(tableName)})`) as any[];
      const fkColumns = new Set(fks.map((fk: any) => fk.from));

      const columns: ColumnDetail[] = cols
        .filter((col: any) => !col.hidden || col.hidden === 0)
        .map((col: any) => ({
          name: col.name,
          type: col.type || 'TEXT',
          not_nullable: col.notnull === 1,
          default_value: col.dflt_value,
          is_primary_key: col.pk > 0,
          is_foreign_key: fkColumns.has(col.name),
        }));

      const primaryKeys: PrimaryKeyInfo[] = cols
        .filter((col: any) => col.pk > 0)
        .map((col: any) => ({ column_name: col.name }));

      const foreignKeys: ForeignKeyInfo[] = fks.map((fk: any) => ({
        constraint_name: `fk_${tableName}_${fk.from}_${fk.id}`,
        source_schema: 'main',
        source_table: tableName,
        source_column: fk.from,
        target_schema: 'main',
        target_table: fk.table,
        target_column: fk.to,
        update_rule: fk.on_update || 'NO ACTION',
        delete_rule: fk.on_delete || 'NO ACTION',
        ordinal_position: fk.seq,
      }));

      // Indexes
      const idxList = db.pragma(`index_list(${quoteIdent(tableName)})`) as any[];
      const indexes: IndexInfo[] = [];
      const uniqueConstraints: UniqueConstraintInfo[] = [];

      for (const idx of idxList) {
        const idxCols = db.pragma(`index_info(${quoteIdent(idx.name)})`) as any[];
        for (const col of idxCols) {
          indexes.push({
            table_name: tableName,
            index_name: idx.name,
            column_name: col.name,
            is_unique: idx.unique === 1,
            is_primary: idx.origin === 'pk',
            index_type: 'btree',
            ordinal_position: col.seqno,
          });

          if (idx.unique === 1 && idx.origin !== 'pk') {
            uniqueConstraints.push({
              constraint_name: idx.name,
              table_schema: 'main',
              table_name: tableName,
              column_name: col.name,
              ordinal_position: col.seqno,
            });
          }
        }
      }

      // Check constraints
      const checkConstraints: CheckConstraintInfo[] = [];
      const tableRow = db.prepare(SQLITE_GET_TABLE_SQL).get(tableName) as any;
      if (tableRow?.sql) {
        const checkRegex = /CHECK\s*\(([^)]+)\)/gi;
        let match;
        let idx = 0;
        while ((match = checkRegex.exec(tableRow.sql)) !== null) {
          checkConstraints.push({
            constraint_name: `check_${tableName}_${idx++}`,
            table_schema: 'main',
            table_name: tableName,
            definition: `CHECK(${match[1]})`,
          });
        }
      }

      tables.set(tableName, {
        columns,
        primaryKeys,
        foreignKeys,
        indexes,
        uniqueConstraints,
        checkConstraints,
      });
    }

    return { tables };
  } finally {
    db.close();
  }
}

/**
 * Stream query results in batches.
 * SQLite is synchronous, so we simulate streaming by iterating.
 */
export function streamQueryCancelable(
  cfg: SQLiteConfig,
  sql: string,
  batchSize: number,
  onBatch: (rows: any[], columns: { name: string }[]) => Promise<void> | void,
  onDone?: () => void
): { promise: Promise<void>; cancel: () => Promise<void> } {
  let cancelled = false;

  const promise = (async () => {
    const db = openDB(cfg);
    try {
      const stmt = db.prepare(sql);
      const iter = stmt.iterate();
      let columns: { name: string }[] | null = null;
      let buffer: any[] = [];

      for (const row of iter) {
        if (cancelled) break;

        if (columns === null) {
          columns = Object.keys(row as object).map((k) => ({ name: k }));
        }
        buffer.push(row);

        if (buffer.length >= batchSize) {
          const rows = buffer.splice(0, buffer.length);
          await onBatch(rows, columns || []);
        }
      }

      // Flush remaining
      if (buffer.length > 0 && !cancelled) {
        await onBatch(buffer, columns || []);
      }

      if (onDone && !cancelled) onDone();
    } finally {
      db.close();
    }
  })();

  async function cancel() {
    cancelled = true;
  }

  return { promise, cancel };
}

/** Fetch paginated table data */
export async function fetchTableData(
  cfg: SQLiteConfig,
  _schemaName: string,
  tableName: string,
  limit: number,
  page: number
): Promise<{ rows: any[]; total: number }> {
  const db = openDB(cfg);
  try {
    const safeTable = quoteIdent(tableName);
    const offset = (page - 1) * limit;

    // Get primary keys for ordering
    const pkResult = await listPrimaryKeys(cfg, 'main', tableName);
    const pkColumns = pkResult.map((r) => quoteIdent(r.column_name));

    let orderBy = "";
    if (pkColumns.length > 0) {
      orderBy = `ORDER BY ${pkColumns.join(", ")}`;
    } else {
      orderBy = "ORDER BY rowid";
    }

    const countRow = db.prepare(`SELECT COUNT(*) AS count FROM ${safeTable}`).get() as any;
    const total = Number(countRow.count);

    const rows = db.prepare(`SELECT * FROM ${safeTable} ${orderBy} LIMIT ? OFFSET ?`).all(limit, offset);
    return { rows, total };
  } catch (error) {
    throw new Error(`Failed to fetch paginated data from ${tableName}: ${error}`);
  } finally {
    db.close();
  }
}

const SQLITE_TYPE_MAP: Record<string, string> = {
  INT: "INTEGER",
  BIGINT: "INTEGER",
  TEXT: "TEXT",
  BOOLEAN: "INTEGER",
  TIMESTAMP: "TEXT",
  JSON: "TEXT",
};

/** Create a table */
export async function createTable(
  cfg: SQLiteConfig,
  _schemaName: string,
  tableName: string,
  columns: ColumnDetail[],
  foreignKeys: ForeignKeyInfo[] = []
): Promise<boolean> {
  const db = openDB(cfg);
  try {
    const primaryKeys = columns
      .filter(c => c.is_primary_key)
      .map(c => quoteIdent(c.name));

    const columnDefs = columns.map(col => {
      const sqlType = SQLITE_TYPE_MAP[col.type] || col.type;
      const parts = [
        quoteIdent(col.name),
        sqlType,
        col.not_nullable || col.is_primary_key ? "NOT NULL" : "",
        col.default_value ? `DEFAULT ${col.default_value}` : ""
      ].filter(Boolean);
      return parts.join(" ");
    });

    if (primaryKeys.length > 0) {
      columnDefs.push(`PRIMARY KEY (${primaryKeys.join(", ")})`);
    }

    // Inline foreign keys in CREATE TABLE for SQLite
    for (const fk of foreignKeys) {
      columnDefs.push(
        `FOREIGN KEY (${quoteIdent(fk.source_column)}) REFERENCES ${quoteIdent(fk.target_table)}(${quoteIdent(fk.target_column)})` +
        (fk.delete_rule ? ` ON DELETE ${fk.delete_rule}` : '') +
        (fk.update_rule ? ` ON UPDATE ${fk.update_rule}` : '')
      );
    }

    const sql = `CREATE TABLE IF NOT EXISTS ${quoteIdent(tableName)} (\n  ${columnDefs.join(",\n  ")}\n);`;

    db.exec(sql);
    sqliteCache.clearForConnection(cfg);
    return true;
  } catch (err) {
    throw err;
  } finally {
    db.close();
  }
}

/** Create indexes */
export async function createIndexes(
  cfg: SQLiteConfig,
  _schemaName: string,
  indexes: IndexInfo[]
): Promise<boolean> {
  const db = openDB(cfg);
  try {
    // Group by index name
    const grouped = new Map<string, IndexInfo[]>();
    for (const idx of indexes) {
      if (!grouped.has(idx.index_name)) grouped.set(idx.index_name, []);
      grouped.get(idx.index_name)!.push(idx);
    }

    for (const [, group] of grouped) {
      const sorted = group.sort((a, b) => (a.ordinal_position || 0) - (b.ordinal_position || 0));
      const first = sorted[0];
      if (first.is_primary) continue;

      const cols = sorted.map(i => quoteIdent(i.column_name)).join(", ");
      const sql = `CREATE ${first.is_unique ? "UNIQUE" : ""} INDEX IF NOT EXISTS ${quoteIdent(first.index_name)} ON ${quoteIdent(first.table_name)} (${cols});`;
      db.exec(sql);
    }

    return true;
  } finally {
    db.close();
  }
}

/** Alter table (limited in SQLite: only ADD COLUMN, RENAME COLUMN supported natively) */
export async function alterTable(
  cfg: SQLiteConfig,
  _schemaName: string,
  tableName: string,
  operations: SQLiteAlterTableOperation[]
): Promise<boolean> {
  const db = openDB(cfg);
  try {
    const transaction = db.transaction(() => {
      for (const op of operations) {
        let sql = "";
        switch (op.type) {
          case "ADD_COLUMN": {
            const sqlType = SQLITE_TYPE_MAP[op.column.type] || op.column.type;
            sql = `ALTER TABLE ${quoteIdent(tableName)} ADD COLUMN ${quoteIdent(op.column.name)} ${sqlType}` +
              (op.column.not_nullable ? " NOT NULL" : "") +
              (op.column.default_value ? ` DEFAULT ${op.column.default_value}` : "") + ";";
            break;
          }
          case "DROP_COLUMN":
            sql = `ALTER TABLE ${quoteIdent(tableName)} DROP COLUMN ${quoteIdent(op.column_name)};`;
            break;
          case "RENAME_COLUMN":
            sql = `ALTER TABLE ${quoteIdent(tableName)} RENAME COLUMN ${quoteIdent(op.from)} TO ${quoteIdent(op.to)};`;
            break;
        }
        db.exec(sql);
      }
    });

    transaction();
    sqliteCache.clearForConnection(cfg);
    return true;
  } catch (err) {
    throw err;
  } finally {
    db.close();
  }
}

/** Drop a table */
export async function dropTable(
  cfg: SQLiteConfig,
  _schemaName: string,
  tableName: string,
  _mode: SQLiteDropMode = "RESTRICT"
): Promise<boolean> {
  const db = openDB(cfg);
  try {
    db.exec(`DROP TABLE IF EXISTS ${quoteIdent(tableName)};`);
    sqliteCache.clearForConnection(cfg);
    return true;
  } finally {
    db.close();
  }
}

/** Ensure migration table exists */
export async function ensureMigrationTable(cfg: SQLiteConfig): Promise<void> {
  const db = openDB(cfg);
  try {
    db.exec(SQLITE_CREATE_MIGRATION_TABLE);
  } finally {
    db.close();
  }
}

/** Check if any migrations exist */
export async function hasAnyMigrations(cfg: SQLiteConfig): Promise<boolean> {
  const db = openDB(cfg);
  try {
    // Check if table exists first
    const tableExists = db.prepare(
      `SELECT 1 FROM sqlite_master WHERE type='table' AND name='schema_migrations' LIMIT 1`
    ).get();
    if (!tableExists) return false;

    const row = db.prepare(SQLITE_CHECK_MIGRATIONS_EXIST).get();
    return !!row;
  } finally {
    db.close();
  }
}

/** Insert a baseline migration */
export async function insertBaseline(
  cfg: SQLiteConfig,
  version: string,
  name: string,
  checksum: string
): Promise<boolean> {
  const db = openDB(cfg);
  try {
    db.prepare(SQLITE_INSERT_MIGRATION).run(version, name, checksum);
    return true;
  } finally {
    db.close();
  }
}

/** Baseline if needed */
export async function baselineIfNeeded(
  cfg: SQLiteConfig,
  migrationsDir: string
) {
  await ensureMigrationTable(cfg);

  const hasMigrations = await hasAnyMigrations(cfg);
  if (hasMigrations) return { baselined: false };

  const version = Date.now().toString();
  const name = "baseline_existing_schema";

  const filePath = writeBaselineMigration(migrationsDir, version, name);

  const checksum = crypto
    .createHash("sha256")
    .update(fs.readFileSync(filePath))
    .digest("hex");

  await insertBaseline(cfg, version, name, checksum);

  return { baselined: true, version };
}

/** List applied migrations */
export async function listAppliedMigrations(cfg: SQLiteConfig): Promise<AppliedMigration[]> {
  const db = openDB(cfg);
  try {
    const tableExists = db.prepare(
      `SELECT 1 FROM sqlite_master WHERE type='table' AND name='schema_migrations' LIMIT 1`
    ).get();
    if (!tableExists) return [];

    const rows = db.prepare(SQLITE_LIST_APPLIED_MIGRATIONS).all() as AppliedMigration[];
    return rows;
  } finally {
    db.close();
  }
}

/** Connect to database (initialize and load schema) */
export async function connectToDatabase(
  cfg: SQLiteConfig,
  connectionId: string,
  options?: { readOnly?: boolean }
) {
  let baselineResult = { baselined: false };
  const migrationsDir = getMigrationsDir(connectionId);
  ensureDir(migrationsDir);

  if (!options?.readOnly) {
    baselineResult = await baselineIfNeeded(cfg, migrationsDir);
  }

  const schema = await listSchemas(cfg);
  const localMigrations = await loadLocalMigrations(migrationsDir);
  const appliedMigrations = await listAppliedMigrations(cfg);

  return {
    baselined: baselineResult.baselined,
    schema,
    migrations: {
      local: localMigrations,
      applied: appliedMigrations,
    },
  };
}

/** Apply a pending migration */
export async function applyMigration(
  cfg: SQLiteConfig,
  migrationFilePath: string
): Promise<boolean> {
  const db = openDB(cfg);
  try {
    const { readMigrationFile } = await import('../utils/migrationFileReader');
    const migration = readMigrationFile(migrationFilePath);

    const transaction = db.transaction(() => {
      db.exec(migration.upSQL);
      db.prepare(SQLITE_INSERT_MIGRATION).run(migration.version, migration.name, migration.checksum);
    });

    transaction();
    sqliteCache.clearForConnection(cfg);
    return true;
  } catch (error) {
    throw error;
  } finally {
    db.close();
  }
}

/** Rollback an applied migration */
export async function rollbackMigration(
  cfg: SQLiteConfig,
  version: string,
  migrationFilePath: string
): Promise<boolean> {
  const db = openDB(cfg);
  try {
    const { readMigrationFile } = await import('../utils/migrationFileReader');
    const migration = readMigrationFile(migrationFilePath);

    const transaction = db.transaction(() => {
      db.exec(migration.downSQL);
      db.prepare(SQLITE_DELETE_MIGRATION).run(version);
    });

    transaction();
    sqliteCache.clearForConnection(cfg);
    return true;
  } catch (error) {
    throw error;
  } finally {
    db.close();
  }
}

/** Insert a row into a table */
export async function insertRow(
  cfg: SQLiteConfig,
  _schemaName: string,
  tableName: string,
  rowData: Record<string, any>
): Promise<any> {
  const db = openDB(cfg);
  try {
    const columns = Object.keys(rowData);
    const values = Object.values(rowData);

    if (columns.length === 0) throw new Error("No data provided for insert");

    const safeTable = quoteIdent(tableName);
    const columnList = columns.map(col => quoteIdent(col)).join(", ");
    const placeholders = columns.map(() => "?").join(", ");

    const sql = `INSERT INTO ${safeTable} (${columnList}) VALUES (${placeholders});`;
    const info = db.prepare(sql).run(...values);

    // Return inserted row
    const lastId = info.lastInsertRowid;
    const inserted = db.prepare(`SELECT * FROM ${safeTable} WHERE rowid = ?`).get(lastId);

    sqliteCache.clearForConnection(cfg);
    return inserted;
  } catch (error) {
    throw new Error(`Failed to insert row into ${tableName}: ${error}`);
  } finally {
    db.close();
  }
}

/** Update a row in a table */
export async function updateRow(
  cfg: SQLiteConfig,
  _schemaName: string,
  tableName: string,
  primaryKeyColumn: string,
  primaryKeyValue: any,
  rowData: Record<string, any>
): Promise<any> {
  const db = openDB(cfg);
  try {
    const columns = Object.keys(rowData);
    const values = Object.values(rowData);

    if (columns.length === 0) throw new Error("No data provided for update");

    const safeTable = quoteIdent(tableName);
    const setClause = columns.map(col => `${quoteIdent(col)} = ?`).join(", ");

    if (!primaryKeyColumn || typeof primaryKeyColumn !== 'string') {
      throw new Error("Primary key column is required for update");
    }

    const sql = `UPDATE ${safeTable} SET ${setClause} WHERE ${quoteIdent(primaryKeyColumn)} = ?;`;
    db.prepare(sql).run(...values, primaryKeyValue);

    // Return updated row
    const updated = db.prepare(`SELECT * FROM ${safeTable} WHERE ${quoteIdent(primaryKeyColumn)} = ?`).get(primaryKeyValue);

    sqliteCache.clearForConnection(cfg);
    return updated;
  } catch (error) {
    throw new Error(`Failed to update row in ${tableName}: ${error}`);
  } finally {
    db.close();
  }
}

/** Delete a row from a table */
export async function deleteRow(
  cfg: SQLiteConfig,
  _schemaName: string,
  tableName: string,
  primaryKeyColumn: string,
  primaryKeyValue: any
): Promise<boolean> {
  const db = openDB(cfg);
  try {
    const safeTable = quoteIdent(tableName);

    let sql: string;
    let values: any[];

    if (primaryKeyColumn && typeof primaryKeyColumn === 'string') {
      sql = `DELETE FROM ${safeTable} WHERE ${quoteIdent(primaryKeyColumn)} = ?;`;
      values = [primaryKeyValue];
    } else if (typeof primaryKeyValue === 'object' && primaryKeyValue !== null) {
      const cols = Object.keys(primaryKeyValue);
      const whereClause = cols.map(col => `${quoteIdent(col)} = ?`).join(" AND ");
      sql = `DELETE FROM ${safeTable} WHERE ${whereClause};`;
      values = Object.values(primaryKeyValue);
    } else {
      throw new Error("Either primary key or where conditions required for delete");
    }

    const info = db.prepare(sql).run(...values);
    sqliteCache.clearForConnection(cfg);
    return info.changes > 0;
  } catch (error) {
    throw new Error(`Failed to delete row from ${tableName}: ${error}`);
  } finally {
    db.close();
  }
}

/** Search for rows in a table */
export async function searchTable(
  cfg: SQLiteConfig,
  _schemaName: string,
  tableName: string,
  searchTerm: string,
  column?: string,
  page: number = 1,
  pageSize: number = 50
): Promise<{ rows: any[]; total: number }> {
  const db = openDB(cfg);
  try {
    const safeTable = quoteIdent(tableName);
    const searchPattern = `%${searchTerm.replace(/[%_]/g, '\\$&')}%`;

    let whereClause: string;

    if (column) {
      whereClause = `${quoteIdent(column)} LIKE ? ESCAPE '\\'`;
    } else {
      const cols = db.pragma(`table_xinfo(${quoteIdent(tableName)})`) as any[];
      const columnNames = cols
        .filter((c: any) => !c.hidden || c.hidden === 0)
        .map((c: any) => c.name);

      if (columnNames.length === 0) return { rows: [], total: 0 };

      whereClause = columnNames
        .map(col => `CAST(${quoteIdent(col)} AS TEXT) LIKE ? ESCAPE '\\'`)
        .join(" OR ");
    }

    // For multi-column search, we reuse the same search pattern parameter
    // SQLite doesn't support named params the same way, but we can use
    // a single value repeated
    const paramCount = column ? 1 : (db.pragma(`table_xinfo(${quoteIdent(tableName)})`) as any[]).filter((c: any) => !c.hidden || c.hidden === 0).length;
    const params = Array(paramCount).fill(searchPattern);

    const countQuery = `SELECT COUNT(*) AS total FROM ${safeTable} WHERE ${whereClause}`;
    const countResult = db.prepare(countQuery).get(...params) as any;
    const total = Number(countResult?.total) || 0;

    const offset = (page - 1) * pageSize;
    const dataQuery = `SELECT * FROM ${safeTable} WHERE ${whereClause} LIMIT ? OFFSET ?`;
    const rows = db.prepare(dataQuery).all(...params, pageSize, offset);

    return { rows, total };
  } catch (error) {
    throw new Error(`Failed to search table ${tableName}: ${error}`);
  } finally {
    db.close();
  }
}
