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

export interface MongoCollectionInfo {
  name: string;
  type: "collection" | "view";
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
  sampleValue?: any;
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
  sampleDocuments: Array<Record<string, any>>;
}

export type MongoSortDirection = 1 | -1 | "ASC" | "DESC";
export type MongoSortSpec = { [field: string]: MongoSortDirection };
export type MongoProjection = { [field: string]: 0 | 1 | false | true };

export type EJSONDocument = Record<string, any>;

export interface MongoFindRequest {
  dbId: string;
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

// ==========================================
// M4 — Mutation Types
// ==========================================

export interface MongoInsertRequest {
  dbId: string;
  collection: string;
  document: EJSONDocument;
}

export interface MongoInsertResult {
  collection: string;
  insertedId: any;
  document: EJSONDocument;
}

export interface MongoUpdateOptions {
  upsert?: boolean;
  multi?: boolean;
  returnDocument?: "before" | "after";
}

export interface MongoUpdateRequest {
  dbId: string;
  collection: string;
  filter: EJSONDocument;
  update: EJSONDocument;
  options?: MongoUpdateOptions;
}

export interface MongoUpdateResult {
  collection: string;
  matchedCount: number;
  modifiedCount: number;
  upsertedId?: any;
  updatedDocument?: EJSONDocument;
}

export interface MongoReplaceOptions {
  upsert?: boolean;
  returnDocument?: "before" | "after";
}

export interface MongoReplaceRequest {
  dbId: string;
  collection: string;
  filter: EJSONDocument;
  replacement: EJSONDocument;
  options?: MongoReplaceOptions;
}

export interface MongoReplaceResult {
  collection: string;
  matchedCount: number;
  modifiedCount: number;
  upsertedId?: any;
  updatedDocument?: EJSONDocument;
}

export interface MongoDeleteOptions {
  multi?: boolean;
}

export interface MongoDeleteRequest {
  dbId: string;
  collection: string;
  filter: EJSONDocument;
  options?: MongoDeleteOptions;
}

export interface MongoDeleteResult {
  collection: string;
  deletedCount: number;
}

export interface MongoCreateCollectionOptions {
  capped?: boolean;
  size?: number;
  max?: number;
}

export interface MongoCreateCollectionRequest {
  dbId: string;
  collection: string;
  options?: MongoCreateCollectionOptions;
}

export interface MongoCreateCollectionResult {
  ok: boolean;
  collection: string;
}

export interface MongoDropCollectionRequest {
  dbId: string;
  collection: string;
}

export interface MongoDropCollectionResult {
  ok: boolean;
  collection: string;
}

// ==========================================
// M5 — MQL Workspace & Navigation Types
// ==========================================

export type EJsonValue =
  | string
  | number
  | boolean
  | null
  | EJsonValue[]
  | EJSONDocument
  | Record<string, any>;

export interface MongoFindOpPayload {
  filter: EJSONDocument;
  projection?: Record<string, 0 | 1>;
  sort?: Record<string, 1 | -1>;
  skip?: number;
  limit?: number;
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

export type MongoMqlOperation =
  | { operation: "find"; payload: MongoFindOpPayload }
  | { operation: "aggregate"; payload: MongoAggregateOpPayload }
  | { operation: "countDocuments"; payload: MongoCountOpPayload }
  | { operation: "estimatedDocumentCount"; payload?: MongoEstimatedCountOpPayload }
  | { operation: "distinct"; payload: MongoDistinctOpPayload };

export interface MongoMqlExecuteRequest {
  dbId: string;
  collection: string;
  op: MongoMqlOperation;
  options?: {
    maxTimeMS?: number;
  };
}

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
  | MongoFindMqlResult
  | MongoAggregateMqlResult
  | MongoCountMqlResult
  | MongoDistinctMqlResult;

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
  dbId: string;
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

export interface MongoshParseResult {
  collection: string;
  op: MongoMqlOperation;
}

export * from "./types/migration";
export * from "./types/relationship";
export * from "./types/bulk";

