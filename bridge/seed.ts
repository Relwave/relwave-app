import { DuckDBInstance } from "@duckdb/node-api";
import path from "path";
import fs from "fs";

interface ScaleConfig {
  users: number;
  products: number;
  orders: number;
  events: number;
}

const SCALE_PRESETS: Record<string, ScaleConfig> = {
  small: {
    users: 10_000,
    products: 1_000,
    orders: 20_000,
    events: 50_000,
  },
  medium: {
    users: 50_000,
    products: 5_000,
    orders: 100_000,
    events: 200_000,
  },
  large: {
    users: 100_000,
    products: 10_000,
    orders: 200_000,
    events: 500_000,
  },
  huge: {
    users: 500_000,
    products: 50_000,
    orders: 1_000_000,
    events: 2_000_000,
  },
};

function parseArgs(): { targetPath: string; scale: string; overwrite: boolean } {
  const args = process.argv.slice(2);
  let targetPath = path.resolve(process.cwd(), "..", "duckdb-test.db");
  let scale = "large";
  let overwrite = true;

  for (let i = 0; i < args.length; i++) {
    const arg = args[i];
    if (arg === "--help" || arg === "-h") {
      console.log(`
DuckDB High-Performance Seed Tool for RelWave
=============================================
Usage:
  npx ts-node seed.ts [options]

Options:
  --file, -f <path>     Target .db file path (default: ../duckdb-test.db)
  --scale, -s <scale>   Data volume preset: small | medium | large | huge (default: large)
                          - small:   ~81,000 rows
                          - medium:  ~355,000 rows
                          - large:   ~810,000 rows (~4-6 MB compressed)
                          - huge:    ~3,550,000 rows (~25-35 MB compressed)
  --no-overwrite        Do not delete existing file before seeding
  --help, -h            Show this help message

Examples:
  npx ts-node seed.ts
  npx ts-node seed.ts --file ./my_duck.db --scale medium
  npx ts-node seed.ts --scale huge
      `);
      process.exit(0);
    } else if (arg === "--file" || arg === "-f") {
      targetPath = path.resolve(process.cwd(), args[++i]);
    } else if (arg === "--scale" || arg === "-s") {
      scale = args[++i]?.toLowerCase() || "large";
    } else if (arg === "--no-overwrite") {
      overwrite = false;
    }
  }

  return { targetPath, scale, overwrite };
}

async function main() {
  const { targetPath, scale, overwrite } = parseArgs();
  const config = SCALE_PRESETS[scale] || SCALE_PRESETS.large;

  console.log("\n=======================================================");
  console.log("   RelWave DuckDB Benchmark & Seed Generator");
  console.log("=======================================================");
  console.log(`Target DB:  ${targetPath}`);
  console.log(`Preset:     ${scale.toUpperCase()}`);
  console.log(`Planned Rows:`);
  console.log(`  - users:            ${config.users.toLocaleString()}`);
  console.log(`  - products:         ${config.products.toLocaleString()}`);
  console.log(`  - orders:           ${config.orders.toLocaleString()}`);
  console.log(`  - analytics_events: ${config.events.toLocaleString()}`);
  console.log(
    `  - Total:            ${(config.users + config.products + config.orders + config.events).toLocaleString()}`,
  );
  console.log("-------------------------------------------------------\n");

  if (fs.existsSync(targetPath)) {
    if (overwrite) {
      console.log("Removing existing database file...");
      try {
        fs.unlinkSync(targetPath);
      } catch (err: any) {
        console.warn(`Note: Could not unlink existing file: ${err.message}`);
      }
    } else {
      console.log("Appending to existing database file...");
    }
  }

  const startTime = Date.now();

  console.log("Connecting to DuckDB instance...");
  const instance = await DuckDBInstance.create(targetPath);
  const conn = await instance.connect();

  console.log("Creating tables and indexes...");
  await conn.run(`
    CREATE TABLE IF NOT EXISTS users (
      id BIGINT PRIMARY KEY,
      name VARCHAR(100) NOT NULL,
      email VARCHAR(150) NOT NULL,
      role VARCHAR(20) NOT NULL,
      country VARCHAR(10) NOT NULL,
      is_active BOOLEAN NOT NULL,
      signup_date DATE NOT NULL,
      created_at TIMESTAMP NOT NULL
    );

    CREATE TABLE IF NOT EXISTS products (
      id BIGINT PRIMARY KEY,
      name VARCHAR(100) NOT NULL,
      category VARCHAR(50) NOT NULL,
      price DECIMAL(10, 2) NOT NULL,
      stock INTEGER NOT NULL,
      rating DECIMAL(3, 1) NOT NULL,
      created_at TIMESTAMP NOT NULL
    );

    CREATE TABLE IF NOT EXISTS orders (
      id BIGINT PRIMARY KEY,
      user_id BIGINT NOT NULL,
      product_id BIGINT NOT NULL,
      quantity INTEGER NOT NULL,
      total_amount DECIMAL(10, 2) NOT NULL,
      status VARCHAR(20) NOT NULL,
      payment_method VARCHAR(20) NOT NULL,
      order_date TIMESTAMP NOT NULL
    );

    CREATE TABLE IF NOT EXISTS analytics_events (
      id BIGINT PRIMARY KEY,
      user_id BIGINT NOT NULL,
      event_type VARCHAR(50) NOT NULL,
      url VARCHAR(200) NOT NULL,
      device VARCHAR(20) NOT NULL,
      ip_address VARCHAR(45) NOT NULL,
      duration_ms INTEGER NOT NULL,
      event_time TIMESTAMP NOT NULL
    );

    CREATE TABLE IF NOT EXISTS schema_migrations (
      version VARCHAR(255) PRIMARY KEY,
      name VARCHAR(255) NOT NULL,
      applied_at TIMESTAMP NOT NULL DEFAULT current_timestamp,
      checksum VARCHAR(64) NOT NULL
    );
  `);

  console.log("Generating data with DuckDB parallel execution engine...");

  // Seed users
  console.log(`  -> Inserting ${config.users.toLocaleString()} users...`);
  await conn.run(`
    INSERT INTO users
    SELECT
      i AS id,
      'User_' || i AS name,
      'user_' || i || '@example.com' AS email,
      (['admin', 'member', 'viewer', 'editor'])[(i % 4) + 1] AS role,
      (['US', 'IN', 'DE', 'GB', 'CA', 'FR', 'JP', 'AU'])[(i % 8) + 1] AS country,
      (i % 5 != 0) AS is_active,
      CURRENT_DATE - INTERVAL (i % 365) DAY AS signup_date,
      CURRENT_TIMESTAMP - INTERVAL (i % 86400) SECOND AS created_at
    FROM range(1, ${config.users + 1}) t(i);
  `);

  // Seed products
  console.log(`  -> Inserting ${config.products.toLocaleString()} products...`);
  await conn.run(`
    INSERT INTO products
    SELECT
      i AS id,
      'Product ' || i AS name,
      (['Electronics', 'Books', 'Clothing', 'Home', 'Toys', 'Sports', 'Garden', 'Automotive'])[(i % 8) + 1] AS category,
      ROUND(10.0 + (i % 500) * 1.5, 2) AS price,
      (i % 100) * 5 AS stock,
      ROUND(3.0 + ((i % 20) * 0.1), 1) AS rating,
      CURRENT_TIMESTAMP - INTERVAL (i % 1000) DAY AS created_at
    FROM range(1, ${config.products + 1}) t(i);
  `);

  // Seed orders
  console.log(`  -> Inserting ${config.orders.toLocaleString()} orders...`);
  await conn.run(`
    INSERT INTO orders
    SELECT
      i AS id,
      (i % ${config.users}) + 1 AS user_id,
      (i % ${config.products}) + 1 AS product_id,
      (i % 5) + 1 AS quantity,
      ROUND(((i % 5) + 1) * (15.0 + (i % 100)), 2) AS total_amount,
      (['pending', 'processing', 'completed', 'cancelled', 'refunded'])[(i % 5) + 1] AS status,
      (['credit_card', 'paypal', 'apple_pay', 'crypto', 'bank_transfer'])[(i % 5) + 1] AS payment_method,
      CURRENT_TIMESTAMP - INTERVAL (i % 300) DAY AS order_date
    FROM range(1, ${config.orders + 1}) t(i);
  `);

  // Seed analytics_events
  console.log(`  -> Inserting ${config.events.toLocaleString()} analytics events...`);
  await conn.run(`
    INSERT INTO analytics_events
    SELECT
      i AS id,
      (i % ${config.users}) + 1 AS user_id,
      (['page_view', 'click', 'scroll', 'add_to_cart', 'search', 'checkout'])[(i % 6) + 1] AS event_type,
      (['/home', '/products', '/cart', '/checkout', '/profile', '/settings'])[(i % 6) + 1] AS url,
      (['mobile', 'desktop', 'tablet'])[(i % 3) + 1] AS device,
      '192.168.' || (i % 255) || '.' || ((i * 7) % 255) AS ip_address,
      (i % 3000) + 50 AS duration_ms,
      CURRENT_TIMESTAMP - INTERVAL (i % 10000) MINUTE AS event_time
    FROM range(1, ${config.events + 1}) t(i);
  `);

  // Record baseline migration
  await conn.run(`
    INSERT INTO schema_migrations (version, name, checksum)
    VALUES ('20261012000000', 'initial_schema_and_seed', 'duckdb_seed_baseline')
    ON CONFLICT (version) DO NOTHING;
  `);

  const durationMs = Date.now() - startTime;

  // Query verification counts
  const countReader = await conn.run(`
    SELECT 'users' as tbl, count(*)::INT as count FROM users
    UNION ALL SELECT 'products', count(*)::INT FROM products
    UNION ALL SELECT 'orders', count(*)::INT FROM orders
    UNION ALL SELECT 'analytics_events', count(*)::INT FROM analytics_events;
  `);
  const counts = (await countReader.getRowObjectsJson()) as Array<{ tbl: string; count: number }>;

  // Clean close connection
  conn.closeSync();

  const fileStats = fs.existsSync(targetPath) ? fs.statSync(targetPath) : { size: 0 };
  const sizeMb = (fileStats.size / (1024 * 1024)).toFixed(2);

  console.log("\n=======================================================");
  console.log("   Seeding Completed Successfully!");
  console.log("=======================================================");
  console.log(`Execution Time: ${durationMs} ms (${(durationMs / 1000).toFixed(2)}s)`);
  console.log(`Database Size:  ${sizeMb} MB`);
  console.log(`Database Path:  ${targetPath}`);
  console.log("\nTable Breakdown:");
  for (const row of counts) {
    console.log(`  - ${row.tbl.padEnd(18)}: ${Number(row.count).toLocaleString()} rows`);
  }
  console.log("=======================================================\n");
  console.log("To connect this in RelWave:");
  console.log("1. Open RelWave and click 'Add Database'");
  console.log("2. Choose 'DuckDB'");
  console.log(`3. Set Database Path to: ${targetPath}`);
  console.log("4. Click 'Save' & start exploring tables, schema, and SQL workspace!\n");
}

main().catch((err) => {
  console.error("\n[Error] Seed generation failed:", err);
  process.exit(1);
});
