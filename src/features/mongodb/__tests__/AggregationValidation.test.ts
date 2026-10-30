import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  validatePipeline,
  canPrependSample,
  findForbiddenOperator,
  FORBIDDEN_WRITE_STAGES,
  FORBIDDEN_JS_OPERATORS,
} from "../components/aggregation/pipelineValidation";
import { createStageItem } from "../components/aggregation/pipelineModel";

describe("MongoDB Aggregation Validation", () => {
  it("rejects pipeline with no stages or all disabled stages", () => {
    assert.strictEqual(validatePipeline([]).isValid, false);

    const s1 = createStageItem("$limit");
    s1.enabled = false;
    const res = validatePipeline([s1]);
    assert.strictEqual(res.isValid, false);
    assert.ok(res.errors[0].message.includes("at least one enabled stage"));
  });

  describe("Security: Forbidden operators & write stages", () => {
    it("findForbiddenOperator detects deep forbidden JS operators", () => {
      assert.strictEqual(
        findForbiddenOperator({
          filter: { $expr: { $function: { body: "function() {}", args: [], lang: "js" } } },
        }),
        "$function",
      );

      assert.strictEqual(
        findForbiddenOperator([1, { a: [{ b: { $where: "this.a == 1" } }] }]),
        "$where",
      );

      assert.strictEqual(
        findForbiddenOperator({ total: { $accumulator: {} } }),
        "$accumulator",
      );

      assert.strictEqual(
        findForbiddenOperator({ status: "active", count: { $gt: 5 } }),
        null,
      );
    });

    it("rejects $raw stage attempting $out or $merge writes", () => {
      for (const writeOp of FORBIDDEN_WRITE_STAGES) {
        const s = createStageItem("$raw");
        s.rawJson = JSON.stringify({ [writeOp]: "target_collection" });
        const res = validatePipeline([s]);
        assert.strictEqual(res.isValid, false);
        assert.ok(res.errors.some((e) => e.message.includes(`Write stage '${writeOp}' is forbidden`)));
      }
    });

    it("rejects $raw stage containing forbidden JavaScript operators", () => {
      for (const jsOp of FORBIDDEN_JS_OPERATORS) {
        const s = createStageItem("$raw");
        s.rawJson = JSON.stringify({
          $match: {
            $expr: { [jsOp]: "code" },
          },
        });
        const res = validatePipeline([s]);
        assert.strictEqual(res.isValid, false);
        assert.ok(res.errors.some((e) => e.message.includes(`Operator '${jsOp}' is forbidden`)));
      }
    });
  });

  describe("Stage-specific configuration validation", () => {
    it("validates $match syntax and structure", () => {
      const s = createStageItem("$match");

      // Invalid JSON
      s.config = { filter: "{ unquoted: 123 }" };
      assert.strictEqual(validatePipeline([s]).isValid, false);

      // Non-object
      s.config = { filter: '"string"' };
      assert.strictEqual(validatePipeline([s]).isValid, false);

      // Valid filter
      s.config = { filter: '{"active": true}' };
      assert.strictEqual(validatePipeline([s]).isValid, true);
    });

    it("validates $project fields and expressions", () => {
      const s = createStageItem("$project");

      // Empty fields
      s.config = { fields: [] };
      assert.strictEqual(validatePipeline([s]).isValid, false);

      // Empty field name
      s.config = { fields: [{ field: " ", value: 1 }] };
      assert.strictEqual(validatePipeline([s]).isValid, false);

      // Forbidden operator in expression
      s.config = {
        fields: [{ field: "calc", value: '{"$function": {}}' }],
      };
      assert.strictEqual(validatePipeline([s]).isValid, false);

      // Valid projection
      s.config = { fields: [{ field: "name", value: 1 }] };
      assert.strictEqual(validatePipeline([s]).isValid, true);
    });

    it("validates $group identifiers and accumulators", () => {
      const s = createStageItem("$group");

      // Empty field path
      s.config = { idType: "field", idField: " ", accumulators: [] };
      assert.strictEqual(validatePipeline([s]).isValid, false);

      // Custom empty
      s.config = { idType: "custom", customId: "", accumulators: [] };
      assert.strictEqual(validatePipeline([s]).isValid, false);

      // Custom invalid JSON
      s.config = { idType: "custom", customId: "{ bad json }", accumulators: [] };
      assert.strictEqual(validatePipeline([s]).isValid, false);

      // Accumulator missing name
      s.config = {
        idType: "null",
        accumulators: [{ name: "", op: "$sum", expr: "1" }],
      };
      assert.strictEqual(validatePipeline([s]).isValid, false);

      // Accumulator using $accumulator operator
      s.config = {
        idType: "null",
        accumulators: [{ name: "total", op: "$accumulator", expr: "{}" }],
      };
      assert.strictEqual(validatePipeline([s]).isValid, false);

      // Valid group
      s.config = {
        idType: "field",
        idField: "$dept",
        accumulators: [{ name: "count", op: "$sum", expr: "1" }],
      };
      assert.strictEqual(validatePipeline([s]).isValid, true);
    });

    it("validates $sort fields and directions", () => {
      const s = createStageItem("$sort");

      // Empty fields
      s.config = { fields: [] };
      assert.strictEqual(validatePipeline([s]).isValid, false);

      // Empty field name
      s.config = { fields: [{ field: "", direction: 1 }] };
      assert.strictEqual(validatePipeline([s]).isValid, false);

      // Invalid direction
      s.config = { fields: [{ field: "age", direction: 2 }] };
      assert.strictEqual(validatePipeline([s]).isValid, false);

      // Valid sort
      s.config = { fields: [{ field: "age", direction: -1 }] };
      assert.strictEqual(validatePipeline([s]).isValid, true);
    });

    it("validates $limit and $skip numeric invariants", () => {
      const sLimit = createStageItem("$limit");

      // Zero limit
      sLimit.config = { limit: 0 };
      assert.strictEqual(validatePipeline([sLimit]).isValid, false);

      // Negative limit
      sLimit.config = { limit: -5 };
      assert.strictEqual(validatePipeline([sLimit]).isValid, false);

      // Float limit
      sLimit.config = { limit: 2.5 };
      assert.strictEqual(validatePipeline([sLimit]).isValid, false);

      // Valid limit
      sLimit.config = { limit: 10 };
      assert.strictEqual(validatePipeline([sLimit]).isValid, true);

      const sSkip = createStageItem("$skip");

      // Negative skip
      sSkip.config = { skip: -1 };
      assert.strictEqual(validatePipeline([sSkip]).isValid, false);

      // Float skip
      sSkip.config = { skip: 1.5 };
      assert.strictEqual(validatePipeline([sSkip]).isValid, false);

      // 0 skip is valid
      sSkip.config = { skip: 0 };
      assert.strictEqual(validatePipeline([sSkip]).isValid, true);
    });

    it("validates $lookup required parameters", () => {
      const s = createStageItem("$lookup");

      // Missing 'from'
      s.config = { from: "", localField: "a", foreignField: "b", as: "c" };
      assert.strictEqual(validatePipeline([s]).isValid, false);

      // Missing 'as'
      s.config = { from: "orders", localField: "a", foreignField: "b", as: "" };
      assert.strictEqual(validatePipeline([s]).isValid, false);

      // Valid lookup
      s.config = { from: "orders", localField: "a", foreignField: "b", as: "c" };
      assert.strictEqual(validatePipeline([s]).isValid, true);
    });

    it("validates $unwind required path", () => {
      const s = createStageItem("$unwind");

      s.config = { path: "  " };
      assert.strictEqual(validatePipeline([s]).isValid, false);

      s.config = { path: "$tags" };
      assert.strictEqual(validatePipeline([s]).isValid, true);
    });

    it("validates $addFields key and expression syntax", () => {
      const s = createStageItem("$addFields");

      // Empty fields
      s.config = { fields: [] };
      assert.strictEqual(validatePipeline([s]).isValid, false);

      // Empty key
      s.config = { fields: [{ key: "", value: "1" }] };
      assert.strictEqual(validatePipeline([s]).isValid, false);

      // Invalid JSON value
      s.config = { fields: [{ key: "foo", value: "{ broken json" }] };
      assert.strictEqual(validatePipeline([s]).isValid, false);

      // Valid addFields
      s.config = { fields: [{ key: "foo", value: '{"$literal": 1}' }] };
      assert.strictEqual(validatePipeline([s]).isValid, true);
    });
  });

  describe("canPrependSample — First Stage Invariants", () => {
    it("permits sampling for ordinary aggregation pipelines", () => {
      const s1 = createStageItem("$match");
      const s2 = createStageItem("$sort");
      assert.deepStrictEqual(canPrependSample([s1, s2]), { allowed: true });
    });

    it("forbids sampling when first stage is a first-stage-only operator", () => {
      const blockedOps = [
        "$geoNear",
        "$collStats",
        "$indexStats",
        "$search",
        "$searchMeta",
        "$vectorSearch",
      ];

      for (const op of blockedOps) {
        const s = createStageItem("$raw");
        s.rawJson = JSON.stringify({ [op]: {} });
        const check = canPrependSample([s]);
        assert.strictEqual(check.allowed, false);
        assert.strictEqual(check.blockingOperator, op);
        assert.ok(check.reason?.includes("Sampled preview is unavailable"));
      }
    });

    it("permits sampling if the first-stage-only operator is disabled", () => {
      const sBlocked = createStageItem("$raw");
      sBlocked.rawJson = JSON.stringify({ $geoNear: {} });
      sBlocked.enabled = false;

      const sMatch = createStageItem("$match");
      sMatch.enabled = true;

      const check = canPrependSample([sBlocked, sMatch]);
      assert.strictEqual(check.allowed, true);
    });
  });
});
