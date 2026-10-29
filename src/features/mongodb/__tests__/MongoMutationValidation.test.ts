import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  validateCollectionName,
  validateCappedOptions,
  validateJsonDocument,
} from "../utils/validation";

describe("validateCollectionName", () => {
  it("accepts valid collection names", () => {
    assert.equal(validateCollectionName("users").valid, true);
    assert.equal(validateCollectionName("user_accounts").valid, true);
    assert.equal(validateCollectionName("orders-2026").valid, true);
    assert.equal(validateCollectionName("_audit_log").valid, true);
    assert.equal(validateCollectionName("a".repeat(120)).valid, true);
  });

  it("rejects empty or whitespace-only names", () => {
    assert.equal(validateCollectionName("").valid, false);
    assert.equal(validateCollectionName("   ").valid, false);
  });

  it("rejects names longer than 120 chars", () => {
    assert.equal(validateCollectionName("a".repeat(121)).valid, false);
  });

  it("rejects names containing '$' or null bytes", () => {
    assert.equal(validateCollectionName("my$coll").valid, false);
    assert.equal(validateCollectionName("coll\0test").valid, false);
  });

  it("rejects names starting with 'system.'", () => {
    assert.equal(validateCollectionName("system.views").valid, false);
    assert.equal(validateCollectionName("system.profile").valid, false);
  });

  it("rejects invalid characters and leading numbers", () => {
    assert.equal(validateCollectionName("123orders").valid, false);
    assert.equal(validateCollectionName("-orders").valid, false);
    assert.equal(validateCollectionName("my.coll").valid, false);
    assert.equal(validateCollectionName("my coll").valid, false);
  });
});

describe("validateCappedOptions", () => {
  it("passes when not capped", () => {
    assert.equal(validateCappedOptions(undefined).valid, true);
    assert.equal(validateCappedOptions({ capped: false }).valid, true);
  });

  it("requires size >= 4096 integer when capped", () => {
    assert.equal(validateCappedOptions({ capped: true } as any).valid, false);
    assert.equal(validateCappedOptions({ capped: true, size: 4095 }).valid, false);
    assert.equal(validateCappedOptions({ capped: true, size: 5000.5 }).valid, false);
    assert.equal(validateCappedOptions({ capped: true, size: 4096 }).valid, true);
    assert.equal(validateCappedOptions({ capped: true, size: 8192 }).valid, true);
  });

  it("requires max to be a positive integer if provided", () => {
    assert.equal(validateCappedOptions({ capped: true, size: 8192, max: 0 }).valid, false);
    assert.equal(validateCappedOptions({ capped: true, size: 8192, max: -1 }).valid, false);
    assert.equal(validateCappedOptions({ capped: true, size: 8192, max: 10.5 }).valid, false);
    assert.equal(validateCappedOptions({ capped: true, size: 8192, max: 100 }).valid, true);
  });
});

describe("validateJsonDocument", () => {
  it("accepts valid JSON objects", () => {
    const res = validateJsonDocument('{"name": "Alice", "age": 30}');
    assert.equal(res.valid, true);
    assert.deepEqual(res.doc, { name: "Alice", age: 30 });
  });

  it("rejects invalid JSON syntax", () => {
    const res = validateJsonDocument('{name: "Alice"}');
    assert.equal(res.valid, false);
    assert.match(res.error || "", /JSON|position/i);
  });

  it("rejects JSON arrays or primitives", () => {
    assert.equal(validateJsonDocument('[1, 2, 3]').valid, false);
    assert.equal(validateJsonDocument('"hello"').valid, false);
    assert.equal(validateJsonDocument('123').valid, false);
    assert.equal(validateJsonDocument('null').valid, false);
  });
});
