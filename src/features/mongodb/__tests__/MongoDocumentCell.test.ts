import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { formatMongoValue } from "../components/MongoDocumentCell";

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

describe("MongoDocumentCell formatting & BSON unwrapping", () => {
  it("formats ObjectId into clean hex string without leaking $oid", () => {
    const hex = "507f1f77bcf86cd799439011";
    const value = { $oid: hex };
    const res = formatMongoValue(value);

    expect(res.type).toBe("objectId");
    expect(res.display).toBe(hex);
    expect(res.display).not.toContain("$oid");
    expect(res.badgeText).toBe("OID");
  });

  it("formats Date ISO string without leaking $date", () => {
    const iso = "2024-03-24T12:00:00.000Z";
    const value = { $date: iso };
    const res = formatMongoValue(value);

    expect(res.type).toBe("date");
    expect(res.display).not.toContain("$date");
    expect(res.badgeText).toBe("DATE");
  });

  it("formats Date with $numberLong ms without leaking $date or $numberLong", () => {
    const value = { $date: { $numberLong: "1711281600000" } };
    const res = formatMongoValue(value);

    expect(res.type).toBe("date");
    expect(res.display).not.toContain("$date");
    expect(res.display).not.toContain("$numberLong");
  });

  it("formats $numberLong into digits without leaking $numberLong", () => {
    const value = { $numberLong: "9007199254740991" };
    const res = formatMongoValue(value);

    expect(res.type).toBe("long");
    expect(res.display).toBe("9007199254740991");
    expect(res.display).not.toContain("$numberLong");
    expect(res.badgeText).toBe("LONG");
  });

  it("formats $numberDecimal into digits without leaking $numberDecimal", () => {
    const value = { $numberDecimal: "123.456" };
    const res = formatMongoValue(value);

    expect(res.type).toBe("decimal");
    expect(res.display).toBe("123.456");
    expect(res.display).not.toContain("$numberDecimal");
  });

  it("handles null and boolean properly", () => {
    expect(formatMongoValue(null).display).toBe("NULL");
    expect(formatMongoValue(true).display).toBe("true");
    expect(formatMongoValue(false).display).toBe("false");
  });

  it("marks arrays and objects as expandable with item counts", () => {
    const arr = formatMongoValue([1, 2, 3]);
    expect(arr.isExpandable).toBe(true);
    expect(arr.badgeText).toBe("[3]");

    const obj = formatMongoValue({ a: 1, b: 2 });
    expect(obj.isExpandable).toBe(true);
    expect(obj.badgeText).toBe("{2}");
  });
});
