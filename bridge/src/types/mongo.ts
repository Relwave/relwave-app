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
  readonly?: boolean;
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

export type MongoBsonType =
  | "objectId"
  | "string"
  | "number"
  | "long"
  | "decimal"
  | "timestamp"
  | "binary"
  | "date"
  | "bool"
  | "null"
  | "array"
  | "object"
  | "undefined";

export interface MongoInferSchemaRequest {
  collection: string;
  sampleSize?: number; // default 100, clamped [1, 1000]
  maxDepth?: number; // default 8, clamped [1, 16]
}

export interface MongoInferredField {
  path: string;
  bsonType: MongoBsonType;
  types: MongoBsonType[];
  numericKinds?: Array<"int" | "double">;
  depth: number;
  parentPath?: string;
  isArray: boolean;
  isNested: boolean;
  count: number;
  nullCount: number;
  sampleSize: number;
  presencePct: number;
  nullable: boolean;
  optional: boolean;
  typeConflicts: Array<{ bsonType: MongoBsonType; count: number }>;
  arrayElementTypes?: MongoBsonType[];
  sampleValue?: EJSONDocument | MongoWireValue;
  maxChildDepth?: number;
  truncated?: boolean;
}

export interface MongoCollectionSchema {
  collection: string;
  sampleSize: number;
  totalDocs: number;
  inferredAt: string;
  fieldCount: number;
  nestedFieldCount: number;
  arrayFieldCount: number;
  fields: MongoInferredField[];
  sampleDocuments: SerializedMongoDocument[];
}
export type MongoInferredSchema = MongoCollectionSchema;
export type MongoCollectionListItem = MongoCollectionInfo;

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

// --- replaceDocument (spec §5.2.1) ---

export interface MongoReplaceOptions {
  upsert?: boolean;
  returnDocument?: "before" | "after";
}

export interface MongoReplaceRequest {
  collection: string;
  filter: EJSONDocument;
  replacement: EJSONDocument;
  options?: MongoReplaceOptions;
}

export interface MongoReplaceResult {
  collection: string;
  matchedCount: number;
  modifiedCount: number;
  upsertedId?: EJsonValue;
  updatedDocument?: EJSONDocument;
}

// --- collection lifecycle (spec §5.2.2 / §5.2.3) ---

export interface MongoCreateCollectionOptions {
  capped?: boolean;
  size?: number; // bytes (min 4096)
  max?: number; // max documents (positive integer)
}

export interface MongoCreateCollectionRequest {
  collection: string;
  options?: MongoCreateCollectionOptions;
}

export interface MongoCreateCollectionResult {
  ok: boolean;
  collection: string;
}

export interface MongoDropCollectionRequest {
  collection: string;
}

export interface MongoDropCollectionResult {
  ok: boolean;
  collection: string;
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

// --- Canonical Page Constants (M5 Spec §5.1) ---
export const DEFAULT_PAGE_SIZE = 50;
export const MAX_PAGE_SIZE = 100;
export const MAX_PAGE = 10;
export const MAX_SKIP = MAX_PAGE_SIZE * MAX_PAGE; // 1000
export const MAX_FILTER_SIZE_BYTES = 8 * 1024;
export const MAX_SORT_FIELDS = 32;
export const MAX_PROJECTION_FIELDS = 256;
export const MAX_AGG_STAGES = 64;
export const MAX_AGG_STAGE_SIZE_BYTES = 16 * 1024;
export const MAX_AGG_RESULTS = 1000;
export const MAX_DISTINCT_VALUES = 10000;
export const MAX_EXPRESSION_DEPTH = 15;
export const MAX_DOCUMENT_SIZE_BYTES = 16 * 1024 * 1024;
export const DEFAULT_OP_TIMEOUT_MS = 30000;
export const MAX_OP_TIMEOUT_MS = 120000;
export const MAX_INSERT_DOCUMENTS = 1;

// M3 schema inference limits (docs/MONGODB_M3_SPEC.md §4.6)
export const MAX_SAMPLE_SIZE = 1000;
export const MAX_INFERENCE_DEPTH = 16;
export const MAX_INFERRED_FIELDS = 5000;
export const DEFAULT_SAMPLE_SIZE = 100;
export const DEFAULT_MAX_DEPTH = 8;

// --- M5 MQL Workspace & Builder Types (docs/MONGODB_M5_SPEC.md §5) ---

export interface MongoFindOpPayload {
  filter: EJSONDocument;
  projection?: Record<string, 0 | 1>;
  sort?: Record<string, 1 | -1>;
  skip?: number;
  limit?: number; // Clamped between 1 and MAX_PAGE_SIZE (100); defaults to DEFAULT_PAGE_SIZE (50)
}

export interface MongoAggregateOpPayload {
  pipeline: EJSONDocument[];
  allowDiskUse?: boolean;
  batchSize?: number;
}

export interface MongoCountOpPayload {
  filter?: EJSONDocument;
  skip?: number;
  limit?: number;
}

export type MongoEstimatedCountOpPayload = Record<string, never> | undefined;

export interface MongoDistinctOpPayload {
  field: string;
  filter?: EJSONDocument;
}

// --- Tagged Union Request ---

export type MongoMqlOperation =
  | { operation: "find"; payload: MongoFindOpPayload }
  | { operation: "aggregate"; payload: MongoAggregateOpPayload }
  | { operation: "countDocuments"; payload: MongoCountOpPayload }
  | { operation: "estimatedDocumentCount"; payload?: MongoEstimatedCountOpPayload }
  | { operation: "distinct"; payload: MongoDistinctOpPayload };

export interface MongoMqlExecuteRequest {
  dbId?: string;
  collection: string;
  op: MongoMqlOperation;
  options?: {
    maxTimeMS?: number;
  };
}

// --- Typed Results ---

export interface MongoMqlBaseResult {
  collection: string;
  executionTimeMs: number;
}

export interface MongoFindMqlResult extends MongoMqlBaseResult {
  operation: "find";
  documents: EJSONDocument[];
  totalReturned: number;
}

export interface MongoAggregateMqlResult extends MongoMqlBaseResult {
  operation: "aggregate";
  documents: EJSONDocument[];
  stageCount: number;
}

export interface MongoCountMqlResult extends MongoMqlBaseResult {
  operation: "countDocuments" | "estimatedDocumentCount";
  count: number;
}

export interface MongoDistinctMqlResult extends MongoMqlBaseResult {
  operation: "distinct";
  field: string;
  values: EJsonValue[];
  count: number;
}

export type MongoMqlExecuteResult =
  MongoFindMqlResult | MongoAggregateMqlResult | MongoCountMqlResult | MongoDistinctMqlResult;

export type MongoExplainTarget =
  | {
      operation: "find";
      filter: EJSONDocument;
      projection?: Record<string, 0 | 1>;
      sort?: Record<string, 1 | -1>;
      skip?: number;
      limit?: number;
    }
  | {
      operation: "aggregate";
      pipeline: EJSONDocument[];
      allowDiskUse?: boolean;
    };

export interface MongoExplainRequest {
  dbId?: string;
  collection: string;
  target: MongoExplainTarget;
  verbosity?: "queryPlanner" | "executionStats" | "allPlansExecution";
  options?: {
    maxTimeMS?: number;
  };
}

export interface MongoExplainResult {
  collection: string;
  operation: "find" | "aggregate";
  queryPlanner: {
    plannerVersion: number;
    namespace: string;
    indexFilterSet: boolean;
    winningPlan: Record<string, unknown>;
    rejectedPlans?: Record<string, unknown>[];
  };
  executionStats?: {
    executionSuccess: boolean;
    nReturned: number;
    executionTimeMillis: number;
    totalKeysExamined: number;
    totalDocsExamined: number;
    executionStages: Record<string, unknown>;
    allPlansExecution?: Record<string, unknown>[];
  };
  serverInfo?: {
    host: string;
    port: number;
    version: string;
  };
  rawExplain: Record<string, unknown>;
  executionTimeMs: number;
}

// ===========================================================================
// M6 — MongoDB Index Management & Migrations (docs/MONGODB_M6_SPEC.md §3)
// ===========================================================================

export type MongoIndexDirection = 1 | -1 | "text" | "2dsphere" | "hashed";

export interface MongoIndexCollation {
  locale: string;
  caseLevel?: boolean;
  caseFirst?: "upper" | "lower" | "off";
  strength?: 1 | 2 | 3 | 4 | 5;
  numericOrdering?: boolean;
  alternate?: "non-ignorable" | "shifted";
  maxVariable?: "punct" | "space";
  backwards?: boolean;
}

export interface MongoIndexOptions {
  name?: string;
  unique?: boolean;
  sparse?: boolean;
  expireAfterSeconds?: number;
  partialFilterExpression?: EJSONDocument;
  collation?: MongoIndexCollation;
  hidden?: boolean;
  background?: boolean;
}

export interface MongoIndexDetails {
  name: string;
  key: Record<string, MongoIndexDirection>;
  sizeBytes: number;
  unique: boolean;
  sparse: boolean;
  isIdIndex: boolean;
  expireAfterSeconds?: number;
  partialFilterExpression?: EJSONDocument;
  collation?: MongoIndexCollation;
  hidden?: boolean;
  v?: number;
  textIndexVersion?: number;
  weights?: Record<string, number>;
  default_language?: string;
  language_override?: string;
  isRedundant?: boolean;
  redundantReason?: string;
}

export interface MongoIndexListRequest {
  collection: string;
}

export interface MongoIndexListResult {
  collection: string;
  indexes: MongoIndexDetails[];
  totalSizeBytes: number;
}

export interface MongoIndexCreateRequest {
  collection: string;
  key: Record<string, MongoIndexDirection>;
  options?: MongoIndexOptions;
}

export interface MongoIndexCreateResult {
  success: boolean;
  indexName: string;
  executionTimeMs: number;
}

export interface MongoIndexDropRequest {
  collection: string;
  indexName: string;
}

export interface MongoIndexDropResult {
  success: boolean;
  droppedIndexName: string;
  executionTimeMs: number;
}

export interface MongoIndexStatsItem {
  name: string;
  key: Record<string, MongoIndexDirection>;
  ops: number;
  since: string;
  host?: string;
}

export interface MongoIndexStatsRequest {
  collection: string;
}

export interface MongoIndexStatsResult {
  collection: string;
  stats: Record<string, MongoIndexStatsItem>;
}

export interface MongoIndexHideRequest {
  collection: string;
  indexName: string;
  hidden: boolean;
}

export interface MongoIndexHideResult {
  success: boolean;
  indexName: string;
  hidden: boolean;
}

// ===========================================================================
// M7 Phase 1 — MongoDB Relationship Inference & Management Types
// ===========================================================================

export type MongoCardinality =
  | "one-to-one"
  | "one-to-many"
  | "many-to-one"
  | "many-to-many"
  | "unknown"
  | "insufficient-evidence";

export interface MongoRelationshipEvidence {
  sourceCollection: string;
  sourceField: string;
  targetCollection: string;
  targetField: string;
  sampleCount: number;
  hitCount: number;
  hitRatio: number; // 0.0 - 1.0 (must be >= 0.50 to consider)
  hasNamePatternMatch: boolean;
  isBsonTypeMatch: boolean;
  multipleSourcesPerTarget: boolean; // required for many-to-one or many-to-many
  isArrayReference: boolean;
  hasUniqueIndexOnSource: boolean;
  sampleMatches: Array<{ sourceValue: string; targetId: string }>;
}

export interface MongoInferredRelationship {
  id: string; // e.g. "orders.user_id->users._id"
  sourceCollection: string;
  sourceField: string;
  targetCollection: string;
  targetField: string; // usually "_id"
  cardinality: MongoCardinality;
  confidence: number; // 0.0 - 1.0 (>= 0.65 to display)
  evidence: MongoRelationshipEvidence;
  status: "inferred" | "confirmed" | "rejected";
  inferredAt: string;
}

export interface MongoRelationship {
  id: string;
  sourceCollection: string;
  sourceField: string;
  targetCollection: string;
  targetField: string;
  cardinality: MongoCardinality;
  isManual?: boolean;
  description?: string;
  createdAt: string;
  updatedAt: string;
}

export interface MongoRelationshipsFile {
  version: number;
  projectId?: string;
  databaseId: string;
  inferred: MongoInferredRelationship[];
  confirmed: MongoRelationship[];
  rejectedIds: string[];
  manual: MongoRelationship[];
  insufficientEvidence?: MongoInferredRelationship[];
  updatedAt: string;
}

// --- RPC Request / Response Interfaces ---

export interface MongoInferRelationshipsRequest {
  dbId: string;
  projectId?: string;
  collections?: string[];
  sampleSize?: number;
  maxCollections?: number;
  timeoutMs?: number;
}

export interface MongoInferRelationshipsResult {
  relationships: MongoInferredRelationship[]; // actionable (confidence >= 0.65)
  insufficientEvidence: MongoInferredRelationship[]; // diagnostic (confidence < 0.65)
  inferredAt: string;
  collectionsScanned: number;
  timedOut?: boolean;
}

export interface MongoListRelationshipsRequest {
  dbId: string;
  projectId?: string;
}

export interface MongoListRelationshipsResult {
  inferred: MongoInferredRelationship[];
  confirmed: MongoRelationship[];
  rejectedIds: string[];
  manual: MongoRelationship[];
  insufficientEvidence?: MongoInferredRelationship[];
}

export interface MongoSetRelationshipStatusRequest {
  dbId: string;
  projectId?: string;
  relationshipId: string;
  status: "confirmed" | "rejected";
}

export interface MongoSetRelationshipStatusResult {
  relationshipId: string;
  status: "confirmed" | "rejected";
}

export interface MongoSaveRelationshipRequest {
  dbId: string;
  projectId?: string;
  relationship: MongoRelationship;
}

export interface MongoSaveRelationshipResult {
  relationship: MongoRelationship;
}

export interface MongoDeleteRelationshipRequest {
  dbId: string;
  projectId?: string;
  relationshipId: string;
}

export interface MongoDeleteRelationshipResult {
  success: boolean;
  relationshipId: string;
}

// ===========================================================================
// Stage 8 Phase 3 — Cancellation, Lifecycle Supervision & Teardown Types
// ===========================================================================

export type CursorCloseState =
  "none" | "open" | "closing" | "closed_confirmed" | "closed_failed" | "closed_timed_out";

export type CursorCloseOutcome =
  | { status: "closed_confirmed"; durationMs: number }
  | { status: "closed_failed"; error: unknown; durationMs: number }
  | { status: "closed_timed_out"; durationMs: number };

export interface MongoExecutionContext {
  signal?: AbortSignal;
  onCursorCreated?: (cursor: any) => void;
  onDriverPromiseCreated?: (promise: Promise<any>) => void;
}

export interface DriverSettlementSignal {
  readonly isSettled: boolean;
  readonly settledAt?: number;
  readonly outcome?: "fulfilled" | "rejected";
  readonly error?: unknown;
  readonly promise: Promise<{ outcome: "fulfilled" | "rejected"; error?: unknown }>;
  markSettled: (outcome?: "fulfilled" | "rejected", error?: unknown) => void;
}

export type TeardownOutcomeStatus =
  | "destroy_confirmed"
  | "driver_settled"
  | "shutdown_handoff"
  | "retryable_failure"
  | "unrecoverable_failure";

export type TeardownOutcome =
  | {
      status: "destroy_confirmed";
      invalidationSucceeded: boolean;
      socketsDestroyed: number;
      durationMs: number;
    }
  | {
      status: "driver_settled";
      durationMs: number;
    }
  | {
      status: "shutdown_handoff";
      reason: "shutdown_adopted";
      durationMs: number;
    }
  | {
      status: "retryable_failure";
      invalidationSucceeded: boolean;
      socketError?: unknown;
      invalidationError?: unknown;
      attempt: number;
      durationMs: number;
    }
  | {
      status: "unrecoverable_failure";
      invalidationSucceeded: boolean;
      socketError?: unknown;
      invalidationError?: unknown;
      totalAttempts: number;
      durationMs: number;
    };

export type OperationLifecycleState =
  | "running"
  | "rpc_rejected_driver_pending"
  | "zombie_pinned"
  | "teardown_initiated"
  | "teardown_failed_pinned"
  | "unrecoverable_pinned"
  | "shutdown_adopted"
  | "completed"
  | "closed";

export interface OperationLifecycleHandle {
  id: string;
  dbId: string;
  state: OperationLifecycleState;
  settlementSignal: DriverSettlementSignal;
  retryTimer?: NodeJS.Timeout;
  cursor?: any;
  cursorCloseOutcome?: CursorCloseOutcome;
  hasReleasedLease?: boolean;
}
