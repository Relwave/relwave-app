import { describe, expect, test, beforeEach, afterEach, jest } from "@jest/globals";
import fs from "fs";
import path from "path";
import os from "os";
import {
  BulkOperationManager,
  MongoBulkEngine,
  parseImportPayload,
  parseCsv,
  flattenObject,
  escapeCsvValue,
  isValidUuidV4,
  MAX_IMPORT_CHUNK_DOCS,
  MAX_IMPORT_CHUNK_SIZE_BYTES,
  MAX_BULK_INSERT_DOCS,
  EXPORT_DIR,
} from "../src/services/mongoBulkEngine";
import { DBType } from "../src/types";

describe("MongoDB M7 Phase 3: Bulk Operations Bridge Engine", () => {
  let opManager: BulkOperationManager;
  let engine: MongoBulkEngine;
  let mockDbService: any;
  let mockCollection: any;
  let mockNativeDb: any;

  beforeEach(() => {
    opManager = new BulkOperationManager(60 * 60 * 1000); // 1-hour TTL

    mockCollection = {
      insertMany: jest.fn<any>().mockResolvedValue({
        insertedCount: 2,
        insertedIds: { 0: "id1", 1: "id2" },
      }),
      updateMany: jest.fn<any>().mockResolvedValue({
        matchedCount: 5,
        modifiedCount: 3,
        upsertedId: null,
      }),
      deleteMany: jest.fn<any>().mockResolvedValue({
        deletedCount: 15,
      }),
      find: jest.fn<any>(),
    };

    mockNativeDb = {
      collection: jest.fn().mockReturnValue(mockCollection),
    };

    mockDbService = {
      getDatabaseConnection: jest.fn<any>().mockResolvedValue({
        db: { id: "test-db", readonly: false },
        conn: { uri: "mongodb://localhost:27017/test" },
        dbType: DBType.MONGODB,
      }),
    };

    engine = new MongoBulkEngine(mockDbService, opManager);
    jest.spyOn(engine, "getDb").mockResolvedValue({
      db: { id: "test-db", readonly: false },
      conn: { uri: "mongodb://localhost:27017/test" },
      dbType: DBType.MONGODB,
      nativeDb: mockNativeDb,
    });
  });

  afterEach(() => {
    opManager.dispose();
  });

  // =========================================================================
  // 1. BulkOperationManager Lifecycle & State Machine
  // =========================================================================
  describe("BulkOperationManager", () => {
    test("validates and generates valid UUIDv4 operationIds", () => {
      const op = opManager.createOperation("import", "db-1", "users", "json");
      expect(isValidUuidV4(op.operation.operationId)).toBe(true);
      expect(op.operation.status).toBe("pending");
      expect(op.operation.collection).toBe("users");
    });

    test("enforces safe state machine transitions", () => {
      const op = opManager.createOperation("import", "db-1", "users", "json");
      const id = op.operation.operationId;

      // pending -> in_progress
      opManager.transition(id, "in_progress");
      expect(opManager.getOperation(id)?.operation.status).toBe("in_progress");

      // in_progress -> completed
      opManager.transition(id, "completed");
      expect(opManager.getOperation(id)?.operation.status).toBe("completed");

      // terminal state cannot transition again
      expect(() => opManager.transition(id, "in_progress")).toThrow(
        /Cannot transition terminal operation/
      );
    });

    test("handles cancellation and avoids concurrent cancellation races", () => {
      const op = opManager.createOperation("export", "db-1", "orders", "json");
      const id = op.operation.operationId;

      const cancelRes = opManager.cancel(id);
      expect(cancelRes.status).toBe("cancelled");
      expect(op.controller.signal.aborted).toBe(true);

      // Repeat cancel is idempotent and safe
      const repeatCancel = opManager.cancel(id);
      expect(repeatCancel.status).toBe("cancelled");
      expect(repeatCancel.message).toContain("already cancelled");
    });

    test("rejects path traversal attempts in operationId", () => {
      expect(() => opManager.getOperation("../etc/passwd")).toThrow(
        /Invalid operationId format/
      );
      expect(() => opManager.cleanup("invalid-uuid\0")).toThrow(
        /Invalid operationId format/
      );
    });

    test("respects 1-hour TTL expiration", () => {
      const shortTtlManager = new BulkOperationManager(10); // 10ms TTL
      const op = shortTtlManager.createOperation("import", "db-1", "users", "json");
      const id = op.operation.operationId;

      return new Promise<void>((resolve) => {
        setTimeout(() => {
          const fetched = shortTtlManager.getOperation(id);
          expect(fetched).toBeNull();
          shortTtlManager.dispose();
          resolve();
        }, 30);
      });
    });
  });

  // =========================================================================
  // 2. Parsing, Limits & Prototype Pollution Defense
  // =========================================================================
  describe("Parsing & Payload Guards", () => {
    test("parses JSON array format correctly", () => {
      const payload = JSON.stringify([{ name: "Alice", age: 30 }, { name: "Bob", age: 25 }]);
      const docs = parseImportPayload(payload, "json");
      expect(docs).toHaveLength(2);
      expect(docs[0].name).toBe("Alice");
    });

    test("rejects non-array JSON payloads", () => {
      const payload = JSON.stringify({ name: "Alice" });
      expect(() => parseImportPayload(payload, "json")).toThrow(
        /must be an array of documents/
      );
    });

    test("parses NDJSON format correctly", () => {
      const payload = '{"name":"Alice","score":100}\n{"name":"Bob","score":85}\n';
      const docs = parseImportPayload(payload, "ndjson");
      expect(docs).toHaveLength(2);
      expect(docs[1].score).toBe(85);
    });

    test("rejects malformed NDJSON lines", () => {
      const payload = '{"name":"Alice"}\nINVALID_JSON_LINE\n';
      expect(() => parseImportPayload(payload, "ndjson")).toThrow(/Invalid NDJSON at line 2/);
    });

    test("parses CSV with un-flattened dot notation, types, quotes, and newlines", () => {
      const csv =
        'user.name,user.age,active,notes\n' +
        '"Smith, Alice",30,true,"Line 1\nLine 2"\n' +
        'Bob,25,false,null\n';

      const docs = parseCsv(csv);
      expect(docs).toHaveLength(2);
      expect(docs[0].user).toEqual({ name: "Smith, Alice", age: 30 });
      expect(docs[0].active).toBe(true);
      expect(docs[0].notes).toBe("Line 1\nLine 2");
      expect(docs[1].user).toEqual({ name: "Bob", age: 25 });
      expect(docs[1].active).toBe(false);
      expect(docs[1].notes).toBeNull();
    });

    test("detects and rejects prototype pollution keys (__proto__, constructor)", () => {
      const payloadWithProto = JSON.stringify([
        { title: "Normal" },
        JSON.parse('{"__proto__": {"admin": true}, "title": "Hacked"}'),
      ]);
      expect(() => parseImportPayload(payloadWithProto, "json")).toThrow(
        /Prototype pollution/
      );

      const payloadWithConstructor = JSON.stringify([
        { title: "Normal" },
        { constructor: { name: "Evil" } },
      ]);
      expect(() => parseImportPayload(payloadWithConstructor, "json")).toThrow(
        /Prototype pollution/
      );

      const csvWithProto = "name,__proto__.isAdmin\nAlice,true\n";
      expect(() => parseCsv(csvWithProto)).toThrow(/Prototype pollution/);
    });

    test("enforces chunk document limit (max 1,000 docs)", () => {
      const oversizedArray = new Array(MAX_IMPORT_CHUNK_DOCS + 1).fill({ item: "test" });
      expect(() => parseImportPayload(JSON.stringify(oversizedArray), "json")).toThrow(
        /exceeds maximum limit of 1000 documents/
      );
    });

    test("enforces chunk payload size limit (max 4MB)", () => {
      const largeDoc = "x".repeat(MAX_IMPORT_CHUNK_SIZE_BYTES + 10);
      expect(() => parseImportPayload(largeDoc, "json")).toThrow(
        /exceeds maximum limit of 4194304 bytes/
      );
    });

    test("blocks system collections (system.*)", async () => {
      await expect(
        engine.importStart({ dbId: "db-1", collection: "system.views", format: "json" })
      ).rejects.toThrow(/Operations on system collections are forbidden/);
    });
  });

  // =========================================================================
  // 3. Chunk Replay Protection & Write Batching
  // =========================================================================
  describe("Import Engine Write & Replay Protections", () => {
    test("idempotently handles chunk replay without double insert", async () => {
      const startRes = await engine.importStart({
        dbId: "db-1",
        collection: "items",
        format: "json",
      });
      const opId = startRes.operationId;
      const payload = JSON.stringify([{ id: 1 }, { id: 2 }]);

      // First chunk invocation
      const res1 = await engine.importChunk({
        operationId: opId,
        chunkIndex: 0,
        payload,
      });
      expect(res1.insertedCount).toBe(2);
      expect(mockCollection.insertMany).toHaveBeenCalledTimes(1);

      // Replaying the exact same chunkIndex: must return cached response without insert
      const res2 = await engine.importChunk({
        operationId: opId,
        chunkIndex: 0,
        payload,
      });
      expect(res2.insertedCount).toBe(2);
      expect(mockCollection.insertMany).toHaveBeenCalledTimes(1); // Not called again!
    });

    test("handles out-of-order chunks cleanly", async () => {
      const startRes = await engine.importStart({
        dbId: "db-1",
        collection: "items",
        format: "json",
      });
      const opId = startRes.operationId;

      // Chunk 1 arrives before Chunk 0
      const chunk1 = await engine.importChunk({
        operationId: opId,
        chunkIndex: 1,
        isLastChunk: true,
        payload: JSON.stringify([{ id: 3 }, { id: 4 }]),
      });
      expect(chunk1.isComplete).toBe(true);

      // Chunk 0 arrives after
      const chunk0 = await engine.importChunk({
        operationId: opId,
        chunkIndex: 0,
        payload: JSON.stringify([{ id: 1 }, { id: 2 }]),
      });
      expect(chunk0.insertedCount).toBe(2);
      expect(mockCollection.insertMany).toHaveBeenCalledTimes(2);
    });

    test("handles duplicate key partial failures with ordered: false", async () => {
      mockCollection.insertMany.mockRejectedValueOnce({
        name: "MongoBulkWriteError",
        insertedCount: 1,
        writeErrors: [
          {
            index: 1,
            code: 11000,
            errmsg: "E11000 duplicate key error collection: test.items index: _id_ dup key: { _id: 2 }",
          },
        ],
      });

      const startRes = await engine.importStart({
        dbId: "db-1",
        collection: "items",
        format: "json",
      });

      const chunkRes = await engine.importChunk({
        operationId: startRes.operationId,
        chunkIndex: 0,
        payload: JSON.stringify([{ _id: 1 }, { _id: 2 }]),
      });

      expect(chunkRes.insertedCount).toBe(1);
      expect(chunkRes.failedCount).toBe(1);
      expect(chunkRes.errors).toHaveLength(1);
      expect(chunkRes.errors![0].code).toBe("MONGO_DUPLICATE_KEY");
    });

    test("cancels active batch writes cleanly between batches", async () => {
      const startRes = await engine.importStart({
        dbId: "db-1",
        collection: "items",
        format: "json",
      });
      const opState = opManager.getOperation(startRes.operationId)!;

      // Abort signal right before batch execution
      opState.controller.abort();

      await expect(
        engine.importChunk({
          operationId: startRes.operationId,
          chunkIndex: 0,
          payload: JSON.stringify([{ id: 1 }]),
        })
      ).rejects.toThrow(/Operation was cancelled/);
    });

    test("enforces read-only database protection on import writes", async () => {
      jest.spyOn(engine, "getDb").mockResolvedValueOnce({
        db: { id: "readonly-db", readonly: true },
        conn: { uri: "mongodb://localhost:27017/test", readonly: true },
        dbType: DBType.MONGODB,
        nativeDb: mockNativeDb,
      });

      await expect(
        engine.importStart({ dbId: "readonly-db", collection: "items", format: "json" })
      ).rejects.toThrow(/Database is in read-only mode/);
    });
  });

  // =========================================================================
  // 4. Cursor Streaming Bulk Export (Zero .toArray())
  // =========================================================================
  describe("Export Engine Cursor Streaming", () => {
    test("streams JSON array directly to file and closes cursor in all paths", async () => {
      const mockCursorDocs = [{ _id: "1", name: "Alpha" }, { _id: "2", name: "Beta" }];
      let cursorClosed = false;

      const mockCursor = {
        [Symbol.asyncIterator]: async function* () {
          for (const doc of mockCursorDocs) {
            yield doc;
          }
        },
        batchSize: jest.fn().mockReturnThis(),
        sort: jest.fn().mockReturnThis(),
        project: jest.fn().mockReturnThis(),
        limit: jest.fn().mockReturnThis(),
        close: jest.fn<any>().mockImplementation(async () => {
          cursorClosed = true;
        }),
      };
      mockCollection.find.mockReturnValue(mockCursor);

      const res = await engine.exportStart({
        dbId: "test-db",
        collection: "items",
        format: "json",
      });

      expect(res.operationId).toBeDefined();

      // Wait briefly for background stream pipeline to complete
      await new Promise((r) => setTimeout(r, 60));

      const status = await engine.getOperationStatus(res.operationId);
      expect(status.status).toBe("completed");
      expect(status.successfulDocuments).toBe(2);
      expect(cursorClosed).toBe(true);

      // Verify temp file content
      const filePath = path.join(EXPORT_DIR, `${res.operationId}.json`);
      expect(fs.existsSync(filePath)).toBe(true);
      const content = fs.readFileSync(filePath, "utf8");
      expect(content).toContain('"_id":"1"');
      expect(content).toContain('"_id":"2"');

      // Cleanup
      await engine.cleanupOperation(res.operationId);
      expect(fs.existsSync(filePath)).toBe(false);
    });

    test("streams CSV with dot-notation flattening and escaping", async () => {
      const mockCursorDocs = [
        { _id: "101", user: { name: "Alice", location: "NYC" } },
        { _id: "102", user: { name: "Bob", location: "SF, CA" } },
      ];

      const mockCursor = {
        [Symbol.asyncIterator]: async function* () {
          for (const doc of mockCursorDocs) {
            yield doc;
          }
        },
        batchSize: jest.fn().mockReturnThis(),
        close: jest.fn<any>().mockResolvedValue(undefined),
      };
      mockCollection.find.mockReturnValue(mockCursor);

      const res = await engine.exportStart({
        dbId: "test-db",
        collection: "users",
        format: "csv",
      });

      await new Promise((r) => setTimeout(r, 60));

      const filePath = path.join(EXPORT_DIR, `${res.operationId}.csv`);
      expect(fs.existsSync(filePath)).toBe(true);
      const csv = fs.readFileSync(filePath, "utf8");

      expect(csv).toContain("_id,user.location,user.name");
      expect(csv).toContain('"SF, CA"'); // Escaped comma

      await engine.cleanupOperation(res.operationId);
    });
  });

  // =========================================================================
  // 5. Supporting Bulk Mutations
  // =========================================================================
  describe("Supporting Bulk Mutations", () => {
    test("bulkInsert rejects > 5,000 documents and protects against prototype pollution", async () => {
      const oversized = new Array(MAX_BULK_INSERT_DOCS + 1).fill({ a: 1 });
      await expect(
        engine.bulkInsert({ dbId: "test-db", collection: "items", documents: oversized })
      ).rejects.toThrow(/exceeds maximum allowed of 5000/);

      const polluted = [{ normal: true }, JSON.parse('{"__proto__": {"admin": true}}')];
      await expect(
        engine.bulkInsert({ dbId: "test-db", collection: "items", documents: polluted })
      ).rejects.toThrow(/Prototype pollution/);
    });

    test("bulkUpdate enforces operator document ($) and restricts empty filter", async () => {
      // Must start with $
      await expect(
        engine.bulkUpdate({
          dbId: "test-db",
          collection: "items",
          filter: { status: "pending" },
          update: { status: "processed" }, // Missing $set!
        })
      ).rejects.toThrow(/top-level operators must begin with '\$'/);

      // Empty filter without allowUnrestricted is forbidden
      await expect(
        engine.bulkUpdate({
          dbId: "test-db",
          collection: "items",
          filter: {},
          update: { $set: { status: "processed" } },
        })
      ).rejects.toThrow(/allowUnrestricted: true/);

      // Empty filter with allowUnrestricted emits advisory warning
      const res = await engine.bulkUpdate({
        dbId: "test-db",
        collection: "items",
        filter: {},
        update: { $set: { status: "processed" } },
        options: { allowUnrestricted: true },
      });
      expect(res.advisoryWarning).toContain("Unrestricted bulk update");
    });

    test("bulkDelete restricts empty filter and emits advisory warning when deletedCount > 100", async () => {
      // Empty filter without allowUnrestricted is forbidden
      await expect(
        engine.bulkDelete({
          dbId: "test-db",
          collection: "items",
          filter: {},
        })
      ).rejects.toThrow(/allowUnrestricted: true/);

      // Large delete count warning
      mockCollection.deleteMany.mockResolvedValueOnce({ deletedCount: 150 });
      const res = await engine.bulkDelete({
        dbId: "test-db",
        collection: "items",
        filter: { obsolete: true },
      });
      expect(res.deletedCount).toBe(150);
      expect(res.advisoryWarning).toContain("Broad delete operation affected more than 100 documents");
    });
  });
});
