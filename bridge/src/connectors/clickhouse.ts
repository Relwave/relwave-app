import { createClient, type ClickHouseClient } from "@clickhouse/client";
import { ClickHouseConfig, ClickHouseSchemaMetadataBatch } from "../types/clickhouse";
export type { ClickHouseConfig, ClickHouseSchemaMetadataBatch };
import {
  TableInfo,
  PrimaryKeyInfo,
  ForeignKeyInfo,
  IndexInfo,
  UniqueConstraintInfo,
  CheckConstraintInfo,
  ColumnDetail,
  DBStats,
  SchemaInfo,
  AppliedMigration,
} from "../types/common";
import { CacheEntry } from "../types/cache";
import { SchemaFile } from "../services/projectStore";
import crypto from "crypto";
import fs from "fs";

import {
  CLICKHOUSE_LIST_SCHEMAS,
  CLICKHOUSE_LIST_TABLES,
  CLICKHOUSE_LIST_TABLES_BY_SCHEMA,
  CLICKHOUSE_LIST_COLUMNS,
  CLICKHOUSE_BATCH_LIST_COLUMNS,
} from "../queries/clickhouse/schema";
import {
  CLICKHOUSE_GET_PRIMARY_KEYS,
  CLICKHOUSE_BATCH_GET_PRIMARY_KEYS,
  CLICKHOUSE_GET_INDEXES,
  CLICKHOUSE_BATCH_GET_INDEXES,
} from "../queries/clickhouse/constraints";
import { CLICKHOUSE_GET_DB_STATS, CLICKHOUSE_GET_DB_SIZE } from "../queries/clickhouse/stats";
import { cleanClickHouseUrl } from "../utils/clickhouseUrl";
import logger from "../services/logger";

export function resolveClickHouseUrl(cfg: ClickHouseConfig): string {
  if (cfg.url && cfg.url.trim()) {
    return cleanClickHouseUrl(cfg.url);
  }
  if (cfg.host && (cfg.host.startsWith("http://") || cfg.host.startsWith("https://"))) {
    return cleanClickHouseUrl(cfg.host);
  }
  const isSsl = cfg.ssl || cfg.port === 8443 || cfg.port === 443;
  const protocol = isSsl ? "https" : "http";
  const port = cfg.port || (isSsl ? 8443 : 8123);
  return `${protocol}://${cfg.host || "localhost"}:${port}`;
}

// ============================================
// CACHING SYSTEM FOR CLICKHOUSE CONNECTOR
// ============================================

const CACHE_TTL = 30_000;
const STATS_CACHE_TTL = 10_000;
const SCHEMA_CACHE_TTL = 60_000;

class ClickHouseCacheManager {
  private tableListCache = new Map<string, CacheEntry<TableInfo[]>>();
  private primaryKeysCache = new Map<string, CacheEntry<PrimaryKeyInfo[]>>();
  private dbStatsCache = new Map<string, CacheEntry<DBStats>>();
  private schemasCache = new Map<string, CacheEntry<SchemaInfo[]>>();
  private tableDetailsCache = new Map<string, CacheEntry<ColumnDetail[]>>();

  private getConfigKey(cfg: ClickHouseConfig): string {
    const url = resolveClickHouseUrl(cfg);
    return `${url}:${cfg.user || "default"}:${cfg.database || "default"}`;
  }

  private getTableKey(cfg: ClickHouseConfig, schema: string, table: string): string {
    return `${this.getConfigKey(cfg)}:${schema}:${table}`;
  }

  private isValid<T>(entry: CacheEntry<T> | undefined): boolean {
    if (!entry) return false;
    return Date.now() - entry.timestamp < entry.ttl;
  }

  getTableList(cfg: ClickHouseConfig, schema?: string): TableInfo[] | null {
    const key = `${this.getConfigKey(cfg)}:${schema || "all"}`;
    const entry = this.tableListCache.get(key);
    return this.isValid(entry) ? entry!.data : null;
  }
  setTableList(cfg: ClickHouseConfig, data: TableInfo[], schema?: string): void {
    const key = `${this.getConfigKey(cfg)}:${schema || "all"}`;
    this.tableListCache.set(key, { data, timestamp: Date.now(), ttl: CACHE_TTL });
  }

  getPrimaryKeys(cfg: ClickHouseConfig, schema: string, table: string): PrimaryKeyInfo[] | null {
    const entry = this.primaryKeysCache.get(this.getTableKey(cfg, schema, table));
    return this.isValid(entry) ? entry!.data : null;
  }
  setPrimaryKeys(
    cfg: ClickHouseConfig,
    schema: string,
    table: string,
    data: PrimaryKeyInfo[],
  ): void {
    this.primaryKeysCache.set(this.getTableKey(cfg, schema, table), {
      data,
      timestamp: Date.now(),
      ttl: CACHE_TTL,
    });
  }

  getDBStats(cfg: ClickHouseConfig): DBStats | null {
    const entry = this.dbStatsCache.get(this.getConfigKey(cfg));
    return this.isValid(entry) ? entry!.data : null;
  }
  setDBStats(cfg: ClickHouseConfig, data: DBStats): void {
    this.dbStatsCache.set(this.getConfigKey(cfg), {
      data,
      timestamp: Date.now(),
      ttl: STATS_CACHE_TTL,
    });
  }

  getSchemas(cfg: ClickHouseConfig): SchemaInfo[] | null {
    const entry = this.schemasCache.get(this.getConfigKey(cfg));
    return this.isValid(entry) ? entry!.data : null;
  }
  setSchemas(cfg: ClickHouseConfig, data: SchemaInfo[]): void {
    this.schemasCache.set(this.getConfigKey(cfg), {
      data,
      timestamp: Date.now(),
      ttl: SCHEMA_CACHE_TTL,
    });
  }

  getTableDetails(cfg: ClickHouseConfig, schema: string, table: string): ColumnDetail[] | null {
    const entry = this.tableDetailsCache.get(this.getTableKey(cfg, schema, table));
    return this.isValid(entry) ? entry!.data : null;
  }
  setTableDetails(
    cfg: ClickHouseConfig,
    schema: string,
    table: string,
    data: ColumnDetail[],
  ): void {
    this.tableDetailsCache.set(this.getTableKey(cfg, schema, table), {
      data,
      timestamp: Date.now(),
      ttl: CACHE_TTL,
    });
  }

  clearForConnection(cfg: ClickHouseConfig): void {
    const configKey = this.getConfigKey(cfg);
    for (const cache of [this.tableListCache, this.primaryKeysCache, this.tableDetailsCache]) {
      for (const [key] of cache) {
        if (key.startsWith(configKey)) cache.delete(key);
      }
    }
    this.dbStatsCache.delete(configKey);
    this.schemasCache.delete(configKey);
  }

  clearTableCache(cfg: ClickHouseConfig, schema: string, table: string): void {
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

export const clickhouseCache = new ClickHouseCacheManager();

// ============================================
// CLIENT CONNECTION POOL
// ============================================

const clientPool = new Map<string, ClickHouseClient>();

function getClientKey(cfg: ClickHouseConfig): string {
  const url = resolveClickHouseUrl(cfg);
  return `${url}:${cfg.user || "default"}:${cfg.database || "default"}`;
}

export function getClient(cfg: ClickHouseConfig): ClickHouseClient {
  const key = getClientKey(cfg);
  let client = clientPool.get(key);
  if (!client) {
    const url = resolveClickHouseUrl(cfg);

    client = createClient({
      url,
      username: cfg.user || "default",
      password: cfg.password || "",
      database: cfg.database || "default",
      request_timeout: 30_000,
      clickhouse_settings: {
        wait_end_of_query: 1,
      },
    });

    clientPool.set(key, client);
  }
  return client;
}

export async function closeClient(cfg: ClickHouseConfig): Promise<void> {
  const key = getClientKey(cfg);
  const client = clientPool.get(key);
  if (client) {
    try {
      await client.close();
    } catch {
      // ignore
    }
    clientPool.delete(key);
  }
}

export async function closeAllClients(): Promise<void> {
  for (const [key, client] of clientPool.entries()) {
    try {
      await client.close();
    } catch {
      // ignore
    }
    clientPool.delete(key);
  }
}

function formatValue(val: any): string {
  if (val === null || val === undefined) return "NULL";
  if (typeof val === "number" || typeof val === "boolean") return String(val);
  if (val instanceof Date) return `'${val.toISOString().replace("T", " ").replace("Z", "")}'`;
  return `'${String(val).replace(/'/g, "\\'")}'`;
}

// ============================================
// CORE CONNECTOR OPERATIONS
// ============================================

export async function testConnection(
  cfg: ClickHouseConfig,
): Promise<{ ok: boolean; message?: string; status: "connected" | "disconnected" }> {
  const url = resolveClickHouseUrl(cfg);

  const tempClient = createClient({
    url,
    username: cfg.user || "default",
    password: cfg.password || "",
    database: cfg.database || "default",
    request_timeout: 30_000,
  });

  try {
    const pingResult = await tempClient.ping();
    if (!pingResult.success) {
      const errMsg = (pingResult as { error?: Error }).error?.message || "Ping failed";
      return {
        ok: false,
        status: "disconnected",
        message: errMsg,
      };
    }

    // Ping verifies server is reachable; now verify credentials & permissions
    await tempClient.query({
      query: "SELECT 1",
      format: "JSONEachRow",
    });

    return { ok: true, status: "connected", message: "Connection successful" };
  } catch (err: any) {
    return {
      ok: false,
      status: "disconnected",
      message: (err as Error).message || "Connection failed",
    };
  } finally {
    try {
      await tempClient.close();
    } catch {}
  }
}

export async function listTables(cfg: ClickHouseConfig, schemaName?: string): Promise<TableInfo[]> {
  const cached = clickhouseCache.getTableList(cfg, schemaName);
  if (cached) return cached;

  const client = getClient(cfg);
  const query = schemaName ? CLICKHOUSE_LIST_TABLES_BY_SCHEMA : CLICKHOUSE_LIST_TABLES;
  const query_params = schemaName ? { target_schema: schemaName, schema: schemaName } : undefined;

  const res = await client.query({
    query,
    query_params,
    format: "JSONEachRow",
  });
  const data = (await res.json()) as any[];

  const tables: TableInfo[] = data.map((row) => ({
    schema: row.schema,
    name: row.name,
    type: row.type || "BASE TABLE",
  }));

  clickhouseCache.setTableList(cfg, tables, schemaName);
  return tables;
}

export async function listPrimaryKeys(
  cfg: ClickHouseConfig,
  schemaNameOrTable: string,
  tableNameOrSchema?: string,
): Promise<PrimaryKeyInfo[]> {
  let schema = cfg.database || "default";
  let table = schemaNameOrTable;

  if (tableNameOrSchema) {
    schema = schemaNameOrTable || cfg.database || "default";
    table = tableNameOrSchema;
  }

  const cached = clickhouseCache.getPrimaryKeys(cfg, schema, table);
  if (cached) return cached;

  const client = getClient(cfg);
  const res = await client.query({
    query: CLICKHOUSE_GET_PRIMARY_KEYS,
    query_params: {
      target_schema: schema,
      target_table: table,
      schema,
      table,
    },
    format: "JSONEachRow",
  });
  const data = (await res.json()) as any[];

  let pks: PrimaryKeyInfo[] = data.map((r) => ({
    column_name: r.column_name,
  }));

  // If no primary key or sorting key is defined, fall back to the first column
  if (pks.length === 0) {
    try {
      const cols = await getTableDetails(cfg, schema, table);
      if (cols.length > 0) {
        pks = [{ column_name: cols[0].name }];
      }
    } catch {}
  }

  clickhouseCache.setPrimaryKeys(cfg, schema, table, pks);
  return pks;
}

export async function listForeignKeys(
  _cfg: ClickHouseConfig,
  _schemaNameOrTable: string,
  _tableNameOrSchema?: string,
): Promise<ForeignKeyInfo[]> {
  // ClickHouse is an analytical OLAP database and does not enforce foreign keys
  return [];
}

export async function listIndexes(
  cfg: ClickHouseConfig,
  schemaNameOrTable: string,
  tableNameOrSchema?: string,
): Promise<IndexInfo[]> {
  let schema = cfg.database || "default";
  let table = schemaNameOrTable;

  if (tableNameOrSchema) {
    schema = schemaNameOrTable || cfg.database || "default";
    table = tableNameOrSchema;
  }

  const client = getClient(cfg);

  try {
    const res = await client.query({
      query: CLICKHOUSE_GET_INDEXES,
      query_params: {
        target_schema: schema,
        target_table: table,
        schema,
        table,
      },
      format: "JSONEachRow",
    });
    const data = (await res.json()) as any[];

    return data.map((r) => ({
      table_name: table,
      index_name: r.index_name,
      column_name: r.column_name,
      is_unique: false,
      is_primary: false,
      index_type: r.index_type,
    }));
  } catch {
    return [];
  }
}

export async function listUniqueConstraints(
  _cfg: ClickHouseConfig,
  _schemaNameOrTable: string,
  _tableNameOrSchema?: string,
): Promise<UniqueConstraintInfo[]> {
  return [];
}

export async function listCheckConstraints(
  _cfg: ClickHouseConfig,
  _schemaNameOrTable: string,
  _tableNameOrSchema?: string,
): Promise<CheckConstraintInfo[]> {
  return [];
}

export async function getDBStats(cfg: ClickHouseConfig): Promise<DBStats> {
  const cached = clickhouseCache.getDBStats(cfg);
  if (cached) return cached;

  const client = getClient(cfg);
  const database = cfg.database || "default";

  let total_tables = 0;
  let total_rows = 0;
  let total_db_size_mb = 0;

  try {
    const statsRes = await client.query({
      query: CLICKHOUSE_GET_DB_STATS,
      query_params: { database },
      format: "JSONEachRow",
    });
    const statsData = (await statsRes.json()) as any[];
    if (statsData.length > 0) {
      total_tables = Number(statsData[0].total_tables) || 0;
      total_rows = Number(statsData[0].total_rows) || 0;
    }
  } catch {}

  try {
    const sizeRes = await client.query({
      query: CLICKHOUSE_GET_DB_SIZE,
      query_params: { database },
      format: "JSONEachRow",
    });
    const sizeData = (await sizeRes.json()) as any[];
    if (sizeData.length > 0) {
      total_db_size_mb = Number(sizeData[0].total_db_size_mb) || 0;
    }
  } catch {}

  const stats: DBStats = {
    total_tables,
    total_rows,
    total_db_size_mb,
  };

  clickhouseCache.setDBStats(cfg, stats);
  return stats;
}

export async function listSchemas(cfg: ClickHouseConfig): Promise<SchemaInfo[]> {
  const cached = clickhouseCache.getSchemas(cfg);
  if (cached) return cached;

  const client = getClient(cfg);
  const res = await client.query({
    query: CLICKHOUSE_LIST_SCHEMAS,
    format: "JSONEachRow",
  });
  const data = (await res.json()) as any[];

  const schemas: SchemaInfo[] = data.map((r) => ({ name: r.name }));
  clickhouseCache.setSchemas(cfg, schemas);
  return schemas;
}

export async function listSchemaNames(cfg: ClickHouseConfig): Promise<string[]> {
  const schemas = await listSchemas(cfg);
  return schemas.map((s) => s.name);
}

export async function getTableDetails(
  cfg: ClickHouseConfig,
  schemaNameOrTable: string,
  tableNameOrSchema?: string,
): Promise<ColumnDetail[]> {
  let schema = cfg.database || "default";
  let table = schemaNameOrTable;

  if (tableNameOrSchema) {
    schema = schemaNameOrTable || cfg.database || "default";
    table = tableNameOrSchema;
  }

  const cached = clickhouseCache.getTableDetails(cfg, schema, table);
  if (cached) return cached;

  const client = getClient(cfg);
  const res = await client.query({
    query: CLICKHOUSE_LIST_COLUMNS,
    query_params: {
      target_schema: schema,
      target_table: table,
      schema,
      table,
    },
    format: "JSONEachRow",
  });
  const data = (await res.json()) as any[];

  const columns: ColumnDetail[] = data.map((r) => ({
    name: r.name,
    type: r.type,
    not_nullable: Boolean(r.not_nullable),
    default_value: r.default_value || null,
    is_primary_key: Boolean(r.is_in_primary_key || r.is_in_sorting_key),
    is_foreign_key: false,
    comment: r.comment || null,
  }));

  clickhouseCache.setTableDetails(cfg, schema, table, columns);
  return columns;
}

export async function getSchemaMetadataBatch(
  cfg: ClickHouseConfig,
  schemaNameOrTables?: string | string[],
  maybeSchemaName?: string,
): Promise<ClickHouseSchemaMetadataBatch> {
  let schema = cfg.database || "default";
  let filterTables: Set<string> | null = null;

  if (Array.isArray(schemaNameOrTables)) {
    filterTables = new Set(schemaNameOrTables);
    if (maybeSchemaName) schema = maybeSchemaName;
  } else if (typeof schemaNameOrTables === "string") {
    schema = schemaNameOrTables;
  }

  const client = getClient(cfg);

  const tablesMap = new Map<
    string,
    {
      columns: ColumnDetail[];
      primaryKeys: PrimaryKeyInfo[];
      foreignKeys: ForeignKeyInfo[];
      indexes: IndexInfo[];
      uniqueConstraints: UniqueConstraintInfo[];
      checkConstraints: CheckConstraintInfo[];
    }
  >();

  function getOrCreateTable(tableName: string) {
    let entry = tablesMap.get(tableName);
    if (!entry) {
      entry = {
        columns: [],
        primaryKeys: [],
        foreignKeys: [],
        indexes: [],
        uniqueConstraints: [],
        checkConstraints: [],
      };
      tablesMap.set(tableName, entry);
    }
    return entry;
  }

  // Pre-seed tables if filterTables was explicitly provided
  if (filterTables) {
    for (const tbl of filterTables) {
      getOrCreateTable(tbl);
    }
  }

  // 1. Discover tables in target schema
  try {
    const tables = await listTables(cfg, schema);
    for (const t of tables) {
      if (!filterTables || filterTables.has(t.name)) {
        getOrCreateTable(t.name);
      }
    }
  } catch (err: any) {
    logger.warn(
      { err: err?.message, schema },
      "ClickHouse getSchemaMetadataBatch listTables failed",
    );
  }

  // Fallback table discovery if empty and no specific table filter was provided
  if (tablesMap.size === 0 && !filterTables) {
    try {
      const allTables = await listTables(cfg);
      for (const t of allTables) {
        if (!schema || t.schema === schema) {
          getOrCreateTable(t.name);
        }
      }
    } catch (err: any) {
      logger.warn(
        { err: err?.message, schema },
        "ClickHouse getSchemaMetadataBatch allTables fallback failed",
      );
    }
  }

  // 2. Batch fetch columns
  try {
    const colRes = await client.query({
      query: CLICKHOUSE_BATCH_LIST_COLUMNS,
      query_params: { target_schema: schema, schema },
      format: "JSONEachRow",
    });
    const colData = (await colRes.json()) as any[];

    for (const r of colData) {
      const tbl = r.table || r["`table`"] || r.table_name;
      if (!tbl || (filterTables && !filterTables.has(tbl))) continue;
      const entry = getOrCreateTable(tbl);
      entry.columns.push({
        name: r.name,
        type: r.type,
        not_nullable: Boolean(r.not_nullable),
        default_value: r.default_value || null,
        is_primary_key: Boolean(r.is_in_primary_key || r.is_in_sorting_key),
        is_foreign_key: false,
        comment: r.comment || null,
      });
    }
  } catch (err: any) {
    logger.warn({ err: err?.message, schema }, "ClickHouse CLICKHOUSE_BATCH_LIST_COLUMNS failed");
  }

  // 3. Batch fetch primary keys
  try {
    const pkRes = await client.query({
      query: CLICKHOUSE_BATCH_GET_PRIMARY_KEYS,
      query_params: { target_schema: schema, schema },
      format: "JSONEachRow",
    });
    const pkData = (await pkRes.json()) as any[];

    for (const r of pkData) {
      const tbl = r.table || r["`table`"] || r.table_name;
      if (!tbl || (filterTables && !filterTables.has(tbl))) continue;
      const entry = getOrCreateTable(tbl);
      entry.primaryKeys.push({ column_name: r.column_name });
    }
  } catch (err: any) {
    logger.warn(
      { err: err?.message, schema },
      "ClickHouse CLICKHOUSE_BATCH_GET_PRIMARY_KEYS failed",
    );
  }

  // 4. Batch fetch secondary indexes
  try {
    const idxRes = await client.query({
      query: CLICKHOUSE_BATCH_GET_INDEXES,
      query_params: { target_schema: schema, schema },
      format: "JSONEachRow",
    });
    const idxData = (await idxRes.json()) as any[];

    for (const r of idxData) {
      const tbl = r.table || r["`table`"] || r.table_name;
      if (!tbl || (filterTables && !filterTables.has(tbl))) continue;
      const entry = getOrCreateTable(tbl);
      entry.indexes.push({
        table_name: tbl,
        index_name: r.index_name,
        column_name: r.column_name,
        is_unique: false,
        is_primary: false,
        index_type: r.index_type,
      });
    }
  } catch (err: any) {
    logger.debug(
      { err: err?.message, schema },
      "ClickHouse CLICKHOUSE_BATCH_GET_INDEXES skipped/failed",
    );
  }

  // 5. Direct fallback: If tablesMap is still empty after batch queries, query system.tables directly
  if (tablesMap.size === 0) {
    try {
      const directTablesRes = await client.query({
        query: `SELECT name FROM system.tables WHERE database = {target_schema: String} ORDER BY name`,
        query_params: { target_schema: schema, schema },
        format: "JSONEachRow",
      });
      const directRows = (await directTablesRes.json()) as any[];
      for (const row of directRows) {
        if (!filterTables || filterTables.has(row.name)) {
          getOrCreateTable(row.name);
        }
      }
    } catch (err: any) {
      logger.warn({ err: err?.message, schema }, "ClickHouse direct system.tables query failed");
    }
  }

  // 6. Guaranteed population: Ensure every table in tablesMap has columns and primary keys populated
  for (const [tableName, entry] of tablesMap.entries()) {
    if (entry.columns.length === 0) {
      try {
        const fallbackCols = await getTableDetails(cfg, schema, tableName);
        if (fallbackCols && fallbackCols.length > 0) {
          entry.columns = fallbackCols;
        }
      } catch (err: any) {
        logger.warn({ err: err?.message, schema, tableName }, "Fallback getTableDetails failed");
      }
    }
    if (entry.primaryKeys.length === 0) {
      try {
        const fallbackPks = await listPrimaryKeys(cfg, schema, tableName);
        if (fallbackPks && fallbackPks.length > 0) {
          entry.primaryKeys = fallbackPks;
        }
      } catch (err: any) {
        logger.debug({ err: err?.message, schema, tableName }, "Fallback listPrimaryKeys failed");
      }
    }
  }

  return { tables: tablesMap };
}

export function streamQueryCancelable(
  cfg: ClickHouseConfig,
  sql: string,
  batchSize: number = 1000,
  onBatch: (rows: any[], columns: { name: string }[]) => Promise<void> | void,
  onDone?: () => void,
): { promise: Promise<void>; cancel: () => Promise<void> } {
  let cancelled = false;
  const abortController = new AbortController();

  const promise = (async () => {
    const client = getClient(cfg);
    const resultSet = await client.query({
      query: sql,
      format: "JSONEachRow",
      abort_signal: abortController.signal,
    });

    if (cancelled) return;

    let columns: { name: string }[] | null = null;
    const buffer: any[] = [];

    const flush = async () => {
      if (buffer.length === 0) return;
      const batch = buffer.splice(0, buffer.length);
      await onBatch(batch, columns || []);
    };

    const stream = resultSet.stream();
    for await (const rows of stream) {
      if (cancelled) break;
      for (const row of rows as any[]) {
        if (cancelled) break;
        const jsonObj = typeof row.json === "function" ? row.json() : row;
        if (!columns && jsonObj && typeof jsonObj === "object") {
          columns = Object.keys(jsonObj).map((k) => ({ name: k }));
        }
        buffer.push(jsonObj);
        if (buffer.length >= batchSize) {
          await flush();
        }
      }
    }

    if (!cancelled) {
      await flush();
      if (onDone) onDone();
    }
  })();

  async function cancel() {
    cancelled = true;
    abortController.abort();
  }

  return { promise, cancel };
}

export async function fetchTableData(
  cfg: ClickHouseConfig,
  schemaName: string,
  tableName: string,
  limit: number,
  page: number,
  sortBy?: string,
  sortOrder: "ASC" | "DESC" = "ASC",
): Promise<{ rows: any[]; total: number }> {
  const client = getClient(cfg);
  const offset = Math.max(0, (page - 1) * limit);

  // Total rows
  const countRes = await client.query({
    query: `SELECT count() AS total FROM \`${schemaName}\`.\`${tableName}\``,
    format: "JSONEachRow",
  });
  const countData = (await countRes.json()) as any[];
  const total = countData.length > 0 ? Number(countData[0].total) : 0;

  // Data rows
  const orderClause = sortBy ? ` ORDER BY \`${sortBy}\` ${sortOrder}` : "";
  const dataRes = await client.query({
    query: `SELECT * FROM \`${schemaName}\`.\`${tableName}\`${orderClause} LIMIT ${limit} OFFSET ${offset}`,
    format: "JSONEachRow",
  });
  const rows = (await dataRes.json()) as any[];

  return { rows, total };
}

export async function createTable(
  cfg: ClickHouseConfig,
  schemaName: string,
  tableName: string,
  columns: any[],
  primaryKey?: string | string[],
  ifNotExists: boolean = true,
): Promise<void> {
  const client = getClient(cfg);
  const colDefs = columns
    .map((col) => {
      let def = `\`${col.name}\` ${col.type}`;
      if (col.default_value) def += ` DEFAULT ${col.default_value}`;
      return def;
    })
    .join(",\n  ");

  const pkCols = Array.isArray(primaryKey) ? primaryKey : primaryKey ? [primaryKey] : [];
  const orderClause = pkCols.length > 0 ? pkCols.map((c) => `\`${c}\``).join(", ") : "tuple()";
  const ifNotExistsClause = ifNotExists ? "IF NOT EXISTS " : "";

  const sql = `CREATE TABLE ${ifNotExistsClause}\`${schemaName}\`.\`${tableName}\` (
  ${colDefs}
) ENGINE = MergeTree() ORDER BY (${orderClause});`;

  await client.command({ query: sql });
  clickhouseCache.clearForConnection(cfg);
}

export async function createIndexes(
  cfg: ClickHouseConfig,
  schemaName: string,
  tableName: string,
  indexes: any[],
): Promise<void> {
  const client = getClient(cfg);
  for (const idx of indexes) {
    const cols = Array.isArray(idx.columns) ? idx.columns.join(", ") : idx.column;
    const type = idx.type || "minmax";
    const granularity = idx.granularity || 1;
    await client.command({
      query: `ALTER TABLE \`${schemaName}\`.\`${tableName}\` ADD INDEX \`${idx.name}\` (${cols}) TYPE ${type} GRANULARITY ${granularity}`,
    });
  }
  clickhouseCache.clearTableCache(cfg, schemaName, tableName);
}

export async function alterTable(
  cfg: ClickHouseConfig,
  schemaName: string,
  tableName: string,
  alterations: any[],
): Promise<void> {
  const client = getClient(cfg);
  for (const alt of alterations) {
    let clause = "";
    if (alt.type === "ADD_COLUMN") {
      clause = `ADD COLUMN \`${alt.columnName}\` ${alt.columnDef}`;
    } else if (alt.type === "DROP_COLUMN") {
      clause = `DROP COLUMN \`${alt.columnName}\``;
    } else if (alt.type === "RENAME_COLUMN") {
      clause = `RENAME COLUMN \`${alt.oldName}\` TO \`${alt.newName}\``;
    } else if (alt.type === "ALTER_COLUMN" || alt.type === "MODIFY_COLUMN") {
      clause = `MODIFY COLUMN \`${alt.columnName}\` ${alt.newDef}`;
    } else if (alt.type === "RENAME_TABLE") {
      await client.command({
        query: `RENAME TABLE \`${schemaName}\`.\`${tableName}\` TO \`${schemaName}\`.\`${alt.newName}\``,
      });
      continue;
    }
    if (clause) {
      await client.command({
        query: `ALTER TABLE \`${schemaName}\`.\`${tableName}\` ${clause}`,
      });
    }
  }
  clickhouseCache.clearForConnection(cfg);
}

export async function dropTable(
  cfg: ClickHouseConfig,
  schemaName: string,
  tableName: string,
  ifExists: boolean = true,
): Promise<void> {
  const client = getClient(cfg);
  const ifExistsClause = ifExists ? "IF EXISTS " : "";
  await client.command({
    query: `DROP TABLE ${ifExistsClause}\`${schemaName}\`.\`${tableName}\``,
  });
  clickhouseCache.clearForConnection(cfg);
}

export async function ensureMigrationTable(
  cfg: ClickHouseConfig,
  schemaName?: string,
): Promise<void> {
  const schema = schemaName || cfg.database || "default";
  const client = getClient(cfg);
  await client.command({
    query: `CREATE DATABASE IF NOT EXISTS \`${schema}\``,
  });
  await client.command({
    query: `CREATE TABLE IF NOT EXISTS \`${schema}\`.schema_migrations (
      version String,
      name String,
      checksum String,
      applied_at DateTime DEFAULT now()
    ) ENGINE = MergeTree() ORDER BY version;`,
  });
}

export async function hasAnyMigrations(
  cfg: ClickHouseConfig,
  schemaName?: string,
): Promise<boolean> {
  const schema = schemaName || cfg.database || "default";
  const client = getClient(cfg);
  try {
    const res = await client.query({
      query: `SELECT count() AS cnt FROM \`${schema}\`.schema_migrations`,
      format: "JSONEachRow",
    });
    const data = (await res.json()) as any[];
    return data.length > 0 && Number(data[0].cnt) > 0;
  } catch (err: any) {
    if (String(err).includes("doesn't exist") || String(err).includes("UNKNOWN_TABLE")) {
      return false;
    }
    throw err;
  }
}

export async function insertBaseline(
  cfg: ClickHouseConfig,
  version: string,
  name: string,
  checksum: string,
  schemaName?: string,
): Promise<void> {
  await ensureMigrationTable(cfg, schemaName);
  const schema = schemaName || cfg.database || "default";
  const client = getClient(cfg);
  await client.insert({
    table: `\`${schema}\`.schema_migrations`,
    values: [{ version, name, checksum }],
    format: "JSONEachRow",
  });
}

export async function baselineIfNeeded(
  cfg: ClickHouseConfig,
  migrationsDir: string,
  snapshot?: SchemaFile,
  schemaName?: string,
): Promise<{ baselined: boolean; version?: string }> {
  await ensureMigrationTable(cfg, schemaName);
  const hasMigrations = await hasAnyMigrations(cfg, schemaName);
  if (hasMigrations) return { baselined: false };

  const version = Date.now().toString();
  const name = "baseline_existing_schema";

  const fakeSnapshot = snapshot || {
    version: 2,
    projectId: "",
    databaseId: "",
    dialect: "clickhouse",
    schemas: [],
    cachedAt: "",
    relwaveVersion: "",
    schemaHash: "",
  };

  const { writeBaselineMigration } = await import("../utils/baselineMigration");
  const filePath = writeBaselineMigration(migrationsDir, version, name, fakeSnapshot as any);
  const checksum = crypto.createHash("sha256").update(fs.readFileSync(filePath)).digest("hex");

  await insertBaseline(cfg, version, name, checksum, schemaName);
  return { baselined: true, version };
}

export async function listAppliedMigrations(
  cfg: ClickHouseConfig,
  schemaName?: string,
): Promise<AppliedMigration[]> {
  const schema = schemaName || cfg.database || "default";
  await ensureMigrationTable(cfg, schema);
  const client = getClient(cfg);

  try {
    const res = await client.query({
      query: `SELECT version, name, checksum, toString(applied_at) AS applied_at FROM \`${schema}\`.schema_migrations ORDER BY version ASC`,
      format: "JSONEachRow",
    });
    const rows = (await res.json()) as any[];
    return rows.map((r) => ({
      version: r.version,
      name: r.name,
      checksum: r.checksum || "",
      applied_at: new Date(r.applied_at),
    }));
  } catch {
    return [];
  }
}

export function splitClickHouseStatements(sql: string): string[] {
  const cleanSql = sql
    .split("\n")
    .map((line) => {
      const trimmed = line.trim();
      if (trimmed.startsWith("--")) return "";
      return line;
    })
    .join("\n");

  return cleanSql
    .split(";")
    .map((s) => s.trim())
    .map((s) => {
      if (/^\s*DROP\s+TABLE\b/i.test(s)) {
        return s.replace(/\s+(?:CASCADE|RESTRICT)\s*$/i, "").trim();
      }
      return s;
    })
    .filter((s) => s.length > 0);
}

export async function connectToDatabase(
  cfg: ClickHouseConfig,
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

export async function applyMigration(
  cfg: ClickHouseConfig,
  migrationFilePath: string,
  schemaName?: string,
): Promise<void> {
  const schema = schemaName || cfg.database || "default";
  await ensureMigrationTable(cfg, schema);
  const { readMigrationFile } = await import("../utils/migrationFileReader");
  const migration = readMigrationFile(migrationFilePath);

  const client = getClient(cfg);
  const stmts = splitClickHouseStatements(migration.upSQL);

  for (const stmt of stmts) {
    await client.command({ query: stmt });
  }

  await client.insert({
    table: `\`${schema}\`.schema_migrations`,
    values: [{ version: migration.version, name: migration.name, checksum: migration.checksum }],
    format: "JSONEachRow",
  });
  clickhouseCache.clearForConnection(cfg);
}

export async function rollbackMigration(
  cfg: ClickHouseConfig,
  version: string,
  migrationFilePath: string,
  schemaName?: string,
): Promise<void> {
  const schema = schemaName || cfg.database || "default";
  await ensureMigrationTable(cfg, schema);
  const { readMigrationFile } = await import("../utils/migrationFileReader");
  const migration = readMigrationFile(migrationFilePath);

  const client = getClient(cfg);
  const stmts = splitClickHouseStatements(migration.downSQL);

  if (stmts.length === 0) {
    throw new Error(
      `Cannot rollback migration "${migration.name}": no executable SQL found in DOWN section.`,
    );
  }

  for (const stmt of stmts) {
    await client.command({ query: stmt });
  }

  await client.command({
    query: `ALTER TABLE \`${schema}\`.schema_migrations DELETE WHERE version = '${version.replace(/'/g, "\\'")}'`,
    clickhouse_settings: {
      mutations_sync: "1",
    },
  });
  clickhouseCache.clearForConnection(cfg);
}

export async function insertRow(
  cfg: ClickHouseConfig,
  schemaName: string,
  tableName: string,
  row: Record<string, any>,
): Promise<any> {
  const client = getClient(cfg);
  await client.insert({
    table: `\`${schemaName}\`.\`${tableName}\``,
    values: [row],
    format: "JSONEachRow",
  });
  clickhouseCache.clearTableCache(cfg, schemaName, tableName);
  return row;
}

export async function updateRow(
  cfg: ClickHouseConfig,
  schemaName: string,
  tableName: string,
  primaryKeyColumnOrObj: string | { column: string; value: any } | Record<string, any>,
  primaryKeyValueOrRow?: any,
  rowData?: Record<string, any>,
): Promise<any> {
  const client = getClient(cfg);
  let updates: Record<string, any> = {};
  let whereClause = "";

  if (rowData !== undefined && typeof primaryKeyColumnOrObj === "string") {
    // Called as: (cfg, schemaName, tableName, primaryKeyColumn, primaryKeyValue, rowData)
    updates = rowData;
    whereClause = `\`${primaryKeyColumnOrObj}\` = ${formatValue(primaryKeyValueOrRow)}`;
  } else if (typeof primaryKeyColumnOrObj === "object" && primaryKeyColumnOrObj !== null) {
    if ("column" in primaryKeyColumnOrObj && "value" in primaryKeyColumnOrObj) {
      whereClause = `\`${primaryKeyColumnOrObj.column}\` = ${formatValue(primaryKeyColumnOrObj.value)}`;
    } else {
      whereClause = Object.entries(primaryKeyColumnOrObj)
        .map(([col, val]) => `\`${col}\` = ${formatValue(val)}`)
        .join(" AND ");
    }
    updates = primaryKeyValueOrRow || {};
  } else if (
    typeof primaryKeyColumnOrObj === "string" &&
    primaryKeyValueOrRow &&
    typeof primaryKeyValueOrRow === "object"
  ) {
    updates = primaryKeyValueOrRow;
    whereClause = `\`${primaryKeyColumnOrObj}\` = ${formatValue(rowData)}`;
  }

  const updateEntries = Object.entries(updates);
  if (updateEntries.length === 0) {
    throw new Error("No data provided for update");
  }
  if (!whereClause) {
    throw new Error("Primary key condition required for update");
  }

  const sets = updateEntries.map(([col, val]) => `\`${col}\` = ${formatValue(val)}`).join(", ");

  await client.command({
    query: `ALTER TABLE \`${schemaName}\`.\`${tableName}\` UPDATE ${sets} WHERE ${whereClause}`,
    clickhouse_settings: {
      mutations_sync: "1",
    },
  });
  clickhouseCache.clearTableCache(cfg, schemaName, tableName);

  try {
    const fetchRes = await client.query({
      query: `SELECT * FROM \`${schemaName}\`.\`${tableName}\` WHERE ${whereClause} LIMIT 1`,
      format: "JSONEachRow",
    });
    const fetched = (await fetchRes.json()) as any[];
    return fetched[0] || updates;
  } catch {
    return updates;
  }
}

export async function deleteRow(
  cfg: ClickHouseConfig,
  schemaName: string,
  tableName: string,
  primaryKeyColumnOrObj: string | { column: string; value: any } | Record<string, any>,
  primaryKeyValue?: any,
): Promise<boolean> {
  const client = getClient(cfg);
  let whereClause = "";

  if (typeof primaryKeyColumnOrObj === "string") {
    whereClause = `\`${primaryKeyColumnOrObj}\` = ${formatValue(primaryKeyValue)}`;
  } else if (typeof primaryKeyColumnOrObj === "object" && primaryKeyColumnOrObj !== null) {
    if ("column" in primaryKeyColumnOrObj && "value" in primaryKeyColumnOrObj) {
      whereClause = `\`${primaryKeyColumnOrObj.column}\` = ${formatValue(primaryKeyColumnOrObj.value)}`;
    } else {
      whereClause = Object.entries(primaryKeyColumnOrObj)
        .map(([col, val]) => `\`${col}\` = ${formatValue(val)}`)
        .join(" AND ");
    }
  }

  if (!whereClause) {
    throw new Error("Primary key condition required for delete");
  }

  await client.command({
    query: `ALTER TABLE \`${schemaName}\`.\`${tableName}\` DELETE WHERE ${whereClause}`,
    clickhouse_settings: {
      mutations_sync: "1",
    },
  });
  clickhouseCache.clearTableCache(cfg, schemaName, tableName);
  return true;
}

export async function searchTable(
  cfg: ClickHouseConfig,
  schemaName: string,
  tableName: string,
  searchTerm: string,
  column?: string,
  page: number = 1,
  pageSize: number = 50,
): Promise<{ rows: any[]; total: number }> {
  const client = getClient(cfg);
  const offset = Math.max(0, (page - 1) * pageSize);
  const escapedTerm = searchTerm.replace(/'/g, "\\'");

  let whereConditions = "";
  if (column && column.trim()) {
    whereConditions = `\`${column.trim()}\` ILIKE '%${escapedTerm}%'`;
  } else {
    const cols = await getTableDetails(cfg, schemaName, tableName);
    const textCols = cols.filter(
      (c) =>
        c.type.toLowerCase().includes("string") ||
        c.type.toLowerCase().includes("char") ||
        c.type.toLowerCase().includes("text"),
    );

    if (textCols.length === 0) {
      return fetchTableData(cfg, schemaName, tableName, pageSize, page);
    }

    whereConditions = textCols.map((c) => `\`${c.name}\` ILIKE '%${escapedTerm}%'`).join(" OR ");
  }

  const countRes = await client.query({
    query: `SELECT count() AS total FROM \`${schemaName}\`.\`${tableName}\` WHERE ${whereConditions}`,
    format: "JSONEachRow",
  });
  const countData = (await countRes.json()) as any[];
  const total = countData.length > 0 ? Number(countData[0].total) : 0;

  const dataRes = await client.query({
    query: `SELECT * FROM \`${schemaName}\`.\`${tableName}\` WHERE ${whereConditions} LIMIT ${pageSize} OFFSET ${offset}`,
    format: "JSONEachRow",
  });
  const rows = (await dataRes.json()) as any[];

  return { rows, total };
}
