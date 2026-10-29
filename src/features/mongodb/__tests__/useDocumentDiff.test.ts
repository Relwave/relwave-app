import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { computeDocumentDiff } from "../hooks/useDocumentDiff";

describe("computeDocumentDiff (M4 Spec §4.2.1)", () => {
  it("detects no-op when documents are identical", () => {
    const doc = { _id: { $oid: "507f1f77bcf86cd799439011" }, name: "Acme", count: 10 };
    const res = computeDocumentDiff(doc, { ...doc });
    assert.equal(res.hasChanges, false);
    assert.equal(res.updateDoc, undefined);
  });

  it("handles top-level field addition and modification", () => {
    const orig = { _id: "1", name: "Alice" };
    const edited = { _id: "1", name: "Alice Smith", role: "admin" };
    const res = computeDocumentDiff(orig, edited);
    assert.equal(res.hasChanges, true);
    assert.deepEqual(res.updateDoc, {
      $set: { name: "Alice Smith", role: "admin" },
    });
  });

  it("emits recursive dot-notation for nested property changes", () => {
    const orig = {
      _id: "1",
      address: { city: "Seattle", zip: "98101", country: "USA" },
    };
    const edited = {
      _id: "1",
      address: { city: "Boston", zip: "98101", country: "USA" },
    };
    const res = computeDocumentDiff(orig, edited);
    assert.equal(res.hasChanges, true);
    assert.deepEqual(res.updateDoc, {
      $set: { "address.city": "Boston" },
    });
  });

  it("emits dot-notation unset for nested deletions", () => {
    const orig = {
      _id: "1",
      address: { city: "Seattle", zip: "98101" },
    };
    const edited = {
      _id: "1",
      address: { city: "Seattle" },
    };
    const res = computeDocumentDiff(orig, edited);
    assert.equal(res.hasChanges, true);
    assert.deepEqual(res.updateDoc, {
      $unset: { "address.zip": "" },
    });
  });

  it("emits single parent unset on complete nested-object removal", () => {
    const orig = {
      _id: "1",
      address: { city: "Seattle", zip: "98101" },
      active: true,
    };
    const edited = {
      _id: "1",
      active: true,
    };
    const res = computeDocumentDiff(orig, edited);
    assert.equal(res.hasChanges, true);
    assert.deepEqual(res.updateDoc, {
      $unset: { address: "" },
    });
  });

  it("handles object-to-scalar transition without child unsets", () => {
    const orig = {
      _id: "1",
      metadata: { author: "Alice", revision: 1 },
    };
    const edited = {
      _id: "1",
      metadata: "archived",
    };
    const res = computeDocumentDiff(orig, edited);
    assert.equal(res.hasChanges, true);
    assert.deepEqual(res.updateDoc, {
      $set: { metadata: "archived" },
    });
  });

  it("handles scalar-to-object transition", () => {
    const orig = {
      _id: "1",
      metadata: "none",
    };
    const edited = {
      _id: "1",
      metadata: { author: "Alice", revision: 1 },
    };
    const res = computeDocumentDiff(orig, edited);
    assert.equal(res.hasChanges, true);
    assert.deepEqual(res.updateDoc, {
      $set: { metadata: { author: "Alice", revision: 1 } },
    });
  });

  it("handles object-to-array transition", () => {
    const orig = {
      _id: "1",
      items: { a: 1, b: 2 },
    };
    const edited = {
      _id: "1",
      items: [1, 2, 3],
    };
    const res = computeDocumentDiff(orig, edited);
    assert.equal(res.hasChanges, true);
    assert.deepEqual(res.updateDoc, {
      $set: { items: [1, 2, 3] },
    });
  });

  it("treats arrays as atomic units on modification", () => {
    const orig = {
      _id: "1",
      tags: ["alpha", "beta", "gamma"],
    };
    const edited = {
      _id: "1",
      tags: ["alpha", "delta"],
    };
    const res = computeDocumentDiff(orig, edited);
    assert.equal(res.hasChanges, true);
    assert.deepEqual(res.updateDoc, {
      $set: { tags: ["alpha", "delta"] },
    });
  });

  it("distinguishes explicit null ($set) from omitted key ($unset)", () => {
    const orig = {
      _id: "1",
      fieldA: "valA",
      fieldB: "valB",
    };
    const edited = {
      _id: "1",
      fieldA: null, // explicit null
      // fieldB omitted
    };
    const res = computeDocumentDiff(orig, edited);
    assert.equal(res.hasChanges, true);
    assert.deepEqual(res.updateDoc, {
      $set: { fieldA: null },
      $unset: { fieldB: "" },
    });
  });

  it("preserves empty object {} as $set", () => {
    const orig = {
      _id: "1",
      metadata: { temp: 1 },
    };
    const edited = {
      _id: "1",
      metadata: {},
    };
    const res = computeDocumentDiff(orig, edited);
    assert.equal(res.hasChanges, true);
    assert.deepEqual(res.updateDoc, {
      $set: { metadata: {} },
    });
  });

  it("preserves BSON/EJSON tagged scalar types as atomic units", () => {
    const orig = {
      _id: { $oid: "507f1f77bcf86cd799439011" },
      createdAt: { $date: "2026-01-01T00:00:00.000Z" },
      amount: { $numberDecimal: "99.95" },
    };
    const edited = {
      _id: { $oid: "507f1f77bcf86cd799439011" },
      createdAt: { $date: "2026-02-01T00:00:00.000Z" },
      amount: { $numberDecimal: "99.95" }, // unchanged
    };
    const res = computeDocumentDiff(orig, edited);
    assert.equal(res.hasChanges, true);
    assert.deepEqual(res.updateDoc, {
      $set: { createdAt: { $date: "2026-02-01T00:00:00.000Z" } },
    });
  });

  it("throws when _id is modified", () => {
    const orig = { _id: { $oid: "507f1f77bcf86cd799439011" }, name: "A" };
    const edited = { _id: { $oid: "507f1f77bcf86cd799439022" }, name: "A" };
    assert.throws(
      () => computeDocumentDiff(orig, edited),
      /ID_MODIFICATION_PROHIBITED/,
    );
  });

  it("throws when _id is deleted", () => {
    const orig = { _id: "1", name: "A" };
    const edited = { name: "A" };
    assert.throws(
      () => computeDocumentDiff(orig, edited),
      /ID_MODIFICATION_PROHIBITED/,
    );
  });

  it("rejects keys containing '$'", () => {
    const orig = { _id: "1" };
    const edited = { _id: "1", "$badKey": 123 };
    assert.throws(
      () => computeDocumentDiff(orig, edited),
      /INVALID_FIELD_PATH.*'\$badKey'/,
    );
  });

  it("rejects keys containing invalid dot notation", () => {
    const orig = { _id: "1" };
    const edited = { _id: "1", ".badKey": 123 };
    assert.throws(
      () => computeDocumentDiff(orig, edited),
      /INVALID_FIELD_PATH.*'\.badKey'/,
    );
  });
});
