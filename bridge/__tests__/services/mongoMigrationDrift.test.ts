import { describe, expect, test, beforeEach, afterEach } from "@jest/globals";
import fs from "fs";
import path from "path";
import os from "os";
import { Db } from "mongodb";
import {
  computeManifestChecksum,
  listMigrations,
  MAX_MANIFEST_SIZE_BYTES,
  MIGRATIONS_COLLECTION,
} from "../../src/services/mongoMigrationEngine";
import { LOCK_COLLECTION } from "../../src/services/mongoMigrationLock";
import { MongoMigrationSummary } from "../../src/types/mongoMigration";

function createDriftTestDb(summaries: MongoMigrationSummary[]) {
  const summaryMap = new Map<string, MongoMigrationSummary>();
  for (const s of summaries) {
    summaryMap.set(s._id, { ...s });
  }

  const writeCalls: string[] = [];

  const db: any = {
    collection(name: string) {
      if (name === LOCK_COLLECTION) {
        return {
          async findOne() {
            return null; // No active lock
          },
        };
      }

      if (name === MIGRATIONS_COLLECTION) {
        return {
          find() {
            return {
              sort() {
                return {
                  async toArray() {
                    return Array.from(summaryMap.values());
                  },
                };
              },
            };
          },
          async updateOne() {
            writeCalls.push("updateOne");
            return { matchedCount: 1, modifiedCount: 1 };
          },
          async findOneAndUpdate() {
            writeCalls.push("findOneAndUpdate");
            return null;
          },
          async insertOne() {
            writeCalls.push("insertOne");
            return { insertedId: "test" };
          },
          async deleteOne() {
            writeCalls.push("deleteOne");
            return { deletedCount: 1 };
          },
        };
      }

      return {
        find() {
          return {
            toArray: async () => [],
          };
        },
      };
    },
    getWriteCalls: () => writeCalls,
  };

  return db;
}

describe("mongoMigrationDrift", () => {
  let tempProjectRoot: string;
  let migrationsDir: string;

  beforeEach(() => {
    tempProjectRoot = fs.mkdtempSync(path.join(os.tmpdir(), "relwave-drift-"));
    migrationsDir = path.join(tempProjectRoot, "migrations", "mongo");
    fs.mkdirSync(migrationsDir, { recursive: true });
  });

  afterEach(() => {
    try {
      fs.rmSync(tempProjectRoot, { recursive: true, force: true });
    } catch {
      // Cleanup best effort
    }
  });

  describe("Three-State Precedence & Drift Classification", () => {
    test("Precedence 1: flags UNVERIFIABLE with MANIFEST_MISSING when applied migration has no on-disk file", async () => {
      const db = createDriftTestDb([
        {
          _id: "20261031120000",
          name: "Add Users Collection",
          checksum: "a1b2c3d4e5f6a1b2c3d4e5f6a1b2c3d4e5f6a1b2c3d4e5f6a1b2c3d4e5f6a1b2",
          status: "APPLIED",
          startedAt: "2026-10-31T12:00:00Z",
          executedSteps: 1,
          totalSteps: 1,
          fencingToken: 1,
        },
      ]);

      const res = await listMigrations(db as Db, tempProjectRoot);
      expect(res.appliedMigrations.length).toBe(1);
      const applied = res.appliedMigrations[0];
      expect(applied.driftStatus).toBe("UNVERIFIABLE");
      expect(applied.drifted).toBe(false);
      expect(applied.driftDetails?.reason).toBe("MANIFEST_MISSING");
      expect(applied.driftDetails?.message).toContain("not found");
    });

    test("Precedence 2: flags UNVERIFIABLE with MANIFEST_PARSE_ERROR when multiple on-disk manifest files produce duplicate migration IDs", async () => {
      const manifestContent = JSON.stringify({
        version: "1.0",
        id: "20261031120000",
        name: "Duplicate One",
        up: [{ type: "createCollection", collection: "test" }],
      });
      fs.writeFileSync(
        path.join(migrationsDir, "20261031120000_a.mql.json"),
        manifestContent,
        "utf8",
      );
      fs.writeFileSync(
        path.join(migrationsDir, "20261031120000_b.mql.json"),
        manifestContent,
        "utf8",
      );

      const db = createDriftTestDb([
        {
          _id: "20261031120000",
          name: "Duplicate Test",
          checksum: computeManifestChecksum(manifestContent),
          status: "APPLIED",
          startedAt: "2026-10-31T12:00:00Z",
          executedSteps: 1,
          totalSteps: 1,
          fencingToken: 1,
        },
      ]);

      const res = await listMigrations(db as Db, tempProjectRoot);
      const applied = res.appliedMigrations[0];
      expect(applied.driftStatus).toBe("UNVERIFIABLE");
      expect(applied.drifted).toBe(false);
      expect(applied.driftDetails?.reason).toBe("MANIFEST_PARSE_ERROR");
      expect(applied.driftDetails?.message).toContain("Multiple manifest files");
      expect(applied.driftDetails?.message).toContain("20261031120000_a.mql.json");
      expect(applied.driftDetails?.message).toContain("20261031120000_b.mql.json");
      expect(res.pendingMigrations.length).toBe(0);
    });

    test("Precedence 2: flags UNVERIFIABLE with MANIFEST_PARSE_ERROR when manifest exceeds 1MB without reading file content", async () => {
      const filename = "20261031120000_oversized.mql.json";
      const filePath = path.join(migrationsDir, filename);

      const header = Buffer.from('{"version":"1.0","id":"20261031120000","name":"large","pad":"');
      const footer = Buffer.from('"}');
      const padSize = MAX_MANIFEST_SIZE_BYTES + 100 - header.length - footer.length;
      const pad = Buffer.alloc(padSize, "x");
      const fullContent = Buffer.concat([header, pad, footer]);
      fs.writeFileSync(filePath, fullContent);

      const db = createDriftTestDb([
        {
          _id: "20261031120000",
          name: "Oversized Test",
          checksum: "somehash",
          status: "APPLIED",
          startedAt: "2026-10-31T12:00:00Z",
          executedSteps: 1,
          totalSteps: 1,
          fencingToken: 1,
        },
      ]);

      const res = await listMigrations(db as Db, tempProjectRoot);
      const applied = res.appliedMigrations[0];
      expect(applied.driftStatus).toBe("UNVERIFIABLE");
      expect(applied.drifted).toBe(false);
      expect(applied.driftDetails?.reason).toBe("MANIFEST_PARSE_ERROR");
      expect(applied.driftDetails?.message).toContain("exceeds 1MB limit");
    });

    test("Precedence 2: flags UNVERIFIABLE with MANIFEST_PARSE_ERROR when on-disk manifest contains invalid JSON", async () => {
      const filename = "20261031120000_corrupt.mql.json";
      fs.writeFileSync(path.join(migrationsDir, filename), "{ corrupt json: not closed", "utf8");

      const db = createDriftTestDb([
        {
          _id: "20261031120000",
          name: "Corrupt Test",
          checksum: "somehash",
          status: "APPLIED",
          startedAt: "2026-10-31T12:00:00Z",
          executedSteps: 1,
          totalSteps: 1,
          fencingToken: 1,
        },
      ]);

      const res = await listMigrations(db as Db, tempProjectRoot);
      const applied = res.appliedMigrations[0];
      expect(applied.driftStatus).toBe("UNVERIFIABLE");
      expect(applied.drifted).toBe(false);
      expect(applied.driftDetails?.reason).toBe("MANIFEST_PARSE_ERROR");
      expect(applied.driftDetails?.message).toContain("Failed to parse manifest JSON");
    });

    test("Precedence 2: associates corrupt JSON manifest with applied migration via filename-derived 14-digit timestamp ID", async () => {
      const filename = "20261031154500_corrupt_manifest.mql.json";
      fs.writeFileSync(path.join(migrationsDir, filename), "broken json syntax", "utf8");

      const db = createDriftTestDb([
        {
          _id: "20261031154500",
          name: "Corrupt Test Timestamp",
          checksum: "hash123",
          status: "APPLIED",
          startedAt: "2026-10-31T15:45:00Z",
          executedSteps: 1,
          totalSteps: 1,
          fencingToken: 1,
        },
      ]);

      const res = await listMigrations(db as Db, tempProjectRoot);
      const applied = res.appliedMigrations[0];
      expect(applied._id).toBe("20261031154500");
      expect(applied.driftStatus).toBe("UNVERIFIABLE");
      expect(applied.driftDetails?.reason).toBe("MANIFEST_PARSE_ERROR");
    });

    test("Precedence 3: flags UNVERIFIABLE with RECORDED_CHECKSUM_MISSING when database record has empty checksum", async () => {
      const manifestContent = JSON.stringify({
        version: "1.0",
        id: "20261031120000",
        name: "Legacy Migration",
        up: [{ type: "createCollection", collection: "orders" }],
      });
      fs.writeFileSync(
        path.join(migrationsDir, "20261031120000_orders.mql.json"),
        manifestContent,
        "utf8",
      );

      const db = createDriftTestDb([
        {
          _id: "20261031120000",
          name: "Legacy Migration",
          checksum: "", // Empty baseline checksum
          status: "APPLIED",
          startedAt: "2026-10-31T12:00:00Z",
          executedSteps: 1,
          totalSteps: 1,
          fencingToken: 1,
        },
      ]);

      const res = await listMigrations(db as Db, tempProjectRoot);
      const applied = res.appliedMigrations[0];
      expect(applied.driftStatus).toBe("UNVERIFIABLE");
      expect(applied.drifted).toBe(false);
      expect(applied.driftDetails?.reason).toBe("RECORDED_CHECKSUM_MISSING");
      expect(applied.driftDetails?.actualChecksum).toBe(computeManifestChecksum(manifestContent));
      expect(applied.driftDetails?.message).toContain("no baseline checksum");
    });

    test("Precedence 4: flags VERIFIED with CHECKSUM_MATCH when on-disk manifest SHA-256 matches recorded checksum", async () => {
      const manifestContent = JSON.stringify({
        version: "1.0",
        id: "20261031120000",
        name: "Verified Migration",
        up: [{ type: "createCollection", collection: "users" }],
      });
      fs.writeFileSync(
        path.join(migrationsDir, "20261031120000_users.mql.json"),
        manifestContent,
        "utf8",
      );
      const computedHash = computeManifestChecksum(manifestContent);

      const db = createDriftTestDb([
        {
          _id: "20261031120000",
          name: "Verified Migration",
          checksum: computedHash,
          status: "APPLIED",
          startedAt: "2026-10-31T12:00:00Z",
          executedSteps: 1,
          totalSteps: 1,
          fencingToken: 1,
        },
      ]);

      const res = await listMigrations(db as Db, tempProjectRoot);
      const applied = res.appliedMigrations[0];
      expect(applied.driftStatus).toBe("VERIFIED");
      expect(applied.drifted).toBe(false);
      expect(applied.driftDetails?.reason).toBe("CHECKSUM_MATCH");
      expect(applied.driftDetails?.expectedChecksum).toBe(computedHash);
      expect(applied.driftDetails?.actualChecksum).toBe(computedHash);
    });

    test("Precedence 5: flags DRIFTED with CHECKSUM_MISMATCH when on-disk manifest content has been altered", async () => {
      const manifestContent = JSON.stringify({
        version: "1.0",
        id: "20261031120000",
        name: "Drifted Migration",
        up: [{ type: "createCollection", collection: "altered" }],
      });
      fs.writeFileSync(
        path.join(migrationsDir, "20261031120000_drifted.mql.json"),
        manifestContent,
        "utf8",
      );
      const onDiskHash = computeManifestChecksum(manifestContent);

      const db = createDriftTestDb([
        {
          _id: "20261031120000",
          name: "Drifted Migration",
          checksum: "e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855",
          status: "APPLIED",
          startedAt: "2026-10-31T12:00:00Z",
          executedSteps: 1,
          totalSteps: 1,
          fencingToken: 1,
        },
      ]);

      const res = await listMigrations(db as Db, tempProjectRoot);
      const applied = res.appliedMigrations[0];
      expect(applied.driftStatus).toBe("DRIFTED");
      expect(applied.drifted).toBe(true);
      expect(applied.driftDetails?.reason).toBe("CHECKSUM_MISMATCH");
      expect(applied.driftDetails?.expectedChecksum).toBe(
        "e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855",
      );
      expect(applied.driftDetails?.actualChecksum).toBe(onDiskHash);
    });
  });

  describe("Execution Semantics Immutability", () => {
    test("does not modify recorded checksums or write to _relwave_migrations during listMigrations", async () => {
      const manifestContent = JSON.stringify({
        version: "1.0",
        id: "20261031120000",
        name: "Immutability Test",
        up: [],
      });
      fs.writeFileSync(
        path.join(migrationsDir, "20261031120000_immut.mql.json"),
        manifestContent,
        "utf8",
      );

      const db = createDriftTestDb([
        {
          _id: "20261031120000",
          name: "Immutability Test",
          checksum: "hash_differs_from_disk",
          status: "APPLIED",
          startedAt: "2026-10-31T12:00:00Z",
          executedSteps: 0,
          totalSteps: 0,
          fencingToken: 1,
        },
      ]);

      await listMigrations(db as Db, tempProjectRoot);
      expect(db.getWriteCalls().length).toBe(0);
    });

    test("does not change migration execution status from APPLIED", async () => {
      const manifestContent = "altered content";
      fs.writeFileSync(
        path.join(migrationsDir, "20261031120000_status.mql.json"),
        manifestContent,
        "utf8",
      );

      const db = createDriftTestDb([
        {
          _id: "20261031120000",
          name: "Status Test",
          checksum: "oldhash",
          status: "APPLIED",
          startedAt: "2026-10-31T12:00:00Z",
          executedSteps: 1,
          totalSteps: 1,
          fencingToken: 1,
        },
      ]);

      const res = await listMigrations(db as Db, tempProjectRoot);
      expect(res.appliedMigrations[0].status).toBe("APPLIED");
    });

    test("reuses identical computeManifestChecksum function and CRLF-normalization as apply-time path", () => {
      const lfContent = '{\n  "version": "1.0"\n}\n';
      const crlfContent = '{\r\n  "version": "1.0"\r\n}\r\n';
      expect(computeManifestChecksum(lfContent)).toBe(computeManifestChecksum(crlfContent));
    });
  });
});
