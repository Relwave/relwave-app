import { describe, expect, test, beforeEach } from "@jest/globals";
import { Db } from "mongodb";
import {
  acquireLock,
  renewLockHeartbeat,
  releaseLock,
  checkLockStatus,
  verifyLock,
  LOCK_COLLECTION,
  LOCK_DOC_ID,
} from "../src/services/mongoMigrationLock";
import { MongoApiError } from "../src/connectors/mongo";
import { MongoMigrationLockDoc } from "../src/types/mongoMigration";

/**
 * Creates an in-memory mock MongoDB Db for lock testing.
 */
function createMockLockDb(): { db: Db; store: Map<string, MongoMigrationLockDoc> } {
  const store = new Map<string, MongoMigrationLockDoc>();

  const collectionMock = {
    async findOneAndUpdate(filter: any, update: any, options?: any) {
      const existing = store.get(LOCK_DOC_ID);
      const now = new Date();

      if (!existing) {
        // Document does not exist: upsert
        const fencingToken = update.$inc?.fencingToken || 1;
        const newDoc: MongoMigrationLockDoc = {
          _id: LOCK_DOC_ID,
          ownerId: update.$set?.ownerId || null,
          migrationId: update.$set?.migrationId || null,
          acquiredAt: update.$set?.acquiredAt || now,
          heartbeatAt: update.$set?.heartbeatAt || now,
          expiresAt: update.$set?.expiresAt || new Date(now.getTime() + 60000),
          fencingToken,
        };
        store.set(LOCK_DOC_ID, newDoc);
        return newDoc;
      }

      // Check filter condition
      const ownerMatch = filter.$or?.some((cond: any) => {
        if ("ownerId" in cond && cond.ownerId === existing.ownerId) return true;
        if ("ownerId" in cond && cond.ownerId === null && existing.ownerId === null) return true;
        if (
          cond.expiresAt?.$lt &&
          existing.expiresAt &&
          new Date(existing.expiresAt).getTime() < new Date(cond.expiresAt.$lt).getTime()
        ) {
          return true;
        }
        return false;
      });

      if (ownerMatch) {
        const fencingToken = (existing.fencingToken || 0) + (update.$inc?.fencingToken || 1);
        const updatedDoc: MongoMigrationLockDoc = {
          ...existing,
          ownerId: update.$set?.ownerId !== undefined ? update.$set.ownerId : existing.ownerId,
          migrationId:
            update.$set?.migrationId !== undefined ? update.$set.migrationId : existing.migrationId,
          acquiredAt: update.$set?.acquiredAt || now,
          heartbeatAt: update.$set?.heartbeatAt || now,
          expiresAt: update.$set?.expiresAt || existing.expiresAt,
          fencingToken,
        };
        store.set(LOCK_DOC_ID, updatedDoc);
        return updatedDoc;
      }

      // If document exists with _id: "migration_lock", but filter doesn't match and upsert: true,
      // MongoDB throws E11000 duplicate key error.
      if (options?.upsert) {
        const err: any = new Error("E11000 duplicate key error collection");
        err.code = 11000;
        throw err;
      }

      return null;
    },

    async findOne(filter: any) {
      if (filter._id === LOCK_DOC_ID) {
        const doc = store.get(LOCK_DOC_ID);
        if (!doc) return null;

        if (filter.ownerId && doc.ownerId !== filter.ownerId) return null;
        if (filter.fencingToken !== undefined && doc.fencingToken !== filter.fencingToken)
          return null;
        if (filter.expiresAt?.$gt) {
          if (
            !doc.expiresAt ||
            new Date(doc.expiresAt).getTime() <= new Date(filter.expiresAt.$gt).getTime()
          ) {
            return null;
          }
        }
        return { ...doc };
      }
      return null;
    },

    async updateOne(filter: any, update: any) {
      const doc = store.get(LOCK_DOC_ID);
      if (!doc) return { matchedCount: 0, modifiedCount: 0 };

      if (filter.ownerId && doc.ownerId !== filter.ownerId)
        return { matchedCount: 0, modifiedCount: 0 };
      if (filter.fencingToken !== undefined && doc.fencingToken !== filter.fencingToken) {
        return { matchedCount: 0, modifiedCount: 0 };
      }
      if (filter.expiresAt?.$gt) {
        if (
          !doc.expiresAt ||
          new Date(doc.expiresAt).getTime() <= new Date(filter.expiresAt.$gt).getTime()
        ) {
          return { matchedCount: 0, modifiedCount: 0 };
        }
      }

      if (update.$set) {
        Object.assign(doc, update.$set);
      }
      return { matchedCount: 1, modifiedCount: 1 };
    },

    async deleteOne(filter: any) {
      const doc = store.get(LOCK_DOC_ID);
      if (!doc) return { deletedCount: 0 };

      if (filter.ownerId && doc.ownerId !== filter.ownerId) return { deletedCount: 0 };
      if (filter.fencingToken !== undefined && doc.fencingToken !== filter.fencingToken) {
        return { deletedCount: 0 };
      }

      store.delete(LOCK_DOC_ID);
      return { deletedCount: 1 };
    },
  };

  const dbMock: any = {
    collection(name: string) {
      if (name === LOCK_COLLECTION) {
        return collectionMock;
      }
      throw new Error(`Collection '${name}' not implemented in mock`);
    },
  };

  return { db: dbMock, store };
}

describe("mongoMigrationLock Unit Tests (M6 Spec §6)", () => {
  let mockDb: Db;
  let store: Map<string, MongoMigrationLockDoc>;

  beforeEach(() => {
    const mock = createMockLockDb();
    mockDb = mock.db;
    store = mock.store;
  });

  test("acquires lock successfully when unheld", async () => {
    const res = await acquireLock(mockDb, "client-A", "20261031120000", 60000);
    expect(res.success).toBe(true);
    expect(res.fencingToken).toBe(1);
    expect(res.expiresAt.getTime()).toBeGreaterThan(Date.now());

    const doc = store.get(LOCK_DOC_ID);
    expect(doc?.ownerId).toBe("client-A");
    expect(doc?.migrationId).toBe("20261031120000");
    expect(doc?.fencingToken).toBe(1);
  });

  test("second client is blocked while lock is owned by an active lease", async () => {
    await acquireLock(mockDb, "client-A", "20261031120000", 60000);

    await expect(acquireLock(mockDb, "client-B", "20261031120000", 60000, 1)).rejects.toThrow(
      MongoApiError,
    );

    try {
      await acquireLock(mockDb, "client-B", "20261031120000", 60000, 1);
    } catch (err: any) {
      expect(err).toBeInstanceOf(MongoApiError);
      expect(err.code).toBe("LOCK_ALREADY_HELD");
      expect(err.message).toContain("Migration lock held by client-A");
    }
  });

  test("retries on E11000 duplicate key error and acquires lock when released", async () => {
    let callCount = 0;
    const originalFindOneAndUpdate = (mockDb.collection(LOCK_COLLECTION) as any).findOneAndUpdate;

    (mockDb.collection(LOCK_COLLECTION) as any).findOneAndUpdate = async function (...args: any[]) {
      callCount++;
      if (callCount === 1) {
        const err: any = new Error("E11000 duplicate key error on concurrent upsert");
        err.code = 11000;
        throw err;
      }
      return originalFindOneAndUpdate.apply(this, args);
    };

    const res = await acquireLock(mockDb, "client-retry", "20261031120000", 60000, 3);
    expect(res.success).toBe(true);
    expect(res.fencingToken).toBe(1);
    expect(callCount).toBe(2);
  });

  test("acquires lock after lease expires and increments fencing token", async () => {
    // Client A acquires with expired lease in the past
    store.set(LOCK_DOC_ID, {
      _id: LOCK_DOC_ID,
      ownerId: "stale-client",
      fencingToken: 5,
      acquiredAt: new Date(Date.now() - 100000),
      heartbeatAt: new Date(Date.now() - 90000),
      expiresAt: new Date(Date.now() - 30000), // Expired 30 seconds ago
      migrationId: "20261031000000",
    });

    const res = await acquireLock(mockDb, "new-client", "20261031120000", 60000);
    expect(res.success).toBe(true);
    expect(res.fencingToken).toBe(6); // Incremented from 5 to 6

    const doc = store.get(LOCK_DOC_ID);
    expect(doc?.ownerId).toBe("new-client");
    expect(doc?.fencingToken).toBe(6);
  });

  test("renews lock heartbeat for valid owner and fencing token", async () => {
    const lock = await acquireLock(mockDb, "client-A", "20261031120000", 60000);
    const initialExpires = lock.expiresAt;

    // Small delay to ensure timestamp progression
    await new Promise((r) => setTimeout(r, 10));

    const renewed = await renewLockHeartbeat(mockDb, "client-A", lock.fencingToken, 120000);
    expect(renewed).toBe(true);

    const doc = store.get(LOCK_DOC_ID);
    expect(new Date(doc!.expiresAt!).getTime()).toBeGreaterThan(initialExpires.getTime());

    // Wrong owner cannot renew
    const wrongOwnerRenewed = await renewLockHeartbeat(
      mockDb,
      "impostor",
      lock.fencingToken,
      60000,
    );
    expect(wrongOwnerRenewed).toBe(false);

    // Wrong fencing token cannot renew
    const wrongTokenRenewed = await renewLockHeartbeat(
      mockDb,
      "client-A",
      lock.fencingToken + 99,
      60000,
    );
    expect(wrongTokenRenewed).toBe(false);
  });

  test("releases lock conditionally matching owner and fencing token", async () => {
    const lock = await acquireLock(mockDb, "client-A", "20261031120000", 60000);

    // Impostor cannot release
    const impostorRelease = await releaseLock(mockDb, "impostor", lock.fencingToken);
    expect(impostorRelease).toBe(false);
    expect(store.has(LOCK_DOC_ID)).toBe(true);

    // Wrong fencing token cannot release
    const wrongTokenRelease = await releaseLock(mockDb, "client-A", 999);
    expect(wrongTokenRelease).toBe(false);
    expect(store.has(LOCK_DOC_ID)).toBe(true);

    // True owner releases cleanly (leaves doc, sets ownerId: null, preserves fencingToken)
    const released = await releaseLock(mockDb, "client-A", lock.fencingToken);
    expect(released).toBe(true);
    expect(store.has(LOCK_DOC_ID)).toBe(true);
    expect(store.get(LOCK_DOC_ID)?.ownerId).toBeNull();
    expect(store.get(LOCK_DOC_ID)?.fencingToken).toBe(1);
    expect(store.get(LOCK_DOC_ID)?.releasedAt).toBeDefined();
  });

  test("renewLockHeartbeat returns false and does not revive lease when expiresAt <= now", async () => {
    const lock = await acquireLock(mockDb, "client-A", "20261031120000", 60000);

    // Expire lease
    store.get(LOCK_DOC_ID)!.expiresAt = new Date(Date.now() - 5000);

    const renewed = await renewLockHeartbeat(mockDb, "client-A", lock.fencingToken, 60000);
    expect(renewed).toBe(false);

    // Ensure lease was not revived
    const doc = store.get(LOCK_DOC_ID);
    expect(new Date(doc!.expiresAt!).getTime()).toBeLessThan(Date.now());
  });

  test("releaseLock leaves document and preserves fencingToken monotonically across multiple sequential acquires", async () => {
    // Token 1
    const lock1 = await acquireLock(mockDb, "client-1", "m1", 60000);
    expect(lock1.fencingToken).toBe(1);

    const rel1 = await releaseLock(mockDb, "client-1", lock1.fencingToken);
    expect(rel1).toBe(true);
    expect(store.has(LOCK_DOC_ID)).toBe(true);
    expect(store.get(LOCK_DOC_ID)?.ownerId).toBeNull();
    expect(store.get(LOCK_DOC_ID)?.fencingToken).toBe(1);

    // Token 2
    const lock2 = await acquireLock(mockDb, "client-2", "m2", 60000);
    expect(lock2.fencingToken).toBe(2);

    const rel2 = await releaseLock(mockDb, "client-2", lock2.fencingToken);
    expect(rel2).toBe(true);
    expect(store.get(LOCK_DOC_ID)?.ownerId).toBeNull();
    expect(store.get(LOCK_DOC_ID)?.fencingToken).toBe(2);

    // Token 3
    const lock3 = await acquireLock(mockDb, "client-3", "m3", 60000);
    expect(lock3.fencingToken).toBe(3);

    const rel3 = await releaseLock(mockDb, "client-3", lock3.fencingToken);
    expect(rel3).toBe(true);
    expect(store.get(LOCK_DOC_ID)?.ownerId).toBeNull();
    expect(store.get(LOCK_DOC_ID)?.fencingToken).toBe(3);
  });

  test("previous owner cannot release newer owner's lock", async () => {
    const lock1 = await acquireLock(mockDb, "client-1", "m1", 100);

    // Expire lease and client-2 acquires lock2 with token 2
    store.get(LOCK_DOC_ID)!.expiresAt = new Date(Date.now() - 1000);
    const lock2 = await acquireLock(mockDb, "client-2", "m1", 60000);
    expect(lock2.fencingToken).toBe(2);

    // Client 1 cannot release with its old token
    const client1Release = await releaseLock(mockDb, "client-1", lock1.fencingToken);
    expect(client1Release).toBe(false);

    // Client 1 cannot release even if it guesses lock2's token
    const client1ReleaseToken2 = await releaseLock(mockDb, "client-1", lock2.fencingToken);
    expect(client1ReleaseToken2).toBe(false);

    // Lock remains held by client-2
    const doc = store.get(LOCK_DOC_ID);
    expect(doc?.ownerId).toBe("client-2");
    expect(doc?.fencingToken).toBe(2);
  });

  test("verifies lock status and detects lock loss / stale token", async () => {
    const lock = await acquireLock(mockDb, "client-A", "20261031120000", 60000);

    // Active lease returns true
    const valid = await verifyLock(mockDb, "client-A", lock.fencingToken);
    expect(valid).toBe(true);

    // Wrong owner returns false
    const wrongOwner = await verifyLock(mockDb, "other", lock.fencingToken);
    expect(wrongOwner).toBe(false);

    // Stale fencing token returns false
    const staleToken = await verifyLock(mockDb, "client-A", lock.fencingToken - 1);
    expect(staleToken).toBe(false);

    // Expired lease returns false
    store.get(LOCK_DOC_ID)!.expiresAt = new Date(Date.now() - 1000);
    const expired = await verifyLock(mockDb, "client-A", lock.fencingToken);
    expect(expired).toBe(false);
  });

  test("checkLockStatus inspects without mutating document", async () => {
    // When no lock document exists
    const emptyStatus = await checkLockStatus(mockDb);
    expect(emptyStatus.isLocked).toBe(false);
    expect(emptyStatus.isExpired).toBe(false);

    // When held by active client
    await acquireLock(mockDb, "client-A", "20261031120000", 60000);
    const heldStatus = await checkLockStatus(mockDb);
    expect(heldStatus.isLocked).toBe(true);
    expect(heldStatus.isExpired).toBe(false);
    expect(heldStatus.ownerId).toBe("client-A");
    expect(heldStatus.fencingToken).toBe(1);
    expect(heldStatus.migrationId).toBe("20261031120000");

    // When lease is expired
    store.get(LOCK_DOC_ID)!.expiresAt = new Date(Date.now() - 5000);
    const expiredStatus = await checkLockStatus(mockDb);
    expect(expiredStatus.isLocked).toBe(false);
    expect(expiredStatus.isExpired).toBe(true);
  });
});
