import { describe, expect, test, beforeEach, jest } from "@jest/globals";
import { MongoRelationshipHandlers } from "../../src/handlers/mongoRelationshipHandlers";

describe("MongoRelationshipHandlers Dispatch & Validation Tests (M7 Phase 1 Remediation)", () => {
  let mockRpc: any;
  let mockLogger: any;
  let mockEngine: any;
  let handlers: MongoRelationshipHandlers;

  beforeEach(() => {
    mockRpc = {
      sendResponse: jest.fn(),
      sendError: jest.fn(),
    };
    mockLogger = {
      error: jest.fn(),
      info: jest.fn(),
      warn: jest.fn(),
      debug: jest.fn(),
    };
    mockEngine = {
      inferRelationships: jest.fn<any>().mockResolvedValue({
        relationships: [],
        insufficientEvidence: [],
        inferredAt: "2026-11-02T12:00:00.000Z",
        collectionsScanned: 5,
      }),
      listRelationships: jest.fn<any>().mockResolvedValue({
        inferred: [],
        confirmed: [],
        rejectedIds: [],
        manual: [],
        insufficientEvidence: [],
      }),
      setRelationshipStatus: jest.fn<any>().mockResolvedValue({
        relationshipId: "test-rel",
        status: "confirmed",
      }),
      saveRelationship: jest.fn<any>().mockResolvedValue({
        relationship: { id: "test-rel" },
      }),
      deleteRelationship: jest.fn<any>().mockResolvedValue({
        success: true,
        relationshipId: "test-rel",
      }),
    };

    handlers = new MongoRelationshipHandlers(mockRpc, mockLogger, mockEngine);
  });

  // =========================================================================
  // 1. handleInfer
  // =========================================================================
  describe("handleInfer", () => {
    test("dispatches infer successfully with valid params", async () => {
      await handlers.handleInfer(
        {
          dbId: "mongo-1",
          projectId: "proj-1",
          collections: ["users", "orders"],
          sampleSize: 50,
          timeoutMs: 15000,
        },
        1,
      );
      expect(mockEngine.inferRelationships).toHaveBeenCalledWith("mongo-1", {
        projectId: "proj-1",
        collections: ["users", "orders"],
        sampleSize: 50,
        timeoutMs: 15000,
        maxCollections: undefined,
      });
      expect(mockRpc.sendResponse).toHaveBeenCalledWith(1, {
        ok: true,
        data: expect.objectContaining({ collectionsScanned: 5 }),
      });
    });

    test("rejects missing or empty dbId with BAD_REQUEST", async () => {
      await handlers.handleInfer({}, 2);
      expect(mockRpc.sendError).toHaveBeenCalledWith(2, {
        code: "BAD_REQUEST",
        message: expect.stringContaining("Missing or invalid required parameter: dbId"),
      });

      await handlers.handleInfer({ dbId: "   " }, 3);
      expect(mockRpc.sendError).toHaveBeenCalledWith(3, {
        code: "BAD_REQUEST",
        message: expect.stringContaining("Missing or invalid required parameter: dbId"),
      });
    });

    test("rejects invalid projectId with BAD_REQUEST", async () => {
      await handlers.handleInfer({ dbId: "mongo-1", projectId: 123 }, 4);
      expect(mockRpc.sendError).toHaveBeenCalledWith(4, {
        code: "BAD_REQUEST",
        message: expect.stringContaining("projectId must be a non-empty string"),
      });

      await handlers.handleInfer({ dbId: "mongo-1", projectId: "   " }, 5);
      expect(mockRpc.sendError).toHaveBeenCalledWith(5, {
        code: "BAD_REQUEST",
        message: expect.stringContaining("projectId must be a non-empty string"),
      });
    });

    test("rejects invalid collections with BAD_REQUEST", async () => {
      await handlers.handleInfer({ dbId: "mongo-1", collections: "not-array" }, 6);
      expect(mockRpc.sendError).toHaveBeenCalledWith(6, {
        code: "BAD_REQUEST",
        message: expect.stringContaining("collections must be an array of non-empty strings"),
      });

      await handlers.handleInfer({ dbId: "mongo-1", collections: ["valid", ""] }, 7);
      expect(mockRpc.sendError).toHaveBeenCalledWith(7, {
        code: "BAD_REQUEST",
        message: expect.stringContaining("collections must be an array of non-empty strings"),
      });
    });

    test("rejects invalid sampleSize and timeoutMs", async () => {
      await handlers.handleInfer({ dbId: "mongo-1", sampleSize: -10 }, 8);
      expect(mockRpc.sendError).toHaveBeenCalledWith(8, {
        code: "BAD_REQUEST",
        message: expect.stringContaining("sampleSize must be a positive number"),
      });

      await handlers.handleInfer({ dbId: "mongo-1", timeoutMs: 0 }, 9);
      expect(mockRpc.sendError).toHaveBeenCalledWith(9, {
        code: "BAD_REQUEST",
        message: expect.stringContaining("timeoutMs must be a positive number"),
      });
    });
  });

  // =========================================================================
  // 2. handleList
  // =========================================================================
  describe("handleList", () => {
    test("dispatches list successfully", async () => {
      await handlers.handleList({ dbId: "mongo-1", projectId: "proj-1" }, 10);
      expect(mockEngine.listRelationships).toHaveBeenCalledWith("mongo-1", "proj-1");
      expect(mockRpc.sendResponse).toHaveBeenCalledWith(10, {
        ok: true,
        data: expect.objectContaining({ inferred: [] }),
      });
    });

    test("rejects missing dbId or invalid projectId", async () => {
      await handlers.handleList({}, 11);
      expect(mockRpc.sendError).toHaveBeenCalledWith(11, {
        code: "BAD_REQUEST",
        message: expect.stringContaining("Missing or invalid required parameter: dbId"),
      });

      await handlers.handleList({ dbId: "mongo-1", projectId: "" }, 12);
      expect(mockRpc.sendError).toHaveBeenCalledWith(12, {
        code: "BAD_REQUEST",
        message: expect.stringContaining("projectId must be a non-empty string"),
      });
    });
  });

  // =========================================================================
  // 3. handleSetStatus
  // =========================================================================
  describe("handleSetStatus", () => {
    test("confirms relationship status successfully", async () => {
      await handlers.handleSetStatus(
        { dbId: "mongo-1", relationshipId: "rel-1", status: "confirmed" },
        13,
      );
      expect(mockEngine.setRelationshipStatus).toHaveBeenCalledWith(
        "mongo-1",
        "rel-1",
        "confirmed",
        undefined,
      );
      expect(mockRpc.sendResponse).toHaveBeenCalledWith(13, {
        ok: true,
        data: { relationshipId: "test-rel", status: "confirmed" },
      });
    });

    test("rejects invalid status", async () => {
      await handlers.handleSetStatus(
        { dbId: "mongo-1", relationshipId: "rel-1", status: "invalid_status" },
        14,
      );
      expect(mockRpc.sendError).toHaveBeenCalledWith(14, {
        code: "BAD_REQUEST",
        message: 'Parameter status must be either "confirmed" or "rejected"',
      });
    });

    test("rejects missing relationshipId", async () => {
      await handlers.handleSetStatus({ dbId: "mongo-1", status: "confirmed" }, 15);
      expect(mockRpc.sendError).toHaveBeenCalledWith(15, {
        code: "BAD_REQUEST",
        message: expect.stringContaining("relationshipId"),
      });
    });
  });

  // =========================================================================
  // 4. handleSave
  // =========================================================================
  describe("handleSave", () => {
    test("saves relationship successfully with valid object", async () => {
      const rel = {
        id: "orders.user_id->users._id",
        sourceCollection: "orders",
        sourceField: "user_id",
        targetCollection: "users",
        targetField: "_id",
        cardinality: "many-to-one",
      };

      await handlers.handleSave({ dbId: "mongo-1", relationship: rel }, 16);
      expect(mockEngine.saveRelationship).toHaveBeenCalledWith("mongo-1", rel, undefined);
      expect(mockRpc.sendResponse).toHaveBeenCalledWith(16, {
        ok: true,
        data: expect.objectContaining({ relationship: expect.any(Object) }),
      });
    });

    test("rejects invalid cardinality", async () => {
      const rel = {
        id: "orders.user_id->users._id",
        sourceCollection: "orders",
        sourceField: "user_id",
        targetCollection: "users",
        targetField: "_id",
        cardinality: "not-a-valid-cardinality",
      };

      await handlers.handleSave({ dbId: "mongo-1", relationship: rel }, 17);
      expect(mockRpc.sendError).toHaveBeenCalledWith(17, {
        code: "BAD_REQUEST",
        message: expect.stringContaining("Invalid cardinality"),
      });
    });

    test("rejects incomplete relationship object", async () => {
      await handlers.handleSave(
        { dbId: "mongo-1", relationship: { id: "rel-1", sourceCollection: "orders" } },
        18,
      );
      expect(mockRpc.sendError).toHaveBeenCalledWith(18, {
        code: "BAD_REQUEST",
        message: expect.stringContaining(
          "Relationship object missing required non-empty string fields",
        ),
      });
    });
  });

  // =========================================================================
  // 5. handleDelete
  // =========================================================================
  describe("handleDelete", () => {
    test("deletes relationship successfully", async () => {
      await handlers.handleDelete({ dbId: "mongo-1", relationshipId: "rel-1" }, 19);
      expect(mockEngine.deleteRelationship).toHaveBeenCalledWith("mongo-1", "rel-1", undefined);
      expect(mockRpc.sendResponse).toHaveBeenCalledWith(19, {
        ok: true,
        data: { success: true, relationshipId: "test-rel" },
      });
    });

    test("rejects missing relationshipId", async () => {
      await handlers.handleDelete({ dbId: "mongo-1" }, 20);
      expect(mockRpc.sendError).toHaveBeenCalledWith(20, {
        code: "BAD_REQUEST",
        message: expect.stringContaining("relationshipId"),
      });
    });
  });
});
