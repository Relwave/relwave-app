import { afterAll, beforeAll, describe, expect, test } from "@jest/globals";
import fs from "fs/promises";
import fsSync from "fs";
import os from "os";
import path from "path";

// RELWAVE_HOME must be set BEFORE the databaseService (and its dbStore/config
// singletons) are loaded, so point it at an isolated temp directory.
const TEST_RELWAVE_HOME = path.join(os.tmpdir(), `mongo-db-service-test-${Date.now()}`);
process.env.RELWAVE_HOME = TEST_RELWAVE_HOME;

const { DatabaseService } = require("../src/services/databaseService");

const { dbStoreInstance } = require("../src/services/dbStore");

const SECRET = "sup3r-s3cret-pw";
const createdIds: string[] = [];

describe("DatabaseService MongoDB credential handling", () => {
  const dbService = new DatabaseService();

  beforeAll(async () => {
    if (!fsSync.existsSync(TEST_RELWAVE_HOME)) {
      await fs.mkdir(TEST_RELWAVE_HOME, { recursive: true });
    }
  });

  afterAll(async () => {
    for (const id of createdIds) {
      try {
        await dbService.deleteDatabase(id);
      } catch {
        // ignore
      }
    }
    if (fsSync.existsSync(TEST_RELWAVE_HOME)) {
      await fs.rm(TEST_RELWAVE_HOME, { recursive: true, force: true });
    }
  });

  test("strips the embedded password from the persisted URI and AES-stores it", async () => {
    const url = `mongodb://testuser:${SECRET}@localhost:27017/testdb`;
    const res = await dbService.addDatabase({ name: "MongoCredDB", type: "mongodb", url });
    createdIds.push(res.id);

    expect(res.id).toBeDefined();

    const meta = await dbService.getDatabase(res.id);
    expect(meta?.type).toBe("mongodb");
    // The persisted URI is sanitized — no plaintext password.
    expect(meta?.url).toBe("mongodb://testuser@localhost:27017/testdb");
    expect(meta?.url).not.toContain(SECRET);
    expect(meta?.credentialId).toBeDefined();

    // The password is retrievable through the encrypted credential store.
    const pwd = meta ? await dbStoreInstance.getPasswordFor(meta) : null;
    expect(pwd).toBe(SECRET);

    // Byte-level scan of the persisted metadata finds no plaintext password.
    const raw = await fs.readFile(path.join(TEST_RELWAVE_HOME, "databases.json"), "utf-8");
    expect(raw).not.toContain(SECRET);
  });

  test("reconstructs the authenticated URI in memory at runtime, never persisting it", async () => {
    const url = `mongodb://alice:${SECRET}@localhost:27017/proddb`;
    const res = await dbService.addDatabase({ name: "MongoRuntimeDB", type: "mongodb", url });
    createdIds.push(res.id);

    const { conn, dbType } = await dbService.getDatabaseConnection(res.id);
    expect(dbType).toBe("mongodb");
    // Runtime config carries the password for the driver.
    expect((conn as { uri?: string }).uri).toContain(SECRET);
    expect((conn as { uri?: string }).uri).toContain("alice");

    // But the persisted metadata keeps the sanitized URI.
    const meta = await dbService.getDatabase(res.id);
    expect(meta?.url).toBe("mongodb://alice@localhost:27017/proddb");
    expect(meta?.url).not.toContain(SECRET);

    const raw = await fs.readFile(path.join(TEST_RELWAVE_HOME, "databases.json"), "utf-8");
    expect(raw).not.toContain(SECRET);
  });

  test("requires name and type for a MongoDB connection", async () => {
    await expect(
      dbService.addDatabase({ type: "mongodb", url: "mongodb://localhost/db" }),
    ).rejects.toThrow("Missing required field: name");
  });
});
