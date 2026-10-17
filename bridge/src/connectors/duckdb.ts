import "../bootstrap";
import { DuckDBInstance, DuckDBConnection } from "@duckdb/node-api";
import fs from "fs";
import path from "path";
import crypto from "crypto";
import { SchemaFile } from "../services/projectStore";
import { LRUCache } from "../utils/lruCache";
import { CacheEntry, CACHE_TTL, STATS_CACHE_TTL, SCHEMA_CACHE_TTL } from "../types/cache";
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
import { DuckDBConfig, DuckDBSchemaMetadataBatch } from "../types/duckdb";

import {
  DUCKDB_LIST_SCHEMAS,
  DUCKDB_LIST_TABLES,
  DUCKDB_LIST_TABLES_BY_SCHEMA,
  DUCKDB_LIST_COLUMNS,
} from "../queries/duckdb/schema";
import {
  DUCKDB_LIST_PRIMARY_KEYS,
  DUCKDB_LIST_FOREIGN_KEYS,
  DUCKDB_LIST_INDEXES,
  DUCKDB_LIST_UNIQUE_CONSTRAINTS,
  DUCKDB_LIST_CHECK_CONSTRAINTS,
} from "../queries/duckdb/constraints";
import { DUCKDB_COUNT_TABLES, DUCKDB_DATABASE_SIZE } from "../queries/duckdb/stats";
import {
  DUCKDB_CREATE_MIGRATION_TABLE,
  DUCKDB_CHECK_MIGRATIONS_EXIST,
  DUCKDB_INSERT_MIGRATION,
  DUCKDB_LIST_APPLIED_MIGRATIONS,
  DUCKDB_DELETE_MIGRATION,
} from "../queries/duckdb/migrations";

export class DuckDBCacheManager {
  private tableListCache = new LRUCache<string, TableInfo[]>(100);
  private primaryKeysCache = new LRUCache<string, PrimaryKeyInfo[]>(1000);
  private dbStatsCache = new LRUCache<string, DBStats>(50);
  private schemasCache = new LRUCache<string, SchemaInfo[]>(50);
  private tableDetailsCache = new LRUCache<string, ColumnDetail[]>(1000);

  private getConfigKey(cfg: DuckDBConfig): string {
    return cfg.path;
  }
  private getTableKey(cfg: DuckDBConfig, schema: string, table: string): string {
    return `${cfg.path}:${schema}:${table}`;
  }
  private getSchemaKey(cfg: DuckDBConfig, schema: string): string {
    return `${cfg.path}:${schema}`;
  }

  private isValid<T>(entry: CacheEntry<T> | undefined): boolean {
    if (!entry) return false;
    return Date.now() - entry.timestamp < entry.ttl;
  }

  getTableList(cfg: DuckDBConfig, schema?: string): TableInfo[] | null {
    const entry = this.tableListCache.get(
      schema ? this.getSchemaKey(cfg, schema) : this.getConfigKey(cfg),
    );
    return this.isValid(entry) ? entry!.data : null;
  }
  setTableList(cfg: DuckDBConfig, data: TableInfo[], schema?: string): void {
    this.tableListCache.set(schema ? this.getSchemaKey(cfg, schema) : this.getConfigKey(cfg), {
      data,
      timestamp: Date.now(),
      ttl: CACHE_TTL,
    });
  }

  getPrimaryKeys(cfg: DuckDBConfig, schema: string, table: string): PrimaryKeyInfo[] | null {
    const entry = this.primaryKeysCache.get(this.getTableKey(cfg, schema, table));
    return this.isValid(entry) ? entry!.data : null;
  }
  setPrimaryKeys(cfg: DuckDBConfig, schema: string, table: string, data: PrimaryKeyInfo[]): void {
    this.primaryKeysCache.set(this.getTableKey(cfg, schema, table), {
      data,
      timestamp: Date.now(),
      ttl: CACHE_TTL,
    });
  }

  getDBStats(cfg: DuckDBConfig): DBStats | null {
    const entry = this.dbStatsCache.get(this.getConfigKey(cfg));
    return this.isValid(entry) ? entry!.data : null;
  }
  setDBStats(cfg: DuckDBConfig, data: DBStats): void {
    this.dbStatsCache.set(this.getConfigKey(cfg), {
      data,
      timestamp: Date.now(),
      ttl: STATS_CACHE_TTL,
    });
  }

  getSchemas(cfg: DuckDBConfig): SchemaInfo[] | null {
    const entry = this.schemasCache.get(this.getConfigKey(cfg));
    return this.isValid(entry) ? entry!.data : null;
  }
  setSchemas(cfg: DuckDBConfig, data: SchemaInfo[]): void {
    this.schemasCache.set(this.getConfigKey(cfg), {
      data,
      timestamp: Date.now(),
      ttl: SCHEMA_CACHE_TTL,
    });
  }

  getTableDetails(cfg: DuckDBConfig, schema: string, table: string): ColumnDetail[] | null {
    const entry = this.tableDetailsCache.get(this.getTableKey(cfg, schema, table));
    return this.isValid(entry) ? entry!.data : null;
  }
  setTableDetails(cfg: DuckDBConfig, schema: string, table: string, data: ColumnDetail[]): void {
    this.tableDetailsCache.set(this.getTableKey(cfg, schema, table), {
      data,
      timestamp: Date.now(),
      ttl: CACHE_TTL,
    });
  }

  clearForConnection(cfg: DuckDBConfig): void {
    const configKey = this.getConfigKey(cfg);
    for (const cache of [this.tableListCache, this.primaryKeysCache, this.tableDetailsCache]) {
      for (const [key] of cache) {
        if (key.startsWith(configKey)) cache.delete(key);
      }
    }
    this.dbStatsCache.delete(configKey);
    this.schemasCache.delete(configKey);
  }

  clearTableCache(cfg: DuckDBConfig, schema: string, table: string): void {
    const key = this.getTableKey(cfg, schema, table);
    this.primaryKeysCache.delete(key);
    this.tableDetailsCache.delete(key);
  }

  clearAll(): void {
    this.tableListCache.clear();
    this.primaryKeysCache.clear();
    this.dbStatsCache.clear();
    this.schemasCache.clear();
    this.tableDetailsCache.clear();
  }
}

export const duckdbCache = new DuckDBCacheManager();

// Database Helper
// Cache ONE instance + ONE connection per normalized path.
// Use DuckDBInstance.fromCache to avoid duplicate instance locking,
// and deduplicate concurrent in-flight openDB calls to prevent race conditions.
const instances = new Map<string, DuckDBInstance>();
const connections = new Map<string, DuckDBConnection>();
const openingPromises = new Map<
  string,
  Promise<{ instance: DuckDBInstance; conn: DuckDBConnection }>
>();

function normalizeDbPath(filePath: string): string {
  if (!filePath || filePath === ":memory:") return ":memory:";
  return path.resolve(filePath);
}

async function openDB(
  cfg: DuckDBConfig,
): Promise<{ instance: DuckDBInstance; conn: DuckDBConnection }> {
  const normalizedPath = normalizeDbPath(cfg.path);
  const cachedInstance = instances.get(normalizedPath);
  const cachedConn = connections.get(normalizedPath);
  if (cachedInstance && cachedConn) {
    return { instance: cachedInstance, conn: cachedConn };
  }

  // Deduplicate concurrent calls to openDB for the same path
  if (openingPromises.has(normalizedPath)) {
    return await openingPromises.get(normalizedPath)!;
  }

  const openPromise = (async () => {
    // Remove empty placeholder files so DuckDB can create a fresh DB.
    if (normalizedPath !== ":memory:" && fs.existsSync(normalizedPath)) {
      const stat = fs.statSync(normalizedPath);
      if (stat.size === 0) fs.unlinkSync(normalizedPath);
    }

    const instance = await DuckDBInstance.fromCache(normalizedPath, {
      access_mode: cfg.readonly ? "READ_ONLY" : "READ_WRITE",
    });

    const conn = await instance.connect();

    instances.set(normalizedPath, instance);
    connections.set(normalizedPath, conn);
    return { instance, conn };
  })();

  openingPromises.set(normalizedPath, openPromise);
  try {
    return await openPromise;
  } finally {
    openingPromises.delete(normalizedPath);
  }
}

/** Evict the cached connection/instance for a path (e.g. after unrecoverable error or closing). */
export async function closeDB(filePath: string): Promise<void> {
  const normalizedPath = normalizeDbPath(filePath);
  const conn = connections.get(normalizedPath);
  if (conn) {
    try {
      conn.closeSync();
    } catch {}
  }
  connections.delete(normalizedPath);
  instances.delete(normalizedPath);
  openingPromises.delete(normalizedPath);
}

async function runQuery<T = any>(cfg: DuckDBConfig, sql: string, ...args: any[]): Promise<T[]> {
  const { conn } = await openDB(cfg);
  try {
    const stmt = await conn.prepare(sql);
    if (args.length) {
      stmt.bind(args);
    }
    const result = await stmt.run();
    const rows = await result.getRowObjectsJson();
    return rows as T[];
  } finally {
    //
  }
}

async function runQueriesInTransaction(
  cfg: DuckDBConfig,
  queries: ((conn: DuckDBConnection) => Promise<any>)[],
): Promise<void> {
  const { conn } = await openDB(cfg);
  try {
    await conn.run("BEGIN TRANSACTION");
    for (const q of queries) {
      await q(conn);
    }
    await conn.run("COMMIT");
  } catch (err) {
    await conn.run("ROLLBACK");
    throw err;
  }
}

export async function testConnection(
  cfg: DuckDBConfig,
): Promise<{ ok: boolean; message?: string; status: "connected" | "disconnected" }> {
  try {
    if (cfg.path !== ":memory:" && !fs.existsSync(cfg.path) && cfg.readonly) {
      return {
        ok: false,
        status: "disconnected",
        message: `Database file does not exist: ${cfg.path}`,
      };
    }
    await runQuery(cfg, "SELECT 1;");
    return { ok: true, status: "connected", message: "Connection successful" };
  } catch (err: any) {
    return { ok: false, status: "disconnected", message: err.message || String(err) };
  }
}

export async function listTables(cfg: DuckDBConfig, schemaName?: string): Promise<TableInfo[]> {
  const cached = duckdbCache.getTableList(cfg, schemaName);
  if (cached) return cached;

  const rows = schemaName
    ? await runQuery<TableInfo>(cfg, DUCKDB_LIST_TABLES_BY_SCHEMA, schemaName)
    : await runQuery<TableInfo>(cfg, DUCKDB_LIST_TABLES);

  duckdbCache.setTableList(cfg, rows, schemaName);
  return rows;
}

export async function listPrimaryKeys(
  cfg: DuckDBConfig,
  schemaName: string,
  tableName: string,
): Promise<PrimaryKeyInfo[]> {
  const cached = duckdbCache.getPrimaryKeys(cfg, schemaName, tableName);
  if (cached) return cached;

  const rows = await runQuery<PrimaryKeyInfo>(cfg, DUCKDB_LIST_PRIMARY_KEYS, schemaName, tableName);
  duckdbCache.setPrimaryKeys(cfg, schemaName, tableName, rows);
  return rows;
}

export async function listForeignKeys(
  cfg: DuckDBConfig,
  schemaName: string,
  tableName: string,
): Promise<ForeignKeyInfo[]> {
  try {
    return await runQuery<ForeignKeyInfo>(cfg, DUCKDB_LIST_FOREIGN_KEYS, schemaName, tableName);
  } catch {
    // duckdb_constraints() not available on attached SQLite catalogs — return empty
    return [];
  }
}

export async function listIndexes(
  cfg: DuckDBConfig,
  schemaName: string,
  tableName: string,
): Promise<IndexInfo[]> {
  try {
    return await runQuery<IndexInfo>(cfg, DUCKDB_LIST_INDEXES, schemaName, tableName);
  } catch {
    return [];
  }
}

export async function listUniqueConstraints(
  cfg: DuckDBConfig,
  schemaName: string,
  tableName: string,
): Promise<UniqueConstraintInfo[]> {
  return await runQuery<UniqueConstraintInfo>(
    cfg,
    DUCKDB_LIST_UNIQUE_CONSTRAINTS,
    schemaName,
    tableName,
  );
}

export async function listCheckConstraints(
  cfg: DuckDBConfig,
  schemaName: string,
  tableName: string,
): Promise<CheckConstraintInfo[]> {
  try {
    return await runQuery<CheckConstraintInfo>(
      cfg,
      DUCKDB_LIST_CHECK_CONSTRAINTS,
      schemaName,
      tableName,
    );
  } catch {
    return [];
  }
}

export async function getDBStats(cfg: DuckDBConfig): Promise<DBStats> {
  const cached = duckdbCache.getDBStats(cfg);
  if (cached) return cached;

  const tableRows = await runQuery(cfg, DUCKDB_COUNT_TABLES);
  const totalTables = Number(tableRows[0]?.total_tables || 0);

  let totalDbSizeMb = 0;
  try {
    const sizeRows = await runQuery(cfg, DUCKDB_DATABASE_SIZE);
    const memoryUsage = Number(sizeRows[0]?.memory_usage || 0);
    totalDbSizeMb = memoryUsage / (1024 * 1024);
  } catch {
    // duckdb_memory_usage() may not be available in all contexts (e.g. attached SQLite)
  }

  const result = { total_tables: totalTables, total_rows: -1, total_db_size_mb: totalDbSizeMb };
  duckdbCache.setDBStats(cfg, result);
  return result;
}

export async function listSchemas(cfg: DuckDBConfig): Promise<SchemaInfo[]> {
  const cached = duckdbCache.getSchemas(cfg);
  if (cached) return cached;

  const rows = await runQuery<SchemaInfo>(cfg, DUCKDB_LIST_SCHEMAS);

  duckdbCache.setSchemas(cfg, rows);
  return rows;
}

export async function listSchemaNames(cfg: DuckDBConfig): Promise<string[]> {
  const schemas = await listSchemas(cfg);
  return schemas.map((s) => s.name);
}

export async function getTableDetails(
  cfg: DuckDBConfig,
  schemaName: string,
  tableName: string,
): Promise<ColumnDetail[]> {
  const cached = duckdbCache.getTableDetails(cfg, schemaName, tableName);
  if (cached) return cached;

  const rows = await runQuery<ColumnDetail>(cfg, DUCKDB_LIST_COLUMNS, schemaName, tableName);
  const pks = await listPrimaryKeys(cfg, schemaName, tableName);
  const pkSet = new Set(pks.map((p) => p.column_name));
  const res = rows.map((r) => ({ ...r, is_primary_key: pkSet.has(r.name), is_foreign_key: false }));
  duckdbCache.setTableDetails(cfg, schemaName, tableName, res);
  return res;
}

export async function getSchemaMetadataBatch(
  cfg: DuckDBConfig,
  schemaName: string,
): Promise<DuckDBSchemaMetadataBatch> {
  const tables = await listTables(cfg, schemaName);
  const batch = new Map();
  for (const t of tables) {
    const columns = await getTableDetails(cfg, schemaName, t.name);
    const primaryKeys = await listPrimaryKeys(cfg, schemaName, t.name);
    batch.set(t.name, {
      columns,
      primaryKeys,
      foreignKeys: [],
      indexes: [],
      uniqueConstraints: [],
      checkConstraints: [],
    });
  }
  return { tables: batch };
}

export function streamQueryCancelable(
  cfg: DuckDBConfig,
  sql: string,
  batchSize: number = 1000,
  onBatch: (rows: any[], columns: { name: string }[]) => Promise<void> | void,
  onDone?: () => void,
): { promise: Promise<void>; cancel: () => Promise<void> } {
  let cancelled = false;
  let activeConn: DuckDBConnection | null = null;

  const promise = (async () => {
    const { conn } = await openDB(cfg);
    activeConn = conn;
    const reader = await conn.run(sql);
    if (cancelled) return;

    const columnNames = reader.columnNames ? reader.columnNames() : [];
    const columns = columnNames.map((name: string) => ({ name }));

    const allRows = await reader.getRowObjectsJson();
    if (cancelled) return;

    for (let i = 0; i < allRows.length; i += batchSize) {
      if (cancelled) break;
      const batch = allRows.slice(i, i + batchSize);
      await onBatch(batch, columns);
    }

    if (!cancelled && onDone) {
      onDone();
    }
  })();

  async function cancel() {
    cancelled = true;
    if (activeConn) {
      try {
        activeConn.interrupt();
      } catch {}
    }
  }

  return { promise, cancel };
}

export async function fetchTableData(
  cfg: DuckDBConfig,
  schemaName: string,
  tableName: string,
  limit: number = 50,
  page: number = 1,
): Promise<{ rows: any[]; total: number }> {
  const safeSchema = `"${(schemaName || "main").replace(/"/g, '""')}"`;
  const safeTable = `"${tableName.replace(/"/g, '""')}"`;
  const offset = Math.max(0, ((page || 1) - 1) * limit);

  let total = 0;
  try {
    const countResult = await runQuery<{ count: number }>(
      cfg,
      `SELECT COUNT(*)::INT as count FROM ${safeSchema}.${safeTable}`,
    );
    total = Number(countResult[0]?.count || 0);
  } catch {
    // If count query fails, fallback
  }

  const rows = await runQuery(
    cfg,
    `SELECT * FROM ${safeSchema}.${safeTable} LIMIT ? OFFSET ?`,
    limit,
    offset,
  );

  return { rows, total: total || rows.length };
}

export async function createTable(
  cfg: DuckDBConfig,
  schemaName: string,
  tableName: string,
  columns: any[],
  foreignKeys: any[] = [],
): Promise<void> {
  const safeSchema = `"${(schemaName || "main").replace(/"/g, '""')}"`;
  const safeTable = `"${tableName.replace(/"/g, '""')}"`;

  const colDefs = columns.map((c) => {
    let def = `"${c.name.replace(/"/g, '""')}" ${c.type}`;
    if (c.is_primary_key) def += " PRIMARY KEY";
    if (c.not_nullable) def += " NOT NULL";
    if (
      c.default_value !== undefined &&
      c.default_value !== null &&
      String(c.default_value).trim() !== ""
    ) {
      def += ` DEFAULT ${c.default_value}`;
    }
    return def;
  });

  const fkDefs = (foreignKeys || []).map((fk: any) => {
    const onDelete = fk.on_delete || "NO ACTION";
    const onUpdate = fk.on_update || "NO ACTION";
    const constraintName = fk.constraint_name || `fk_${tableName}_${fk.source_column}`;
    const targetSchema = fk.target_schema ? `"${fk.target_schema.replace(/"/g, '""')}".` : "";
    return `CONSTRAINT "${constraintName.replace(/"/g, '""')}" FOREIGN KEY ("${fk.source_column.replace(/"/g, '""')}") REFERENCES ${targetSchema}"${fk.target_table.replace(/"/g, '""')}"("${fk.target_column.replace(/"/g, '""')}") ON DELETE ${onDelete} ON UPDATE ${onUpdate}`;
  });

  const allDefs = [...colDefs, ...fkDefs].join(", ");
  await runQuery(cfg, `CREATE TABLE ${safeSchema}.${safeTable} (${allDefs});`);
  duckdbCache.clearForConnection(cfg);
}

export async function createIndexes(
  cfg: DuckDBConfig,
  schemaName: string,
  indexes: IndexInfo[],
): Promise<boolean> {
  if (!indexes || indexes.length === 0) return true;
  const safeSchema = `"${(schemaName || "main").replace(/"/g, '""')}"`;

  const grouped = new Map<string, IndexInfo[]>();
  for (const idx of indexes) {
    if (!grouped.has(idx.index_name)) grouped.set(idx.index_name, []);
    grouped.get(idx.index_name)!.push(idx);
  }

  for (const [, group] of grouped) {
    const sorted = group.sort((a, b) => (a.ordinal_position || 0) - (b.ordinal_position || 0));
    const first = sorted[0];
    if (first.is_primary) continue;
    const cols = sorted.map((i) => `"${i.column_name.replace(/"/g, '""')}"`).join(", ");
    const sql = `CREATE ${first.is_unique ? "UNIQUE " : ""}INDEX IF NOT EXISTS "${first.index_name.replace(/"/g, '""')}" ON ${safeSchema}."${first.table_name.replace(/"/g, '""')}" (${cols});`;
    await runQuery(cfg, sql);
  }

  duckdbCache.clearForConnection(cfg);
  return true;
}

export async function alterTable(
  cfg: DuckDBConfig,
  schemaName: string,
  tableName: string,
  operations: any[],
): Promise<boolean> {
  const safeSchema = `"${(schemaName || "main").replace(/"/g, '""')}"`;
  const safeTable = `"${tableName.replace(/"/g, '""')}"`;

  for (const op of operations) {
    let sql = "";
    switch (op.type) {
      case "ADD_COLUMN": {
        const defaultClause =
          op.column.default_value !== undefined &&
          op.column.default_value !== null &&
          String(op.column.default_value).trim() !== ""
            ? ` DEFAULT ${op.column.default_value}`
            : "";
        sql = `ALTER TABLE ${safeSchema}.${safeTable} ADD COLUMN "${op.column.name.replace(/"/g, '""')}" ${op.column.type}${defaultClause};`;
        await runQuery(cfg, sql);
        if (op.column.not_nullable) {
          await runQuery(
            cfg,
            `ALTER TABLE ${safeSchema}.${safeTable} ALTER COLUMN "${op.column.name.replace(/"/g, '""')}" SET NOT NULL;`,
          );
        }
        sql = "";
        break;
      }
      case "DROP_COLUMN": {
        sql = `ALTER TABLE ${safeSchema}.${safeTable} DROP COLUMN "${op.column_name.replace(/"/g, '""')}";`;
        break;
      }
      case "RENAME_COLUMN": {
        sql = `ALTER TABLE ${safeSchema}.${safeTable} RENAME COLUMN "${op.from.replace(/"/g, '""')}" TO "${op.to.replace(/"/g, '""')}";`;
        break;
      }
      case "ALTER_TYPE": {
        sql = `ALTER TABLE ${safeSchema}.${safeTable} ALTER COLUMN "${op.column_name.replace(/"/g, '""')}" SET DATA TYPE ${op.new_type};`;
        break;
      }
      case "SET_DEFAULT": {
        sql = `ALTER TABLE ${safeSchema}.${safeTable} ALTER COLUMN "${op.column_name.replace(/"/g, '""')}" SET DEFAULT ${op.default_value};`;
        break;
      }
      case "DROP_DEFAULT": {
        sql = `ALTER TABLE ${safeSchema}.${safeTable} ALTER COLUMN "${op.column_name.replace(/"/g, '""')}" DROP DEFAULT;`;
        break;
      }
      case "SET_NOT_NULL": {
        sql = `ALTER TABLE ${safeSchema}.${safeTable} ALTER COLUMN "${op.column_name.replace(/"/g, '""')}" SET NOT NULL;`;
        break;
      }
      case "DROP_NOT_NULL": {
        sql = `ALTER TABLE ${safeSchema}.${safeTable} ALTER COLUMN "${op.column_name.replace(/"/g, '""')}" DROP NOT NULL;`;
        break;
      }
      default:
        continue;
    }
    if (sql) {
      await runQuery(cfg, sql);
    }
  }

  duckdbCache.clearTableCache(cfg, schemaName, tableName);
  return true;
}

export async function dropTable(
  cfg: DuckDBConfig,
  schemaName: string,
  tableName: string,
  dropMode?: string,
): Promise<boolean> {
  const safeSchema = `"${(schemaName || "main").replace(/"/g, '""')}"`;
  const safeTable = `"${tableName.replace(/"/g, '""')}"`;
  const cascadeClause = dropMode === "CASCADE" ? " CASCADE" : "";
  await runQuery(cfg, `DROP TABLE ${safeSchema}.${safeTable}${cascadeClause};`);
  duckdbCache.clearForConnection(cfg);
  return true;
}

export async function ensureMigrationTable(cfg: DuckDBConfig): Promise<void> {
  await runQuery(cfg, DUCKDB_CREATE_MIGRATION_TABLE);
}

export async function hasAnyMigrations(cfg: DuckDBConfig): Promise<boolean> {
  try {
    const res = await runQuery(cfg, DUCKDB_CHECK_MIGRATIONS_EXIST);
    return res.length > 0;
  } catch (err: any) {
    const msg = String(err?.message || err);
    if (msg.includes("schema_migrations") && msg.includes("does not exist")) {
      return false;
    }
    throw err;
  }
}

export async function insertBaseline(
  cfg: DuckDBConfig,
  version: string,
  name: string,
  checksum: string,
): Promise<void> {
  await ensureMigrationTable(cfg);
  await runQuery(cfg, DUCKDB_INSERT_MIGRATION, version, name, checksum);
}

export async function baselineIfNeeded(
  cfg: DuckDBConfig,
  migrationsDir: string,
  snapshot?: SchemaFile,
): Promise<{ baselined: boolean; version?: string }> {
  await ensureMigrationTable(cfg);
  const hasMigrations = await hasAnyMigrations(cfg);
  if (hasMigrations) return { baselined: false };

  const version = Date.now().toString();
  const name = "baseline_existing_schema";

  const fakeSnapshot = snapshot || {
    version: 2,
    projectId: "",
    databaseId: "",
    dialect: "duckdb",
    schemas: [],
    cachedAt: "",
    relwaveVersion: "",
    schemaHash: "",
  };

  const { writeBaselineMigration } = await import("../utils/baselineMigration");
  const filePath = writeBaselineMigration(migrationsDir, version, name, fakeSnapshot as any);
  const checksum = crypto.createHash("sha256").update(fs.readFileSync(filePath)).digest("hex");

  await insertBaseline(cfg, version, name, checksum);
  return { baselined: true, version };
}

export async function listAppliedMigrations(cfg: DuckDBConfig): Promise<AppliedMigration[]> {
  try {
    return await runQuery<AppliedMigration>(cfg, DUCKDB_LIST_APPLIED_MIGRATIONS);
  } catch (err: any) {
    const msg = String(err?.message || err);
    if (msg.includes("schema_migrations") && msg.includes("does not exist")) {
      return [];
    }
    throw err;
  }
}

export async function connectToDatabase(
  cfg: DuckDBConfig,
  connectionId: string,
  options?: { readOnly?: boolean },
) {
  let baselineResult = { baselined: false };
  const { projectStoreInstance } = await import("../services/projectStore");
  const { loadLocalMigrations } = await import("../utils/baselineMigration");
  const migrationsDir = await projectStoreInstance.resolveMigrationsDir(connectionId);
  if (!fs.existsSync(migrationsDir)) {
    fs.mkdirSync(migrationsDir, { recursive: true });
  }

  if (!options?.readOnly) {
    let snapshot: any = undefined;
    try {
      const project = await projectStoreInstance.getProjectByDatabaseId(connectionId);
      if (project) {
        snapshot = (await projectStoreInstance.getSchema(project.id)) || undefined;
      }
    } catch {}
    baselineResult = await baselineIfNeeded(cfg, migrationsDir, snapshot);
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

export async function applyMigration(cfg: DuckDBConfig, migrationFilePath: string): Promise<void> {
  await ensureMigrationTable(cfg);
  const { readMigrationFile } = await import("../utils/migrationFileReader");
  const migration = readMigrationFile(migrationFilePath);

  await runQueriesInTransaction(cfg, [
    async (conn) => {
      const extracted = await conn.extractStatements(migration.upSQL);
      for (let i = 0; i < extracted.count; i++) {
        const stmt = await extracted.prepare(i);
        await stmt.run();
      }
    },
    async (conn) => {
      const stmt = await conn.prepare(DUCKDB_INSERT_MIGRATION);
      stmt.bind([migration.version, migration.name, migration.checksum]);
      await stmt.run();
    },
  ]);
  duckdbCache.clearForConnection(cfg);
}

export async function rollbackMigration(
  cfg: DuckDBConfig,
  version: string,
  migrationFilePath: string,
): Promise<void> {
  await ensureMigrationTable(cfg);
  const { readMigrationFile } = await import("../utils/migrationFileReader");
  const migration = readMigrationFile(migrationFilePath);

  await runQueriesInTransaction(cfg, [
    async (conn) => {
      const extracted = await conn.extractStatements(migration.downSQL);
      for (let i = 0; i < extracted.count; i++) {
        const stmt = await extracted.prepare(i);
        await stmt.run();
      }
    },
    async (conn) => {
      const stmt = await conn.prepare(DUCKDB_DELETE_MIGRATION);
      stmt.bind([version]);
      await stmt.run();
    },
  ]);
  duckdbCache.clearForConnection(cfg);
}

export async function insertRow(
  cfg: DuckDBConfig,
  schemaName: string,
  tableName: string,
  data: Record<string, any>,
): Promise<any> {
  const cols = Object.keys(data)
    .map((k) => `"${k}"`)
    .join(", ");
  const vals = Object.values(data);
  const placeholders = vals.map(() => "?").join(", ");
  await runQuery(
    cfg,
    `INSERT INTO "${schemaName}"."${tableName}" (${cols}) VALUES (${placeholders})`,
    ...vals,
  );
  return data;
}

export async function updateRow(
  cfg: DuckDBConfig,
  schemaName: string,
  tableName: string,
  primaryKeyColumn: string | Record<string, any>,
  primaryKeyValue: any,
  rowData?: Record<string, any>,
): Promise<any> {
  const safeSchema = `"${(schemaName || "main").replace(/"/g, '""')}"`;
  const safeTable = `"${tableName.replace(/"/g, '""')}"`;

  let updates: Record<string, any>;
  let pks: Record<string, any>;

  if (typeof primaryKeyColumn === "object" && primaryKeyColumn !== null && rowData === undefined) {
    pks = primaryKeyColumn;
    updates = primaryKeyValue || {};
  } else {
    updates = rowData || {};
    if (typeof primaryKeyColumn === "string" && primaryKeyColumn) {
      pks = { [primaryKeyColumn]: primaryKeyValue };
    } else if (typeof primaryKeyValue === "object" && primaryKeyValue !== null) {
      pks = primaryKeyValue;
    } else {
      throw new Error("Primary key is required for update");
    }
  }

  const updateCols = Object.keys(updates);
  if (updateCols.length === 0) throw new Error("No data provided for update");

  const pkCols = Object.keys(pks);
  if (pkCols.length === 0) throw new Error("Primary key condition required for update");

  const updateSql = updateCols.map((k) => `"${k.replace(/"/g, '""')}" = ?`).join(", ");
  const whereSql = pkCols.map((k) => `"${k.replace(/"/g, '""')}" = ?`).join(" AND ");

  await runQuery(
    cfg,
    `UPDATE ${safeSchema}.${safeTable} SET ${updateSql} WHERE ${whereSql}`,
    ...Object.values(updates),
    ...Object.values(pks),
  );

  duckdbCache.clearTableCache(cfg, schemaName, tableName);

  const fetchUpdated = await runQuery(
    cfg,
    `SELECT * FROM ${safeSchema}.${safeTable} WHERE ${whereSql} LIMIT 1`,
    ...Object.values(pks),
  );
  return fetchUpdated[0] || { ...pks, ...updates };
}

export async function deleteRow(
  cfg: DuckDBConfig,
  schemaName: string,
  tableName: string,
  primaryKeyColumn: string | Record<string, any>,
  primaryKeyValue?: any,
): Promise<boolean> {
  const safeSchema = `"${(schemaName || "main").replace(/"/g, '""')}"`;
  const safeTable = `"${tableName.replace(/"/g, '""')}"`;

  let pks: Record<string, any>;
  if (typeof primaryKeyColumn === "object" && primaryKeyColumn !== null) {
    pks = primaryKeyColumn;
  } else if (typeof primaryKeyColumn === "string" && primaryKeyColumn) {
    pks = { [primaryKeyColumn]: primaryKeyValue };
  } else if (typeof primaryKeyValue === "object" && primaryKeyValue !== null) {
    pks = primaryKeyValue;
  } else {
    throw new Error("Either primaryKeyColumn or composite key object is required for delete");
  }

  const pkCols = Object.keys(pks);
  if (pkCols.length === 0) throw new Error("Primary key condition required for delete");

  const whereSql = pkCols.map((k) => `"${k.replace(/"/g, '""')}" = ?`).join(" AND ");
  await runQuery(
    cfg,
    `DELETE FROM ${safeSchema}.${safeTable} WHERE ${whereSql}`,
    ...Object.values(pks),
  );

  duckdbCache.clearTableCache(cfg, schemaName, tableName);
  return true;
}

export async function searchTable(
  cfg: DuckDBConfig,
  schemaName: string,
  tableName: string,
  searchTerm: string,
  column?: string,
  page: number = 1,
  pageSize: number = 50,
): Promise<{ rows: any[]; total: number }> {
  const safeSchema = `"${(schemaName || "main").replace(/"/g, '""')}"`;
  const safeTable = `"${tableName.replace(/"/g, '""')}"`;
  const offset = Math.max(0, ((page || 1) - 1) * pageSize);

  let whereClause = "";
  let args: any[] = [];

  if (column) {
    whereClause = `CAST("${column.replace(/"/g, '""')}" AS VARCHAR) ILIKE ?`;
    args.push(`%${searchTerm}%`);
  } else {
    const cols = await getTableDetails(cfg, schemaName, tableName);
    if (cols.length === 0) return { rows: [], total: 0 };
    whereClause = cols
      .map((c) => `CAST("${c.name.replace(/"/g, '""')}" AS VARCHAR) ILIKE ?`)
      .join(" OR ");
    args = cols.map(() => `%${searchTerm}%`);
  }

  let total = 0;
  try {
    const countRows = await runQuery<{ count: number }>(
      cfg,
      `SELECT COUNT(*)::INT as count FROM ${safeSchema}.${safeTable} WHERE ${whereClause}`,
      ...args,
    );
    total = Number(countRows[0]?.count || 0);
  } catch {}

  const rows = await runQuery(
    cfg,
    `SELECT * FROM ${safeSchema}.${safeTable} WHERE ${whereClause} LIMIT ? OFFSET ?`,
    ...args,
    pageSize,
    offset,
  );

  return { rows, total: total || rows.length };
}
