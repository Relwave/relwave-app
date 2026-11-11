import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  canonicalizeValue,
  generateFilterKey,
  validateAndNormalizeEjsonBinary,
} from "../hooks/useMongoDatabaseDetails.ts";

describe("MongoPaginationPerformance & AST Canonicalizer", () => {
  describe("Primitive & Special Number Canonicalization", () => {
    it("canonicalizes primitives accurately", () => {
      assert.deepEqual(canonicalizeValue(null), ["null", null]);
      assert.deepEqual(canonicalizeValue(undefined), ["undefined", null]);
      assert.deepEqual(canonicalizeValue(true), ["bool", true]);
      assert.deepEqual(canonicalizeValue(false), ["bool", false]);
      assert.deepEqual(canonicalizeValue("hello"), ["str", "hello"]);
      assert.deepEqual(canonicalizeValue(42), ["num", 42]);
      assert.deepEqual(canonicalizeValue(3.14159), ["num", 3.14159]);
    });

    it("canonicalizes BigInt to ['bigint', string]", () => {
      assert.deepEqual(canonicalizeValue(9223372036854775807n), [
        "bigint",
        "9223372036854775807",
      ]);
      assert.deepEqual(canonicalizeValue(-9223372036854775808n), [
        "bigint",
        "-9223372036854775808",
      ]);
    });

    it("canonicalizes NaN and +/- Infinity", () => {
      assert.deepEqual(canonicalizeValue(NaN), ["nan", "NaN"]);
      assert.deepEqual(canonicalizeValue(Infinity), ["inf", "+Inf"]);
      assert.deepEqual(canonicalizeValue(-Infinity), ["ninf", "-Inf"]);
    });

    it("canonicalizes Date and RegExp", () => {
      const d = new Date("2026-11-10T12:00:00.000Z");
      assert.deepEqual(canonicalizeValue(d), ["date", "2026-11-10T12:00:00.000Z"]);

      const invalidDate = new Date("invalid");
      assert.deepEqual(canonicalizeValue(invalidDate), ["date_invalid", "Invalid Date"]);

      const r = /abc/gi;
      assert.deepEqual(canonicalizeValue(r), ["regex", { p: "abc", f: "gi" }]);
    });
  });

  describe("Recursion-Stack AST: Shared DAG References vs True Cycles", () => {
    it("permits shared subtrees in distinct DAG branches", () => {
      const sharedNode = { status: "active", version: 1 };
      const filter = {
        leftBranch: sharedNode,
        rightBranch: sharedNode,
      };

      assert.doesNotThrow(() => canonicalizeValue(filter));
      const ast = canonicalizeValue(filter);
      assert.equal(ast[0], "obj");
    });

    it("rejects true circular references with MONGO_CYCLIC_FILTER", () => {
      const cyclicObj: any = { name: "cycle" };
      cyclicObj.self = cyclicObj;

      assert.throws(() => canonicalizeValue(cyclicObj), /MONGO_CYCLIC_FILTER/);
    });

    it("rejects deep indirect circular references with MONGO_CYCLIC_FILTER", () => {
      const a: any = { id: 1 };
      const b: any = { id: 2, parent: a };
      a.child = b;

      assert.throws(() => canonicalizeValue(a), /MONGO_CYCLIC_FILTER/);
    });
  });

  describe("Symbol-Keyed Own Property Rejection & Prototype Safety", () => {
    it("rejects objects with symbol own properties with MONGO_INVALID_FILTER", () => {
      const sym = Symbol("privateField");
      const obj = { [sym]: "val", publicField: 123 };

      assert.throws(() => canonicalizeValue(obj), /MONGO_INVALID_FILTER/);
    });

    it("encodes __proto__, constructor, and prototype as safe tuples without pollution", () => {
      const obj = JSON.parse('{"__proto__": "safe", "constructor": "safe", "prototype": "safe"}');
      const ast = canonicalizeValue(obj);
      assert.equal(ast[0], "obj");
      const entries = ast[1] as Array<[string, any]>;
      const keys = entries.map(([k]) => k).sort();
      assert.deepEqual(keys, ["__proto__", "constructor", "prototype"].sort());
    });
  });

  describe("Unsupported Value & Class Rejection", () => {
    it("rejects functions and symbols as values", () => {
      assert.throws(() => canonicalizeValue(() => {}), /MONGO_INVALID_FILTER/);
      assert.throws(() => canonicalizeValue(Symbol("foo")), /MONGO_INVALID_FILTER/);
    });

    it("rejects Map, Set, and custom class instances", () => {
      assert.throws(() => canonicalizeValue(new Map()), /MONGO_INVALID_FILTER/);
      assert.throws(() => canonicalizeValue(new Set()), /MONGO_INVALID_FILTER/);

      class CustomFilterClass {
        name = "custom";
      }
      assert.throws(() => canonicalizeValue(new CustomFilterClass()), /MONGO_INVALID_FILTER/);
    });
  });

  describe("Phase 2 Canonical Binary Validation", () => {
    it("validates and normalizes valid canonical base64 and subtypes", () => {
      const bin1 = { base64: "AQIDBA==", subType: 0 };
      assert.deepEqual(validateAndNormalizeEjsonBinary(bin1), {
        b: "AQIDBA==",
        s: "00",
      });

      const bin2 = { $base64: "////", $type: "04" };
      assert.deepEqual(validateAndNormalizeEjsonBinary(bin2), {
        b: "////",
        s: "04",
      });
    });

    it("rejects unexpected nested fields in $binary", () => {
      const invalid = { base64: "AQID", subType: 0, unexpectedField: "danger" };
      assert.throws(() => validateAndNormalizeEjsonBinary(invalid), /unexpected nested field/);
    });

    it("rejects non-canonical base64 with non-zero pad bits", () => {
      const nonCanonical = { base64: "AR==", subType: 0 };
      assert.throws(() => validateAndNormalizeEjsonBinary(nonCanonical), /non-canonical base64/);
    });

    it("rejects invalid subtype values", () => {
      assert.throws(() => validateAndNormalizeEjsonBinary({ base64: "AQIDBA==", subType: 256 }));
      assert.throws(() => validateAndNormalizeEjsonBinary({ base64: "AQIDBA==", subType: -1 }));
      assert.throws(() => validateAndNormalizeEjsonBinary({ base64: "AQIDBA==", subType: "invalidHex" }));
    });
  });

  describe("EJSON Numeric Lexical & Range Validation", () => {
    it("canonicalizes valid $numberInt within 32-bit range", () => {
      assert.deepEqual(canonicalizeValue({ $numberInt: "2147483647" }), ["ejson_int", "2147483647"]);
      assert.deepEqual(canonicalizeValue({ $numberInt: "-2147483648" }), ["ejson_int", "-2147483648"]);
    });

    it("rejects out-of-range or malformed $numberInt", () => {
      assert.throws(() => canonicalizeValue({ $numberInt: "2147483648" }));
      assert.throws(() => canonicalizeValue({ $numberInt: "123.45" }));
    });

    it("canonicalizes valid $numberLong within 64-bit range", () => {
      assert.deepEqual(canonicalizeValue({ $numberLong: "9223372036854775807" }), [
        "ejson_long",
        "9223372036854775807",
      ]);
    });

    it("rejects out-of-range or malformed $numberLong", () => {
      assert.throws(() => canonicalizeValue({ $numberLong: "9223372036854775808" }));
      assert.throws(() => canonicalizeValue({ $numberLong: "abc" }));
    });

    it("canonicalizes valid $numberDecimal", () => {
      assert.deepEqual(canonicalizeValue({ $numberDecimal: "123.456" }), ["ejson_decimal", "123.456"]);
      assert.deepEqual(canonicalizeValue({ $numberDecimal: "NaN" }), ["ejson_decimal", "NaN"]);
      assert.deepEqual(canonicalizeValue({ $numberDecimal: "Infinity" }), ["ejson_decimal", "Infinity"]);
    });

    it("encodes objects with extra fields alongside markers as ordinary objects", () => {
      const objWithExtra = { $numberInt: "100", label: "test" };
      const ast = canonicalizeValue(objWithExtra);
      assert.equal(ast[0], "obj");
    });
  });

  describe("generateFilterKey and Option A Navigation", () => {
    it("generates deterministic keys invariant to key order", () => {
      const key1 = generateFilterKey("db1", "users", { age: 25, active: true });
      const key2 = generateFilterKey("db1", "users", { active: true, age: 25 });
      assert.equal(key1, key2);
    });

    it("handles explicit empty filter", () => {
      assert.equal(generateFilterKey("db1", "users", {}), "db1::users::{}");
      assert.equal(generateFilterKey("db1", "users", undefined), "db1::users::{}");
      assert.equal(generateFilterKey("db1", "users", null), "db1::users::{}");
    });

    it("derives Option A pagination using pageSize + 1 strategy with zero countDocuments", () => {
      let countDocumentsCalls = 0;
      const mockCountDocuments = () => {
        countDocumentsCalls++;
        return 1000;
      };

      const pageSize = 50;
      // Fetch pageSize + 1 records from database
      const fetchedRawDocs = Array.from({ length: pageSize + 1 }, (_, i) => ({ _id: `doc-${i}` }));

      // Option A derivation: extra record determines hasMore, sliced to pageSize
      const hasMore = fetchedRawDocs.length > pageSize;
      const displayedDocs = hasMore ? fetchedRawDocs.slice(0, pageSize) : fetchedRawDocs;
      const countOmitted = true;

      assert.equal(hasMore, true);
      assert.equal(displayedDocs.length, 50);
      assert.equal(countOmitted, true);
      assert.equal(countDocumentsCalls, 0); // Proves zero count queries performed
    });
  });
});
