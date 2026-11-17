import { describe, expect, test, beforeEach, jest } from "@jest/globals";
import { ObjectId } from "mongodb";
import { MongoRelationshipEngine } from "../src/services/mongoRelationshipEngine";
import { MongoRelationshipsFile } from "../src/types/mongo";

describe("MongoRelationshipEngine Unit & Heuristic Tests (M7 Phase 1 Remediation)", () => {
  let engine: MongoRelationshipEngine;
  let mockDbService: any;
  let mockProjectStore: any;
  let storedRelationships: MongoRelationshipsFile;

  beforeEach(() => {
    storedRelationships = {
      version: 1,
      databaseId: "test-db",
      inferred: [],
      confirmed: [],
      rejectedIds: [],
      manual: [],
      insufficientEvidence: [],
      updatedAt: new Date().toISOString(),
    };

    mockProjectStore = {
      getMongoRelationships: jest.fn<any>().mockImplementation(async () => storedRelationships),
      saveMongoRelationships: jest.fn<any>().mockImplementation(async (file: any) => {
        storedRelationships = file;
      }),
    };

    mockDbService = {
      getDatabaseConnection: jest.fn(),
    };

    engine = new MongoRelationshipEngine(mockDbService, mockProjectStore);
  });

  describe("Candidate Name Derivation & Normalization", () => {
    test("derives candidate collection names and normalizes ObjectIds", () => {
      expect(engine.deriveCandidateCollectionNames("userId")).toEqual(
        expect.arrayContaining(["user", "users"]),
      );
      expect(engine.deriveCandidateCollectionNames("items.productId")).toEqual(
        expect.arrayContaining(["product", "products"]),
      );
      const oid = new ObjectId("507f1f77bcf86cd799439011");
      expect(engine.normalizeIdValue(oid)).toBe("507f1f77bcf86cd799439011");
      expect(engine.normalizeIdValue({ $oid: "507f1f77bcf86cd799439011" })).toBe(
        "507f1f77bcf86cd799439011",
      );
      expect(engine.normalizeIdValue("507f1f77bcf86cd799439011")).toBe("507f1f77bcf86cd799439011");
    });
  });

  describe("Embedded Subdocument Arrays & Dotted Paths (LOW-02)", () => {
    test("extracts embedded subdocument array fields and filters out embedded _ids", () => {
      const p1 = new ObjectId();
      const docs = [
        {
          _id: new ObjectId(),
          items: [
            {
              _id: new ObjectId(), // Embedded _id MUST be ignored
              productId: p1,
              title: "Widget",
            },
          ],
        },
      ];

      const candidates = engine.extractCandidateFields(docs);
      const paths = candidates.map((c) => c.sourcePath);

      expect(paths).toContain("items.productId");
      expect(paths).not.toContain("items._id");
      expect(paths).not.toContain("_id");

      // Verify extractFieldValue extracts from array of objects
      const extracted = engine.extractFieldValue(docs[0], "items.productId");
      expect(extracted).toEqual([p1]);
    });
  });

  describe("Unique Index Cardinality Rigor (MED-01)", () => {
    test("infers one-to-one only for ordinary single-field unique index", async () => {
      const targetOid = new ObjectId();

      const mockProfilesCol = {
        find: jest.fn().mockReturnValue({
          toArray: jest.fn<any>().mockResolvedValue([{ _id: targetOid }]),
          limit: jest.fn().mockReturnThis(),
        }),
        indexes: jest.fn<any>().mockResolvedValue([]),
      };

      const mockUsersCol = {
        find: jest.fn().mockReturnValue({
          toArray: jest
            .fn<any>()
            .mockResolvedValue([{ _id: new ObjectId(), profile_id: targetOid }]),
          limit: jest.fn().mockReturnThis(),
        }),
        indexes: jest.fn<any>().mockResolvedValue([
          { key: { profile_id: 1 }, unique: true }, // valid single-field unique
        ]),
      };

      const mockDb: any = {
        listCollections: jest.fn().mockReturnValue({
          toArray: jest.fn<any>().mockResolvedValue([{ name: "users" }, { name: "profiles" }]),
        }),
        collection: jest.fn((colName: string) => {
          if (colName === "users") return mockUsersCol;
          if (colName === "profiles") return mockProfilesCol;
          throw new Error(`Unknown col ${colName}`);
        }),
      };
      jest.spyOn(engine, "getDb").mockResolvedValue(mockDb);

      const res = await engine.inferRelationships("test-db");
      const rel = res.relationships.find((r) => r.id === "users.profile_id->profiles._id")!;
      expect(rel).toBeDefined();
      expect(rel.cardinality).toBe("one-to-one");
      expect(rel.evidence.hasUniqueIndexOnSource).toBe(true);
    });

    test("excludes sparse, partial, and compound unique indexes from one-to-one", async () => {
      const targetOid = new ObjectId();

      const mockTargetCol = {
        find: jest.fn().mockReturnValue({
          toArray: jest.fn<any>().mockResolvedValue([{ _id: targetOid }]),
          limit: jest.fn().mockReturnThis(),
        }),
        indexes: jest.fn<any>().mockResolvedValue([]),
      };

      const mockSourceCol = {
        find: jest.fn().mockReturnValue({
          toArray: jest
            .fn<any>()
            .mockResolvedValue([{ _id: new ObjectId(), target_id: targetOid }]),
          limit: jest.fn().mockReturnThis(),
        }),
        indexes: jest.fn<any>().mockResolvedValue([
          { key: { target_id: 1 }, unique: true, sparse: true }, // sparse -> excluded!
          { key: { target_id: 1 }, unique: true, partialFilterExpression: { active: true } }, // partial -> excluded!
          { key: { target_id: 1, tenant_id: 1 }, unique: true }, // compound -> excluded!
        ]),
      };

      const mockDb: any = {
        listCollections: jest.fn().mockReturnValue({
          toArray: jest.fn<any>().mockResolvedValue([{ name: "sources" }, { name: "targets" }]),
        }),
        collection: jest.fn((colName: string) => {
          if (colName === "sources") return mockSourceCol;
          if (colName === "targets") return mockTargetCol;
          throw new Error(`Unknown col ${colName}`);
        }),
      };
      jest.spyOn(engine, "getDb").mockResolvedValue(mockDb);

      const res = await engine.inferRelationships("test-db");
      const rel = res.relationships.find((r) => r.id === "sources.target_id->targets._id")!;
      expect(rel).toBeDefined();
      expect(rel.cardinality).not.toBe("one-to-one"); // Must NOT be one-to-one
      expect(rel.evidence.hasUniqueIndexOnSource).toBe(false);
    });
  });

  describe("Insufficient Evidence Semantics (MED-02)", () => {
    test("separates insufficient evidence (< 0.65) into diagnostic list", async () => {
      const mockCodesCol = {
        find: jest.fn().mockReturnValue({
          toArray: jest.fn<any>().mockResolvedValue([{ _id: "non_hex_custom_1" }]),
          limit: jest.fn().mockReturnThis(),
        }),
        indexes: jest.fn<any>().mockResolvedValue([]),
      };

      // Source field has matching name to "codes" (nameScore = 1.0) and generic string type (typeScore = 0.3)
      // HitRatio = 0.50 (1/2 matched)
      // Confidence = 0.55 * 0.5 + 0.25 * 1.0 + 0.20 * 0.3 = 0.275 + 0.25 + 0.06 = 0.585 (< 0.65)
      const mockSourcesCol = {
        find: jest.fn().mockReturnValue({
          toArray: jest.fn<any>().mockResolvedValue([
            { _id: new ObjectId(), code_id: "non_hex_custom_1" },
            { _id: new ObjectId(), code_id: "non_matching_value_123" },
          ]),
          limit: jest.fn().mockReturnThis(),
        }),
        indexes: jest.fn<any>().mockResolvedValue([]),
      };

      const mockDb: any = {
        listCollections: jest.fn().mockReturnValue({
          toArray: jest.fn<any>().mockResolvedValue([{ name: "sources" }, { name: "codes" }]),
        }),
        collection: jest.fn((colName: string) => {
          if (colName === "sources") return mockSourcesCol;
          if (colName === "codes") return mockCodesCol;
          throw new Error(`Unknown col ${colName}`);
        }),
      };
      jest.spyOn(engine, "getDb").mockResolvedValue(mockDb);

      const res = await engine.inferRelationships("test-db");
      // Must not be in actionable relationships
      expect(res.relationships.some((r) => r.sourceField === "code_id")).toBe(false);
      // Must be in insufficientEvidence diagnostic list
      const diag = res.insufficientEvidence.find((r) => r.sourceField === "code_id");
      expect(diag).toBeDefined();
      expect(diag?.cardinality).toBe("insufficient-evidence");
      expect(diag?.confidence).toBeLessThan(0.65);
    });
  });

  describe("Bounded Target Discovery & Collection Scoping (HIGH-01 / LOW-01)", () => {
    test("does not query all unrelated collections when candidate name matches", async () => {
      const u1 = new ObjectId();
      const mockUsersCol = {
        find: jest.fn().mockReturnValue({
          toArray: jest.fn<any>().mockResolvedValue([{ _id: u1 }]),
          limit: jest.fn().mockReturnThis(),
        }),
        indexes: jest.fn<any>().mockResolvedValue([]),
      };
      const mockOrdersCol = {
        find: jest.fn().mockReturnValue({
          toArray: jest.fn<any>().mockResolvedValue([{ _id: new ObjectId(), userId: u1 }]),
          limit: jest.fn().mockReturnThis(),
        }),
        indexes: jest.fn<any>().mockResolvedValue([]),
      };
      const mockUnrelatedCol = {
        find: jest.fn().mockReturnValue({
          toArray: jest.fn<any>().mockResolvedValue([]),
          limit: jest.fn().mockReturnThis(),
        }),
        indexes: jest.fn<any>().mockResolvedValue([]),
      };

      const mockDb: any = {
        listCollections: jest.fn().mockReturnValue({
          toArray: jest
            .fn<any>()
            .mockResolvedValue([
              { name: "users" },
              { name: "orders" },
              { name: "logs" },
              { name: "analytics" },
              { name: "audit" },
            ]),
        }),
        collection: jest.fn((colName: string) => {
          if (colName === "users") return mockUsersCol;
          if (colName === "orders") return mockOrdersCol;
          return mockUnrelatedCol;
        }),
      };
      jest.spyOn(engine, "getDb").mockResolvedValue(mockDb);

      await engine.inferRelationships("test-db");

      // logs, analytics, audit should NOT have target find queries for userId!
      expect(mockUsersCol.find).toHaveBeenCalled();
    });

    test("scopes inference to requested collections when provided", async () => {
      const mockDb: any = {
        listCollections: jest.fn().mockReturnValue({
          toArray: jest
            .fn<any>()
            .mockResolvedValue([{ name: "users" }, { name: "orders" }, { name: "products" }]),
        }),
        collection: jest.fn().mockReturnValue({
          find: jest.fn().mockReturnValue({
            toArray: jest.fn<any>().mockResolvedValue([]),
            limit: jest.fn().mockReturnThis(),
          }),
          indexes: jest.fn<any>().mockResolvedValue([]),
        }),
      };
      jest.spyOn(engine, "getDb").mockResolvedValue(mockDb);

      const res = await engine.inferRelationships("test-db", {
        collections: ["users", "orders"],
      });

      expect(res.collectionsScanned).toBe(2);
      expect(mockDb.collection).not.toHaveBeenCalledWith("products");
    });

    test("does not query arbitrary collections when candidate has no matching target (LOW-REM-02)", async () => {
      // Source collection has an externalId field (ends in Id), but no collection named externals/external exists
      const mockSourcesCol = {
        find: jest.fn().mockReturnValue({
          toArray: jest
            .fn<any>()
            .mockResolvedValue([{ _id: new ObjectId(), externalId: new ObjectId() }]),
          limit: jest.fn().mockReturnThis(),
        }),
        indexes: jest.fn<any>().mockResolvedValue([]),
      };
      const mockProductsCol = {
        find: jest.fn().mockReturnValue({
          toArray: jest.fn<any>().mockResolvedValue([]),
          limit: jest.fn().mockReturnThis(),
        }),
        indexes: jest.fn<any>().mockResolvedValue([]),
      };
      const mockOrdersCol = {
        find: jest.fn().mockReturnValue({
          toArray: jest.fn<any>().mockResolvedValue([]),
          limit: jest.fn().mockReturnThis(),
        }),
        indexes: jest.fn<any>().mockResolvedValue([]),
      };

      const mockDb: any = {
        listCollections: jest.fn().mockReturnValue({
          toArray: jest
            .fn<any>()
            .mockResolvedValue([{ name: "sources" }, { name: "products" }, { name: "orders" }]),
        }),
        collection: jest.fn((colName: string) => {
          if (colName === "sources") return mockSourcesCol;
          if (colName === "products") return mockProductsCol;
          if (colName === "orders") return mockOrdersCol;
          throw new Error(`Unknown col ${colName}`);
        }),
      };
      jest.spyOn(engine, "getDb").mockResolvedValue(mockDb);

      const res = await engine.inferRelationships("test-db");

      // Target collections should NOT be probed for externalId because neither products nor orders match "external"
      expect(mockProductsCol.find).not.toHaveBeenCalledWith(
        expect.objectContaining({ _id: expect.anything() }),
        expect.anything(),
      );
      expect(mockOrdersCol.find).not.toHaveBeenCalledWith(
        expect.objectContaining({ _id: expect.anything() }),
        expect.anything(),
      );
      expect(res.relationships.length).toBe(0);
    });

    test("stops inference and reports timedOut when overall deadline is exceeded without persisting partial results (MED-REM-01)", async () => {
      // Seed pre-existing stored relationships
      const preExistingInferred = [
        {
          id: "orders.customer_id->customers._id",
          sourceCollection: "orders",
          sourceField: "customer_id",
          targetCollection: "customers",
          targetField: "_id",
          cardinality: "many-to-one" as const,
          confidence: 0.9,
          evidence: {} as any,
          status: "inferred" as const,
          inferredAt: "2026-01-01T00:00:00.000Z",
        },
      ];
      storedRelationships.inferred = [...preExistingInferred];
      storedRelationships.insufficientEvidence = [
        {
          id: "orders.code->codes._id",
          sourceCollection: "orders",
          sourceField: "code",
          targetCollection: "codes",
          targetField: "_id",
          cardinality: "insufficient-evidence" as const,
          confidence: 0.4,
          evidence: {} as any,
          status: "inferred" as const,
          inferredAt: "2026-01-01T00:00:00.000Z",
        },
      ];

      const mockDb: any = {
        listCollections: jest.fn().mockReturnValue({
          toArray: jest
            .fn<any>()
            .mockResolvedValue([{ name: "col_1" }, { name: "col_2" }, { name: "col_3" }]),
        }),
        collection: jest.fn().mockReturnValue({
          find: jest.fn().mockReturnValue({
            toArray: jest.fn<any>().mockResolvedValue([]),
            limit: jest.fn().mockReturnThis(),
          }),
          indexes: jest.fn<any>().mockResolvedValue([]),
        }),
      };
      jest.spyOn(engine, "getDb").mockResolvedValue(mockDb);

      // Force Date.now to simulate deadline expiry after first collection
      let calls = 0;
      const originalNow = Date.now;
      jest.spyOn(Date, "now").mockImplementation(() => {
        calls++;
        return calls > 3 ? originalNow() + 100000 : originalNow();
      });

      const res = await engine.inferRelationships("test-db", { timeoutMs: 1000 });
      expect(res.timedOut).toBe(true);

      // Verify saveMongoRelationships was NOT called on timeout (MED-REM-01)
      expect(mockProjectStore.saveMongoRelationships).not.toHaveBeenCalled();

      // Verify stored relationships in memory remain untouched
      expect(storedRelationships.inferred).toEqual(preExistingInferred);
      expect(storedRelationships.insufficientEvidence?.length).toBe(1);

      jest.spyOn(Date, "now").mockRestore();
    });

    test("passes exact sub-100ms remaining deadline to maxTimeMS (LOW-REM-01)", async () => {
      let capturedMaxTimeMS: number | undefined;

      const mockDb: any = {
        listCollections: jest.fn().mockReturnValue({
          toArray: jest.fn<any>().mockResolvedValue([{ name: "single_col" }]),
        }),
        collection: jest.fn().mockReturnValue({
          find: jest.fn().mockImplementation((_filter: any, options: any) => {
            capturedMaxTimeMS = options?.maxTimeMS;
            return {
              toArray: jest.fn<any>().mockResolvedValue([]),
              limit: jest.fn().mockReturnThis(),
            };
          }),
          indexes: jest.fn<any>().mockResolvedValue([]),
        }),
      };
      jest.spyOn(engine, "getDb").mockResolvedValue(mockDb);

      const baseNow = 1000000;
      let callCount = 0;
      jest.spyOn(Date, "now").mockImplementation(() => {
        callCount++;
        // On collection loop (callCount >= 2), remaining time is 45ms (less than 100ms)
        if (callCount >= 2) return baseNow + 1000 - 45;
        return baseNow;
      });

      await engine.inferRelationships("test-db", { timeoutMs: 1000 });

      // Must NOT be floored to 100; must be exact remaining 45ms
      expect(capturedMaxTimeMS).toBe(45);

      jest.spyOn(Date, "now").mockRestore();
    });
  });

  describe("String Hex vs BSON ObjectId Normalization", () => {
    test("matches target collection where _id is stored as 24-char hex string", async () => {
      const hexId = "507f1f77bcf86cd799439011";

      const mockCustomersCol = {
        find: jest.fn().mockImplementation((filter: any) => {
          // Verify that query filter contains both ObjectId and raw string
          const values = filter?._id?.$in || [];
          const hasStringMatch = values.includes(hexId);
          return {
            toArray: jest.fn<any>().mockResolvedValue(hasStringMatch ? [{ _id: hexId }] : []),
            limit: jest.fn().mockReturnThis(),
          };
        }),
        indexes: jest.fn<any>().mockResolvedValue([]),
      };

      const mockInvoicesCol = {
        find: jest.fn().mockReturnValue({
          toArray: jest.fn<any>().mockResolvedValue([{ _id: new ObjectId(), customer_id: hexId }]),
          limit: jest.fn().mockReturnThis(),
        }),
        indexes: jest.fn<any>().mockResolvedValue([]),
      };

      const mockDb: any = {
        listCollections: jest.fn().mockReturnValue({
          toArray: jest.fn<any>().mockResolvedValue([{ name: "customers" }, { name: "invoices" }]),
        }),
        collection: jest.fn((colName: string) => {
          if (colName === "customers") return mockCustomersCol;
          if (colName === "invoices") return mockInvoicesCol;
          throw new Error(`Unknown col ${colName}`);
        }),
      };
      jest.spyOn(engine, "getDb").mockResolvedValue(mockDb);

      const res = await engine.inferRelationships("test-db");
      const rel = res.relationships.find((r) => r.id === "invoices.customer_id->customers._id");
      expect(rel).toBeDefined();
      expect(rel?.evidence.hitRatio).toBe(1.0);
    });
  });

  describe("Ambiguous Target Penalty", () => {
    test("applies 0.30 ambiguity penalty when multiple targets match", async () => {
      const sharedId = new ObjectId();

      const mockColA = {
        find: jest.fn().mockReturnValue({
          toArray: jest.fn<any>().mockResolvedValue([{ _id: sharedId }]),
          limit: jest.fn().mockReturnThis(),
        }),
        indexes: jest.fn<any>().mockResolvedValue([]),
      };
      const mockColB = {
        find: jest.fn().mockReturnValue({
          toArray: jest.fn<any>().mockResolvedValue([{ _id: sharedId }]),
          limit: jest.fn().mockReturnThis(),
        }),
        indexes: jest.fn<any>().mockResolvedValue([]),
      };
      const mockSourceCol = {
        find: jest.fn().mockReturnValue({
          toArray: jest.fn<any>().mockResolvedValue([{ _id: new ObjectId(), target_id: sharedId }]),
          limit: jest.fn().mockReturnThis(),
        }),
        indexes: jest.fn<any>().mockResolvedValue([]),
      };

      const mockDb: any = {
        listCollections: jest.fn().mockReturnValue({
          toArray: jest
            .fn<any>()
            .mockResolvedValue([{ name: "source" }, { name: "target" }, { name: "targets" }]),
        }),
        collection: jest.fn((colName: string) => {
          if (colName === "source") return mockSourceCol;
          if (colName === "target") return mockColA;
          if (colName === "targets") return mockColB;
          throw new Error(`Unknown col ${colName}`);
        }),
      };
      jest.spyOn(engine, "getDb").mockResolvedValue(mockDb);

      // HitRatio = 1.0, TypeScore = 1.0, NameScore = 1.0 (both match "target" / "targets")
      // Without penalty: 0.55 * 1 + 0.25 * 1 + 0.20 * 1 = 1.00
      // With ambiguity penalty: 1.00 - 0.30 = 0.70
      const res = await engine.inferRelationships("test-db");
      expect(res.relationships.length).toBe(2);
      expect(res.relationships[0].confidence).toBe(0.7);
      expect(res.relationships[1].confidence).toBe(0.7);
    });
  });

  describe("State Retention Across Refresh & CRUD", () => {
    test("preserves confirmed, rejected, manual, and insufficient definitions", async () => {
      storedRelationships = {
        version: 1,
        databaseId: "test-db",
        inferred: [],
        confirmed: [
          {
            id: "orders.customer_id->customers._id",
            sourceCollection: "orders",
            sourceField: "customer_id",
            targetCollection: "customers",
            targetField: "_id",
            cardinality: "many-to-one",
            createdAt: "2026-01-01T00:00:00.000Z",
            updatedAt: "2026-01-01T00:00:00.000Z",
          },
        ],
        rejectedIds: ["orders.bad_id->products._id"],
        manual: [],
        insufficientEvidence: [],
        updatedAt: "2026-01-01T00:00:00.000Z",
      };

      const mockDb: any = {
        listCollections: jest.fn().mockReturnValue({
          toArray: jest.fn<any>().mockResolvedValue([]),
        }),
      };
      jest.spyOn(engine, "getDb").mockResolvedValue(mockDb);

      await engine.inferRelationships("test-db");

      expect(mockProjectStore.saveMongoRelationships).toHaveBeenCalledWith(
        expect.objectContaining({
          confirmed: expect.arrayContaining([
            expect.objectContaining({ id: "orders.customer_id->customers._id" }),
          ]),
          rejectedIds: ["orders.bad_id->products._id"],
        }),
        undefined,
        "test-db",
      );
    });

    test("sets status and manages manual CRUD", async () => {
      storedRelationships.inferred = [
        {
          id: "orders.user_id->users._id",
          sourceCollection: "orders",
          sourceField: "user_id",
          targetCollection: "users",
          targetField: "_id",
          cardinality: "many-to-one",
          confidence: 0.95,
          evidence: {} as any,
          status: "inferred",
          inferredAt: new Date().toISOString(),
        },
      ];

      const confRes = await engine.setRelationshipStatus(
        "test-db",
        "orders.user_id->users._id",
        "confirmed",
      );
      expect(confRes.status).toBe("confirmed");
      expect(storedRelationships.confirmed.length).toBe(1);

      const rejRes = await engine.setRelationshipStatus(
        "test-db",
        "orders.user_id->users._id",
        "rejected",
      );
      expect(rejRes.status).toBe("rejected");
      expect(storedRelationships.rejectedIds).toContain("orders.user_id->users._id");
      expect(storedRelationships.confirmed.length).toBe(0);
    });
  });
});
