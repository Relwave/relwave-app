import { describe, expect, test } from "@jest/globals";
import { ObjectId, Int32, Long, Decimal128, Binary, Timestamp } from "mongodb";
import { bsonTypeOf, bsonNumericKind } from "../../src/connectors/mongoBson";
import {
  FieldAccumulator,
  clampInferSampleSize,
  clampInferMaxDepth,
  mongodbCache,
} from "../../src/connectors/mongo";
import { QueryExecutor } from "../../src/services/queryExecutor";
import { DBType } from "../../src/types";
import type { MongoConfig } from "../../src/types/mongo";

describe("M3 pure BSON type inference (bsonTypeOf / bsonNumericKind)", () => {
  test("bsonTypeOf detects primitives, BSON types, and composites correctly", () => {
    expect(bsonTypeOf(null)).toBe("null");
    expect(bsonTypeOf(undefined)).toBe("undefined");
    expect(bsonTypeOf("test")).toBe("string");
    expect(bsonTypeOf(true)).toBe("bool");
    expect(bsonTypeOf(false)).toBe("bool");
    expect(bsonTypeOf(42)).toBe("number");
    expect(bsonTypeOf(3.14)).toBe("number");
    expect(bsonTypeOf(new Int32(100))).toBe("number");
    expect(bsonTypeOf(new Long(9007199254740993n))).toBe("long");
    expect(bsonTypeOf(new Decimal128("12.34"))).toBe("decimal");
    expect(bsonTypeOf(new Timestamp({ t: 1, i: 2 }))).toBe("timestamp");
    expect(bsonTypeOf(new Binary(Buffer.from("abc")))).toBe("binary");
    expect(bsonTypeOf(Buffer.from("abc"))).toBe("binary");
    expect(bsonTypeOf(new Uint8Array([1, 2, 3]))).toBe("binary");
    expect(bsonTypeOf(new Date("2026-01-01T00:00:00.000Z"))).toBe("date");
    expect(bsonTypeOf(new ObjectId("507f1f77bcf86cd799439011"))).toBe("objectId");
    expect(bsonTypeOf([1, 2, 3])).toBe("array");
    expect(bsonTypeOf({ a: 1, b: "hello" })).toBe("object");
    expect(bsonTypeOf({ _bsontype: "UnknownSubtype" })).toBe("object");
  });

  test("bsonNumericKind identifies int and double accurately", () => {
    expect(bsonNumericKind(new Int32(5))).toBe("int");
    expect(bsonNumericKind(42)).toBe("int");
    expect(bsonNumericKind(3.14)).toBe("double");
    expect(bsonNumericKind({ _bsontype: "Double", valueOf: () => 5.5 })).toBe("double");
    expect(bsonNumericKind("42")).toBeUndefined();
    expect(bsonNumericKind(null)).toBeUndefined();
    expect(bsonNumericKind(undefined)).toBeUndefined();
    expect(bsonNumericKind(new Long(100n))).toBeUndefined();
  });
});

describe("M3 clamping helpers", () => {
  test("clampInferSampleSize clamps to [1, 1000] and defaults to 100", () => {
    expect(clampInferSampleSize(undefined)).toBe(100);
    expect(clampInferSampleSize(NaN)).toBe(100);
    expect(clampInferSampleSize(0)).toBe(1);
    expect(clampInferSampleSize(-10)).toBe(1);
    expect(clampInferSampleSize(50)).toBe(50);
    expect(clampInferSampleSize(2000)).toBe(1000);
  });

  test("clampInferMaxDepth clamps to [1, 16] and defaults to 8", () => {
    expect(clampInferMaxDepth(undefined)).toBe(8);
    expect(clampInferMaxDepth(NaN)).toBe(8);
    expect(clampInferMaxDepth(0)).toBe(1);
    expect(clampInferMaxDepth(-5)).toBe(1);
    expect(clampInferMaxDepth(4)).toBe(4);
    expect(clampInferMaxDepth(25)).toBe(16);
  });
});

describe("FieldAccumulator (pure schema inference)", () => {
  test("infers uniform flat documents correctly", () => {
    const acc = new FieldAccumulator(2, 8);
    acc.ingest({ _id: new ObjectId(), name: "Alice", age: 30 });
    acc.ingest({ _id: new ObjectId(), name: "Bob", age: 25 });
    const fields = acc.toFields();

    expect(fields).toHaveLength(3);
    const idField = fields.find((f) => f.path === "_id")!;
    expect(idField.bsonType).toBe("objectId");
    expect(idField.presencePct).toBe(100);
    expect(idField.nullable).toBe(false);
    expect(idField.optional).toBe(false);
    expect(idField.depth).toBe(0);
    expect(idField.typeConflicts).toHaveLength(0);

    const nameField = fields.find((f) => f.path === "name")!;
    expect(nameField.bsonType).toBe("string");
    expect(nameField.presencePct).toBe(100);

    const ageField = fields.find((f) => f.path === "age")!;
    expect(ageField.bsonType).toBe("number");
    expect(ageField.numericKinds).toEqual(["int"]);
  });

  test("tracks nested paths, depths, parentPath, and maxChildDepth", () => {
    const acc = new FieldAccumulator(1, 8);
    acc.ingest({
      user: {
        profile: {
          bio: "Engineer",
        },
      },
    });
    const fields = acc.toFields();

    const user = fields.find((f) => f.path === "user")!;
    expect(user.depth).toBe(0);
    expect(user.isNested).toBe(true);
    expect(user.parentPath).toBeUndefined();
    expect(user.maxChildDepth).toBe(2);

    const profile = fields.find((f) => f.path === "user.profile")!;
    expect(profile.depth).toBe(1);
    expect(profile.isNested).toBe(true);
    expect(profile.parentPath).toBe("user");
    expect(profile.maxChildDepth).toBe(2);

    const bio = fields.find((f) => f.path === "user.profile.bio")!;
    expect(bio.depth).toBe(2);
    expect(bio.isNested).toBe(false);
    expect(bio.parentPath).toBe("user.profile");
    expect(bio.bsonType).toBe("string");
  });

  test("handles arrays and distinct arrayElementTypes without emitting indexed subpaths", () => {
    const acc = new FieldAccumulator(2, 8);
    acc.ingest({ tags: ["red", "green"] });
    acc.ingest({ tags: ["blue", 123] });
    const fields = acc.toFields();

    expect(fields.some((f) => f.path.startsWith("tags."))).toBe(false);

    const tagsField = fields.find((f) => f.path === "tags")!;
    expect(tagsField.isArray).toBe(true);
    expect(tagsField.bsonType).toBe("array");
    expect(tagsField.arrayElementTypes?.sort()).toEqual(["number", "string"]);
  });

  test("tracks mixed type conflicts with sorted counts and nullable/optional flags", () => {
    const acc = new FieldAccumulator(4, 8);
    acc.ingest({ score: 100 });
    acc.ingest({ score: "N/A" });
    acc.ingest({ score: "exempt" });
    acc.ingest({ score: null });

    const fields = acc.toFields();
    const score = fields.find((f) => f.path === "score")!;

    expect(score.nullable).toBe(true);
    expect(score.nullCount).toBe(1);
    expect(score.count).toBe(4);
    expect(score.optional).toBe(false);
    expect(score.presencePct).toBe(100);

    expect(score.bsonType).toBe("string");
    expect(score.typeConflicts.length).toBeGreaterThan(1);
    expect(score.typeConflicts[0].bsonType).toBe("string");
    expect(score.typeConflicts[0].count).toBe(2);
  });

  test("respects maxDepth and marks objects as truncated", () => {
    const acc = new FieldAccumulator(1, 1);
    acc.ingest({
      level0: {
        level1: {
          level2: "deep",
        },
      },
    });

    const fields = acc.toFields();
    expect(fields.find((f) => f.path === "level0.level1.level2")).toBeUndefined();
    const l1 = fields.find((f) => f.path === "level0.level1")!;
    expect(l1.depth).toBe(1);
    expect(l1.truncated).toBe(true);
  });
});

describe("M3 Cache Manager inferred schema integration", () => {
  const dummyCfg: MongoConfig = {
    uri: "mongodb://127.0.0.1:27017/test_db",
    database: "test_db",
  };

  test("stores, retrieves, and invalidates inferred schema", () => {
    const schemaPayload: any = {
      collection: "users",
      sampleSize: 10,
      totalDocs: 100,
      inferredAt: new Date().toISOString(),
      fieldCount: 1,
      nestedFieldCount: 0,
      arrayFieldCount: 0,
      fields: [],
      sampleDocuments: [],
    };

    mongodbCache.setInferredSchema(dummyCfg, "users", 100, 8, schemaPayload);
    const cached = mongodbCache.getInferredSchema(dummyCfg, "users", 100, 8);
    expect(cached).toEqual(schemaPayload);

    // Eviction on clearCollectionCache
    mongodbCache.clearCollectionCache(dummyCfg, "users");
    expect(mongodbCache.getInferredSchema(dummyCfg, "users", 100, 8)).toBeNull();

    // Re-set and clearForConnection
    mongodbCache.setInferredSchema(dummyCfg, "users", 100, 8, schemaPayload);
    mongodbCache.clearForConnection(dummyCfg);
    expect(mongodbCache.getInferredSchema(dummyCfg, "users", 100, 8)).toBeNull();

    // Re-set and clearAll
    mongodbCache.setInferredSchema(dummyCfg, "users", 100, 8, schemaPayload);
    mongodbCache.clearAll();
    expect(mongodbCache.getInferredSchema(dummyCfg, "users", 100, 8)).toBeNull();
  });
});

describe("QueryExecutor M3 MongoDB guards", () => {
  const executor = new QueryExecutor();

  test("listCollections rejects non-MongoDB dbType", async () => {
    await expect(executor.listCollections({} as any, DBType.POSTGRES)).rejects.toThrow(
      "listCollections requires a MongoDB connection",
    );
  });

  test("inferCollectionSchema rejects non-MongoDB dbType", async () => {
    await expect(
      executor.inferCollectionSchema({} as any, DBType.MYSQL, { collection: "users" }),
    ).rejects.toThrow("inferCollectionSchema requires a MongoDB connection");
  });
});
