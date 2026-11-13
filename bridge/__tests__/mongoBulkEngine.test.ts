import { describe, expect, test, beforeEach, afterEach, jest } from "@jest/globals";
import fs from "fs";
import path from "path";
import os from "os";
import * as mongoConnector from "../src/connectors/mongo";
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
      acquireConnection: jest.fn<any>().mockResolvedValue({
        db: { id: "test-db", readonly: false },
        conn: { uri: "mongodb://localhost:27017/test" },
        dbType: DBType.MONGODB,
        release: jest.fn(),
      }),
    };

    jest.spyOn(mongoConnector, "selectDb").mockReturnValue(mockNativeDb as any);

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
      const filePath = path.join(EXPORT_DIR, `export-${res.operationId}.json`);
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

      const filePath = path.join(EXPORT_DIR, `export-${res.operationId}.csv`);
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

  // =========================================================================
  // 5. M7 Phase 4: Stage 1 Export Save-To & Staging Cleanup Tests
  // =========================================================================
  describe("M7 Phase 4: Stage 1 Export Save-To & Staging Cleanup", () => {
    let testDestDir: string;
    const createdExportFiles: string[] = [];

    beforeEach(() => {
      testDestDir = fs.mkdtempSync(path.join(os.tmpdir(), "relwave-test-dest-"));
    });

    afterEach(() => {
      jest.restoreAllMocks();
      try {
        fs.rmSync(testDestDir, { recursive: true, force: true });
      } catch {}
      for (const f of createdExportFiles) {
        try {
          if (fs.existsSync(f)) fs.unlinkSync(f);
        } catch {}
      }
      createdExportFiles.length = 0;
      opManager.clearPendingStagingCleanups();
    });

    function createCompletedExport(format = "json", content = '{"test":123}') {
      const state = opManager.createOperation("export", "test-db", "users", format as any);
      const id = state.operation.operationId;
      opManager.transition(id, "in_progress");

      if (!fs.existsSync(EXPORT_DIR)) {
        fs.mkdirSync(EXPORT_DIR, { recursive: true });
      }
      const sourceFilePath = path.join(EXPORT_DIR, `${id}.${format}`);
      fs.writeFileSync(sourceFilePath, content, "utf8");
      createdExportFiles.push(sourceFilePath);

      state.operation.tempFilePath = sourceFilePath;
      state.operation.fileSizeBytes = Buffer.byteLength(content, "utf8");
      opManager.transition(id, "completed");

      return { id, state, sourceFilePath };
    }

    // -----------------------------------------------------------------------
    // Validation & Safety Checks
    // -----------------------------------------------------------------------
    describe("Validation & Safety Checks", () => {
      test("rejects relative or whitespace destinationPath", async () => {
        const { id } = createCompletedExport();

        await expect(
          engine.exportSaveTo({ operationId: id, destinationPath: "relative/path.json" }),
        ).rejects.toThrow(/destinationPath must be a non-empty absolute path/);

        await expect(
          engine.exportSaveTo({ operationId: id, destinationPath: "   " }),
        ).rejects.toThrow(/destinationPath must be a non-empty absolute path/);
      });

      test("rejects non-existent or inaccessible parent directory", async () => {
        const { id } = createCompletedExport();
        const nonExistentDir = path.join(testDestDir, "does-not-exist", "export.json");

        await expect(
          engine.exportSaveTo({ operationId: id, destinationPath: nonExistentDir }),
        ).rejects.toThrow(/Parent directory does not exist or is not accessible/);
      });

      test("rejects non-export operations", async () => {
        const importOp = opManager.createOperation("import", "test-db", "users", "json");
        opManager.transition(importOp.operation.operationId, "in_progress");
        opManager.transition(importOp.operation.operationId, "completed");

        await expect(
          engine.exportSaveTo({
            operationId: importOp.operation.operationId,
            destinationPath: path.join(testDestDir, "out.json"),
          }),
        ).rejects.toThrow(/Cannot save: operation is not an export/);
      });

      test("rejects non-completed export operations", async () => {
        const state = opManager.createOperation("export", "test-db", "users", "json");
        await expect(
          engine.exportSaveTo({
            operationId: state.operation.operationId,
            destinationPath: path.join(testDestDir, "out.json"),
          }),
        ).rejects.toThrow(/Cannot save export file: operation status is 'pending', expected 'completed'/);
      });

      test("rejects missing export source temporary file", async () => {
        const { id, sourceFilePath } = createCompletedExport();
        fs.unlinkSync(sourceFilePath);

        await expect(
          engine.exportSaveTo({
            operationId: id,
            destinationPath: path.join(testDestDir, "out.json"),
          }),
        ).rejects.toThrow(/Export source temporary file does not exist/);
      });
    });

    // -----------------------------------------------------------------------
    // Destination Inspection & Type Discrimination
    // -----------------------------------------------------------------------
    describe("Destination Inspection & Type Discrimination", () => {
      test("proceeds when destination does not exist (ENOENT)", async () => {
        const { id } = createCompletedExport();
        const dest = path.join(testDestDir, "new-file.json");

        // Spy on link to simulate success
        jest.spyOn(fs.promises, "link").mockImplementation(async (src, target) => {
          fs.copyFileSync(src as string, target as string);
        });

        const res = await engine.exportSaveTo({ operationId: id, destinationPath: dest });
        expect(res.success).toBe(true);
        expect(res.destinationPath).toBe(path.normalize(dest));
        expect(res.bytesWritten).toBeGreaterThan(0);
        expect(res.warning).toBeUndefined();
      });

      test("rejects when destination inspection throws EACCES or EIO", async () => {
        const { id } = createCompletedExport();
        const dest = path.join(testDestDir, "forbidden.json");

        const lstatSpy = jest.spyOn(fs.promises, "lstat").mockImplementation(async (p) => {
          if (p === path.normalize(dest)) {
            const err: any = new Error("Permission denied");
            err.code = "EACCES";
            throw err;
          }
          return lstatSpy.getMockImplementation()!(p);
        });

        await expect(
          engine.exportSaveTo({ operationId: id, destinationPath: dest }),
        ).rejects.toThrow(/Failed to inspect destination path \(EACCES\)/);
      });

      test("rejects when destination is an existing directory", async () => {
        const { id } = createCompletedExport();
        const dirDest = path.join(testDestDir, "sub-dir");
        fs.mkdirSync(dirDest);

        await expect(
          engine.exportSaveTo({ operationId: id, destinationPath: dirDest }),
        ).rejects.toThrow(/Destination is an existing directory; cannot overwrite a directory with a file/);
      });

      test("rejects when destination is a special device", async () => {
        const { id } = createCompletedExport();
        const specialDest = path.join(testDestDir, "special-dev");

        jest.spyOn(fs.promises, "lstat").mockImplementation(async (p) => {
          if (p === path.normalize(specialDest)) {
            return {
              isFile: () => false,
              isDirectory: () => false,
              isFIFO: () => true,
              isSocket: () => false,
              isBlockDevice: () => false,
              isCharacterDevice: () => false,
              isSymbolicLink: () => false,
            } as any;
          }
          return fs.lstatSync(p);
        });

        await expect(
          engine.exportSaveTo({ operationId: id, destinationPath: specialDest }),
        ).rejects.toThrow(/Destination is a special device or socket/);
      });

      test("rejects existing destination when overwrite !== true", async () => {
        const { id } = createCompletedExport();
        const existingDest = path.join(testDestDir, "existing.json");
        fs.writeFileSync(existingDest, "old content", "utf8");

        await expect(
          engine.exportSaveTo({ operationId: id, destinationPath: existingDest }),
        ).rejects.toThrow(/Destination file already exists/);
      });

      test("existing destination symlink with overwrite false throws MONGO_FILE_EXISTS", async () => {
        const { id } = createCompletedExport();
        const targetFile = path.join(testDestDir, "target-false.txt");
        fs.writeFileSync(targetFile, "target data", "utf8");
        const destSymlink = path.join(testDestDir, "link-to-target-false.json");

        let realSymlinkCreated = false;
        try {
          fs.symlinkSync(targetFile, destSymlink, "file");
          realSymlinkCreated = true;
        } catch {}

        if (!realSymlinkCreated) {
          jest.spyOn(fs.promises, "lstat").mockImplementation(async (p) => {
            if (p === path.normalize(destSymlink)) {
              return {
                isFile: () => false,
                isDirectory: () => false,
                isSymbolicLink: () => true,
                isFIFO: () => false,
                isSocket: () => false,
                isBlockDevice: () => false,
                isCharacterDevice: () => false,
              } as any;
            }
            return fs.lstatSync(p);
          });
        }

        await expect(
          engine.exportSaveTo({
            operationId: id,
            destinationPath: destSymlink,
            options: { overwrite: false },
          }),
        ).rejects.toThrow(/Destination file already exists/);

        expect(fs.readFileSync(targetFile, "utf8")).toBe("target data");
      });
    });

    // -----------------------------------------------------------------------
    // Atomic Publication Commit & Decoupled Cleanup (overwrite: false)
    // -----------------------------------------------------------------------
    describe("Atomic Publication Commit & Decoupled Cleanup (overwrite: false)", () => {
      test("hard-link publication succeeds with clean staging unlink", async () => {
        const { id } = createCompletedExport("json", '{"a":1}');
        const dest = path.join(testDestDir, "linked.json");

        jest.spyOn(fs.promises, "link").mockImplementation(async (src, target) => {
          fs.copyFileSync(src as string, target as string);
        });

        const res = await engine.exportSaveTo({ operationId: id, destinationPath: dest });
        expect(res.success).toBe(true);
        expect(res.warning).toBeUndefined();
        expect(fs.existsSync(dest)).toBe(true);
        expect(opManager.getOperation(id)?.isSaving).toBe(false);
      });

      test("hard-link publication succeeds but post-publication staging unlink fails", async () => {
        const { id, sourceFilePath } = createCompletedExport("json", '{"b":2}');
        const dest = path.join(testDestDir, "linked-warn.json");

        jest.spyOn(fs.promises, "link").mockImplementation(async (src, target) => {
          fs.copyFileSync(src as string, target as string);
        });

        // Spy on unlink to fail on staging file
        const origUnlink = fs.promises.unlink;
        jest.spyOn(fs.promises, "unlink").mockImplementation(async (p) => {
          if (typeof p === "string" && p.includes(".relwave-tmp-")) {
            const err: any = new Error("Resource busy");
            err.code = "EBUSY";
            throw err;
          }
          return origUnlink(p);
        });

        const res = await engine.exportSaveTo({ operationId: id, destinationPath: dest });
        expect(res.success).toBe(true);
        expect(res.warning).toContain("queued for identity-verified retry cleanup");
        expect(fs.existsSync(dest)).toBe(true);
        expect(opManager.getOperation(id)?.isSaving).toBe(false);
        expect(fs.existsSync(sourceFilePath)).toBe(true); // source retained
        expect(opManager.getPendingStagingCleanupsCount()).toBe(1);
      });

      test("pre-publication link collision (EEXIST) throws MONGO_FILE_EXISTS and unlinks staging", async () => {
        const { id, sourceFilePath } = createCompletedExport();
        const dest = path.join(testDestDir, "collision.json");

        let stagingPathUnlinked: string | null = null;
        const origUnlink = fs.promises.unlink;
        jest.spyOn(fs.promises, "unlink").mockImplementation(async (p) => {
          if (typeof p === "string" && p.includes(".relwave-tmp-")) {
            stagingPathUnlinked = p;
          }
          return origUnlink(p);
        });

        jest.spyOn(fs.promises, "link").mockImplementation(async () => {
          const err: any = new Error("File exists");
          err.code = "EEXIST";
          throw err;
        });

        await expect(
          engine.exportSaveTo({ operationId: id, destinationPath: dest }),
        ).rejects.toThrow(/Destination file already exists/);

        expect(stagingPathUnlinked).not.toBeNull();
        expect(fs.existsSync(sourceFilePath)).toBe(true); // source preserved
        expect(opManager.getOperation(id)?.isSaving).toBe(false);
      });

      test("pre-publication link failure on confirmed unsupported filesystem (ENOSYS) throws MONGO_UNSUPPORTED_FILESYSTEM without copyFile fallback", async () => {
        const { id, sourceFilePath } = createCompletedExport();
        const dest = path.join(testDestDir, "unsupported.json");

        jest.spyOn(fs.promises, "link").mockImplementation(async () => {
          const err: any = new Error("Function not implemented");
          err.code = "ENOSYS";
          throw err;
        });

        const copyFileSpy = jest.spyOn(fs.promises, "copyFile");

        await expect(
          engine.exportSaveTo({ operationId: id, destinationPath: dest }),
        ).rejects.toThrow(/The destination filesystem does not support atomic hard-link publication/);

        expect(copyFileSpy).not.toHaveBeenCalled();
        expect(fs.existsSync(dest)).toBe(false);
        expect(fs.existsSync(sourceFilePath)).toBe(true);
        expect(opManager.getOperation(id)?.isSaving).toBe(false);
      });

      test("pre-publication link failure with EPERM or EACCES throws MONGO_SAVE_FAILED without claiming unsupported filesystem", async () => {
        const { id } = createCompletedExport();
        const dest = path.join(testDestDir, "perm-denied.json");

        jest.spyOn(fs.promises, "link").mockImplementation(async () => {
          const err: any = new Error("Operation not permitted");
          err.code = "EPERM";
          throw err;
        });

        await expect(
          engine.exportSaveTo({ operationId: id, destinationPath: dest }),
        ).rejects.toThrow(/Permission denied or operation not permitted during hard-link publication \(EPERM\)/);
      });

      test("pre-publication link failure with EXDEV throws MONGO_SAVE_FAILED without claiming unsupported filesystem", async () => {
        const { id } = createCompletedExport();
        const dest = path.join(testDestDir, "cross-dev.json");

        jest.spyOn(fs.promises, "link").mockImplementation(async () => {
          const err: any = new Error("Cross-device link");
          err.code = "EXDEV";
          throw err;
        });

        await expect(
          engine.exportSaveTo({ operationId: id, destinationPath: dest }),
        ).rejects.toThrow(/Cross-device link error \(EXDEV\)/);
      });

      test("pre-publication link failure where staging cleanup fails preserves original link error and records identity", async () => {
        const { id } = createCompletedExport();
        const dest = path.join(testDestDir, "double-fail.json");

        jest.spyOn(fs.promises, "link").mockImplementation(async () => {
          const err: any = new Error("File exists");
          err.code = "EEXIST";
          throw err;
        });

        jest.spyOn(fs.promises, "unlink").mockImplementation(async () => {
          const err: any = new Error("Access denied on unlink");
          err.code = "EACCES";
          throw err;
        });

        await expect(
          engine.exportSaveTo({ operationId: id, destinationPath: dest }),
        ).rejects.toThrow(/Destination file already exists/);

        expect(opManager.getPendingStagingCleanupsCount()).toBe(1);
        expect(opManager.getOperation(id)?.isSaving).toBe(false);
      });
    });

    // -----------------------------------------------------------------------
    // Atomic Replacement (overwrite: true)
    // -----------------------------------------------------------------------
    describe("Atomic Replacement (overwrite: true)", () => {
      test("atomic rename replaces destination directly and skips staging unlink", async () => {
        const { id } = createCompletedExport("json", '{"version":2}');
        const dest = path.join(testDestDir, "overwrite-target.json");
        fs.writeFileSync(dest, '{"version":1}', "utf8");

        const unlinkSpy = jest.spyOn(fs.promises, "unlink");

        const res = await engine.exportSaveTo({
          operationId: id,
          destinationPath: dest,
          options: { overwrite: true },
        });

        expect(res.success).toBe(true);
        expect(res.warning).toBeUndefined();
        expect(fs.readFileSync(dest, "utf8")).toBe('{"version":2}');
        // unlink should NOT be called for staging file because rename already consumed it
        for (const call of unlinkSpy.mock.calls) {
          expect(String(call[0])).not.toContain(".relwave-tmp-");
        }
      });

      test("post-commit audit failure surfaces advisory warning without failing operation", async () => {
        const { id } = createCompletedExport();
        const dest = path.join(testDestDir, "post-audit-warn.json");

        // Make rename succeed, but post-commit lstat on dest return non-file
        const realLstat = fs.promises.lstat;
        let renameCommitted = false;
        jest.spyOn(fs.promises, "rename").mockImplementation(async (src, target) => {
          fs.copyFileSync(src as string, target as string);
          fs.unlinkSync(src as string);
          renameCommitted = true;
        });

        jest.spyOn(fs.promises, "lstat").mockImplementation(async (p) => {
          if (renameCommitted && p === path.normalize(dest)) {
            return {
              isFile: () => false,
              isDirectory: () => true,
              isSymbolicLink: () => false,
            } as any;
          }
          return realLstat(p);
        });

        const res = await engine.exportSaveTo({
          operationId: id,
          destinationPath: dest,
          options: { overwrite: true },
        });

        expect(res.success).toBe(true);
        expect(res.warning).toContain("post-commit audit detected unexpected file attributes");
      });

      test("pre-publication rename failure throws MONGO_SAVE_FAILED and unlinks staging", async () => {
        const { id } = createCompletedExport();
        const dest = path.join(testDestDir, "rename-fail.json");

        let stagingUnlinked = false;
        const origUnlink = fs.promises.unlink;
        jest.spyOn(fs.promises, "unlink").mockImplementation(async (p) => {
          if (typeof p === "string" && p.includes(".relwave-tmp-")) {
            stagingUnlinked = true;
          }
          return origUnlink(p);
        });

        jest.spyOn(fs.promises, "rename").mockImplementation(async () => {
          const err: any = new Error("Device locked");
          err.code = "EBUSY";
          throw err;
        });

        await expect(
          engine.exportSaveTo({
            operationId: id,
            destinationPath: dest,
            options: { overwrite: true },
          }),
        ).rejects.toThrow(/Failed to atomically replace destination file \(EBUSY\)/);

        expect(stagingUnlinked).toBe(true);
        expect(opManager.getOperation(id)?.isSaving).toBe(false);
      });

      test("existing destination symlink with overwrite true: rename replaces the symlink entry itself, while external target remains unchanged", async () => {
        const { id } = createCompletedExport("json", '{"newData":true}');
        const targetFile = path.join(testDestDir, "target-true.txt");
        fs.writeFileSync(targetFile, "original target content", "utf8");
        const destSymlink = path.join(testDestDir, "dest-symlink-true.json");

        let realSymlinkCreated = false;
        try {
          fs.symlinkSync(targetFile, destSymlink, "file");
          realSymlinkCreated = true;
        } catch {}

        if (realSymlinkCreated) {
          const res = await engine.exportSaveTo({
            operationId: id,
            destinationPath: destSymlink,
            options: { overwrite: true },
          });
          expect(res.success).toBe(true);
          expect(fs.lstatSync(destSymlink).isSymbolicLink()).toBe(false);
          expect(fs.readFileSync(destSymlink, "utf8")).toBe('{"newData":true}');
          expect(fs.readFileSync(targetFile, "utf8")).toBe("original target content");
        } else {
          let renameTargetPassed: string | null = null;
          jest.spyOn(fs.promises, "lstat").mockImplementation(async (p) => {
            if (p === path.normalize(destSymlink)) {
              return {
                isFile: () => false,
                isDirectory: () => false,
                isSymbolicLink: () => true,
                isFIFO: () => false,
                isSocket: () => false,
                isBlockDevice: () => false,
                isCharacterDevice: () => false,
              } as any;
            }
            return fs.lstatSync(p);
          });
          jest.spyOn(fs.promises, "rename").mockImplementation(async (src, target) => {
            renameTargetPassed = target as string;
            fs.copyFileSync(src as string, target as string);
            fs.unlinkSync(src as string);
          });

          const res = await engine.exportSaveTo({
            operationId: id,
            destinationPath: destSymlink,
            options: { overwrite: true },
          });
          expect(res.success).toBe(true);
          expect(renameTargetPassed).toBe(path.normalize(destSymlink));
          expect(fs.readFileSync(targetFile, "utf8")).toBe("original target content");
        }
      });

      test("directory appearing between destination inspection and rename throws MONGO_SAVE_FAILED", async () => {
        const { id, sourceFilePath } = createCompletedExport();
        const dest = path.join(testDestDir, "race-dir-dest.json");

        jest.spyOn(fs.promises, "rename").mockImplementation(async () => {
          const err: any = new Error("Is a directory");
          err.code = "EISDIR";
          throw err;
        });

        let stagingUnlinked = false;
        const origUnlink = fs.promises.unlink;
        jest.spyOn(fs.promises, "unlink").mockImplementation(async (p) => {
          if (typeof p === "string" && p.includes(".relwave-tmp-")) {
            stagingUnlinked = true;
          }
          return origUnlink(p);
        });

        await expect(
          engine.exportSaveTo({
            operationId: id,
            destinationPath: dest,
            options: { overwrite: true },
          }),
        ).rejects.toThrow(/Failed to atomically replace destination file \(EISDIR\)/);

        expect(stagingUnlinked).toBe(true);
        expect(fs.existsSync(sourceFilePath)).toBe(true);
        expect(opManager.getOperation(id)?.isSaving).toBe(false);
      });

      test("post-commit audit lstat throwing an error returns success with an advisory warning", async () => {
        const { id } = createCompletedExport();
        const dest = path.join(testDestDir, "audit-throw.json");

        let renameCommitted = false;
        jest.spyOn(fs.promises, "rename").mockImplementation(async (src, target) => {
          fs.copyFileSync(src as string, target as string);
          fs.unlinkSync(src as string);
          renameCommitted = true;
        });

        const realLstat = fs.promises.lstat;
        jest.spyOn(fs.promises, "lstat").mockImplementation(async (p) => {
          if (renameCommitted && p === path.normalize(dest)) {
            const err: any = new Error("Resource temporarily locked");
            err.code = "EBUSY";
            throw err;
          }
          return realLstat(p);
        });

        const res = await engine.exportSaveTo({
          operationId: id,
          destinationPath: dest,
          options: { overwrite: true },
        });

        expect(res.success).toBe(true);
        expect(res.warning).toContain("post-commit verification failed (EBUSY)");
        expect(fs.existsSync(dest)).toBe(true);
        expect(opManager.getOperation(id)?.isSaving).toBe(false);
      });
    });

    // -----------------------------------------------------------------------
    // Streaming Lifecycle & Staging Failure Handling
    // -----------------------------------------------------------------------
    describe("Streaming Lifecycle & Staging Failure Handling", () => {
      test("stream failure followed by successful staging unlink", async () => {
        const { id, sourceFilePath } = createCompletedExport();
        const dest = path.join(testDestDir, "stream-fail-unlink-ok.json");

        let stagingUnlinked = false;
        const origUnlink = fs.promises.unlink;
        jest.spyOn(fs.promises, "unlink").mockImplementation(async (p) => {
          if (typeof p === "string" && p.includes(".relwave-tmp-")) {
            stagingUnlinked = true;
          }
          return origUnlink(p);
        });

        jest.spyOn(fs, "createReadStream").mockImplementationOnce(() => {
          throw new Error("Disk I/O error during read");
        });

        await expect(
          engine.exportSaveTo({ operationId: id, destinationPath: dest }),
        ).rejects.toThrow(/Failed to stream export data to staging file: Disk I\/O error during read/);

        expect(stagingUnlinked).toBe(true);
        expect(fs.existsSync(sourceFilePath)).toBe(true); // Source file preserved
        expect(fs.existsSync(dest)).toBe(false); // Destination never published
        expect(opManager.getPendingStagingCleanupsCount()).toBe(0);
        expect(opManager.getOperation(id)?.isSaving).toBe(false);
      });

      test("stream failure followed by staging unlink failure and successful queue registration", async () => {
        const { id, sourceFilePath } = createCompletedExport();
        const dest = path.join(testDestDir, "stream-fail-unlink-fail.json");

        jest.spyOn(fs, "createReadStream").mockImplementationOnce(() => {
          throw new Error("Read stream broken pipe");
        });

        const origUnlink = fs.promises.unlink;
        jest.spyOn(fs.promises, "unlink").mockImplementation(async (p) => {
          if (typeof p === "string" && p.includes(".relwave-tmp-")) {
            const err: any = new Error("File locked by process");
            err.code = "EBUSY";
            throw err;
          }
          return origUnlink(p);
        });

        await expect(
          engine.exportSaveTo({ operationId: id, destinationPath: dest }),
        ).rejects.toThrow(/Failed to stream export data to staging file: Read stream broken pipe/);

        expect(opManager.getPendingStagingCleanupsCount()).toBe(1);
        expect(fs.existsSync(sourceFilePath)).toBe(true);
        expect(fs.existsSync(dest)).toBe(false);
        expect(opManager.getOperation(id)?.isSaving).toBe(false);
      });

      test("stream failure where identity capture also fails", async () => {
        const { id, sourceFilePath } = createCompletedExport();
        const dest = path.join(testDestDir, "stream-id-capture-fail.json");

        jest.spyOn(fs, "createReadStream").mockImplementationOnce(() => {
          throw new Error("Stream abort error");
        });

        const origUnlink = fs.promises.unlink;
        jest.spyOn(fs.promises, "unlink").mockImplementation(async (p) => {
          if (typeof p === "string" && p.includes(".relwave-tmp-")) {
            const err: any = new Error("Unlink failed");
            err.code = "EACCES";
            throw err;
          }
          return origUnlink(p);
        });

        const origLstat = fs.promises.lstat;
        jest.spyOn(fs.promises, "lstat").mockImplementation(async (p) => {
          if (typeof p === "string" && p.includes(".relwave-tmp-")) {
            const err: any = new Error("Cannot lstat staging file");
            err.code = "EPERM";
            throw err;
          }
          return origLstat(p);
        });

        await expect(
          engine.exportSaveTo({ operationId: id, destinationPath: dest }),
        ).rejects.toThrow(/Failed to stream export data to staging file: Stream abort error/);

        // Identity capture failed -> registered with fail-closed identity (dev: 0, ino: 0)
        expect(opManager.getPendingStagingCleanupsCount()).toBe(1);
        const entries = Array.from((opManager as any).pendingStagingCleanups.values()) as any[];
        expect(entries[0].dev).toBe(0);
        expect(entries[0].ino).toBe(0);

        expect(fs.existsSync(sourceFilePath)).toBe(true);
        expect(fs.existsSync(dest)).toBe(false);
        expect(opManager.getOperation(id)?.isSaving).toBe(false);
      });

      test("stream failure where cleanup queue capacity is exhausted", async () => {
        const { id, sourceFilePath } = createCompletedExport();
        const dest = path.join(testDestDir, "stream-queue-full.json");

        // Fill queue to capacity (100)
        for (let i = 0; i < 100; i++) {
          opManager.recordPendingStagingCleanup(`/tmp/stream-full-${i}.tmp`);
        }
        expect(opManager.getPendingStagingCleanupsCount()).toBe(100);

        jest.spyOn(fs, "createReadStream").mockImplementationOnce(() => {
          throw new Error("Premature stream EOF");
        });

        const origUnlink = fs.promises.unlink;
        jest.spyOn(fs.promises, "unlink").mockImplementation(async (p) => {
          if (typeof p === "string" && p.includes(".relwave-tmp-")) {
            const err: any = new Error("Unlink failed");
            err.code = "EBUSY";
            throw err;
          }
          return origUnlink(p);
        });

        await expect(
          engine.exportSaveTo({ operationId: id, destinationPath: dest }),
        ).rejects.toThrow(/Failed to stream export data to staging file: Premature stream EOF/);

        // Queue refused 101st entry and retained capacity 100
        expect(opManager.getPendingStagingCleanupsCount()).toBe(100);
        expect(fs.existsSync(sourceFilePath)).toBe(true);
        expect(fs.existsSync(dest)).toBe(false);
        expect(opManager.getOperation(id)?.isSaving).toBe(false);
      });

      test("every stream failure preserves the original error classification and releases the lock", async () => {
        const { id, state, sourceFilePath } = createCompletedExport();
        const dest = path.join(testDestDir, "stream-preserve-err.json");

        jest.spyOn(fs, "createReadStream").mockImplementationOnce(() => {
          throw new Error("Specific custom streaming corruption error");
        });

        let caughtErr: any;
        try {
          await engine.exportSaveTo({ operationId: id, destinationPath: dest });
        } catch (e) {
          caughtErr = e;
        }

        expect(caughtErr).toBeDefined();
        expect(caughtErr.code).toBe("MONGO_SAVE_FAILED");
        expect(caughtErr.message).toContain("Specific custom streaming corruption error");
        expect(state.isSaving).toBe(false);
        expect(fs.existsSync(sourceFilePath)).toBe(true);
      });
    });

    // -----------------------------------------------------------------------
    // Universal Mutex & Lock Release Across All Paths
    // -----------------------------------------------------------------------
    describe("Universal Mutex & Lock Release Across All Paths", () => {
      test("rejects concurrent save while save is active", async () => {
        const { id, state } = createCompletedExport();
        state.isSaving = true;

        await expect(
          engine.exportSaveTo({
            operationId: id,
            destinationPath: path.join(testDestDir, "concurrent.json"),
          }),
        ).rejects.toThrow(/Another save operation is already in progress/);

        state.isSaving = false;
      });

      test("active save blocks cancelOperation and cleanupOperation", () => {
        const { id, state } = createCompletedExport();
        state.isSaving = true;

        expect(() => opManager.cancel(id)).toThrow(
          /Cannot cancel an export operation that is currently saving/,
        );

        expect(() => opManager.cleanup(id)).toThrow(
          /Cannot clean up an export operation that is currently saving/,
        );

        state.isSaving = false;
      });

      test("lock is released in finally across multiple failure paths", async () => {
        const { id, state } = createCompletedExport();

        // 1. Validation failure
        await expect(
          engine.exportSaveTo({ operationId: id, destinationPath: "relative.json" }),
        ).rejects.toThrow();
        expect(state.isSaving ?? false).toBe(false);

        // 2. Inspection failure
        const badDest = path.join(testDestDir, "bad-dir");
        fs.mkdirSync(badDest);
        await expect(
          engine.exportSaveTo({ operationId: id, destinationPath: badDest }),
        ).rejects.toThrow();
        expect(state.isSaving).toBe(false);

        // 3. Link collision
        jest.spyOn(fs.promises, "link").mockRejectedValueOnce({ code: "EEXIST" });
        await expect(
          engine.exportSaveTo({
            operationId: id,
            destinationPath: path.join(testDestDir, "link-fail.json"),
          }),
        ).rejects.toThrow();
        expect(state.isSaving).toBe(false);

        // 4. Stream error
        jest.spyOn(fs, "createReadStream").mockImplementationOnce(() => {
          throw new Error("Stream read error");
        });
        await expect(
          engine.exportSaveTo({
            operationId: id,
            destinationPath: path.join(testDestDir, "stream-fail.json"),
          }),
        ).rejects.toThrow();
        expect(state.isSaving).toBe(false);
      });
    });

    // -----------------------------------------------------------------------
    // Bounded Staging Cleanup Queue & Capacity Overflow
    // -----------------------------------------------------------------------
    describe("Bounded Staging Cleanup Queue & Capacity Overflow", () => {
      test("records identity up to 100 entries and refuses beyond capacity", () => {
        for (let i = 0; i < 100; i++) {
          const tracked = opManager.recordPendingStagingCleanup(`/tmp/staging-${i}.tmp`);
          expect(tracked).toBe(true);
        }
        expect(opManager.getPendingStagingCleanupsCount()).toBe(100);

        // 101st entry must be refused and return false
        const overflowResult = opManager.recordPendingStagingCleanup("/tmp/staging-overflow.tmp");
        expect(overflowResult).toBe(false);
        expect(opManager.getPendingStagingCleanupsCount()).toBe(100);
      });

      test("duplicate path registration is an idempotent no-op preserving authoritative identity", () => {
        const initialIdentity = {
          exactPath: "/tmp/staging-dup.tmp",
          dev: 111,
          ino: 222,
          size: 500,
          birthtimeMs: 12345,
          registeredAt: 1000,
          retryCount: 0,
        };

        const res1 = opManager.recordPendingStagingCleanup("/tmp/staging-dup.tmp", initialIdentity);
        expect(res1).toBe(true);
        expect(opManager.getPendingStagingCleanupsCount()).toBe(1);

        // Re-register with different metadata
        const modifiedIdentity = {
          exactPath: "/tmp/staging-dup.tmp",
          dev: 999,
          ino: 888,
          size: 1000,
          birthtimeMs: 54321,
          registeredAt: 2000,
          retryCount: 1,
        };
        const res2 = opManager.recordPendingStagingCleanup("/tmp/staging-dup.tmp", modifiedIdentity);
        expect(res2).toBe(true);
        expect(opManager.getPendingStagingCleanupsCount()).toBe(1);

        // Original identity metadata MUST be preserved!
        const recorded = opManager.getPendingStagingCleanup("/tmp/staging-dup.tmp");
        expect(recorded?.dev).toBe(111);
        expect(recorded?.ino).toBe(222);
        expect(recorded?.size).toBe(500);
      });

      test("post-publication save surfaces distinct overflow warning when queue is at capacity", async () => {
        // Fill queue to 100
        for (let i = 0; i < 100; i++) {
          opManager.recordPendingStagingCleanup(`/tmp/full-${i}.tmp`);
        }
        expect(opManager.getPendingStagingCleanupsCount()).toBe(100);

        const { id } = createCompletedExport();
        const dest = path.join(testDestDir, "overflow-save.json");

        jest.spyOn(fs.promises, "link").mockImplementation(async (src, target) => {
          fs.copyFileSync(src as string, target as string);
        });

        // Fail staging unlink
        const origUnlink = fs.promises.unlink;
        jest.spyOn(fs.promises, "unlink").mockImplementation(async (p) => {
          if (typeof p === "string" && p.includes(".relwave-tmp-")) {
            const err: any = new Error("Busy");
            err.code = "EBUSY";
            throw err;
          }
          return origUnlink(p);
        });

        const res = await engine.exportSaveTo({ operationId: id, destinationPath: dest });
        expect(res.success).toBe(true); // Publication committed!
        expect(res.warning).toContain("cleanup queue is at capacity (100)");
        expect(res.warning).toContain("untracked orphan");
      });
    });

    // -----------------------------------------------------------------------
    // Pre-Retry Identity Verification Loop (sweepExpired)
    // -----------------------------------------------------------------------
    describe("Pre-Retry Identity Verification Loop (sweepExpired)", () => {
      test("safely unlinks and evicts file when identity matches", async () => {
        const stagingFile = path.join(testDestDir, "staging-match.tmp");
        fs.writeFileSync(stagingFile, "staging data", "utf8");
        const st = fs.lstatSync(stagingFile);

        opManager.recordPendingStagingCleanup(stagingFile, {
          exactPath: stagingFile,
          dev: st.dev,
          ino: st.ino,
          size: st.size,
          registeredAt: Date.now(),
          retryCount: 0,
        });

        await opManager.sweepExpired();
        expect(fs.existsSync(stagingFile)).toBe(false);
        expect(opManager.getPendingStagingCleanupsCount()).toBe(0);
      });

      test("safely evicts absent file (ENOENT)", async () => {
        const nonExistent = path.join(testDestDir, "absent.tmp");
        opManager.recordPendingStagingCleanup(nonExistent, {
          exactPath: nonExistent,
          dev: 123,
          ino: 456,
          size: 100,
          registeredAt: Date.now(),
          retryCount: 0,
        });

        await opManager.sweepExpired();
        expect(opManager.getPendingStagingCleanupsCount()).toBe(0);
      });

      test("aborts unlinking, preserves file on disk, and evicts from tracking on identity mismatch", async () => {
        const stagingFile = path.join(testDestDir, "staging-mismatch.tmp");
        fs.writeFileSync(stagingFile, "real file", "utf8");
        const st = fs.lstatSync(stagingFile);

        opManager.recordPendingStagingCleanup(stagingFile, {
          exactPath: stagingFile,
          dev: st.dev,
          ino: st.ino + 9999, // mismatched inode!
          size: st.size,
          registeredAt: Date.now(),
          retryCount: 0,
        });

        await opManager.sweepExpired();
        // File on disk MUST be untouched!
        expect(fs.existsSync(stagingFile)).toBe(true);
        expect(fs.readFileSync(stagingFile, "utf8")).toBe("real file");
        // Evicted from automated tracking!
        expect(opManager.getPendingStagingCleanupsCount()).toBe(0);
      });

      test("aborts unlinking, preserves symlink on disk, and evicts from tracking on symlink detection", async () => {
        const stagingFile = path.join(testDestDir, "staging-symlink.tmp");
        const realTarget = path.join(testDestDir, "target.txt");
        fs.writeFileSync(realTarget, "target content", "utf8");

        // Mock lstat to report symlink
        jest.spyOn(fs.promises, "lstat").mockImplementation(async (p) => {
          if (p === stagingFile) {
            return {
              isFile: () => false,
              isSymbolicLink: () => true,
              isDirectory: () => false,
              dev: 100,
              ino: 200,
            } as any;
          }
          return fs.lstatSync(p);
        });

        opManager.recordPendingStagingCleanup(stagingFile, {
          exactPath: stagingFile,
          dev: 100,
          ino: 200,
          size: 10,
          registeredAt: Date.now(),
          retryCount: 0,
        });

        await opManager.sweepExpired();
        expect(opManager.getPendingStagingCleanupsCount()).toBe(0);
      });

      test("fails closed when identity is unpopulated (dev: 0, ino: 0)", async () => {
        const stagingFile = path.join(testDestDir, "staging-zero-id.tmp");
        fs.writeFileSync(stagingFile, "content", "utf8");

        opManager.recordPendingStagingCleanup(stagingFile, {
          exactPath: stagingFile,
          dev: 0,
          ino: 0,
          size: 7,
          registeredAt: Date.now(),
          retryCount: 0,
        });

        await opManager.sweepExpired();
        expect(fs.existsSync(stagingFile)).toBe(true); // Untouched on disk
        expect(opManager.getPendingStagingCleanupsCount()).toBe(0); // Evicted from queue
      });

      test("evicts after 5 failed retry attempts", async () => {
        const stagingFile = path.join(testDestDir, "staging-locked.tmp");
        fs.writeFileSync(stagingFile, "locked", "utf8");
        const st = fs.lstatSync(stagingFile);

        opManager.recordPendingStagingCleanup(stagingFile, {
          exactPath: stagingFile,
          dev: st.dev,
          ino: st.ino,
          size: st.size,
          registeredAt: Date.now(),
          retryCount: 4, // 5th retry attempt
        });

        jest.spyOn(fs.promises, "unlink").mockRejectedValue(new Error("Still locked"));

        await opManager.sweepExpired();
        // After 5 retries, abandoned as untracked orphan
        expect(opManager.getPendingStagingCleanupsCount()).toBe(0);
        expect(fs.existsSync(stagingFile)).toBe(true);
      });
    });

    // -----------------------------------------------------------------------
    // Export Source Lifecycle & Sweep Coordination
    // -----------------------------------------------------------------------
    describe("Export Source Lifecycle & Sweep Coordination", () => {
      test("sweepExpired skips unlinking while isSaving === true", async () => {
        const { id, state, sourceFilePath } = createCompletedExport();
        state.isSaving = true;

        // Force expiration
        state.operation.expiresAt = new Date(Date.now() - 1000).toISOString();

        await opManager.sweepExpired();
        expect(fs.existsSync(sourceFilePath)).toBe(true);
        expect(opManager.getOperation(id)).not.toBeNull();

        state.isSaving = false;
      });

      test("save completing after TTL expiry commits publication and triggers deferred source eviction", async () => {
        const { id, state, sourceFilePath } = createCompletedExport("json", '{"expired":true}');
        const dest = path.join(testDestDir, "expired-save.json");

        // Expire during save while isSaving === true
        jest.spyOn(fs.promises, "rename").mockImplementation(async (src, target) => {
          state.operation.expiresAt = new Date(Date.now() - 1000).toISOString();
          fs.copyFileSync(src as string, target as string);
          fs.unlinkSync(src as string);
        });

        const res = await engine.exportSaveTo({
          operationId: id,
          destinationPath: dest,
          options: { overwrite: true },
        });

        expect(res.success).toBe(true);
        expect(fs.existsSync(dest)).toBe(true);
        // Deferred cleanup unlinks source file
        expect(fs.existsSync(sourceFilePath)).toBe(false);
        // Operation evicted
        expect(opManager.getOperation(id)).toBeNull();
      });

      test("cleanupOperation called after TTL eviction returns alreadyCleaned: true idempotently", async () => {
        const randomId = "11111111-2222-4333-8444-555555555555";
        const res = await engine.cleanupOperation(randomId);
        expect(res.success).toBe(true);
        expect(res.alreadyCleaned).toBe(true);
      });

      test("dispose() during an active save does not prematurely unlink the source", () => {
        const { id, state, sourceFilePath } = createCompletedExport();
        state.isSaving = true;

        opManager.dispose();

        // Source file MUST NOT be unlinked!
        expect(fs.existsSync(sourceFilePath)).toBe(true);
        // Active save protection is preserved, not forcibly reset
        expect(state.isSaving).toBe(true);

        state.isSaving = false;
      });
    });
  });
});
