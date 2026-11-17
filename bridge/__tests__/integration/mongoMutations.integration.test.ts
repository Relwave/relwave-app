import { describe, expect, test, beforeAll, afterAll, jest } from "@jest/globals";
import { MongoClient, ObjectId } from "mongodb";
import { mongoConnector, closeAllMongoClients } from "../../src/connectors/mongo";
import type { MongoConfig } from "../../src/types/mongo";

const TEST_URI = process.env.MONGO_TEST_URI;
const TEST_DB = "relwave_m4_it";

const config: MongoConfig = {
  uri: TEST_URI ? `${TEST_URI.replace(/\/$/, "")}/${TEST_DB}` : undefined,
  database: TEST_DB,
};

let client: MongoClient | null = null;
let connected = false;

beforeAll(async () => {
  jest.setTimeout(60000);
  if (!TEST_URI) {
    console.warn(
      "[mongoMutations.integration] MONGO_TEST_URI not set; skipping M4 integration tests.",
    );
    return;
  }
  try {
    client = new MongoClient(config.uri as string);
    await client.connect();
    try {
      await client.db(TEST_DB).dropDatabase();
    } catch {
      // ignore
    }
    connected = true;
  } catch {
    connected = false;
    console.warn(
      `[mongoMutations.integration] MongoDB not reachable at ${TEST_URI}; skipping M4 integration tests.`,
    );
  }
}, 60000);

afterAll(async () => {
  if (client) {
    try {
      await client.db(TEST_DB).dropDatabase();
      await client.close();
    } catch {
      // ignore
    }
    client = null;
  }
  await closeAllMongoClients();
});

describe("M4 Mutations Lifecycle (Integration)", () => {
  const collection = "test_m4_mutations";

  test("creates a new collection explicitly", async () => {
    if (!connected) return;
    const res = await mongoConnector.createCollection(config, { collection });
    expect(res.ok).toBe(true);
    expect(res.collection).toBe(collection);

    const list = await mongoConnector.listCollections(config);
    expect(list.some((c) => c.name === collection)).toBe(true);
  });

  test("creates a capped collection with validated size", async () => {
    if (!connected) return;
    const cappedColl = "test_m4_capped";
    const res = await mongoConnector.createCollection(config, {
      collection: cappedColl,
      options: { capped: true, size: 8192, max: 100 },
    });
    expect(res.ok).toBe(true);
    expect(res.collection).toBe(cappedColl);

    await mongoConnector.dropCollection(config, { collection: cappedColl });
  });

  test("replaces a document and updates cache", async () => {
    if (!connected) return;
    const oid = new ObjectId();
    const originalDoc = {
      _id: { $oid: oid.toHexString() },
      title: "Initial Title",
      version: { $numberInt: "1" },
      tags: ["alpha", "beta"],
    };

    const inserted = await mongoConnector.insertDocument(config, {
      collection,
      document: originalDoc,
    });
    expect(inserted.insertedId).toEqual({ $oid: oid.toHexString() });

    const replacement = {
      _id: { $oid: oid.toHexString() },
      title: "Replaced Title",
      author: "Alice",
      active: true,
    };

    const replaceRes = await mongoConnector.replaceDocument(config, {
      collection,
      filter: { _id: { $oid: oid.toHexString() } },
      replacement,
      options: { returnDocument: "after" },
    });

    expect(replaceRes.matchedCount).toBe(1);
    expect(replaceRes.modifiedCount).toBe(1);
    expect(replaceRes.updatedDocument?.title).toBe("Replaced Title");
    expect(replaceRes.updatedDocument?.author).toBe("Alice");
    expect(replaceRes.updatedDocument?.version).toBeUndefined();
    expect(replaceRes.updatedDocument?.tags).toBeUndefined();

    const found = await mongoConnector.findDocuments(config, {
      collection,
      filter: { _id: { $oid: oid.toHexString() } },
    });
    expect(found.documents).toHaveLength(1);
    expect(found.documents[0].title).toBe("Replaced Title");
    expect(found.documents[0].version).toBeUndefined();
  });

  test("rejects dropping system collection", async () => {
    if (!connected) return;
    await expect(
      mongoConnector.dropCollection(config, { collection: "system.views" }),
    ).rejects.toMatchObject({ code: "MONGO_FORBIDDEN" });
  });

  test("drops collection successfully", async () => {
    if (!connected) return;
    const dropRes = await mongoConnector.dropCollection(config, { collection });
    expect(dropRes.ok).toBe(true);
    expect(dropRes.collection).toBe(collection);

    const list = await mongoConnector.listCollections(config);
    expect(list.some((c) => c.name === collection)).toBe(false);
  });
});
