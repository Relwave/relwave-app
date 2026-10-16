const fs = require("fs");
const path = require("path");
const { createClient } = require("@clickhouse/client");

function wait(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function seed() {
  const host = process.env.REAL_CLICKHOUSE_HOST || "127.0.0.1";
  const port = process.env.REAL_CLICKHOUSE_PORT || "8123";
  const user = process.env.REAL_CLICKHOUSE_USER || "testuser";
  const password = process.env.REAL_CLICKHOUSE_PASSWORD || "testpass";
  const url = process.env.REAL_CLICKHOUSE_URL || `http://${host}:${port}`;

  const client = createClient({
    url,
    username: user,
    password,
    database: "default",
    request_timeout: 10000,
  });

  let connected = false;
  for (let attempt = 1; attempt <= 15; attempt++) {
    try {
      const ping = await client.ping();
      if (ping.success) {
        connected = true;
        break;
      }
    } catch {
      // Retry after delay
    }
    await wait(1000);
  }

  if (!connected) {
    throw new Error(`ClickHouse at ${url} was not reachable after 15 attempts.`);
  }

  const sqlPath = path.join(__dirname, "seed-clickhouse.sql");
  const sql = fs.readFileSync(sqlPath, "utf-8");

  const cleanSql = sql
    .split("\n")
    .map((line) => {
      const trimmed = line.trim();
      if (trimmed.startsWith("--")) return "";
      return line;
    })
    .join("\n");

  const statements = cleanSql
    .split(";")
    .map((s) => s.trim())
    .filter((s) => s.length > 0);

  for (const statement of statements) {
    await client.command({ query: statement });
  }

  await client.close();
  console.log("ClickHouse test database seeded successfully.");
}

seed().catch((err) => {
  console.error("Failed to seed ClickHouse:", err);
  process.exit(1);
});
