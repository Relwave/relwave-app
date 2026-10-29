import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { validateMongoFilter } from "../components/MongoFilterInput";

function expect(actual: any) {
  return {
    toBe(expected: any) {
      assert.strictEqual(actual, expected);
    },
    toEqual(expected: any) {
      assert.deepStrictEqual(actual, expected);
    },
    toBeNull() {
      assert.strictEqual(actual, null);
    },
    toBeUndefined() {
      assert.strictEqual(actual, undefined);
    },
    toBeDefined() {
      assert.notStrictEqual(actual, undefined);
    },
    toBeTruthy() {
      assert.ok(actual);
    },
    toBeFalsy() {
      assert.ok(!actual);
    },
    toContain(substr: string) {
      assert.ok(
        typeof actual === "string" && actual.includes(substr),
        `Expected "${actual}" to contain "${substr}"`,
      );
    },
    not: {
      toBeNull() {
        assert.notStrictEqual(actual, null);
      },
      toContain(substr: string) {
        assert.ok(
          typeof actual === "string" && !actual.includes(substr),
          `Expected "${actual}" not to contain "${substr}"`,
        );
      },
    },
  };
}

describe("MongoFilterInput EJSON validation", () => {
  it("treats empty string as valid (no filter)", () => {
    const res = validateMongoFilter("");
    expect(res.isValid).toBe(true);
    expect(res.parsed).toBeUndefined();
  });

  it("validates standard JSON filter object", () => {
    const res = validateMongoFilter('{"status": "active", "count": 10}');
    expect(res.isValid).toBe(true);
    expect(res.parsed).toEqual({ status: "active", count: 10 });
  });

  it("validates Extended-JSON with $oid and $gte", () => {
    const filter = '{"_id": {"$oid": "507f1f77bcf86cd799439011"}, "age": {"$gte": 21}}';
    const res = validateMongoFilter(filter);
    expect(res.isValid).toBe(true);
    expect(res.parsed?._id?.$oid).toBe("507f1f77bcf86cd799439011");
  });

  it("rejects invalid JSON syntax", () => {
    const res = validateMongoFilter('{status: "active"}');
    expect(res.isValid).toBe(false);
    expect(res.error).toBeDefined();
  });

  it("rejects JSON arrays because filters must be objects", () => {
    const res = validateMongoFilter("[1, 2, 3]");
    expect(res.isValid).toBe(false);
    expect(res.error).toContain("must be a JSON object");
  });
});
