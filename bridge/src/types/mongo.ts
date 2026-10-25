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
