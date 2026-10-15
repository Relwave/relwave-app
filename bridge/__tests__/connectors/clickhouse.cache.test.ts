import { clickhouseCache } from "../../src/connectors/clickhouse";
import { describe, it, expect, beforeEach } from "@jest/globals";
import { ClickHouseConfig } from "../../src/types/clickhouse";

const mockConnection: ClickHouseConfig = {
  host: "localhost",
  port: 8123,
  user: "testuser",
  password: "testpass",
  database: "testdb",
};

const mockConnection2: ClickHouseConfig = {
  host: "localhost",
  port: 8123,
  user: "testuser",
  password: "testpass",
  database: "otherdb",
};

describe("ClickhouseCacheManager", () => {
  beforeEach(() => {
    clickhouseCache.clearAll();
  });

  describe("Connection Key Generation & Isolation", () => {
    it("should generate consistent keys and isolate different databases", () => {
      const tables1 = [{ schema: "testdb", name: "users", type: "BASE TABLE" }];
      const tables2 = [{ schema: "otherdb", name: "orders", type: "BASE TABLE" }];

      clickhouseCache.setTableList(mockConnection, tables1, "testdb");
      clickhouseCache.setTableList(mockConnection2, tables2, "otherdb");

      expect(clickhouseCache.getTableList(mockConnection, "testdb")).toEqual(tables1);
      expect(clickhouseCache.getTableList(mockConnection2, "otherdb")).toEqual(tables2);
    });
  });

  describe("Table List Cache", () => {
    const mockTables = [
      { schema: "testdb", name: "users", type: "BASE TABLE" },
      { schema: "testdb", name: "orders", type: "BASE TABLE" },
    ];

    it("should cache and retrieve table list", () => {
      clickhouseCache.setTableList(mockConnection, mockTables, "testdb");
      const cached = clickhouseCache.getTableList(mockConnection, "testdb");
      expect(cached).toEqual(mockTables);
    });

    it("should return null for non-existent cache entry", () => {
      const cached = clickhouseCache.getTableList(mockConnection, "nonexistent");
      expect(cached).toBeNull();
    });
  });

  describe("Table Details Cache", () => {
    const mockColumns = [
      {
        name: "id",
        type: "UInt64",
        not_nullable: true,
        default_value: null,
        is_primary_key: true,
        is_foreign_key: false,
        comment: null,
      },
      {
        name: "email",
        type: "String",
        not_nullable: true,
        default_value: null,
        is_primary_key: false,
        is_foreign_key: false,
        comment: null,
      },
    ];

    it("should cache and retrieve table details", () => {
      clickhouseCache.setTableDetails(mockConnection, "testdb", "users", mockColumns);
      const cached = clickhouseCache.getTableDetails(mockConnection, "testdb", "users");
      expect(cached).toEqual(mockColumns);
    });

    it("should clear specific table cache", () => {
      clickhouseCache.setTableDetails(mockConnection, "testdb", "users", mockColumns);
      clickhouseCache.clearTableCache(mockConnection, "testdb", "users");
      expect(clickhouseCache.getTableDetails(mockConnection, "testdb", "users")).toBeNull();
    });
  });

  describe("DB Stats Cache", () => {
    const mockStats = {
      total_tables: 3,
      total_rows: 1000,
      total_db_size_mb: 2.5,
    };

    it("should cache and retrieve db stats", () => {
      clickhouseCache.setDBStats(mockConnection, mockStats);
      const cached = clickhouseCache.getDBStats(mockConnection);
      expect(cached).toEqual(mockStats);
    });
  });

  describe("Clear for Connection and Clear All", () => {
    it("should clear only the target connection cache", () => {
      const tables1 = [{ schema: "testdb", name: "users", type: "BASE TABLE" }];
      const tables2 = [{ schema: "otherdb", name: "orders", type: "BASE TABLE" }];

      clickhouseCache.setTableList(mockConnection, tables1, "testdb");
      clickhouseCache.setTableList(mockConnection2, tables2, "otherdb");

      clickhouseCache.clearForConnection(mockConnection);

      expect(clickhouseCache.getTableList(mockConnection, "testdb")).toBeNull();
      expect(clickhouseCache.getTableList(mockConnection2, "otherdb")).toEqual(tables2);
    });

    it("should clear all caches on clearAll", () => {
      clickhouseCache.setTableList(mockConnection, [{ schema: "testdb", name: "users", type: "BASE TABLE" }], "testdb");
      clickhouseCache.clearAll();
      expect(clickhouseCache.getTableList(mockConnection, "testdb")).toBeNull();
    });
  });
});
