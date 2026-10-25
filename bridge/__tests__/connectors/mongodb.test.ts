import { describe, expect, test, beforeAll, afterAll, jest } from "@jest/globals";
import { MongoClient, ObjectId } from "mongodb";
import * as mongoConnector from "../../src/connectors/mongo";
import type { MongoConfig } from "../../src/types/mongo";

const MONGO_HOST = process.env.REAL_MONGODB_HOST || "127.0.0.1";
const MONGO_PORT = process.env.REAL_MONGODB_PORT || "27017";
const MONGO_DB = process.env.REAL_MONGODB_DATABASE || "testdb";

// Credential-free URI: the test mongo service runs without auth.
const validConfig: MongoConfig = {
  uri: `mongodb://${MONGO_HOST}:${MONGO_PORT}/${MONGO_DB}`,
  database: MONGO_DB,
};

// A closed local port with a short selection timeout → fast, deterministic failure.
const invalidConfig: MongoConfig = {
  uri: "mongodb://127.0.0.1:1/testdb?serverSelectionTimeoutMS=5000",
  database: "testdb",
};

let seedClient: MongoClient | null = null;

async function seedFixtures(): Promise<void> {
  seedClient = new MongoClient(validConfig.uri as string);
  await seedClient.connect();
  const db = seedClient.db(MONGO_DB);

  for (const name of ["users", "orders", "active_users_view"]) {
    try {
      await db.dropCollection(name);
    } catch {
      // may not exist
    }
  }

  const userIds: ObjectId[] = [];
  const userInsert = await db.collection("users").insertMany([
    { name: "John Doe", email: "john@example.com", age: 30, active: true, createdAt: new Date() },
    { name: "Jane Smith", email: "jane@example.com", age: 27, active: true, createdAt: new Date() },
    { name: "Bob Lee", email: "bob@example.com", age: 45, active: false, createdAt: new Date() },
  ]);
  for (const id of Object.values(userInsert.insertedIds)) userIds.push(id);

  await db.collection("orders").insertMany([
    {
      userId: userIds[0],
      items: [
        { sku: "ABC-1", qty: 2, price: 9.99 },
        { sku: "XYZ-9", qty: 1, price: 19.5 },
      ],
      total: 39.48,
      status: "placed",
      orderedAt: new Date(),
    },
    {
      userId: userIds[1],
      items: [{ sku: "ABC-1", qty: 5, price: 9.99 }],
      total: 49.95,
      status: "shipped",
      orderedAt: new Date(),
    },
  ]);

  await db.command({
    create: "active_users_view",
    viewOn: "users",
    pipeline: [{ $match: { active: true } }],
  });
}

describe("MongoDB Connector", () => {
  jest.setTimeout(30000);

  beforeAll(async () => {
    await seedFixtures();
  });

  afterAll(async () => {
    await mongoConnector.closeAllMongoClients();
    if (seedClient) {
      await seedClient.close();
      seedClient = null;
    }
  });

  test("fails to connect with an invalid config", async () => {
    const result = await mongoConnector.testConnection(invalidConfig);
    expect(result.ok).toBe(false);
    expect(result.status).toBe("disconnected");
  });

  test("connects with a valid config", async () => {
    const result = await mongoConnector.testConnection(validConfig);
    expect(result).toStrictEqual({
      message: "Connection successful",
      status: "connected",
      ok: true,
    });
  });

  test("lists collections (including a view)", async () => {
    const collections = await mongoConnector.listCollections(validConfig);
    expect(Array.isArray(collections)).toBe(true);
    const byName = new Map(collections.map((c) => [c.name, c.type]));
    expect(byName.get("users")).toBe("collection");
    expect(byName.get("orders")).toBe("collection");
    expect(byName.get("active_users_view")).toBe("view");
  });

  test("lists tables as the relational TableInfo adapter", async () => {
    const tables = await mongoConnector.listTables(validConfig);
    expect(Array.isArray(tables)).toBe(true);
    const byName = new Map(tables.map((t) => [t.name, t.type]));
    expect(byName.get("users")).toBe("BASE TABLE");
    expect(byName.get("active_users_view")).toBe("VIEW");
    expect(tables.every((t) => t.schema === MONGO_DB)).toBe(true);
  });

  test("returns database statistics", async () => {
    const stats = await mongoConnector.getDBStats(validConfig);
    expect(stats).toHaveProperty("total_tables");
    expect(stats).toHaveProperty("total_rows");
    expect(stats).toHaveProperty("total_db_size_mb");
    expect(stats.total_tables).toBeGreaterThanOrEqual(2);
    expect(stats.total_rows).toBeGreaterThanOrEqual(5);
  });

  test("returns a single pseudo-schema name", async () => {
    const names = await mongoConnector.listSchemaNames(validConfig);
    expect(Array.isArray(names)).toBe(true);
    expect(names).toContain(MONGO_DB);
  });

  test("connectToDatabase returns collections as pseudo-schemas with no migrations", async () => {
    const result = await mongoConnector.connectToDatabase(validConfig, "mongo-integration-id");
    expect(result.baselined).toBe(false);
    expect(result.schema.map((s) => s.name)).toContain("users");
    expect(result.migrations.local).toEqual([]);
    expect(result.migrations.applied).toEqual([]);
  });
});
