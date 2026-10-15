import { describe, expect, test, jest, afterAll } from "@jest/globals";
import * as clickhouseConnector from "../../src/connectors/clickhouse";

const invalidConfig: clickhouseConnector.ClickHouseConfig = {
  host: "nonexistent.invalid.host",
  port: 8123,
  user: "testuser",
  password: "wrongpassword",
  database: "testdb",
};

const validConfig: clickhouseConnector.ClickHouseConfig = {
  host: process.env.REAL_CLICKHOUSE_HOST || "127.0.0.1",
  port: Number(process.env.REAL_CLICKHOUSE_PORT || 8123),
  user: process.env.REAL_CLICKHOUSE_USER || "testuser",
  password: process.env.REAL_CLICKHOUSE_PASSWORD || "testpass",
  database: process.env.REAL_CLICKHOUSE_DATABASE || "testdb",
  ssl: process.env.REAL_CLICKHOUSE_SSL === "true",
};

describe("ClickHouse Connector", () => {
  jest.setTimeout(20000);

  afterAll(async () => {
    await clickhouseConnector.closeAllClients();
  });

  test("Should Fail to Connect to ClickHouse with Invalid Config", async () => {
    const connection = await clickhouseConnector.testConnection(invalidConfig);
    expect(connection.ok).toBe(false);
    expect(connection.status).toBe("disconnected");
  });

  test("Should Connect to ClickHouse Database", async () => {
    const connection = await clickhouseConnector.testConnection(validConfig);
    expect(connection).toStrictEqual({
      message: "Connection successful",
      status: "connected",
      ok: true,
    });
  });

  test("Should Get Database Statistics", async () => {
    const stats = await clickhouseConnector.getDBStats(validConfig);
    expect(stats).toHaveProperty("total_tables");
    expect(stats).toHaveProperty("total_rows");
    expect(stats).toHaveProperty("total_db_size_mb");
    expect(stats.total_tables).toBeGreaterThanOrEqual(1);
  });

  test("Should Get List of Schemas / Databases", async () => {
    const schemas = await clickhouseConnector.listSchemas(validConfig);
    expect(Array.isArray(schemas)).toBe(true);
    expect(schemas.some((s) => s.name === validConfig.database)).toBe(true);
  });

  test("Should Get List of Tables in testdb", async () => {
    const tables = await clickhouseConnector.listTables(validConfig, validConfig.database);
    expect(Array.isArray(tables)).toBe(true);
    const tableNames = tables.map((t) => t.name);
    expect(tableNames).toContain("persons");
    expect(tableNames).toContain("student");
    expect(tableNames).toContain("TestTable");
  });

  test("Should Get Table Details for student Table", async () => {
    const details = await clickhouseConnector.getTableDetails(
      validConfig,
      validConfig.database,
      "student",
    );
    expect(Array.isArray(details)).toBe(true);
    expect(details.length).toBeGreaterThanOrEqual(3);

    const colNames = details.map((c) => c.name);
    expect(colNames).toContain("id");
    expect(colNames).toContain("name");
    expect(colNames).toContain("address");

    const idCol = details.find((c) => c.name === "id");
    expect(idCol?.is_primary_key).toBe(true);
  });

  test("Should Get Table Primary Keys for student Table", async () => {
    const pks = await clickhouseConnector.listPrimaryKeys(
      validConfig,
      validConfig.database,
      "student",
    );
    expect(Array.isArray(pks)).toBe(true);
    expect(pks.length).toBeGreaterThanOrEqual(1);
    expect(pks[0].column_name).toBe("id");
  });

  test("Should Fetch Table Data from persons", async () => {
    const result = await clickhouseConnector.fetchTableData(
      validConfig,
      validConfig.database,
      "persons",
      10,
      1,
    );
    expect(result).toHaveProperty("total");
    expect(result.total).toBeGreaterThanOrEqual(3);
    expect(Array.isArray(result.rows)).toBe(true);
    expect(result.rows.length).toBeGreaterThanOrEqual(3);
    expect(result.rows[0]).toHaveProperty("id");
    expect(result.rows[0]).toHaveProperty("name");
    expect(result.rows[0]).toHaveProperty("email");
  });

  test("Should Stream Query on student Table", async () => {
    const rows: any[] = [];
    let doneCalled = false;

    const { promise } = clickhouseConnector.streamQueryCancelable(
      validConfig,
      `SELECT * FROM ${validConfig.database}.student ORDER BY id;`,
      10,
      (batch) => {
        rows.push(...batch);
      },
      () => {
        doneCalled = true;
      },
    );

    await promise;

    expect(doneCalled).toBe(true);
    expect(rows.length).toBeGreaterThanOrEqual(3);
    expect(rows[0]).toHaveProperty("name");
  });

  test("Should Insert, Update, and Delete Rows", async () => {
    const testId = 88888;
    const testName = "CRUD Integration Test";
    const updatedName = "Updated CRUD Test";

    // 1. Insert
    const inserted = await clickhouseConnector.insertRow(
      validConfig,
      validConfig.database,
      "TestTable",
      { id: testId, name: testName },
    );
    expect(inserted).toHaveProperty("id", testId);

    // Verify insertion
    const dataAfterInsert = await clickhouseConnector.fetchTableData(
      validConfig,
      validConfig.database,
      "TestTable",
      50,
      1,
    );
    const foundInserted = dataAfterInsert.rows.find((r) => Number(r.id) === testId);
    expect(foundInserted).toBeDefined();
    expect(foundInserted.name).toBe(testName);

    // 2. Update
    await clickhouseConnector.updateRow(
      validConfig,
      validConfig.database,
      "TestTable",
      "id",
      testId,
      { name: updatedName },
    );

    const dataAfterUpdate = await clickhouseConnector.fetchTableData(
      validConfig,
      validConfig.database,
      "TestTable",
      50,
      1,
    );
    const foundUpdated = dataAfterUpdate.rows.find((r) => Number(r.id) === testId);
    expect(foundUpdated).toBeDefined();
    expect(foundUpdated.name).toBe(updatedName);

    // 3. Delete
    const deleted = await clickhouseConnector.deleteRow(
      validConfig,
      validConfig.database,
      "TestTable",
      "id",
      testId,
    );
    expect(deleted).toBe(true);

    const dataAfterDelete = await clickhouseConnector.fetchTableData(
      validConfig,
      validConfig.database,
      "TestTable",
      50,
      1,
    );
    const foundDeleted = dataAfterDelete.rows.find((r) => Number(r.id) === testId);
    expect(foundDeleted).toBeUndefined();
  });

  test("Should Search Table by Keyword", async () => {
    const searchResult = await clickhouseConnector.searchTable(
      validConfig,
      validConfig.database,
      "persons",
      "John",
    );
    expect(searchResult.total).toBeGreaterThanOrEqual(1);
    expect(searchResult.rows.some((r) => r.name.includes("John"))).toBe(true);
  });

  test("Should Get Schema Metadata Batch for ER Diagram", async () => {
    const batch = await clickhouseConnector.getSchemaMetadataBatch(
      validConfig,
      validConfig.database,
    );
    expect(batch.tables instanceof Map).toBe(true);
    expect(batch.tables.size).toBeGreaterThanOrEqual(3);

    const studentMeta = batch.tables.get("student");
    expect(studentMeta).toBeDefined();
    expect(studentMeta!.columns.length).toBeGreaterThanOrEqual(3);
    expect(studentMeta!.primaryKeys.length).toBeGreaterThanOrEqual(1);
    expect(studentMeta!.primaryKeys[0].column_name).toBe("id");
  });

  test("Should Return Empty Arrays for Foreign Keys and Unique Constraints", async () => {
    const fks = await clickhouseConnector.listForeignKeys(
      validConfig,
      validConfig.database,
      "student",
    );
    expect(fks).toEqual([]);

    const uqs = await clickhouseConnector.listUniqueConstraints(
      validConfig,
      validConfig.database,
      "student",
    );
    expect(uqs).toEqual([]);

    const checks = await clickhouseConnector.listCheckConstraints(
      validConfig,
      validConfig.database,
      "student",
    );
    expect(checks).toEqual([]);
  });

  test("Should Parse and Split Multi-statement Migrations", () => {
    const sql = `
      -- First statement
      CREATE TABLE \`testdb\`.\`temp_1\` (id UInt32) ENGINE = MergeTree() ORDER BY id;
      -- Second statement
      CREATE TABLE \`testdb\`.\`temp_2\` (id UInt32) ENGINE = MergeTree() ORDER BY id;
    `;
    const stmts = clickhouseConnector.splitClickHouseStatements(sql);
    expect(stmts).toHaveLength(2);
    expect(stmts[0]).toContain("`testdb`.`temp_1`");
    expect(stmts[1]).toContain("`testdb`.`temp_2`");
  });
});
