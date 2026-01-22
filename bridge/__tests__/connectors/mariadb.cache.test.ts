import { describe, expect, test, beforeEach, jest } from "@jest/globals";
import { mariadbCache } from "../../src/connectors/mariadb";

// Mock MariaDB config for testing
const mockConfig = {
    host: "localhost",
    port: 3306,
    user: "testuser",
    password: "testpass",
    database: "testdb",
};

const mockConfig2 = {
    host: "localhost",
    port: 3306,
    user: "testuser",
    password: "testpass",
    database: "otherdb",
};

describe("MariaDB Cache Manager", () => {
    beforeEach(() => {
        // Clear all caches before each test
        mariadbCache.clearAll();
    });

    describe("Table List Cache", () => {
        test("should return null for uncached table list", () => {
            const result = mariadbCache.getTableList(mockConfig);
            expect(result).toBeNull();
        });

        test("should cache and retrieve table list", () => {
            const tableData = [
                { schema: "testdb", name: "users", type: "BASE TABLE" },
                { schema: "testdb", name: "orders", type: "BASE TABLE" },
            ];

            mariadbCache.setTableList(mockConfig, tableData);
            const cached = mariadbCache.getTableList(mockConfig);

            expect(cached).toEqual(tableData);
        });

        test("should cache table list with schema", () => {
            const tableData = [
                { schema: "myschema", name: "products", type: "BASE TABLE" },
            ];

            mariadbCache.setTableList(mockConfig, tableData, "myschema");
            const cached = mariadbCache.getTableList(mockConfig, "myschema");

            expect(cached).toEqual(tableData);
        });

        test("should separate caches for different schemas", () => {
            const schema1Data = [{ schema: "schema1", name: "table1", type: "BASE TABLE" }];
            const schema2Data = [{ schema: "schema2", name: "table2", type: "BASE TABLE" }];

            mariadbCache.setTableList(mockConfig, schema1Data, "schema1");
            mariadbCache.setTableList(mockConfig, schema2Data, "schema2");

            expect(mariadbCache.getTableList(mockConfig, "schema1")).toEqual(schema1Data);
            expect(mariadbCache.getTableList(mockConfig, "schema2")).toEqual(schema2Data);
        });
    });

    describe("Columns Cache", () => {
        test("should return null for uncached columns", () => {
            const result = mariadbCache.getColumns(mockConfig, "testdb", "users");
            expect(result).toBeNull();
        });

        test("should cache and retrieve columns", () => {
            const columnData = [
                { column_name: "id", data_type: "int" },
                { column_name: "name", data_type: "varchar" },
            ];

            mariadbCache.setColumns(mockConfig, "testdb", "users", columnData as any);
            const cached = mariadbCache.getColumns(mockConfig, "testdb", "users");

            expect(cached).toEqual(columnData);
        });

        test("should separate caches for different tables", () => {
            const usersColumns = [{ column_name: "id", data_type: "int" }];
            const ordersColumns = [{ column_name: "order_id", data_type: "int" }];

            mariadbCache.setColumns(mockConfig, "testdb", "users", usersColumns as any);
            mariadbCache.setColumns(mockConfig, "testdb", "orders", ordersColumns as any);

            expect(mariadbCache.getColumns(mockConfig, "testdb", "users")).toEqual(usersColumns);
            expect(mariadbCache.getColumns(mockConfig, "testdb", "orders")).toEqual(ordersColumns);
        });
    });

    describe("Primary Keys Cache", () => {
        test("should return null for uncached primary keys", () => {
            const result = mariadbCache.getPrimaryKeys(mockConfig, "testdb", "users");
            expect(result).toBeNull();
        });

        test("should cache and retrieve primary keys", () => {
            const pkData = ["id", "tenant_id"];

            mariadbCache.setPrimaryKeys(mockConfig, "testdb", "users", pkData);
            const cached = mariadbCache.getPrimaryKeys(mockConfig, "testdb", "users");

            expect(cached).toEqual(pkData);
        });
    });

    describe("DB Stats Cache", () => {
        test("should return null for uncached stats", () => {
            const result = mariadbCache.getDBStats(mockConfig);
            expect(result).toBeNull();
        });

        test("should cache and retrieve DB stats", () => {
            const statsData = {
                total_tables: 25,
                total_db_size_mb: 150.5,
                total_rows: 100000,
            };

            mariadbCache.setDBStats(mockConfig, statsData);
            const cached = mariadbCache.getDBStats(mockConfig);

            expect(cached).toEqual(statsData);
        });

        test("should separate stats for different databases", () => {
            const stats1 = { total_tables: 10, total_db_size_mb: 50, total_rows: 1000 };
            const stats2 = { total_tables: 20, total_db_size_mb: 100, total_rows: 5000 };

            mariadbCache.setDBStats(mockConfig, stats1);
            mariadbCache.setDBStats(mockConfig2, stats2);

            expect(mariadbCache.getDBStats(mockConfig)).toEqual(stats1);
            expect(mariadbCache.getDBStats(mockConfig2)).toEqual(stats2);
        });
    });

    describe("Schemas Cache", () => {
        test("should return null for uncached schemas", () => {
            const result = mariadbCache.getSchemas(mockConfig);
            expect(result).toBeNull();
        });

        test("should cache and retrieve schemas", () => {
            const schemaData = [
                { name: "testdb" },
                { name: "production" },
                { name: "staging" },
            ];

            mariadbCache.setSchemas(mockConfig, schemaData);
            const cached = mariadbCache.getSchemas(mockConfig);

            expect(cached).toEqual(schemaData);
        });
    });

    describe("Table Details Cache", () => {
        test("should return null for uncached table details", () => {
            const result = mariadbCache.getTableDetails(mockConfig, "testdb", "users");
            expect(result).toBeNull();
        });

        test("should cache and retrieve table details", () => {
            const detailsData = [
                {
                    name: "id",
                    type: "int",
                    not_nullable: true,
                    default_value: null,
                    is_primary_key: true,
                    is_foreign_key: false,
                },
                {
                    name: "email",
                    type: "varchar",
                    not_nullable: true,
                    default_value: null,
                    is_primary_key: false,
                    is_foreign_key: false,
                },
            ];

            mariadbCache.setTableDetails(mockConfig, "testdb", "users", detailsData);
            const cached = mariadbCache.getTableDetails(mockConfig, "testdb", "users");

            expect(cached).toEqual(detailsData);
        });
    });

    describe("Cache Management", () => {
        test("should clear all caches for a connection", () => {
            // Set up various caches
            mariadbCache.setTableList(mockConfig, [{ schema: "testdb", name: "t1", type: "BASE TABLE" }]);
            mariadbCache.setColumns(mockConfig, "testdb", "t1", [{ column_name: "id", data_type: "int" }] as any);
            mariadbCache.setPrimaryKeys(mockConfig, "testdb", "t1", ["id"]);
            mariadbCache.setDBStats(mockConfig, { total_tables: 1, total_db_size_mb: 1, total_rows: 100 });
            mariadbCache.setSchemas(mockConfig, [{ name: "testdb" }]);
            mariadbCache.setTableDetails(mockConfig, "testdb", "t1", []);

            // Clear for this connection
            mariadbCache.clearForConnection(mockConfig);

            // All should be null
            expect(mariadbCache.getTableList(mockConfig)).toBeNull();
            expect(mariadbCache.getColumns(mockConfig, "testdb", "t1")).toBeNull();
            expect(mariadbCache.getPrimaryKeys(mockConfig, "testdb", "t1")).toBeNull();
            expect(mariadbCache.getDBStats(mockConfig)).toBeNull();
            expect(mariadbCache.getSchemas(mockConfig)).toBeNull();
            expect(mariadbCache.getTableDetails(mockConfig, "testdb", "t1")).toBeNull();
        });

        test("should not affect other connections when clearing", () => {
            // Set up caches for both configs
            mariadbCache.setDBStats(mockConfig, { total_tables: 1, total_db_size_mb: 1, total_rows: 100 });
            mariadbCache.setDBStats(mockConfig2, { total_tables: 2, total_db_size_mb: 2, total_rows: 200 });

            // Clear only first connection
            mariadbCache.clearForConnection(mockConfig);

            // First should be null, second should still exist
            expect(mariadbCache.getDBStats(mockConfig)).toBeNull();
            expect(mariadbCache.getDBStats(mockConfig2)).toEqual({
                total_tables: 2,
                total_db_size_mb: 2,
                total_rows: 200,
            });
        });

        test("should clear table-specific cache", () => {
            mariadbCache.setColumns(mockConfig, "testdb", "users", [{ column_name: "id", data_type: "int" }] as any);
            mariadbCache.setColumns(mockConfig, "testdb", "orders", [{ column_name: "order_id", data_type: "int" }] as any);
            mariadbCache.setPrimaryKeys(mockConfig, "testdb", "users", ["id"]);
            mariadbCache.setTableDetails(mockConfig, "testdb", "users", []);

            // Clear only users table cache
            mariadbCache.clearTableCache(mockConfig, "testdb", "users");

            // Users cache should be cleared
            expect(mariadbCache.getColumns(mockConfig, "testdb", "users")).toBeNull();
            expect(mariadbCache.getPrimaryKeys(mockConfig, "testdb", "users")).toBeNull();
            expect(mariadbCache.getTableDetails(mockConfig, "testdb", "users")).toBeNull();

            // Orders cache should still exist
            expect(mariadbCache.getColumns(mockConfig, "testdb", "orders")).toEqual([
                { column_name: "order_id", data_type: "int" },
            ]);
        });

        test("should clear all caches globally", () => {
            mariadbCache.setDBStats(mockConfig, { total_tables: 1, total_db_size_mb: 1, total_rows: 100 });
            mariadbCache.setDBStats(mockConfig2, { total_tables: 2, total_db_size_mb: 2, total_rows: 200 });
            mariadbCache.setSchemas(mockConfig, [{ name: "testdb" }]);

            mariadbCache.clearAll();

            expect(mariadbCache.getDBStats(mockConfig)).toBeNull();
            expect(mariadbCache.getDBStats(mockConfig2)).toBeNull();
            expect(mariadbCache.getSchemas(mockConfig)).toBeNull();
        });

        test("should return correct cache statistics", () => {
            mariadbCache.setTableList(mockConfig, []);
            mariadbCache.setColumns(mockConfig, "testdb", "t1", [] as any);
            mariadbCache.setColumns(mockConfig, "testdb", "t2", [] as any);
            mariadbCache.setPrimaryKeys(mockConfig, "testdb", "t1", []);
            mariadbCache.setDBStats(mockConfig, { total_tables: 0, total_db_size_mb: 0, total_rows: 0 });
            mariadbCache.setSchemas(mockConfig, []);
            mariadbCache.setTableDetails(mockConfig, "testdb", "t1", []);

            const stats = mariadbCache.getStats();

            expect(stats.tableLists).toBe(1);
            expect(stats.columns).toBe(2);
            expect(stats.primaryKeys).toBe(1);
            expect(stats.dbStats).toBe(1);
            expect(stats.schemas).toBe(1);
            expect(stats.tableDetails).toBe(1);
        });
    });

    describe("Cache Performance", () => {
        test("cached retrieval should be faster than simulated DB call", () => {
            const statsData = {
                total_tables: 100,
                total_db_size_mb: 500.5,
                total_rows: 1000000,
            };

            // Set cache
            mariadbCache.setDBStats(mockConfig, statsData);

            // Measure cached retrievals
            const iterations = 1000;
            const start = performance.now();

            for (let i = 0; i < iterations; i++) {
                mariadbCache.getDBStats(mockConfig);
            }

            const elapsed = performance.now() - start;
            const avgTime = elapsed / iterations;

            // Cached calls should be fast (allowing for console.log overhead)
            // In production without logging, this would be sub-millisecond
            expect(avgTime).toBeLessThan(10);
        });

        test("multiple cache types should be retrievable quickly", () => {
            // Set up various caches
            mariadbCache.setDBStats(mockConfig, { total_tables: 1, total_db_size_mb: 1, total_rows: 100 });
            mariadbCache.setSchemas(mockConfig, [{ name: "testdb" }]);
            mariadbCache.setTableList(mockConfig, [{ schema: "testdb", name: "users", type: "BASE TABLE" }]);
            mariadbCache.setColumns(mockConfig, "testdb", "users", [] as any);
            mariadbCache.setPrimaryKeys(mockConfig, "testdb", "users", ["id"]);
            mariadbCache.setTableDetails(mockConfig, "testdb", "users", []);

            const iterations = 100;
            const start = performance.now();

            for (let i = 0; i < iterations; i++) {
                mariadbCache.getDBStats(mockConfig);
                mariadbCache.getSchemas(mockConfig);
                mariadbCache.getTableList(mockConfig);
                mariadbCache.getColumns(mockConfig, "testdb", "users");
                mariadbCache.getPrimaryKeys(mockConfig, "testdb", "users");
                mariadbCache.getTableDetails(mockConfig, "testdb", "users");
            }

            const elapsed = performance.now() - start;
            const avgTimePerIteration = elapsed / iterations;

            // All 6 cache reads per iteration should be reasonable
            // (console.log statements add overhead - in production this would be much faster)
            expect(avgTimePerIteration).toBeLessThan(50);
        });
    });
});
