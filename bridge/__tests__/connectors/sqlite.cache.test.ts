import { sqliteCache } from "../../src/connectors/sqlite";
import { describe, it, expect, beforeEach } from "@jest/globals";
import { SQLiteConfig } from "../../src/types/sqlite";

const mockConfig: SQLiteConfig = {
  path: "/tmp/test.db",
};

const mockConfig2: SQLiteConfig = {
  path: "/tmp/other.db",
};

describe("SQLiteCacheManager", () => {
  beforeEach(() => {
    sqliteCache.clearAll();
  });

  describe("Connection Key Generation", () => {
    it("should generate consistent keys for same config", () => {
      const tables = [{ schema: "main", name: "users", type: "table" }];

      sqliteCache.setTableList(mockConfig, tables);
      const cached = sqliteCache.getTableList(mockConfig);

      expect(cached).toEqual(tables);
    });

    it("should generate different keys for different paths", () => {
      const tables1 = [{ schema: "main", name: "users", type: "table" }];
      const tables2 = [{ schema: "main", name: "orders", type: "table" }];

      sqliteCache.setTableList(mockConfig, tables1);
      sqliteCache.setTableList(mockConfig2, tables2);

      expect(sqliteCache.getTableList(mockConfig)).toEqual(tables1);
      expect(sqliteCache.getTableList(mockConfig2)).toEqual(tables2);
    });
  });

  describe("Table List Cache", () => {
    const mockTables = [
      { schema: "main", name: "users", type: "table" },
      { schema: "main", name: "orders", type: "table" },
    ];

    it("should cache and retrieve table list", () => {
      sqliteCache.setTableList(mockConfig, mockTables);
      const cached = sqliteCache.getTableList(mockConfig);

      expect(cached).toEqual(mockTables);
    });

    it("should return null for uncached table list", () => {
      const cached = sqliteCache.getTableList(mockConfig);
      expect(cached).toBeNull();
    });

    it("should cache table list per schema", () => {
      const mainTables = [{ schema: "main", name: "users", type: "table" }];
      const tempTables = [{ schema: "temp", name: "tmp_data", type: "table" }];

      sqliteCache.setTableList(mockConfig, mainTables, "main");
      sqliteCache.setTableList(mockConfig, tempTables, "temp");

      expect(sqliteCache.getTableList(mockConfig, "main")).toEqual(mainTables);
      expect(sqliteCache.getTableList(mockConfig, "temp")).toEqual(tempTables);
    });
  });

  describe("Primary Keys Cache", () => {
    const mockPrimaryKeys = [{ column_name: "id" }];

    it("should cache and retrieve primary keys", () => {
      sqliteCache.setPrimaryKeys(mockConfig, "main", "users", mockPrimaryKeys);
      const cached = sqliteCache.getPrimaryKeys(mockConfig, "main", "users");

      expect(cached).toEqual(mockPrimaryKeys);
    });

    it("should return null for uncached primary keys", () => {
      const cached = sqliteCache.getPrimaryKeys(mockConfig, "main", "users");
      expect(cached).toBeNull();
    });

    it("should cache primary keys per table", () => {
      const usersPK = [{ column_name: "id" }];
      const ordersPK = [{ column_name: "order_id" }];

      sqliteCache.setPrimaryKeys(mockConfig, "main", "users", usersPK);
      sqliteCache.setPrimaryKeys(mockConfig, "main", "orders", ordersPK);

      expect(sqliteCache.getPrimaryKeys(mockConfig, "main", "users")).toEqual(usersPK);
      expect(sqliteCache.getPrimaryKeys(mockConfig, "main", "orders")).toEqual(ordersPK);
    });
  });

  describe("DB Stats Cache", () => {
    const mockStats = {
      total_tables: 5,
      total_db_size_mb: 1.5,
      total_rows: 500,
    };

    it("should cache and retrieve DB stats", () => {
      sqliteCache.setDBStats(mockConfig, mockStats);
      const cached = sqliteCache.getDBStats(mockConfig);

      expect(cached).toEqual(mockStats);
    });

    it("should return null for uncached DB stats", () => {
      const cached = sqliteCache.getDBStats(mockConfig);
      expect(cached).toBeNull();
    });

    it("should cache DB stats per connection", () => {
      const stats1 = { total_tables: 5, total_db_size_mb: 1.5, total_rows: 500 };
      const stats2 = { total_tables: 3, total_db_size_mb: 0.8, total_rows: 200 };

      sqliteCache.setDBStats(mockConfig, stats1);
      sqliteCache.setDBStats(mockConfig2, stats2);

      expect(sqliteCache.getDBStats(mockConfig)).toEqual(stats1);
      expect(sqliteCache.getDBStats(mockConfig2)).toEqual(stats2);
    });
  });

  describe("Schemas Cache", () => {
    const mockSchemas = [{ name: "main" }];

    it("should cache and retrieve schemas", () => {
      sqliteCache.setSchemas(mockConfig, mockSchemas);
      const cached = sqliteCache.getSchemas(mockConfig);

      expect(cached).toEqual(mockSchemas);
    });

    it("should return null for uncached schemas", () => {
      const cached = sqliteCache.getSchemas(mockConfig);
      expect(cached).toBeNull();
    });
  });

  describe("Table Details Cache", () => {
    const mockDetails = [
      {
        name: "id",
        type: "INTEGER",
        not_nullable: true,
        default_value: null,
        is_primary_key: true,
        is_foreign_key: false,
      },
      {
        name: "name",
        type: "TEXT",
        not_nullable: true,
        default_value: null,
        is_primary_key: false,
        is_foreign_key: false,
      },
    ];

    it("should cache and retrieve table details", () => {
      sqliteCache.setTableDetails(mockConfig, "main", "users", mockDetails);
      const cached = sqliteCache.getTableDetails(mockConfig, "main", "users");

      expect(cached).toEqual(mockDetails);
    });

    it("should return null for uncached table details", () => {
      const cached = sqliteCache.getTableDetails(mockConfig, "main", "users");
      expect(cached).toBeNull();
    });

    it("should cache table details per schema and table", () => {
      const usersDetails = [
        {
          name: "id",
          type: "INTEGER",
          not_nullable: true,
          default_value: null,
          is_primary_key: true,
          is_foreign_key: false,
        },
      ];
      const ordersDetails = [
        {
          name: "order_id",
          type: "INTEGER",
          not_nullable: true,
          default_value: null,
          is_primary_key: true,
          is_foreign_key: false,
        },
      ];

      sqliteCache.setTableDetails(mockConfig, "main", "users", usersDetails);
      sqliteCache.setTableDetails(mockConfig, "main", "orders", ordersDetails);

      expect(sqliteCache.getTableDetails(mockConfig, "main", "users")).toEqual(usersDetails);
      expect(sqliteCache.getTableDetails(mockConfig, "main", "orders")).toEqual(ordersDetails);
    });
  });

  describe("Foreign Keys Cache", () => {
    const mockFKs = [
      {
        constraint_name: "fk_orders_person_0",
        source_schema: "main",
        source_table: "orders",
        source_column: "person_id",
        target_schema: "main",
        target_table: "persons",
        target_column: "id",
        update_rule: "NO ACTION",
        delete_rule: "CASCADE",
        ordinal_position: 0,
      },
    ];

    it("should cache and retrieve foreign keys", () => {
      sqliteCache.setForeignKeys(mockConfig, "main", "orders", mockFKs);
      const cached = sqliteCache.getForeignKeys(mockConfig, "main", "orders");

      expect(cached).toEqual(mockFKs);
    });

    it("should return null for uncached foreign keys", () => {
      const cached = sqliteCache.getForeignKeys(mockConfig, "main", "orders");
      expect(cached).toBeNull();
    });
  });

  describe("Indexes Cache", () => {
    const mockIndexes = [
      {
        table_name: "orders",
        index_name: "idx_orders_person",
        column_name: "person_id",
        is_unique: false,
        is_primary: false,
        index_type: "btree",
        ordinal_position: 0,
      },
    ];

    it("should cache and retrieve indexes", () => {
      sqliteCache.setIndexes(mockConfig, "main", "orders", mockIndexes);
      const cached = sqliteCache.getIndexes(mockConfig, "main", "orders");

      expect(cached).toEqual(mockIndexes);
    });

    it("should return null for uncached indexes", () => {
      const cached = sqliteCache.getIndexes(mockConfig, "main", "orders");
      expect(cached).toBeNull();
    });
  });

  describe("Unique Constraints Cache", () => {
    const mockUniques = [
      {
        constraint_name: "sqlite_autoindex_persons_1",
        table_schema: "main",
        table_name: "persons",
        column_name: "email",
        ordinal_position: 0,
      },
    ];

    it("should cache and retrieve unique constraints", () => {
      sqliteCache.setUnique(mockConfig, "main", "persons", mockUniques);
      const cached = sqliteCache.getUnique(mockConfig, "main", "persons");

      expect(cached).toEqual(mockUniques);
    });

    it("should return null for uncached unique constraints", () => {
      const cached = sqliteCache.getUnique(mockConfig, "main", "persons");
      expect(cached).toBeNull();
    });
  });

  describe("Check Constraints Cache", () => {
    const mockChecks = [
      {
        constraint_name: "check_persons_0",
        table_schema: "main",
        table_name: "persons",
        definition: "CHECK(age > 0)",
      },
    ];

    it("should cache and retrieve check constraints", () => {
      sqliteCache.setChecks(mockConfig, "main", "persons", mockChecks);
      const cached = sqliteCache.getChecks(mockConfig, "main", "persons");

      expect(cached).toEqual(mockChecks);
    });

    it("should return null for uncached check constraints", () => {
      const cached = sqliteCache.getChecks(mockConfig, "main", "persons");
      expect(cached).toBeNull();
    });
  });

  describe("Cache Invalidation", () => {
    it("should clear all caches for a specific connection", () => {
      const table = { schema: "main", name: "users", type: "table" };
      const detail = {
        name: "id",
        type: "INTEGER",
        not_nullable: true,
        default_value: null,
        is_primary_key: true,
        is_foreign_key: false,
      };

      // Setup caches
      sqliteCache.setTableList(mockConfig, [table]);
      sqliteCache.setDBStats(mockConfig, {
        total_tables: 5,
        total_db_size_mb: 1.5,
        total_rows: 500,
      });
      sqliteCache.setSchemas(mockConfig, [{ name: "main" }]);
      sqliteCache.setTableDetails(mockConfig, "main", "users", [detail]);
      sqliteCache.setPrimaryKeys(mockConfig, "main", "users", [{ column_name: "id" }]);

      // Setup for other connection
      sqliteCache.setTableList(mockConfig2, [{ schema: "main", name: "products", type: "table" }]);

      // Clear first connection
      sqliteCache.clearForConnection(mockConfig);

      // Verify first connection cleared
      expect(sqliteCache.getTableList(mockConfig)).toBeNull();
      expect(sqliteCache.getDBStats(mockConfig)).toBeNull();
      expect(sqliteCache.getSchemas(mockConfig)).toBeNull();
      expect(sqliteCache.getTableDetails(mockConfig, "main", "users")).toBeNull();
      expect(sqliteCache.getPrimaryKeys(mockConfig, "main", "users")).toBeNull();

      // Verify second connection intact
      expect(sqliteCache.getTableList(mockConfig2)).toEqual([
        { schema: "main", name: "products", type: "table" },
      ]);
    });

    it("should clear table-specific caches", () => {
      const usersDetail = {
        name: "id",
        type: "INTEGER",
        not_nullable: true,
        default_value: null,
        is_primary_key: true,
        is_foreign_key: false,
      };
      const ordersDetail = {
        name: "order_id",
        type: "INTEGER",
        not_nullable: true,
        default_value: null,
        is_primary_key: true,
        is_foreign_key: false,
      };

      // Setup
      sqliteCache.setTableDetails(mockConfig, "main", "users", [usersDetail]);
      sqliteCache.setTableDetails(mockConfig, "main", "orders", [ordersDetail]);
      sqliteCache.setPrimaryKeys(mockConfig, "main", "users", [{ column_name: "id" }]);
      sqliteCache.setPrimaryKeys(mockConfig, "main", "orders", [{ column_name: "order_id" }]);

      // Clear specific table
      sqliteCache.clearTableCache(mockConfig, "main", "users");

      // Verify specific table cleared
      expect(sqliteCache.getTableDetails(mockConfig, "main", "users")).toBeNull();
      expect(sqliteCache.getPrimaryKeys(mockConfig, "main", "users")).toBeNull();

      // Verify other table intact
      expect(sqliteCache.getTableDetails(mockConfig, "main", "orders")).toEqual([ordersDetail]);
      expect(sqliteCache.getPrimaryKeys(mockConfig, "main", "orders")).toEqual([
        { column_name: "order_id" },
      ]);
    });

    it("should clear all caches", () => {
      sqliteCache.setTableList(mockConfig, [{ schema: "main", name: "users", type: "table" }]);
      sqliteCache.setTableList(mockConfig2, [{ schema: "main", name: "products", type: "table" }]);
      sqliteCache.setDBStats(mockConfig, {
        total_tables: 5,
        total_db_size_mb: 1.5,
        total_rows: 500,
      });

      sqliteCache.clearAll();

      expect(sqliteCache.getTableList(mockConfig)).toBeNull();
      expect(sqliteCache.getTableList(mockConfig2)).toBeNull();
      expect(sqliteCache.getDBStats(mockConfig)).toBeNull();
    });
  });

  describe("Cache Statistics", () => {
    it("should return correct cache statistics", () => {
      const table = { schema: "main", name: "users", type: "table" };
      const detail = {
        name: "id",
        type: "INTEGER",
        not_nullable: true,
        default_value: null,
        is_primary_key: true,
        is_foreign_key: false,
      };

      sqliteCache.setTableList(mockConfig, [table]);
      sqliteCache.setTableList(mockConfig, [table], "main");
      sqliteCache.setDBStats(mockConfig, {
        total_tables: 5,
        total_db_size_mb: 1.5,
        total_rows: 500,
      });
      sqliteCache.setSchemas(mockConfig, [{ name: "main" }]);
      sqliteCache.setTableDetails(mockConfig, "main", "users", [detail]);
      sqliteCache.setPrimaryKeys(mockConfig, "main", "users", [{ column_name: "id" }]);

      const stats = sqliteCache.getStats();

      expect(stats.tableLists).toBe(2);
      expect(stats.primaryKeys).toBe(1);
      expect(stats.dbStats).toBe(1);
      expect(stats.schemas).toBe(1);
      expect(stats.tableDetails).toBe(1);
    });

    it("should return zero counts for empty cache", () => {
      const stats = sqliteCache.getStats();

      expect(stats.tableLists).toBe(0);
      expect(stats.primaryKeys).toBe(0);
      expect(stats.dbStats).toBe(0);
      expect(stats.schemas).toBe(0);
      expect(stats.tableDetails).toBe(0);
      expect(stats.foreignKeys).toBe(0);
      expect(stats.indexes).toBe(0);
      expect(stats.unique).toBe(0);
      expect(stats.checks).toBe(0);
    });
  });

  describe("Cache Performance", () => {
    it("should retrieve cached data efficiently", () => {
      const largeDataset = Array.from({ length: 1000 }, (_, i) => ({
        schema: "main",
        name: `table_${i}`,
        type: "table",
      }));

      sqliteCache.setTableList(mockConfig, largeDataset);

      const getStart = performance.now();
      for (let i = 0; i < 100; i++) {
        sqliteCache.getTableList(mockConfig);
      }
      const getTime = performance.now() - getStart;

      expect(getTime).toBeLessThan(1000);
    });

    it("should handle concurrent cache access", async () => {
      const promises = [];

      for (let i = 0; i < 100; i++) {
        promises.push(
          Promise.resolve().then(() => {
            sqliteCache.setDBStats(mockConfig, {
              total_tables: i,
              total_db_size_mb: i * 0.1,
              total_rows: i * 100,
            });
            return sqliteCache.getDBStats(mockConfig);
          }),
        );
      }

      const results = await Promise.all(promises);

      results.forEach((result) => {
        expect(result).toHaveProperty("total_tables");
        expect(result).toHaveProperty("total_db_size_mb");
        expect(result).toHaveProperty("total_rows");
      });
    });
  });
});
