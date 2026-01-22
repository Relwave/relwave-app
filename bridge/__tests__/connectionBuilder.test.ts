// __tests__/ConnectionBuilder.test.ts
import { describe, it, expect, test } from "@jest/globals";
import { ConnectionBuilder } from "../src/services/connectionBuilder"; // Adjust path as needed
import { DatabaseConfig, DBType } from "../src/types";

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
    test("should correctly build Postgres config with explicit port and password", () => {
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
      const config = ConnectionBuilder.buildConnection(
        dbInput,
        password,
        DBType.POSTGRES
      );

      // Assert
      expect(config).toEqual(expected);
    });

    // Test Case 2: MySQL with missing port (uses default 3306) and null password
    test("should use default port 3306 for MySQL when port is missing and set password to undefined", () => {
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
      const config = ConnectionBuilder.buildConnection(
        dbInput,
        password,
        DBType.MYSQL
      );

      // Assert
      expect(config).toEqual(expected);
    });

    // Test Case 3: PostgreSQL with null port (uses default 5432) and undefined password
    test("should use default port 5432 for Postgres when port is null and handle undefined password", () => {
      // Arrange
      const dbInput = { ...mockDbInput, port: null }; // Test null port
      const password: string | null = null; // FIX: Changed undefined to null
      const expected: DatabaseConfig = {
        host: "localhost",
        port: 5432, // Default Postgres port
        user: "testuser",
        password: undefined,
        ssl: true,
        database: "testdb",
      };

      // Act
      const config = ConnectionBuilder.buildConnection(
        dbInput,
        password,
        DBType.POSTGRES
      );

      // Assert
      expect(config).toEqual(expected);
    });

    // Test Case 4: Zero port should be used if explicitly set (even though unlikely in DB context)
    test("should use explicit zero port if provided", () => {
      // Arrange
      const dbInput = { ...mockDbInput, port: 0 };
      const password = "any_pwd";

      // Act
      const config = ConnectionBuilder.buildConnection(
        dbInput,
        password,
        DBType.MYSQL
      );

      // Assert
      expect(config.port).toBe(3306);
    });
  });

  // --- Helper Method Tests ---

  describe("static buildPostgresConnection", () => {
    // Test Case 5: Ensure buildPostgresConnection calls buildConnection correctly
    test("should delegate to buildConnection with DBType.POSTGRES and use default port", () => {
      // Act
      const config = ConnectionBuilder.buildPostgresConnection(
        mockDbInput,
        "test"
      );

      // Assert
      expect(config.port).toBe(5432);
      expect(config.password).toBe("test");
    });
  });

  describe("static buildMySQLConnection", () => {
    // Test Case 6: Ensure buildMySQLConnection calls buildConnection correctly
    test("should delegate to buildConnection with DBType.MYSQL and use default port", () => {
      // Act
      const config = ConnectionBuilder.buildMySQLConnection(
        mockDbInput,
        "test"
      );

      // Assert
      expect(config.port).toBe(3306);
      expect(config.password).toBe("test");
    });
  });

  describe("static buildMariaDBConnection", () => {
    test("should delegate to buildConnection with DBType.MariaDB and use default port", () => {
      const config = ConnectionBuilder.buildMariaDBConnection(mockDbInput, "test");
      expect(config.port).toBe(5432);
      expect(config.password).toBe("test");
    })
  })
});
