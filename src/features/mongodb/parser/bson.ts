import { MongoParserError } from "./errors";

const OBJECT_ID_REGEX = /^[0-9a-fA-F]{24}$/;
const UUID_REGEX = /^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$/;
const DECIMAL128_REGEX = /^(?:[+-]?(?:\d+(?:\.\d*)?|\.\d+)(?:[eE][+-]?\d+)?|[+-]?Infinity|NaN)$/;
const ISO_DATE_REGEX =
  /^(\d{4})-(\d{2})-(\d{2})(?:T(\d{2}):(\d{2}):(\d{2})(?:\.(\d+))?(?:Z|([+-]\d{2}(?::?\d{2})?))?)?$/;
const INT64_MIN = BigInt("-9223372036854775808");
const INT64_MAX = BigInt("9223372036854775807");

export function parseObjectId(raw: string, line = 1, column = 1, offset = 0): { $oid: string } {
  const val = raw.trim();
  if (!OBJECT_ID_REGEX.test(val)) {
    throw new MongoParserError(
      "ObjectId must contain exactly 24 hexadecimal characters.",
      "INVALID_BSON_CONSTRUCTOR",
      line,
      column,
      offset,
    );
  }
  return { $oid: val.toLowerCase() };
}

export function parseISODate(raw: string, line = 1, column = 1, offset = 0): { $date: string } {
  const val = raw.trim();
  const match = ISO_DATE_REGEX.exec(val);
  if (!match) {
    throw new MongoParserError(
      `Invalid ISO date string format '${val}' for ISODate.`,
      "INVALID_BSON_CONSTRUCTOR",
      line,
      column,
      offset,
    );
  }

  const year = parseInt(match[1], 10);
  const month = parseInt(match[2], 10);
  const day = parseInt(match[3], 10);

  if (month < 1 || month > 12) {
    throw new MongoParserError(
      `Invalid month ${month} in date '${val}'.`,
      "INVALID_BSON_CONSTRUCTOR",
      line,
      column,
      offset,
    );
  }

  const daysInMonth = new Date(Date.UTC(year, month, 0)).getUTCDate();
  if (day < 1 || day > daysInMonth) {
    throw new MongoParserError(
      `Invalid day ${day} for month ${month} in year ${year} (max allowed is ${daysInMonth}) in date '${val}'.`,
      "INVALID_BSON_CONSTRUCTOR",
      line,
      column,
      offset,
    );
  }

  if (match[4] !== undefined) {
    const hour = parseInt(match[4], 10);
    const minute = parseInt(match[5], 10);
    const second = parseInt(match[6], 10);

    if (hour < 0 || hour > 23 || minute < 0 || minute > 59 || second < 0 || second > 59) {
      throw new MongoParserError(
        `Invalid time component in date '${val}'.`,
        "INVALID_BSON_CONSTRUCTOR",
        line,
        column,
        offset,
      );
    }
  }

  if (match[8]) {
    const tzStr = match[8].replace(":", "");
    const tzHour = parseInt(tzStr.slice(1, 3), 10);
    const tzMin = tzStr.length >= 5 ? parseInt(tzStr.slice(3, 5), 10) : 0;
    if (tzHour > 14 || (tzHour === 14 && tzMin > 0) || tzMin > 59) {
      throw new MongoParserError(
        `Invalid timezone offset '${match[8]}' in date '${val}'.`,
        "INVALID_BSON_CONSTRUCTOR",
        line,
        column,
        offset,
      );
    }
  }

  const d = new Date(val);
  if (isNaN(d.getTime())) {
    throw new MongoParserError(
      `Invalid date string '${val}' for ISODate.`,
      "INVALID_BSON_CONSTRUCTOR",
      line,
      column,
      offset,
    );
  }
  return { $date: d.toISOString() };
}

export function parseNumberLong(
  raw: string,
  line = 1,
  column = 1,
  offset = 0,
): { $numberLong: string } {
  const val = raw.trim();
  if (!/^[+-]?\d+$/.test(val)) {
    throw new MongoParserError(
      `Invalid NumberLong integer format '${val}'.`,
      "INVALID_BSON_CONSTRUCTOR",
      line,
      column,
      offset,
    );
  }

  try {
    const bi = BigInt(val);
    if (bi < INT64_MIN || bi > INT64_MAX) {
      throw new Error();
    }
    return { $numberLong: bi.toString() };
  } catch {
    throw new MongoParserError(
      `NumberLong value '${val}' exceeds signed 64-bit integer range (-9223372036854775808 to 9223372036854775807).`,
      "INVALID_BSON_CONSTRUCTOR",
      line,
      column,
      offset,
    );
  }
}

export function parseNumberDecimal(
  raw: string,
  line = 1,
  column = 1,
  offset = 0,
): { $numberDecimal: string } {
  const val = raw.trim();
  if (!DECIMAL128_REGEX.test(val)) {
    throw new MongoParserError(
      `Invalid Decimal128 representation '${val}'.`,
      "INVALID_BSON_CONSTRUCTOR",
      line,
      column,
      offset,
    );
  }
  return { $numberDecimal: val };
}

export function parseUUID(
  raw: string,
  line = 1,
  column = 1,
  offset = 0,
): { $binary: { base64: string; subType: "04" } } {
  const val = raw.trim();
  if (!UUID_REGEX.test(val)) {
    throw new MongoParserError(
      "UUID must contain 36 characters in 8-4-4-4-12 hyphenated hexadecimal format.",
      "INVALID_BSON_CONSTRUCTOR",
      line,
      column,
      offset,
    );
  }

  const hex = val.replace(/-/g, "");
  const bytes = new Uint8Array(16);
  for (let i = 0; i < 16; i++) {
    bytes[i] = parseInt(hex.substring(i * 2, i * 2 + 2), 16);
  }

  let base64 = "";
  if (typeof Buffer !== "undefined") {
    base64 = Buffer.from(bytes).toString("base64");
  } else {
    let binary = "";
    for (let i = 0; i < bytes.length; i++) {
      binary += String.fromCharCode(bytes[i]);
    }
    base64 = btoa(binary);
  }

  return {
    $binary: {
      base64,
      subType: "04",
    },
  };
}
