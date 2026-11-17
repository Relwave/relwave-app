import { describe, expect, test, beforeAll, afterAll, jest } from "@jest/globals";
import { MongoClient } from "mongodb";
import { mongoConnector, collectionExists, closeAllMongoClients } from "../../src/connectors/mongo";
import type { MongoConfig } from "../../src/types/mongo";

// ---------------------------------------------------------------------------
// M2 integration tests — require a live MongoDB. Uses a dedicated database so
// it never collides with the M1 `testdb` fixtures. Skips cleanly when the
// server is unreachable (spec §16.2).
// ---------------------------------------------------------------------------

const MONGO_HOST = process.env.REAL_MONGODB_HOST || "127.0.0.1";
const MONGO_PORT = process.env.REAL_MONGODB_PORT || "27017";
const MONGO_DB = process.env.REAL_MONGODB_DATABASE_M2 || "relwave_m2_it";

const config: MongoConfig = {
  uri: `mongodb://${MONGO_HOST}:${MONGO_PORT}/${MONGO_DB}`,
  database: MONGO_DB,
};

let seedClient: MongoClient | null = null;
let connected = false;

beforeAll(async () => {
  jest.setTimeout(60000);
  try {
    seedClient = new MongoClient(config.uri as string);
    await seedClient.connect();
    try {
      await seedClient.db(MONGO_DB).dropDatabase();
    } catch {
      // ignore — may lack dropDatabase privilege; collections are dropped per-test
    }
    connected = true;
  } catch {
    connected = false;
    console.warn(
      `[mongoDocuments.integration] MongoDB not reachable at ${MONGO_HOST}:${MONGO_PORT}; skipping M2 integration tests.`,
    );
  }
}, 60000);

afterAll(async () => {
  if (seedClient) {
    try {
      await seedClient.close();
    } catch {
      // ignore
    }
    seedClient = null;
  }
  await closeAllMongoClients();
});

describe("M2 findDocuments", () => {
  test("round-trips ObjectId / int32 / int64 / decimal / date / nested types", async () => {
    if (!connected) return;
    const oid = new (await import("mongodb")).ObjectId();
    const now = new Date("2024-01-01T00:00:00.000Z");
    const res = await mongoConnector.insertDocument(config, {
      collection: "rt",
      document: {
        _id: { $oid: oid.toHexString() },
        name: "Alice",
        age: { $numberInt: "30" },
        score: { $numberDecimal: "9.50" },
        big: { $numberLong: "9007199254740993" },
        createdAt: { $date: now.toISOString() },
        tags: ["a", "b"],
        meta: { nested: true },
      },
    });
    expect(res.insertedId).toEqual({ $oid: oid.toHexString() });
    expect(res.document._id).toEqual({ $oid: oid.toHexString() });

    const found = await mongoConnector.findDocuments(config, {
      collection: "rt",
      filter: { _id: { $oid: oid.toHexString() } },
    });
    expect(found.documents).toHaveLength(1);
    const d = found.documents[0];
    expect(d.name).toBe("Alice");
    expect(d.age).toEqual({ $numberInt: "30" });
    expect(d.score).toEqual({ $numberDecimal: "9.50" });
    expect(d.big).toEqual({ $numberLong: "9007199254740993" });
    expect(d.createdAt).toEqual({ $date: now.toISOString() });
    expect(d.tags).toEqual(["a", "b"]);
    expect(d.meta).toEqual({ nested: true });
  });

  test("filters with $in, $gt (typed), $regex and _id $oid", async () => {
    if (!connected) return;
    await mongoConnector.insertDocument(config, {
      collection: "filt",
      document: { tag: "red", n: { $numberInt: "10" }, name: "Alice" },
    });
    await mongoConnector.insertDocument(config, {
      collection: "filt",
      document: { tag: "blue", n: { $numberInt: "20" }, name: "Bob" },
    });
    await mongoConnector.insertDocument(config, {
      collection: "filt",
      document: { tag: "red", n: { $numberInt: "30" }, name: "Carol" },
    });

    const byIn = await mongoConnector.findDocuments(config, {
      collection: "filt",
      filter: { tag: { $in: ["red", "green"] } },
    });
    expect(byIn.total).toBe(2);

    const byGt = await mongoConnector.findDocuments(config, {
      collection: "filt",
      filter: { n: { $gt: { $numberInt: "15" } } },
    });
    expect(byGt.total).toBe(2);

    const byRegex = await mongoConnector.findDocuments(config, {
      collection: "filt",
      filter: { name: { $regex: "^A" } },
    });
    expect(byRegex.documents).toHaveLength(1);
    expect(byRegex.documents[0].name).toBe("Alice");
  });

  test("paginates with total / totalPages / hasMore", async () => {
    if (!connected) return;
    for (let i = 0; i < 25; i++) {
      await mongoConnector.insertDocument(config, {
        collection: "page",
        document: { idx: { $numberInt: String(i) } },
      });
    }
    const p1 = await mongoConnector.findDocuments(config, {
      collection: "page",
      pageSize: 10,
      page: 1,
      sort: { idx: 1 },
    });
    expect(p1.total).toBe(25);
    expect(p1.documents).toHaveLength(10);
    expect(p1.totalPages).toBe(3);
    expect(p1.hasMore).toBe(true);
    expect(p1.documents[0].idx).toEqual({ $numberInt: "0" });

    const p3 = await mongoConnector.findDocuments(config, {
      collection: "page",
      pageSize: 10,
      page: 3,
      sort: { idx: 1 },
    });
    expect(p3.documents).toHaveLength(5);
    expect(p3.hasMore).toBe(false);
  });

  test("applies sort and projection", async () => {
    if (!connected) return;
    await mongoConnector.insertDocument(config, {
      collection: "sp",
      document: { k: "a", secret: "s1", val: { $numberInt: "3" } },
    });
    await mongoConnector.insertDocument(config, {
      collection: "sp",
      document: { k: "b", secret: "s2", val: { $numberInt: "1" } },
    });
    await mongoConnector.insertDocument(config, {
      collection: "sp",
      document: { k: "c", secret: "s3", val: { $numberInt: "2" } },
    });

    const res = await mongoConnector.findDocuments(config, {
      collection: "sp",
      sort: { val: 1 },
      projection: { k: 1, _id: 0 },
    });
    expect(res.documents.map((d) => d.k)).toEqual(["b", "c", "a"]);
    expect(res.documents[0]).not.toHaveProperty("secret");
    expect(res.documents[0]).not.toHaveProperty("_id");
  });
});

describe("M2 updateDocument", () => {
  test("applies $set + $inc and returns the after-document", async () => {
    if (!connected) return;
    const ins = await mongoConnector.insertDocument(config, {
      collection: "upd",
      document: { name: "Bob", count: { $numberInt: "1" } },
    });
    const res = await mongoConnector.updateDocument(config, {
      collection: "upd",
      filter: { _id: ins.insertedId },
      update: { $set: { name: "Bobby" }, $inc: { count: { $numberInt: "5" } } },
      options: { returnDocument: "after" },
    });
    expect(res.matchedCount).toBe(1);
    expect(res.modifiedCount).toBe(1);
    expect(res.updatedDocument?.name).toBe("Bobby");
    expect(res.updatedDocument?.count).toEqual({ $numberInt: "6" });
  });

  test("returnDocument=before returns the pre-update document and persists the change", async () => {
    if (!connected) return;
    const ins = await mongoConnector.insertDocument(config, {
      collection: "updb",
      document: { v: { $numberInt: "1" } },
    });
    const res = await mongoConnector.updateDocument(config, {
      collection: "updb",
      filter: { _id: ins.insertedId },
      update: { $set: { v: { $numberInt: "2" } } },
      options: { returnDocument: "before" },
    });
    expect(res.updatedDocument?.v).toEqual({ $numberInt: "1" });
    const found = await mongoConnector.findDocuments(config, {
      collection: "updb",
      filter: { _id: ins.insertedId },
    });
    expect(found.documents[0].v).toEqual({ $numberInt: "2" });
  });

  test("upsert creates a document and reports upsertedId", async () => {
    if (!connected) return;
    const res = await mongoConnector.updateDocument(config, {
      collection: "ups",
      filter: { code: "XYZ" },
      update: { $set: { val: 1 } },
      options: { upsert: true },
    });
    expect(res.matchedCount).toBe(0);
    expect(res.upsertedId).toBeDefined();
    const found = await mongoConnector.findDocuments(config, {
      collection: "ups",
      filter: { code: "XYZ" },
    });
    expect(found.documents).toHaveLength(1);
  });

  test("multi updates every match", async () => {
    if (!connected) return;
    await mongoConnector.insertDocument(config, {
      collection: "multiu",
      document: { g: "a", n: { $numberInt: "0" } },
    });
    await mongoConnector.insertDocument(config, {
      collection: "multiu",
      document: { g: "a", n: { $numberInt: "0" } },
    });
    const res = await mongoConnector.updateDocument(config, {
      collection: "multiu",
      filter: { g: "a" },
      update: { $set: { n: { $numberInt: "9" } } },
      options: { multi: true },
    });
    expect(res.matchedCount).toBe(2);
    expect(res.modifiedCount).toBe(2);
  });
});

describe("M2 deleteDocument", () => {
  test("removes a single document and reports deletedCount", async () => {
    if (!connected) return;
    const ins = await mongoConnector.insertDocument(config, {
      collection: "dels",
      document: { x: 1 },
    });
    const res = await mongoConnector.deleteDocument(config, {
      collection: "dels",
      filter: { _id: ins.insertedId },
    });
    expect(res.deletedCount).toBe(1);
    const found = await mongoConnector.findDocuments(config, {
      collection: "dels",
      filter: { _id: ins.insertedId },
    });
    expect(found.documents).toHaveLength(0);
  });

  test("multi removes every match", async () => {
    if (!connected) return;
    await mongoConnector.insertDocument(config, { collection: "delm", document: { g: "z" } });
    await mongoConnector.insertDocument(config, { collection: "delm", document: { g: "z" } });
    const res = await mongoConnector.deleteDocument(config, {
      collection: "delm",
      filter: { g: "z" },
      options: { multi: true },
    });
    expect(res.deletedCount).toBe(2);
  });
});

describe("M2 runAggregation", () => {
  test("groups by a field and computes an aggregate", async () => {
    if (!connected) return;
    await mongoConnector.insertDocument(config, {
      collection: "agg",
      document: { dept: "eng", salary: { $numberInt: "100" } },
    });
    await mongoConnector.insertDocument(config, {
      collection: "agg",
      document: { dept: "eng", salary: { $numberInt: "200" } },
    });
    await mongoConnector.insertDocument(config, {
      collection: "agg",
      document: { dept: "sales", salary: { $numberInt: "150" } },
    });

    const res = await mongoConnector.runAggregation(config, {
      collection: "agg",
      pipeline: [{ $group: { _id: "$dept", avg: { $avg: "$salary" } } }, { $sort: { _id: 1 } }],
    });
    expect(res.stageCount).toBe(2);
    expect(res.documents).toHaveLength(2);
    expect(res.documents[0]._id).toBe("eng");
    expect(Number(res.documents[0].avg)).toBe(150);
  });
});

describe("M2 cache + existence", () => {
  test("document-page cache reflects a mutation after invalidation", async () => {
    if (!connected) return;
    const cacheConfig: MongoConfig = { ...config, cacheDocuments: true };
    const ins = await mongoConnector.insertDocument(cacheConfig, {
      collection: "cache",
      document: { k: "v1" },
    });
    const q = { collection: "cache", filter: { _id: ins.insertedId } };
    const first = await mongoConnector.findDocuments(cacheConfig, q);
    expect(first.documents[0].k).toBe("v1");

    // A mutation clears the collection cache, so the next read reflects v2.
    await mongoConnector.updateDocument(cacheConfig, {
      collection: "cache",
      filter: { _id: ins.insertedId },
      update: { $set: { k: "v2" } },
    });
    const second = await mongoConnector.findDocuments(cacheConfig, q);
    expect(second.documents[0].k).toBe("v2");
  });

  test("collectionExists reports presence and absence", async () => {
    if (!connected) return;
    await mongoConnector.insertDocument(config, {
      collection: "exists_check",
      document: { a: 1 },
    });
    expect(await collectionExists(config, "exists_check")).toBe(true);
    expect(await collectionExists(config, "nonexistent_xyz_123")).toBe(false);
  });
});
