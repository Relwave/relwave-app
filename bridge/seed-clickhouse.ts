import { createClient } from "@clickhouse/client";
import { cleanClickHouseUrl } from "./src/utils/clickhouseUrl";

declare const process: {
  argv: string[];
  env: Record<string, string | undefined>;
  exit(code?: number): never;
  stdout: {
    write(chunk: string): boolean;
  };
};

interface ScaleConfig {
  users: number;
  products: number;
  orders: number;
  events: number;
  metrics: number;
}

const SCALE_PRESETS: Record<string, ScaleConfig> = {
  small: {
    users: 10_000,
    products: 1_000,
    orders: 25_000,
    events: 50_000,
    metrics: 20_000,
  },
  medium: {
    users: 50_000,
    products: 5_000,
    orders: 150_000,
    events: 300_000,
    metrics: 100_000,
  },
  large: {
    users: 100_000,
    products: 10_000,
    orders: 300_000,
    events: 600_000,
    metrics: 250_000,
  },
  huge: {
    users: 500_000,
    products: 50_000,
    orders: 1_500_000,
    events: 3_000_000,
    metrics: 1_000_000,
  },
};

function parseArgs(): {
  url: string;
  username: string;
  password?: string;
  database: string;
  scale: string;
  drop: boolean;
} {
  const args = process.argv.slice(2);
  let url = process.env.CLICKHOUSE_URL || "https://of8remuy3t.ap-south-1.aws.clickhouse.cloud:8443";
  let username = process.env.CLICKHOUSE_USER || "default";
  let password = process.env.CLICKHOUSE_PASSWORD || "HpD2b9hQ5KW.3";
  let database = process.env.CLICKHOUSE_DATABASE || "default";
  let scale = "medium";
  let drop = true;

  for (let i = 0; i < args.length; i++) {
    const arg = args[i];
    if (arg === "--help" || arg === "-h") {
      console.log(`
ClickHouse High-Performance Seed Tool for RelWave
==================================================
Usage:
  npx ts-node seed-clickhouse.ts [options]
  npm run seed:clickhouse -- [options]

Options:
  --url, -u <url>           ClickHouse URL (default: cloud cluster or CLICKHOUSE_URL)
  --user <username>         ClickHouse username (default: default)
  --password, -p <pwd>      ClickHouse password
  --database, -d <db>       Target database name (default: default)
  --scale, -s <preset>      Volume preset: small | medium | large | huge (default: medium)
                              - small:   ~106,000 rows
                              - medium:  ~605,000 rows
                              - large:   ~1,260,000 rows
                              - huge:    ~6,050,000 rows
  --no-drop                 Do not drop existing tables before inserting
  --help, -h                Show this help message

Examples:
  npm run seed:clickhouse
  npm run seed:clickhouse -- --scale small
  npm run seed:clickhouse -- --url http://localhost:8123 --database test_db
      `);
      process.exit(0);
    } else if (arg === "--url" || arg === "-u") {
      url = args[++i];
    } else if (arg === "--user") {
      username = args[++i];
    } else if (arg === "--password" || arg === "-p") {
      password = args[++i];
    } else if (arg === "--database" || arg === "-d") {
      database = args[++i];
    } else if (arg === "--scale" || arg === "-s") {
      scale = args[++i]?.toLowerCase() || "medium";
    } else if (arg === "--no-drop") {
      drop = false;
    }
  }

  return {
    url: cleanClickHouseUrl(url),
    username,
    password,
    database,
    scale,
    drop,
  };
}

async function main() {
  const { url, username, password, database, scale, drop } = parseArgs();
  const config = SCALE_PRESETS[scale] || SCALE_PRESETS.medium;
  const totalPlanned =
    config.users + config.products + config.orders + config.events + config.metrics;

  console.log("\n=======================================================");
  console.log("   RelWave ClickHouse Benchmark & Seed Generator");
  console.log("=======================================================");
  console.log(`Target URL:  ${url}`);
  console.log(`Database:    ${database}`);
  console.log(`User:        ${username}`);
  console.log(`Preset:      ${scale.toUpperCase()}`);
  console.log(`Planned Rows:`);
  console.log(`  - users:            ${config.users.toLocaleString()}`);
  console.log(`  - products:         ${config.products.toLocaleString()}`);
  console.log(`  - orders:           ${config.orders.toLocaleString()}`);
  console.log(`  - analytics_events: ${config.events.toLocaleString()}`);
  console.log(`  - server_metrics:   ${config.metrics.toLocaleString()}`);
  console.log(`  - Total:            ~${totalPlanned.toLocaleString()}`);
  console.log("-------------------------------------------------------\n");

  const startTime = Date.now();
  const client = createClient({
    url,
    username,
    password,
    database,
    request_timeout: 60_000,
  });

  console.log("1. Verifying ClickHouse connection...");
  const ping = await client.ping();
  if (!ping.success) {
    throw new Error("Failed to ping ClickHouse server. Please check URL & credentials.");
  }
  console.log("   Connected successfully!\n");

  if (drop) {
    console.log("2. Dropping existing tables (clean slate)...");
    const dropTables = [
      "server_metrics",
      "analytics_events",
      "orders",
      "products",
      "users",
      "schema_migrations",
    ];
    for (const tbl of dropTables) {
      await client.command({
        query: `DROP TABLE IF EXISTS ${database}.${tbl}`,
      });
    }
    console.log("   Existing tables dropped.\n");
  }

  console.log("3. Creating tables (MergeTree engines)...");

  // Users table
  await client.command({
    query: `
      CREATE TABLE IF NOT EXISTS ${database}.users (
        id UInt64,
        name String,
        email String,
        role LowCardinality(String),
        country LowCardinality(String),
        is_active UInt8,
        signup_date Date32,
        created_at DateTime
      ) ENGINE = MergeTree()
      ORDER BY id
    `,
  });

  // Products table
  await client.command({
    query: `
      CREATE TABLE IF NOT EXISTS ${database}.products (
        id UInt64,
        name String,
        category LowCardinality(String),
        price Decimal(10, 2),
        stock UInt32,
        rating Float32,
        created_at DateTime
      ) ENGINE = MergeTree()
      ORDER BY id
    `,
  });

  // Orders table with date partitioning
  await client.command({
    query: `
      CREATE TABLE IF NOT EXISTS ${database}.orders (
        id UInt64,
        user_id UInt64,
        product_id UInt64,
        quantity UInt16,
        total_amount Decimal(10, 2),
        status LowCardinality(String),
        payment_method LowCardinality(String),
        order_date DateTime
      ) ENGINE = MergeTree()
      PARTITION BY toYYYYMM(order_date)
      ORDER BY (order_date, id)
    `,
  });

  // Analytics events table (typical ClickHouse workload)
  await client.command({
    query: `
      CREATE TABLE IF NOT EXISTS ${database}.analytics_events (
        id UInt64,
        user_id UInt64,
        event_type LowCardinality(String),
        url String,
        device LowCardinality(String),
        ip_address String,
        duration_ms UInt32,
        event_time DateTime
      ) ENGINE = MergeTree()
      PARTITION BY toYYYYMM(event_time)
      ORDER BY (event_type, event_time, id)
    `,
  });

  // Server metrics timeseries table
  await client.command({
    query: `
      CREATE TABLE IF NOT EXISTS ${database}.server_metrics (
        timestamp DateTime,
        hostname LowCardinality(String),
        cpu_usage Float32,
        memory_usage Float32,
        disk_io_read UInt64,
        disk_io_write UInt64
      ) ENGINE = MergeTree()
      ORDER BY (hostname, timestamp)
    `,
  });

  // Schema migrations table for RelWave migration tracking
  await client.command({
    query: `
      CREATE TABLE IF NOT EXISTS ${database}.schema_migrations (
        version String,
        name String,
        applied_at DateTime DEFAULT now(),
        checksum String
      ) ENGINE = MergeTree()
      ORDER BY version
    `,
  });

  console.log("   All tables created.\n");

  console.log("4. Generating data with ClickHouse vectorized execution engine...");

  // Seed users
  process.stdout.write(`  -> Inserting ${config.users.toLocaleString()} users... `);
  const uStart = Date.now();
  await client.command({
    query: `
      INSERT INTO ${database}.users
      SELECT
        number + 1 AS id,
        concat('User_', toString(number + 1)) AS name,
        concat('user_', toString(number + 1), '@example.com') AS email,
        ['admin', 'member', 'viewer', 'editor'][(number % 4) + 1] AS role,
        ['US', 'IN', 'DE', 'GB', 'CA', 'FR', 'JP', 'AU'][(number % 8) + 1] AS country,
        toUInt8(number % 5 != 0) AS is_active,
        toDate(today() - (number % 365)) AS signup_date,
        toDateTime(now() - (number % 86400)) AS created_at
      FROM numbers(${config.users})
    `,
  });
  console.log(`done in ${Date.now() - uStart}ms`);

  // Seed products
  process.stdout.write(`  -> Inserting ${config.products.toLocaleString()} products... `);
  const pStart = Date.now();
  await client.command({
    query: `
      INSERT INTO ${database}.products
      SELECT
        number + 1 AS id,
        concat('Product ', toString(number + 1)) AS name,
        ['Electronics', 'Books', 'Clothing', 'Home', 'Toys', 'Sports', 'Garden', 'Automotive'][(number % 8) + 1] AS category,
        toDecimal64(10.0 + ((number % 500) * 1.5), 2) AS price,
        toUInt32((number % 100) * 5) AS stock,
        toFloat32(round(3.0 + ((number % 20) * 0.1), 1)) AS rating,
        toDateTime(now() - ((number % 1000) * 86400)) AS created_at
      FROM numbers(${config.products})
    `,
  });
  console.log(`done in ${Date.now() - pStart}ms`);

  // Seed orders
  process.stdout.write(`  -> Inserting ${config.orders.toLocaleString()} orders... `);
  const oStart = Date.now();
  await client.command({
    query: `
      INSERT INTO ${database}.orders
      SELECT
        number + 1 AS id,
        (number % ${config.users}) + 1 AS user_id,
        (number % ${config.products}) + 1 AS product_id,
        toUInt16((number % 5) + 1) AS quantity,
        toDecimal64(((number % 5) + 1) * (15.0 + (number % 100)), 2) AS total_amount,
        ['pending', 'processing', 'completed', 'cancelled', 'refunded'][(number % 5) + 1] AS status,
        ['credit_card', 'paypal', 'apple_pay', 'crypto', 'bank_transfer'][(number % 5) + 1] AS payment_method,
        toDateTime(now() - ((number % 300) * 86400)) AS order_date
      FROM numbers(${config.orders})
    `,
  });
  console.log(`done in ${Date.now() - oStart}ms`);

  // Seed analytics_events
  process.stdout.write(`  -> Inserting ${config.events.toLocaleString()} analytics events... `);
  const eStart = Date.now();
  await client.command({
    query: `
      INSERT INTO ${database}.analytics_events
      SELECT
        number + 1 AS id,
        (number % ${config.users}) + 1 AS user_id,
        ['page_view', 'click', 'scroll', 'add_to_cart', 'search', 'checkout'][(number % 6) + 1] AS event_type,
        ['/home', '/products', '/cart', '/checkout', '/profile', '/settings'][(number % 6) + 1] AS url,
        ['mobile', 'desktop', 'tablet'][(number % 3) + 1] AS device,
        concat('192.168.', toString(number % 255), '.', toString((number * 7) % 255)) AS ip_address,
        toUInt32((number % 3000) + 50) AS duration_ms,
        toDateTime(now() - ((number % 10000) * 60)) AS event_time
      FROM numbers(${config.events})
    `,
  });
  console.log(`done in ${Date.now() - eStart}ms`);

  // Seed server_metrics
  process.stdout.write(`  -> Inserting ${config.metrics.toLocaleString()} server metrics... `);
  const mStart = Date.now();
  await client.command({
    query: `
      INSERT INTO ${database}.server_metrics
      SELECT
        toDateTime(now() - (number * 10)) AS timestamp,
        ['prod-api-1', 'prod-api-2', 'prod-db-1', 'worker-1', 'cache-1'][(number % 5) + 1] AS hostname,
        toFloat32(round(10.0 + ((number % 80) * 0.9), 2)) AS cpu_usage,
        toFloat32(round(30.0 + ((number % 60) * 0.8), 2)) AS memory_usage,
        toUInt64(number * 1024) AS disk_io_read,
        toUInt64(number * 512) AS disk_io_write
      FROM numbers(${config.metrics})
    `,
  });
  console.log(`done in ${Date.now() - mStart}ms`);

  // Seed schema_migrations baseline
  await client.command({
    query: `
      INSERT INTO ${database}.schema_migrations (version, name, checksum)
      VALUES ('20261014000000', 'initial_clickhouse_seed', 'clickhouse_seed_baseline')
    `,
  });

  const durationMs = Date.now() - startTime;

  // Retrieve verification stats
  console.log("\n5. Verifying seeded table metrics from ClickHouse system catalog...");
  const statsRes = await client.query({
    query: `
      SELECT
        table,
        formatReadableQuantity(sum(rows)) AS total_rows,
        formatReadableSize(sum(data_compressed_bytes)) AS compressed_size,
        formatReadableSize(sum(data_uncompressed_bytes)) AS uncompressed_size
      FROM system.parts
      WHERE database = '${database}'
        AND active = 1
        AND table IN ('users', 'products', 'orders', 'analytics_events', 'server_metrics', 'schema_migrations')
      GROUP BY table
      ORDER BY table
    `,
    format: "JSONEachRow",
  });
  const rows = (await statsRes.json()) as Array<{
    table: string;
    total_rows: string;
    compressed_size: string;
    uncompressed_size: string;
  }>;

  console.log("\n=======================================================");
  console.log("   ClickHouse Seeding Completed Successfully! 🎉");
  console.log("=======================================================");
  console.log(`Execution Time: ${durationMs} ms (${(durationMs / 1000).toFixed(2)}s)`);
  console.log(`Target:         ${url}`);
  console.log(`Database:       ${database}`);
  console.log("\nTable Breakdown:");
  for (const r of rows) {
    console.log(
      `  - ${r.table.padEnd(20)}: ${r.total_rows.padStart(10)} rows | ${r.compressed_size.padStart(10)} compressed (${r.uncompressed_size} uncompressed)`,
    );
  }
  console.log("=======================================================\n");

  await client.close();
}

main().catch((err) => {
  console.error("\n[Error] ClickHouse seed generation failed:", err);
  process.exit(1);
});
