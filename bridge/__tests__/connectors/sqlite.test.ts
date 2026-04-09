import { describe, it, expect, test, jest, beforeAll, afterAll } from "@jest/globals";
import * as sqliteConnector from "../../src/connectors/sqlite";
import { SQLiteConfig } from "../../src/types/sqlite";
import fs from "fs";
import path from "path";
import os from "os";

// Use a temp file for testing (better-sqlite3 needs a real file for some features)
const tmpDir = os.tmpdir();
const testDbPath = path.join(tmpDir, `relwave-test-${Date.now()}.db`);

const validConfig: SQLiteConfig = {
  path: testDbPath,
};

const invalidConfig: SQLiteConfig = {
  path: "/nonexistent/path/to/database.db",
};

const readonlyConfig: SQLiteConfig = {
  path: testDbPath,
  readonly: true,
};

// Seed the test database with tables and data
function seedTestDatabase() {
  const Database = require("better-sqlite3");
  const db = new Database(testDbPath);
  db.exec(`
    CREATE TABLE IF NOT EXISTS persons (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL,
      email TEXT UNIQUE,
      age INTEGER,
      created_at TEXT DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS orders (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      person_id INTEGER NOT NULL,
      product TEXT NOT NULL,
      quantity INTEGER DEFAULT 1,
      price REAL NOT NULL,
      FOREIGN KEY (person_id) REFERENCES persons(id) ON DELETE CASCADE
    );

    CREATE INDEX IF NOT EXISTS idx_orders_person ON orders(person_id);
    CREATE INDEX IF NOT EXISTS idx_persons_email ON persons(email);

    INSERT OR IGNORE INTO persons (id, name, email, age) VALUES
      (1, 'Alice', 'alice@test.com', 30),
      (2, 'Bob', 'bob@test.com', 25),
      (3, 'Charlie', 'charlie@test.com', 35);

    INSERT OR IGNORE INTO orders (id, person_id, product, quantity, price) VALUES
      (1, 1, 'Widget', 2, 9.99),
      (2, 1, 'Gadget', 1, 24.99),
      (3, 2, 'Widget', 5, 9.99);
  `);
  db.close();
}

beforeAll(() => {
  seedTestDatabase();
});

afterAll(() => {
  // Clean up temp database file
  try {
    if (fs.existsSync(testDbPath)) fs.unlinkSync(testDbPath);
    // Also remove WAL/SHM files if present
    if (fs.existsSync(testDbPath + "-wal")) fs.unlinkSync(testDbPath + "-wal");
    if (fs.existsSync(testDbPath + "-shm")) fs.unlinkSync(testDbPath + "-shm");
  } catch {
    // Ignore cleanup errors
  }
});

describe("SQLite Connector", () => {
  jest.setTimeout(10000);

  // ===============================
  // CONNECTION TESTS
  // ===============================
  describe("testConnection", () => {
    test("Should successfully connect to a valid SQLite database", async () => {
      const connection = await sqliteConnector.testConnection(validConfig);
      expect(connection).toStrictEqual({
        ok: true,
        status: "connected",
        message: "Connection successful",
      });
    });

    test("Should fail to connect with invalid path", async () => {
      const connection = await sqliteConnector.testConnection(invalidConfig);
      expect(connection.ok).toBe(false);
      expect(connection.status).toBe("disconnected");
      expect(connection.message).toBeDefined();
    });

    test("Should fail cleanly when SQLite path is a directory", async () => {
      const connection = await sqliteConnector.testConnection({ path: tmpDir });
      expect(connection.ok).toBe(false);
      expect(connection.status).toBe("disconnected");
      expect(connection.message).toContain("directory");
    });
  });

  // ===============================
  // SCHEMA TESTS
  // ===============================
  describe("listSchemas", () => {
    test("Should list schemas (main)", async () => {
      const schemas = await sqliteConnector.listSchemas(validConfig);
      expect(schemas).toEqual([{ name: "main" }]);
    });
  });

  describe("listSchemaNames", () => {
    test("Should return ['main']", async () => {
      const names = await sqliteConnector.listSchemaNames(validConfig);
      expect(names).toEqual(["main"]);
    });
  });

  // ===============================
  // TABLE TESTS
  // ===============================
  describe("listTables", () => {
    test("Should list user tables", async () => {
      const tables = await sqliteConnector.listTables(validConfig, "main");
      expect(tables.length).toBeGreaterThanOrEqual(2);

      const tableNames = tables.map((t) => t.name);
      expect(tableNames).toContain("persons");
      expect(tableNames).toContain("orders");
    });

    test("Should not include sqlite internal tables", async () => {
      const tables = await sqliteConnector.listTables(validConfig, "main");
      const tableNames = tables.map((t) => t.name);
      expect(tableNames.every((n) => !n.startsWith("sqlite_"))).toBe(true);
    });
  });

  // ===============================
  // TABLE DETAILS TESTS
  // ===============================
  describe("getTableDetails", () => {
    test("Should get column details for persons table", async () => {
      const columns = await sqliteConnector.getTableDetails(validConfig, "main", "persons");
      expect(Array.isArray(columns)).toBe(true);
      expect(columns.length).toBeGreaterThan(0);

      const colNames = columns.map((c) => c.name);
      expect(colNames).toContain("id");
      expect(colNames).toContain("name");
      expect(colNames).toContain("email");
      expect(colNames).toContain("age");

      // Check column properties
      const idCol = columns.find((c) => c.name === "id")!;
      expect(idCol.is_primary_key).toBe(true);
      expect(idCol).toHaveProperty("type");
      expect(idCol).toHaveProperty("not_nullable");

      const nameCol = columns.find((c) => c.name === "name")!;
      expect(nameCol.not_nullable).toBe(true);
    });

    test("Should detect foreign key columns", async () => {
      const columns = await sqliteConnector.getTableDetails(validConfig, "main", "orders");
      const personIdCol = columns.find((c) => c.name === "person_id")!;
      expect(personIdCol.is_foreign_key).toBe(true);
    });
  });

  // ===============================
  // PRIMARY KEYS TESTS
  // ===============================
  describe("listPrimaryKeys", () => {
    test("Should get primary keys for persons table", async () => {
      const pks = await sqliteConnector.listPrimaryKeys(validConfig, "main", "persons");
      expect(pks).toEqual([{ column_name: "id" }]);
    });

    test("Should get primary keys for orders table", async () => {
      const pks = await sqliteConnector.listPrimaryKeys(validConfig, "main", "orders");
      expect(pks).toEqual([{ column_name: "id" }]);
    });
  });

  // ===============================
  // FOREIGN KEYS TESTS
  // ===============================
  describe("listForeignKeys", () => {
    test("Should get foreign keys for orders table", async () => {
      const fks = await sqliteConnector.listForeignKeys(validConfig, "main", "orders");
      expect(fks.length).toBe(1);
      expect(fks[0]).toMatchObject({
        source_table: "orders",
        source_column: "person_id",
        target_table: "persons",
        target_column: "id",
        delete_rule: "CASCADE",
      });
    });

    test("Should return empty for table with no foreign keys", async () => {
      const fks = await sqliteConnector.listForeignKeys(validConfig, "main", "persons");
      expect(fks).toEqual([]);
    });
  });

  // ===============================
  // INDEX TESTS
  // ===============================
  describe("listIndexes", () => {
    test("Should list indexes for orders table", async () => {
      const indexes = await sqliteConnector.listIndexes(validConfig, "main", "orders");
      expect(indexes.length).toBeGreaterThan(0);

      const idxNames = indexes.map((i) => i.index_name);
      expect(idxNames).toContain("idx_orders_person");
    });

    test("Should list indexes for persons table", async () => {
      const indexes = await sqliteConnector.listIndexes(validConfig, "main", "persons");
      expect(indexes.length).toBeGreaterThan(0);

      const indexNames = indexes.map((i) => i.index_name);
      expect(indexNames).toContain("idx_persons_email");
    });
  });

  // ===============================
  // UNIQUE CONSTRAINTS TESTS
  // ===============================
  describe("listUniqueConstraints", () => {
    test("Should find unique constraint on persons.email", async () => {
      const uniques = await sqliteConnector.listUniqueConstraints(validConfig, "main", "persons");
      const emailUnique = uniques.find((u) => u.column_name === "email");
      expect(emailUnique).toBeDefined();
      expect(emailUnique!.table_name).toBe("persons");
    });

    test("Should return empty for table with no unique constraints", async () => {
      const uniques = await sqliteConnector.listUniqueConstraints(validConfig, "main", "orders");
      expect(uniques).toEqual([]);
    });
  });

  // ===============================
  // DB STATS TESTS
  // ===============================
  describe("getDBStats", () => {
    test("Should return database statistics", async () => {
      const stats = await sqliteConnector.getDBStats(validConfig);
      expect(stats).toHaveProperty("total_tables");
      expect(stats).toHaveProperty("total_db_size_mb");
      expect(stats).toHaveProperty("total_rows");
      expect(stats.total_tables).toBeGreaterThanOrEqual(2);
      expect(stats.total_rows).toBeGreaterThan(0);
    });
  });

  // ===============================
  // SCHEMA METADATA BATCH TESTS
  // ===============================
  describe("getSchemaMetadataBatch", () => {
    test("Should get batch metadata for all tables", async () => {
      const batch = await sqliteConnector.getSchemaMetadataBatch(validConfig, "main");
      expect(batch.tables).toBeInstanceOf(Map);
      expect(batch.tables.has("persons")).toBe(true);
      expect(batch.tables.has("orders")).toBe(true);

      const persons = batch.tables.get("persons")!;
      expect(persons.columns.length).toBeGreaterThan(0);
      expect(persons.primaryKeys.length).toBe(1);
      expect(persons.primaryKeys[0].column_name).toBe("id");

      const orders = batch.tables.get("orders")!;
      expect(orders.foreignKeys.length).toBe(1);
      expect(orders.foreignKeys[0].target_table).toBe("persons");
    });
  });

  // ===============================
  // FETCH TABLE DATA TESTS
  // ===============================
  describe("fetchTableData", () => {
    test("Should fetch paginated data from persons table", async () => {
      const result = await sqliteConnector.fetchTableData(validConfig, "main", "persons", 10, 1);
      expect(result.rows.length).toBeGreaterThan(0);
      expect(result.total).toBe(3);
      expect(result.rows[0]).toHaveProperty("id");
      expect(result.rows[0]).toHaveProperty("name");
    });

    test("Should support pagination", async () => {
      const page1 = await sqliteConnector.fetchTableData(validConfig, "main", "persons", 2, 1);
      const page2 = await sqliteConnector.fetchTableData(validConfig, "main", "persons", 2, 2);

      expect(page1.rows.length).toBe(2);
      expect(page2.rows.length).toBe(1);
      expect(page1.total).toBe(3);
    });
  });

  // ===============================
  // STREAM QUERY TESTS
  // ===============================
  describe("streamQueryCancelable", () => {
    test("Should stream query results", async () => {
      const rows: any[] = [];
      let doneCalled = false;

      const { promise } = sqliteConnector.streamQueryCancelable(
        validConfig,
        "SELECT * FROM persons;",
        100,
        (batch, columns) => {
          rows.push(...batch);
        },
        () => {
          doneCalled = true;
        }
      );

      await promise;

      expect(doneCalled).toBe(true);
      expect(rows.length).toBe(3);
      expect(Object.keys(rows[0]).length).toBeGreaterThan(0);
    });

    test("Should respect batch size", async () => {
      let batchCount = 0;

      const { promise } = sqliteConnector.streamQueryCancelable(
        validConfig,
        "SELECT * FROM persons;",
        1, // Batch size of 1
        (batch) => {
          batchCount++;
          expect(batch.length).toBeLessThanOrEqual(1);
        }
      );

      await promise;
      expect(batchCount).toBe(3);
    });

    test("Should cancel a query", async () => {
      const rows: any[] = [];

      const { promise, cancel } = sqliteConnector.streamQueryCancelable(
        validConfig,
        "SELECT * FROM persons;",
        1,
        (batch) => {
          rows.push(...batch);
        }
      );

      // Cancel immediately
      await cancel();
      await promise;

      // Should have 0 or fewer rows than total
      expect(rows.length).toBeLessThanOrEqual(3);
    });
  });

  // ===============================
  // CRUD OPERATIONS TESTS
  // ===============================
  describe("insertRow", () => {
    test("Should insert a row and return it", async () => {
      const inserted = await sqliteConnector.insertRow(validConfig, "main", "persons", {
        name: "Dave",
        email: "dave@test.com",
        age: 40,
      });

      expect(inserted).toHaveProperty("id");
      expect(inserted.name).toBe("Dave");
      expect(inserted.email).toBe("dave@test.com");
    });

    test("Should throw on empty data", async () => {
      await expect(
        sqliteConnector.insertRow(validConfig, "main", "persons", {})
      ).rejects.toThrow("No data provided for insert");
    });
  });

  describe("updateRow", () => {
    test("Should update a row and return it", async () => {
      const updated = await sqliteConnector.updateRow(
        validConfig,
        "main",
        "persons",
        "id",
        1,
        { name: "Alice Updated" }
      );

      expect(updated.name).toBe("Alice Updated");
      expect(updated.id).toBe(1);
    });

    test("Should throw on empty update data", async () => {
      await expect(
        sqliteConnector.updateRow(validConfig, "main", "persons", "id", 1, {})
      ).rejects.toThrow("No data provided for update");
    });
  });

  describe("deleteRow", () => {
    test("Should delete a row", async () => {
      // Insert then delete
      const inserted = await sqliteConnector.insertRow(validConfig, "main", "persons", {
        name: "ToDelete",
        email: "todelete@test.com",
        age: 99,
      });

      const result = await sqliteConnector.deleteRow(
        validConfig,
        "main",
        "persons",
        "id",
        inserted.id
      );

      expect(result).toBe(true);
    });

    test("Should return false when no row matches", async () => {
      const result = await sqliteConnector.deleteRow(
        validConfig,
        "main",
        "persons",
        "id",
        999999
      );

      expect(result).toBe(false);
    });
  });

  // ===============================
  // SEARCH TESTS
  // ===============================
  describe("searchTable", () => {
    test("Should search across all columns", async () => {
      const result = await sqliteConnector.searchTable(
        validConfig,
        "main",
        "persons",
        "Bob"
      );

      expect(result.rows.length).toBeGreaterThan(0);
      expect(result.total).toBeGreaterThan(0);
    });

    test("Should search in a specific column", async () => {
      const result = await sqliteConnector.searchTable(
        validConfig,
        "main",
        "persons",
        "bob@test.com",
        "email"
      );

      expect(result.rows.length).toBe(1);
      expect(result.rows[0].email).toBe("bob@test.com");
    });

    test("Should return empty for no matches", async () => {
      const result = await sqliteConnector.searchTable(
        validConfig,
        "main",
        "persons",
        "nonexistent_value_xyz"
      );

      expect(result.rows).toEqual([]);
      expect(result.total).toBe(0);
    });
  });

  // ===============================
  // DDL OPERATIONS TESTS
  // ===============================
  describe("createTable", () => {
    test("Should create a new table", async () => {
      const result = await sqliteConnector.createTable(
        validConfig,
        "main",
        "test_create_table",
        [
          { name: "id", type: "INTEGER", not_nullable: true, is_primary_key: true, is_foreign_key: false, default_value: null },
          { name: "value", type: "TEXT", not_nullable: false, is_primary_key: false, is_foreign_key: false, default_value: null },
        ]
      );

      expect(result).toBe(true);

      // Verify table exists
      const tables = await sqliteConnector.listTables(validConfig, "main");
      expect(tables.map((t) => t.name)).toContain("test_create_table");
    });

    afterAll(async () => {
      await sqliteConnector.dropTable(validConfig, "main", "test_create_table");
    });
  });

  describe("alterTable", () => {
    test("Should add a column to a table", async () => {
      // Create a temp table first
      await sqliteConnector.createTable(validConfig, "main", "test_alter", [
        { name: "id", type: "INTEGER", not_nullable: true, is_primary_key: true, is_foreign_key: false, default_value: null },
      ]);

      const result = await sqliteConnector.alterTable(validConfig, "main", "test_alter", [
        { type: "ADD_COLUMN", column: { name: "new_col", type: "TEXT", not_nullable: false, is_primary_key: false, is_foreign_key: false, default_value: null } },
      ]);

      expect(result).toBe(true);

      // Verify column exists
      const columns = await sqliteConnector.getTableDetails(validConfig, "main", "test_alter");
      expect(columns.map((c) => c.name)).toContain("new_col");
    });

    test("Should rename a column", async () => {
      const result = await sqliteConnector.alterTable(validConfig, "main", "test_alter", [
        { type: "RENAME_COLUMN", from: "new_col", to: "renamed_col" },
      ]);

      expect(result).toBe(true);

      const columns = await sqliteConnector.getTableDetails(validConfig, "main", "test_alter");
      expect(columns.map((c) => c.name)).toContain("renamed_col");
      expect(columns.map((c) => c.name)).not.toContain("new_col");
    });

    afterAll(async () => {
      await sqliteConnector.dropTable(validConfig, "main", "test_alter");
    });
  });

  describe("dropTable", () => {
    test("Should drop a table", async () => {
      await sqliteConnector.createTable(validConfig, "main", "test_drop", [
        { name: "id", type: "INTEGER", not_nullable: true, is_primary_key: true, is_foreign_key: false, default_value: null },
      ]);

      const result = await sqliteConnector.dropTable(validConfig, "main", "test_drop");
      expect(result).toBe(true);

      const tables = await sqliteConnector.listTables(validConfig, "main");
      expect(tables.map((t) => t.name)).not.toContain("test_drop");
    });
  });

  describe("createIndexes", () => {
    test("Should create indexes on a table", async () => {
      await sqliteConnector.createTable(validConfig, "main", "test_indexes", [
        { name: "id", type: "INTEGER", not_nullable: true, is_primary_key: true, is_foreign_key: false, default_value: null },
        { name: "value", type: "TEXT", not_nullable: false, is_primary_key: false, is_foreign_key: false, default_value: null },
      ]);

      const result = await sqliteConnector.createIndexes(validConfig, "main", [
        {
          table_name: "test_indexes",
          index_name: "idx_test_value",
          column_name: "value",
          is_unique: false,
          is_primary: false,
          index_type: "btree",
          ordinal_position: 0,
        },
      ]);

      expect(result).toBe(true);

      const indexes = await sqliteConnector.listIndexes(validConfig, "main", "test_indexes");
      expect(indexes.map((i) => i.index_name)).toContain("idx_test_value");
    });

    afterAll(async () => {
      await sqliteConnector.dropTable(validConfig, "main", "test_indexes");
    });
  });

  // ===============================
  // READONLY TESTS  
  // ===============================
  describe("readonly mode", () => {
    test("Should open in readonly mode and allow reads", async () => {
      const connection = await sqliteConnector.testConnection(readonlyConfig);
      expect(connection.ok).toBe(true);
    });
  });
});
