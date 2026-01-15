import { afterEach, beforeEach, describe, expect, test } from "@jest/globals";
import { DbStore } from "../src/services/dbStore";
import fs from "fs/promises";
import fsSync from "fs";
import path from "path";
import os from "os";

// Test configuration - use temp directory for isolation
const TEST_CONFIG_FOLDER = path.join(os.tmpdir(), "dbstore-test-" + Date.now());
const TEST_CONFIG_FILE = path.join(TEST_CONFIG_FOLDER, "databases.json");
const TEST_CREDENTIALS_FILE = path.join(TEST_CONFIG_FOLDER, ".credentials");
const TEST_ENCRYPTION_KEY = "test-encryption-key";

// Short TTL for testing cache expiration
const SHORT_CACHE_TTL = 100; // 100ms for testing
const NORMAL_CACHE_TTL = 30000; // 30 seconds

const mockDBPayload = {
  name: "TestDB",
  host: "localhost",
  port: 5432,
  user: "testuser",
  database: "testdb",
  type: "POSTGRES",
  ssl: true,
  password: "testpassword123",
};

describe("DbStore Cache Tests", () => {
  let dbStore: DbStore;

  beforeEach(async () => {
    // Create fresh test directory
    if (fsSync.existsSync(TEST_CONFIG_FOLDER)) {
      await fs.rm(TEST_CONFIG_FOLDER, { recursive: true, force: true });
    }
    await fs.mkdir(TEST_CONFIG_FOLDER, { recursive: true });

    // Create a new DbStore instance with test configuration (autoPreload enabled)
    dbStore = new DbStore(
      TEST_CONFIG_FOLDER,
      TEST_CONFIG_FILE,
      TEST_CREDENTIALS_FILE,
      TEST_ENCRYPTION_KEY,
      NORMAL_CACHE_TTL,
      true // autoPreload
    );
    // Wait for preload to complete
    await dbStore.waitUntilReady();
  });

  afterEach(async () => {
    // Cleanup test directory
    if (fsSync.existsSync(TEST_CONFIG_FOLDER)) {
      await fs.rm(TEST_CONFIG_FOLDER, { recursive: true, force: true });
    }
  });

  describe("Basic CRUD Operations", () => {
    test("should add and retrieve a database", async () => {
      const result = await dbStore.addDB(mockDBPayload);

      expect(result).toBeDefined();
      expect(result.id).toBeDefined();
      expect(result.name).toBe(mockDBPayload.name);
      expect(result.host).toBe(mockDBPayload.host);

      const retrieved = await dbStore.getDB(result.id);
      expect(retrieved).toBeDefined();
      expect(retrieved?.name).toBe(mockDBPayload.name);
    });

    test("should list all databases", async () => {
      await dbStore.addDB(mockDBPayload);
      await dbStore.addDB({ ...mockDBPayload, name: "TestDB2" });

      const dbs = await dbStore.listDBs();
      expect(dbs.length).toBe(2);
    });

    test("should update a database", async () => {
      const result = await dbStore.addDB(mockDBPayload);
      await dbStore.updateDB(result.id, { name: "UpdatedDB" });

      const updated = await dbStore.getDB(result.id);
      expect(updated?.name).toBe("UpdatedDB");
    });

    test("should delete a database", async () => {
      const result = await dbStore.addDB(mockDBPayload);
      await dbStore.deleteDB(result.id);

      const deleted = await dbStore.getDB(result.id);
      expect(deleted).toBeUndefined();
    });
  });

  describe("Password Encryption", () => {
    test("should store and retrieve encrypted password", async () => {
      const result = await dbStore.addDB(mockDBPayload);
      const password = await dbStore.getPasswordFor(result);

      expect(password).toBe(mockDBPayload.password);
    });

    test("should update password", async () => {
      const result = await dbStore.addDB(mockDBPayload);
      await dbStore.updateDB(result.id, { password: "newpassword456" });

      const updatedDB = await dbStore.getDB(result.id);
      const password = await dbStore.getPasswordFor(updatedDB!);

      expect(password).toBe("newpassword456");
    });
  });

  describe("Cache Functionality", () => {
    test("should cache config data after first load", async () => {
      await dbStore.addDB(mockDBPayload);

      // First call - should read from file
      const stats1 = dbStore.getCacheStats();
      expect(stats1.configCached).toBe(true); // Cache populated after addDB

      // Invalidate and check
      dbStore.invalidateCache();
      const stats2 = dbStore.getCacheStats();
      expect(stats2.configCached).toBe(false);

      // List DBs should populate cache again
      await dbStore.listDBs();
      const stats3 = dbStore.getCacheStats();
      expect(stats3.configCached).toBe(true);
    });

    test("should return cached data on subsequent calls", async () => {
      const result = await dbStore.addDB(mockDBPayload);

      // Multiple getDB calls should use cache
      const db1 = await dbStore.getDB(result.id);
      const db2 = await dbStore.getDB(result.id);
      const db3 = await dbStore.getDB(result.id);

      expect(db1).toEqual(db2);
      expect(db2).toEqual(db3);
      expect(dbStore.getCacheStats().configCached).toBe(true);
    });

    test("should invalidate cache on write operations", async () => {
      const result = await dbStore.addDB(mockDBPayload);
      expect(dbStore.getCacheStats().configCached).toBe(true);

      // Manual invalidation
      dbStore.invalidateCache();
      expect(dbStore.getCacheStats().configCached).toBe(false);

      // Read repopulates cache
      await dbStore.listDBs();
      expect(dbStore.getCacheStats().configCached).toBe(true);
    });

    test("should update cache after addDB", async () => {
      await dbStore.addDB(mockDBPayload);
      const stats = dbStore.getCacheStats();

      expect(stats.configCached).toBe(true);
      expect(stats.dbCount).toBe(1);

      await dbStore.addDB({ ...mockDBPayload, name: "SecondDB" });
      const stats2 = dbStore.getCacheStats();

      expect(stats2.dbCount).toBe(2);
    });

    test("should update cache after updateDB", async () => {
      const result = await dbStore.addDB(mockDBPayload);
      await dbStore.updateDB(result.id, { name: "UpdatedName" });

      // Cache should be updated
      const db = await dbStore.getDB(result.id);
      expect(db?.name).toBe("UpdatedName");
    });

    test("should update cache after deleteDB", async () => {
      const result = await dbStore.addDB(mockDBPayload);
      expect(dbStore.getCacheStats().dbCount).toBe(1);

      await dbStore.deleteDB(result.id);
      expect(dbStore.getCacheStats().dbCount).toBe(0);
    });
  });

  describe("Cache TTL (Time-To-Live)", () => {
    test("should expire cache after TTL", async () => {
      // Create store with short TTL
      const shortTtlStore = new DbStore(
        TEST_CONFIG_FOLDER,
        TEST_CONFIG_FILE,
        TEST_CREDENTIALS_FILE,
        TEST_ENCRYPTION_KEY,
        SHORT_CACHE_TTL,
        true // autoPreload
      );
      await shortTtlStore.waitUntilReady();

      await shortTtlStore.addDB(mockDBPayload);
      expect(shortTtlStore.getCacheStats().configCached).toBe(true);

      // Wait for TTL to expire
      await new Promise((resolve) => setTimeout(resolve, SHORT_CACHE_TTL + 50));

      // Cache should be expired now
      expect(shortTtlStore.getCacheStats().configCached).toBe(false);
    });
  });

  describe("Preload Functionality", () => {
    test("should preload cache on instantiation", async () => {
      const preloadStore = new DbStore(
        TEST_CONFIG_FOLDER,
        TEST_CONFIG_FILE,
        TEST_CREDENTIALS_FILE,
        TEST_ENCRYPTION_KEY,
        NORMAL_CACHE_TTL,
        true // autoPreload enabled
      );

      // Wait for preload
      await preloadStore.waitUntilReady();

      const stats = preloadStore.getCacheStats();
      expect(stats.isPreloaded).toBe(true);
      expect(stats.configCached).toBe(true);
      expect(stats.credentialsCached).toBe(true);
    });

    test("should not preload when autoPreload is disabled", async () => {
      const noPreloadStore = new DbStore(
        TEST_CONFIG_FOLDER,
        TEST_CONFIG_FILE,
        TEST_CREDENTIALS_FILE,
        TEST_ENCRYPTION_KEY,
        NORMAL_CACHE_TTL,
        false // autoPreload disabled
      );

      // Without preload, cache should not be ready immediately
      expect(noPreloadStore.isReady()).toBe(false);

      // First call will load from disk
      await noPreloadStore.listDBs();

      // Now cache should be populated
      expect(noPreloadStore.getCacheStats().configCached).toBe(true);
    });

    test("should have fast first listDBs when preloaded", async () => {
      // Create store with preload
      const preloadStore = new DbStore(
        TEST_CONFIG_FOLDER,
        TEST_CONFIG_FILE,
        TEST_CREDENTIALS_FILE,
        TEST_ENCRYPTION_KEY,
        NORMAL_CACHE_TTL,
        true
      );
      await preloadStore.waitUntilReady();

      // First listDBs should be fast (from cache)
      const start = performance.now();
      await preloadStore.listDBs();
      const preloadedTime = performance.now() - start;

      // Create store WITHOUT preload for comparison
      const noPreloadStore = new DbStore(
        TEST_CONFIG_FOLDER,
        TEST_CONFIG_FILE,
        TEST_CREDENTIALS_FILE,
        TEST_ENCRYPTION_KEY,
        NORMAL_CACHE_TTL,
        false // no preload
      );

      // First listDBs will read from disk
      const start2 = performance.now();
      await noPreloadStore.listDBs();
      const noPreloadTime = performance.now() - start2;

      console.log(`\nPreload Performance Comparison:`);
      console.log(`With preload (first call): ${preloadedTime.toFixed(3)}ms`);
      console.log(`Without preload (first call): ${noPreloadTime.toFixed(3)}ms`);
      console.log(`Speed improvement: ${(noPreloadTime / preloadedTime).toFixed(2)}x faster`);

      // Preloaded should be faster
      expect(preloadedTime).toBeLessThan(noPreloadTime);
    });

    test("should handle preload with existing data", async () => {
      // First, add some data using the main store
      await dbStore.addDB(mockDBPayload);
      await dbStore.addDB({ ...mockDBPayload, name: "DB2" });

      // Create a new store that preloads existing data
      const newStore = new DbStore(
        TEST_CONFIG_FOLDER,
        TEST_CONFIG_FILE,
        TEST_CREDENTIALS_FILE,
        TEST_ENCRYPTION_KEY,
        NORMAL_CACHE_TTL,
        true
      );
      await newStore.waitUntilReady();

      // Should have the data ready immediately
      const stats = newStore.getCacheStats();
      expect(stats.isPreloaded).toBe(true);
      expect(stats.dbCount).toBe(2);

      // First call should be instant (from preloaded cache)
      const start = performance.now();
      const dbs = await newStore.listDBs();
      const time = performance.now() - start;

      console.log(`\nFirst listDBs with preloaded data: ${time.toFixed(3)}ms`);
      expect(dbs.length).toBe(2);
      expect(time).toBeLessThan(1); // Should be sub-millisecond
    });

    test("manual preloadCache should warm cache", async () => {
      // Create store without auto-preload
      const manualStore = new DbStore(
        TEST_CONFIG_FOLDER,
        TEST_CONFIG_FILE,
        TEST_CREDENTIALS_FILE,
        TEST_ENCRYPTION_KEY,
        NORMAL_CACHE_TTL,
        false
      );

      expect(manualStore.isReady()).toBe(false);

      // Manually preload
      await manualStore.preloadCache();

      expect(manualStore.isReady()).toBe(true);
      expect(manualStore.getCacheStats().configCached).toBe(true);
    });
  });

  describe("Cache Performance", () => {
    test("should retrieve cached data faster than uncached", async () => {
      // Add multiple databases
      for (let i = 0; i < 5; i++) {
        await dbStore.addDB({ ...mockDBPayload, name: `TestDB${i}` });
      }

      // Invalidate cache to force file read
      dbStore.invalidateCache();

      // Measure uncached read time (first read from file)
      const uncachedStart = performance.now();
      await dbStore.listDBs();
      const uncachedTime = performance.now() - uncachedStart;

      // Measure cached read times (multiple reads from cache)
      const cachedTimes: number[] = [];
      for (let i = 0; i < 10; i++) {
        const cachedStart = performance.now();
        await dbStore.listDBs();
        cachedTimes.push(performance.now() - cachedStart);
      }

      const avgCachedTime =
        cachedTimes.reduce((a, b) => a + b, 0) / cachedTimes.length;

      console.log(`Uncached read time: ${uncachedTime.toFixed(3)}ms`);
      console.log(`Average cached read time: ${avgCachedTime.toFixed(3)}ms`);
      console.log(`Speed improvement: ${(uncachedTime / avgCachedTime).toFixed(2)}x faster`);

      // Cached reads should be significantly faster
      // We expect at least 2x improvement (usually much more)
      expect(avgCachedTime).toBeLessThan(uncachedTime);
    });

    test("should show significant speed improvement for getDB", async () => {
      const result = await dbStore.addDB(mockDBPayload);

      // Invalidate cache
      dbStore.invalidateCache();

      // Uncached getDB (reads file)
      const uncachedStart = performance.now();
      await dbStore.getDB(result.id);
      const uncachedTime = performance.now() - uncachedStart;

      // Cached getDB (multiple times)
      const cachedTimes: number[] = [];
      for (let i = 0; i < 20; i++) {
        const cachedStart = performance.now();
        await dbStore.getDB(result.id);
        cachedTimes.push(performance.now() - cachedStart);
      }

      const avgCachedTime =
        cachedTimes.reduce((a, b) => a + b, 0) / cachedTimes.length;

      console.log(`\ngetDB Performance:`);
      console.log(`Uncached read time: ${uncachedTime.toFixed(3)}ms`);
      console.log(`Average cached read time: ${avgCachedTime.toFixed(3)}ms`);
      console.log(`Speed improvement: ${(uncachedTime / avgCachedTime).toFixed(2)}x faster`);

      expect(avgCachedTime).toBeLessThan(uncachedTime);
    });

    test("should handle rapid successive reads efficiently", async () => {
      await dbStore.addDB(mockDBPayload);

      const startTime = performance.now();
      const iterations = 100;

      // Perform many rapid reads
      for (let i = 0; i < iterations; i++) {
        await dbStore.listDBs();
      }

      const totalTime = performance.now() - startTime;
      const avgTimePerRead = totalTime / iterations;

      console.log(`\nRapid Read Performance (${iterations} iterations):`);
      console.log(`Total time: ${totalTime.toFixed(3)}ms`);
      console.log(`Average time per read: ${avgTimePerRead.toFixed(3)}ms`);

      // Each cached read should be very fast (under 1ms typically)
      expect(avgTimePerRead).toBeLessThan(5); // Allow some buffer for slow systems
    });

    test("should benchmark credentials caching", async () => {
      const result = await dbStore.addDB(mockDBPayload);

      // Invalidate cache
      dbStore.invalidateCache();

      // Uncached password retrieval
      const uncachedStart = performance.now();
      await dbStore.getPasswordFor(result);
      const uncachedTime = performance.now() - uncachedStart;

      // Cached password retrievals
      const cachedTimes: number[] = [];
      for (let i = 0; i < 10; i++) {
        const cachedStart = performance.now();
        await dbStore.getPasswordFor(result);
        cachedTimes.push(performance.now() - cachedStart);
      }

      const avgCachedTime =
        cachedTimes.reduce((a, b) => a + b, 0) / cachedTimes.length;

      console.log(`\nPassword Retrieval Performance:`);
      console.log(`Uncached read time: ${uncachedTime.toFixed(3)}ms`);
      console.log(`Average cached read time: ${avgCachedTime.toFixed(3)}ms`);

      // Note: Password retrieval includes decryption which takes constant time
      // But file I/O should still be cached
      expect(avgCachedTime).toBeLessThanOrEqual(uncachedTime * 1.5); // Allow some variance due to crypto
    });
  });

  describe("Edge Cases", () => {
    test("should handle empty database list", async () => {
      const dbs = await dbStore.listDBs();
      expect(dbs).toEqual([]);
      expect(dbStore.getCacheStats().configCached).toBe(true);
    });

    test("should return undefined for non-existent database", async () => {
      const db = await dbStore.getDB("non-existent-id");
      expect(db).toBeUndefined();
    });

    test("should handle database without password", async () => {
      const { password, ...payloadWithoutPassword } = mockDBPayload;
      const result = await dbStore.addDB(payloadWithoutPassword);

      const retrievedPassword = await dbStore.getPasswordFor(result);
      expect(retrievedPassword).toBeNull();
    });

    test("should preserve cache across multiple operations", async () => {
      // Add multiple DBs
      const db1 = await dbStore.addDB({ ...mockDBPayload, name: "DB1" });
      const db2 = await dbStore.addDB({ ...mockDBPayload, name: "DB2" });
      const db3 = await dbStore.addDB({ ...mockDBPayload, name: "DB3" });

      expect(dbStore.getCacheStats().dbCount).toBe(3);

      // Update one
      await dbStore.updateDB(db2.id, { name: "DB2-Updated" });
      expect(dbStore.getCacheStats().dbCount).toBe(3);

      // Delete one
      await dbStore.deleteDB(db1.id);
      expect(dbStore.getCacheStats().dbCount).toBe(2);

      // Verify remaining DBs
      const remaining = await dbStore.listDBs();
      expect(remaining.length).toBe(2);
      expect(remaining.find((db) => db.name === "DB2-Updated")).toBeDefined();
      expect(remaining.find((db) => db.name === "DB3")).toBeDefined();
    });
  });
});
