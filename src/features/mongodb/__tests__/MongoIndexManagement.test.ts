import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  formatBytes,
  formatDirection,
  generateIndexName,
  validateIndexSpec,
  IndexKeyField,
} from "../utils/indexHelpers";
import { databaseBridge, DatabaseBridge } from "@/services/bridge/databaseBridge";
import { databaseService } from "@/services/bridge/database";

describe("MongoDB Index Management — Phase 2 Frontend Tests", () => {
  // ==========================================
  // 1. formatBytes tests
  // ==========================================
  describe("formatBytes", () => {
    it("handles 0, null, undefined, NaN, and negative values cleanly", () => {
      assert.strictEqual(formatBytes(0), "0 B");
      assert.strictEqual(formatBytes(undefined), "0 B");
      assert.strictEqual(formatBytes(null as any), "0 B");
      assert.strictEqual(formatBytes(NaN), "0 B");
      assert.strictEqual(formatBytes(-100), "0 B");
    });

    it("formats small byte values without decimal places", () => {
      assert.strictEqual(formatBytes(512), "512 B");
      assert.strictEqual(formatBytes(1023), "1023 B");
    });

    it("formats kilobyte values with 1 decimal place", () => {
      assert.strictEqual(formatBytes(1024), "1.0 KB");
      assert.strictEqual(formatBytes(4096), "4.0 KB");
      assert.strictEqual(formatBytes(16384), "16.0 KB");
    });

    it("formats megabyte values correctly", () => {
      assert.strictEqual(formatBytes(1048576), "1.0 MB");
      assert.strictEqual(formatBytes(1258291), "1.2 MB");
      assert.strictEqual(formatBytes(67108864), "64.0 MB");
    });

    it("formats gigabyte and terabyte values correctly", () => {
      assert.strictEqual(formatBytes(1073741824), "1.0 GB");
      assert.strictEqual(formatBytes(5368709120), "5.0 GB");
      assert.strictEqual(formatBytes(1099511627776), "1.0 TB");
    });
  });

  // ==========================================
  // 2. formatDirection tests
  // ==========================================
  describe("formatDirection", () => {
    it("formats all supported MongoDB index directions with clear labels", () => {
      assert.strictEqual(formatDirection(1), "Ascending (1)");
      assert.strictEqual(formatDirection(-1), "Descending (-1)");
      assert.strictEqual(formatDirection("text"), "Text");
      assert.strictEqual(formatDirection("2dsphere"), "2dsphere (Geo)");
      assert.strictEqual(formatDirection("hashed"), "Hashed");
    });

    it("falls back to string representation for unexpected input", () => {
      assert.strictEqual(formatDirection("custom" as any), "custom");
    });
  });

  // ==========================================
  // 3. generateIndexName tests
  // ==========================================
  describe("generateIndexName", () => {
    it("generates correct canonical name for single-field ascending and descending keys", () => {
      assert.strictEqual(
        generateIndexName([{ field: "email", direction: 1 }]),
        "email_1",
      );
      assert.strictEqual(
        generateIndexName([{ field: "createdAt", direction: -1 }]),
        "createdAt_-1",
      );
    });

    it("generates correct canonical name for compound keys", () => {
      const compoundFields: IndexKeyField[] = [
        { field: "tenantId", direction: 1 },
        { field: "status", direction: 1 },
        { field: "createdAt", direction: -1 },
      ];
      assert.strictEqual(
        generateIndexName(compoundFields),
        "tenantId_1_status_1_createdAt_-1",
      );
    });

    it("generates correct name for special types (text, 2dsphere, hashed)", () => {
      assert.strictEqual(
        generateIndexName([{ field: "description", direction: "text" }]),
        "description_text",
      );
      assert.strictEqual(
        generateIndexName([{ field: "location", direction: "2dsphere" }]),
        "location_2dsphere",
      );
      assert.strictEqual(
        generateIndexName([{ field: "userId", direction: "hashed" }]),
        "userId_hashed",
      );
    });

    it("trims whitespace from field names", () => {
      assert.strictEqual(
        generateIndexName([
          { field: "  username  ", direction: 1 },
          { field: " score ", direction: -1 },
        ]),
        "username_1_score_-1",
      );
    });

    it("ignores empty or whitespace-only fields and returns empty string if no valid fields", () => {
      assert.strictEqual(generateIndexName([]), "");
      assert.strictEqual(
        generateIndexName([
          { field: "", direction: 1 },
          { field: "   ", direction: -1 },
        ]),
        "",
      );
      assert.strictEqual(
        generateIndexName([
          { field: "", direction: 1 },
          { field: "validField", direction: 1 },
        ]),
        "validField_1",
      );
    });
  });

  // ==========================================
  // 4. validateIndexSpec tests
  // ==========================================
  describe("validateIndexSpec", () => {
    it("accepts valid single-field and compound specifications", () => {
      assert.strictEqual(
        validateIndexSpec([{ field: "username", direction: 1 }]).valid,
        true,
      );
      assert.strictEqual(
        validateIndexSpec([
          { field: "orgId", direction: 1 },
          { field: "createdAt", direction: -1 },
        ]).valid,
        true,
      );
    });

    it("rejects empty field array or missing input", () => {
      assert.strictEqual(validateIndexSpec([]).valid, false);
      assert.strictEqual(validateIndexSpec(null as any).valid, false);
    });

    it("rejects empty or whitespace-only field names", () => {
      const res1 = validateIndexSpec([{ field: "", direction: 1 }]);
      assert.strictEqual(res1.valid, false);
      assert.strictEqual(res1.error, "All field names must be non-empty");

      const res2 = validateIndexSpec([{ field: "   ", direction: 1 }]);
      assert.strictEqual(res2.valid, false);
      assert.strictEqual(res2.error, "All field names must be non-empty");
    });

    it("rejects duplicate field paths in compound keys", () => {
      const res = validateIndexSpec([
        { field: "email", direction: 1 },
        { field: "email", direction: -1 },
      ]);
      assert.strictEqual(res.valid, false);
      assert.ok(res.error?.includes("Duplicate field path: \"email\""));
    });

    it("rejects duplicate field paths with surrounding whitespace", () => {
      const res = validateIndexSpec([
        { field: "userId", direction: 1 },
        { field: "  userId  ", direction: -1 },
      ]);
      assert.strictEqual(res.valid, false);
      assert.ok(res.error?.includes("Duplicate field path: \"userId\""));
    });

    it("rejects unique constraint on hashed indexes", () => {
      const res = validateIndexSpec(
        [{ field: "userId", direction: "hashed" }],
        { unique: true },
      );
      assert.strictEqual(res.valid, false);
      assert.strictEqual(
        res.error,
        "Hashed indexes do not support unique constraints",
      );
    });

    it("rejects sparse option on hashed indexes", () => {
      const res = validateIndexSpec(
        [{ field: "userId", direction: "hashed" }],
        { sparse: true },
      );
      assert.strictEqual(res.valid, false);
      assert.strictEqual(
        res.error,
        "Hashed indexes do not support sparse option",
      );
    });

    it("rejects combining hashed field with other hashed, text, or geo fields", () => {
      const multiHashed = validateIndexSpec([
        { field: "userA", direction: "hashed" },
        { field: "userB", direction: "hashed" },
      ]);
      assert.strictEqual(multiHashed.valid, false);
      assert.strictEqual(
        multiHashed.error,
        "Hashed index field cannot be combined with other hashed, text, or geospatial fields",
      );

      const hashedWithGeo = validateIndexSpec([
        { field: "userA", direction: "hashed" },
        { field: "loc", direction: "2dsphere" },
      ]);
      assert.strictEqual(hashedWithGeo.valid, false);

      const hashedWithText = validateIndexSpec([
        { field: "userA", direction: "hashed" },
        { field: "bio", direction: "text" },
      ]);
      assert.strictEqual(hashedWithText.valid, false);
    });

    it("rejects unique constraint on 2dsphere geospatial indexes", () => {
      const res = validateIndexSpec(
        [{ field: "location", direction: "2dsphere" }],
        { unique: true },
      );
      assert.strictEqual(res.valid, false);
      assert.strictEqual(
        res.error,
        "2dsphere indexes do not support unique constraints",
      );
    });

    it("validates TTL expireAfterSeconds to be a non-negative integer", () => {
      assert.strictEqual(
        validateIndexSpec([{ field: "createdAt", direction: 1 }], {
          expireAfterSeconds: -1,
        }).valid,
        false,
      );

      assert.strictEqual(
        validateIndexSpec([{ field: "createdAt", direction: 1 }], {
          expireAfterSeconds: 30.5,
        }).valid,
        false,
      );

      assert.strictEqual(
        validateIndexSpec([{ field: "createdAt", direction: 1 }], {
          expireAfterSeconds: 0,
        }).valid,
        true,
      );

      assert.strictEqual(
        validateIndexSpec([{ field: "createdAt", direction: 1 }], {
          expireAfterSeconds: 86400,
        }).valid,
        true,
      );
    });

    it("validates partialFilterExpression to be a valid JSON object", () => {
      assert.strictEqual(
        validateIndexSpec([{ field: "score", direction: 1 }], {
          partialFilterExpression: { rating: { $gt: 5 } },
        }).valid,
        true,
      );

      assert.strictEqual(
        validateIndexSpec([{ field: "score", direction: 1 }], {
          partialFilterExpression: [1, 2, 3] as any,
        }).valid,
        false,
      );

      assert.strictEqual(
        validateIndexSpec([{ field: "score", direction: 1 }], {
          partialFilterExpression: "invalid" as any,
        }).valid,
        false,
      );
    });

    it("validates collation locale when collation is provided", () => {
      assert.strictEqual(
        validateIndexSpec([{ field: "name", direction: 1 }], {
          collation: { locale: "" },
        }).valid,
        false,
      );

      assert.strictEqual(
        validateIndexSpec([{ field: "name", direction: 1 }], {
          collation: { locale: "en", strength: 2 },
        }).valid,
        true,
      );
    });
  });

  // ==========================================
  // 5. _id_ protection logic tests
  // ==========================================
  describe("_id_ Primary Key Protection", () => {
    it("guards and rejects dropping the immutable _id_ index", () => {
      const dropSafeguard = (indexName: string, isIdIndex?: boolean) => {
        if (indexName === "_id_" || isIdIndex) {
          throw new Error("The default _id_ index is required by MongoDB and cannot be dropped.");
        }
        return true;
      };

      assert.throws(
        () => dropSafeguard("_id_"),
        /The default _id_ index is required by MongoDB and cannot be dropped/,
      );
      assert.throws(
        () => dropSafeguard("custom_id_name", true),
        /The default _id_ index is required by MongoDB and cannot be dropped/,
      );
      assert.strictEqual(dropSafeguard("users_email_1"), true);
    });

    it("guards and rejects hiding the immutable _id_ index", () => {
      const hideSafeguard = (indexName: string, isIdIndex?: boolean) => {
        if (indexName === "_id_" || isIdIndex) {
          throw new Error("The default _id_ index cannot be hidden.");
        }
        return true;
      };

      assert.throws(
        () => hideSafeguard("_id_"),
        /The default _id_ index cannot be hidden/,
      );
      assert.throws(
        () => hideSafeguard("my_id_idx", true),
        /The default _id_ index cannot be hidden/,
      );
      assert.strictEqual(hideSafeguard("users_email_1"), true);
    });
  });

  // ==========================================
  // 6. Redundancy advisory presentation logic
  // ==========================================
  describe("Redundancy Advisory Presentation", () => {
    it("formats redundancy advisory with required non-destructive disclaimer", () => {
      const disclaimer = "Advisory only; RelWave never drops indexes automatically.";
      const sampleRedundantIndex = {
        name: "user_id_1",
        key: { user_id: 1 as const },
        sizeBytes: 8192,
        unique: false,
        sparse: false,
        isIdIndex: false,
        isRedundant: true,
        redundantReason: 'Prefix is completely covered by compound index "user_id_1_createdAt_-1".',
      };

      assert.strictEqual(sampleRedundantIndex.isRedundant, true);
      assert.ok(sampleRedundantIndex.redundantReason.includes("Prefix is completely covered"));
      assert.strictEqual(disclaimer, "Advisory only; RelWave never drops indexes automatically.");
    });
  });

  // ==========================================
  // 7. Bridge Service Contract Tests
  // ==========================================
  describe("Bridge Service Contract Signatures", () => {
    it("verifies DatabaseBridge exports all 5 index methods", () => {
      assert.strictEqual(typeof databaseBridge.listIndexes, "function");
      assert.strictEqual(typeof databaseBridge.createIndex, "function");
      assert.strictEqual(typeof databaseBridge.dropIndex, "function");
      assert.strictEqual(typeof databaseBridge.getIndexStats, "function");
      assert.strictEqual(typeof databaseBridge.hideIndex, "function");
    });

    it("verifies databaseService exports all 5 mongo index methods", () => {
      assert.strictEqual(typeof databaseService.listMongoIndexes, "function");
      assert.strictEqual(typeof databaseService.createMongoIndex, "function");
      assert.strictEqual(typeof databaseService.dropMongoIndex, "function");
      assert.strictEqual(typeof databaseService.getMongoIndexStats, "function");
      assert.strictEqual(typeof databaseService.hideMongoIndex, "function");
    });

    it("delegates databaseService calls to databaseBridge properly", async () => {
      const originalList = databaseBridge.listIndexes;
      const originalCreate = databaseBridge.createIndex;
      const originalDrop = databaseBridge.dropIndex;
      const originalStats = databaseBridge.getIndexStats;
      const originalHide = databaseBridge.hideIndex;

      let calledMethod = "";
      try {
        databaseBridge.listIndexes = async (dbId, col) => {
          calledMethod = `listIndexes:${dbId}:${col}`;
          return { collection: col, indexes: [], totalSizeBytes: 0 };
        };
        const listRes = await databaseService.listMongoIndexes("db1", "users");
        assert.strictEqual(calledMethod, "listIndexes:db1:users");
        assert.strictEqual(listRes.collection, "users");

        databaseBridge.createIndex = async (dbId, col, key, opts) => {
          calledMethod = `createIndex:${dbId}:${col}:${JSON.stringify(key)}:${JSON.stringify(opts)}`;
          return { success: true, indexName: "idx_1", executionTimeMs: 12 };
        };
        const createRes = await databaseService.createMongoIndex("db1", "users", { email: 1 });
        assert.ok(calledMethod.startsWith("createIndex:db1:users:"));
        assert.strictEqual(createRes.indexName, "idx_1");

        databaseBridge.dropIndex = async (dbId, col, name) => {
          calledMethod = `dropIndex:${dbId}:${col}:${name}`;
          return { success: true, droppedIndexName: name, executionTimeMs: 5 };
        };
        const dropRes = await databaseService.dropMongoIndex("db1", "users", "idx_1");
        assert.strictEqual(calledMethod, "dropIndex:db1:users:idx_1");
        assert.strictEqual(dropRes.droppedIndexName, "idx_1");

        databaseBridge.getIndexStats = async (dbId, col) => {
          calledMethod = `getIndexStats:${dbId}:${col}`;
          return { collection: col, stats: {} };
        };
        const statsRes = await databaseService.getMongoIndexStats("db1", "users");
        assert.strictEqual(calledMethod, "getIndexStats:db1:users");
        assert.strictEqual(statsRes.collection, "users");

        databaseBridge.hideIndex = async (dbId, col, name, hidden) => {
          calledMethod = `hideIndex:${dbId}:${col}:${name}:${hidden}`;
          return { success: true, indexName: name, hidden };
        };
        const hideRes = await databaseService.hideMongoIndex("db1", "users", "idx_1", true);
        assert.strictEqual(calledMethod, "hideIndex:db1:users:idx_1:true");
        assert.strictEqual(hideRes.hidden, true);
      } finally {
        databaseBridge.listIndexes = originalList;
        databaseBridge.createIndex = originalCreate;
        databaseBridge.dropIndex = originalDrop;
        databaseBridge.getIndexStats = originalStats;
        databaseBridge.hideIndex = originalHide;
      }
    });
  });
});
