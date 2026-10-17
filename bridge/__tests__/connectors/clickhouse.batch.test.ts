import { describe, expect, it, jest, beforeEach } from "@jest/globals";

const mockQuery = jest.fn<any>();
const mockCommand = jest.fn<any>();
const mockInsert = jest.fn<any>();
const mockClose = jest.fn<any>();

jest.mock("@clickhouse/client", () => ({
  createClient: jest.fn(() => ({
    query: mockQuery,
    command: mockCommand,
    insert: mockInsert,
    close: mockClose,
  })),
}));

import * as clickhouseConnector from "../../src/connectors/clickhouse";

const mockConfig: clickhouseConnector.ClickHouseConfig = {
  host: "localhost",
  port: 8123,
  user: "default",
  password: "",
  database: "testdb",
};

describe("ClickHouse getSchemaMetadataBatch unit tests", () => {
  beforeEach(async () => {
    clickhouseConnector.clickhouseCache.clearAll();
    await clickhouseConnector.closeAllClients();
    mockQuery.mockReset();
    mockCommand.mockReset();
    mockInsert.mockReset();
    mockClose.mockReset();
  });

  it("should assemble batch metadata correctly when batch queries succeed", async () => {
    mockQuery.mockImplementation(async ({ query }: any) => {
      const q = String(query);

      // listTables query
      if (q.includes("FROM system.tables")) {
        return {
          json: async () => [
            { schema: "testdb", name: "users", type: "BASE TABLE" },
            { schema: "testdb", name: "orders", type: "BASE TABLE" },
            { schema: "testdb", name: "products", type: "BASE TABLE" },
          ],
        };
      }

      // Batch columns query
      if (q.includes("FROM system.columns") && !q.includes("is_in_primary_key = 1")) {
        return {
          json: async () => [
            {
              table: "users",
              name: "id",
              type: "UInt64",
              not_nullable: 1,
              default_value: null,
              is_in_primary_key: 1,
              is_in_sorting_key: 1,
              comment: "User ID",
            },
            {
              table: "users",
              name: "email",
              type: "String",
              not_nullable: 1,
              default_value: null,
              is_primary_key: 0,
              is_in_sorting_key: 0,
              comment: null,
            },
            {
              table: "orders",
              name: "id",
              type: "UInt64",
              not_nullable: 1,
              default_value: null,
              is_in_primary_key: 1,
              is_in_sorting_key: 1,
              comment: null,
            },
            {
              table: "products",
              name: "id",
              type: "UInt64",
              not_nullable: 1,
              default_value: null,
              is_in_primary_key: 1,
              is_in_sorting_key: 1,
              comment: null,
            },
          ],
        };
      }

      // Batch primary keys query
      if (q.includes("is_in_primary_key = 1")) {
        return {
          json: async () => [
            { table: "users", column_name: "id" },
            { table: "orders", column_name: "id" },
            { table: "products", column_name: "id" },
          ],
        };
      }

      // Batch indexes query
      if (q.includes("system.data_skipping_indices")) {
        return {
          json: async () => [
            {
              table: "orders",
              index_name: "idx_orders_created",
              column_name: "created_at",
              index_type: "minmax",
            },
          ],
        };
      }

      return { json: async () => [] };
    });

    const result = await clickhouseConnector.getSchemaMetadataBatch(mockConfig, "testdb");
    expect(result.tables instanceof Map).toBe(true);
    expect(result.tables.size).toBe(3);

    const userTable = result.tables.get("users");
    expect(userTable).toBeDefined();
    expect(userTable!.columns).toHaveLength(2);
    expect(userTable!.columns[0].name).toBe("id");
    expect(userTable!.columns[0].is_primary_key).toBe(true);
    expect(userTable!.primaryKeys).toHaveLength(1);
    expect(userTable!.primaryKeys[0].column_name).toBe("id");

    const orderTable = result.tables.get("orders");
    expect(orderTable).toBeDefined();
    expect(orderTable!.indexes).toHaveLength(1);
    expect(orderTable!.indexes[0].index_name).toBe("idx_orders_created");
  });

  it("should handle backticked `table` key name in batch query results", async () => {
    mockQuery.mockImplementation(async ({ query }: any) => {
      const q = String(query);

      if (q.includes("FROM system.tables")) {
        return {
          json: async () => [{ schema: "testdb", name: "users", type: "BASE TABLE" }],
        };
      }

      if (q.includes("FROM system.columns") && !q.includes("is_in_primary_key = 1")) {
        return {
          json: async () => [
            {
              "`table`": "users",
              name: "id",
              type: "UInt64",
              not_nullable: 1,
              default_value: null,
              is_in_primary_key: 1,
              is_in_sorting_key: 1,
            },
          ],
        };
      }

      if (q.includes("is_in_primary_key = 1")) {
        return {
          json: async () => [{ "`table`": "users", column_name: "id" }],
        };
      }

      return { json: async () => [] };
    });

    const result = await clickhouseConnector.getSchemaMetadataBatch(mockConfig, "testdb");
    expect(result.tables.size).toBe(1);
    const userTable = result.tables.get("users");
    expect(userTable).toBeDefined();
    expect(userTable!.columns).toHaveLength(1);
    expect(userTable!.primaryKeys).toHaveLength(1);
  });

  it("should fallback to per-table lookups if batch queries fail", async () => {
    mockQuery.mockImplementation(async ({ query }: any) => {
      const q = String(query);

      // listTables query
      if (q.includes("FROM system.tables")) {
        return {
          json: async () => [
            { schema: "testdb", name: "student", type: "BASE TABLE" },
            { schema: "testdb", name: "persons", type: "BASE TABLE" },
            { schema: "testdb", name: "TestTable", type: "BASE TABLE" },
          ],
        };
      }

      // Batch queries fail
      if (q.includes("ORDER BY `table`")) {
        throw new Error("Batch query failed");
      }

      // Fallback single table column queries:
      if (
        q.includes("WHERE database = {target_schema: String} AND `table` = {target_table: String}")
      ) {
        return {
          json: async () => [
            {
              name: "id",
              type: "UInt32",
              not_nullable: 1,
              default_value: null,
              is_in_primary_key: 1,
              is_in_sorting_key: 1,
              comment: null,
            },
            {
              name: "name",
              type: "String",
              not_nullable: 1,
              default_value: null,
              is_in_primary_key: 0,
              is_in_sorting_key: 0,
              comment: null,
            },
          ],
        };
      }

      // Fallback single table PK queries:
      if (q.includes("is_in_primary_key = 1 OR is_in_sorting_key = 1")) {
        return {
          json: async () => [{ column_name: "id" }],
        };
      }

      return { json: async () => [] };
    });

    const result = await clickhouseConnector.getSchemaMetadataBatch(mockConfig, "testdb");
    expect(result.tables.size).toBe(3);
    expect(result.tables.has("student")).toBe(true);
    expect(result.tables.has("persons")).toBe(true);
    expect(result.tables.has("TestTable")).toBe(true);

    const studentMeta = result.tables.get("student");
    expect(studentMeta).toBeDefined();
    expect(studentMeta!.columns).toHaveLength(2);
    expect(studentMeta!.primaryKeys[0].column_name).toBe("id");
  });

  it("should filter tables when array of table names is passed", async () => {
    mockQuery.mockImplementation(async ({ query }: any) => {
      const q = String(query);

      if (q.includes("FROM system.tables")) {
        return {
          json: async () => [
            { schema: "testdb", name: "student", type: "BASE TABLE" },
            { schema: "testdb", name: "persons", type: "BASE TABLE" },
            { schema: "testdb", name: "TestTable", type: "BASE TABLE" },
          ],
        };
      }

      if (q.includes("FROM system.columns") && !q.includes("is_in_primary_key = 1")) {
        return {
          json: async () => [
            { table: "student", name: "id", type: "UInt32", not_nullable: 1, is_in_primary_key: 1 },
            { table: "persons", name: "id", type: "UInt32", not_nullable: 1, is_in_primary_key: 1 },
            {
              table: "TestTable",
              name: "id",
              type: "UInt32",
              not_nullable: 1,
              is_in_primary_key: 1,
            },
          ],
        };
      }

      if (q.includes("is_in_primary_key = 1")) {
        return {
          json: async () => [
            { table: "student", column_name: "id" },
            { table: "persons", column_name: "id" },
            { table: "TestTable", column_name: "id" },
          ],
        };
      }

      return { json: async () => [] };
    });

    const result = await clickhouseConnector.getSchemaMetadataBatch(mockConfig, ["student"]);
    expect(result.tables.size).toBe(1);
    expect(result.tables.has("student")).toBe(true);
    expect(result.tables.has("persons")).toBe(false);
  });
});
