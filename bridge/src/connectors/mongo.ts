/**
 * MongoDB connector (Milestone 1 foundation).
 *
 * Implements the connection / listing / statistics subset required to wire
 * MongoDB into the existing structural connector registry:
 *   - client pool (per uri+database)
 *   - testConnection
 *   - listCollections  (native, document-oriented)
 *   - listTables       (relational compatibility adapter → TableInfo[])
 *   - getDBStats       (→ DBStats)
 *   - listSchemaNames  (single pseudo-schema)
 *   - connectToDatabase (minimal; no baseline, no schema_migrations)
 *   - mongodbCache     (satisfies the `${dbType}Cache` naming convention)
 *
 * Document-native operations (findDocuments / insertDocument / updateDocument /
 * deleteDocument / runAggregation / inferCollectionSchema) and the row/table
 * compatibility adapters land in a later milestone. They are intentionally NOT
 * stubbed here.
 *
 * Credentials never appear in logs or error messages: connection errors are
 * sanitized and the raw config is never logged.
 */

import { MongoClient } from "mongodb";
import { MongoConfig, MongoCollectionInfo } from "../types/mongo";
import { TableInfo, DBStats, SchemaInfo } from "../types/common";
import { CacheEntry } from "../types/cache";
import logger from "../services/logger";

// ---------------------------------------------------------------------------
// Error sanitization — decision #8: never expose credentials in errors/logs.
// ---------------------------------------------------------------------------

/** Redact any embedded credentials if a message ever echoes the connection URI. */
function safeMongoError(err: unknown): string {
  const base = err instanceof Error ? err.message : String(err);
  return base.replace(/(mongodb\+?srv?:\/\/)[^@\s]+@/gi, "$1<credentials>@");
}

// ---------------------------------------------------------------------------
// CACHING
// ---------------------------------------------------------------------------

const CACHE_TTL = 30_000;
const STATS_CACHE_TTL = 10_000;

class MongoCacheManager {
  private tableListCache = new Map<string, CacheEntry<TableInfo[]>>();
  private dbStatsCache = new Map<string, CacheEntry<DBStats>>();

  private getConfigKey(cfg: MongoConfig): string {
    return `${cfg.uri || ""}:${cfg.database || ""}`;
  }

  private isValid<T>(entry: CacheEntry<T> | undefined): boolean {
    return !!entry && Date.now() - entry.timestamp < entry.ttl;
  }

  getTableList(cfg: MongoConfig): TableInfo[] | null {
    const entry = this.tableListCache.get(this.getConfigKey(cfg));
    return this.isValid(entry) ? entry!.data : null;
  }
  setTableList(cfg: MongoConfig, data: TableInfo[]): void {
    this.tableListCache.set(this.getConfigKey(cfg), {
      data,
      timestamp: Date.now(),
      ttl: CACHE_TTL,
    });
  }

  getDBStats(cfg: MongoConfig): DBStats | null {
    const entry = this.dbStatsCache.get(this.getConfigKey(cfg));
    return this.isValid(entry) ? entry!.data : null;
  }
  setDBStats(cfg: MongoConfig, data: DBStats): void {
    this.dbStatsCache.set(this.getConfigKey(cfg), {
      data,
      timestamp: Date.now(),
      ttl: STATS_CACHE_TTL,
    });
  }

  clearForConnection(cfg: MongoConfig): void {
    const key = this.getConfigKey(cfg);
    for (const [k] of this.tableListCache) {
      if (k.startsWith(key)) this.tableListCache.delete(k);
    }
    this.dbStatsCache.delete(key);
  }

  clearAll(): void {
    this.tableListCache.clear();
    this.dbStatsCache.clear();
  }
}

export const mongodbCache = new MongoCacheManager();

// ---------------------------------------------------------------------------
// CLIENT CONNECTION POOL
// ---------------------------------------------------------------------------

const clientPool = new Map<string, MongoClient>();

function getClientKey(cfg: MongoConfig): string {
  return `${cfg.uri || ""}:${cfg.database || ""}`;
}

export function getMongoClient(cfg: MongoConfig): MongoClient {
  const key = getClientKey(cfg);
  let client = clientPool.get(key);
  if (!client) {
    if (!cfg.uri) {
      throw new Error("MongoDB connection requires a connection URI");
    }
    client = new MongoClient(cfg.uri);
    clientPool.set(key, client);
  }
  return client;
}

export async function closeMongoClient(cfg: MongoConfig): Promise<void> {
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

export async function closeAllMongoClients(): Promise<void> {
  for (const client of clientPool.values()) {
    try {
      await client.close();
    } catch {
      // ignore
    }
  }
  clientPool.clear();
}

/** Select the target database, defaulting to the configured one. */
function selectDb(cfg: MongoConfig): ReturnType<MongoClient["db"]> {
  const client = getMongoClient(cfg);
  return cfg.database ? client.db(cfg.database) : client.db();
}

// ---------------------------------------------------------------------------
// CORE CONNECTOR OPERATIONS (M1 subset)
// ---------------------------------------------------------------------------

export async function testConnection(
  cfg: MongoConfig,
): Promise<{ ok: boolean; message?: string; status: "connected" | "disconnected" }> {
  if (!cfg.uri) {
    return { ok: false, status: "disconnected", message: "Missing connection URI" };
  }

  const tempClient = new MongoClient(cfg.uri);
  try {
    await tempClient.db().admin().ping();
    return { ok: true, status: "connected", message: "Connection successful" };
  } catch (err) {
    return { ok: false, status: "disconnected", message: safeMongoError(err) };
  } finally {
    try {
      await tempClient.close();
    } catch {
      // ignore
    }
  }
}

/** Native: list collections (and views) in the configured database. */
export async function listCollections(cfg: MongoConfig): Promise<MongoCollectionInfo[]> {
  const cached = mongodbCache.getTableList(cfg);
  if (cached) {
    // Derive collection info from the cached relational adapter view.
    return cached.map((t) => ({ name: t.name, type: t.type === "VIEW" ? "view" : "collection" }));
  }

  const db = selectDb(cfg);
  const infos = await db.listCollections({}, { nameOnly: true }).toArray();

  const result: MongoCollectionInfo[] = infos.map((c) => {
    const isView = c.type === "view";
    return { name: c.name, type: isView ? "view" : "collection" };
  });

  // Prime the table-list cache from the native result.
  mongodbCache.setTableList(
    cfg,
    result.map((c) => ({
      schema: cfg.database || "default",
      name: c.name,
      type: c.type === "view" ? "VIEW" : "BASE TABLE",
    })),
  );
  return result;
}

/**
 * Relational compatibility adapter: map collections → `TableInfo[]` so the
 * existing `db.listTables` RPC and schema tree keep working. The relational
 * `schema` filter is ignored (Mongo is not schema-namespaced).
 */
export async function listTables(cfg: MongoConfig, _schema?: string): Promise<TableInfo[]> {
  const cached = mongodbCache.getTableList(cfg);
  if (cached) return cached;

  const collections = await listCollections(cfg);
  const tables: TableInfo[] = collections.map((c) => ({
    schema: cfg.database || "default",
    name: c.name,
    type: c.type === "view" ? "VIEW" : "BASE TABLE",
  }));
  mongodbCache.setTableList(cfg, tables);
  return tables;
}

/** Basic database statistics mapped onto the shared `DBStats` shape. */
export async function getDBStats(cfg: MongoConfig): Promise<DBStats> {
  const cached = mongodbCache.getDBStats(cfg);
  if (cached) return cached;

  const db = selectDb(cfg);
  const stats = await db.stats();

  let total_tables = 0;
  try {
    const collInfos = await db.listCollections({}, { nameOnly: true }).toArray();
    total_tables = collInfos.length;
  } catch (err) {
    logger.warn({ err: safeMongoError(err) }, "MongoDB countCollections failed");
  }

  const total_rows = typeof stats.objects === "number" ? stats.objects : 0;
  const total_db_size_mb =
    typeof stats.size === "number" ? Math.round((stats.size / (1024 * 1024)) * 100) / 100 : 0;

  const result: DBStats = { total_tables, total_rows, total_db_size_mb };
  mongodbCache.setDBStats(cfg, result);
  return result;
}

/** Single pseudo-schema (the database name) for the existing `db.listSchemas`. */
export async function listSchemaNames(cfg: MongoConfig): Promise<string[]> {
  return [cfg.database || "default"];
}

/**
 * Minimal connect bootstrap. Returns collections as pseudo-schemas and empty
 * migration lists. No baseline and no `schema_migrations` — MongoDB migrations
 * are out of scope for this milestone.
 */
export async function connectToDatabase(
  cfg: MongoConfig,
  _connectionId: string,
  _options?: { readOnly?: boolean },
): Promise<{
  baselined: boolean;
  schema: SchemaInfo[];
  migrations: { local: unknown[]; applied: unknown[] };
}> {
  const collections = await listCollections(cfg);
  const schema: SchemaInfo[] = collections.map((c) => ({ name: c.name }));
  return {
    baselined: false,
    schema,
    migrations: { local: [], applied: [] },
  };
}
