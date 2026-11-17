import test from "node:test";
import assert from "node:assert/strict";
import {
  MONGO_COMPLETION_OPERATORS,
  FORBIDDEN_AUTOCOMPLETE_OPERATORS,
  FORBIDDEN_CONSTRUCTOR_NAMES,
  getMongoCompletions,
  lightTheme,
  darkThemeExtension,
} from "../components/editor/MongoMqlEditor";

test("MongoMqlEditor - Autocomplete Security Invariant", () => {
  const completions = getMongoCompletions();
  const completionLabels = new Set(completions.map((c) => c.label));

  // 1. Must include allowed query operators
  assert.ok(completionLabels.has("$match"), "Must contain $match");
  assert.ok(completionLabels.has("$project"), "Must contain $project");
  assert.ok(completionLabels.has("$group"), "Must contain $group");
  assert.ok(completionLabels.has("$sort"), "Must contain $sort");
  assert.ok(completionLabels.has("$limit"), "Must contain $limit");
  assert.ok(completionLabels.has("$skip"), "Must contain $skip");
  assert.ok(completionLabels.has("$unwind"), "Must contain $unwind");
  assert.ok(completionLabels.has("$lookup"), "Must contain $lookup");
  assert.ok(completionLabels.has("$addFields"), "Must contain $addFields");
  assert.ok(completionLabels.has("$gt"), "Must contain $gt");
  assert.ok(completionLabels.has("$gte"), "Must contain $gte");
  assert.ok(completionLabels.has("$eq"), "Must contain $eq");
  assert.ok(completionLabels.has("$ne"), "Must contain $ne");
  assert.ok(completionLabels.has("$in"), "Must contain $in");
  assert.ok(completionLabels.has("$exists"), "Must contain $exists");

  // 2. Extended JSON v2 valid wrappers must be present
  assert.ok(completionLabels.has("$oid"), "Must contain EJSON v2 $oid");
  assert.ok(completionLabels.has("$date"), "Must contain EJSON v2 $date");
  assert.ok(completionLabels.has("$numberLong"), "Must contain EJSON v2 $numberLong");
  assert.ok(completionLabels.has("$numberDecimal"), "Must contain EJSON v2 $numberDecimal");
  assert.ok(completionLabels.has("$binary"), "Must contain EJSON v2 $binary");

  // 3. MANDATORY SECURITY INVARIANT: Must strictly blacklist forbidden operators
  for (const forbidden of FORBIDDEN_AUTOCOMPLETE_OPERATORS) {
    assert.strictEqual(
      completionLabels.has(forbidden),
      false,
      `SECURITY VIOLATION: Autocomplete must never contain ${forbidden}`,
    );
  }

  // Explicitly assert every single forbidden operator
  assert.strictEqual(completionLabels.has("$where"), false, "Must not contain $where");
  assert.strictEqual(completionLabels.has("$function"), false, "Must not contain $function");
  assert.strictEqual(completionLabels.has("$accumulator"), false, "Must not contain $accumulator");
  assert.strictEqual(completionLabels.has("$out"), false, "Must not contain $out");
  assert.strictEqual(completionLabels.has("$merge"), false, "Must not contain $merge");
});

test("MongoMqlEditor - JSON-Only Contract & Constructor Absence", () => {
  const completions = getMongoCompletions();
  const completionLabels = new Set(completions.map((c) => c.label));

  // Mongosh constructors must NOT be present in JSON editor autocomplete
  for (const constructorName of FORBIDDEN_CONSTRUCTOR_NAMES) {
    assert.strictEqual(
      completionLabels.has(constructorName),
      false,
      `JSON VIOLATION: Autocomplete must not suggest mongosh constructor ${constructorName}() in JSON editor`,
    );
  }
  assert.strictEqual(completionLabels.has("ObjectId"), false);
  assert.strictEqual(completionLabels.has("ISODate"), false);
  assert.strictEqual(completionLabels.has("NumberLong"), false);
  assert.strictEqual(completionLabels.has("NumberDecimal"), false);
  assert.strictEqual(completionLabels.has("UUID"), false);

  // All completion labels must begin with '$' to conform to valid JSON keys
  for (const label of completionLabels) {
    assert.ok(
      label.startsWith("$"),
      `Completion token "${label}" must start with '$' for JSON validity`,
    );
  }
});

test("MongoMqlEditor - Theme and Extension Configurations", () => {
  assert.ok(lightTheme, "lightTheme extension should be defined");
  assert.ok(darkThemeExtension, "darkThemeExtension should be defined");
  assert.strictEqual(typeof lightTheme, "object");
  assert.strictEqual(typeof darkThemeExtension, "object");
  assert.strictEqual(Array.isArray(MONGO_COMPLETION_OPERATORS), true);
  assert.ok(MONGO_COMPLETION_OPERATORS.length > 30, "Should have rich completion list");
});
