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

import { MongoClient, Collection, FindOptions, AggregateOptions } from "mongodb";
import { createHash } from "crypto";
import {
  MongoConfig,
  MongoCollectionInfo,
  MongoCollectionStats,
  EJSONDocument,
  EJsonValue,
  MongoFindRequest,
  MongoFindResult,
  MongoInsertRequest,
  MongoInsertResult,
  MongoUpdateRequest,
  MongoUpdateResult,
  MongoDeleteRequest,
  MongoDeleteResult,
  MongoAggregationRequest,
  MongoAggregationResult,
  MongoSortSpec,
  MongoProjection,
  MongoPageCacheKey,
  MAX_PAGE_SIZE,
  MAX_PAGE,
  DEFAULT_PAGE_SIZE,
  MAX_FILTER_SIZE_BYTES,
  MAX_SORT_FIELDS,
  MAX_PROJECTION_FIELDS,
  MAX_AGG_STAGES,
  MAX_AGG_STAGE_SIZE_BYTES,
  MAX_AGG_RESULTS,
  MAX_DOCUMENT_SIZE_BYTES,
  DEFAULT_OP_TIMEOUT_MS,
  MAX_OP_TIMEOUT_MS,
} from "../types/mongo";
import { TableInfo, DBStats, SchemaInfo } from "../types/common";
import { CacheEntry } from "../types/cache";
import logger from "../services/logger";
import {
  serializeMongoEJSONDocument,
  serializeMongoFilter,
  serializeMongoUpdateOperand,
  serializeMongoPipelineStage,
  mongoBSONtoEJSON,
} from "./mongoBson";

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
const DOC_PAGE_TTL = 5_000; // M2 opt-in document-page cache (spec §14)

class MongoCacheManager {
  private tableListCache = new Map<string, CacheEntry<TableInfo[]>>();
  private dbStatsCache = new Map<string, CacheEntry<DBStats>>();
  // M2 collection-scoped caches (spec §14)
  private collectionStatsCache = new Map<string, CacheEntry<MongoCollectionStats>>();
  private docPageCache = new Map<string, CacheEntry<EJSONDocument[]>>();

  private getConfigKey(cfg: MongoConfig): string {
    return `${cfg.uri || ""}:${cfg.database || ""}`;
  }

  /** Credential-free connection identifier for M2 query-result cache keys (spec §15). */
  private getConnHash(cfg: MongoConfig): string {
    return createHash("sha256")
      .update(cfg.uri || "")
      .digest("hex");
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

  // ---- M2: collection-scoped caches (spec §14 / D-M2-5) ----

  getCollectionStats(cfg: MongoConfig, collection: string): MongoCollectionStats | null {
    const entry = this.collectionStatsCache.get(`${this.getConfigKey(cfg)}:${collection}`);
    return this.isValid(entry) ? entry!.data : null;
  }
  setCollectionStats(cfg: MongoConfig, collection: string, data: MongoCollectionStats): void {
    this.collectionStatsCache.set(`${this.getConfigKey(cfg)}:${collection}`, {
      data,
      timestamp: Date.now(),
      ttl: STATS_CACHE_TTL,
    });
  }

  getDocumentPage(cfg: MongoConfig, key: MongoPageCacheKey): EJSONDocument[] | null {
    const entry = this.docPageCache.get(`${this.getConnHash(cfg)}:${key}`);
    return this.isValid(entry) ? entry!.data : null;
  }
  setDocumentPage(cfg: MongoConfig, key: MongoPageCacheKey, docs: EJSONDocument[]): void {
    this.docPageCache.set(`${this.getConnHash(cfg)}:${key}`, {
      data: docs,
      timestamp: Date.now(),
      ttl: DOC_PAGE_TTL,
    });
  }

  /** Evict a collection's stats + all its cached document pages (called on mutation). */
  clearCollectionCache(cfg: MongoConfig, collection: string): void {
    this.collectionStatsCache.delete(`${this.getConfigKey(cfg)}:${collection}`);
    const connHash = this.getConnHash(cfg);
    for (const k of Array.from(this.docPageCache.keys())) {
      if (k.startsWith(`${connHash}:`)) this.docPageCache.delete(k);
    }
  }

  clearForConnection(cfg: MongoConfig): void {
    const key = this.getConfigKey(cfg);
    for (const [k] of this.tableListCache) {
      if (k.startsWith(key)) this.tableListCache.delete(k);
    }
    this.dbStatsCache.delete(key);
    for (const k of Array.from(this.collectionStatsCache.keys())) {
      if (k.startsWith(key)) this.collectionStatsCache.delete(k);
    }
    const connHash = this.getConnHash(cfg);
    for (const k of Array.from(this.docPageCache.keys())) {
      if (k.startsWith(`${connHash}:`)) this.docPageCache.delete(k);
    }
  }

  clearAll(): void {
    this.tableListCache.clear();
    this.dbStatsCache.clear();
    this.collectionStatsCache.clear();
    this.docPageCache.clear();
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

// ===========================================================================
// M2 — MongoDB Document Engine (findDocuments / insertDocument / updateDocument
// / deleteDocument / runAggregation). See docs/MONGODB_M2_SPEC.md.
//
// Document-native operations, distinct from the M1 row/table compatibility
// adapters above. They run through a small MongoConnector class so the
// executor/handler layer has one typed surface to call (spec §13). Errors map to
// the stable MongoApiError codes (spec §11) and never carry credentials (§15).
// ===========================================================================

/** Stable JSON encoding with sorted keys, for size measurement + cache keys. */
function canonicalJSON(value: unknown): string {
  const sortKeys = (v: unknown): unknown => {
    if (v && typeof v === "object" && !Array.isArray(v)) {
      const obj = v as Record<string, unknown>;
      const sorted: Record<string, unknown> = {};
      for (const k of Object.keys(obj).sort()) sorted[k] = sortKeys(obj[k]);
      return sorted;
    }
    if (Array.isArray(v)) return v.map(sortKeys);
    return v;
  };
  return JSON.stringify(sortKeys(value));
}

function jsonByteSize(value: unknown): number {
  return Buffer.byteLength(canonicalJSON(value), "utf8");
}

/** Stable, credential-free error carrying a M2 error code (spec §11). */
export class MongoApiError extends Error {
  constructor(
    public readonly code: string,
    message: string,
  ) {
    super(message);
    this.name = "MongoApiError";
  }
}

function assertCollectionName(collection: unknown): asserts collection is string {
  if (typeof collection !== "string" || collection.length === 0) {
    throw new MongoApiError("MONGO_VALIDATION_ERROR", "collection must be a non-empty string");
  }
  if (collection.includes(".")) {
    throw new MongoApiError("MONGO_INVALID_FILTER", "collection name cannot contain '.'");
  }
}

function assertSize(value: unknown, max: number, what: string): void {
  if (jsonByteSize(value) > max) {
    throw new MongoApiError("MONGO_LIMIT_EXCEEDED", `${what} exceeds the ${max}-byte limit`);
  }
}

function validateSort(sort: MongoSortSpec | undefined): Record<string, 1 | -1> | undefined {
  if (sort === undefined || sort === null) return undefined;
  if (typeof sort !== "object" || Array.isArray(sort)) {
    throw new MongoApiError("MONGO_INVALID_FILTER", "sort must be an object");
  }
  const entries = Object.entries(sort);
  if (entries.length > MAX_SORT_FIELDS) {
    throw new MongoApiError("MONGO_LIMIT_EXCEEDED", `sort exceeds ${MAX_SORT_FIELDS} fields`);
  }
  const out: Record<string, 1 | -1> = {};
  for (const [field, dir] of entries) {
    if (field.includes("$") || field.startsWith(".")) {
      throw new MongoApiError("MONGO_INVALID_FILTER", `invalid sort field '${field}'`);
    }
    if (dir === 1 || dir === "ASC") out[field] = 1;
    else if (dir === -1 || dir === "DESC") out[field] = -1;
    else throw new MongoApiError("MONGO_INVALID_FILTER", `invalid sort direction for '${field}'`);
  }
  return out;
}

function validateProjection(
  projection: MongoProjection | undefined,
): Record<string, 0 | 1> | undefined {
  if (projection === undefined || projection === null) return undefined;
  if (typeof projection !== "object" || Array.isArray(projection)) {
    throw new MongoApiError("MONGO_INVALID_FILTER", "projection must be an object");
  }
  const entries = Object.entries(projection);
  if (entries.length > MAX_PROJECTION_FIELDS) {
    throw new MongoApiError(
      "MONGO_LIMIT_EXCEEDED",
      `projection exceeds ${MAX_PROJECTION_FIELDS} fields`,
    );
  }
  const includes: string[] = [];
  const excludes: string[] = [];
  const out: Record<string, 0 | 1> = {};
  for (const [field, mode] of entries) {
    if (mode === 1 || mode === true) {
      out[field] = 1;
      includes.push(field);
    } else if (mode === 0 || mode === false) {
      out[field] = 0;
      excludes.push(field);
    } else {
      throw new MongoApiError("MONGO_INVALID_FILTER", `invalid projection mode for '${field}'`);
    }
  }
  if (includes.length > 0 && excludes.filter((f) => f !== "_id").length > 0) {
    throw new MongoApiError(
      "MONGO_INVALID_FILTER",
      "cannot mix inclusion and exclusion (except _id)",
    );
  }
  return out;
}

function assertNonEmptyFilter(filter: EJSONDocument): void {
  if (typeof filter !== "object" || filter === null || Array.isArray(filter)) {
    throw new MongoApiError("MONGO_INVALID_FILTER", "filter must be an object");
  }
  if (Object.keys(filter).length === 0) {
    throw new MongoApiError(
      "MONGO_BULK_OP_FORBIDDEN",
      "update/delete requires a non-empty filter to prevent accidental whole-collection operations",
    );
  }
}

function assertOperatorDocument(update: EJSONDocument): void {
  if (typeof update !== "object" || update === null || Array.isArray(update)) {
    throw new MongoApiError("MONGO_INVALID_UPDATE_OPERAND", "update must be an operator document");
  }
  const keys = Object.keys(update);
  if (keys.length === 0) {
    throw new MongoApiError("MONGO_INVALID_UPDATE_OPERAND", "No update operators provided");
  }
  for (const key of keys) {
    if (!key.startsWith("$")) {
      throw new MongoApiError(
        "MONGO_INVALID_UPDATE_OPERAND",
        `'${key}' is not an update operator (full-document replacement is not supported)`,
      );
    }
  }
}

function validatePipeline(pipeline: EJSONDocument[]): EJSONDocument[] {
  if (!Array.isArray(pipeline) || pipeline.length === 0) {
    throw new MongoApiError("MONGO_INVALID_PIPELINE", "pipeline must be a non-empty array");
  }
  if (pipeline.length > MAX_AGG_STAGES) {
    throw new MongoApiError("MONGO_LIMIT_EXCEEDED", `pipeline exceeds ${MAX_AGG_STAGES} stages`);
  }
  for (const stage of pipeline) {
    if (typeof stage !== "object" || stage === null || Array.isArray(stage)) {
      throw new MongoApiError("MONGO_INVALID_PIPELINE", "each pipeline stage must be an object");
    }
    const keys = Object.keys(stage);
    if (keys.length !== 1) {
      throw new MongoApiError(
        "MONGO_INVALID_PIPELINE",
        "each pipeline stage must have exactly one key",
      );
    }
    const name = keys[0];
    if (!name.startsWith("$")) {
      throw new MongoApiError("MONGO_INVALID_PIPELINE", `invalid stage name '${name}'`);
    }
    if (name === "$out" || name === "$merge") {
      throw new MongoApiError(
        "MONGO_WRITE_STAGE_FORBIDDEN",
        `write stage '${name}' is not allowed (read-only engine)`,
      );
    }
    assertSize(stage, MAX_AGG_STAGE_SIZE_BYTES, "pipeline stage");
  }
  return pipeline;
}

function clampPageSize(pageSize: number | undefined): number {
  const n =
    typeof pageSize === "number" && Number.isFinite(pageSize)
      ? Math.floor(pageSize)
      : DEFAULT_PAGE_SIZE;
  if (n < 1) return 1;
  if (n > MAX_PAGE_SIZE) return MAX_PAGE_SIZE;
  return n;
}

function clampPage(page: number | undefined): number {
  const n = typeof page === "number" && Number.isFinite(page) ? Math.floor(page) : 1;
  return n < 1 ? 1 : n;
}

function clampTimeout(ms?: number): number {
  const base = typeof ms === "number" && ms > 0 ? ms : DEFAULT_OP_TIMEOUT_MS;
  return Math.min(base, MAX_OP_TIMEOUT_MS);
}

function isEmptyObject(obj: unknown): boolean {
  return (
    typeof obj === "object" && obj !== null && !Array.isArray(obj) && Object.keys(obj).length === 0
  );
}

/**
 * Run a driver operation under a client-side timeout. On expiry the in-flight
 * driver promise is aborted and a MONGO_OPERATION_TIMEOUT error is thrown
 * (spec §12). Mirrors the AbortController pattern of the SQL streamQueryCancelable.
 */
export function withMongoTimeout<T>(
  ms: number,
  fn: (signal: AbortSignal) => Promise<T>,
): Promise<T> {
  const controller = new AbortController();
  let timer: ReturnType<typeof setTimeout> | undefined;
  const timeout = new Promise<never>((_, reject) => {
    timer = setTimeout(() => {
      controller.abort();
      reject(
        new MongoApiError("MONGO_OPERATION_TIMEOUT", `MongoDB operation timed out after ${ms}ms`),
      );
    }, ms);
  });
  const run = (async () => {
    try {
      return await fn(controller.signal);
    } finally {
      if (timer) clearTimeout(timer);
    }
  })();
  run.catch(() => {}); // avoid an unhandled rejection if the timeout wins the race
  return Promise.race([run, timeout]);
}

/** Defensive: strip any credential fragments from an error message (spec §11/§15). */
function stripCredentialTokens(message: string): string {
  return message
    .replace(/password[=:]\S+/gi, "password=<redacted>")
    .replace(/\bpasswd\b[=:]\S+/gi, "passwd=<redacted>");
}

/** Map a driver error to a stable, credential-free M2 error (spec §11). */
export function mapMongoError(err: unknown): MongoApiError {
  if (err instanceof MongoApiError) return err;
  const anyErr = err as { codeName?: string; code?: number; name?: string; message?: string };
  const codeName = anyErr?.codeName;
  const code = anyErr?.code;
  let mapped: { code: string; message: string };
  if (anyErr?.name === "MongoServerError") {
    if (codeName === "NamespaceNotFound" || code === 26) {
      mapped = { code: "MONGO_NS_NOT_FOUND", message: "Namespace not found" };
    } else if (code === 11000 || code === 11001) {
      mapped = { code: "MONGO_DUPLICATE_KEY", message: "Duplicate key" };
    } else if (codeName === "AuthenticationFailed" || code === 18) {
      mapped = { code: "MONGO_AUTH_ERROR", message: "Authentication failed" };
    } else if (codeName === "MaxTimeMSExpired" || code === 50) {
      mapped = { code: "MONGO_OPERATION_TIMEOUT", message: "Operation timed out" };
    } else {
      mapped = { code: "MONGO_UNKNOWN_ERROR", message: safeMongoError(anyErr?.message) };
    }
  } else {
    mapped = { code: "MONGO_CONNECTION_ERROR", message: safeMongoError(err) };
  }
  return new MongoApiError(mapped.code, stripCredentialTokens(mapped.message));
}

function selectCollection(config: MongoConfig, collection: string): Collection {
  return selectDb(config).collection(collection);
}

/** Whether a collection (or view) exists in the configured database. */
export async function collectionExists(config: MongoConfig, collection: string): Promise<boolean> {
  const db = selectDb(config);
  const infos = await db.listCollections({ name: collection }, { nameOnly: true }).toArray();
  return infos.length > 0;
}

/** Credential-free cache key for a document page (spec §15). */
function pageCacheKey(
  collection: string,
  filter: EJSONDocument,
  sort: Record<string, 1 | -1> | undefined,
  projection: Record<string, 0 | 1> | undefined,
  page: number,
  pageSize: number,
): string {
  const canonical = JSON.stringify([
    collection,
    filter,
    sort ?? null,
    projection ?? null,
    page,
    pageSize,
  ]);
  return createHash("sha256").update(canonical).digest("hex");
}

function buildFindResult(
  collection: string,
  documents: EJSONDocument[],
  total: number,
  page: number,
  pageSize: number,
): MongoFindResult {
  const totalPages = total === 0 ? 0 : Math.ceil(total / pageSize);
  return {
    collection,
    documents,
    total,
    page,
    pageSize,
    totalPages,
    hasMore: page * pageSize < total,
  };
}

/**
 * BSON deserialization options that keep numeric/binary values in their typed
 * form (int32 -> Int32, int64 -> Long, double -> Double, binary -> Binary)
 * instead of promoting them to plain JS numbers. Without this the driver
 * collapses every numeric BSON value to a JS number, so the EJSON converter
 * could not emit $numberInt / $numberLong / $numberDouble and the documented
 * round-trip (§7.1) would silently lose type information.
 */
const PRESERVE_BSON_TYPES = {
  promoteValues: false,
  promoteLongs: false,
  promoteBuffers: false,
} as const;

export class MongoConnector {
  async findDocuments(config: MongoConfig, req: MongoFindRequest): Promise<MongoFindResult> {
    assertCollectionName(req.collection);
    const pageSize = clampPageSize(req.pageSize);
    const page = clampPage(req.page);
    if (page > MAX_PAGE) {
      throw new MongoApiError(
        "MONGO_VALIDATION_ERROR",
        `page ${page} exceeds the maximum of ${MAX_PAGE} (use sort by _id + range for deeper pagination)`,
      );
    }
    const filter: EJSONDocument = req.filter ?? {};
    assertSize(filter, MAX_FILTER_SIZE_BYTES, "filter");
    const sort = validateSort(req.sort);
    const projection = validateProjection(req.projection);
    const bsonFilter = serializeMongoFilter(filter);
    const skip = Math.max(0, (page - 1) * pageSize);

    const coll = selectCollection(config, req.collection);
    const timeout = clampTimeout();

    const nativeDocs = await withMongoTimeout(timeout, async (signal) => {
      const options: FindOptions & { signal?: AbortSignal } = {
        signal,
        maxTimeMS: timeout,
        ...PRESERVE_BSON_TYPES,
      };
      if (sort) options.sort = sort;
      if (projection) options.projection = projection;
      const cursor = coll.find(bsonFilter, options).skip(skip).limit(pageSize);
      return (await cursor.toArray()) as unknown[];
    });

    const total = isEmptyObject(filter)
      ? await coll.estimatedDocumentCount({ maxTimeMS: timeout })
      : await coll.countDocuments(bsonFilter, { maxTimeMS: timeout });

    if (config.cacheDocuments) {
      const key = pageCacheKey(req.collection, filter, sort, projection, page, pageSize);
      const cached = mongodbCache.getDocumentPage(config, key);
      if (cached) return buildFindResult(req.collection, cached, total, page, pageSize);
    }

    const documents = nativeDocs.map((d) => mongoBSONtoEJSON(d) as EJSONDocument);

    if (config.cacheDocuments) {
      const key = pageCacheKey(req.collection, filter, sort, projection, page, pageSize);
      mongodbCache.setDocumentPage(config, key, documents);
    }

    return buildFindResult(req.collection, documents, total, page, pageSize);
  }

  async insertDocument(config: MongoConfig, req: MongoInsertRequest): Promise<MongoInsertResult> {
    assertCollectionName(req.collection);
    if (typeof req.document !== "object" || req.document === null || Array.isArray(req.document)) {
      throw new MongoApiError("MONGO_VALIDATION_ERROR", "document must be an object");
    }
    assertSize(req.document, MAX_DOCUMENT_SIZE_BYTES, "document");
    const doc = serializeMongoEJSONDocument(req.document);
    const coll = selectCollection(config, req.collection);
    const timeout = clampTimeout();

    const res = await withMongoTimeout(timeout, () => coll.insertOne(doc, { maxTimeMS: timeout }));

    const insertedId = mongoBSONtoEJSON(res.insertedId);
    const echoed = mongoBSONtoEJSON({ ...doc, _id: res.insertedId }) as EJSONDocument;
    mongodbCache.clearCollectionCache(config, req.collection);
    return { collection: req.collection, insertedId, document: echoed };
  }

  async updateDocument(config: MongoConfig, req: MongoUpdateRequest): Promise<MongoUpdateResult> {
    assertCollectionName(req.collection);
    assertNonEmptyFilter(req.filter);
    assertOperatorDocument(req.update);
    const bsonFilter = serializeMongoFilter(req.filter);
    const bsonUpdate = serializeMongoUpdateOperand(req.update);
    const multi = req.options?.multi ?? false;
    const returnDocument = req.options?.returnDocument ?? "after";
    const upsert = req.options?.upsert ?? false;
    const arrayFilters = req.options?.arrayFilters
      ? req.options.arrayFilters.map((f) => serializeMongoFilter(f))
      : undefined;
    const coll = selectCollection(config, req.collection);
    const timeout = clampTimeout();

    const result = await withMongoTimeout(timeout, async (signal) => {
      let updatedDocument: EJSONDocument | undefined;
      if (returnDocument === "before") {
        const before = await coll.findOne(bsonFilter, {
          signal,
          maxTimeMS: timeout,
          ...PRESERVE_BSON_TYPES,
        });
        updatedDocument = before ? (mongoBSONtoEJSON(before) as EJSONDocument) : undefined;
      }
      const updateOptions = {
        maxTimeMS: timeout,
        upsert,
        arrayFilters,
      };
      const r = multi
        ? await coll.updateMany(bsonFilter, bsonUpdate, updateOptions)
        : await coll.updateOne(bsonFilter, bsonUpdate, updateOptions);
      if (returnDocument !== "before") {
        // Best-effort per spec §7.2: if the follow-up read fails, omit
        // updatedDocument but still return the driver counts.
        try {
          const after = await coll.findOne(bsonFilter, {
            signal,
            maxTimeMS: timeout,
            ...PRESERVE_BSON_TYPES,
          });
          updatedDocument = after ? (mongoBSONtoEJSON(after) as EJSONDocument) : undefined;
        } catch (readErr) {
          logger.warn(
            { collection: req.collection, err: readErr },
            "mongo updateDocument follow-up read failed; returning counts only",
          );
        }
      }
      return { r, updatedDocument };
    });

    const upsertedRaw = result.r.upsertedId;
    const upsertedId =
      upsertedRaw && Object.keys(upsertedRaw).length > 0
        ? (mongoBSONtoEJSON(Object.values(upsertedRaw)[0]) as EJsonValue)
        : undefined;

    mongodbCache.clearCollectionCache(config, req.collection);
    return {
      collection: req.collection,
      matchedCount: result.r.matchedCount,
      modifiedCount: result.r.modifiedCount,
      upsertedId,
      updatedDocument: result.updatedDocument,
    };
  }

  async deleteDocument(config: MongoConfig, req: MongoDeleteRequest): Promise<MongoDeleteResult> {
    assertCollectionName(req.collection);
    assertNonEmptyFilter(req.filter);
    const bsonFilter = serializeMongoFilter(req.filter);
    const multi = req.options?.multi ?? false;
    const coll = selectCollection(config, req.collection);
    const timeout = clampTimeout();

    const res = await withMongoTimeout(timeout, () =>
      multi
        ? coll.deleteMany(bsonFilter, { maxTimeMS: timeout })
        : coll.deleteOne(bsonFilter, { maxTimeMS: timeout }),
    );

    logger.debug(
      { collection: req.collection, deletedCount: res.deletedCount },
      "mongo deleteDocument",
    );
    mongodbCache.clearCollectionCache(config, req.collection);
    return { collection: req.collection, deletedCount: res.deletedCount };
  }

  async runAggregation(
    config: MongoConfig,
    req: MongoAggregationRequest,
  ): Promise<MongoAggregationResult> {
    assertCollectionName(req.collection);
    const stages = validatePipeline(req.pipeline).map((stage) =>
      serializeMongoPipelineStage(stage),
    );
    const timeout = clampTimeout(req.options?.maxTimeMS);
    const allowDiskUse = req.options?.allowDiskUse ?? false;
    const coll = selectCollection(config, req.collection);

    const started = Date.now();
    const nativeDocs = await withMongoTimeout(timeout, (signal) => {
      const options: AggregateOptions & { signal?: AbortSignal } = {
        signal,
        maxTimeMS: timeout,
        allowDiskUse,
        ...PRESERVE_BSON_TYPES,
      };
      if (typeof req.options?.batchSize === "number") options.batchSize = req.options.batchSize;
      return coll.aggregate(stages, options).toArray();
    });

    if (nativeDocs.length > MAX_AGG_RESULTS) {
      throw new MongoApiError(
        "MONGO_LIMIT_EXCEEDED",
        `aggregation returned ${nativeDocs.length} documents (max ${MAX_AGG_RESULTS}); add a $limit stage`,
      );
    }

    const documents = nativeDocs.map((d) => mongoBSONtoEJSON(d) as EJSONDocument);
    return {
      collection: req.collection,
      documents,
      stageCount: stages.length,
      executionTimeMs: Date.now() - started,
    };
  }
}

export const mongoConnector = new MongoConnector();
