import { describe, expect, test } from "@jest/globals";
import { ObjectId, Int32, Long } from "mongodb";
import {
  mongoEJSONtoBSON,
  mongoBSONtoEJSON,
  serializeMongoUpdateOperand,
  serializeMongoPipelineStage,
} from "../../src/connectors/mongoBson";
import {
  mongoConnector,
  mongodbCache,
  MongoApiError,
  mapMongoError,
  withMongoTimeout,
  assertReadOnlyPipeline,
} from "../../src/connectors/mongo";
import type {
  MongoConfig,
  MongoFindRequest,
  MongoSortSpec,
  EJSONDocument,
} from "../../src/types/mongo";
import { QueryExecutor } from "../../src/services/queryExecutor";
import { DBType } from "../../src/types";

// ---------------------------------------------------------------------------
// M2 unit tests — driver-free. Covers the EJSON<->BSON converters, the request
// validation / limit guards (which reject before any driver call), the error
// mapper, the client-side timeout wrapper, and the collection-scoped cache.
// (docs/MONGODB_M2_SPEC.md §16.1)
// ---------------------------------------------------------------------------

describe("mongoBson EJSON round-trip", () => {
  const cases: unknown[] = [
    { $oid: "507f1f77bcf86cd799439011" },
    { $date: "2024-01-01T00:00:00.000Z" },
    { $numberInt: "123" },
    { $numberLong: "9007199254740993" },
    { $numberDecimal: "1.50" },
    { $binary: { $type: "00", $base64: "aGVsbG8=" } },
    { $regex: "ab+c", $options: "i" },
    { $timestamp: { $t: "1", $i: "2" } },
    {
      name: "x",
      tags: ["a", "b"],
      nested: {
        n: { $numberInt: "5" },
        id: { $oid: "507f1f77bcf86cd799439011" },
      },
    },
    "plain string",
    42,
    3.14,
    true,
    false,
    null,
  ];

  test("mongoBSONtoEJSON(mongoEJSONtoBSON(x)) is structurally equal to x", () => {
    for (const c of cases) {
      expect(mongoBSONtoEJSON(mongoEJSONtoBSON(c as EJSONDocument))).toEqual(c);
    }
  });

  test("a bare hex string stays a string; only $oid yields an ObjectId", () => {
    const hex = "507f1f77bcf86cd799439011";
    expect(mongoEJSONtoBSON({ v: hex }).v).toBe(hex);
    expect(mongoEJSONtoBSON({ v: { $oid: hex } }).v).toBeInstanceOf(ObjectId);
  });

  test("unknown $-wrappers pass through unchanged", () => {
    const input: EJSONDocument = { $unknownThing: "x" };
    expect(mongoBSONtoEJSON(mongoEJSONtoBSON(input))).toEqual(input);
  });

  test("serializeMongoUpdateOperand preserves operator keys and resolves leaf values", () => {
    const op = serializeMongoUpdateOperand({
      $set: { name: "a", age: { $numberInt: "5" } },
      $inc: { count: { $numberLong: "1" } },
    });
    expect(Object.keys(op).sort()).toEqual(["$inc", "$set"]);
    const set = op.$set as Record<string, unknown>;
    const inc = op.$inc as Record<string, unknown>;
    expect(set.name).toBe("a");
    expect(set.age).toBeInstanceOf(Int32);
    expect(inc.count).toBeInstanceOf(Long);
  });

  test("serializeMongoPipelineStage resolves EJSON but does not inject $literal", () => {
    const stage = serializeMongoPipelineStage({
      $group: { _id: "$dept", avg: { $avg: "$salary" } },
    });
    expect(stage).toEqual({ $group: { _id: "$dept", avg: { $avg: "$salary" } } });
  });
});

describe("M2 request validation (rejects before touching the driver)", () => {
  const dummy: MongoConfig = { uri: "mongodb://localhost:27017/dummy", database: "dummy" };

  test("findDocuments rejects a page beyond the maximum", async () => {
    await expect(
      mongoConnector.findDocuments(dummy, { collection: "c", page: 99 }),
    ).rejects.toMatchObject({ code: "MONGO_VALIDATION_ERROR" });
  });

  test("findDocuments rejects a non-object filter", async () => {
    for (const bad of ["str", 123, true, [1, 2]]) {
      await expect(
        mongoConnector.findDocuments(dummy, { collection: "c", filter: bad as any }),
      ).rejects.toMatchObject({
        code: "MONGO_INVALID_FILTER",
        message: "filter must be an object",
      });
    }
  });

  test("findDocuments rejects an oversized filter", async () => {
    const big: EJSONDocument = { big: "x".repeat(9000) };
    await expect(
      mongoConnector.findDocuments(dummy, { collection: "c", filter: big }),
    ).rejects.toMatchObject({ code: "MONGO_LIMIT_EXCEEDED" });
  });

  test("findDocuments rejects an invalid sort direction", async () => {
    const req: MongoFindRequest = {
      collection: "c",
      sort: { a: "SIDEWAYS" } as unknown as MongoSortSpec,
    };
    await expect(mongoConnector.findDocuments(dummy, req)).rejects.toMatchObject({
      code: "MONGO_INVALID_FILTER",
    });
  });

  test("findDocuments rejects a projection mixing inclusion and exclusion", async () => {
    await expect(
      mongoConnector.findDocuments(dummy, { collection: "c", projection: { a: 1, b: 0 } }),
    ).rejects.toMatchObject({ code: "MONGO_INVALID_FILTER" });
  });

  test("updateDocument rejects an empty filter (bulk-op guard)", async () => {
    await expect(
      mongoConnector.updateDocument(dummy, {
        collection: "c",
        filter: {},
        update: { $set: { a: 1 } },
      }),
    ).rejects.toMatchObject({ code: "MONGO_BULK_OP_FORBIDDEN" });
  });

  test("updateDocument rejects a non-operator (replacement) document", async () => {
    await expect(
      mongoConnector.updateDocument(dummy, {
        collection: "c",
        filter: { x: 1 },
        update: { name: "a" },
      }),
    ).rejects.toMatchObject({ code: "MONGO_INVALID_UPDATE_OPERAND" });
  });

  test("deleteDocument rejects an empty filter (bulk-op guard)", async () => {
    await expect(
      mongoConnector.deleteDocument(dummy, { collection: "c", filter: {} }),
    ).rejects.toMatchObject({ code: "MONGO_BULK_OP_FORBIDDEN" });
  });

  test("runAggregation accepts an empty pipeline without error", () => {
    expect(() => assertReadOnlyPipeline([])).not.toThrow();
  });

  test("runAggregation rejects a write stage ($out)", async () => {
    await expect(
      mongoConnector.runAggregation(dummy, {
        collection: "c",
        pipeline: [{ $out: { coll: "x" } }],
      }),
    ).rejects.toMatchObject({ code: "MONGO_WRITE_STAGE_FORBIDDEN" });
  });

  test("runAggregation rejects a pipeline over the stage cap", async () => {
    const pipeline = Array.from({ length: 65 }, (): EJSONDocument => ({ $match: {} }));
    await expect(
      mongoConnector.runAggregation(dummy, { collection: "c", pipeline }),
    ).rejects.toMatchObject({ code: "MONGO_LIMIT_EXCEEDED" });
  });

  test("insertDocument rejects a non-object document", async () => {
    await expect(
      mongoConnector.insertDocument(dummy, {
        collection: "c",
        document: [1, 2, 3] as unknown as EJSONDocument,
      }),
    ).rejects.toMatchObject({ code: "MONGO_VALIDATION_ERROR" });
  });
});

describe("M2 error mapping", () => {
  test("maps common MongoServerError shapes to stable codes", () => {
    expect(mapMongoError({ name: "MongoServerError", codeName: "NamespaceNotFound" }).code).toBe(
      "MONGO_NS_NOT_FOUND",
    );
    expect(mapMongoError({ name: "MongoServerError", code: 11000 }).code).toBe(
      "MONGO_DUPLICATE_KEY",
    );
    expect(mapMongoError({ name: "MongoServerError", codeName: "AuthenticationFailed" }).code).toBe(
      "MONGO_AUTH_ERROR",
    );
    expect(mapMongoError({ name: "MongoServerError", codeName: "MaxTimeMSExpired" }).code).toBe(
      "MONGO_OPERATION_TIMEOUT",
    );
  });

  test("maps a generic error to a connection error and passes through MongoApiError", () => {
    expect(mapMongoError(new Error("boom")).code).toBe("MONGO_CONNECTION_ERROR");
    const api = new MongoApiError("MONGO_BULK_OP_FORBIDDEN", "nope");
    expect(mapMongoError(api)).toBe(api);
  });
});

describe("M2 client-side timeout wrapper", () => {
  test("passes through a fast result", async () => {
    await expect(withMongoTimeout(1000, async () => 42)).resolves.toBe(42);
  });

  test("propagates a real error from the operation", async () => {
    await expect(
      withMongoTimeout(1000, async () => {
        throw new Error("boom");
      }),
    ).rejects.toThrow("boom");
  });

  test("rejects with MONGO_OPERATION_TIMEOUT when the operation hangs", async () => {
    const start = Date.now();
    await expect(withMongoTimeout(30, () => new Promise<never>(() => {}))).rejects.toMatchObject({
      code: "MONGO_OPERATION_TIMEOUT",
      name: "MongoApiError",
    });
    expect(Date.now() - start).toBeLessThan(1000);
  });
});

describe("M2 collection-scoped cache", () => {
  const cfg: MongoConfig = { uri: "mongodb://localhost:27017/cachetest", database: "cachetest" };

  test("stores and reads collection stats and document pages, then evicts on clearCollectionCache", () => {
    mongodbCache.setCollectionStats(cfg, "c", {
      collection: "c",
      count: 5,
      sizeBytes: 100,
      avgObjSize: 20,
    });
    expect(mongodbCache.getCollectionStats(cfg, "c")).toEqual({
      collection: "c",
      count: 5,
      sizeBytes: 100,
      avgObjSize: 20,
    });
    expect(mongodbCache.getCollectionStats(cfg, "other")).toBeNull();

    mongodbCache.setDocumentPage(cfg, "key1", [{ a: 1 }]);
    expect(mongodbCache.getDocumentPage(cfg, "key1")).toEqual([{ a: 1 }]);

    mongodbCache.clearCollectionCache(cfg, "c");
    expect(mongodbCache.getCollectionStats(cfg, "c")).toBeNull();
    expect(mongodbCache.getDocumentPage(cfg, "key1")).toBeNull();
  });

  test("isolation: a different connection does not see another connection's pages", () => {
    const other: MongoConfig = { uri: "mongodb://localhost:27017/other", database: "other" };
    mongodbCache.setDocumentPage(cfg, "shared", [{ a: 1 }]);
    expect(mongodbCache.getDocumentPage(other, "shared")).toBeNull();
    expect(mongodbCache.getDocumentPage(cfg, "shared")).toEqual([{ a: 1 }]);
  });
});

describe("M2 executor document-op routing (spec §12)", () => {
  const executor = new QueryExecutor();
  const cfg: MongoConfig = { uri: "mongodb://localhost:27017/dummy", database: "dummy" };

  test("rejects document operations on a non-MongoDB connection with MONGO_UNSUPPORTED_OPERATION", async () => {
    await expect(
      executor.findDocuments(cfg, DBType.POSTGRES, { collection: "c" }),
    ).rejects.toMatchObject({ code: "MONGO_UNSUPPORTED_OPERATION" });
    await expect(
      executor.insertDocument(cfg, DBType.MYSQL, { collection: "c", document: { a: 1 } }),
    ).rejects.toMatchObject({ code: "MONGO_UNSUPPORTED_OPERATION" });
    await expect(
      executor.updateDocument(cfg, DBType.POSTGRES, { collection: "c", filter: {}, update: {} }),
    ).rejects.toMatchObject({ code: "MONGO_UNSUPPORTED_OPERATION" });
    await expect(
      executor.deleteDocument(cfg, DBType.POSTGRES, { collection: "c", filter: {} }),
    ).rejects.toMatchObject({ code: "MONGO_UNSUPPORTED_OPERATION" });
    await expect(
      executor.runAggregation(cfg, DBType.POSTGRES, {
        collection: "c",
        pipeline: [{ $match: {} }],
      }),
    ).rejects.toMatchObject({ code: "MONGO_UNSUPPORTED_OPERATION" });
  });
});
