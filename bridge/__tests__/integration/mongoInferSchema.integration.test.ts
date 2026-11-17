import { describe, expect, test, beforeAll, afterAll } from "@jest/globals";
import { MongoClient } from "mongodb";
import { mongoConnector, closeAllMongoClients } from "../../src/connectors/mongo";
import type { MongoConfig } from "../../src/types/mongo";

const TEST_URI = process.env.MONGO_TEST_URI;
const itLive = TEST_URI ? test : test.skip;

describe("M3 MongoDB Schema Inference (Integration)", () => {
  let client: MongoClient | null = null;
  const dbName = "relwave_m3_infer_test";
  let config: MongoConfig;

  beforeAll(async () => {
    if (!TEST_URI) return;
    client = new MongoClient(TEST_URI);
    await client.connect();
    const db = client.db(dbName);
    try {
      await db.dropDatabase();
    } catch {
      // ignore drop errors
    }

    config = {
      uri: TEST_URI,
      database: dbName,
      cacheDocuments: true,
    };

    // Seed flat collection
    await db.collection("flat").insertMany([
      { name: "Alpha", active: true, score: 10 },
      { name: "Beta", active: false, score: 20 },
    ]);

    // Seed sparse and mixed collection
    await db.collection("sparse_mixed").insertMany([
      { title: "Item 1", meta: { color: "blue" }, tags: ["a", "b"] },
      { title: "Item 2", meta: { color: "red", extra: 123 }, tags: ["c"], nullableField: null },
      { title: 3, tags: [true, 1] },
    ]);

    // Seed empty collection
    await db.createCollection("empty_col");
  }, 30000);

  afterAll(async () => {
    if (client) {
      try {
        await client.db(dbName).dropDatabase();
        await client.close();
      } catch {
        // ignore
      }
    }
    await closeAllMongoClients();
  });

  itLive("listCollections returns seeded collections", async () => {
    const collections = await mongoConnector.listCollections(config);
    const names = collections.map((c) => c.name);
    expect(names).toContain("flat");
    expect(names).toContain("sparse_mixed");
    expect(names).toContain("empty_col");
  });

  itLive("inferCollectionSchema infers flat uniform collection accurately", async () => {
    const schema = await mongoConnector.inferCollectionSchema(config, {
      collection: "flat",
      sampleSize: 100,
    });

    expect(schema.collection).toBe("flat");
    expect(schema.sampleSize).toBe(2);
    expect(schema.totalDocs).toBe(2);
    expect(schema.sampleDocuments.length).toBe(2);

    const nameField = schema.fields.find((f) => f.path === "name")!;
    expect(nameField.bsonType).toBe("string");
    expect(nameField.presencePct).toBe(100);
    expect(nameField.optional).toBe(false);
  });

  itLive("inferCollectionSchema infers sparse, mixed, and nested schemas", async () => {
    const schema = await mongoConnector.inferCollectionSchema(config, {
      collection: "sparse_mixed",
      sampleSize: 100,
    });

    expect(schema.collection).toBe("sparse_mixed");
    expect(schema.sampleSize).toBe(3);

    const titleField = schema.fields.find((f) => f.path === "title")!;
    expect(titleField.typeConflicts.length).toBeGreaterThan(0);

    const tagsField = schema.fields.find((f) => f.path === "tags")!;
    expect(tagsField.isArray).toBe(true);
    expect(tagsField.arrayElementTypes?.length).toBeGreaterThanOrEqual(2);

    const metaExtra = schema.fields.find((f) => f.path === "meta.extra")!;
    expect(metaExtra.optional).toBe(true);
    expect(metaExtra.depth).toBe(1);
    expect(metaExtra.parentPath).toBe("meta");
  });

  itLive("inferCollectionSchema succeeds on empty collection", async () => {
    const schema = await mongoConnector.inferCollectionSchema(config, {
      collection: "empty_col",
      sampleSize: 50,
    });

    expect(schema.collection).toBe("empty_col");
    expect(schema.sampleSize).toBe(0);
    expect(schema.totalDocs).toBe(0);
    expect(schema.fields).toHaveLength(0);
    expect(schema.sampleDocuments).toHaveLength(0);
  });
});
