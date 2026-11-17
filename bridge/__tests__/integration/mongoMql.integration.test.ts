import { describe, expect, test, beforeAll, afterAll } from "@jest/globals";
import { MongoClient } from "mongodb";
import { executeMql, explainMql, closeAllMongoClients } from "../../src/connectors/mongo";
import type { MongoConfig } from "../../src/types/mongo";

const mongoUri = process.env.MONGO_TEST_URI;
const describeIntegration = mongoUri ? describe : describe.skip;

describeIntegration("MongoDB M5 MQL Integration Tests (Live Server)", () => {
  const dbName = "relwave_m5_it";
  const config: MongoConfig = {
    uri: mongoUri,
    database: dbName,
  };

  let client: MongoClient | null = null;
  const collectionName = "products";

  beforeAll(async () => {
    if (!mongoUri) return;
    client = new MongoClient(mongoUri);
    await client.connect();
    const db = client.db(dbName);
    try {
      await db.collection(collectionName).drop();
    } catch {
      // ignore
    }

    await db.collection(collectionName).insertMany([
      { sku: "ITEM-1", name: "Widget A", price: 10, category: "tools", stock: 100 },
      { sku: "ITEM-2", name: "Widget B", price: 25, category: "tools", stock: 50 },
      { sku: "ITEM-3", name: "Gadget C", price: 50, category: "electronics", stock: 20 },
      { sku: "ITEM-4", name: "Gadget D", price: 100, category: "electronics", stock: 5 },
    ]);
  });

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

  test("executes find with projection, sort, and limit", async () => {
    const res = await executeMql(config, {
      collection: collectionName,
      op: {
        operation: "find",
        payload: {
          filter: { category: "tools" },
          projection: { sku: 1, name: 1, _id: 0 },
          sort: { price: -1 },
          limit: 10,
        },
      },
    });

    expect(res.operation).toBe("find");
    if (res.operation === "find") {
      expect(res.documents).toHaveLength(2);
      expect((res.documents[0] as any).sku).toBe("ITEM-2");
      expect((res.documents[1] as any).sku).toBe("ITEM-1");
    }
  });

  test("executes aggregate with multi-stage pipeline", async () => {
    const res = await executeMql(config, {
      collection: collectionName,
      op: {
        operation: "aggregate",
        payload: {
          pipeline: [
            { $group: { _id: "$category", totalStock: { $sum: "$stock" } } },
            { $sort: { totalStock: -1 } },
          ],
        },
      },
    });

    expect(res.operation).toBe("aggregate");
    if (res.operation === "aggregate") {
      expect(res.documents).toHaveLength(2);
      expect((res.documents[0] as any)._id).toBe("tools");
      expect((res.documents[0] as any).totalStock).toEqual({ $numberInt: "150" });
    }
  });

  test("executes aggregate with empty pipeline []", async () => {
    const res = await executeMql(config, {
      collection: collectionName,
      op: {
        operation: "aggregate",
        payload: {
          pipeline: [],
        },
      },
    });

    expect(res.operation).toBe("aggregate");
    if (res.operation === "aggregate") {
      expect(res.documents).toHaveLength(4);
    }
  });

  test("executes countDocuments and estimatedDocumentCount", async () => {
    const filteredCountRes = await executeMql(config, {
      collection: collectionName,
      op: {
        operation: "countDocuments",
        payload: { filter: { category: "electronics" } },
      },
    });
    if (filteredCountRes.operation === "countDocuments") {
      expect(filteredCountRes.count).toBe(2);
    }

    const estCountRes = await executeMql(config, {
      collection: collectionName,
      op: {
        operation: "estimatedDocumentCount",
      },
    });
    if (estCountRes.operation === "estimatedDocumentCount") {
      expect(estCountRes.count).toBeGreaterThanOrEqual(4);
    }
  });

  test("executes distinct values", async () => {
    const res = await executeMql(config, {
      collection: collectionName,
      op: {
        operation: "distinct",
        payload: { field: "category" },
      },
    });

    expect(res.operation).toBe("distinct");
    if (res.operation === "distinct") {
      expect(res.values.sort()).toEqual(["electronics", "tools"]);
      expect(res.count).toBe(2);
    }
  });

  test("explains find and aggregate queries", async () => {
    const findExplain = await explainMql(config, {
      collection: collectionName,
      target: {
        operation: "find",
        filter: { sku: "ITEM-1" },
      },
      verbosity: "executionStats",
    });

    expect(findExplain.operation).toBe("find");
    expect(findExplain.queryPlanner).toBeDefined();
    expect(findExplain.executionStats).toBeDefined();

    const aggExplain = await explainMql(config, {
      collection: collectionName,
      target: {
        operation: "aggregate",
        pipeline: [{ $match: { category: "tools" } }],
      },
      verbosity: "queryPlanner",
    });

    expect(aggExplain.operation).toBe("aggregate");
    expect(aggExplain.queryPlanner).toBeDefined();
  });
});
