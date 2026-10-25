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

import type { Document } from "mongodb";
import type {
  SerializedMongoDocument,
  MongoWireValue,
  MongoWireObject,
  MongoWireBinary,
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
