import { afterAll, describe, expect, test } from "@jest/globals";
import fs from "fs/promises";
import fsSync from "fs";
import os from "os";
import path from "path";

const TEST_RELWAVE_HOME = path.join(os.tmpdir(), `database-service-test-${Date.now()}`);
process.env.RELWAVE_HOME = TEST_RELWAVE_HOME;

// eslint-disable-next-line @typescript-eslint/no-var-requires
const { DatabaseService } = require("../src/services/databaseService");

const mockInput = {
  name: "TestDB",
  host: "localhost",
  port: 5432,
  user: "testuser",
  database: "testdb",
  type: "POSTGRES",
  ssl: true,
};

// Test database names that should be cleaned up
const TEST_DB_NAMES = ["TestDB", "DeleteTestDB"];

// Track all created database IDs for cleanup
const createdDbIds: string[] = [];

describe("Database Service Method", () => {
  const dbService = new DatabaseService();

  // Clean up ALL test databases after all tests complete
  afterAll(async () => {
    // First, clean up databases we explicitly tracked
    for (const id of createdDbIds) {
      try {
        await dbService.deleteDatabase(id);
      } catch (e) {
        // Ignore - may already be deleted
      }
    }

    // Then, clean up any remaining test databases by name (safety net)
    try {
      const dbs = await dbService.listDatabases();
      for (const db of dbs) {
        if (TEST_DB_NAMES.includes(db.name)) {
          try {
            await dbService.deleteDatabase(db.id);
          } catch (e) {
            // Ignore deletion errors during cleanup
          }
        }
      }
    } catch (e) {
      // Ignore errors during final cleanup
    }

    if (fsSync.existsSync(TEST_RELWAVE_HOME)) {
      await fs.rm(TEST_RELWAVE_HOME, { recursive: true, force: true });
    }
  });

  // Test Case 1: All required fields provided
  test("should add database when all required fields are provided", async () => {
    // Arrange
    const payload = { ...mockInput };
    // Act
    const result = await dbService.addDatabase(payload);
    createdDbIds.push(result.id); // Track for cleanup
    // Assert
    expect(result).toBeDefined();
    expect(result.name).toBe(payload.name);
  });

  test("should normalize SQLite database paths when adding a database", async () => {
    const payload = {
      name: "SQLiteTestDB",
      host: "",
      port: 0,
      user: "",
      database: "sqlite:///C:/Users/test/relwave.db",
      type: "sqlite",
    };

    const result = await dbService.addDatabase(payload);
    createdDbIds.push(result.id);

    expect(result.database).toBe("C:/Users/test/relwave.db");
  });

  test("should reject Windows drive roots for SQLite databases", async () => {
    const payload = {
      name: "SQLiteDriveRootDB",
      host: "",
      port: 0,
      user: "",
      database: "D:/",
      type: "sqlite",
    };

    await expect(dbService.addDatabase(payload)).rejects.toThrow('Invalid SQLite path "D:/"');
  });

  // Test Case 2: Missing required field 'host'

  test("should throw error when required field 'host' is missing", async () => {
    // Arrange
    const { host, ...payload } = mockInput;
    // Act & Assert
    await expect(dbService.addDatabase(payload)).rejects.toThrow(
      "Missing required field: host"
    );
  });

  // Test Case 3: Missing required field 'user'
  test("should throw error when required field 'user' is missing", async () => {
    // Arrange
    const { user, ...payload } = mockInput;
    // Act & Assert
    await expect(dbService.addDatabase(payload)).rejects.toThrow(
      "Missing required field: user"
    );
  });

  // Test Case 4: Missing required field 'database'
  test("should throw error when required field 'database' is missing", async () => {
    // Arrange
    const { database, ...payload } = mockInput;
    // Act & Assert
    await expect(dbService.addDatabase(payload)).rejects.toThrow(
      "Missing required field: database"
    );
  });

  // Test Case 5: Missing required field 'type'
  test("should throw error when required field 'type' is missing", async () => {
    // Arrange
    const { type, ...payload } = mockInput;
    // Act & Assert
    await expect(dbService.addDatabase(payload)).rejects.toThrow(
      "Missing required field: type"
    );
  });

  // Test Case 6: Missing required field 'name'
  test("should throw error when required field 'name' is missing", async () => {
    // Arrange
    const { name, ...payload } = mockInput;
    // Act & Assert
    await expect(dbService.addDatabase(payload)).rejects.toThrow(
      "Missing required field: name"
    );
  });

  // Test Case 7: Missing required field 'port'
  test("should throw error when required field 'port' is missing", async () => {
    // Arrange
    const { port, ...payload } = mockInput;
    // Act & Assert
    await expect(dbService.addDatabase(payload)).rejects.toThrow(
      "Missing required field: port"
    );
  });

  // Test Case 8 : List databases does not expose credentialId
  test("should not expose credentialId when listing databases", async () => {
    // Arrange
    // Act
    const dbs = await dbService.listDatabases();
    // Assert
    for (const db of dbs) {
      expect(db.credentialId).toBeUndefined();
    }
  });

  // Test Case 9: Get database connection for non-existent DB
  test("should throw error when getting connection for non-existent database", async () => {
    // Arrange
    const fakeDbId = "nonexistent-id";
    // Act & Assert
    await expect(dbService.getDatabaseConnection(fakeDbId)).rejects.toThrow(
      "Database not found"
    );
  });

  // Test Case 10: Update database with missing ID
  test("should throw error when updating database with missing ID", async () => {
    // Arrange
    const payload = { name: "UpdatedName" };
    // Act & Assert
    await expect(dbService.updateDatabase("", payload)).rejects.toThrow(
      "Missing id"
    );
  });

  // Test Case 11: Delete database with missing ID
  test("should throw error when deleting database with missing ID", async () => {
    // Arrange
    // Act & Assert
    await expect(dbService.deleteDatabase("")).rejects.toThrow("Missing id");
  });

  // Test Case 12: Successfully delete an existing database
  test("should successfully delete an existing database", async () => {
    // Arrange
    const payload = { ...mockInput, name: "DeleteTestDB" };

    // Act - Create a database first
    const createdDb = await dbService.addDatabase(payload);
    expect(createdDb).toBeDefined();
    expect(createdDb.id).toBeDefined();

    // Verify it exists in the list
    let dbList = await dbService.listDatabases();
    expect(dbList.some((db) => db.id === createdDb.id)).toBe(true);

    // Act - Delete the database
    await dbService.deleteDatabase(createdDb.id);

    // Assert - Verify it no longer exists in the list
    dbList = await dbService.listDatabases();
    expect(dbList.some((db) => db.id === createdDb.id)).toBe(false);

    // Note: No need to set createdDbId here since we already deleted it
  });

  // Test Case 13: Delete non-existent database should throw error
  test("should throw error when deleting non-existent database", async () => {
    // Arrange
    const fakeDbId = "nonexistent-database-id";
    // Act & Assert
    await expect(dbService.deleteDatabase(fakeDbId)).rejects.toThrow(
      "Database not found"
    );
  });
});
