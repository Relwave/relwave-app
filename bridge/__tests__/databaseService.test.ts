import { afterEach, describe, expect, test } from "@jest/globals";
import { DatabaseService } from "../src/services/databaseService";

const mockInput = {
  name: "TestDB",
  host: "localhost",
  port: 5432,
  user: "testuser",
  database: "testdb",
  type: "POSTGRES",
  ssl: true,
};

let createdDbId: string | null = null;

describe("Database Service Method", () => {
  const dbService = new DatabaseService();

  afterEach(async () => {
    if (createdDbId) {
      try {
        await dbService.deleteDatabase(createdDbId);
      } catch (e) {
        // Silently ignore "Database not found" errors - expected when test didn't create a DB
        if (!(e instanceof Error && e.message === "Database not found")) {
          console.warn("Cleanup failed:", e);
        }
      }
      createdDbId = null;
    }
  });
  // Test Case 1: All required fields provided
  test("should add database when all required fields are provided", async () => {
    // Arrange
    const dbService = new DatabaseService();
    const payload = { ...mockInput };
    // Act
    const result = await dbService.addDatabase(payload);
    createdDbId = result.id;
    // Assert
    expect(result).toBeDefined();
    expect(result.name).toBe(payload.name);
  });

  // Test Case 2: Missing required field 'host'

  test("should throw error when required field 'host' is missing", async () => {
    // Arrange
    const dbService = new DatabaseService();
    const { host, ...payload } = mockInput;
    // Act & Assert
    await expect(dbService.addDatabase(payload)).rejects.toThrow(
      "Missing required field: host"
    );
  });

  // Test Case 3: Missing required field 'user'
  test("should throw error when required field 'user' is missing", async () => {
    // Arrange
    const dbService = new DatabaseService();
    const { user, ...payload } = mockInput;
    // Act & Assert
    await expect(dbService.addDatabase(payload)).rejects.toThrow(
      "Missing required field: user"
    );
  });

  // Test Case 4: Missing required field 'database'
  test("should throw error when required field 'database' is missing", async () => {
    // Arrange
    const dbService = new DatabaseService();
    const { database, ...payload } = mockInput;
    // Act & Assert
    await expect(dbService.addDatabase(payload)).rejects.toThrow(
      "Missing required field: database"
    );
  });

  // Test Case 5: Missing required field 'type'
  test("should throw error when required field 'type' is missing", async () => {
    // Arrange
    const dbService = new DatabaseService();
    const { type, ...payload } = mockInput;
    // Act & Assert
    await expect(dbService.addDatabase(payload)).rejects.toThrow(
      "Missing required field: type"
    );
  });

  // Test Case 6: Missing required field 'name'
  test("should throw error when required field 'name' is missing", async () => {
    // Arrange
    const dbService = new DatabaseService();
    const { name, ...payload } = mockInput;
    // Act & Assert
    await expect(dbService.addDatabase(payload)).rejects.toThrow(
      "Missing required field: name"
    );
  });

  // Test Case 7: Missing required field 'port'
  test("should throw error when required field 'port' is missing", async () => {
    // Arrange
    const dbService = new DatabaseService();
    const { port, ...payload } = mockInput;
    // Act & Assert
    await expect(dbService.addDatabase(payload)).rejects.toThrow(
      "Missing required field: port"
    );
  });

  // Test Case 8 : List databases does not expose credentialId
  test("should not expose credentialId when listing databases", async () => {
    // Arrange
    const dbService = new DatabaseService();
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
    const dbService = new DatabaseService();
    const fakeDbId = "nonexistent-id";
    // Act & Assert
    await expect(dbService.getDatabaseConnection(fakeDbId)).rejects.toThrow(
      "Database not found"
    );
  });

  // Test Case 10: Update database with missing ID
  test("should throw error when updating database with missing ID", async () => {
    // Arrange
    const dbService = new DatabaseService();
    const payload = { name: "UpdatedName" };
    // Act & Assert
    await expect(dbService.updateDatabase("", payload)).rejects.toThrow(
      "Missing id"
    );
  });

  // Test Case 11: Delete database with missing ID
  test("should throw error when deleting database with missing ID", async () => {
    // Arrange
    const dbService = new DatabaseService();
    // Act & Assert
    await expect(dbService.deleteDatabase("")).rejects.toThrow("Missing id");
  });
});
