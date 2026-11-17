/**
 * MongoDB Milestone 7 Phase 4 Stage 6 — Bulk Mutations Hook & Validation Tests
 *
 * Exercises the 14 test cases defined in implementation_plan.md §9.1:
 * 1. Top-Level Empty Filter Distinction
 * 2. Update Operator Validation
 * 3. RPC Argument Integrity (Update)
 * 4. RPC Argument Integrity (Delete)
 * 5. Partial Bulk Insert Outcome
 * 6. Defensive Error Sanitization
 * 7. Defensive Response Handling
 * 8. Bulk Insert Count Boundary Enforcement
 * 9. Bulk Insert Size Boundary Enforcement
 * 10. Prototype Pollution Rejection on Insert
 * 11. Bridge Advisory Warning Capture
 * 12. Bridge Error Handling
 * 13. Poller Exclusion Invariant
 * 14. Database Isolation & Duplicate Prevention
 */

import { describe, it, beforeEach } from "node:test";
import assert from "node:assert/strict";
import {
  parseAndValidateFilter,
  isTopLevelEmptyFilter,
  parseAndValidateUpdate,
  sanitizeErrorMessage,
  sanitizeMutationErrors,
} from "../utils/mongoSemanticEmpty";
import {
  useMongoBulkMutations,
  type BulkMutationsServiceContract,
} from "../hooks/useMongoBulkMutations";
import { createMongoBulkOperationsStore } from "../hooks/useMongoBulkOperationsStore";
import type { TrackedSyncBulkMutation } from "../types/bulk";

describe("useMongoBulkMutations and mongoSemanticEmpty Tests", () => {
  let mockStore: ReturnType<typeof createMongoBulkOperationsStore>;

  beforeEach(() => {
    mockStore = createMongoBulkOperationsStore();
  });

  // 1. Top-Level Empty Filter Distinction
  it("1. distinguishes top-level empty filter from nested empty objects and whitespace values", () => {
    // Top-level empty
    const resEmpty = parseAndValidateFilter("{}");
    assert.equal(resEmpty.valid, true);
    assert.equal(resEmpty.isUnrestricted, true);
    assert.equal(isTopLevelEmptyFilter(resEmpty.filter), true);

    // Nested empty object: restricted
    const resNested = parseAndValidateFilter('{"profile": {}}');
    assert.equal(resNested.valid, true);
    assert.equal(resNested.isUnrestricted, false);
    assert.equal(isTopLevelEmptyFilter(resNested.filter), false);

    // Whitespace string value: restricted
    const resWhitespace = parseAndValidateFilter('{"name": "   "}');
    assert.equal(resWhitespace.valid, true);
    assert.equal(resWhitespace.isUnrestricted, false);

    // Empty or whitespace-only inputs: validation error
    const resBlank = parseAndValidateFilter("");
    assert.equal(resBlank.valid, false);
    assert.ok(resBlank.error?.includes("required"));

    const resSpaces = parseAndValidateFilter("   ");
    assert.equal(resSpaces.valid, false);
    assert.ok(resSpaces.error?.includes("required"));

    // Malformed JSON: syntax error
    const resMalformed = parseAndValidateFilter("{ invalid");
    assert.equal(resMalformed.valid, false);
    assert.ok(resMalformed.error?.includes("Invalid JSON syntax"));

    // Non-object JSON: validation error
    const resArray = parseAndValidateFilter("[1, 2]");
    assert.equal(resArray.valid, false);
    assert.ok(resArray.error?.includes("valid JSON object"));
  });

  // 2. Update Operator Validation
  it("2. validates update operators and rejects non-operator keys, empty objects, and prototype pollution", () => {
    // Valid update operators
    const resValid = parseAndValidateUpdate(
      '{"$set": {"status": "active"}, "$inc": {"score": 1}, "$unset": {"temp": ""}}',
    );
    assert.equal(resValid.valid, true);
    assert.deepEqual(Object.keys(resValid.update!), ["$set", "$inc", "$unset"]);

    // Empty update document: rejected
    const resEmpty = parseAndValidateUpdate("{}");
    assert.equal(resEmpty.valid, false);
    assert.ok(resEmpty.error?.includes("No update operators provided"));

    // Non-operator direct replacement: rejected
    const resReplacement = parseAndValidateUpdate('{"name": "Bob", "age": 30}');
    assert.equal(resReplacement.valid, false);
    assert.ok(resReplacement.error?.includes("not an update operator"));

    // Prototype pollution in update: rejected
    const resProto = parseAndValidateUpdate('{"$set": {"__proto__": {"admin": true}}}');
    assert.equal(resProto.valid, false);
    assert.ok(resProto.error?.includes("Security violation"));
  });

  // 3. RPC Argument Integrity (Update)
  it("3. verifies update RPC argument forwarding and conditional allowUnrestricted dispatch", async () => {
    let capturedReq: any;
    const mockService: BulkMutationsServiceContract = {
      bulkStore: mockStore,
      bulkUpdateMongoDocuments: async (req) => {
        capturedReq = req;
        return {
          collection: req.collection,
          matchedCount: 5,
          modifiedCount: 5,
        };
      },
    };

    const hook = useMongoBulkMutations("db-update", mockService);

    // Call 1: Restricted filter
    await hook.executeBulkUpdate({
      collection: "users",
      filter: { active: false },
      update: { $set: { active: true } },
    });
    assert.equal(capturedReq.dbId, "db-update");
    assert.equal(capturedReq.collection, "users");
    assert.deepEqual(capturedReq.filter, { active: false });
    assert.equal(capturedReq.options?.allowUnrestricted, undefined);

    // Call 2: Unrestricted filter with confirmed option
    await hook.executeBulkUpdate({
      collection: "users",
      filter: {},
      update: { $set: { version: 2 } },
      options: { allowUnrestricted: true },
    });
    assert.equal(capturedReq.options?.allowUnrestricted, true);
  });

  // 4. RPC Argument Integrity (Delete)
  it("4. verifies delete RPC argument forwarding and conditional allowUnrestricted dispatch", async () => {
    let capturedReq: any;
    const mockService: BulkMutationsServiceContract = {
      bulkStore: mockStore,
      bulkDeleteMongoDocuments: async (req) => {
        capturedReq = req;
        return {
          collection: req.collection,
          deletedCount: 12,
        };
      },
    };

    const hook = useMongoBulkMutations("db-delete", mockService);

    // Restricted delete
    await hook.executeBulkDelete({
      collection: "logs",
      filter: { level: "debug" },
    });
    assert.equal(capturedReq.collection, "logs");
    assert.deepEqual(capturedReq.filter, { level: "debug" });
    assert.equal(capturedReq.options?.allowUnrestricted, undefined);

    // Unrestricted delete
    await hook.executeBulkDelete({
      collection: "logs",
      filter: {},
      options: { allowUnrestricted: true },
    });
    assert.equal(capturedReq.options?.allowUnrestricted, true);
  });

  // 5. Partial Bulk Insert Outcome
  it("5. classifies bulk insert outcomes accurately into completed, partial_success, and failed", async () => {
    let returnOutcome: any;
    const mockService: BulkMutationsServiceContract = {
      bulkStore: mockStore,
      bulkInsertMongoDocuments: async () => returnOutcome,
    };

    const hook = useMongoBulkMutations("db-insert", mockService);

    // Outcome A: 100% completed
    returnOutcome = { collection: "items", insertedCount: 2, failedCount: 0 };
    const resA = await hook.executeBulkInsert({
      collection: "items",
      documents: [{ a: 1 }, { a: 2 }],
    });
    assert.equal(resA?.status, "completed");

    // Outcome B: Partial success (1 inserted, 1 failed)
    returnOutcome = {
      collection: "items",
      insertedCount: 1,
      failedCount: 1,
      errors: [{ index: 1, code: "MONGO_DUPLICATE_KEY", message: "E11000 duplicate key error" }],
    };
    const resB = await hook.executeBulkInsert({
      collection: "items",
      documents: [{ a: 1 }, { a: 2 }],
    });
    assert.equal(resB?.status, "partial_success");

    // Outcome C: 100% failed (0 inserted, 2 failed)
    returnOutcome = {
      collection: "items",
      insertedCount: 0,
      failedCount: 2,
      errors: [{ index: 0, code: "MONGO_WRITE_ERROR", message: "Write error" }],
    };
    const resC = await hook.executeBulkInsert({
      collection: "items",
      documents: [{ a: 1 }, { a: 2 }],
    });
    assert.equal(resC?.status, "failed");
  });

  // 6. Defensive Error Sanitization
  it("6. bounds retained errors to 10 items, truncates messages, strips control characters, and redacts credentials", () => {
    // Credential redaction
    const uriMsg =
      "Connection failed: mongodb://admin:secretPass123@cluster0.mongodb.net/test?ssl=true";
    const sanitizedUri = sanitizeErrorMessage(uriMsg);
    assert.ok(!sanitizedUri.includes("secretPass123"));
    assert.ok(sanitizedUri.includes("<credentials>@"));

    // Control characters stripped
    const ctrlMsg = "Error\x00with\x08null\x1Fbytes";
    assert.equal(sanitizeErrorMessage(ctrlMsg), "Errorwithnullbytes");

    // Message length capped at 200
    const longMsg = "A".repeat(300);
    const sanitizedLong = sanitizeErrorMessage(longMsg);
    assert.equal(sanitizedLong.length, 200);
    assert.ok(sanitizedLong.endsWith("..."));

    // Bounds error array to 10 entries while preserving totalErrors count
    const manyErrors = Array.from({ length: 25 }, (_, idx) => ({
      index: idx,
      code: "WRITE_ERR",
      message: `Error number ${idx}`,
    }));
    const { sanitizedErrors, totalErrors } = sanitizeMutationErrors(manyErrors, 10);
    assert.equal(totalErrors, 25);
    assert.equal(sanitizedErrors.length, 10);
    assert.equal(sanitizedErrors[0].index, 0);
    assert.equal(sanitizedErrors[9].index, 9);
  });

  // 7. Defensive Response Handling
  it("7. defensively handles malformed or inconsistent bridge responses", async () => {
    let mockResponse: any;
    const mockService: BulkMutationsServiceContract = {
      bulkStore: mockStore,
      bulkUpdateMongoDocuments: async () => mockResponse,
      bulkInsertMongoDocuments: async () => mockResponse,
    };

    const hook = useMongoBulkMutations("db-defensive", mockService);

    // Malformed non-object update response
    mockResponse = null;
    const resUpdateNull = await hook.executeBulkUpdate({
      collection: "c",
      filter: { id: 1 },
      update: { $set: { a: 1 } },
    });
    assert.equal(resUpdateNull?.status, "failed");

    // Negative count in update response
    mockResponse = { matchedCount: -1, modifiedCount: 0 };
    const resUpdateNegative = await hook.executeBulkUpdate({
      collection: "c",
      filter: { id: 1 },
      update: { $set: { a: 1 } },
    });
    assert.equal(resUpdateNegative?.status, "failed");

    // 0/0 insert for non-empty array
    mockResponse = { insertedCount: 0, failedCount: 0 };
    const resInsertZero = await hook.executeBulkInsert({
      collection: "c",
      documents: [{ test: 1 }],
    });
    assert.equal(resInsertZero?.status, "failed");

    // Count mismatch (1 + 0 !== 2)
    mockResponse = { insertedCount: 1, failedCount: 0 };
    const resInsertMismatch = await hook.executeBulkInsert({
      collection: "c",
      documents: [{ test: 1 }, { test: 2 }],
    });
    assert.equal(resInsertMismatch?.status, "failed");
  });

  // 8. Bulk Insert Count Boundary Enforcement
  it("8. enforces document count boundaries (0 rejected, 5,000 accepted, 5,001 rejected)", async () => {
    const mockService: BulkMutationsServiceContract = {
      bulkStore: mockStore,
      bulkInsertMongoDocuments: async () => ({
        collection: "boundary",
        insertedCount: 5000,
        failedCount: 0,
      }),
    };
    const hook = useMongoBulkMutations("db-boundary", mockService);

    // Empty array rejected before bridge call
    await assert.rejects(
      async () => hook.executeBulkInsert({ collection: "boundary", documents: [] }),
      /cannot be empty/,
    );

    // Exactly 5,000 documents accepted
    const docs5000 = Array.from({ length: 5000 }, (_, i) => ({ i }));
    const res5000 = await hook.executeBulkInsert({ collection: "boundary", documents: docs5000 });
    assert.equal(res5000?.status, "completed");

    // 5,001 documents rejected client-side
    const docs5001 = Array.from({ length: 5001 }, (_, i) => ({ i }));
    await assert.rejects(
      async () => hook.executeBulkInsert({ collection: "boundary", documents: docs5001 }),
      /exceeds maximum limit of 5,000 documents/,
    );
  });

  // 9. Bulk Insert Size Boundary Enforcement
  it("9. enforces 16 MB byte payload boundaries client-side", async () => {
    const mockService: BulkMutationsServiceContract = {
      bulkStore: mockStore,
      bulkInsertMongoDocuments: async () => ({
        collection: "size",
        insertedCount: 1,
        failedCount: 0,
      }),
    };
    const hook = useMongoBulkMutations("db-size", mockService);

    // Exceeding 16 MB rejected client-side
    // Create an object with a string property that pushes payload over 16MB
    const bigString = "x".repeat(16 * 1024 * 1024 + 10);
    const hugeDoc = [{ bigString }];

    await assert.rejects(
      async () => hook.executeBulkInsert({ collection: "size", documents: hugeDoc }),
      /exceeds 16 MB limit/,
    );
  });

  // 10. Prototype Pollution Rejection on Insert
  it("10. rejects documents containing prototype pollution keys before RPC dispatch", async () => {
    let rpcCalled = false;
    const mockService: BulkMutationsServiceContract = {
      bulkStore: mockStore,
      bulkInsertMongoDocuments: async () => {
        rpcCalled = true;
        return { collection: "sec", insertedCount: 1, failedCount: 0 };
      },
    };
    const hook = useMongoBulkMutations("db-sec", mockService);

    const pollutedDoc = JSON.parse('{"name": "Alice", "__proto__": {"isAdmin": true}}');
    await assert.rejects(
      async () => hook.executeBulkInsert({ collection: "sec", documents: [pollutedDoc] }),
      /Security violation/,
    );
    assert.equal(rpcCalled, false);
  });

  // 11. Bridge Advisory Warning Capture
  it("11. captures bridge advisory warnings for unrestricted update and broad delete", async () => {
    const mockService: BulkMutationsServiceContract = {
      bulkStore: mockStore,
      bulkUpdateMongoDocuments: async () => ({
        collection: "p",
        matchedCount: 200,
        modifiedCount: 200,
        advisoryWarning: "Unrestricted bulk update performed across entire collection",
      }),
      bulkDeleteMongoDocuments: async () => ({
        collection: "p",
        deletedCount: 150,
        advisoryWarning: "Broad delete operation affected more than 100 documents (150 deleted)",
      }),
    };
    const hook = useMongoBulkMutations("db-advisory", mockService);

    // Update advisory warning
    const resUpdate = await hook.executeBulkUpdate({
      collection: "p",
      filter: {},
      update: { $set: { touched: true } },
      options: { allowUnrestricted: true },
    });
    assert.equal(resUpdate?.status, "completed");
    const opsUpdate = mockStore.getSnapshot().operationsByDb["db-advisory"] || [];
    assert.equal(
      (opsUpdate[0] as TrackedSyncBulkMutation).advisoryWarning,
      "Unrestricted bulk update performed across entire collection",
    );

    // Delete advisory warning
    const resDelete = await hook.executeBulkDelete({
      collection: "p",
      filter: {},
      options: { allowUnrestricted: true },
    });
    assert.equal(resDelete?.status, "completed");
    const opsDelete = mockStore.getSnapshot().operationsByDb["db-advisory"] || [];
    assert.equal(
      (opsDelete[0] as TrackedSyncBulkMutation).advisoryWarning,
      "Broad delete operation affected more than 100 documents (150 deleted)",
    );
  });

  // 12. Bridge Error Handling
  it("12. handles bridge rejection and records sanitized error in store", async () => {
    const mockService: BulkMutationsServiceContract = {
      bulkStore: mockStore,
      bulkUpdateMongoDocuments: async () => {
        throw new Error("MONGO_READ_ONLY: Database connection is read-only");
      },
    };
    const hook = useMongoBulkMutations("db-err", mockService);

    const res = await hook.executeBulkUpdate({
      collection: "c",
      filter: { a: 1 },
      update: { $set: { b: 2 } },
    });
    assert.equal(res?.status, "failed");
    assert.ok(res.error?.includes("MONGO_READ_ONLY"));

    const ops = mockStore.getSnapshot().operationsByDb["db-err"] || [];
    assert.equal(ops[0].status, "failed");
    assert.ok(ops[0].error?.includes("MONGO_READ_ONLY"));
  });

  // 13. Poller Exclusion Invariant
  it("13. ensures synchronous mutations are never registered in activePollers map", async () => {
    const mockService: BulkMutationsServiceContract = {
      bulkStore: mockStore,
      bulkUpdateMongoDocuments: async () => ({
        collection: "t",
        matchedCount: 1,
        modifiedCount: 1,
      }),
    };
    const hook = useMongoBulkMutations("db-poller-test", mockService);

    await hook.executeBulkUpdate({
      collection: "t",
      filter: { a: 1 },
      update: { $set: { a: 2 } },
    });

    const activePollers = (mockStore as any)._activePollers;
    assert.equal(activePollers.size, 0);
  });

  // 14. Database Isolation & Duplicate Prevention
  it("14. enforces database isolation and synchronously drops duplicate concurrent invocations", async () => {
    let resolver: (val: any) => void;
    const delayedPromise = new Promise((resolve) => {
      resolver = resolve;
    });

    const mockService: BulkMutationsServiceContract = {
      bulkStore: mockStore,
      bulkUpdateMongoDocuments: async () => {
        await delayedPromise;
        return { collection: "users", matchedCount: 1, modifiedCount: 1 };
      },
    };

    const hookDb1 = useMongoBulkMutations("db-iso-1", mockService);

    // Call 1 starts
    const p1 = hookDb1.executeBulkUpdate({
      collection: "users",
      filter: { id: 1 },
      update: { $set: { status: "A" } },
    });

    // Call 2 concurrent invocation (should be dropped synchronously)
    const p2 = hookDb1.executeBulkUpdate({
      collection: "users",
      filter: { id: 1 },
      update: { $set: { status: "B" } },
    });
    assert.equal(await p2, undefined);

    // Release promise
    resolver!({ collection: "users", matchedCount: 1, modifiedCount: 1 });
    await p1;

    // Database isolation: operations are strictly recorded under db-iso-1
    const db1Ops = mockStore.getSnapshot().operationsByDb["db-iso-1"] || [];
    const db2Ops = mockStore.getSnapshot().operationsByDb["db-iso-2"] || [];
    assert.equal(db1Ops.length, 1);
    assert.equal(db2Ops.length, 0);
  });
});
