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
