/**
 * BSON-to-wire serializer for MongoDB documents.
 *
 * Converts a driver document into a lossless, JSON-safe `SerializedMongoDocument`
 * that can travel over the newline-delimited JSON-RPC stdio channel. ObjectId,
 * Decimal128, Long, Timestamp, Binary, and `undefined` are not JSON-representable
 * and are mapped to MongoDB Extended JSON forms; plain primitives pass through.
 *
 * Type detection is by BSON `_bsontype` (stable across driver/bson versions) plus
 * `instanceof Date` / `Buffer.isBuffer`, so this module is pure and unit-testable
 * without a live driver. No value it returns fails `JSON.stringify`.
 */

import { ObjectId, Int32, Long, Decimal128, Binary, Timestamp } from "mongodb";
import type { Document } from "mongodb";
import type {
  SerializedMongoDocument,
  MongoWireValue,
  MongoWireObject,
  MongoWireBinary,
  EJsonValue,
  EJSONDocument,
} from "../types/mongo";

type WithBsontype = { _bsontype?: string };

/** Minimal structural views so we never touch `any`. */
interface ObjectIdLike {
  _bsontype: "ObjectId";
  toHexString(): string;
}
interface Decimal128Like {
  _bsontype: "Decimal128";
  toString(): string;
}
interface LongLike {
  _bsontype: "Long";
  toString(): string;
}
interface TimestampLike {
  _bsontype: "Timestamp";
  t: number;
  i: number;
}
interface IntLike {
  _bsontype: "Int32" | "Double";
  valueOf(): number;
}
interface BinaryLike {
  _bsontype: "Binary";
  buffer: Uint8Array;
  sub_type?: number;
}

function toFiniteNumber(n: number): number | null {
  return Number.isFinite(n) ? n : null;
}

function serializeBinary(value: BinaryLike): MongoWireBinary {
  const buf = Buffer.isBuffer(value.buffer) ? value.buffer : Buffer.from(value.buffer);
  const subtype = typeof value.sub_type === "number" ? value.sub_type : 0;
  return {
    $binary: {
      base64: buf.toString("base64"),
      subtype: subtype.toString(16).padStart(2, "0"),
    },
  };
}

/**
 * Serialize a single BSON value into a JSON-safe wire value. Arrays and nested
 * documents recurse.
 */
export function serializeMongoValue(value: unknown): MongoWireValue {
  if (value === null) return null;

  const kind = typeof value;
  if (kind === "string" || kind === "boolean") {
    return value as MongoWireValue;
  }
  if (kind === "number") {
    return toFiniteNumber(value as number) as MongoWireValue;
  }
  if (kind === "undefined") {
    return { $undefined: true };
  }
  if (Array.isArray(value)) {
    return value.map((item) => serializeMongoValue(item));
  }

  const bsontype = (value as WithBsontype)._bsontype;
  if (bsontype) {
    switch (bsontype) {
      case "ObjectId":
        return { $oid: (value as ObjectIdLike).toHexString() };
      case "Decimal128":
        return { $numberDecimal: (value as Decimal128Like).toString() };
      case "Long":
        return { $numberLong: (value as LongLike).toString() };
      case "Timestamp": {
        const ts = value as TimestampLike;
        return { $timestamp: { t: ts.t | 0, i: ts.i | 0 } };
      }
      case "Int32":
      case "Double":
        return toFiniteNumber((value as IntLike).valueOf()) as MongoWireValue;
      case "Binary":
        return serializeBinary(value as BinaryLike);
      default:
        // Unknown BSON subtype (e.g. DBRef) falls through to object serialization.
        break;
    }
  }

  if (value instanceof Date) {
    return { $date: value.toISOString() };
  }
  if (Buffer.isBuffer(value) || value instanceof Uint8Array) {
    return serializeBinary({ _bsontype: "Binary", buffer: value, sub_type: 0 });
  }

  if (kind === "object") {
    const out: MongoWireObject = {};
    for (const [key, item] of Object.entries(value as Record<string, unknown>)) {
      if (key === "_bsontype") continue;
      out[key] = serializeMongoValue(item);
    }
    return out;
  }

  // functions / symbols / bigint are not representable on the wire.
  return null;
}

/**
 * Serialize a whole document. Own enumerable keys are serialized; the internal
 * `_bsontype` marker is dropped.
 */
export function serializeMongoDocument(doc: Document): SerializedMongoDocument {
  const out: SerializedMongoDocument = {};
  for (const [key, item] of Object.entries(doc as Record<string, unknown>)) {
    if (key === "_bsontype") continue;
    out[key] = serializeMongoValue(item);
  }
  return out;
}

// ===========================================================================
// M2 — Extended JSON (EJSON) <-> driver-native conversion.
//
// serializeMongoValue/serializeMongoDocument above go driver-native -> wire/EJSON
// using the driver's wire shapes for the JSON-RPC response channel. The M2
// document engine needs the canonical EJSON v2 round-trip in BOTH directions
// (docs/MONGODB_M2_SPEC.md §4.3): mongoEJSONtoBSON parses request inputs;
// mongoBSONtoEJSON renders results so that mongoBSONtoEJSON(mongoEJSONtoBSON(x))
// is structurally equal to x for the supported type set. Pure and unit-testable.
// ===========================================================================

const EJSON_WRAPPER_KEYS = new Set([
  "$oid",
  "$date",
  "$numberInt",
  "$numberLong",
  "$numberDouble",
  "$numberDecimal",
  "$binary",
  "$regex",
  "$timestamp",
  "$undefined",
]);

function isPlainRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

/** True when `value` is an EJSON object with exactly one known wrapper key. */
function isEJSONWrapper(value: unknown): value is Record<string, unknown> {
  if (!isPlainRecord(value)) return false;
  const keys = Object.keys(value);
  return keys.length === 1 && EJSON_WRAPPER_KEYS.has(keys[0]);
}

/**
 * Recursively convert an EJSON value to driver-native BSON types. Resolves the
 * EJSON v2 wrappers; plain JSON passes through; a bare 24-hex string stays a
 * string (only $oid yields an ObjectId — spec §4.2 / D-M2-6); unknown $-wrappers
 * are returned unchanged for the driver to handle.
 */
export function mongoEJSONtoBSON(doc: EJSONDocument): Record<string, unknown>;
export function mongoEJSONtoBSON(value: EJsonValue): unknown;
export function mongoEJSONtoBSON(value: EJsonValue): unknown {
  if (value === null || value === undefined) return value;

  const kind = typeof value;
  if (kind === "string" || kind === "boolean") {
    return value;
  }
  if (kind === "number") {
    return value;
  }
  if (Array.isArray(value)) {
    return value.map((item) => mongoEJSONtoBSON(item));
  }
  if (kind === "bigint") {
    return (value as unknown as bigint).toString();
  }

  if (isEJSONWrapper(value)) {
    const key = Object.keys(value)[0];
    const v = value as Record<string, unknown>;
    switch (key) {
      case "$oid":
        return new ObjectId(v["$oid"] as string);
      case "$date": {
        const d = v["$date"];
        if (isPlainRecord(d) && typeof d["$numberLong"] === "string") {
          return new Date(Long.fromString(d["$numberLong"]).toNumber());
        }
        return new Date(d as string);
      }
      case "$numberInt":
        return new Int32(Number(v["$numberInt"]));
      case "$numberLong":
        return Long.fromString(v["$numberLong"] as string);
      case "$numberDouble":
        return Number(v["$numberDouble"] as string);
      case "$numberDecimal":
        return new Decimal128(v["$numberDecimal"] as string);
      case "$binary": {
        const b = v["$binary"] as { $type?: string; $base64?: string };
        const subtype = parseInt(b["$type"] || "0", 16) | 0;
        return new Binary(Buffer.from(b["$base64"] || "", "base64"), subtype);
      }
      case "$regex":
        return new RegExp(v["$regex"] as string, (v["$options"] as string) || "");
      case "$timestamp": {
        const t = v["$timestamp"] as { $t?: string; $i?: string };
        return new Timestamp({ t: Number(t["$t"] || 0), i: Number(t["$i"] || 0) });
      }
      case "$undefined":
        return undefined;
      default:
        return value; // unreachable: isEJSONWrapper matched a known key
    }
  }

  if (kind === "object") {
    const out: Record<string, unknown> = {};
    for (const [k, item] of Object.entries(value as unknown as Record<string, unknown>)) {
      out[k] = mongoEJSONtoBSON(item as EJsonValue);
    }
    return out;
  }
  return value;
}

/**
 * Convert a driver-native value to canonical EJSON v2 for the JSON-RPC response.
 * Int32 -> $numberInt and Long -> $numberLong are preserved (so int types
 * round-trip); Double -> plain JSON number (the accepted double normalization).
 */
export function mongoBSONtoEJSON(value: unknown): EJsonValue {
  if (value === null || value === undefined) return null;

  const kind = typeof value;
  if (kind === "string" || kind === "boolean") {
    return value as EJsonValue;
  }
  if (kind === "number") {
    return toFiniteNumber(value as number) as EJsonValue;
  }
  if (kind === "bigint") {
    return (value as bigint).toString() as EJsonValue;
  }
  if (Array.isArray(value)) {
    return value.map((item) => mongoBSONtoEJSON(item));
  }

  if (value instanceof Date) {
    return { $date: value.toISOString() };
  }
  if (Buffer.isBuffer(value) || value instanceof Uint8Array) {
    const buf = Buffer.isBuffer(value) ? value : Buffer.from(value);
    return { $binary: { $type: "00", $base64: buf.toString("base64") } };
  }

  const bsontype = (value as WithBsontype)._bsontype;
  if (bsontype) {
    switch (bsontype) {
      case "ObjectId":
        return { $oid: (value as ObjectIdLike).toHexString() };
      case "Decimal128":
        return { $numberDecimal: (value as Decimal128Like).toString() };
      case "Long":
        return { $numberLong: (value as LongLike).toString() };
      case "Timestamp": {
        const ts = value as TimestampLike;
        return { $timestamp: { $t: String(ts.t), $i: String(ts.i) } };
      }
      case "Int32":
        return { $numberInt: String((value as IntLike).valueOf()) };
      case "Double":
        return toFiniteNumber((value as IntLike).valueOf()) as EJsonValue;
      case "Binary": {
        const b = value as BinaryLike;
        const buf = Buffer.isBuffer(b.buffer) ? b.buffer : Buffer.from(b.buffer);
        const subtype = typeof b.sub_type === "number" ? b.sub_type : 0;
        return {
          $binary: {
            $type: subtype.toString(16).padStart(2, "0"),
            $base64: buf.toString("base64"),
          },
        };
      }
      default:
        break;
    }
  }

  if (kind === "object") {
    const out: EJSONDocument = {};
    for (const [key, item] of Object.entries(value as Record<string, unknown>)) {
      if (key === "_bsontype") continue;
      out[key] = mongoBSONtoEJSON(item);
    }
    return out;
  }
  return null;
}

/**
 * Convert an insert document (EJSON) to driver-native form. Named distinctly
 * from serializeMongoDocument (which goes the opposite direction) to avoid the
 * name collision flagged during design.
 */
export function serializeMongoEJSONDocument(doc: EJSONDocument): Record<string, unknown> {
  return mongoEJSONtoBSON(doc);
}

/** Convert a query filter (EJSON) to driver-native form. */
export function serializeMongoFilter(filter: EJSONDocument): Record<string, unknown> {
  return mongoEJSONtoBSON(filter);
}

/**
 * Convert an update operator document (e.g. { $set: {...}, $inc: {...} }) to
 * driver-native form. Operator KEYS are preserved verbatim; their leaf VALUES
 * are resolved via mongoEJSONtoBSON. Never promotes a plain-field object to an
 * operator document (the connector rejects those).
 */
export function serializeMongoUpdateOperand(update: EJSONDocument): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const [op, body] of Object.entries(update)) {
    out[op] = mongoEJSONtoBSON(body as EJsonValue);
  }
  return out;
}

/**
 * Convert one aggregation pipeline stage to driver-native form. Resolves EJSON
 * wrappers but does NOT auto-$literal-wrap plain-object values — the caller is
 * responsible for MQL expression structure (spec §5.6 / D-M2-4).
 */
export function serializeMongoPipelineStage(stage: EJSONDocument): Record<string, unknown> {
  return mongoEJSONtoBSON(stage);
}
