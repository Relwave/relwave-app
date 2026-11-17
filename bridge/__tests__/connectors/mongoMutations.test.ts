import { describe, expect, test } from "@jest/globals";
import {
  assertNewCollectionName,
  assertNoOperatorKeys,
  mongoConnector,
  mongodbCache,
  MongoApiError,
} from "../../src/connectors/mongo";
import type { MongoConfig, EJSONDocument } from "../../src/types/mongo";
import { QueryExecutor } from "../../src/services/queryExecutor";
import { DBType } from "../../src/types";

describe("assertNewCollectionName", () => {
  test("accepts valid collection names", () => {
    expect(() => assertNewCollectionName("users")).not.toThrow();
    expect(() => assertNewCollectionName("user_accounts")).not.toThrow();
    expect(() => assertNewCollectionName("orders-2026")).not.toThrow();
    expect(() => assertNewCollectionName("_audit_log")).not.toThrow();
    expect(() => assertNewCollectionName("A")).not.toThrow();
    expect(() => assertNewCollectionName("a".repeat(120))).not.toThrow();
  });

  test("rejects non-string or empty name", () => {
    expect(() => assertNewCollectionName("")).toThrow(MongoApiError);
    expect(() => assertNewCollectionName(null)).toThrow(MongoApiError);
    expect(() => assertNewCollectionName(undefined)).toThrow(MongoApiError);
    expect(() => assertNewCollectionName(123)).toThrow(MongoApiError);
  });

  test("rejects names longer than 120 chars", () => {
    expect(() => assertNewCollectionName("a".repeat(121))).toThrow(MongoApiError);
  });

  test("rejects names with '$' or null bytes", () => {
    expect(() => assertNewCollectionName("my$coll")).toThrow(MongoApiError);
    expect(() => assertNewCollectionName("coll\0name")).toThrow(MongoApiError);
  });

  test("rejects names starting with 'system.'", () => {
    expect(() => assertNewCollectionName("system.views")).toThrow(MongoApiError);
    expect(() => assertNewCollectionName("system.profile")).toThrow(MongoApiError);
  });

  test("rejects names starting with numbers or containing invalid characters", () => {
    expect(() => assertNewCollectionName("123users")).toThrow(MongoApiError);
    expect(() => assertNewCollectionName("-users")).toThrow(MongoApiError);
    expect(() => assertNewCollectionName("my.collection")).toThrow(MongoApiError);
    expect(() => assertNewCollectionName("my collection")).toThrow(MongoApiError);
    expect(() => assertNewCollectionName("coll@test")).toThrow(MongoApiError);
  });
});

describe("assertNoOperatorKeys", () => {
  test("allows documents without top-level operator keys", () => {
    expect(() => assertNoOperatorKeys({ name: "Alice", age: 30 })).not.toThrow();
    expect(() => assertNoOperatorKeys({ _id: { $oid: "507f1f77bcf86cd799439011" } })).not.toThrow();
    expect(() => assertNoOperatorKeys({})).not.toThrow();
  });

  test("throws MONGO_VALIDATION_ERROR if any top-level key starts with '$'", () => {
    expect(() => assertNoOperatorKeys({ $set: { name: "Bob" } })).toThrow(
      "replacement document must not contain top-level operator keys",
    );
    expect(() => assertNoOperatorKeys({ name: "Bob", $inc: { count: 1 } })).toThrow(
      "replacement document must not contain top-level operator keys",
    );
  });
});

describe("M4 replaceDocument validation (rejects before driver)", () => {
  const dummy: MongoConfig = { uri: "mongodb://localhost:27017/dummy", database: "dummy" };

  test("rejects empty filter", async () => {
    await expect(
      mongoConnector.replaceDocument(dummy, {
        collection: "users",
        filter: {},
        replacement: { name: "test" },
      }),
    ).rejects.toMatchObject({ code: "MONGO_BULK_OP_FORBIDDEN" });
  });

  test("rejects non-object replacement", async () => {
    await expect(
      mongoConnector.replaceDocument(dummy, {
        collection: "users",
        filter: { _id: "123" },
        replacement: [1, 2, 3] as unknown as EJSONDocument,
      }),
    ).rejects.toMatchObject({ code: "MONGO_VALIDATION_ERROR" });
  });

  test("rejects replacement with operator keys", async () => {
    await expect(
      mongoConnector.replaceDocument(dummy, {
        collection: "users",
        filter: { _id: "123" },
        replacement: { $set: { a: 1 } },
      }),
    ).rejects.toMatchObject({ code: "MONGO_VALIDATION_ERROR" });
  });

  test("rejects changing _id between filter and replacement", async () => {
    await expect(
      mongoConnector.replaceDocument(dummy, {
        collection: "users",
        filter: { _id: { $oid: "507f1f77bcf86cd799439011" } },
        replacement: { _id: { $oid: "507f1f77bcf86cd799439022" }, name: "New" },
      }),
    ).rejects.toMatchObject({
      code: "MONGO_VALIDATION_ERROR",
      message: "Cannot change _id of a document",
    });
  });

  test("rejects oversized replacement", async () => {
    const huge = "x".repeat(17 * 1024 * 1024);
    await expect(
      mongoConnector.replaceDocument(dummy, {
        collection: "users",
        filter: { _id: "123" },
        replacement: { data: huge },
      }),
    ).rejects.toMatchObject({ code: "MONGO_LIMIT_EXCEEDED" });
  });
});

describe("M4 createCollection validation", () => {
  const dummy: MongoConfig = { uri: "mongodb://localhost:27017/dummy", database: "dummy" };

  test("rejects invalid collection name", async () => {
    await expect(
      mongoConnector.createCollection(dummy, { collection: "system.mycoll" }),
    ).rejects.toMatchObject({ code: "MONGO_VALIDATION_ERROR" });

    await expect(
      mongoConnector.createCollection(dummy, { collection: "invalid.name" }),
    ).rejects.toMatchObject({ code: "MONGO_VALIDATION_ERROR" });
  });

  test("rejects capped collection without size or size < 4096", async () => {
    await expect(
      mongoConnector.createCollection(dummy, {
        collection: "logs",
        options: { capped: true } as any,
      }),
    ).rejects.toMatchObject({ code: "MONGO_VALIDATION_ERROR" });

    await expect(
      mongoConnector.createCollection(dummy, {
        collection: "logs",
        options: { capped: true, size: 2048 },
      }),
    ).rejects.toMatchObject({ code: "MONGO_VALIDATION_ERROR" });

    await expect(
      mongoConnector.createCollection(dummy, {
        collection: "logs",
        options: { capped: true, size: 5000.5 },
      }),
    ).rejects.toMatchObject({ code: "MONGO_VALIDATION_ERROR" });
  });

  test("rejects capped collection with max <= 0 or non-integer", async () => {
    await expect(
      mongoConnector.createCollection(dummy, {
        collection: "logs",
        options: { capped: true, size: 8192, max: 0 },
      }),
    ).rejects.toMatchObject({ code: "MONGO_VALIDATION_ERROR" });

    await expect(
      mongoConnector.createCollection(dummy, {
        collection: "logs",
        options: { capped: true, size: 8192, max: -5 },
      }),
    ).rejects.toMatchObject({ code: "MONGO_VALIDATION_ERROR" });

    await expect(
      mongoConnector.createCollection(dummy, {
        collection: "logs",
        options: { capped: true, size: 8192, max: 10.5 },
      }),
    ).rejects.toMatchObject({ code: "MONGO_VALIDATION_ERROR" });
  });
});

describe("M4 dropCollection validation", () => {
  const dummy: MongoConfig = { uri: "mongodb://localhost:27017/dummy", database: "dummy" };

  test("rejects dropping system collection", async () => {
    await expect(
      mongoConnector.dropCollection(dummy, { collection: "system.views" }),
    ).rejects.toMatchObject({
      code: "MONGO_FORBIDDEN",
      message: "Cannot drop system collection",
    });

    await expect(
      mongoConnector.dropCollection(dummy, { collection: "system.profile" }),
    ).rejects.toMatchObject({
      code: "MONGO_FORBIDDEN",
      message: "Cannot drop system collection",
    });
  });

  test("rejects invalid collection name", async () => {
    await expect(mongoConnector.dropCollection(dummy, { collection: "" })).rejects.toMatchObject({
      code: "MONGO_VALIDATION_ERROR",
    });
  });
});

describe("M4 cache invalidation", () => {
  const cfg: MongoConfig = { uri: "mongodb://localhost:27017/cachedb", database: "cachedb" };

  test("clearCollectionCache and flushConnection invalidate collection metadata and page cache", () => {
    mongodbCache.setCollectionStats(cfg, "coll1", {
      collection: "coll1",
      count: 10,
      sizeBytes: 200,
      avgObjSize: 20,
    });
    mongodbCache.setDocumentPage(cfg, "p1", [{ doc: 1 }]);
    mongodbCache.setTableList(cfg, [{ name: "coll1", type: "TABLE", schema: "cachedb" }]);

    expect(mongodbCache.getCollectionStats(cfg, "coll1")).toBeDefined();
    expect(mongodbCache.getDocumentPage(cfg, "p1")).toBeDefined();
    expect(mongodbCache.getTableList(cfg)).toBeDefined();

    mongodbCache.clearCollectionCache(cfg, "coll1");
    expect(mongodbCache.getCollectionStats(cfg, "coll1")).toBeNull();
    expect(mongodbCache.getDocumentPage(cfg, "p1")).toBeNull();
    expect(mongodbCache.getTableList(cfg)).toBeDefined();

    mongodbCache.flushConnection(cfg);
    expect(mongodbCache.getTableList(cfg)).toBeNull();
  });
});

describe("M4 QueryExecutor routing", () => {
  const executor = new QueryExecutor();
  const cfg: MongoConfig = { uri: "mongodb://localhost:27017/dummy", database: "dummy" };

  test("rejects replaceDocument on non-MongoDB connection", async () => {
    await expect(
      executor.replaceDocument(cfg, DBType.POSTGRES, {
        collection: "c",
        filter: { a: 1 },
        replacement: { a: 2 },
      }),
    ).rejects.toMatchObject({ code: "MONGO_UNSUPPORTED_OPERATION" });
  });

  test("rejects createCollection on non-MongoDB connection", async () => {
    await expect(
      executor.createCollection(cfg, DBType.POSTGRES, { collection: "c" }),
    ).rejects.toMatchObject({ code: "MONGO_UNSUPPORTED_OPERATION" });
  });

  test("rejects dropCollection on non-MongoDB connection", async () => {
    await expect(
      executor.dropCollection(cfg, DBType.POSTGRES, { collection: "c" }),
    ).rejects.toMatchObject({ code: "MONGO_UNSUPPORTED_OPERATION" });
  });
});
