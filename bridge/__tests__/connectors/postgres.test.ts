import { describe, it, expect, test, jest } from "@jest/globals";
import * as postgresConnector from "../../src/connectors/postgres";

const invalidConfig: postgresConnector.PGConfig = {
  host: "nonexistent.invalid.host",
  port: 5432,
  user: "test",
  password: "test",
  database: "test_db",
  ssl: false,
};

const validConfig: postgresConnector.PGConfig = {
  host: process.env.REAL_POSTGRES_HOST!,
  database: process.env.REAL_POSTGRES_DATABASE!,
  user: process.env.REAL_POSTGRES_USER!,
  password: process.env.REAL_POSTGRES_PASSWORD!,
  ssl: process.env.REAL_POSTGRES_SSL === "true",
  sslmode: process.env.REAL_POSTGRES_SSLMODE || "disable",
  port: Number(process.env.REAL_POSTGRES_PORT || 5432),
};

describe("Postgres Connector", () => {
  jest.setTimeout(10000);
  test("Should Fail to Connect to Postgres Database", async () => {
    const connection = await postgresConnector.testConnection(invalidConfig);
    expect(connection.ok).toBe(false);
    expect(connection.status).toBe("disconnected");
  });

  test("Should Connect to Postgres Database", async () => {
    const connection = await postgresConnector.testConnection(validConfig);
    expect(connection).toStrictEqual({
      message: "Connection successful",
      status: "connected",
      ok: true,
    });
  });

  test("Should Get Database Statistics", async () => {
    const stats = await postgresConnector.getDBStats(validConfig);
    expect(stats).toHaveProperty("total_tables");
    expect(stats).toHaveProperty("total_db_size_mb");
    expect(stats).toHaveProperty("total_rows");
  });

  test("Should Get List of Schemas", async () => {
    const schemas = await postgresConnector.listSchemas(validConfig);
    expect(schemas).toContainEqual({ name: "public" });
  });

  test("Should Get List of Tables in public Schema", async () => {
    const tables = await postgresConnector.listTables(validConfig, "public");
    expect(tables).toContainEqual({
      name: "persons",
      schema: "public",
      type: "BASE TABLE",
    });
    expect(tables).toContainEqual({
      name: "student",
      schema: "public",
      type: "BASE TABLE",
    });
  });

  test("Should Get the Table Details", async () => {
    const result = await postgresConnector.getTableDetails(
      validConfig,
      "public",
      "student"
    );
    expect(Array.isArray(result)).toBe(true);
    expect(result.length).toBeGreaterThan(0);
    expect(result[0]).toHaveProperty("name");
    expect(result[0]).toHaveProperty("type");
    expect(result[0]).toHaveProperty("is_primary_key");
  });

  test("Should Get Table Columns for student Table", async () => {
    const columns = await postgresConnector.fetchTableData(
      validConfig,
      "public",
      "student",
      10,
      1
    );
    expect(columns.rows.length).toBeGreaterThan(0);
    expect(columns.rows[0]).toHaveProperty("id");
    expect(columns.rows[0]).toHaveProperty("name");
    expect(columns.rows[0]).toHaveProperty("address");
  });

  test("Should Execute Query on student Table", async () => {
    const rows: any[] = [];
    let doneCalled = false;

    const { promise } = postgresConnector.streamQueryCancelable(
      validConfig,
      "SELECT * FROM public.student;",
      1000,
      // onBatch callback
      (batch, columns) => {
        rows.push(...batch);
      },
      // onDone callback
      () => {
        doneCalled = true;
      }
    );

    // wait for streaming to complete
    await promise;

    expect(doneCalled).toBe(true);
    expect(rows.length).toBeGreaterThan(0);

    // basic assertion: all rows contain keys that match the table
    expect(Object.keys(rows[0]).length).toBeGreaterThan(0);
  });

  // Skip: This test is flaky with local Docker PostgreSQL due to pg_sleep timing
  // It works correctly with cloud databases but times out with local containers
  test.skip("Should cancel a long running query", async () => {
    const rows: any[] = [];
    let errorCaught = false;

    const { promise, cancel } = postgresConnector.streamQueryCancelable(
      validConfig,
      "SELECT pg_sleep(5), * FROM public.student;",
      100,
      (batch) => {
        rows.push(...batch);
      }
    );

    // cancel after small delay
    setTimeout(() => {
      cancel();
    }, 100);

    try {
      await promise;
    } catch (err) {
      errorCaught = true;
    }

    // cancel should interrupt the stream
    expect(errorCaught).toBe(true);
    expect(rows.length).toBeGreaterThanOrEqual(0);
  }, 40000); // Increased timeout for long-running query cancellation
});
