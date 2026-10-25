import { describe, expect, test } from "@jest/globals";
import { ObjectId, Decimal128, Long, Timestamp, Int32, Binary } from "mongodb";
import { serializeMongoValue, serializeMongoDocument } from "../src/connectors/mongoBson";

describe("serializeMongoValue", () => {
  test("passes primitives through unchanged", () => {
    expect(serializeMongoValue(null)).toBeNull();
    expect(serializeMongoValue(true)).toBe(true);
    expect(serializeMongoValue(42)).toBe(42);
    expect(serializeMongoValue("hi")).toBe("hi");
  });

  test("drops non-finite numbers to stay JSON-safe", () => {
    expect(serializeMongoValue(Number.NaN)).toBeNull();
    expect(serializeMongoValue(Number.POSITIVE_INFINITY)).toBeNull();
  });

  test("maps undefined to the wire convention", () => {
    expect(serializeMongoValue(undefined)).toEqual({ $undefined: true });
  });

  test("recurses into arrays", () => {
    expect(serializeMongoValue([1, "two", null])).toEqual([1, "two", null]);
  });

  test("serializes ObjectId, Date, Decimal128, Long, Timestamp", () => {
    const oid = new ObjectId("507f1f77bcf86cd799439011");
    expect(serializeMongoValue(oid)).toEqual({ $oid: "507f1f77bcf86cd799439011" });

    const date = new Date("2020-01-02T03:04:05.000Z");
    expect(serializeMongoValue(date)).toEqual({ $date: "2020-01-02T03:04:05.000Z" });

    expect(serializeMongoValue(new Decimal128("123.45"))).toEqual({ $numberDecimal: "123.45" });

    expect(serializeMongoValue(Long.fromNumber(42))).toEqual({ $numberLong: "42" });

    const ts = new Timestamp({ t: 1234567890, i: 1 });
    expect(serializeMongoValue(ts)).toEqual({ $timestamp: { t: 1234567890, i: 1 } });
  });

  test("flattens Int32 to a plain number", () => {
    expect(serializeMongoValue(new Int32(7))).toBe(7);
    expect(serializeMongoValue(new Int32(7)).constructor).toBe(Number);
  });

  test("serializes Binary and raw buffers to $binary", () => {
    const bin = new Binary(Buffer.from("hello"));
    const out = serializeMongoValue(bin) as { $binary: { base64: string; subtype: string } };
    expect(out.$binary.base64).toBe(Buffer.from("hello").toString("base64"));
    expect(out.$binary.subtype).toBe("00");

    const bufOut = serializeMongoValue(Buffer.from("hi")) as {
      $binary: { base64: string; subtype: string };
    };
    expect(bufOut.$binary.base64).toBe(Buffer.from("hi").toString("base64"));

    const u8Out = serializeMongoValue(new Uint8Array([1, 2, 3])) as {
      $binary: { base64: string; subtype: string };
    };
    expect(u8Out.$binary.base64).toBe(Buffer.from([1, 2, 3]).toString("base64"));
  });

  test("recurses through nested documents and arrays", () => {
    const value = serializeMongoValue({
      _id: new ObjectId("507f1f77bcf86cd799439011"),
      nested: { when: new Date("2021-06-07T08:09:10.000Z"), tags: ["a", "b"] },
      list: [1, { deep: true }],
    });
    expect(value).toEqual({
      _id: { $oid: "507f1f77bcf86cd799439011" },
      nested: { when: { $date: "2021-06-07T08:09:10.000Z" }, tags: ["a", "b"] },
      list: [1, { deep: true }],
    });
  });

  test("output is always JSON.stringify-safe", () => {
    const value = serializeMongoValue({
      _id: new ObjectId(),
      when: new Date(),
      big: Long.fromNumber(9007199254740993),
      dec: new Decimal128("3.14"),
      raw: Buffer.from("bytes"),
      missing: undefined,
      deep: { arr: [new ObjectId(), new Date()] },
    });
    expect(() => JSON.stringify(value)).not.toThrow();
    expect(JSON.parse(JSON.stringify(value))).toBeDefined();
  });
});

describe("serializeMongoDocument", () => {
  test("serializes a document and omits the internal _bsontype marker", () => {
    const doc = {
      _id: new ObjectId("507f1f77bcf86cd799439011"),
      name: "test",
      createdAt: new Date("2022-03-04T05:06:07.000Z"),
    };
    const out = serializeMongoDocument(doc);
    expect(out).toEqual({
      _id: { $oid: "507f1f77bcf86cd799439011" },
      name: "test",
      createdAt: { $date: "2022-03-04T05:06:07.000Z" },
    });
    expect(Object.keys(out)).not.toContain("_bsontype");
  });
});
