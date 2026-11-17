import { describe, expect, test, beforeEach, afterEach } from "@jest/globals";
import fs from "fs";
import path from "path";
import os from "os";
import { Db } from "mongodb";
import {
  validateManifest,
  assertValidManifest,
  computeManifestChecksum,
  validateSafeFilePath,
  listMigrations,
  applyMigration,
  rollbackMigration,
  rebuildMigrationSummary,
  getMigrationStatus,
  compensateStep,
  MAX_MANIFEST_SIZE_BYTES,
  EVENTS_COLLECTION,
  MIGRATIONS_COLLECTION,
} from "../src/services/mongoMigrationEngine";
import { LOCK_COLLECTION, LOCK_DOC_ID } from "../src/services/mongoMigrationLock";
import { MongoApiError } from "../src/connectors/mongo";
import {
  MongoMigrationManifest,
  MongoMigrationSummary,
  MongoMigrationEvent,
  MongoMigrationLockDoc,
} from "../src/types/mongoMigration";

/**
 * Creates an in-memory mock MongoDB database for migration engine testing.
 */
function createMockEngineDb() {
  const locks = new Map<string, MongoMigrationLockDoc>();
  const summaries = new Map<string, MongoMigrationSummary>();
  const events: MongoMigrationEvent[] = [];
  const collectionsData = new Map<string, any[]>();
  const collectionsIndexes = new Map<string, any[]>();
  const collectionsOptions = new Map<string, any>();

  const getOrCreateCollData = (name: string) => {
    if (!collectionsData.has(name)) collectionsData.set(name, []);
    return collectionsData.get(name)!;
  };

  const getOrCreateCollIndexes = (name: string) => {
    if (!collectionsIndexes.has(name)) {
      collectionsIndexes.set(name, [{ name: "_id_", key: { _id: 1 }, v: 2 }]);
    }
    return collectionsIndexes.get(name)!;
  };

  const db: any = {
    async createCollection(name: string, options?: any) {
      if (collectionsData.has(name)) {
        const err: any = new Error(`Collection ${name} already exists`);
        err.code = 48;
        throw err;
      }
      collectionsData.set(name, []);
      collectionsOptions.set(name, options || {});
      getOrCreateCollIndexes(name);
      return { collectionName: name };
    },

    listCollections(filter?: any) {
      return {
        async toArray() {
          const list: any[] = [];
          for (const [name, options] of collectionsOptions.entries()) {
            if (filter?.name && filter.name !== name) continue;
            list.push({ name, options });
          }
          return list;
        },
      };
    },

    async command(cmd: any) {
      if (cmd.collMod) {
        const collName = cmd.collMod;
        const currentOptions = collectionsOptions.get(collName) || {};
        if (cmd.validator) currentOptions.validator = cmd.validator;
        if (cmd.validationLevel) currentOptions.validationLevel = cmd.validationLevel;
        if (cmd.validationAction) currentOptions.validationAction = cmd.validationAction;
        collectionsOptions.set(collName, currentOptions);
        return { ok: 1 };
      }
      return { ok: 1 };
    },

    collection(name: string) {
      if (name === LOCK_COLLECTION) {
        return {
          async findOneAndUpdate(filter: any, update: any, options?: any) {
            const existing = locks.get(LOCK_DOC_ID);
            const now = new Date();

            if (!existing) {
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
              locks.set(LOCK_DOC_ID, newDoc);
              return newDoc;
            }

            const ownerMatch = filter.$or?.some((cond: any) => {
              if ("ownerId" in cond && cond.ownerId === existing.ownerId) return true;
              if ("ownerId" in cond && cond.ownerId === null && existing.ownerId === null)
                return true;
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
                ownerId:
                  update.$set?.ownerId !== undefined ? update.$set.ownerId : existing.ownerId,
                migrationId:
                  update.$set?.migrationId !== undefined
                    ? update.$set.migrationId
                    : existing.migrationId,
                acquiredAt: update.$set?.acquiredAt || now,
                heartbeatAt: update.$set?.heartbeatAt || now,
                expiresAt: update.$set?.expiresAt || existing.expiresAt,
                fencingToken,
              };
              locks.set(LOCK_DOC_ID, updatedDoc);
              return updatedDoc;
            }

            if (options?.upsert) {
              const err: any = new Error("E11000 duplicate key error");
              err.code = 11000;
              throw err;
            }
            return null;
          },

          async findOne(filter: any) {
            if (filter._id === LOCK_DOC_ID) {
              const doc = locks.get(LOCK_DOC_ID);
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
            const doc = locks.get(LOCK_DOC_ID);
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
            if (update.$set) Object.assign(doc, update.$set);
            return { matchedCount: 1, modifiedCount: 1 };
          },

          async deleteOne(filter: any) {
            const doc = locks.get(LOCK_DOC_ID);
            if (!doc) return { deletedCount: 0 };
            if (filter.ownerId && doc.ownerId !== filter.ownerId) return { deletedCount: 0 };
            if (filter.fencingToken !== undefined && doc.fencingToken !== filter.fencingToken) {
              return { deletedCount: 0 };
            }
            locks.delete(LOCK_DOC_ID);
            return { deletedCount: 1 };
          },
        };
      }

      if (name === MIGRATIONS_COLLECTION) {
        return {
          async findOne(filter: any) {
            if (filter._id) {
              const doc = summaries.get(filter._id);
              return doc ? { ...doc } : null;
            }
            return null;
          },

          find(filter: any = {}) {
            let list = Array.from(summaries.values());
            if (filter.status?.$ne) {
              list = list.filter((s) => s.status !== filter.status.$ne);
            } else if (filter.status) {
              list = list.filter((s) => s.status === filter.status);
            }
            return {
              sort(sortObj: any) {
                if (sortObj._id === 1) {
                  list.sort((a, b) => a._id.localeCompare(b._id));
                } else if (sortObj._id === -1) {
                  list.sort((a, b) => b._id.localeCompare(a._id));
                }
                return {
                  limit(n: number) {
                    list = list.slice(0, n);
                    return {
                      async toArray() {
                        return list.map((x) => ({ ...x }));
                      },
                    };
                  },
                  async toArray() {
                    return list.map((x) => ({ ...x }));
                  },
                };
              },
              async toArray() {
                return list.map((x) => ({ ...x }));
              },
            };
          },

          async updateOne(filter: any, update: any, options?: any) {
            const id = filter._id;
            let doc = summaries.get(id);
            if (!doc && options?.upsert) {
              doc = {
                _id: id,
                name: update.$set?.name || "",
                checksum: update.$set?.checksum || "",
                status: update.$set?.status || "PENDING",
                startedAt: update.$set?.startedAt || new Date().toISOString(),
                executedSteps: update.$set?.executedSteps || 0,
                totalSteps: update.$set?.totalSteps || 0,
                fencingToken: update.$set?.fencingToken || 1,
              };
              summaries.set(id, doc);
            }
            if (doc && update.$set) {
              Object.assign(doc, update.$set);
            }
            return { matchedCount: doc ? 1 : 0, modifiedCount: 1 };
          },

          async replaceOne(filter: any, doc: any, _options?: any) {
            summaries.set(filter._id, { ...doc });
            return { matchedCount: 1, modifiedCount: 1 };
          },

          async countDocuments(filter: any = {}) {
            let list = Array.from(summaries.values());
            if (filter.status?.$ne) {
              list = list.filter((s) => s.status !== filter.status.$ne);
            }
            return list.length;
          },
        };
      }

      if (name === EVENTS_COLLECTION) {
        return {
          async insertOne(doc: any) {
            events.push({ ...doc });
            return { insertedId: doc._id };
          },

          find(filter: any = {}) {
            let list = events.filter((e) => {
              if (filter.migrationId && e.migrationId !== filter.migrationId) return false;
              return true;
            });
            return {
              sort(sortObj: any) {
                if (sortObj.attemptNumber !== undefined) {
                  list.sort((a, b) => {
                    if (a.attemptNumber !== b.attemptNumber) {
                      return sortObj.attemptNumber === 1
                        ? a.attemptNumber - b.attemptNumber
                        : b.attemptNumber - a.attemptNumber;
                    }
                    if (sortObj.sequenceNumber !== undefined) {
                      return sortObj.sequenceNumber === 1
                        ? (a.sequenceNumber || 0) - (b.sequenceNumber || 0)
                        : (b.sequenceNumber || 0) - (a.sequenceNumber || 0);
                    }
                    return 0;
                  });
                } else if (sortObj.timestamp) {
                  list.sort((a, b) => a.timestamp.localeCompare(b.timestamp));
                }
                return {
                  limit(n: number) {
                    list = list.slice(0, n);
                    return {
                      async toArray() {
                        return list.map((x) => ({ ...x }));
                      },
                    };
                  },
                  async toArray() {
                    return list.map((x) => ({ ...x }));
                  },
                };
              },
              async toArray() {
                return list.map((x) => ({ ...x }));
              },
            };
          },
        };
      }

      // User collection mock
      return {
        async countDocuments(_filter: any = {}) {
          const data = collectionsData.get(name);
          return data ? data.length : 0;
        },

        async drop() {
          if (!collectionsData.has(name) && !collectionsOptions.has(name)) {
            const err: any = new Error(`Collection ${name} not found`);
            err.code = 26;
            throw err;
          }
          collectionsData.delete(name);
          collectionsOptions.delete(name);
          collectionsIndexes.delete(name);
          return true;
        },

        async createIndex(key: any, options?: any) {
          const idxs = getOrCreateCollIndexes(name);
          const indexName =
            options?.name ||
            Object.entries(key)
              .map(([k, v]) => `${k}_${v}`)
              .join("_");
          idxs.push({
            name: indexName,
            key,
            ...options,
          });
          return indexName;
        },

        async dropIndex(indexName: string) {
          const idxs = getOrCreateCollIndexes(name);
          const idx = idxs.findIndex((i) => i.name === indexName);
          if (idx === -1) {
            const err: any = new Error(`Index ${indexName} not found`);
            err.code = 27;
            throw err;
          }
          idxs.splice(idx, 1);
          return { ok: 1 };
        },

        async indexes() {
          const idxs = getOrCreateCollIndexes(name);
          return idxs.map((i) => ({ ...i }));
        },

        async updateMany(filter: any, update: any, _options?: any) {
          const data = getOrCreateCollData(name);
          let matched = 0;
          for (const item of data) {
            matched++;
            if (update.$set) Object.assign(item, update.$set);
            if (update.$unset) {
              for (const k of Object.keys(update.$unset)) {
                delete item[k];
              }
            }
          }
          return { matchedCount: matched, modifiedCount: matched };
        },

        async insertMany(docs: any[]) {
          const data = getOrCreateCollData(name);
          data.push(...docs);
          return { insertedCount: docs.length };
        },
      };
    },
  };

  return {
    db: db as Db,
    locks,
    summaries,
    events,
    collectionsData,
    collectionsIndexes,
    collectionsOptions,
  };
}

describe("mongoMigrationEngine Unit Tests (M6 Spec §4-§8)", () => {
  let tempDir: string;
  let mongoDir: string;
  let mockEngine: ReturnType<typeof createMockEngineDb>;

  beforeEach(() => {
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "relwave_engine_test_"));
    mongoDir = path.join(tempDir, "migrations", "mongo");
    fs.mkdirSync(mongoDir, { recursive: true });
    mockEngine = createMockEngineDb();
  });

  afterEach(() => {
    try {
      fs.rmSync(tempDir, { recursive: true, force: true });
    } catch {
      // ignore
    }
  });

  // =========================================================================
  // 1. Manifest Validation & Security Sandbox
  // =========================================================================
  describe("Manifest Validation & AST Security", () => {
    test("valid manifest with DDL and updateMany with down step passes validation", () => {
      const manifest: MongoMigrationManifest = {
        version: "1.0",
        id: "20261031120000",
        name: "setup_users",
        up: [
          { type: "createCollection", collection: "users" },
          {
            type: "createIndex",
            collection: "users",
            key: { email: 1 },
            options: { unique: true },
          },
          {
            type: "updateMany",
            collection: "users",
            filter: { active: { $exists: false } },
            update: { $set: { active: true } },
          },
        ],
        down: [
          {
            type: "updateMany",
            collection: "users",
            filter: { active: true },
            update: { $unset: { active: "" } },
          },
        ],
      };

      const result = validateManifest(manifest);
      expect(result.valid).toBe(true);
      expect(result.errors).toHaveLength(0);
      expect(result.stepsBreakdown.ddlCount).toBe(2);
      expect(result.stepsBreakdown.dataTransformCount).toBe(1);
      expect(result.stepsBreakdown.reversibleCount).toBe(3);
    });

    test("missing required manifest fields fails validation", () => {
      const result = validateManifest({ id: "", up: [] });
      expect(result.valid).toBe(false);
      expect(result.errors.length).toBeGreaterThan(0);
    });

    test("checksum calculation normalizes CRLF and LF", () => {
      const contentCRLF = '{\r\n  "version": "1.0",\r\n  "name": "test"\r\n}';
      const contentLF = '{\n  "version": "1.0",\n  "name": "test"\n}';
      expect(computeManifestChecksum(contentCRLF)).toBe(computeManifestChecksum(contentLF));
    });

    test("rejects deleteMany step permanently", () => {
      const manifest: any = {
        version: "1.0",
        id: "20261031120000",
        name: "delete_test",
        up: [{ type: "deleteMany", collection: "users", filter: { old: true } }],
      };
      const result = validateManifest(manifest);
      expect(result.valid).toBe(false);
      expect(result.errors[0]).toContain("deleteMany is permanently excluded");

      expect(() => assertValidManifest(manifest)).toThrow(MongoApiError);
    });

    test("rejects forbidden expressions: $where, $function, $accumulator in updateMany", () => {
      const whereManifest: any = {
        version: "1.0",
        id: "20261031120000",
        name: "where_test",
        up: [
          {
            type: "updateMany",
            collection: "users",
            filter: { $where: "this.age > 21" },
            update: { $set: { adult: true } },
          },
        ],
        down: [
          {
            type: "updateMany",
            collection: "users",
            filter: { adult: true },
            update: { $unset: { adult: "" } },
          },
        ],
      };
      const res = validateManifest(whereManifest);
      expect(res.valid).toBe(false);
      expect(res.errors.some((e) => e.includes("forbidden") && e.includes("$where"))).toBe(true);
      expect(() => assertValidManifest(whereManifest)).toThrow(MongoApiError);

      const funcManifest: any = {
        version: "1.0",
        id: "20261031120000",
        name: "func_test",
        up: [
          {
            type: "updateMany",
            collection: "users",
            filter: { age: { $gt: 20 } },
            update: { $set: { fn: { $function: { body: "function() { return 1; }" } } } },
          },
        ],
        down: [
          {
            type: "updateMany",
            collection: "users",
            filter: {},
            update: { $unset: { fn: "" } },
          },
        ],
      };
      expect(validateManifest(funcManifest).valid).toBe(false);
      expect(() => assertValidManifest(funcManifest)).toThrow(MongoApiError);
    });

    test("dropCollection requires allowIrreversible: true", () => {
      const badDrop: any = {
        version: "1.0",
        id: "20261031120000",
        name: "drop_test",
        up: [{ type: "dropCollection", collection: "old_users" }],
      };
      const resBad = validateManifest(badDrop);
      expect(resBad.valid).toBe(false);
      expect(resBad.errors[0]).toContain("allowIrreversible: true");

      const goodDrop: any = {
        ...badDrop,
        allowIrreversible: true,
      };
      expect(validateManifest(goodDrop).valid).toBe(true);
    });

    test("dropIndex rejects dropping immutable _id_ index", () => {
      const dropIdManifest: any = {
        version: "1.0",
        id: "20261031120000",
        name: "drop_id_test",
        up: [{ type: "dropIndex", collection: "users", indexName: "_id_" }],
      };
      const res = validateManifest(dropIdManifest);
      expect(res.valid).toBe(false);
      expect(res.errors[0]).toContain("cannot drop default _id_ index");
    });

    test("updateMany requires an author-provided down step", () => {
      const noDownManifest: any = {
        version: "1.0",
        id: "20261031120000",
        name: "no_down_test",
        up: [
          {
            type: "updateMany",
            collection: "users",
            filter: { active: false },
            update: { $set: { active: true } },
          },
        ],
      };
      const res = validateManifest(noDownManifest);
      expect(res.valid).toBe(false);
      expect(res.errors[0]).toContain("requires an author-provided down step");
    });
  });

  // =========================================================================
  // 2. Filesystem Security: Path Traversal, Symlinks & Max Size
  // =========================================================================
  describe("Filesystem Security & Discovery", () => {
    test("rejects path traversal containing '..' or null bytes", () => {
      expect(() => validateSafeFilePath(path.join(mongoDir, "../secret.json"), mongoDir)).toThrow(
        MongoApiError,
      );

      expect(() => validateSafeFilePath(path.join(mongoDir, "manifest\0.json"), mongoDir)).toThrow(
        MongoApiError,
      );
    });

    test("rejects files outside migration directory", () => {
      const outsideFile = path.join(tempDir, "outside.mql.json");
      fs.writeFileSync(outsideFile, "{}");

      expect(() => validateSafeFilePath(outsideFile, mongoDir)).toThrow(MongoApiError);
    });

    test("rejects oversized manifests (>1MB)", async () => {
      const bigFile = path.join(mongoDir, "20261031120000_huge.mql.json");
      // Create a file > 1MB
      const buffer = Buffer.alloc(MAX_MANIFEST_SIZE_BYTES + 10, "x");
      fs.writeFileSync(bigFile, buffer);

      await expect(applyMigration(mockEngine.db, tempDir, "20261031120000")).rejects.toThrow(
        MongoApiError,
      );

      try {
        await applyMigration(mockEngine.db, tempDir, "20261031120000");
      } catch (err: any) {
        expect(err.code).toBe("MANIFEST_SIZE_EXCEEDED");
      }
    });

    test("listMigrations discovers valid files and correctly reports pending", async () => {
      const file1 = path.join(mongoDir, "20261031120000_init_users.mql.json");
      const manifest1: MongoMigrationManifest = {
        version: "1.0",
        id: "20261031120000",
        name: "init_users",
        up: [{ type: "createCollection", collection: "users" }],
      };
      fs.writeFileSync(file1, JSON.stringify(manifest1, null, 2));

      const listRes = await listMigrations(mockEngine.db, tempDir);
      expect(listRes.pendingMigrations).toHaveLength(1);
      expect(listRes.pendingMigrations[0].id).toBe("20261031120000");
      expect(listRes.pendingMigrations[0].name).toBe("init_users");
      expect(listRes.appliedMigrations).toHaveLength(0);
      expect(listRes.isLocked).toBe(false);
    });
  });

  // =========================================================================
  // 3. Multi-Step Execution, Checkpoints & Journaling
  // =========================================================================
  describe("Multi-Step Execution & Checkpoints", () => {
    test("applies multi-step migration and records per-step events and summary", async () => {
      const file = path.join(mongoDir, "20261031120000_setup.mql.json");
      const manifest: MongoMigrationManifest = {
        version: "1.0",
        id: "20261031120000",
        name: "setup_app",
        up: [
          { type: "createCollection", collection: "users" },
          {
            type: "createIndex",
            collection: "users",
            key: { email: 1 },
            options: { unique: true },
          },
          {
            type: "setValidator",
            collection: "users",
            validator: { $jsonSchema: { bsonType: "object", required: ["email"] } },
          },
        ],
      };
      fs.writeFileSync(file, JSON.stringify(manifest, null, 2));

      const res = await applyMigration(mockEngine.db, tempDir, "20261031120000");
      expect(res.success).toBe(true);
      expect(res.appliedCount).toBe(1);
      expect(res.results[0].status).toBe("APPLIED");
      expect(res.results[0].executedSteps).toBe(3);

      // Verify materialized summary in _relwave_migrations
      const summary = mockEngine.summaries.get("20261031120000");
      expect(summary).toBeDefined();
      expect(summary?.status).toBe("APPLIED");
      expect(summary?.executedSteps).toBe(3);
      expect(summary?.fencingToken).toBe(1);

      // Verify events in _relwave_migration_events
      const eventTypes = mockEngine.events.map((e) => e.eventType);
      expect(eventTypes).toContain("VALIDATION_SUCCESS");
      expect(eventTypes).toContain("LOCK_ACQUIRED");
      expect(eventTypes).toContain("MIGRATION_START");
      expect(eventTypes).toContain("STEP_START");
      expect(eventTypes).toContain("STEP_COMPLETE");
      expect(eventTypes).toContain("MIGRATION_APPLIED");
      expect(eventTypes).toContain("LOCK_RELEASED");

      // Verify lock was safely released
      expect(mockEngine.locks.get(LOCK_DOC_ID)?.ownerId).toBeNull();
    });

    test("cannot re-apply an already applied migration", async () => {
      const file = path.join(mongoDir, "20261031120000_setup.mql.json");
      const manifest: MongoMigrationManifest = {
        version: "1.0",
        id: "20261031120000",
        name: "setup",
        up: [{ type: "createCollection", collection: "items" }],
      };
      fs.writeFileSync(file, JSON.stringify(manifest, null, 2));

      await applyMigration(mockEngine.db, tempDir, "20261031120000");

      await expect(applyMigration(mockEngine.db, tempDir, "20261031120000")).rejects.toThrow(
        MongoApiError,
      );

      try {
        await applyMigration(mockEngine.db, tempDir, "20261031120000");
      } catch (err: any) {
        expect(err.code).toBe("MIGRATION_ALREADY_APPLIED");
      }
    });

    test("rejects if manifest content was tampered with after applying (checksum mismatch)", async () => {
      const file = path.join(mongoDir, "20261031120000_setup.mql.json");
      const manifest: MongoMigrationManifest = {
        version: "1.0",
        id: "20261031120000",
        name: "setup",
        up: [{ type: "createCollection", collection: "items" }],
      };
      fs.writeFileSync(file, JSON.stringify(manifest, null, 2));
      await applyMigration(mockEngine.db, tempDir, "20261031120000");

      // Tamper with file
      manifest.name = "tampered_name";
      fs.writeFileSync(file, JSON.stringify(manifest, null, 2));

      await expect(applyMigration(mockEngine.db, tempDir, "20261031120000")).rejects.toThrow(
        MongoApiError,
      );

      try {
        await applyMigration(mockEngine.db, tempDir, "20261031120000");
      } catch (err: any) {
        expect(err.code).toBe("CHECKSUM_MISMATCH");
      }
    });
  });

  // =========================================================================
  // 4. Failure Unwind & Reverse Compensation State Machine
  // =========================================================================
  describe("Failure Unwind & Reverse Compensation", () => {
    test("intermediate step failure triggers reverse compensation -> ROLLED_BACK", async () => {
      const file = path.join(mongoDir, "20261031120000_failing.mql.json");
      const manifest: MongoMigrationManifest = {
        version: "1.0",
        id: "20261031120000",
        name: "partial_fail",
        up: [
          { type: "createCollection", collection: "accounts" },
          {
            type: "createIndex",
            collection: "accounts",
            key: { username: 1 },
            options: { name: "idx_user" },
          },
          // Step 3 will fail because collection "nonexistent" is missing for dropIndex
          { type: "dropIndex", collection: "nonexistent_collection", indexName: "nonexistent_idx" },
        ],
      };
      fs.writeFileSync(file, JSON.stringify(manifest, null, 2));

      await expect(applyMigration(mockEngine.db, tempDir, "20261031120000")).rejects.toThrow();

      // Check summary
      const summary = mockEngine.summaries.get("20261031120000");
      expect(summary?.status).toBe("ROLLED_BACK");

      // Check events recorded reverse compensation
      const eventTypes = mockEngine.events.map((e) => e.eventType);
      expect(eventTypes).toContain("STEP_FAILED");
      expect(eventTypes).toContain("COMPENSATION_START");
      expect(eventTypes).toContain("COMPENSATION_COMPLETE");
      expect(eventTypes).toContain("MIGRATION_ROLLED_BACK");

      // Verify that step 1 (createCollection) was compensated by dropping collection
      expect(mockEngine.collectionsData.has("accounts")).toBe(false);
      // Verify lock was released
      expect(mockEngine.locks.get(LOCK_DOC_ID)?.ownerId).toBeNull();
    });

    test("count-guarded createCollection compensation aborts when external data present -> FAILED_MANUAL_INTERVENTION_REQUIRED", async () => {
      const file = path.join(mongoDir, "20261031120000_countguard.mql.json");
      const manifest: MongoMigrationManifest = {
        version: "1.0",
        id: "20261031120000",
        name: "count_guard_test",
        up: [
          { type: "createCollection", collection: "wallets" },
          // Step 2 fails deliberately
          { type: "dropIndex", collection: "missing_coll", indexName: "missing_idx" },
        ],
      };
      fs.writeFileSync(file, JSON.stringify(manifest, null, 2));

      // Hook into collection creation to simulate external data insertion before compensation
      const originalCreateCollection = mockEngine.db.createCollection;
      mockEngine.db.createCollection = async (name: string, options?: any) => {
        const res = await originalCreateCollection.call(mockEngine.db, name, options);
        if (name === "wallets") {
          // Simulate concurrent insertion of an external document
          mockEngine.collectionsData.get("wallets")!.push({ _id: "doc1", balance: 100 });
        }
        return res;
      };

      await expect(applyMigration(mockEngine.db, tempDir, "20261031120000")).rejects.toThrow();

      // Summary must transition to FAILED_MANUAL_INTERVENTION_REQUIRED
      const summary = mockEngine.summaries.get("20261031120000");
      expect(summary?.status).toBe("FAILED_MANUAL_INTERVENTION_REQUIRED");

      const eventTypes = mockEngine.events.map((e) => e.eventType);
      expect(eventTypes).toContain("COMPENSATION_FAILED");
      expect(eventTypes).toContain("MANUAL_INTERVENTION_REQUIRED");

      // Wallets collection was NOT dropped (data preserved!)
      expect(mockEngine.collectionsData.has("wallets")).toBe(true);
      expect(mockEngine.collectionsData.get("wallets")!).toHaveLength(1);
    });

    test("pre-step fencing loss marks STEP_UNCERTAIN and halts execution immediately", async () => {
      const file = path.join(mongoDir, "20261031120000_fencing.mql.json");
      const manifest: MongoMigrationManifest = {
        version: "1.0",
        id: "20261031120000",
        name: "fencing_loss_test",
        up: [
          { type: "createCollection", collection: "products" },
          { type: "createIndex", collection: "products", key: { sku: 1 } },
        ],
      };
      fs.writeFileSync(file, JSON.stringify(manifest, null, 2));

      // Hook step 1 to simulate lock stolen by another client
      const origCreateCollection = mockEngine.db.createCollection;
      mockEngine.db.createCollection = async (name: string, options?: any) => {
        const res = await origCreateCollection.call(mockEngine.db, name, options);
        // Another client steals the lock and increments fencingToken
        const lock = mockEngine.locks.get(LOCK_DOC_ID)!;
        lock.ownerId = "client-B";
        lock.fencingToken = lock.fencingToken + 1;
        return res;
      };

      let thrownError: any;
      try {
        await applyMigration(mockEngine.db, tempDir, "20261031120000");
      } catch (err: any) {
        thrownError = err;
      }
      expect(thrownError).toBeInstanceOf(MongoApiError);
      expect(thrownError.code).toBe("LOCK_LOST_FENCING_VIOLATION");

      const eventTypes = mockEngine.events.map((e) => e.eventType);
      expect(eventTypes).toContain("STEP_UNCERTAIN");
      expect(eventTypes).toContain("MANUAL_INTERVENTION_REQUIRED");

      const summary = mockEngine.summaries.get("20261031120000");
      expect(summary?.status).toBe("CRASHED_UNCERTAIN");
    });
  });

  // =========================================================================
  // 5. Rollback Method & Read-Only Checks
  // =========================================================================
  describe("Rollback & Read-Only Enforcement", () => {
    test("rollback cleans up applied steps in reverse order", async () => {
      const file = path.join(mongoDir, "20261031120000_rollback.mql.json");
      const manifest: MongoMigrationManifest = {
        version: "1.0",
        id: "20261031120000",
        name: "for_rollback",
        up: [
          { type: "createCollection", collection: "books" },
          {
            type: "createIndex",
            collection: "books",
            key: { isbn: 1 },
            options: { name: "idx_isbn" },
          },
        ],
      };
      fs.writeFileSync(file, JSON.stringify(manifest, null, 2));

      await applyMigration(mockEngine.db, tempDir, "20261031120000");
      expect(mockEngine.collectionsData.has("books")).toBe(true);

      const rollRes = await rollbackMigration(mockEngine.db, "20261031120000", tempDir);
      expect(rollRes.success).toBe(true);
      expect(rollRes.status).toBe("ROLLED_BACK");
      expect(rollRes.stepsCompensated).toBe(2);

      expect(mockEngine.collectionsData.has("books")).toBe(false);
      const summary = mockEngine.summaries.get("20261031120000");
      expect(summary?.status).toBe("ROLLED_BACK");
    });

    test("rejects apply and rollback on read-only database connections", async () => {
      const file = path.join(mongoDir, "20261031120000_readonly.mql.json");
      fs.writeFileSync(
        file,
        JSON.stringify({
          version: "1.0",
          id: "20261031120000",
          name: "ro_test",
          up: [{ type: "createCollection", collection: "ro_coll" }],
        }),
      );

      await expect(
        applyMigration(mockEngine.db, tempDir, "20261031120000", { readOnly: true }),
      ).rejects.toThrow(MongoApiError);

      try {
        await applyMigration(mockEngine.db, tempDir, "20261031120000", { readOnly: true });
      } catch (err: any) {
        expect(err.code).toBe("MONGO_READ_ONLY");
      }

      await expect(
        rollbackMigration(mockEngine.db, "20261031120000", tempDir, { readOnly: true }),
      ).rejects.toThrow(MongoApiError);

      try {
        await rollbackMigration(mockEngine.db, "20261031120000", tempDir, { readOnly: true });
      } catch (err: any) {
        expect(err.code).toBe("MONGO_READ_ONLY");
      }
    });
  });

  // =========================================================================
  // 6. rebuildMigrationSummary Projection Rebuild
  // =========================================================================
  describe("rebuildMigrationSummary", () => {
    test("rebuilds summary from event stream correctly after simulated crash", async () => {
      const migrationId = "20261031120000";
      // Simulate events recorded in _relwave_migration_events
      mockEngine.events.push(
        {
          _id: `${migrationId}_meta_MIGRATION_START_1`,
          eventId: "e1",
          migrationId,
          attemptId: "att1",
          attemptNumber: 1,
          sequenceNumber: 1,
          eventType: "MIGRATION_START",
          timestamp: "2026-10-31T12:00:00.000Z",
          lockOwnerId: "worker-1",
          fencingToken: 1,
        },
        {
          _id: `${migrationId}_0_STEP_START_1`,
          eventId: "e2",
          migrationId,
          attemptId: "att1",
          attemptNumber: 1,
          sequenceNumber: 2,
          stepIndex: 0,
          stepType: "createCollection",
          eventType: "STEP_START",
          timestamp: "2026-10-31T12:00:01.000Z",
          lockOwnerId: "worker-1",
          fencingToken: 1,
        },
        {
          _id: `${migrationId}_0_STEP_COMPLETE_1`,
          eventId: "e3",
          migrationId,
          attemptId: "att1",
          attemptNumber: 1,
          sequenceNumber: 3,
          stepIndex: 0,
          stepType: "createCollection",
          eventType: "STEP_COMPLETE",
          timestamp: "2026-10-31T12:00:02.000Z",
          lockOwnerId: "worker-1",
          fencingToken: 1,
          metadata: { durationMs: 25 },
        },
        {
          _id: `${migrationId}_meta_MIGRATION_APPLIED_1`,
          eventId: "e4",
          migrationId,
          attemptId: "att1",
          attemptNumber: 1,
          sequenceNumber: 4,
          eventType: "MIGRATION_APPLIED",
          timestamp: "2026-10-31T12:00:03.000Z",
          lockOwnerId: "worker-1",
          fencingToken: 1,
        },
      );

      // Rebuild summary
      const rebuilt = await rebuildMigrationSummary(mockEngine.db, migrationId);
      expect(rebuilt._id).toBe(migrationId);
      expect(rebuilt.status).toBe("APPLIED");
      expect(rebuilt.executedSteps).toBe(1);
      expect(rebuilt.durationMs).toBe(25);
      expect(rebuilt.fencingToken).toBe(1);
      expect(rebuilt.appliedBy).toBe("worker-1");

      const saved = mockEngine.summaries.get(migrationId);
      expect(saved?.status).toBe("APPLIED");
    });

    test("detects dangling STEP_START as CRASHED_UNCERTAIN", async () => {
      const migrationId = "20261031999999";
      mockEngine.events.push(
        {
          _id: `${migrationId}_meta_MIGRATION_START_1`,
          eventId: "e1",
          migrationId,
          attemptId: "att1",
          attemptNumber: 1,
          sequenceNumber: 1,
          eventType: "MIGRATION_START",
          timestamp: "2026-10-31T12:00:00.000Z",
          lockOwnerId: "worker-1",
          fencingToken: 1,
        },
        {
          _id: `${migrationId}_0_STEP_START_1`,
          eventId: "e2",
          migrationId,
          attemptId: "att1",
          attemptNumber: 1,
          sequenceNumber: 2,
          stepIndex: 0,
          stepType: "createIndex",
          eventType: "STEP_START",
          timestamp: "2026-10-31T12:00:01.000Z",
          lockOwnerId: "worker-1",
          fencingToken: 1,
        },
      );

      const rebuilt = await rebuildMigrationSummary(mockEngine.db, migrationId);
      expect(rebuilt.status).toBe("CRASHED_UNCERTAIN");
    });

    test("handles multiple attempts: failed attempt followed by successful attempt rebuilds to APPLIED", async () => {
      const migrationId = "20261031888888";
      // Attempt 1: Started and rolled back
      mockEngine.events.push(
        {
          _id: `${migrationId}_a1_s1`,
          eventId: "att1-e1",
          migrationId,
          attemptId: "att-1",
          attemptNumber: 1,
          sequenceNumber: 1,
          eventType: "MIGRATION_START",
          timestamp: "2026-10-31T12:00:00.000Z",
          lockOwnerId: "worker-1",
          fencingToken: 1,
        },
        {
          _id: `${migrationId}_a1_s2`,
          eventId: "att1-e2",
          migrationId,
          attemptId: "att-1",
          attemptNumber: 1,
          sequenceNumber: 2,
          stepIndex: 0,
          stepType: "createCollection",
          eventType: "STEP_START",
          timestamp: "2026-10-31T12:00:01.000Z",
          lockOwnerId: "worker-1",
          fencingToken: 1,
        },
        {
          _id: `${migrationId}_a1_s3`,
          eventId: "att1-e3",
          migrationId,
          attemptId: "att-1",
          attemptNumber: 1,
          sequenceNumber: 3,
          stepIndex: 0,
          stepType: "createCollection",
          eventType: "STEP_FAILED",
          timestamp: "2026-10-31T12:00:02.000Z",
          lockOwnerId: "worker-1",
          fencingToken: 1,
          metadata: { error: { message: "Simulated failure in attempt 1" } },
        },
        {
          _id: `${migrationId}_a1_s4`,
          eventId: "att1-e4",
          migrationId,
          attemptId: "att-1",
          attemptNumber: 1,
          sequenceNumber: 4,
          eventType: "MIGRATION_ROLLED_BACK",
          timestamp: "2026-10-31T12:00:03.000Z",
          lockOwnerId: "worker-1",
          fencingToken: 1,
        },
      );

      // Attempt 2: Succeeds
      mockEngine.events.push(
        {
          _id: `${migrationId}_a2_s1`,
          eventId: "att2-e1",
          migrationId,
          attemptId: "att-2",
          attemptNumber: 2,
          sequenceNumber: 1,
          eventType: "MIGRATION_START",
          timestamp: "2026-10-31T12:01:00.000Z",
          lockOwnerId: "worker-2",
          fencingToken: 2,
        },
        {
          _id: `${migrationId}_a2_s2`,
          eventId: "att2-e2",
          migrationId,
          attemptId: "att-2",
          attemptNumber: 2,
          sequenceNumber: 2,
          stepIndex: 0,
          stepType: "createCollection",
          eventType: "STEP_START",
          timestamp: "2026-10-31T12:01:01.000Z",
          lockOwnerId: "worker-2",
          fencingToken: 2,
        },
        {
          _id: `${migrationId}_a2_s3`,
          eventId: "att2-e3",
          migrationId,
          attemptId: "att-2",
          attemptNumber: 2,
          sequenceNumber: 3,
          stepIndex: 0,
          stepType: "createCollection",
          eventType: "STEP_COMPLETE",
          timestamp: "2026-10-31T12:01:02.000Z",
          lockOwnerId: "worker-2",
          fencingToken: 2,
          metadata: { durationMs: 15 },
        },
        {
          _id: `${migrationId}_a2_s4`,
          eventId: "att2-e4",
          migrationId,
          attemptId: "att-2",
          attemptNumber: 2,
          sequenceNumber: 4,
          eventType: "MIGRATION_APPLIED",
          timestamp: "2026-10-31T12:01:03.000Z",
          lockOwnerId: "worker-2",
          fencingToken: 2,
        },
      );

      const rebuilt = await rebuildMigrationSummary(mockEngine.db, migrationId, {
        version: "1.0",
        id: migrationId,
        name: "multi_attempt_test",
        up: [{ type: "createCollection", collection: "multi_coll" }],
      });

      expect(rebuilt.status).toBe("APPLIED");
      expect(rebuilt.executedSteps).toBe(1);
      expect(rebuilt.attemptNumber).toBe(2);
      expect(rebuilt.attemptId).toBe("att-2");
      expect(rebuilt.appliedBy).toBe("worker-2");
    });
  });

  // =========================================================================
  // 7. getMigrationStatus
  // =========================================================================
  describe("getMigrationStatus", () => {
    test("returns summary, events, and lock status", async () => {
      const file = path.join(mongoDir, "20261031120000_status.mql.json");
      fs.writeFileSync(
        file,
        JSON.stringify({
          version: "1.0",
          id: "20261031120000",
          name: "status_test",
          up: [{ type: "createCollection", collection: "status_coll" }],
        }),
      );

      await applyMigration(mockEngine.db, tempDir, "20261031120000");

      const statusRes = await getMigrationStatus(mockEngine.db, "20261031120000");
      expect(statusRes.migration?.status).toBe("APPLIED");
      expect(statusRes.events?.length).toBeGreaterThan(0);
      expect(statusRes.lockStatus.isLocked).toBe(false);
      expect(statusRes.lastAppliedVersion).toBe("20261031120000");
    });
  });

  // =========================================================================
  // 8. Safety Audit Hardening & Compensation (Phase 3)
  // =========================================================================
  describe("Safety Audit Hardening & Compensation (Phase 3)", () => {
    test("event journal assigns unique deterministic _id and monotonic sequenceNumber", async () => {
      const file = path.join(mongoDir, "20261031120000_sequential_events.mql.json");
      fs.writeFileSync(
        file,
        JSON.stringify({
          version: "1.0",
          id: "20261031120000",
          name: "sequential_events",
          up: [
            { type: "createCollection", collection: "seq_coll1" },
            { type: "createCollection", collection: "seq_coll2" },
          ],
        }),
      );

      const res = await applyMigration(mockEngine.db, tempDir, "20261031120000");
      expect(res.success).toBe(true);

      const events = mockEngine.events.filter((e) => e.migrationId === "20261031120000");
      expect(events.length).toBeGreaterThanOrEqual(4);

      const seenIds = new Set<string>();
      let expectedSeq = 1;
      for (const ev of events) {
        expect(ev.sequenceNumber).toBe(expectedSeq);
        expect(ev._id).toBe(`20261031120000_a1_s${expectedSeq}`);
        expect(seenIds.has(ev._id)).toBe(false);
        seenIds.add(ev._id);
        expectedSeq++;
      }
    });

    test("dry-run does not acquire lock or write events", async () => {
      const file = path.join(mongoDir, "20261031120000_dry_run.mql.json");
      fs.writeFileSync(
        file,
        JSON.stringify({
          version: "1.0",
          id: "20261031120000",
          name: "dry_run_test",
          up: [{ type: "createCollection", collection: "dry_coll" }],
        }),
      );

      const result = await applyMigration(mockEngine.db, tempDir, "20261031120000", {
        dryRun: true,
      });
      expect(result.success).toBe(true);
      expect(result.results[0].status).toBe("PENDING");

      // Lock was not acquired
      expect(mockEngine.locks.size).toBe(0);

      // No events written
      expect(mockEngine.events.length).toBe(0);

      // No collection created
      expect(mockEngine.collectionsData.has("dry_coll")).toBe(false);
    });

    test("compensation of createCollection halts when collection is non-empty", async () => {
      const file = path.join(mongoDir, "20261031120000_guard_coll.mql.json");
      fs.writeFileSync(
        file,
        JSON.stringify({
          version: "1.0",
          id: "20261031120000",
          name: "guard_coll_test",
          up: [
            { type: "createCollection", collection: "guard_coll" },
            { type: "createCollection", collection: "failing_coll" },
          ],
        }),
      );

      const origCreateCollection = mockEngine.db.createCollection;
      mockEngine.db.createCollection = async function (name: string, options?: any) {
        if (name === "failing_coll") {
          // Simulate user documents written to guard_coll before second step fails
          mockEngine.collectionsData.get("guard_coll")!.push({ _id: 1, name: "external doc" });
          throw new Error("Simulated failure on second step");
        }
        return origCreateCollection.call(this, name, options);
      };

      await expect(applyMigration(mockEngine.db, tempDir, "20261031120000")).rejects.toThrow(
        "Simulated failure on second step",
      );

      const summary = mockEngine.summaries.get("20261031120000");
      expect(summary?.status).toBe("FAILED_MANUAL_INTERVENTION_REQUIRED");
      expect((summary?.error as any)?.message).toContain(
        "contains 1 documents added after creation",
      );

      // guard_coll must NOT be dropped
      expect(mockEngine.collectionsData.has("guard_coll")).toBe(true);
      expect(mockEngine.collectionsData.get("guard_coll")?.length).toBe(1);
    });

    test("compensation of dropIndex throws when pre-state is missing and down block is absent", async () => {
      await expect(
        compensateStep(
          mockEngine.db,
          { type: "dropIndex", collection: "orders", indexName: "idx_custom" },
          null, // missing preState
          undefined, // no down block
        ),
      ).rejects.toThrow(MongoApiError);

      try {
        await compensateStep(
          mockEngine.db,
          { type: "dropIndex", collection: "orders", indexName: "idx_custom" },
          null,
          undefined,
        );
      } catch (err: any) {
        expect(err.code).toBe("COMPENSATION_FAILED");
        expect(err.message).toContain(
          "pre-state missing and no matching createIndex found in down steps",
        );
      }
    });

    test("in-flight heartbeat loss causes pre-step fencing failure", async () => {
      const file = path.join(mongoDir, "20261031120000_fencing_loss.mql.json");
      fs.writeFileSync(
        file,
        JSON.stringify({
          version: "1.0",
          id: "20261031120000",
          name: "fencing_loss_test",
          up: [
            { type: "createCollection", collection: "fence_coll1" },
            { type: "createCollection", collection: "fence_coll2" },
          ],
        }),
      );

      let step = 0;
      const origCreateCollection = mockEngine.db.createCollection;
      mockEngine.db.createCollection = async function (name: string, options?: any) {
        step++;
        const res = await origCreateCollection.call(this, name, options);
        if (step === 1) {
          // Lease stolen by another worker
          const lockDoc = mockEngine.locks.get(LOCK_DOC_ID);
          if (lockDoc) {
            lockDoc.ownerId = "stealing-worker";
            lockDoc.fencingToken = 99;
          }
        }
        return res;
      };

      try {
        await applyMigration(mockEngine.db, tempDir, "20261031120000");
        expect(true).toBe(false); // should not reach
      } catch (err: any) {
        expect(err).toBeInstanceOf(MongoApiError);
        expect(err.code).toBe("LOCK_LOST_FENCING_VIOLATION");
      }

      const summary = mockEngine.summaries.get("20261031120000");
      expect(summary?.status).toBe("CRASHED_UNCERTAIN");

      const events = mockEngine.events.filter((e) => e.migrationId === "20261031120000");
      expect(events.some((e) => e.eventType === "STEP_UNCERTAIN")).toBe(true);
      expect(events.some((e) => e.eventType === "MANUAL_INTERVENTION_REQUIRED")).toBe(true);
    });
  });
});
