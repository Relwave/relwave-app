import { describe, expect, test, beforeEach, afterEach, jest } from "@jest/globals";
import { MongoClient } from "mongodb";
import {
  evaluateIndexRedundancy,
  mongoConnector,
  MongoApiError,
  mongodbCache,
} from "../src/connectors/mongo";
import { QueryExecutor } from "../src/services/queryExecutor";
import { IndexHandlers } from "../src/handlers/indexHandlers";
import { DBType } from "../src/types";
import type {
  MongoConfig,
  MongoIndexDetails,
  MongoIndexCreateRequest,
  MongoIndexDropRequest,
  MongoIndexHideRequest,
  MongoIndexListRequest,
  MongoIndexStatsRequest,
} from "../src/types/mongo";

describe("MongoDB Index Management Unit Tests (M6 Spec §3, §9, §11)", () => {
  const dummyConfig: MongoConfig = {
    uri: "mongodb://localhost:27017/testdb",
    database: "testdb",
  };

  // =========================================================================
  // 1. evaluateIndexRedundancy
  // =========================================================================
  describe("evaluateIndexRedundancy", () => {
    test("primary key index (_id_) is never marked redundant", () => {
      const indexes: MongoIndexDetails[] = [
        {
          name: "_id_",
          key: { _id: 1 },
          sizeBytes: 4096,
          unique: true,
          sparse: false,
          isIdIndex: true,
        },
        {
          name: "compound_id",
          key: { _id: 1, email: 1 },
          sizeBytes: 8192,
          unique: false,
          sparse: false,
          isIdIndex: false,
        },
      ];
      const evaluated = evaluateIndexRedundancy(indexes);
      expect(evaluated[0].isRedundant).toBe(false);
    });

    test("non-B-tree indexes (text, 2dsphere, hashed) are never covered by B-tree prefixes", () => {
      const indexes: MongoIndexDetails[] = [
        {
          name: "text_idx",
          key: { bio: "text" },
          sizeBytes: 4096,
          unique: false,
          sparse: false,
          isIdIndex: false,
        },
        {
          name: "geo_idx",
          key: { location: "2dsphere" },
          sizeBytes: 4096,
          unique: false,
          sparse: false,
          isIdIndex: false,
        },
        {
          name: "hashed_idx",
          key: { userId: "hashed" },
          sizeBytes: 4096,
          unique: false,
          sparse: false,
          isIdIndex: false,
        },
        {
          name: "compound_all",
          key: { bio: 1, location: 1, userId: 1 },
          sizeBytes: 12000,
          unique: false,
          sparse: false,
          isIdIndex: false,
        },
      ];
      const evaluated = evaluateIndexRedundancy(indexes);
      expect(evaluated.find((i) => i.name === "text_idx")?.isRedundant).toBe(false);
      expect(evaluated.find((i) => i.name === "geo_idx")?.isRedundant).toBe(false);
      expect(evaluated.find((i) => i.name === "hashed_idx")?.isRedundant).toBe(false);
    });

    test("hidden compound index cannot make another index redundant", () => {
      const indexes: MongoIndexDetails[] = [
        {
          name: "idx_user",
          key: { userId: 1 },
          sizeBytes: 4096,
          unique: false,
          sparse: false,
          isIdIndex: false,
        },
        {
          name: "idx_user_status_hidden",
          key: { userId: 1, status: 1 },
          sizeBytes: 8192,
          unique: false,
          sparse: false,
          isIdIndex: false,
          hidden: true,
        },
      ];
      const evaluated = evaluateIndexRedundancy(indexes);
      expect(evaluated.find((i) => i.name === "idx_user")?.isRedundant).toBe(false);
    });

    test("compound index covers single-field prefix and flags it as redundant", () => {
      const indexes: MongoIndexDetails[] = [
        {
          name: "idx_user",
          key: { userId: 1 },
          sizeBytes: 4096,
          unique: false,
          sparse: false,
          isIdIndex: false,
        },
        {
          name: "idx_user_status",
          key: { userId: 1, status: 1 },
          sizeBytes: 8192,
          unique: false,
          sparse: false,
          isIdIndex: false,
        },
      ];
      const evaluated = evaluateIndexRedundancy(indexes);
      const userIdx = evaluated.find((i) => i.name === "idx_user");
      expect(userIdx?.isRedundant).toBe(true);
      expect(userIdx?.redundantReason).toContain('compound index "idx_user_status"');
    });

    test("compound index covers shorter compound index with matching key order and directions", () => {
      const indexes: MongoIndexDetails[] = [
        {
          name: "idx_org_dept",
          key: { orgId: 1, deptId: -1 },
          sizeBytes: 6000,
          unique: false,
          sparse: false,
          isIdIndex: false,
        },
        {
          name: "idx_org_dept_role",
          key: { orgId: 1, deptId: -1, role: 1 },
          sizeBytes: 10000,
          unique: false,
          sparse: false,
          isIdIndex: false,
        },
      ];
      const evaluated = evaluateIndexRedundancy(indexes);
      expect(evaluated.find((i) => i.name === "idx_org_dept")?.isRedundant).toBe(true);
    });

    test("compound index with different direction on second key does NOT make prefix redundant", () => {
      const indexes: MongoIndexDetails[] = [
        {
          name: "idx_org_dept",
          key: { orgId: 1, deptId: 1 },
          sizeBytes: 6000,
          unique: false,
          sparse: false,
          isIdIndex: false,
        },
        {
          name: "idx_org_dept_role",
          key: { orgId: 1, deptId: -1, role: 1 },
          sizeBytes: 10000,
          unique: false,
          sparse: false,
          isIdIndex: false,
        },
      ];
      const evaluated = evaluateIndexRedundancy(indexes);
      expect(evaluated.find((i) => i.name === "idx_org_dept")?.isRedundant).toBe(false);
    });

    test("unique index is NEVER considered redundant with non-unique compound index", () => {
      const indexes: MongoIndexDetails[] = [
        {
          name: "idx_email_unique",
          key: { email: 1 },
          sizeBytes: 4096,
          unique: true,
          sparse: false,
          isIdIndex: false,
        },
        {
          name: "idx_email_created",
          key: { email: 1, createdAt: -1 },
          sizeBytes: 8192,
          unique: false,
          sparse: false,
          isIdIndex: false,
        },
      ];
      const evaluated = evaluateIndexRedundancy(indexes);
      expect(evaluated.find((i) => i.name === "idx_email_unique")?.isRedundant).toBe(false);
    });

    test("non-sparse index is NOT redundant with sparse compound index", () => {
      const indexes: MongoIndexDetails[] = [
        {
          name: "idx_phone",
          key: { phone: 1 },
          sizeBytes: 4096,
          unique: false,
          sparse: false,
          isIdIndex: false,
        },
        {
          name: "idx_phone_name_sparse",
          key: { phone: 1, name: 1 },
          sizeBytes: 8192,
          unique: false,
          sparse: true,
          isIdIndex: false,
        },
      ];
      const evaluated = evaluateIndexRedundancy(indexes);
      expect(evaluated.find((i) => i.name === "idx_phone")?.isRedundant).toBe(false);
    });

    test("sparse index IS redundant with non-sparse compound index", () => {
      const indexes: MongoIndexDetails[] = [
        {
          name: "idx_phone_sparse",
          key: { phone: 1 },
          sizeBytes: 4096,
          unique: false,
          sparse: true,
          isIdIndex: false,
        },
        {
          name: "idx_phone_name",
          key: { phone: 1, name: 1 },
          sizeBytes: 8192,
          unique: false,
          sparse: false,
          isIdIndex: false,
        },
      ];
      const evaluated = evaluateIndexRedundancy(indexes);
      expect(evaluated.find((i) => i.name === "idx_phone_sparse")?.isRedundant).toBe(true);
    });

    test("differing partialFilterExpression prevents redundancy", () => {
      const indexes: MongoIndexDetails[] = [
        {
          name: "idx_active_users",
          key: { userId: 1 },
          sizeBytes: 4096,
          unique: false,
          sparse: false,
          isIdIndex: false,
          partialFilterExpression: { active: true },
        },
        {
          name: "idx_verified_users",
          key: { userId: 1, verified: 1 },
          sizeBytes: 8192,
          unique: false,
          sparse: false,
          isIdIndex: false,
          partialFilterExpression: { verified: true },
        },
      ];
      const evaluated = evaluateIndexRedundancy(indexes);
      expect(evaluated.find((i) => i.name === "idx_active_users")?.isRedundant).toBe(false);
    });

    test("identical partialFilterExpression allows redundancy", () => {
      const indexes: MongoIndexDetails[] = [
        {
          name: "idx_active_user",
          key: { userId: 1 },
          sizeBytes: 4096,
          unique: false,
          sparse: false,
          isIdIndex: false,
          partialFilterExpression: { active: true },
        },
        {
          name: "idx_active_user_date",
          key: { userId: 1, date: 1 },
          sizeBytes: 8192,
          unique: false,
          sparse: false,
          isIdIndex: false,
          partialFilterExpression: { active: true },
        },
      ];
      const evaluated = evaluateIndexRedundancy(indexes);
      expect(evaluated.find((i) => i.name === "idx_active_user")?.isRedundant).toBe(true);
    });

    test("differing collation prevents redundancy", () => {
      const indexes: MongoIndexDetails[] = [
        {
          name: "idx_name_ci",
          key: { name: 1 },
          sizeBytes: 4096,
          unique: false,
          sparse: false,
          isIdIndex: false,
          collation: { locale: "en", strength: 2 },
        },
        {
          name: "idx_name_age_cs",
          key: { name: 1, age: 1 },
          sizeBytes: 8192,
          unique: false,
          sparse: false,
          isIdIndex: false,
          collation: { locale: "en", strength: 3 },
        },
      ];
      const evaluated = evaluateIndexRedundancy(indexes);
      expect(evaluated.find((i) => i.name === "idx_name_ci")?.isRedundant).toBe(false);
    });

    test("compound index with inverted directions (reverse traversal) covers compound prefix", () => {
      const indexes: MongoIndexDetails[] = [
        {
          name: "idx_rev_prefix",
          key: { orgId: -1, deptId: 1 },
          sizeBytes: 6000,
          unique: false,
          sparse: false,
          isIdIndex: false,
        },
        {
          name: "idx_compound_full",
          key: { orgId: 1, deptId: -1, role: 1 },
          sizeBytes: 12000,
          unique: false,
          sparse: false,
          isIdIndex: false,
        },
      ];
      const evaluated = evaluateIndexRedundancy(indexes);
      expect(evaluated.find((i) => i.name === "idx_rev_prefix")?.isRedundant).toBe(true);
    });

    test("compound other index with special key (text, 2dsphere, hashed) cannot make B-tree prefix redundant", () => {
      const indexes: MongoIndexDetails[] = [
        {
          name: "idx_category",
          key: { category: 1 },
          sizeBytes: 4096,
          unique: false,
          sparse: false,
          isIdIndex: false,
        },
        {
          name: "idx_category_title_text",
          key: { category: 1, title: "text" },
          sizeBytes: 10000,
          unique: false,
          sparse: false,
          isIdIndex: false,
        },
        {
          name: "idx_category_loc_geo",
          key: { category: 1, loc: "2dsphere" },
          sizeBytes: 10000,
          unique: false,
          sparse: false,
          isIdIndex: false,
        },
        {
          name: "idx_category_id_hash",
          key: { category: 1, id: "hashed" },
          sizeBytes: 10000,
          unique: false,
          sparse: false,
          isIdIndex: false,
        },
      ];
      const evaluated = evaluateIndexRedundancy(indexes);
      expect(evaluated.find((i) => i.name === "idx_category")?.isRedundant).toBe(false);
    });

    test("default collation (undefined) matches explicit simple collation ({ locale: 'simple' })", () => {
      const indexes: MongoIndexDetails[] = [
        {
          name: "idx_user_default_coll",
          key: { user: 1 },
          sizeBytes: 4096,
          unique: false,
          sparse: false,
          isIdIndex: false,
        },
        {
          name: "idx_user_age_simple_coll",
          key: { user: 1, age: 1 },
          sizeBytes: 8192,
          unique: false,
          sparse: false,
          isIdIndex: false,
          collation: { locale: "simple" },
        },
      ];
      const evaluated = evaluateIndexRedundancy(indexes);
      expect(evaluated.find((i) => i.name === "idx_user_default_coll")?.isRedundant).toBe(true);
    });

    test("default collation (undefined) does NOT match explicit non-simple collation ({ locale: 'en' })", () => {
      const indexes: MongoIndexDetails[] = [
        {
          name: "idx_user_default_coll",
          key: { user: 1 },
          sizeBytes: 4096,
          unique: false,
          sparse: false,
          isIdIndex: false,
        },
        {
          name: "idx_user_age_en_coll",
          key: { user: 1, age: 1 },
          sizeBytes: 8192,
          unique: false,
          sparse: false,
          isIdIndex: false,
          collation: { locale: "en", strength: 2 },
        },
      ];
      const evaluated = evaluateIndexRedundancy(indexes);
      expect(evaluated.find((i) => i.name === "idx_user_default_coll")?.isRedundant).toBe(false);
    });

    test("partialFilterExpression with differing key order is recognized as equivalent", () => {
      const indexes: MongoIndexDetails[] = [
        {
          name: "idx_partial_a",
          key: { status: 1 },
          sizeBytes: 4096,
          unique: false,
          sparse: false,
          isIdIndex: false,
          partialFilterExpression: { a: 1, b: 2 },
        },
        {
          name: "idx_partial_b",
          key: { status: 1, date: 1 },
          sizeBytes: 8192,
          unique: false,
          sparse: false,
          isIdIndex: false,
          partialFilterExpression: { b: 2, a: 1 },
        },
      ];
      const evaluated = evaluateIndexRedundancy(indexes);
      expect(evaluated.find((i) => i.name === "idx_partial_a")?.isRedundant).toBe(true);
    });

    test("unique compound candidate does NOT cover shorter non-unique index (conservative constraint boundary)", () => {
      const indexes: MongoIndexDetails[] = [
        {
          name: "idx_email_non_unique",
          key: { email: 1 },
          sizeBytes: 4096,
          unique: false,
          sparse: false,
          isIdIndex: false,
        },
        {
          name: "idx_email_tenant_unique",
          key: { email: 1, tenantId: 1 },
          sizeBytes: 8192,
          unique: true,
          sparse: false,
          isIdIndex: false,
        },
      ];
      const evaluated = evaluateIndexRedundancy(indexes);
      expect(evaluated.find((i) => i.name === "idx_email_non_unique")?.isRedundant).toBe(false);
    });

    test("effective collation: collection default non-simple collation propagates and prevents false redundancy with simple index", () => {
      const indexes: MongoIndexDetails[] = [
        {
          name: "idx_name_inherited",
          key: { name: 1 },
          sizeBytes: 4096,
          unique: false,
          sparse: false,
          isIdIndex: false,
          // collation omitted: inherits collection default
        },
        {
          name: "idx_name_age_simple",
          key: { name: 1, age: 1 },
          sizeBytes: 8192,
          unique: false,
          sparse: false,
          isIdIndex: false,
          collation: { locale: "simple" },
        },
      ];
      const evaluated = evaluateIndexRedundancy(indexes, {
        collectionDefaultCollation: { locale: "fr", strength: 2 },
        collectionCollationUnknown: false,
      });
      expect(evaluated.find((i) => i.name === "idx_name_inherited")?.isRedundant).toBe(false);
    });

    test("effective collation: both indexes inherit same collection default and allow redundancy", () => {
      const indexes: MongoIndexDetails[] = [
        {
          name: "idx_name_inherited",
          key: { name: 1 },
          sizeBytes: 4096,
          unique: false,
          sparse: false,
          isIdIndex: false,
        },
        {
          name: "idx_name_age_inherited",
          key: { name: 1, age: 1 },
          sizeBytes: 8192,
          unique: false,
          sparse: false,
          isIdIndex: false,
        },
      ];
      const evaluated = evaluateIndexRedundancy(indexes, {
        collectionDefaultCollation: { locale: "fr", strength: 2 },
        collectionCollationUnknown: false,
      });
      expect(evaluated.find((i) => i.name === "idx_name_inherited")?.isRedundant).toBe(true);
    });

    test("effective collation: suppresses redundancy when collection collation metadata is unknown", () => {
      const indexes: MongoIndexDetails[] = [
        {
          name: "idx_name_missing_coll",
          key: { name: 1 },
          sizeBytes: 4096,
          unique: false,
          sparse: false,
          isIdIndex: false,
        },
        {
          name: "idx_name_age_simple",
          key: { name: 1, age: 1 },
          sizeBytes: 8192,
          unique: false,
          sparse: false,
          isIdIndex: false,
          collation: { locale: "simple" },
        },
      ];
      const evaluated = evaluateIndexRedundancy(indexes, {
        collectionDefaultCollation: null,
        collectionCollationUnknown: true, // metadata unavailable
      });
      expect(evaluated.find((i) => i.name === "idx_name_missing_coll")?.isRedundant).toBe(false);
    });
  });

  // =========================================================================
  // 2. MongoConnector Index Methods
  // =========================================================================
  describe("MongoConnector Index Methods", () => {
    let mockDb: any;
    let mockCollection: any;
    let mockRawIndexes: any[];
    let mockIndexSizes: Record<string, number>;
    let mockTotalIndexSize: number;
    let mockStatsDocs: any[];
    let dbSpy: any;

    beforeEach(() => {
      mockRawIndexes = [
        { v: 2, key: { _id: 1 }, name: "_id_" },
        { v: 2, key: { email: 1 }, name: "idx_email", unique: true },
        { v: 2, key: { email: 1, name: 1 }, name: "idx_email_name" },
      ];
      mockIndexSizes = {
        _id_: 4096,
        idx_email: 8192,
        idx_email_name: 12288,
      };
      mockTotalIndexSize = 24576;
      mockStatsDocs = [
        {
          name: "idx_email",
          key: { email: 1 },
          host: "localhost:27017",
          accesses: { ops: 50, since: new Date("2026-10-30T00:00:00.000Z") },
        },
      ];

      mockCollection = {
        listIndexes: jest.fn<any>().mockReturnValue({
          toArray: jest.fn<any>().mockImplementation(() => Promise.resolve(mockRawIndexes)),
        }),
        createIndex: jest.fn<any>().mockImplementation((_key: any, opts: any) =>
          Promise.resolve(opts?.name || "idx_created"),
        ),
        dropIndex: jest.fn<any>().mockImplementation((_name: any) => Promise.resolve({ ok: 1 })),
        aggregate: jest.fn<any>().mockReturnValue({
          toArray: jest.fn<any>().mockImplementation(() => Promise.resolve(mockStatsDocs)),
        }),
      };

      mockDb = {
        collection: jest.fn<any>().mockReturnValue(mockCollection),
        listCollections: jest.fn<any>().mockReturnValue({
          toArray: jest.fn<any>().mockResolvedValue([{ name: "users", options: {} }]),
        }),
        command: jest.fn<any>().mockImplementation((cmd: any) => {
          if (cmd.collStats) {
            return Promise.resolve({
              indexSizes: mockIndexSizes,
              totalIndexSize: mockTotalIndexSize,
            });
          }
          if (cmd.collMod) {
            return Promise.resolve({ ok: 1 });
          }
          return Promise.resolve({});
        }),
      };

      dbSpy = jest.spyOn(MongoClient.prototype, "db").mockReturnValue(mockDb as any);
    });

    afterEach(() => {
      dbSpy.mockRestore();
    });

    describe("listIndexes", () => {
      test("rejects invalid collection name", async () => {
        await expect(mongoConnector.listIndexes(dummyConfig, { collection: "" })).rejects.toThrow(
          MongoApiError,
        );
        await expect(
          mongoConnector.listIndexes(dummyConfig, { collection: "system.views" }),
        ).rejects.toThrow(MongoApiError);
      });

      test("returns mapped indexes with sizes and redundancy flags", async () => {
        const result = await mongoConnector.listIndexes(dummyConfig, { collection: "users" });
        expect(result.collection).toBe("users");
        expect(result.indexes).toHaveLength(3);
        expect(result.totalSizeBytes).toBe(24576);

        const idIdx = result.indexes.find((i) => i.name === "_id_");
        expect(idIdx).toBeDefined();
        expect(idIdx?.isIdIndex).toBe(true);
        expect(idIdx?.sizeBytes).toBe(4096);
        expect(idIdx?.isRedundant).toBe(false);

        const emailIdx = result.indexes.find((i) => i.name === "idx_email");
        expect(emailIdx?.unique).toBe(true);
        expect(emailIdx?.sizeBytes).toBe(8192);
        // Unique index is never redundant even though prefix matches
        expect(emailIdx?.isRedundant).toBe(false);
      });

      test("handles NamespaceNotFound gracefully by returning empty indexes array", async () => {
        mockCollection.listIndexes = jest.fn<any>().mockReturnValue({
          toArray: jest
            .fn<any>()
            .mockRejectedValue({ code: 26, codeName: "NamespaceNotFound", message: "ns not found" }),
        });

        const result = await mongoConnector.listIndexes(dummyConfig, { collection: "missing_coll" });
        expect(result.indexes).toEqual([]);
        expect(result.totalSizeBytes).toBe(0);
      });

      test("handles collStats failure gracefully by defaulting sizes to 0", async () => {
        mockDb.command = jest.fn<any>().mockRejectedValue(new Error("collStats not allowed on view"));

        const result = await mongoConnector.listIndexes(dummyConfig, { collection: "users" });
        expect(result.indexes).toHaveLength(3);
        expect(result.totalSizeBytes).toBe(0);
        expect(result.indexes[0].sizeBytes).toBe(0);
      });
    });

    describe("createIndex", () => {
      test("rejects when connection is read-only", async () => {
        await expect(
          mongoConnector.createIndex(
            dummyConfig,
            { collection: "users", key: { email: 1 } },
            { readOnly: true },
          ),
        ).rejects.toMatchObject({ code: "MONGO_READ_ONLY" });
      });

      test("rejects invalid collection name", async () => {
        await expect(
          mongoConnector.createIndex(dummyConfig, { collection: "$invalid", key: { email: 1 } }),
        ).rejects.toMatchObject({ code: "MONGO_VALIDATION_ERROR" });
      });

      test("rejects non-object or empty key", async () => {
        await expect(
          mongoConnector.createIndex(dummyConfig, {
            collection: "users",
            key: null as unknown as any,
          }),
        ).rejects.toMatchObject({ code: "MONGO_VALIDATION_ERROR" });
        await expect(
          mongoConnector.createIndex(dummyConfig, { collection: "users", key: {} }),
        ).rejects.toMatchObject({ code: "MONGO_VALIDATION_ERROR" });
      });

      test("rejects invalid direction in key spec", async () => {
        await expect(
          mongoConnector.createIndex(dummyConfig, {
            collection: "users",
            key: { email: 2 as any },
          }),
        ).rejects.toMatchObject({ code: "MONGO_VALIDATION_ERROR" });
      });

      test("rejects invalid options (negative expireAfterSeconds, empty name)", async () => {
        await expect(
          mongoConnector.createIndex(dummyConfig, {
            collection: "users",
            key: { createdAt: 1 },
            options: { expireAfterSeconds: -10 },
          }),
        ).rejects.toMatchObject({ code: "MONGO_VALIDATION_ERROR" });

        await expect(
          mongoConnector.createIndex(dummyConfig, {
            collection: "users",
            key: { email: 1 },
            options: { name: "   " },
          }),
        ).rejects.toMatchObject({ code: "MONGO_VALIDATION_ERROR" });
      });

      test("creates single, compound, and special index types forwarding driver options", async () => {
        const clearCacheSpy = jest.spyOn(mongodbCache, "clearCollectionCache");

        const res = await mongoConnector.createIndex(dummyConfig, {
          collection: "users",
          key: { email: 1, age: -1 },
          options: {
            name: "idx_custom_email_age",
            unique: true,
            sparse: true,
            partialFilterExpression: { active: true },
            collation: { locale: "en", strength: 2 },
            hidden: false,
          },
        });

        expect(res.success).toBe(true);
        expect(res.indexName).toBe("idx_custom_email_age");
        expect(res.executionTimeMs).toBeGreaterThanOrEqual(0);
        expect(mockCollection.createIndex).toHaveBeenCalledWith(
          { email: 1, age: -1 },
          expect.objectContaining({
            name: "idx_custom_email_age",
            unique: true,
            sparse: true,
            partialFilterExpression: { active: true },
            collation: { locale: "en", strength: 2 },
            hidden: false,
          }),
        );
        expect(clearCacheSpy).toHaveBeenCalledWith(dummyConfig, "users");
      });

      test("creates single-field TTL index", async () => {
        const res = await mongoConnector.createIndex(dummyConfig, {
          collection: "sessions",
          key: { createdAt: 1 },
          options: {
            name: "idx_ttl",
            expireAfterSeconds: 3600,
          },
        });
        expect(res.success).toBe(true);
        expect(mockCollection.createIndex).toHaveBeenCalledWith(
          { createdAt: 1 },
          expect.objectContaining({ expireAfterSeconds: 3600 }),
        );
      });

      test("rejects compound TTL index with MONGO_VALIDATION_ERROR", async () => {
        await expect(
          mongoConnector.createIndex(dummyConfig, {
            collection: "sessions",
            key: { createdAt: 1, userId: 1 },
            options: {
              expireAfterSeconds: 3600,
            },
          }),
        ).rejects.toMatchObject({
          code: "MONGO_VALIDATION_ERROR",
          message: expect.stringContaining("single field"),
        });
      });

      test("supports special index directions: text, 2dsphere, hashed", async () => {
        const textRes = await mongoConnector.createIndex(dummyConfig, {
          collection: "articles",
          key: { title: "text", body: "text" },
        });
        expect(textRes.success).toBe(true);

        const geoRes = await mongoConnector.createIndex(dummyConfig, {
          collection: "places",
          key: { location: "2dsphere" },
        });
        expect(geoRes.success).toBe(true);

        const hashRes = await mongoConnector.createIndex(dummyConfig, {
          collection: "accounts",
          key: { accountId: "hashed" },
        });
        expect(hashRes.success).toBe(true);
      });

      test("rejects illegal special index combinations with MONGO_VALIDATION_ERROR", async () => {
        // Text + 2dsphere
        await expect(
          mongoConnector.createIndex(dummyConfig, {
            collection: "items",
            key: { title: "text", loc: "2dsphere" },
          }),
        ).rejects.toMatchObject({
          code: "MONGO_VALIDATION_ERROR",
          message: expect.stringContaining("text index with 2dsphere"),
        });

        // Text + hashed
        await expect(
          mongoConnector.createIndex(dummyConfig, {
            collection: "items",
            key: { title: "text", id: "hashed" },
          }),
        ).rejects.toMatchObject({
          code: "MONGO_VALIDATION_ERROR",
          message: expect.stringContaining("text index with 2dsphere or hashed"),
        });

        // 2dsphere + hashed
        await expect(
          mongoConnector.createIndex(dummyConfig, {
            collection: "items",
            key: { loc: "2dsphere", id: "hashed" },
          }),
        ).rejects.toMatchObject({
          code: "MONGO_VALIDATION_ERROR",
          message: expect.stringContaining("2dsphere index with hashed"),
        });

        // Multiple hashed
        await expect(
          mongoConnector.createIndex(dummyConfig, {
            collection: "items",
            key: { id1: "hashed", id2: "hashed" },
          }),
        ).rejects.toMatchObject({
          code: "MONGO_VALIDATION_ERROR",
          message: expect.stringContaining("more than one hashed key"),
        });

        // Text with unique
        await expect(
          mongoConnector.createIndex(dummyConfig, {
            collection: "items",
            key: { title: "text" },
            options: { unique: true },
          }),
        ).rejects.toMatchObject({
          code: "MONGO_VALIDATION_ERROR",
          message: expect.stringContaining("Text indexes cannot enforce unique"),
        });

        // TTL on _id
        await expect(
          mongoConnector.createIndex(dummyConfig, {
            collection: "items",
            key: { _id: 1 },
            options: { expireAfterSeconds: 60 },
          }),
        ).rejects.toMatchObject({
          code: "MONGO_VALIDATION_ERROR",
          message: expect.stringContaining("immutable primary key '_id'"),
        });

        // TTL on special key
        await expect(
          mongoConnector.createIndex(dummyConfig, {
            collection: "items",
            key: { title: "text" },
            options: { expireAfterSeconds: 60 },
          }),
        ).rejects.toMatchObject({
          code: "MONGO_VALIDATION_ERROR",
          message: expect.stringContaining("special non-B-tree key types"),
        });
      });

      test("rejects malformed partial filter expressions and collations", async () => {
        // Malformed partialFilter (primitive)
        await expect(
          mongoConnector.createIndex(dummyConfig, {
            collection: "users",
            key: { email: 1 },
            options: { partialFilterExpression: "not-an-object" as any },
          }),
        ).rejects.toMatchObject({
          code: "MONGO_VALIDATION_ERROR",
          message: expect.stringContaining("non-null object"),
        });

        // Malformed partialFilter (prohibited JS / $where)
        await expect(
          mongoConnector.createIndex(dummyConfig, {
            collection: "users",
            key: { email: 1 },
            options: { partialFilterExpression: { $where: "sleep(1000)" } },
          }),
        ).rejects.toMatchObject({
          code: "MONGO_FORBIDDEN_OPERATOR",
        });

        // Malformed collation (empty locale)
        await expect(
          mongoConnector.createIndex(dummyConfig, {
            collection: "users",
            key: { email: 1 },
            options: { collation: { locale: "  " } },
          }),
        ).rejects.toMatchObject({
          code: "MONGO_VALIDATION_ERROR",
          message: expect.stringContaining("collation.locale"),
        });

        // Malformed collation (invalid strength)
        await expect(
          mongoConnector.createIndex(dummyConfig, {
            collection: "users",
            key: { email: 1 },
            options: { collation: { locale: "en", strength: 99 as any } },
          }),
        ).rejects.toMatchObject({
          code: "MONGO_VALIDATION_ERROR",
          message: expect.stringContaining("collation.strength"),
        });
      });

      test("maps driver InvalidOptions on hidden: true to MONGO_UNSUPPORTED_OPERATION (< MongoDB 4.4)", async () => {
        mockCollection.createIndex = jest.fn<any>().mockRejectedValue({
          code: 72,
          codeName: "InvalidOptions",
          message: "unrecognized option: hidden",
        });

        await expect(
          mongoConnector.createIndex(dummyConfig, {
            collection: "users",
            key: { email: 1 },
            options: { hidden: true },
          }),
        ).rejects.toMatchObject({
          code: "MONGO_UNSUPPORTED_OPERATION",
          message: expect.stringContaining("MongoDB 4.4"),
        });
      });

      test("rejects when config.readonly is true even without options.readOnly", async () => {
        const readOnlyConfig = { ...dummyConfig, readonly: true };
        await expect(
          mongoConnector.createIndex(readOnlyConfig, {
            collection: "users",
            key: { email: 1 },
          }),
        ).rejects.toMatchObject({
          code: "MONGO_READ_ONLY",
        });
      });
    });

    describe("dropIndex", () => {
      test("rejects when connection is read-only", async () => {
        await expect(
          mongoConnector.dropIndex(
            dummyConfig,
            { collection: "users", indexName: "idx_email" },
            { readOnly: true },
          ),
        ).rejects.toMatchObject({ code: "MONGO_READ_ONLY" });
      });

      test("strictly prevents dropping the immutable default primary key index _id_", async () => {
        await expect(
          mongoConnector.dropIndex(dummyConfig, { collection: "users", indexName: "_id_" }),
        ).rejects.toMatchObject({
          code: "MONGO_FORBIDDEN",
          message: expect.stringContaining("_id_"),
        });
        expect(mockCollection.dropIndex).not.toHaveBeenCalled();
      });

      test("strictly prevents dropping wildcard '*' index with MONGO_FORBIDDEN", async () => {
        await expect(
          mongoConnector.dropIndex(dummyConfig, { collection: "users", indexName: "*" }),
        ).rejects.toMatchObject({
          code: "MONGO_FORBIDDEN",
          message: expect.stringContaining("Wildcard"),
        });
        expect(mockCollection.dropIndex).not.toHaveBeenCalled();
      });

      test("rejects empty or whitespace indexName", async () => {
        await expect(
          mongoConnector.dropIndex(dummyConfig, { collection: "users", indexName: "" }),
        ).rejects.toMatchObject({ code: "MONGO_VALIDATION_ERROR" });
        await expect(
          mongoConnector.dropIndex(dummyConfig, { collection: "users", indexName: "  " }),
        ).rejects.toMatchObject({ code: "MONGO_VALIDATION_ERROR" });
      });

      test("drops secondary index and clears caches", async () => {
        const clearCacheSpy = jest.spyOn(mongodbCache, "clearCollectionCache");

        const res = await mongoConnector.dropIndex(dummyConfig, {
          collection: "users",
          indexName: "idx_email",
        });

        expect(res.success).toBe(true);
        expect(res.droppedIndexName).toBe("idx_email");
        expect(res.executionTimeMs).toBeGreaterThanOrEqual(0);
        expect(mockCollection.dropIndex).toHaveBeenCalledWith("idx_email", expect.any(Object));
        expect(clearCacheSpy).toHaveBeenCalledWith(dummyConfig, "users");
      });

      test("maps driver IndexNotFound (code 27) to MONGO_NOT_FOUND", async () => {
        mockCollection.dropIndex = jest.fn<any>().mockRejectedValue({
          code: 27,
          codeName: "IndexNotFound",
          message: "index not found with name [idx_missing]",
        });

        await expect(
          mongoConnector.dropIndex(dummyConfig, {
            collection: "users",
            indexName: "idx_missing",
          }),
        ).rejects.toMatchObject({ code: "MONGO_NOT_FOUND" });
      });
    });

    describe("getIndexStats", () => {
      test("rejects invalid collection name", async () => {
        await expect(mongoConnector.getIndexStats(dummyConfig, { collection: "" })).rejects.toThrow(
          MongoApiError,
        );
      });

      test("aggregates $indexStats and maps results into stats items", async () => {
        const res = await mongoConnector.getIndexStats(dummyConfig, { collection: "users" });
        expect(res.collection).toBe("users");
        expect(res.stats.idx_email).toBeDefined();
        expect(res.stats.idx_email.ops).toBe(50);
        expect(res.stats.idx_email.host).toBe("localhost:27017");
        expect(res.stats.idx_email.since).toBe("2026-10-30T00:00:00.000Z");
        expect(mockCollection.aggregate).toHaveBeenCalledWith(
          [{ $indexStats: {} }],
          expect.any(Object),
        );
      });

      test("handles NamespaceNotFound by returning empty stats", async () => {
        mockCollection.aggregate = jest.fn<any>().mockReturnValue({
          toArray: jest.fn<any>().mockRejectedValue({ code: 26, codeName: "NamespaceNotFound" }),
        });

        const res = await mongoConnector.getIndexStats(dummyConfig, { collection: "missing" });
        expect(res.stats).toEqual({});
      });
    });

    describe("hideIndex", () => {
      test("rejects when connection is read-only", async () => {
        await expect(
          mongoConnector.hideIndex(
            dummyConfig,
            { collection: "users", indexName: "idx_email", hidden: true },
            { readOnly: true },
          ),
        ).rejects.toMatchObject({ code: "MONGO_READ_ONLY" });
      });

      test("rejects hiding the immutable default primary key index _id_", async () => {
        await expect(
          mongoConnector.hideIndex(dummyConfig, {
            collection: "users",
            indexName: "_id_",
            hidden: true,
          }),
        ).rejects.toMatchObject({
          code: "MONGO_FORBIDDEN",
          message: expect.stringContaining("_id_"),
        });
        expect(mockDb.command).not.toHaveBeenCalled();
      });

      test("rejects non-boolean hidden parameter", async () => {
        await expect(
          mongoConnector.hideIndex(dummyConfig, {
            collection: "users",
            indexName: "idx_email",
            hidden: "yes" as any,
          }),
        ).rejects.toMatchObject({ code: "MONGO_VALIDATION_ERROR" });
      });

      test("issues collMod command to toggle hidden status and clears caches", async () => {
        const clearCacheSpy = jest.spyOn(mongodbCache, "clearCollectionCache");

        const res = await mongoConnector.hideIndex(dummyConfig, {
          collection: "users",
          indexName: "idx_email",
          hidden: true,
        });

        expect(res.success).toBe(true);
        expect(res.indexName).toBe("idx_email");
        expect(res.hidden).toBe(true);
        expect(mockDb.command).toHaveBeenCalledWith({
          collMod: "users",
          index: {
            name: "idx_email",
            hidden: true,
          },
        });
        expect(clearCacheSpy).toHaveBeenCalledWith(dummyConfig, "users");
      });

      test("maps IndexNotFound error to MONGO_NOT_FOUND", async () => {
        mockDb.command = jest.fn<any>().mockRejectedValue({
          code: 27,
          codeName: "IndexNotFound",
          message: "cannot find index to hide",
        });

        await expect(
          mongoConnector.hideIndex(dummyConfig, {
            collection: "users",
            indexName: "idx_missing",
            hidden: false,
          }),
        ).rejects.toMatchObject({ code: "MONGO_NOT_FOUND" });
      });

      test("maps unsupported collMod option (< MongoDB 4.4) to MONGO_UNSUPPORTED_OPERATION", async () => {
        mockDb.command = jest.fn<any>().mockRejectedValue({
          code: 72,
          codeName: "InvalidOptions",
          message: "no option found to collMod: index",
        });

        await expect(
          mongoConnector.hideIndex(dummyConfig, {
            collection: "users",
            indexName: "idx_email",
            hidden: true,
          }),
        ).rejects.toMatchObject({
          code: "MONGO_UNSUPPORTED_OPERATION",
          message: expect.stringContaining("MongoDB 4.4"),
        });
      });
    });
  });

  // =========================================================================
  // 3. QueryExecutor Delegation & Type Check Tests
  // =========================================================================
  describe("QueryExecutor Index Delegation", () => {
    let executor: QueryExecutor;

    beforeEach(() => {
      executor = new QueryExecutor();
    });

    test("throws MONGO_UNSUPPORTED_OPERATION when dbType is not MONGODB", async () => {
      const nonMongoTypes = [DBType.POSTGRES, DBType.MYSQL, DBType.SQLITE, DBType.DUCKDB];

      for (const t of nonMongoTypes) {
        await expect(
          executor.listIndexes(dummyConfig, t, { collection: "users" }),
        ).rejects.toMatchObject({ code: "MONGO_UNSUPPORTED_OPERATION" });

        await expect(
          executor.createIndex(dummyConfig, t, { collection: "users", key: { a: 1 } }),
        ).rejects.toMatchObject({ code: "MONGO_UNSUPPORTED_OPERATION" });

        await expect(
          executor.dropIndex(dummyConfig, t, { collection: "users", indexName: "idx_a" }),
        ).rejects.toMatchObject({ code: "MONGO_UNSUPPORTED_OPERATION" });

        await expect(
          executor.getIndexStats(dummyConfig, t, { collection: "users" }),
        ).rejects.toMatchObject({ code: "MONGO_UNSUPPORTED_OPERATION" });

        await expect(
          executor.hideIndex(dummyConfig, t, {
            collection: "users",
            indexName: "idx_a",
            hidden: true,
          }),
        ).rejects.toMatchObject({ code: "MONGO_UNSUPPORTED_OPERATION" });
      }
    });

    test("delegates to mongoConnector when dbType is MONGODB", async () => {
      const listSpy = jest
        .spyOn(mongoConnector, "listIndexes")
        .mockResolvedValueOnce({ collection: "users", indexes: [], totalSizeBytes: 0 });
      const createSpy = jest
        .spyOn(mongoConnector, "createIndex")
        .mockResolvedValueOnce({ success: true, indexName: "idx_a", executionTimeMs: 5 });
      const dropSpy = jest
        .spyOn(mongoConnector, "dropIndex")
        .mockResolvedValueOnce({ success: true, droppedIndexName: "idx_a", executionTimeMs: 5 });
      const statsSpy = jest
        .spyOn(mongoConnector, "getIndexStats")
        .mockResolvedValueOnce({ collection: "users", stats: {} });
      const hideSpy = jest
        .spyOn(mongoConnector, "hideIndex")
        .mockResolvedValueOnce({ success: true, indexName: "idx_a", hidden: true });

      await executor.listIndexes(dummyConfig, DBType.MONGODB, { collection: "users" });
      expect(listSpy).toHaveBeenCalledWith(dummyConfig, { collection: "users" });

      await executor.createIndex(
        dummyConfig,
        DBType.MONGODB,
        { collection: "users", key: { a: 1 } },
        { readOnly: false },
      );
      expect(createSpy).toHaveBeenCalledWith(
        dummyConfig,
        { collection: "users", key: { a: 1 } },
        { readOnly: false },
      );

      await executor.dropIndex(
        dummyConfig,
        DBType.MONGODB,
        { collection: "users", indexName: "idx_a" },
        { readOnly: false },
      );
      expect(dropSpy).toHaveBeenCalledWith(
        dummyConfig,
        { collection: "users", indexName: "idx_a" },
        { readOnly: false },
      );

      await executor.getIndexStats(dummyConfig, DBType.MONGODB, { collection: "users" });
      expect(statsSpy).toHaveBeenCalledWith(dummyConfig, { collection: "users" });

      await executor.hideIndex(
        dummyConfig,
        DBType.MONGODB,
        { collection: "users", indexName: "idx_a", hidden: true },
        { readOnly: false },
      );
      expect(hideSpy).toHaveBeenCalledWith(
        dummyConfig,
        { collection: "users", indexName: "idx_a", hidden: true },
        { readOnly: false },
      );
    });
  });

  // =========================================================================
  // 4. IndexHandlers RPC Dispatch Tests
  // =========================================================================
  describe("IndexHandlers RPC Dispatch", () => {
    let mockRpc: any;
    let mockLogger: any;
    let mockDbService: any;
    let mockQueryExecutor: any;
    let handlers: IndexHandlers;

    beforeEach(() => {
      mockRpc = {
        sendResponse: jest.fn(),
        sendError: jest.fn(),
      };
      mockLogger = {
        error: jest.fn(),
        warn: jest.fn(),
        info: jest.fn(),
        debug: jest.fn(),
      };
      mockDbService = {
        getDatabaseConnection: jest.fn<any>().mockResolvedValue({
          db: { id: "mongo-1", name: "testdb", readonly: false },
          conn: dummyConfig,
          dbType: DBType.MONGODB,
        }),
      };
      mockQueryExecutor = {
        listIndexes: jest.fn<any>().mockResolvedValue({
          collection: "users",
          indexes: [],
          totalSizeBytes: 0,
        }),
        createIndex: jest.fn<any>().mockResolvedValue({
          success: true,
          indexName: "idx_test",
          executionTimeMs: 10,
        }),
        dropIndex: jest.fn<any>().mockResolvedValue({
          success: true,
          droppedIndexName: "idx_test",
          executionTimeMs: 8,
        }),
        getIndexStats: jest.fn<any>().mockResolvedValue({
          collection: "users",
          stats: {},
        }),
        hideIndex: jest.fn<any>().mockResolvedValue({
          success: true,
          indexName: "idx_test",
          hidden: true,
        }),
      };

      handlers = new IndexHandlers(mockRpc, mockLogger, mockDbService, mockQueryExecutor);
    });

    test("handleListIndexes dispatches successfully", async () => {
      await handlers.handleListIndexes({ dbId: "mongo-1", collection: "users" }, 1);
      expect(mockQueryExecutor.listIndexes).toHaveBeenCalledWith(
        dummyConfig,
        DBType.MONGODB,
        { collection: "users" },
      );
      expect(mockRpc.sendResponse).toHaveBeenCalledWith(1, {
        ok: true,
        data: expect.objectContaining({ collection: "users" }),
      });
    });

    test("handleListIndexes rejects missing dbId or collection", async () => {
      await handlers.handleListIndexes({ collection: "users" }, 2);
      expect(mockRpc.sendError).toHaveBeenCalledWith(2, {
        code: "MONGO_VALIDATION_ERROR",
        message: "Missing dbId or collection",
      });

      await handlers.handleListIndexes({ dbId: "mongo-1" }, 3);
      expect(mockRpc.sendError).toHaveBeenCalledWith(3, {
        code: "MONGO_VALIDATION_ERROR",
        message: "Missing dbId or collection",
      });
    });

    test("handleCreateIndex extracts readOnly and dispatches successfully", async () => {
      await handlers.handleCreateIndex(
        { dbId: "mongo-1", collection: "users", key: { email: 1 } },
        4,
      );
      expect(mockQueryExecutor.createIndex).toHaveBeenCalledWith(
        dummyConfig,
        DBType.MONGODB,
        { collection: "users", key: { email: 1 }, options: undefined },
        { readOnly: false },
      );
      expect(mockRpc.sendResponse).toHaveBeenCalledWith(4, {
        ok: true,
        data: expect.objectContaining({ success: true }),
      });
    });

    test("handleCreateIndex extracts readOnly: true from db metadata", async () => {
      mockDbService.getDatabaseConnection.mockResolvedValueOnce({
        db: { id: "mongo-ro", name: "testdb", readonly: true },
        conn: dummyConfig,
        dbType: DBType.MONGODB,
      });

      await handlers.handleCreateIndex(
        { dbId: "mongo-ro", collection: "users", key: { email: 1 } },
        5,
      );
      expect(mockQueryExecutor.createIndex).toHaveBeenCalledWith(
        dummyConfig,
        DBType.MONGODB,
        { collection: "users", key: { email: 1 }, options: undefined },
        { readOnly: true },
      );
    });

    test("handleCreateIndex rejects missing parameters", async () => {
      await handlers.handleCreateIndex({ dbId: "mongo-1", collection: "users" }, 6);
      expect(mockRpc.sendError).toHaveBeenCalledWith(6, {
        code: "MONGO_VALIDATION_ERROR",
        message: "Missing dbId, collection, or key",
      });
    });

    test("handleDropIndex dispatches successfully", async () => {
      await handlers.handleDropIndex(
        { dbId: "mongo-1", collection: "users", indexName: "idx_email" },
        7,
      );
      expect(mockQueryExecutor.dropIndex).toHaveBeenCalledWith(
        dummyConfig,
        DBType.MONGODB,
        { collection: "users", indexName: "idx_email" },
        { readOnly: false },
      );
      expect(mockRpc.sendResponse).toHaveBeenCalledWith(7, {
        ok: true,
        data: expect.objectContaining({ success: true }),
      });
    });

    test("handleDropIndex rejects missing parameters", async () => {
      await handlers.handleDropIndex({ dbId: "mongo-1", collection: "users" }, 8);
      expect(mockRpc.sendError).toHaveBeenCalledWith(8, {
        code: "MONGO_VALIDATION_ERROR",
        message: "Missing dbId, collection, or indexName",
      });
    });

    test("handleGetIndexStats dispatches successfully", async () => {
      await handlers.handleGetIndexStats({ dbId: "mongo-1", collection: "users" }, 9);
      expect(mockQueryExecutor.getIndexStats).toHaveBeenCalledWith(
        dummyConfig,
        DBType.MONGODB,
        { collection: "users" },
      );
      expect(mockRpc.sendResponse).toHaveBeenCalledWith(9, {
        ok: true,
        data: expect.objectContaining({ collection: "users" }),
      });
    });

    test("handleHideIndex validates hidden boolean and dispatches successfully", async () => {
      await handlers.handleHideIndex(
        { dbId: "mongo-1", collection: "users", indexName: "idx_email", hidden: true },
        10,
      );
      expect(mockQueryExecutor.hideIndex).toHaveBeenCalledWith(
        dummyConfig,
        DBType.MONGODB,
        { collection: "users", indexName: "idx_email", hidden: true },
        { readOnly: false },
      );
      expect(mockRpc.sendResponse).toHaveBeenCalledWith(10, {
        ok: true,
        data: expect.objectContaining({ success: true, hidden: true }),
      });
    });

    test("handleHideIndex rejects non-boolean hidden parameter", async () => {
      await handlers.handleHideIndex(
        { dbId: "mongo-1", collection: "users", indexName: "idx_email", hidden: "invalid" },
        11,
      );
      expect(mockRpc.sendError).toHaveBeenCalledWith(11, {
        code: "MONGO_VALIDATION_ERROR",
        message: expect.stringContaining("hidden (must be a boolean)"),
      });
    });

    test("maps errors using sendMongoError", async () => {
      mockQueryExecutor.listIndexes.mockRejectedValueOnce(
        new MongoApiError("MONGO_NOT_FOUND", "Collection does not exist"),
      );

      await handlers.handleListIndexes({ dbId: "mongo-1", collection: "missing" }, 12);
      expect(mockRpc.sendError).toHaveBeenCalledWith(12, {
        code: "MONGO_NOT_FOUND",
        message: "Collection does not exist",
      });
      expect(mockLogger.error).toHaveBeenCalled();
    });
  });
});
