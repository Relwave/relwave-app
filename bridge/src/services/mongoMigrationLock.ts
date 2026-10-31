/**
 * MongoDB Milestone 6 — Distributed Migration Lock Manager.
 *
 * Implements atomic distributed locking on `_relwave_migrations_lock`
 * with fencing tokens, bounded E11000 retry backoff, active heartbeats,
 * and owner-conditional releases.
 */

import { Db } from "mongodb";
import { MongoApiError } from "../connectors/mongo";
import {
  MongoMigrationLockDoc,
  MongoMigrationLockStatus,
} from "../types/mongoMigration";

export const LOCK_COLLECTION = "_relwave_migrations_lock";
export const LOCK_DOC_ID = "migration_lock";
export const DEFAULT_LEASE_MS = 60_000; // 60s
export const DEFAULT_HEARTBEAT_MS = 15_000; // 15s
export const DEFAULT_MAX_RETRIES = 3;

/**
 * Acquire the distributed migration lock atomically using findOneAndUpdate.
 *
 * Handles concurrent first-time upsert races (MongoDB error 11000) with
 * bounded exponential backoff and jitter. If an active owner holds the lease,
 * throws `MongoApiError("LOCK_ALREADY_HELD", ...)`.
 */
export async function acquireLock(
  db: Db,
  ownerId: string,
  migrationId?: string,
  leaseMs: number = DEFAULT_LEASE_MS,
  maxRetries: number = DEFAULT_MAX_RETRIES,
): Promise<{ success: boolean; fencingToken: number; expiresAt: Date }> {
  const collection = db.collection<MongoMigrationLockDoc>(LOCK_COLLECTION);

  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    const now = new Date();
    const expiresAt = new Date(now.getTime() + leaseMs);

    try {
      const result = await collection.findOneAndUpdate(
        {
          _id: LOCK_DOC_ID,
          $or: [
            { ownerId },
            { ownerId: null },
            { expiresAt: { $lt: now } },
          ],
        },
        {
          $set: {
            ownerId,
            migrationId: migrationId || null,
            acquiredAt: now,
            heartbeatAt: now,
            expiresAt,
          },
          $inc: { fencingToken: 1 },
        },
        { upsert: true, returnDocument: "after" },
      );

      const doc = result && "value" in (result as any) ? (result as any).value : result;
      if (doc) {
        return {
          success: true,
          fencingToken: doc.fencingToken,
          expiresAt: new Date(doc.expiresAt),
        };
      }

      // If findOneAndUpdate returned null, lock is held by another active owner
      const activeLock = await collection.findOne({ _id: LOCK_DOC_ID });
      if (
        activeLock &&
        activeLock.expiresAt &&
        new Date(activeLock.expiresAt).getTime() >= now.getTime()
      ) {
        if (activeLock.ownerId !== ownerId) {
          if (attempt < maxRetries) {
            const jitter = Math.floor(Math.random() * 150) + 50 * attempt;
            await new Promise((resolve) => setTimeout(resolve, jitter));
            continue;
          }
          throw new MongoApiError(
            "LOCK_ALREADY_HELD",
            `Migration lock held by ${activeLock.ownerId} (expires at ${new Date(activeLock.expiresAt).toISOString()})`,
          );
        }
      }
    } catch (err: any) {
      if (err instanceof MongoApiError) {
        throw err;
      }

      // MongoDB duplicate key error (code 11000) on concurrent first-time upserts
      if (err.code === 11000 || err.codeName === "DuplicateKey") {
        if (attempt < maxRetries) {
          const jitter = Math.floor(Math.random() * 150) + 50 * attempt;
          await new Promise((resolve) => setTimeout(resolve, jitter));
          continue;
        }

        const activeLock = await collection.findOne({ _id: LOCK_DOC_ID });
        if (
          activeLock &&
          activeLock.expiresAt &&
          new Date(activeLock.expiresAt).getTime() >= Date.now()
        ) {
          throw new MongoApiError(
            "LOCK_ALREADY_HELD",
            `Migration lock held by ${activeLock.ownerId} (expires at ${new Date(activeLock.expiresAt).toISOString()})`,
          );
        }
      }

      throw err;
    }
  }

  // If retries exhausted and not acquired
  const activeLock = await collection.findOne({ _id: LOCK_DOC_ID });
  if (
    activeLock &&
    activeLock.expiresAt &&
    new Date(activeLock.expiresAt).getTime() >= Date.now()
  ) {
    throw new MongoApiError(
      "LOCK_ALREADY_HELD",
      `Migration lock held by ${activeLock.ownerId} (expires at ${new Date(activeLock.expiresAt).toISOString()})`,
    );
  }

  throw new MongoApiError("LOCK_ALREADY_HELD", "Failed to acquire migration lock after retries");
}

/**
 * Renew lock heartbeat atomically if ownerId and fencingToken match and lease has not expired.
 */
export async function renewLockHeartbeat(
  db: Db,
  ownerId: string,
  fencingToken: number,
  leaseMs: number = DEFAULT_LEASE_MS,
): Promise<boolean> {
  const collection = db.collection<MongoMigrationLockDoc>(LOCK_COLLECTION);
  const now = new Date();
  const expiresAt = new Date(now.getTime() + leaseMs);

  const result = await collection.updateOne(
    { _id: LOCK_DOC_ID, ownerId, fencingToken, expiresAt: { $gt: now } },
    { $set: { heartbeatAt: now, expiresAt } },
  );

  return result.matchedCount > 0;
}

/**
 * Release lock atomically if ownerId and fencingToken match.
 * Preserves fencingToken across releases.
 */
export async function releaseLock(
  db: Db,
  ownerId: string,
  fencingToken: number,
): Promise<boolean> {
  const collection = db.collection<MongoMigrationLockDoc>(LOCK_COLLECTION);
  const result = await collection.updateOne(
    { _id: LOCK_DOC_ID, ownerId, fencingToken },
    {
      $set: {
        ownerId: null,
        migrationId: null,
        expiresAt: null,
        releasedAt: new Date(),
      },
    },
  );
  return result.matchedCount > 0;
}

/**
 * Non-mutating inspection of the distributed lock status.
 */
export async function checkLockStatus(db: Db): Promise<MongoMigrationLockStatus> {
  const collection = db.collection<MongoMigrationLockDoc>(LOCK_COLLECTION);
  const doc = await collection.findOne({ _id: LOCK_DOC_ID });

  if (!doc || !doc.ownerId) {
    return {
      isLocked: false,
      isExpired: false,
    };
  }

  const now = new Date();
  const expiresAtDate = doc.expiresAt ? new Date(doc.expiresAt) : new Date(0);
  const isExpired = expiresAtDate.getTime() < now.getTime();

  return {
    isLocked: !isExpired,
    ownerId: doc.ownerId,
    fencingToken: doc.fencingToken,
    expiresAt: doc.expiresAt ? new Date(doc.expiresAt).toISOString() : undefined,
    isExpired,
    migrationId: doc.migrationId || undefined,
  };
}

/**
 * Pre-step fencing guard: verifies the current client still holds the lease.
 * Returns true if the doc exists matching ownerId and fencingToken and expiresAt > now.
 */
export async function verifyLock(
  db: Db,
  ownerId: string,
  fencingToken: number,
): Promise<boolean> {
  const collection = db.collection<MongoMigrationLockDoc>(LOCK_COLLECTION);
  const now = new Date();

  const doc = await collection.findOne({
    _id: LOCK_DOC_ID,
    ownerId,
    fencingToken,
    expiresAt: { $gt: now },
  });

  return doc !== null;
}
