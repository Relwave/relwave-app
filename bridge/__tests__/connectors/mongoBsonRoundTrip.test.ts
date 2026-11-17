import { describe, expect, test } from "@jest/globals";
import { Binary } from "mongodb";
import {
  validateAndParseSubtype,
  validateAndDecodeBase64,
  mongoEJSONtoBSON,
  serializeMongoValue,
} from "../../src/connectors/mongoBson";

describe("mongoBsonRoundTrip", () => {
  describe("Supported Payload Shapes & Aliases", () => {
    test("deserializes RelWave wire format { $binary: { base64, subtype } }", () => {
      const ejson = { $binary: { base64: "aGVsbG8=", subtype: "00" } };
      const bin = mongoEJSONtoBSON(ejson) as unknown as Binary;
      expect(bin).toBeInstanceOf(Binary);
      expect(Buffer.from(bin.value()).toString("utf8")).toBe("hello");
      expect(bin.sub_type).toBe(0);
    });

    test("deserializes Canonical EJSON v2 format { $binary: { base64, subType } }", () => {
      const ejson = { $binary: { base64: "aGVsbG8=", subType: "04" } };
      const bin = mongoEJSONtoBSON(ejson) as unknown as Binary;
      expect(bin).toBeInstanceOf(Binary);
      expect(Buffer.from(bin.value()).toString("utf8")).toBe("hello");
      expect(bin.sub_type).toBe(4);
    });

    test("deserializes MongoDB internal format { $binary: { $base64, $type } }", () => {
      const ejson = { $binary: { $base64: "aGVsbG8=", $type: "05" } };
      const bin = mongoEJSONtoBSON(ejson) as unknown as Binary;
      expect(bin).toBeInstanceOf(Binary);
      expect(Buffer.from(bin.value()).toString("utf8")).toBe("hello");
      expect(bin.sub_type).toBe(5);
    });

    test("deserializes compatibility alias format { $binary: { base64, sub_type } }", () => {
      const ejson = { $binary: { base64: "aGVsbG8=", sub_type: "80" } };
      const bin = mongoEJSONtoBSON(ejson) as unknown as Binary;
      expect(bin).toBeInstanceOf(Binary);
      expect(Buffer.from(bin.value()).toString("utf8")).toBe("hello");
      expect(bin.sub_type).toBe(128);
    });

    test("deserializes flat string shorthand { $binary: '<base64>' } with default subtype 0", () => {
      const ejson = { $binary: "aGVsbG8=" };
      const bin = mongoEJSONtoBSON(ejson) as unknown as Binary;
      expect(bin).toBeInstanceOf(Binary);
      expect(Buffer.from(bin.value()).toString("utf8")).toBe("hello");
      expect(bin.sub_type).toBe(0);
    });

    test("accepts identical redundant aliases ({ base64: '...', $base64: '...' })", () => {
      const ejson = {
        $binary: {
          base64: "aGVsbG8=",
          $base64: "aGVsbG8=",
          subtype: "00",
          subType: "00",
          $type: "00",
        },
      };
      const bin = mongoEJSONtoBSON(ejson) as unknown as Binary;
      expect(Buffer.from(bin.value()).toString("utf8")).toBe("hello");
      expect(bin.sub_type).toBe(0);
    });

    test("rejects conflicting base64 aliases ({ base64: '...', $base64: '...' }) with TypeError", () => {
      const ejson = {
        $binary: {
          base64: "aGVsbG8=",
          $base64: "d29ybGQ=",
        },
      };
      expect(() => mongoEJSONtoBSON(ejson)).toThrow(TypeError);
      expect(() => mongoEJSONtoBSON(ejson)).toThrow(/conflicting base64 payload properties/i);
    });

    test("rejects conflicting subtype aliases ({ subtype: '00', subType: '04' }) with TypeError", () => {
      const ejson = {
        $binary: {
          base64: "aGVsbG8=",
          subtype: "00",
          subType: "04",
        },
      };
      expect(() => mongoEJSONtoBSON(ejson)).toThrow(TypeError);
      expect(() => mongoEJSONtoBSON(ejson)).toThrow(/conflicting subtype payload properties/i);
    });
  });

  describe("Strict Subtype Validation", () => {
    test("parses valid numeric integer subtypes in range 0-255", () => {
      expect(validateAndParseSubtype(0)).toBe(0);
      expect(validateAndParseSubtype(4)).toBe(4);
      expect(validateAndParseSubtype(128)).toBe(128);
      expect(validateAndParseSubtype(255)).toBe(255);
    });

    test("parses valid hexadecimal string subtypes ('00', '04', '80', '0x04', 'a', 'FF')", () => {
      expect(validateAndParseSubtype("00")).toBe(0);
      expect(validateAndParseSubtype("04")).toBe(4);
      expect(validateAndParseSubtype("0x04")).toBe(4);
      expect(validateAndParseSubtype("0X04")).toBe(4);
      expect(validateAndParseSubtype("80")).toBe(128);
      expect(validateAndParseSubtype("a")).toBe(10);
      expect(validateAndParseSubtype("FF")).toBe(255);
      expect(validateAndParseSubtype("0xff")).toBe(255);
    });

    test("preserves full canonical subtype matrix (0x00-0x07, 0x80)", () => {
      const matrix = [0x00, 0x01, 0x02, 0x03, 0x04, 0x05, 0x06, 0x07, 0x80];
      for (const st of matrix) {
        expect(validateAndParseSubtype(st)).toBe(st);
        expect(validateAndParseSubtype(st.toString(16).padStart(2, "0"))).toBe(st);
      }
    });

    test("rejects negative numeric subtype (-1) with TypeError", () => {
      expect(() => validateAndParseSubtype(-1)).toThrow(TypeError);
    });

    test("rejects fractional numeric subtype (4.5) with TypeError", () => {
      expect(() => validateAndParseSubtype(4.5)).toThrow(TypeError);
    });

    test("rejects overflow numeric subtype (> 255) with TypeError", () => {
      expect(() => validateAndParseSubtype(256)).toThrow(TypeError);
      expect(() => validateAndParseSubtype(1000)).toThrow(TypeError);
    });

    test("rejects NaN, Infinity, -Infinity subtypes with TypeError", () => {
      expect(() => validateAndParseSubtype(Number.NaN)).toThrow(TypeError);
      expect(() => validateAndParseSubtype(Number.POSITIVE_INFINITY)).toThrow(TypeError);
      expect(() => validateAndParseSubtype(Number.NEGATIVE_INFINITY)).toThrow(TypeError);
    });

    test("rejects invalid hexadecimal string subtypes ('zz', '0x100', '-01') with TypeError", () => {
      expect(() => validateAndParseSubtype("zz")).toThrow(TypeError);
      expect(() => validateAndParseSubtype("0x100")).toThrow(TypeError);
      expect(() => validateAndParseSubtype("-01")).toThrow(TypeError);
      expect(() => validateAndParseSubtype("")).toThrow(TypeError);
    });

    test("never silently defaults an invalid subtype to zero", () => {
      expect(() => validateAndParseSubtype(null)).toThrow(TypeError);
      expect(() => validateAndParseSubtype({})).toThrow(TypeError);
      expect(() => validateAndParseSubtype([])).toThrow(TypeError);
      expect(() => validateAndParseSubtype(true)).toThrow(TypeError);
    });
  });

  describe("Structural & Canonical Base64 Validation", () => {
    test("accepts valid standard padded base64 string ('aGVsbG8=')", () => {
      const buf = validateAndDecodeBase64("aGVsbG8=");
      expect(buf.toString("utf8")).toBe("hello");
    });

    test("accepts valid unpadded base64 string ('aGVsbG8')", () => {
      const buf = validateAndDecodeBase64("aGVsbG8");
      expect(buf.toString("utf8")).toBe("hello");
    });

    test("accepts valid empty base64 string ('') and preserves zero-byte Binary", () => {
      const buf = validateAndDecodeBase64("");
      expect(buf.length).toBe(0);
      const bin = mongoEJSONtoBSON({ $binary: { base64: "", subtype: 0 } }) as unknown as Binary;
      expect(bin.length()).toBe(0);
      expect(bin.value().length).toBe(0);
    });

    test("rejects base64 with invalid characters ('hello!world', 'abc$', spaces) with TypeError before decoding", () => {
      expect(() => validateAndDecodeBase64("hello!world")).toThrow(TypeError);
      expect(() => validateAndDecodeBase64("abc$")).toThrow(TypeError);
      expect(() => validateAndDecodeBase64("aGVs bG8=")).toThrow(TypeError);
      expect(() => validateAndDecodeBase64("aGVsbG8=\n")).toThrow(TypeError);
    });

    test("rejects base64 with misplaced padding in middle ('a=b=', 'aG=sbG8=') with TypeError before decoding", () => {
      expect(() => validateAndDecodeBase64("a=b=")).toThrow(TypeError);
      expect(() => validateAndDecodeBase64("aG=sbG8=")).toThrow(TypeError);
    });

    test("rejects base64 with excess padding (3+ equals: 'a===', '====', 'abc===') with TypeError before decoding", () => {
      expect(() => validateAndDecodeBase64("a===")).toThrow(TypeError);
      expect(() => validateAndDecodeBase64("====")).toThrow(TypeError);
      expect(() => validateAndDecodeBase64("abc===")).toThrow(TypeError);
    });

    test("rejects base64 with characters after padding ('aGVsbG8=A', 'aA== ') with TypeError before decoding", () => {
      expect(() => validateAndDecodeBase64("aGVsbG8=A")).toThrow(TypeError);
      expect(() => validateAndDecodeBase64("aA== ")).toThrow(TypeError);
    });

    test("rejects base64 with invalid padded length ('aG=', 'aGV=') with TypeError before decoding", () => {
      expect(() => validateAndDecodeBase64("aG=")).toThrow(TypeError);
      expect(() => validateAndDecodeBase64("aG==")).toThrow(TypeError);
    });

    test("rejects truncated base64 (length % 4 === 1: 'a', 'abcde') with TypeError before decoding", () => {
      expect(() => validateAndDecodeBase64("a")).toThrow(TypeError);
      expect(() => validateAndDecodeBase64("abcde")).toThrow(TypeError);
    });

    test("rejects non-canonical base64 with non-zero pad bits ('aB==') with TypeError via re-encoding validation", () => {
      expect(() => validateAndDecodeBase64("aB==")).toThrow(TypeError);
      expect(() => validateAndDecodeBase64("aB==")).toThrow(/non-canonical base64 encoding/i);
    });
  });

  describe("Malformed Payload Safety", () => {
    test("rejects null or non-record binary payload ({ $binary: null }, { $binary: 123 }) with TypeError", () => {
      expect(() => mongoEJSONtoBSON({ $binary: null as any })).toThrow(TypeError);
      expect(() => mongoEJSONtoBSON({ $binary: 123 as any })).toThrow(TypeError);
    });

    test("rejects empty dictionary payload ({ $binary: {} }) with TypeError", () => {
      expect(() => mongoEJSONtoBSON({ $binary: {} })).toThrow(TypeError);
      expect(() => mongoEJSONtoBSON({ $binary: {} })).toThrow(/missing base64 data/i);
    });

    test("never converts malformed input into an empty Binary", () => {
      expect(() => mongoEJSONtoBSON({ $binary: { base64: "invalid!base64" } })).toThrow(TypeError);
      expect(() =>
        mongoEJSONtoBSON({ $binary: { base64: "aGVsbG8=", subtype: "invalid" } }),
      ).toThrow(TypeError);
    });
  });

  describe("Logical Payload Round-Trip Invariants", () => {
    test("verifies logical payload bytes b.value(), length b.length(), and sub_type in forward direction", () => {
      const raw = Buffer.from([0x01, 0x02, 0x03, 0x04, 0x05]);
      const original = new Binary(raw, 2);

      const serialized = serializeMongoValue(original) as {
        $binary: { base64: string; subtype: string };
      };
      expect(serialized.$binary.base64).toBe(raw.toString("base64"));
      expect(serialized.$binary.subtype).toBe("02");

      const deserialized = mongoEJSONtoBSON(serialized) as unknown as Binary;
      expect(deserialized.sub_type).toBe(original.sub_type);
      expect(deserialized.length()).toBe(original.length());
      expect(Buffer.from(deserialized.value()).equals(Buffer.from(original.value()))).toBe(true);
    });

    test("verifies logical payload bytes, length, and sub_type in reverse direction", () => {
      const ejsonDoc = { $binary: { base64: "AQIDBA==", subType: "04" } };
      const bin = mongoEJSONtoBSON(ejsonDoc) as unknown as Binary;

      expect(bin.sub_type).toBe(4);
      expect(bin.length()).toBe(4);
      expect(Buffer.from(bin.value())).toEqual(Buffer.from([1, 2, 3, 4]));

      const reSerialized = serializeMongoValue(bin) as {
        $binary: { base64: string; subtype: string };
      };
      expect(reSerialized.$binary.base64).toBe("AQIDBA==");
      expect(reSerialized.$binary.subtype).toBe("04");
    });

    test("losslessly preserves 16-byte UUIDs (subtype 0x04) and MD5 hashes (subtype 0x05) across round-trips", () => {
      const uuidBytes = Buffer.from(
        "c3ca6eaa-a103-49fe-a436-0ddb0e4b1eb6".replace(/-/g, ""),
        "hex",
      );
      expect(uuidBytes.length).toBe(16);
      const uuidBinary = new Binary(uuidBytes, 4);

      const wireUuid = serializeMongoValue(uuidBinary) as any;
      const deserializedUuid = mongoEJSONtoBSON(wireUuid) as unknown as Binary;
      expect(deserializedUuid.sub_type).toBe(4);
      expect(Buffer.from(deserializedUuid.value()).equals(uuidBytes)).toBe(true);

      const md5Bytes = Buffer.from("098f6bcd4621d373cade4e832627b4f6", "hex");
      expect(md5Bytes.length).toBe(16);
      const md5Binary = new Binary(md5Bytes, 5);

      const wireMd5 = serializeMongoValue(md5Binary) as any;
      const deserializedMd5 = mongoEJSONtoBSON(wireMd5) as unknown as Binary;
      expect(deserializedMd5.sub_type).toBe(5);
      expect(Buffer.from(deserializedMd5.value()).equals(md5Bytes)).toBe(true);
    });
  });
});
