// __tests__/ConnectionBuilder.test.ts
import { describe, it, expect, test } from "@jest/globals";
import { ConnectionBuilder, BuildResult } from "../src/services/connectionBuilder"; // Adjust path as needed
import { DatabaseConfig, DBType } from "../src/types";
import { SQLiteConfig } from "../src/types/sqlite";

// Define a standardized mock database object for inputs
const mockDbInput = {
  host: "localhost",
  user: "testuser",
  database: "testdb",
  ssl: true,
  // Note: 'port' will be deliberately excluded or set to null/undefined in specific tests
};

describe("ConnectionBuilder", () => {
  // --- Core Logic Test: buildConnection ---
  describe("static buildConnection", () => {
    // Test Case 1: PostgreSQL with explicit port and password
    test("should correctly build Postgres config with explicit port and password", async () => {
      // Arrange
      const dbInput = { ...mockDbInput, port: 5433 };
      const password = "testpwd";
      const expected: DatabaseConfig = {
        host: "localhost",
        port: 5433,
        user: "testuser",
        password: "testpwd",
        ssl: true,
        database: "testdb",
      };

      // Act
      const { config } = await ConnectionBuilder.buildConnection(
        dbInput,
        password,
        DBType.POSTGRES
      );

      // Assert
      expect(config).toEqual(expected);
    });

    // Test Case 2: MySQL with missing port (uses default 3306) and null password
    test("should use default port 3306 for MySQL when port is missing and set password to undefined", async () => {
      // Arrange
      const dbInput = { ...mockDbInput, port: undefined };
      const password = null;
      const expected: DatabaseConfig = {
        host: "localhost",
        port: 3306, // Default MySQL port
        user: "testuser",
        password: undefined, // Must be undefined, not null
        ssl: true,
        database: "testdb",
      };

      // Act
      const { config } = await ConnectionBuilder.buildConnection(
        dbInput,
        password,
        DBType.MYSQL
      );

      // Assert
      expect(config).toEqual(expected);
    });

    // Test Case 3: PostgreSQL with null port (uses default 5432) and undefined password
    test("should use default port 5432 for Postgres when port is null and handle undefined password", async () => {
      // Arrange
      const dbInput = { ...mockDbInput, port: null }; // Test null port
      const password: string | null = null;
      const expected: DatabaseConfig = {
        host: "localhost",
        port: 5432, // Default Postgres port
        user: "testuser",
        password: undefined,
        ssl: true,
        database: "testdb",
      };

      // Act
      const { config } = await ConnectionBuilder.buildConnection(
        dbInput,
        password,
        DBType.POSTGRES
      );

      // Assert
      expect(config).toEqual(expected);
    });

    // Test Case 4: Zero port falls back to default (falsy => uses default)
    test("should use default port when zero port is provided (falsy)", async () => {
      // Arrange
      const dbInput = { ...mockDbInput, port: 0 };
      const password = "any_pwd";

      // Act
      const { config } = await ConnectionBuilder.buildConnection(
        dbInput,
        password,
        DBType.MYSQL
      );

      // Assert
      expect((config as DatabaseConfig).port).toBe(3306);
    });
  });

  // --- Helper Method Tests ---

  describe("static buildPostgresConnection", () => {
    // Test Case 5: Ensure buildPostgresConnection calls buildConnection correctly
    test("should delegate to buildConnection with DBType.POSTGRES and use default port", async () => {
      // Act
      const { config } = await ConnectionBuilder.buildPostgresConnection(
        mockDbInput,
        "test"
      );

      // Assert
      expect((config as DatabaseConfig).port).toBe(5432);
      expect((config as DatabaseConfig).password).toBe("test");
    });
  });

  describe("static buildMySQLConnection", () => {
    // Test Case 6: Ensure buildMySQLConnection calls buildConnection correctly
    test("should delegate to buildConnection with DBType.MYSQL and use default port", async () => {
      // Act
      const { config } = await ConnectionBuilder.buildMySQLConnection(
        mockDbInput,
        "test"
      );

      // Assert
      expect((config as DatabaseConfig).port).toBe(3306);
      expect((config as DatabaseConfig).password).toBe("test");
    });
  });

  describe("static buildMariaDBConnection", () => {
    test("should delegate to buildConnection with DBType.MariaDB and use default port 3306", async () => {
      const { config } = await ConnectionBuilder.buildMariaDBConnection(mockDbInput, "test");
      expect((config as DatabaseConfig).port).toBe(3306);
      expect((config as DatabaseConfig).password).toBe("test");
    });
  });

  describe("static buildSQLiteConnection", () => {
    test("should build SQLite config with path from database field", async () => {
      const dbInput = { database: "/tmp/test.db" };
      const { config } = await ConnectionBuilder.buildSQLiteConnection(dbInput);
      expect((config as SQLiteConfig).path).toBe("/tmp/test.db");
    });

    test("should normalize SQLite URLs with Windows drive letters", async () => {
      const dbInput = { database: "sqlite:///C:/Users/me/test.db" };
      const { config } = await ConnectionBuilder.buildSQLiteConnection(dbInput);
      expect((config as SQLiteConfig).path).toBe("C:/Users/me/test.db");
    });

    test("should normalize SQLite file URLs with Windows drive letters", async () => {
      const dbInput = { path: "file:///C:/Users/me/test.db" };
      const { config } = await ConnectionBuilder.buildSQLiteConnection(dbInput);
      expect((config as SQLiteConfig).path).toBe("C:/Users/me/test.db");
    });

    test("should build SQLite config with path from path field", async () => {
      const dbInput = { path: "/tmp/test.db" };
      const { config } = await ConnectionBuilder.buildSQLiteConnection(dbInput);
      expect((config as SQLiteConfig).path).toBe("/tmp/test.db");
    });

    test("should set readonly when specified", async () => {
      const dbInput = { database: "/tmp/test.db", readonly: true };
      const { config } = await ConnectionBuilder.buildSQLiteConnection(dbInput);
      expect((config as SQLiteConfig).readonly).toBe(true);
    });

    test("should reject Windows drive roots for SQLite", async () => {
      const dbInput = { database: "D:/" };
      await expect(ConnectionBuilder.buildSQLiteConnection(dbInput)).rejects.toThrow(
        'Invalid SQLite path "D:/"'
      );
    });

    test("buildConnection with DBType.SQLITE should return SQLiteConfig", async () => {
      const dbInput = { database: "/tmp/test.db" };
      const { config } = await ConnectionBuilder.buildConnection(dbInput, null, DBType.SQLITE);
      expect((config as SQLiteConfig).path).toBe("/tmp/test.db");
    });
  });
});
