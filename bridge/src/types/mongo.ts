/**
 * MongoDB-specific Types
 *
 * Single source of Mongo types for the bridge. Kept deliberately separate from
 * `common.ts` (which models the relational catalog) so that "row / table /
 * primary key" is never the conceptual MongoDB model. The connector reuses the
 * shared `TableInfo` / `DBStats` shapes only as compatibility adapters for the
 * existing relational RPC surface.
 */

/**
 * Connection configuration handed to the connector by ConnectionBuilder.
 * `uri` is the authoritative field: it is the (runtime-reconstructed)
 * authenticated `mongodb://` / `mongodb+srv://` connection string. The other
 * fields are carried for completeness / composed-form connections.
 */
export type MongoConfig = {
  uri?: string; // full authenticated connection string (preferred)
  host?: string; // composed-form fallback
  port?: number;
  user?: string;
  password?: string; // present only transiently when composing a URI; never persisted
  database?: string; // default/auth database
  authSource?: string;
  replicaSet?: string;
  tls?: boolean;
  directConnection?: boolean;
  /**
   * M2 (opt-in): when true, findDocuments caches paginated pages briefly.
   * Off by default to avoid stale reads (spec §14 / D-M2-5).
   */
  cacheDocuments?: boolean;
};

// ---------------------------------------------------------------------------
// Typed BSON-to-wire representation (see connectors/mongoBson.ts).
// Every value here is safe to pass through JSON.stringify on the stdio channel.
// ---------------------------------------------------------------------------

export type MongoWireObject = { [key: string]: MongoWireValue };
export type MongoWireArray = MongoWireValue[];

export type MongoWireObjectId = { $oid: string };
export type MongoWireDate = { $date: string }; // ISO-8601 UTC
export type MongoWireBinary = { $binary: { base64: string; subtype: string } };
export type MongoWireDecimal = { $numberDecimal: string };
export type MongoWireLong = { $numberLong: string };
export type MongoWireTimestamp = { $timestamp: { t: number; i: number } };
export type MongoWireUndefined = { $undefined: true };

export type MongoWireValue =
  | null
  | boolean
  | number
  | string
  | MongoWireArray
  | MongoWireObject
  | MongoWireObjectId
  | MongoWireDate
  | MongoWireBinary
  | MongoWireDecimal
  | MongoWireLong
  | MongoWireTimestamp
  | MongoWireUndefined;

export type SerializedMongoDocument = { [key: string]: MongoWireValue };

// ---------------------------------------------------------------------------
// Native document-oriented result shapes.
// `MongoCollectionInfo` is used in M1 (collection listing). The inferred-schema
// shapes are declared now so the connector contract is complete and typed; they
// are consumed starting in a later milestone.
// ---------------------------------------------------------------------------

export type MongoCollectionInfo = { name: string; type: "collection" | "view" };

export type MongoInferredField = {
  path: string;
  bsonType: string;
  presentInPct: number;
  sampleCount: number;
  nested?: MongoInferredField[];
};

export type MongoInferredSchema = {
  collection: string;
  fields: MongoInferredField[];
  sampled: number;
  totalDocs?: number;
};

/**
 * Result of parsing a MongoDB URI that may embed credentials.
 * `sanitizedUri` never contains a password and is what gets persisted at rest.
 */
export type MongoUriParts = {
  sanitizedUri: string;
  username?: string;
  password?: string;
  hasCredentials: boolean;
};

// ===========================================================================
// M2 — MongoDB Document Engine (see docs/MONGODB_M2_SPEC.md)
// Extended-JSON document model, operation request/response types, and the
// safety/limit constants enforced by the connector. Everything below this line
// is new in M2; nothing above it changes.
// ===========================================================================

/**
 * MongoDB Extended JSON v2 type wrappers. A value crossing the JSON-RPC boundary
 * uses these to represent BSON types plain JSON cannot carry. A bare 24-char hex
 * string is a STRING, not an ObjectId — ObjectId must use $oid (spec §4.2 / D-M2-6).
 */
export type EJSONTypeWrapper =
  | { $oid: string }
  | { $date: string }
  | { $date: { $numberLong: string } }
  | { $numberInt: string }
  | { $numberLong: string }
  | { $numberDouble: string }
  | { $numberDecimal: string }
  | { $binary: { $type: string; $base64: string } }
  | { $regex: string; $options?: string }
  | { $timestamp: { $t: string; $i: string } }
  | { $undefined: Record<string, never> };

/** A JSON-RPC-safe value: plain JSON plus EJSON type wrappers. */
export type EJsonValue =
  string | number | boolean | null | EJsonValue[] | EJSONDocument | EJSONTypeWrapper;

/** A JSON-RPC-safe document (string keys → EJSON values). */
export type EJSONDocument = { [key: string]: EJsonValue };

/** Stable, credential-free key identifying a cached document page (spec §14). */
export type MongoPageCacheKey = string;

/** Per-collection statistics shape used by the M2 cache (spec §14). */
export type MongoCollectionStats = {
  collection: string;
  count: number;
  sizeBytes: number;
  avgObjSize: number;
};

// --- Shared value objects (spec §5.1) ---

export type MongoSortDirection = 1 | -1 | "ASC" | "DESC";
export type MongoSortSpec = { [field: string]: MongoSortDirection };
export type MongoProjection = { [field: string]: 0 | 1 | false | true };

// --- findDocuments (spec §5.2) ---

export interface MongoFindRequest {
  collection: string;
  filter?: EJSONDocument;
  sort?: MongoSortSpec;
  projection?: MongoProjection;
  page?: number;
  pageSize?: number;
}

export interface MongoFindResult {
  collection: string;
  documents: EJSONDocument[];
  total: number;
  page: number;
  pageSize: number;
  totalPages: number;
  hasMore: boolean;
}

// --- insertDocument (spec §5.3) ---

export interface MongoInsertRequest {
  collection: string;
  document: EJSONDocument;
}

export interface MongoInsertResult {
  collection: string;
  insertedId: EJsonValue;
  document: EJSONDocument;
}

// --- updateDocument (spec §5.4) ---

export interface MongoUpdateOptions {
  upsert?: boolean;
  multi?: boolean;
  arrayFilters?: EJSONDocument[];
  returnDocument?: "before" | "after";
}

export interface MongoUpdateRequest {
  collection: string;
  filter: EJSONDocument;
  update: EJSONDocument;
  options?: MongoUpdateOptions;
}

export interface MongoUpdateResult {
  collection: string;
  matchedCount: number;
  modifiedCount: number;
  upsertedId?: EJsonValue;
  updatedDocument?: EJSONDocument;
}

// --- deleteDocument (spec §5.5) ---

export interface MongoDeleteOptions {
  multi?: boolean;
}

export interface MongoDeleteRequest {
  collection: string;
  filter: EJSONDocument;
  options?: MongoDeleteOptions;
}

export interface MongoDeleteResult {
  collection: string;
  deletedCount: number;
}

// --- runAggregation (spec §5.6) ---

export interface MongoAggregationOptions {
  allowDiskUse?: boolean;
  maxTimeMS?: number;
  batchSize?: number;
}

export interface MongoAggregationRequest {
  collection: string;
  pipeline: EJSONDocument[];
  options?: MongoAggregationOptions;
}

export interface MongoAggregationResult {
  collection: string;
  documents: EJSONDocument[];
  stageCount: number;
  executionTimeMs?: number;
}

// --- Safety / limit constants (spec §10) ---

export const MAX_PAGE_SIZE = 1000;
export const MAX_PAGE = 10;
export const MAX_SKIP = MAX_PAGE_SIZE * MAX_PAGE; // 10000
export const DEFAULT_PAGE_SIZE = 100;
export const MAX_FILTER_SIZE_BYTES = 8 * 1024;
export const MAX_SORT_FIELDS = 32;
export const MAX_PROJECTION_FIELDS = 256;
export const MAX_AGG_STAGES = 64;
export const MAX_AGG_STAGE_SIZE_BYTES = 16 * 1024;
export const MAX_AGG_RESULTS = 10000;
export const MAX_DOCUMENT_SIZE_BYTES = 16 * 1024 * 1024;
export const DEFAULT_OP_TIMEOUT_MS = 30000;
export const MAX_OP_TIMEOUT_MS = 120000;
export const MAX_INSERT_DOCUMENTS = 1;
