import { describe, it, expect, test } from "@jest/globals";
import * as mysqlConnector from "../../src/connectors/mysql";

const invalidConfig: mysqlConnector.MySQLConfig = {
  host: process.env.MYSQL_HOST!,
  user: process.env.MYSQL_USER!,
  password: process.env.MYSQL_PASSWORD!,
  database: process.env.MYSQL_DATABASE!,
  port: Number(process.env.MYSQL_PORT || 3306),
};

const validConfig: mysqlConnector.MySQLConfig = {
  host: process.env.REAL_MYSQL_HOST!,
  user: process.env.REAL_MYSQL_USER!,
  password: process.env.REAL_MYSQL_PASSWORD!,
  database: process.env.REAL_MYSQL_DATABASE!,
  port: Number(process.env.REAL_MYSQL_PORT || 3306),
};

describe("MySQL Connector", () => {
  test("Should Fail to Connect to MySQL Database", async () => {
    const connection = await mysqlConnector.testConnection(invalidConfig);
    expect(connection).toStrictEqual({
      message: 'getaddrinfo ENOTFOUND "localhost",',
      status: "disconnected",
      ok: false,
    });
  });
  test("Should Connect to MySQL Database", async () => {
    const pool = mysqlConnector.createPoolConfig(validConfig);
    const connection = await mysqlConnector.testConnection(pool);
    expect(connection).toStrictEqual({
      message: "Connection successful",
      status: "connected",
      ok: true,
    });
  });

  test("Should Create a Table Schema", async () => {
    const rows: any[] = [];
    let doneCalled = false;

    const { promise } = mysqlConnector.streamQueryCancelable(
      validConfig,
      "CREATE TABLE IF NOT EXISTS TestTable (id INT PRIMARY KEY, name VARCHAR(50));",
      1000,
      (batch) => {
        rows.push(...batch);
      },
      () => {
        doneCalled = true;
      }
    );

    await promise;

    expect(doneCalled).toBe(true);
    expect(rows.length).toBeGreaterThanOrEqual(0);
  });

  test("Should Fetch the Table Data", async () => {
    const result = await mysqlConnector.fetchTableData(
      validConfig,
      "defaultdb",
      "TestTable",
      100,
      10
    );
    expect(Array.isArray(result.rows)).toBe(true);
    expect(result.rows.length).toBeGreaterThanOrEqual(0);
  });

  test("Should Fetch the Tables List", async () => {
    const result = await mysqlConnector.listTables(validConfig, "defaultdb");
    expect(Array.isArray(result)).toBe(true);
    expect(result.length).toBeGreaterThan(0);
    expect(result[0]).toHaveProperty("name");
  });

  test("Should Fetch the Table Schema", async () => {
    const result = await mysqlConnector.getTableDetails(
      validConfig,
      "defaultdb",
      "TestTable"
    );
    expect(Array.isArray(result)).toBe(true);
    expect(result.length).toBeGreaterThan(0);
    expect(result[0]).toHaveProperty("name");
  });
});
