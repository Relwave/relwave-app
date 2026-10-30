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

import { MongoClient, Collection, FindOptions, AggregateOptions, Document } from "mongodb";
import { createHash } from "crypto";
import {
  MongoConfig,
  MongoCollectionInfo,
  MongoCollectionStats,
  MongoBsonType,
  MongoInferSchemaRequest,
  MongoCollectionSchema,
  MongoInferredField,
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
  MongoReplaceRequest,
  MongoReplaceResult,
  MongoCreateCollectionRequest,
  MongoCreateCollectionResult,
  MongoDropCollectionRequest,
  MongoDropCollectionResult,
  MongoAggregationRequest,
  MongoAggregationResult,
  MongoSortSpec,
  MongoProjection,
  MongoPageCacheKey,
  MongoFindOpPayload,
  MongoAggregateOpPayload,
  MongoCountOpPayload,
  MongoDistinctOpPayload,
  MongoMqlExecuteRequest,
  MongoMqlExecuteResult,
  MongoExplainRequest,
  MongoExplainResult,
  MAX_PAGE_SIZE,
  MAX_PAGE,
  DEFAULT_PAGE_SIZE,
  MAX_FILTER_SIZE_BYTES,
  MAX_SORT_FIELDS,
  MAX_PROJECTION_FIELDS,
  MAX_AGG_STAGES,
  MAX_AGG_STAGE_SIZE_BYTES,
  MAX_AGG_RESULTS,
  MAX_DISTINCT_VALUES,
  MAX_EXPRESSION_DEPTH,
  MAX_DOCUMENT_SIZE_BYTES,
  DEFAULT_OP_TIMEOUT_MS,
  MAX_OP_TIMEOUT_MS,
  MAX_SAMPLE_SIZE,
  MAX_INFERENCE_DEPTH,
  MAX_INFERRED_FIELDS,
  DEFAULT_SAMPLE_SIZE,
  DEFAULT_MAX_DEPTH,
} from "../types/mongo";
import { TableInfo, DBStats, SchemaInfo } from "../types/common";
import { CacheEntry } from "../types/cache";
import logger from "../services/logger";
import {
  serializeMongoDocument,
  serializeMongoValue,
  serializeMongoEJSONDocument,
  serializeMongoFilter,
  serializeMongoUpdateOperand,
  serializeMongoPipelineStage,
  mongoBSONtoEJSON,
  bsonTypeOf,
  bsonNumericKind,
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
const SCHEMA_CACHE_TTL = 300_000; // M3 inferred schema cache (5 min, spec §4.4, §9)

class MongoCacheManager {
  private tableListCache = new Map<string, CacheEntry<TableInfo[]>>();
  private dbStatsCache = new Map<string, CacheEntry<DBStats>>();
  // M2 collection-scoped caches (spec §14)
  private collectionStatsCache = new Map<string, CacheEntry<MongoCollectionStats>>();
  private docPageCache = new Map<string, CacheEntry<EJSONDocument[]>>();
  // M3 inferred schema cache
  private inferredSchemaCache = new Map<
    string,
    CacheEntry<MongoCollectionSchema> & { connHash: string; collection: string }
  >();

  private getConfigKey(cfg: MongoConfig): string {
    return `${cfg.uri || ""}:${cfg.database || ""}`;
  }

  /** Credential-free connection identifier for M2 query-result cache keys (spec §15). */
  private getConnHash(cfg: MongoConfig): string {
    return createHash("sha256")
      .update(cfg.uri || "")
      .digest("hex");
  }

  private getSchemaCacheKey(
    cfg: MongoConfig,
    collection: string,
    sampleSize: number,
    maxDepth: number,
  ): string {
    return createHash("sha256")
      .update(
        `${this.getConnHash(cfg)}:${cfg.database || ""}:${collection}:${sampleSize}:${maxDepth}`,
      )
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

  getInferredSchema(
    cfg: MongoConfig,
    collection: string,
    sampleSize: number,
    maxDepth: number,
  ): MongoCollectionSchema | null {
    const key = this.getSchemaCacheKey(cfg, collection, sampleSize, maxDepth);
    const entry = this.inferredSchemaCache.get(key);
    return this.isValid(entry) ? entry!.data : null;
  }

  setInferredSchema(
    cfg: MongoConfig,
    collection: string,
    sampleSize: number,
    maxDepth: number,
    data: MongoCollectionSchema,
  ): void {
    const key = this.getSchemaCacheKey(cfg, collection, sampleSize, maxDepth);
    this.inferredSchemaCache.set(key, {
      data,
      timestamp: Date.now(),
      ttl: SCHEMA_CACHE_TTL,
      connHash: this.getConnHash(cfg),
      collection,
    });
  }

  /** Evict a collection's stats + all its cached document pages (called on mutation). */
  clearCollectionCache(cfg: MongoConfig, collection: string): void {
    this.collectionStatsCache.delete(`${this.getConfigKey(cfg)}:${collection}`);
    const connHash = this.getConnHash(cfg);
    for (const k of Array.from(this.docPageCache.keys())) {
      if (k.startsWith(`${connHash}:`)) this.docPageCache.delete(k);
    }
    for (const [k, v] of Array.from(this.inferredSchemaCache.entries())) {
      if (v.connHash === connHash && v.collection === collection) {
        this.inferredSchemaCache.delete(k);
      }
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
    for (const [k, v] of Array.from(this.inferredSchemaCache.entries())) {
      if (v.connHash === connHash) {
        this.inferredSchemaCache.delete(k);
      }
    }
  }

  clearAll(): void {
    this.tableListCache.clear();
    this.dbStatsCache.clear();
    this.collectionStatsCache.clear();
    this.docPageCache.clear();
    this.inferredSchemaCache.clear();
  }

  flushConnection(cfg: MongoConfig): void {
    this.clearForConnection(cfg);
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

export function assertCollectionName(collection: unknown): asserts collection is string {
  if (typeof collection !== "string" || collection.length === 0) {
    throw new MongoApiError("MONGO_VALIDATION_ERROR", "collection must be a non-empty string");
  }
  if (Buffer.byteLength(collection, "utf8") > 120) {
    throw new MongoApiError("MONGO_VALIDATION_ERROR", "collection name must not exceed 120 bytes");
  }
  if (collection.includes("$") || collection.includes("\0")) {
    throw new MongoApiError(
      "MONGO_VALIDATION_ERROR",
      "collection name must not contain '$' or null bytes",
    );
  }
  if (collection.startsWith("system.")) {
    throw new MongoApiError(
      "MONGO_VALIDATION_ERROR",
      "collection name must not start with 'system.'",
    );
  }
}

export function assertNewCollectionName(collection: unknown): asserts collection is string {
  if (typeof collection !== "string" || collection.length === 0) {
    throw new MongoApiError("MONGO_VALIDATION_ERROR", "collection must be a non-empty string");
  }
  if (collection.length > 120) {
    throw new MongoApiError(
      "MONGO_VALIDATION_ERROR",
      "collection name must not exceed 120 characters",
    );
  }
  if (collection.includes("$") || collection.includes("\0")) {
    throw new MongoApiError(
      "MONGO_VALIDATION_ERROR",
      "collection name must not contain '$' or null bytes",
    );
  }
  if (collection.startsWith("system.")) {
    throw new MongoApiError(
      "MONGO_VALIDATION_ERROR",
      "collection name must not start with 'system.'",
    );
  }
  const VALID_NAME_REGEX = /^[a-zA-Z_][a-zA-Z0-9_-]*$/;
  if (!VALID_NAME_REGEX.test(collection)) {
    throw new MongoApiError(
      "MONGO_VALIDATION_ERROR",
      `collection name '${collection}' is invalid; must start with a letter or underscore and contain only alphanumeric, underscores, or hyphens`,
    );
  }
}

export function assertNoOperatorKeys(doc: Record<string, any>): void {
  for (const key of Object.keys(doc)) {
    if (key.startsWith("$")) {
      throw new MongoApiError(
        "MONGO_VALIDATION_ERROR",
        "replacement document must not contain top-level operator keys",
      );
    }
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

export const FORBIDDEN_PIPELINE_STAGES = new Set(["$out", "$merge"]);
export const FORBIDDEN_EXPRESSION_OPS = new Set(["$function", "$accumulator", "$where"]);

/**
 * Recursively scans an object or array for forbidden expression operators ($function, $accumulator, $where).
 */
export function assertSafeExpressions(value: unknown, depth = 0): void {
  if (depth > MAX_EXPRESSION_DEPTH) {
    throw new MongoApiError(
      "MONGO_LIMIT_EXCEEDED",
      `Expression nesting exceeds maximum depth of ${MAX_EXPRESSION_DEPTH}`,
    );
  }
  if (!value || typeof value !== "object") return;

  if (Array.isArray(value)) {
    for (const item of value) {
      assertSafeExpressions(item, depth + 1);
    }
    return;
  }

  for (const [key, val] of Object.entries(value)) {
    if (FORBIDDEN_EXPRESSION_OPS.has(key)) {
      throw new MongoApiError(
        "MONGO_FORBIDDEN_OPERATOR",
        `Operator '${key}' is forbidden (server-side JavaScript execution is not permitted)`,
      );
    }
    assertSafeExpressions(val, depth + 1);
  }
}

/**
 * Recursively validates aggregation pipeline stages and nested sub-pipelines.
 * Permits empty pipelines aggregate([]) as valid read operations.
 */
export function assertReadOnlyPipeline(pipeline: unknown[], depth = 0): void {
  if (depth > MAX_EXPRESSION_DEPTH) {
    throw new MongoApiError(
      "MONGO_LIMIT_EXCEEDED",
      `Pipeline nesting exceeds maximum depth of ${MAX_EXPRESSION_DEPTH}`,
    );
  }
  if (!Array.isArray(pipeline)) {
    throw new MongoApiError("MONGO_INVALID_PIPELINE", "Pipeline must be an array");
  }
  // Empty pipeline is valid in MongoDB; returns all documents
  if (pipeline.length === 0) {
    return;
  }
  if (pipeline.length > MAX_AGG_STAGES) {
    throw new MongoApiError("MONGO_LIMIT_EXCEEDED", `Pipeline exceeds ${MAX_AGG_STAGES} stages`);
  }

  for (const stage of pipeline) {
    if (typeof stage !== "object" || stage === null || Array.isArray(stage)) {
      throw new MongoApiError(
        "MONGO_INVALID_PIPELINE",
        "Each pipeline stage must be a non-null object",
      );
    }
    const keys = Object.keys(stage);
    if (keys.length !== 1) {
      throw new MongoApiError(
        "MONGO_INVALID_PIPELINE",
        "Each pipeline stage must have exactly one operator key",
      );
    }
    const stageName = keys[0];
    if (!stageName.startsWith("$")) {
      throw new MongoApiError(
        "MONGO_INVALID_PIPELINE",
        `Invalid stage name '${stageName}'; must begin with '$'`,
      );
    }
    if (FORBIDDEN_PIPELINE_STAGES.has(stageName)) {
      throw new MongoApiError(
        "MONGO_WRITE_STAGE_FORBIDDEN",
        `Stage '${stageName}' is forbidden in read-only aggregation queries`,
      );
    }

    assertSize(stage, MAX_AGG_STAGE_SIZE_BYTES, `Pipeline stage ${stageName}`);

    // Scan all expressions inside this stage for forbidden operators
    const stageBody = (stage as Record<string, any>)[stageName];
    assertSafeExpressions(stageBody, depth + 1);

    // Recurse into known nested sub-pipeline containers
    if (
      stageName === "$lookup" &&
      stageBody &&
      typeof stageBody === "object" &&
      !Array.isArray(stageBody)
    ) {
      if (stageBody.pipeline !== undefined) {
        if (!Array.isArray(stageBody.pipeline)) {
          throw new MongoApiError("MONGO_INVALID_PIPELINE", "$lookup.pipeline must be an array");
        }
        assertReadOnlyPipeline(stageBody.pipeline, depth + 1);
      }
    }
    if (
      stageName === "$unionWith" &&
      stageBody &&
      typeof stageBody === "object" &&
      !Array.isArray(stageBody)
    ) {
      if (stageBody.pipeline !== undefined) {
        if (!Array.isArray(stageBody.pipeline)) {
          throw new MongoApiError("MONGO_INVALID_PIPELINE", "$unionWith.pipeline must be an array");
        }
        assertReadOnlyPipeline(stageBody.pipeline, depth + 1);
      }
    }
    if (stageName === "$facet") {
      if (typeof stageBody !== "object" || stageBody === null || Array.isArray(stageBody)) {
        throw new MongoApiError(
          "MONGO_INVALID_PIPELINE",
          "$facet stage specification must be an object",
        );
      }
      for (const [facetName, facetPipeline] of Object.entries(stageBody)) {
        if (!Array.isArray(facetPipeline)) {
          throw new MongoApiError(
            "MONGO_INVALID_PIPELINE",
            `$facet pipeline for '${facetName}' must be an array`,
          );
        }
        assertReadOnlyPipeline(facetPipeline as EJSONDocument[], depth + 1);
      }
    }
  }
}

export function validatePipeline(pipeline: unknown[]): unknown[] {
  assertReadOnlyPipeline(pipeline);
  return pipeline;
}

export function clampMqlTimeout(ms: number | undefined, defaultMs: number, maxMs = 60000): number {
  if (ms === undefined || ms === null) {
    return defaultMs;
  }
  if (typeof ms !== "number" || !Number.isFinite(ms) || !Number.isInteger(ms) || ms <= 0) {
    throw new MongoApiError("MONGO_VALIDATION_ERROR", "maxTimeMS must be a positive integer");
  }
  return Math.min(Math.max(1, ms), maxMs);
}

export const WHITELIST_READ_OPS = new Set([
  "find",
  "aggregate",
  "countDocuments",
  "estimatedDocumentCount",
  "distinct",
]);

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

// ---- M3 Clamping Helpers (docs/MONGODB_M3_SPEC.md §4.4, §4.6) ----

export function clampInferSampleSize(size?: number): number {
  if (typeof size !== "number" || isNaN(size)) return DEFAULT_SAMPLE_SIZE;
  return Math.min(Math.max(1, Math.floor(size)), MAX_SAMPLE_SIZE);
}

export function clampInferMaxDepth(depth?: number): number {
  if (typeof depth !== "number" || isNaN(depth)) return DEFAULT_MAX_DEPTH;
  return Math.min(Math.max(1, Math.floor(depth)), MAX_INFERENCE_DEPTH);
}

function isPlainRecord(v: unknown): v is Record<string, unknown> {
  return (
    typeof v === "object" &&
    v !== null &&
    !Array.isArray(v) &&
    !(v instanceof Date) &&
    !Buffer.isBuffer(v) &&
    !(v instanceof Uint8Array) &&
    !(v as any)._bsontype
  );
}

interface FieldAccumulatorStats {
  path: string;
  depth: number;
  parentPath?: string;
  isArray: boolean;
  isNested: boolean;
  count: number;
  nullCount: number;
  typeCounts: Map<MongoBsonType, number>;
  numericKinds: Set<"int" | "double">;
  arrayElementTypes: Set<MongoBsonType>;
  sampleValue?: EJSONDocument | any;
  maxChildDepth?: number;
  truncated?: boolean;
}

/**
 * Pure statistical accumulator over driver-native documents for schema inference.
 * Never makes network or driver calls (docs/MONGODB_M3_SPEC.md §4.4).
 */
export class FieldAccumulator {
  private fieldMap = new Map<string, FieldAccumulatorStats>();

  constructor(
    public readonly sampleSize: number,
    public readonly maxDepth: number,
  ) {}

  ingest(doc: Document | Record<string, unknown>, parentPath = "", depth = 0): void {
    if (!doc || typeof doc !== "object" || Array.isArray(doc)) return;

    for (const [key, value] of Object.entries(doc)) {
      if (key === "_bsontype") continue;

      const path = parentPath ? `${parentPath}.${key}` : key;

      if (!this.fieldMap.has(path)) {
        if (this.fieldMap.size >= MAX_INFERRED_FIELDS) {
          if (parentPath && this.fieldMap.has(parentPath)) {
            this.fieldMap.get(parentPath)!.truncated = true;
          }
          continue;
        }
        this.fieldMap.set(path, {
          path,
          depth,
          parentPath: parentPath || undefined,
          isArray: false,
          isNested: false,
          count: 0,
          nullCount: 0,
          typeCounts: new Map<MongoBsonType, number>(),
          numericKinds: new Set<"int" | "double">(),
          arrayElementTypes: new Set<MongoBsonType>(),
        });
      }

      const stats = this.fieldMap.get(path)!;

      if (parentPath) {
        let p: string | undefined = parentPath;
        while (p) {
          const ancestor = this.fieldMap.get(p);
          if (ancestor) {
            ancestor.maxChildDepth = Math.max(ancestor.maxChildDepth ?? 0, depth);
            p = ancestor.parentPath;
          } else {
            break;
          }
        }
      }

      const bType = bsonTypeOf(value);
      stats.typeCounts.set(bType, (stats.typeCounts.get(bType) || 0) + 1);

      if (value !== undefined) {
        stats.count++;
      }
      if (value === null) {
        stats.nullCount++;
      }

      if (stats.sampleValue === undefined && value !== undefined && value !== null) {
        stats.sampleValue = serializeMongoValue(value);
      }

      if (bType === "number") {
        const numKind = bsonNumericKind(value);
        if (numKind) {
          stats.numericKinds.add(numKind);
        }
      }

      if (Array.isArray(value)) {
        stats.isArray = true;
        for (const item of value) {
          stats.arrayElementTypes.add(bsonTypeOf(item));
        }
      } else if (isPlainRecord(value)) {
        stats.isNested = true;
        if (depth < this.maxDepth) {
          this.ingest(value, path, depth + 1);
        } else {
          stats.truncated = true;
        }
      }
    }
  }

  toFields(): MongoInferredField[] {
    const fields: MongoInferredField[] = [];

    for (const stats of this.fieldMap.values()) {
      const sortedTypes = Array.from(stats.typeCounts.entries()).sort((a, b) => {
        if (b[1] !== a[1]) return b[1] - a[1];
        if (a[0] === "null" || a[0] === "undefined") return 1;
        if (b[0] === "null" || b[0] === "undefined") return -1;
        return a[0].localeCompare(b[0]);
      });

      const dominantType = sortedTypes.length > 0 ? sortedTypes[0][0] : "null";
      const types = sortedTypes.map(([t]) => t);

      const typeConflicts =
        types.length > 1 ? sortedTypes.map(([bsonType, count]) => ({ bsonType, count })) : [];

      const presencePct =
        this.sampleSize > 0 ? Math.round((stats.count / this.sampleSize) * 1000) / 10 : 0;

      const field: MongoInferredField = {
        path: stats.path,
        bsonType: dominantType,
        types,
        numericKinds:
          stats.numericKinds.size > 0
            ? (Array.from(stats.numericKinds).sort() as Array<"int" | "double">)
            : undefined,
        depth: stats.depth,
        parentPath: stats.parentPath,
        isArray: stats.isArray,
        isNested: stats.isNested,
        count: stats.count,
        nullCount: stats.nullCount,
        sampleSize: this.sampleSize,
        presencePct,
        nullable: stats.nullCount > 0,
        optional: stats.count < this.sampleSize,
        typeConflicts,
        arrayElementTypes: stats.isArray ? Array.from(stats.arrayElementTypes).sort() : undefined,
        sampleValue: stats.sampleValue,
        maxChildDepth: stats.maxChildDepth,
        truncated: stats.truncated ? true : undefined,
      };

      fields.push(field);
    }

    fields.sort((a, b) => {
      if (a.depth !== b.depth) return a.depth - b.depth;
      return a.path.localeCompare(b.path);
    });

    return fields;
  }
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
    if (
      req.filter !== undefined &&
      (typeof req.filter !== "object" || req.filter === null || Array.isArray(req.filter))
    ) {
      throw new MongoApiError("MONGO_INVALID_FILTER", "filter must be an object");
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

  async replaceDocument(
    config: MongoConfig,
    req: MongoReplaceRequest,
  ): Promise<MongoReplaceResult> {
    assertCollectionName(req.collection);
    assertNonEmptyFilter(req.filter);
    if (
      typeof req.replacement !== "object" ||
      req.replacement === null ||
      Array.isArray(req.replacement)
    ) {
      throw new MongoApiError("MONGO_VALIDATION_ERROR", "replacement document must be an object");
    }
    assertNoOperatorKeys(req.replacement);
    assertSize(req.replacement, MAX_DOCUMENT_SIZE_BYTES, "replacement");

    if (req.replacement._id !== undefined && req.filter._id !== undefined) {
      if (canonicalJSON(req.replacement._id) !== canonicalJSON(req.filter._id)) {
        throw new MongoApiError("MONGO_VALIDATION_ERROR", "Cannot change _id of a document");
      }
    }

    const bsonFilter = serializeMongoFilter(req.filter);
    const doc = serializeMongoEJSONDocument(req.replacement);
    const upsert = req.options?.upsert ?? false;
    const returnDocument = req.options?.returnDocument ?? "after";
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
      const replaceOptions = {
        maxTimeMS: timeout,
        upsert,
      };
      const r = await coll.replaceOne(bsonFilter, doc, replaceOptions);
      if (returnDocument !== "before") {
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
            "mongo replaceDocument follow-up read failed; returning counts only",
          );
        }
      }
      return { r, updatedDocument };
    });

    const upsertedRaw = result.r.upsertedId;
    const upsertedId =
      upsertedRaw && Object.keys(upsertedRaw).length > 0
        ? (mongoBSONtoEJSON(Object.values(upsertedRaw)[0]) as EJsonValue)
        : upsertedRaw
          ? (mongoBSONtoEJSON(upsertedRaw) as EJsonValue)
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
    assertReadOnlyPipeline(req.pipeline);
    const stages = (req.pipeline || []).map((stage) => serializeMongoPipelineStage(stage));
    const timeout = clampMqlTimeout(req.options?.maxTimeMS, 10000, 60000);
    const allowDiskUse =
      typeof req.options?.allowDiskUse === "boolean" ? req.options.allowDiskUse : false;
    const coll = selectCollection(config, req.collection);

    const started = Date.now();
    const nativeDocs: Document[] = [];
    await withMongoTimeout(timeout, async (signal) => {
      const options: AggregateOptions & { signal?: AbortSignal } = {
        signal,
        maxTimeMS: timeout,
        allowDiskUse,
        ...PRESERVE_BSON_TYPES,
      };
      if (
        typeof req.options?.batchSize === "number" &&
        Number.isInteger(req.options.batchSize) &&
        req.options.batchSize > 0
      ) {
        options.batchSize = req.options.batchSize;
      }
      const cursor = coll.aggregate(stages, options);
      try {
        for await (const doc of cursor) {
          nativeDocs.push(doc);
          if (nativeDocs.length > MAX_AGG_RESULTS) {
            throw new MongoApiError(
              "MONGO_LIMIT_EXCEEDED",
              `aggregation returned more than ${MAX_AGG_RESULTS} documents (max ${MAX_AGG_RESULTS}); add a $limit stage`,
            );
          }
        }
      } finally {
        await cursor.close().catch(() => {});
      }
    });

    const documents = nativeDocs.map((d) => mongoBSONtoEJSON(d) as EJSONDocument);
    return {
      collection: req.collection,
      documents,
      stageCount: stages.length,
      executionTimeMs: Date.now() - started,
    };
  }

  async executeMql(
    config: MongoConfig,
    req: MongoMqlExecuteRequest,
  ): Promise<MongoMqlExecuteResult> {
    return executeMql(config, req);
  }

  async explainMql(config: MongoConfig, req: MongoExplainRequest): Promise<MongoExplainResult> {
    return explainMql(config, req);
  }

  async listCollections(config: MongoConfig): Promise<MongoCollectionInfo[]> {
    return listCollections(config);
  }

  async inferCollectionSchema(
    config: MongoConfig,
    req: MongoInferSchemaRequest,
  ): Promise<MongoCollectionSchema> {
    assertCollectionName(req.collection);
    const sampleSize = clampInferSampleSize(req.sampleSize);
    const maxDepth = clampInferMaxDepth(req.maxDepth);

    const cached = mongodbCache.getInferredSchema(config, req.collection, sampleSize, maxDepth);
    if (cached) {
      return cached;
    }

    const coll = selectCollection(config, req.collection);
    const timeout = clampTimeout();

    const nativeDocs = (await withMongoTimeout(timeout, (signal) =>
      coll
        .find({}, { signal, maxTimeMS: timeout, limit: sampleSize, ...PRESERVE_BSON_TYPES })
        .toArray(),
    )) as Array<Document | Record<string, unknown>>;

    const actualSampleSize = nativeDocs.length;
    const acc = new FieldAccumulator(actualSampleSize, maxDepth);
    for (const doc of nativeDocs) {
      acc.ingest(doc, "", 0);
    }
    const fields = acc.toFields();

    let totalDocs = 0;
    try {
      totalDocs = await coll.estimatedDocumentCount({ maxTimeMS: timeout });
    } catch {
      try {
        totalDocs = await coll.countDocuments({}, { maxTimeMS: timeout });
      } catch {
        totalDocs = actualSampleSize;
      }
    }

    const sampleDocuments = nativeDocs
      .slice(0, 5)
      .map((d) => serializeMongoDocument(d as Document));

    const schema: MongoCollectionSchema = {
      collection: req.collection,
      sampleSize: actualSampleSize,
      totalDocs,
      inferredAt: new Date().toISOString(),
      fieldCount: fields.length,
      nestedFieldCount: fields.filter((f) => f.depth > 0).length,
      arrayFieldCount: fields.filter((f) => f.isArray).length,
      fields,
      sampleDocuments,
    };

    if (config.cacheDocuments !== false) {
      mongodbCache.setInferredSchema(config, req.collection, sampleSize, maxDepth, schema);
    }

    return schema;
  }

  async createCollection(
    config: MongoConfig,
    req: MongoCreateCollectionRequest,
  ): Promise<MongoCreateCollectionResult> {
    assertNewCollectionName(req.collection);
    if (req.options?.capped) {
      const { size, max } = req.options;
      if (typeof size !== "number" || !Number.isInteger(size) || size < 4096) {
        throw new MongoApiError(
          "MONGO_VALIDATION_ERROR",
          "Capped collection size must be an integer >= 4096 bytes",
        );
      }
      if (max !== undefined && (typeof max !== "number" || !Number.isInteger(max) || max <= 0)) {
        throw new MongoApiError(
          "MONGO_VALIDATION_ERROR",
          "Capped collection max must be a positive integer",
        );
      }
    }
    const db = selectDb(config);
    const timeout = clampTimeout();
    await withMongoTimeout(timeout, () => db.createCollection(req.collection, req.options as any));
    mongodbCache.flushConnection(config);
    return { ok: true, collection: req.collection };
  }

  async dropCollection(
    config: MongoConfig,
    req: MongoDropCollectionRequest,
  ): Promise<MongoDropCollectionResult> {
    if (typeof req.collection === "string" && req.collection.startsWith("system.")) {
      throw new MongoApiError("MONGO_FORBIDDEN", "Cannot drop system collection");
    }
    assertCollectionName(req.collection);
    const coll = selectCollection(config, req.collection);
    const timeout = clampTimeout();
    let dropped: boolean = true;
    try {
      dropped = await withMongoTimeout(timeout, () => coll.drop());
    } catch (err: any) {
      if (err?.codeName === "NamespaceNotFound" || err?.code === 26) {
        throw new MongoApiError("MONGO_NOT_FOUND", `Collection '${req.collection}' does not exist`);
      }
      throw err;
    }
    if (dropped === false) {
      throw new MongoApiError("MONGO_NOT_FOUND", `Collection '${req.collection}' does not exist`);
    }
    mongodbCache.clearCollectionCache(config, req.collection);
    mongodbCache.flushConnection(config);
    return { ok: true, collection: req.collection };
  }
}

export const mongoConnector = new MongoConnector();

// ===========================================================================
// M5 — MQL Query Workspace & Read-Only Engine (docs/MONGODB_M5_SPEC.md §3, §5)
// ===========================================================================

export async function executeMql(
  config: MongoConfig,
  req: MongoMqlExecuteRequest,
): Promise<MongoMqlExecuteResult> {
  const op = req?.op;
  const opName = (op as any)?.operation;

  if (!opName || !WHITELIST_READ_OPS.has(opName)) {
    throw new MongoApiError(
      "MONGO_FORBIDDEN_OPERATION",
      `Operation '${opName || "unknown"}' is forbidden in read-only query workspace. Use RelWave document mutation actions.`,
    );
  }

  assertCollectionName(req.collection);
  const coll = selectCollection(config, req.collection);
  const started = Date.now();

  switch (op.operation) {
    case "find": {
      const payload: MongoFindOpPayload = op.payload ?? { filter: {} };
      if (typeof payload !== "object" || payload === null || Array.isArray(payload)) {
        throw new MongoApiError("MONGO_VALIDATION_ERROR", "find payload must be an object");
      }
      if (
        payload.filter !== undefined &&
        (typeof payload.filter !== "object" ||
          payload.filter === null ||
          Array.isArray(payload.filter))
      ) {
        throw new MongoApiError("MONGO_INVALID_FILTER", "filter must be an object");
      }
      const filter: EJSONDocument = payload.filter ?? {};
      assertSafeExpressions(filter);
      assertSize(filter, MAX_FILTER_SIZE_BYTES, "filter");

      const sort = validateSort(payload.sort);
      const projection = validateProjection(payload.projection);

      if (payload.skip !== undefined) {
        if (
          typeof payload.skip !== "number" ||
          !Number.isFinite(payload.skip) ||
          !Number.isInteger(payload.skip) ||
          payload.skip < 0
        ) {
          throw new MongoApiError("MONGO_VALIDATION_ERROR", "skip must be a non-negative integer");
        }
      }

      let limit = DEFAULT_PAGE_SIZE;
      if (typeof payload.limit === "number" && Number.isFinite(payload.limit)) {
        const floored = Math.floor(payload.limit);
        if (floored >= 1) {
          limit = Math.min(floored, MAX_PAGE_SIZE);
        }
      }

      const timeout = clampMqlTimeout(req.options?.maxTimeMS, 5000, 60000);
      const bsonFilter = serializeMongoFilter(filter);

      const nativeDocs = await withMongoTimeout(timeout, (signal) => {
        const options: FindOptions & { signal?: AbortSignal } = {
          signal,
          maxTimeMS: timeout,
          limit,
          ...PRESERVE_BSON_TYPES,
        };
        if (sort) options.sort = sort;
        if (projection) options.projection = projection;
        if (payload.skip !== undefined) options.skip = payload.skip;
        return coll.find(bsonFilter, options).toArray();
      });

      const documents = nativeDocs.map((d) => mongoBSONtoEJSON(d) as EJSONDocument);
      return {
        operation: "find",
        collection: req.collection,
        documents,
        totalReturned: documents.length,
        executionTimeMs: Date.now() - started,
      };
    }

    case "aggregate": {
      const payload: MongoAggregateOpPayload = op.payload;
      if (typeof payload !== "object" || payload === null || Array.isArray(payload)) {
        throw new MongoApiError("MONGO_VALIDATION_ERROR", "aggregate payload must be an object");
      }
      assertReadOnlyPipeline(payload.pipeline);
      const stages = (payload.pipeline || []).map((stage) => serializeMongoPipelineStage(stage));
      const timeout = clampMqlTimeout(req.options?.maxTimeMS, 10000, 60000);
      const allowDiskUse = typeof payload.allowDiskUse === "boolean" ? payload.allowDiskUse : false;

      const nativeDocs: Document[] = [];
      await withMongoTimeout(timeout, async (signal) => {
        const options: AggregateOptions & { signal?: AbortSignal } = {
          signal,
          maxTimeMS: timeout,
          allowDiskUse,
          ...PRESERVE_BSON_TYPES,
        };
        if (
          typeof payload.batchSize === "number" &&
          Number.isInteger(payload.batchSize) &&
          payload.batchSize > 0
        ) {
          options.batchSize = payload.batchSize;
        }
        const cursor = coll.aggregate(stages, options);
        try {
          for await (const doc of cursor) {
            nativeDocs.push(doc);
            if (nativeDocs.length > MAX_AGG_RESULTS) {
              throw new MongoApiError(
                "MONGO_LIMIT_EXCEEDED",
                `aggregation returned more than ${MAX_AGG_RESULTS} documents (max ${MAX_AGG_RESULTS}); add a $limit stage`,
              );
            }
          }
        } finally {
          await cursor.close().catch(() => {});
        }
      });

      const documents = nativeDocs.map((d) => mongoBSONtoEJSON(d) as EJSONDocument);
      return {
        operation: "aggregate",
        collection: req.collection,
        documents,
        stageCount: stages.length,
        executionTimeMs: Date.now() - started,
      };
    }

    case "countDocuments": {
      const payload: MongoCountOpPayload = op.payload ?? {};
      if (typeof payload !== "object" || payload === null || Array.isArray(payload)) {
        throw new MongoApiError(
          "MONGO_VALIDATION_ERROR",
          "countDocuments payload must be an object",
        );
      }
      if (
        payload.filter !== undefined &&
        (typeof payload.filter !== "object" ||
          payload.filter === null ||
          Array.isArray(payload.filter))
      ) {
        throw new MongoApiError("MONGO_INVALID_FILTER", "filter must be an object");
      }
      const filter: EJSONDocument = payload.filter ?? {};
      assertSafeExpressions(filter);
      assertSize(filter, MAX_FILTER_SIZE_BYTES, "filter");

      if (payload.skip !== undefined) {
        if (
          typeof payload.skip !== "number" ||
          !Number.isFinite(payload.skip) ||
          !Number.isInteger(payload.skip) ||
          payload.skip < 0
        ) {
          throw new MongoApiError("MONGO_VALIDATION_ERROR", "skip must be a non-negative integer");
        }
      }

      if (payload.limit !== undefined) {
        if (
          typeof payload.limit !== "number" ||
          !Number.isFinite(payload.limit) ||
          !Number.isInteger(payload.limit) ||
          payload.limit < 0
        ) {
          throw new MongoApiError("MONGO_VALIDATION_ERROR", "limit must be a non-negative integer");
        }
      }

      const timeout = clampMqlTimeout(req.options?.maxTimeMS, 5000, 60000);
      const bsonFilter = serializeMongoFilter(filter);

      const count = await withMongoTimeout(timeout, (signal) => {
        const options: { maxTimeMS?: number; signal?: AbortSignal; skip?: number; limit?: number } =
          {
            maxTimeMS: timeout,
            signal,
          };
        if (payload.skip !== undefined) options.skip = payload.skip;
        if (payload.limit !== undefined) options.limit = payload.limit;
        return coll.countDocuments(bsonFilter, options);
      });

      return {
        operation: "countDocuments",
        collection: req.collection,
        count,
        executionTimeMs: Date.now() - started,
      };
    }

    case "estimatedDocumentCount": {
      if (
        op.payload !== undefined &&
        (typeof op.payload !== "object" ||
          op.payload === null ||
          Array.isArray(op.payload) ||
          Object.keys(op.payload).length > 0)
      ) {
        throw new MongoApiError(
          "MONGO_VALIDATION_ERROR",
          "estimatedDocumentCount does not accept a filter; payload must be empty or undefined. Use countDocuments for filtered counts.",
        );
      }
      const timeout = clampMqlTimeout(req.options?.maxTimeMS, 5000, 60000);

      const count = await withMongoTimeout(timeout, (signal) =>
        coll.estimatedDocumentCount({ maxTimeMS: timeout, signal } as any),
      );

      return {
        operation: "estimatedDocumentCount",
        collection: req.collection,
        count,
        executionTimeMs: Date.now() - started,
      };
    }

    case "distinct": {
      const payload: MongoDistinctOpPayload = op.payload;
      if (typeof payload !== "object" || payload === null || Array.isArray(payload)) {
        throw new MongoApiError("MONGO_VALIDATION_ERROR", "distinct payload must be an object");
      }
      if (typeof payload.field !== "string" || payload.field.trim().length === 0) {
        throw new MongoApiError("MONGO_VALIDATION_ERROR", "field must be a non-empty string");
      }
      if (
        payload.filter !== undefined &&
        (typeof payload.filter !== "object" ||
          payload.filter === null ||
          Array.isArray(payload.filter))
      ) {
        throw new MongoApiError("MONGO_INVALID_FILTER", "filter must be an object");
      }
      const filter: EJSONDocument = payload.filter ?? {};
      assertSafeExpressions(filter);
      assertSize(filter, MAX_FILTER_SIZE_BYTES, "filter");

      const timeout = clampMqlTimeout(req.options?.maxTimeMS, 5000, 60000);
      const bsonFilter = serializeMongoFilter(filter);

      let rawValues = await withMongoTimeout(timeout, (signal) =>
        coll.distinct(payload.field, bsonFilter, { maxTimeMS: timeout, signal } as any),
      );

      if (rawValues.length > MAX_DISTINCT_VALUES) {
        rawValues = rawValues.slice(0, MAX_DISTINCT_VALUES);
      }

      const values = rawValues.map((v) => mongoBSONtoEJSON(v) as EJsonValue);
      return {
        operation: "distinct",
        collection: req.collection,
        field: payload.field,
        values,
        count: values.length,
        executionTimeMs: Date.now() - started,
      };
    }
  }
}

export async function explainMql(
  config: MongoConfig,
  req: MongoExplainRequest,
): Promise<MongoExplainResult> {
  const target = req?.target;
  const op = (target as any)?.operation;

  if (op !== "find" && op !== "aggregate") {
    throw new MongoApiError(
      "MONGO_FORBIDDEN_OPERATION",
      "Explain is only supported for 'find' and 'aggregate' operations",
    );
  }

  assertCollectionName(req.collection);
  const coll = selectCollection(config, req.collection);

  const verbosity = req.verbosity || "queryPlanner";
  if (!["queryPlanner", "executionStats", "allPlansExecution"].includes(verbosity)) {
    throw new MongoApiError("MONGO_VALIDATION_ERROR", `Invalid explain verbosity '${verbosity}'`);
  }

  const defaultTimeout =
    verbosity === "queryPlanner" ? 5000 : verbosity === "executionStats" ? 10000 : 15000;
  const timeout = clampMqlTimeout(req.options?.maxTimeMS, defaultTimeout, 60000);
  const started = Date.now();

  let raw: any;
  if (target.operation === "find") {
    if (
      target.filter !== undefined &&
      (typeof target.filter !== "object" || target.filter === null || Array.isArray(target.filter))
    ) {
      throw new MongoApiError("MONGO_INVALID_FILTER", "filter must be an object");
    }
    const filter: EJSONDocument = target.filter ?? {};
    assertSafeExpressions(filter);
    assertSize(filter, MAX_FILTER_SIZE_BYTES, "filter");

    const sort = validateSort(target.sort);
    const projection = validateProjection(target.projection);

    if (target.skip !== undefined) {
      if (
        typeof target.skip !== "number" ||
        !Number.isFinite(target.skip) ||
        !Number.isInteger(target.skip) ||
        target.skip < 0
      ) {
        throw new MongoApiError("MONGO_VALIDATION_ERROR", "skip must be a non-negative integer");
      }
    }

    const bsonFilter = serializeMongoFilter(filter);
    const cursor = coll.find(bsonFilter, { maxTimeMS: timeout, ...PRESERVE_BSON_TYPES });
    if (sort) cursor.sort(sort);
    if (projection) cursor.project(projection);
    if (target.skip !== undefined) cursor.skip(target.skip);
    if (typeof target.limit === "number" && Number.isFinite(target.limit)) {
      const floored = Math.floor(target.limit);
      if (floored >= 1) cursor.limit(Math.min(floored, MAX_PAGE_SIZE));
    }

    raw = await withMongoTimeout(timeout, () => cursor.explain(verbosity));
  } else {
    // aggregate
    assertReadOnlyPipeline(target.pipeline);
    const stages = (target.pipeline || []).map((stage) => serializeMongoPipelineStage(stage));
    const cursor = coll.aggregate(stages, {
      maxTimeMS: timeout,
      allowDiskUse: target.allowDiskUse ?? false,
      ...PRESERVE_BSON_TYPES,
    });

    raw = await withMongoTimeout(timeout, () => cursor.explain(verbosity));
  }

  const rawObj = (raw || {}) as Record<string, any>;
  const queryPlanner = rawObj.queryPlanner || {
    plannerVersion: 1,
    namespace: `${config.database || ""}.${req.collection}`,
    indexFilterSet: false,
    winningPlan: rawObj.stages ? { stages: rawObj.stages } : rawObj.winningPlan || {},
  };

  const executionStats = rawObj.executionStats
    ? {
        executionSuccess: rawObj.executionStats.executionSuccess ?? true,
        nReturned: rawObj.executionStats.nReturned ?? 0,
        executionTimeMillis: rawObj.executionStats.executionTimeMillis ?? 0,
        totalKeysExamined: rawObj.executionStats.totalKeysExamined ?? 0,
        totalDocsExamined: rawObj.executionStats.totalDocsExamined ?? 0,
        executionStages: rawObj.executionStats.executionStages || {},
        allPlansExecution: rawObj.executionStats.allPlansExecution,
      }
    : undefined;

  const serverInfo = rawObj.serverInfo
    ? {
        host: rawObj.serverInfo.host,
        port: rawObj.serverInfo.port,
        version: rawObj.serverInfo.version,
      }
    : undefined;

  return {
    collection: req.collection,
    operation: target.operation,
    queryPlanner,
    executionStats,
    serverInfo,
    rawExplain: (mongoBSONtoEJSON(raw) as Record<string, unknown>) || {},
    executionTimeMs: Date.now() - started,
  };
}
