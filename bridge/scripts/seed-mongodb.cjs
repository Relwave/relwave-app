/*
 * Standalone MongoDB seed script (manual tool).
 *
 * Seeds the test database with a couple of collections plus a view so the
 * MongoDB connector's listing/stats can be exercised:
 *   - users      (flat documents)
 *   - orders     (nested documents with an ObjectId reference + array + Date)
 *   - active_users_view (a view over users, to exercise VIEW detection)
 *
 * Run with:  node scripts/seed-mongodb.cjs
 * Reads REAL_MONGODB_* from .env (loaded via dotenv).
 */

const fs = require("dotenv");
fs.config({ path: require("path").join(__dirname, "..", ".env") });

const { MongoClient, ObjectId } = require("mongodb");

function wait(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function seed() {
  const host = process.env.REAL_MONGODB_HOST || "127.0.0.1";
  const port = process.env.REAL_MONGODB_PORT || "27017";
  const user = process.env.REAL_MONGODB_USER || "testuser";
  const password = process.env.REAL_MONGODB_PASSWORD || "testpass";
  const database = process.env.REAL_MONGODB_DATABASE || "testdb";
  const uri =
    process.env.REAL_MONGODB_URI ||
    `mongodb://${encodeURIComponent(user)}:${encodeURIComponent(password)}@${host}:${port}/?authSource=admin`;

  const client = new MongoClient(uri);

  let connected = false;
  for (let attempt = 1; attempt <= 15; attempt++) {
    try {
      await client.connect();
      await client.db(database).command({ ping: 1 });
      connected = true;
      break;
    } catch {
      await wait(1000);
    }
  }

  if (!connected) {
    throw new Error(`MongoDB at ${host}:${port} was not reachable after 15 attempts.`);
  }

  const db = client.db(database);

  // Idempotent: drop existing fixtures first.
  for (const name of ["users", "orders", "active_users_view"]) {
    try {
      await db.dropCollection(name);
    } catch {
      // may not exist
    }
  }

  const userIds = [];
  const users = [
    {
      _id: new ObjectId(),
      name: "John Doe",
      email: "john@example.com",
      age: 30,
      active: true,
      createdAt: new Date(),
    },
    {
      _id: new ObjectId(),
      name: "Jane Smith",
      email: "jane@example.com",
      age: 27,
      active: true,
      createdAt: new Date(),
    },
    {
      _id: new ObjectId(),
      name: "Bob Lee",
      email: "bob@example.com",
      age: 45,
      active: false,
      createdAt: new Date(),
    },
  ];
  const userInsert = await db.collection("users").insertMany(users);
  for (const doc of userInsert.insertedDocs.values()) {
    userIds.push(doc._id);
  }

  const orders = [
    {
      _id: new ObjectId(),
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
      _id: new ObjectId(),
      userId: userIds[1],
      items: [{ sku: "ABC-1", qty: 5, price: 9.99 }],
      total: 49.95,
      status: "shipped",
      orderedAt: new Date(),
    },
  ];
  await db.collection("orders").insertMany(orders);

  // A view to exercise VIEW detection in listTables/listCollections.
  await db.createView("active_users_view", "users", [{ $match: { active: true } }]);

  await client.close();
  console.log("MongoDB test database seeded successfully.");
}

seed().catch((err) => {
  console.error("Failed to seed MongoDB:", err);
  process.exit(1);
});
