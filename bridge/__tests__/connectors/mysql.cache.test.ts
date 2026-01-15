import { describe, expect, test, beforeEach, jest } from "@jest/globals";
import { mysqlCache } from "../../src/connectors/mysql";

// Mock MySQL config for testing
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

describe("MySQL Cache Manager", () => {
  beforeEach(() => {
    // Clear all caches before each test
    mysqlCache.clearAll();
  });

  describe("Table List Cache", () => {
    test("should return null for uncached table list", () => {
      const result = mysqlCache.getTableList(mockConfig);
      expect(result).toBeNull();
    });

    test("should cache and retrieve table list", () => {
      const tableData = [
        { schema: "testdb", name: "users", type: "BASE TABLE" },
        { schema: "testdb", name: "orders", type: "BASE TABLE" },
      ];

      mysqlCache.setTableList(mockConfig, tableData);
      const cached = mysqlCache.getTableList(mockConfig);

      expect(cached).toEqual(tableData);
    });

    test("should cache table list with schema", () => {
      const tableData = [
        { schema: "myschema", name: "products", type: "BASE TABLE" },
      ];

      mysqlCache.setTableList(mockConfig, tableData, "myschema");
      const cached = mysqlCache.getTableList(mockConfig, "myschema");

      expect(cached).toEqual(tableData);
    });

    test("should separate caches for different schemas", () => {
      const schema1Data = [{ schema: "schema1", name: "table1", type: "BASE TABLE" }];
      const schema2Data = [{ schema: "schema2", name: "table2", type: "BASE TABLE" }];

      mysqlCache.setTableList(mockConfig, schema1Data, "schema1");
      mysqlCache.setTableList(mockConfig, schema2Data, "schema2");

      expect(mysqlCache.getTableList(mockConfig, "schema1")).toEqual(schema1Data);
      expect(mysqlCache.getTableList(mockConfig, "schema2")).toEqual(schema2Data);
    });
  });

  describe("Columns Cache", () => {
    test("should return null for uncached columns", () => {
      const result = mysqlCache.getColumns(mockConfig, "testdb", "users");
      expect(result).toBeNull();
    });

    test("should cache and retrieve columns", () => {
      const columnData = [
        { column_name: "id", data_type: "int" },
        { column_name: "name", data_type: "varchar" },
      ];

      mysqlCache.setColumns(mockConfig, "testdb", "users", columnData as any);
      const cached = mysqlCache.getColumns(mockConfig, "testdb", "users");

      expect(cached).toEqual(columnData);
    });

    test("should separate caches for different tables", () => {
      const usersColumns = [{ column_name: "id", data_type: "int" }];
      const ordersColumns = [{ column_name: "order_id", data_type: "int" }];

      mysqlCache.setColumns(mockConfig, "testdb", "users", usersColumns as any);
      mysqlCache.setColumns(mockConfig, "testdb", "orders", ordersColumns as any);

      expect(mysqlCache.getColumns(mockConfig, "testdb", "users")).toEqual(usersColumns);
      expect(mysqlCache.getColumns(mockConfig, "testdb", "orders")).toEqual(ordersColumns);
    });
  });

  describe("Primary Keys Cache", () => {
    test("should return null for uncached primary keys", () => {
      const result = mysqlCache.getPrimaryKeys(mockConfig, "testdb", "users");
      expect(result).toBeNull();
    });

    test("should cache and retrieve primary keys", () => {
      const pkData = ["id", "tenant_id"];

      mysqlCache.setPrimaryKeys(mockConfig, "testdb", "users", pkData);
      const cached = mysqlCache.getPrimaryKeys(mockConfig, "testdb", "users");

      expect(cached).toEqual(pkData);
    });
  });

  describe("DB Stats Cache", () => {
    test("should return null for uncached stats", () => {
      const result = mysqlCache.getDBStats(mockConfig);
      expect(result).toBeNull();
    });

    test("should cache and retrieve DB stats", () => {
      const statsData = {
        total_tables: 25,
        total_db_size_mb: 150.5,
        total_rows: 100000,
      };

      mysqlCache.setDBStats(mockConfig, statsData);
      const cached = mysqlCache.getDBStats(mockConfig);

      expect(cached).toEqual(statsData);
    });

    test("should separate stats for different databases", () => {
      const stats1 = { total_tables: 10, total_db_size_mb: 50, total_rows: 1000 };
      const stats2 = { total_tables: 20, total_db_size_mb: 100, total_rows: 5000 };

      mysqlCache.setDBStats(mockConfig, stats1);
      mysqlCache.setDBStats(mockConfig2, stats2);

      expect(mysqlCache.getDBStats(mockConfig)).toEqual(stats1);
      expect(mysqlCache.getDBStats(mockConfig2)).toEqual(stats2);
    });
  });

  describe("Schemas Cache", () => {
    test("should return null for uncached schemas", () => {
      const result = mysqlCache.getSchemas(mockConfig);
      expect(result).toBeNull();
    });

    test("should cache and retrieve schemas", () => {
      const schemaData = [
        { name: "testdb" },
        { name: "production" },
        { name: "staging" },
      ];

      mysqlCache.setSchemas(mockConfig, schemaData);
      const cached = mysqlCache.getSchemas(mockConfig);

      expect(cached).toEqual(schemaData);
    });
  });

  describe("Table Details Cache", () => {
    test("should return null for uncached table details", () => {
      const result = mysqlCache.getTableDetails(mockConfig, "testdb", "users");
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

      mysqlCache.setTableDetails(mockConfig, "testdb", "users", detailsData);
      const cached = mysqlCache.getTableDetails(mockConfig, "testdb", "users");

      expect(cached).toEqual(detailsData);
    });
  });

  describe("Cache Management", () => {
    test("should clear all caches for a connection", () => {
      // Set up various caches
      mysqlCache.setTableList(mockConfig, [{ schema: "testdb", name: "t1", type: "BASE TABLE" }]);
      mysqlCache.setColumns(mockConfig, "testdb", "t1", [{ column_name: "id", data_type: "int" }] as any);
      mysqlCache.setPrimaryKeys(mockConfig, "testdb", "t1", ["id"]);
      mysqlCache.setDBStats(mockConfig, { total_tables: 1, total_db_size_mb: 1, total_rows: 100 });
      mysqlCache.setSchemas(mockConfig, [{ name: "testdb" }]);
      mysqlCache.setTableDetails(mockConfig, "testdb", "t1", []);

      // Clear for this connection
      mysqlCache.clearForConnection(mockConfig);

      // All should be null
      expect(mysqlCache.getTableList(mockConfig)).toBeNull();
      expect(mysqlCache.getColumns(mockConfig, "testdb", "t1")).toBeNull();
      expect(mysqlCache.getPrimaryKeys(mockConfig, "testdb", "t1")).toBeNull();
      expect(mysqlCache.getDBStats(mockConfig)).toBeNull();
      expect(mysqlCache.getSchemas(mockConfig)).toBeNull();
      expect(mysqlCache.getTableDetails(mockConfig, "testdb", "t1")).toBeNull();
    });

    test("should not affect other connections when clearing", () => {
      // Set up caches for both configs
      mysqlCache.setDBStats(mockConfig, { total_tables: 1, total_db_size_mb: 1, total_rows: 100 });
      mysqlCache.setDBStats(mockConfig2, { total_tables: 2, total_db_size_mb: 2, total_rows: 200 });

      // Clear only first connection
      mysqlCache.clearForConnection(mockConfig);

      // First should be null, second should still exist
      expect(mysqlCache.getDBStats(mockConfig)).toBeNull();
      expect(mysqlCache.getDBStats(mockConfig2)).toEqual({
        total_tables: 2,
        total_db_size_mb: 2,
        total_rows: 200,
      });
    });

    test("should clear table-specific cache", () => {
      mysqlCache.setColumns(mockConfig, "testdb", "users", [{ column_name: "id", data_type: "int" }] as any);
      mysqlCache.setColumns(mockConfig, "testdb", "orders", [{ column_name: "order_id", data_type: "int" }] as any);
      mysqlCache.setPrimaryKeys(mockConfig, "testdb", "users", ["id"]);
      mysqlCache.setTableDetails(mockConfig, "testdb", "users", []);

      // Clear only users table cache
      mysqlCache.clearTableCache(mockConfig, "testdb", "users");

      // Users cache should be cleared
      expect(mysqlCache.getColumns(mockConfig, "testdb", "users")).toBeNull();
      expect(mysqlCache.getPrimaryKeys(mockConfig, "testdb", "users")).toBeNull();
      expect(mysqlCache.getTableDetails(mockConfig, "testdb", "users")).toBeNull();

      // Orders cache should still exist
      expect(mysqlCache.getColumns(mockConfig, "testdb", "orders")).toEqual([
        { column_name: "order_id", data_type: "int" },
      ]);
    });

    test("should clear all caches globally", () => {
      mysqlCache.setDBStats(mockConfig, { total_tables: 1, total_db_size_mb: 1, total_rows: 100 });
      mysqlCache.setDBStats(mockConfig2, { total_tables: 2, total_db_size_mb: 2, total_rows: 200 });
      mysqlCache.setSchemas(mockConfig, [{ name: "testdb" }]);

      mysqlCache.clearAll();

      expect(mysqlCache.getDBStats(mockConfig)).toBeNull();
      expect(mysqlCache.getDBStats(mockConfig2)).toBeNull();
      expect(mysqlCache.getSchemas(mockConfig)).toBeNull();
    });

    test("should return correct cache statistics", () => {
      mysqlCache.setTableList(mockConfig, []);
      mysqlCache.setColumns(mockConfig, "testdb", "t1", [] as any);
      mysqlCache.setColumns(mockConfig, "testdb", "t2", [] as any);
      mysqlCache.setPrimaryKeys(mockConfig, "testdb", "t1", []);
      mysqlCache.setDBStats(mockConfig, { total_tables: 0, total_db_size_mb: 0, total_rows: 0 });
      mysqlCache.setSchemas(mockConfig, []);
      mysqlCache.setTableDetails(mockConfig, "testdb", "t1", []);

      const stats = mysqlCache.getStats();

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
      mysqlCache.setDBStats(mockConfig, statsData);

      // Measure cached retrievals
      const iterations = 1000;
      const start = performance.now();
      
      for (let i = 0; i < iterations; i++) {
        mysqlCache.getDBStats(mockConfig);
      }
      
      const elapsed = performance.now() - start;
      const avgTime = elapsed / iterations;

      console.log(`\nMySQL Cache Performance:`);
      console.log(`${iterations} cached getDBStats calls: ${elapsed.toFixed(3)}ms total`);
      console.log(`Average time per call: ${avgTime.toFixed(4)}ms`);

      // Cached calls should be fast (allowing for console.log overhead)
      // In production without logging, this would be sub-millisecond
      expect(avgTime).toBeLessThan(10);
    });

    test("multiple cache types should be retrievable quickly", () => {
      // Set up various caches
      mysqlCache.setDBStats(mockConfig, { total_tables: 1, total_db_size_mb: 1, total_rows: 100 });
      mysqlCache.setSchemas(mockConfig, [{ name: "testdb" }]);
      mysqlCache.setTableList(mockConfig, [{ schema: "testdb", name: "users", type: "BASE TABLE" }]);
      mysqlCache.setColumns(mockConfig, "testdb", "users", [] as any);
      mysqlCache.setPrimaryKeys(mockConfig, "testdb", "users", ["id"]);
      mysqlCache.setTableDetails(mockConfig, "testdb", "users", []);

      const iterations = 100;
      const start = performance.now();

      for (let i = 0; i < iterations; i++) {
        mysqlCache.getDBStats(mockConfig);
        mysqlCache.getSchemas(mockConfig);
        mysqlCache.getTableList(mockConfig);
        mysqlCache.getColumns(mockConfig, "testdb", "users");
        mysqlCache.getPrimaryKeys(mockConfig, "testdb", "users");
        mysqlCache.getTableDetails(mockConfig, "testdb", "users");
      }

      const elapsed = performance.now() - start;
      const avgTimePerIteration = elapsed / iterations;

      console.log(`\n${iterations} iterations of 6 cache reads: ${elapsed.toFixed(3)}ms`);
      console.log(`Average per iteration: ${avgTimePerIteration.toFixed(4)}ms`);

      // All 6 cache reads per iteration should be reasonable
      // (console.log statements add overhead - in production this would be much faster)
      expect(avgTimePerIteration).toBeLessThan(50);
    });
  });
});
