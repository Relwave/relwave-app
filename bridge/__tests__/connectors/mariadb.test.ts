import { describe, it, expect, test } from "@jest/globals";
import * as mariadbConnector from "../../src/connectors/mariadb";

const invalidConfig: mariadbConnector.MariaDBConfig = {
    host: process.env.MARIADB_HOST!,
    user: process.env.MARIADB_USER!,
    password: process.env.MARIADB_PASSWORD!,
    database: process.env.MARIADB_DATABASE!,
    ssl: true,
    port: Number(process.env.MARIADB_PORT || 3306),
};

const validConfig: mariadbConnector.MariaDBConfig = {
    host: process.env.REAL_MARIADB_HOST!,
    user: process.env.REAL_MARIADB_USER!,
    password: process.env.REAL_MARIADB_PASSWORD!,
    database: process.env.REAL_MARIADB_DATABASE!,
    ssl: process.env.REAL_MARIADB_SSL === "true",
    port: Number(process.env.REAL_MARIADB_PORT || 3306),
};

describe("MariaDB Connector", () => {
    test("Should Fail to Connect to MariaDB Database", async () => {
        const connection = await mariadbConnector.testConnection(invalidConfig);
        expect(connection.ok).toBe(false);
        expect(connection.status).toBe('disconnected');
    });

    test("Should Connect to MariaDB Database", async () => {
        const connection = await mariadbConnector.testConnection(validConfig);
        expect(connection).toStrictEqual({ ok: true, status: 'connected', message: 'Connection successful' });
    });

    test("Should Create a Table Schema", async () => {
        const rows: any[] = [];
        let doneCalled = false;

        const { promise } = mariadbConnector.streamQueryCancelable(
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
        const result = await mariadbConnector.fetchTableData(
            validConfig,
            process.env.REAL_MARIADB_DATABASE!,
            "TestTable",
            10,
            1
        );
        expect(result).toHaveProperty('rows');
        expect(result).toHaveProperty('total');
        expect(Array.isArray(result.rows)).toBe(true);
    });

    test("Should Fetch the Tables List", async () => {
        const result = await mariadbConnector.listTables(validConfig, process.env.REAL_MARIADB_DATABASE!);
        expect(Array.isArray(result)).toBe(true);
        expect(result.length).toBeGreaterThan(0);
        expect(result[0]).toHaveProperty("name");
    });

    test("Should Fetch the Table Schema", async () => {
        const result = await mariadbConnector.getTableDetails(
            validConfig,
            process.env.REAL_MARIADB_DATABASE!,
            "TestTable"
        );
        expect(Array.isArray(result)).toBe(true);
        expect(result.length).toBeGreaterThan(0);
        expect(result[0]).toHaveProperty("name");
    });
});
