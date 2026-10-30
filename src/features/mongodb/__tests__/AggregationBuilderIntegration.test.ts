import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  createStageItem,
  toggleStageEnabled,
  toggleStageRaw,
  updateStageRawJson,
  reorderStages,
} from "../components/aggregation/pipelineModel";
import {
  serializePipeline,
  formatPipelineScript,
} from "../components/aggregation/pipelineSerializer";
import {
  validatePipeline,
  canPrependSample,
} from "../components/aggregation/pipelineValidation";

describe("MongoDB Aggregation Builder Integration Lifecycle", () => {
  it("constructs, validates, and serializes a realistic multi-stage analytics pipeline", () => {
    // Stage 0: Match active orders
    const sMatch = createStageItem("$match");
    sMatch.config = {
      filter: JSON.stringify({
        status: "completed",
        orderDate: { $gte: { $date: "2026-01-01T00:00:00.000Z" } },
      }),
    };

    // Stage 1: Lookup customer
    const sLookup = createStageItem("$lookup");
    sLookup.config = {
      from: "customers",
      localField: "customerId",
      foreignField: "_id",
      as: "customer",
    };

    // Stage 2: Unwind customer
    const sUnwind = createStageItem("$unwind");
    sUnwind.config = {
      path: "$customer",
      preserveNullAndEmptyArrays: false,
    };

    // Stage 3: Group by tier
    const sGroup = createStageItem("$group");
    sGroup.config = {
      idType: "field",
      idField: "$customer.tier",
      accumulators: [
        { name: "totalRevenue", op: "$sum", expr: "$amount" },
        { name: "orderCount", op: "$sum", expr: "1" },
        { name: "avgOrderValue", op: "$avg", expr: "$amount" },
      ],
    };

    // Stage 4: Sort by total revenue descending
    const sSort = createStageItem("$sort");
    sSort.config = {
      fields: [{ field: "totalRevenue", direction: -1 }],
    };

    // Stage 5: Limit to top 10
    const sLimit = createStageItem("$limit");
    sLimit.config = { limit: 10 };

    const pipeline = [sMatch, sLookup, sUnwind, sGroup, sSort, sLimit];

    // 1. Validation
    const validation = validatePipeline(pipeline);
    assert.strictEqual(validation.isValid, true);
    assert.strictEqual(validation.errors.length, 0);

    // 2. Serialization
    const serialized = serializePipeline(pipeline);
    assert.strictEqual(serialized.length, 6);
    assert.deepStrictEqual(serialized[0], {
      $match: {
        status: "completed",
        orderDate: { $gte: { $date: "2026-01-01T00:00:00.000Z" } },
      },
    });
    assert.deepStrictEqual(serialized[1], {
      $lookup: {
        from: "customers",
        localField: "customerId",
        foreignField: "_id",
        as: "customer",
      },
    });
    assert.deepStrictEqual(serialized[2], { $unwind: "$customer" });
    assert.deepStrictEqual(serialized[3], {
      $group: {
        _id: "$customer.tier",
        totalRevenue: { $sum: "$amount" },
        orderCount: { $sum: 1 },
        avgOrderValue: { $avg: "$amount" },
      },
    });
    assert.deepStrictEqual(serialized[4], { $sort: { totalRevenue: -1 } });
    assert.deepStrictEqual(serialized[5], { $limit: 10 });

    // 3. Mongosh Script Generation
    const script = formatPipelineScript("orders", pipeline);
    assert.ok(script.startsWith("db.orders.aggregate(["));
    assert.ok(script.includes('"$match"'));
    assert.ok(script.includes('"$lookup"'));
    assert.ok(script.includes('"$unwind"'));
    assert.ok(script.includes('"$group"'));
    assert.ok(script.includes('"$sort"'));
    assert.ok(script.includes('"$limit": 10'));
  });

  it("handles stage slicing and preview pipeline generation logic", () => {
    const s0 = createStageItem("$match");
    s0.config = { filter: '{"active": true}' };

    const s1 = createStageItem("$lookup");
    s1.config = { from: "items", localField: "itemId", foreignField: "_id", as: "item" };

    const s2 = createStageItem("$project");
    s2.config = { fields: [{ field: "title", value: 1 }] };

    const stages = [s0, s1, s2];

    // Intermediate slice up to stage 1 (inclusive)
    const stageIndex = 1;
    const partialStages = stages.slice(0, stageIndex + 1);
    const serializedPartial = serializePipeline(partialStages);
    assert.strictEqual(serializedPartial.length, 2);

    // Preview pipeline with $limit: 10 appended
    const previewPipeline = [...serializedPartial, { $limit: 10 }];
    assert.strictEqual(previewPipeline.length, 3);
    assert.deepStrictEqual(previewPipeline[2], { $limit: 10 });

    // With sampled preview prepended
    const safetyCheck = canPrependSample(partialStages);
    assert.strictEqual(safetyCheck.allowed, true);
    const sampledPipeline = [{ $sample: { size: 100 } }, ...previewPipeline];
    assert.strictEqual(sampledPipeline.length, 4);
    assert.deepStrictEqual(sampledPipeline[0], { $sample: { size: 100 } });
  });

  it("dynamically blocks sampled preview when pipeline starts with $geoNear", () => {
    const sGeo = createStageItem("$raw");
    sGeo.rawJson = JSON.stringify({
      $geoNear: {
        near: { type: "Point", coordinates: [-73.99279, 40.719296] },
        distanceField: "dist.calculated",
        maxDistance: 2,
      },
    });

    const sMatch = createStageItem("$match");
    sMatch.config = { filter: '{"type": "store"}' };

    const stages = [sGeo, sMatch];
    const safety = canPrependSample(stages);
    assert.strictEqual(safety.allowed, false);
    assert.strictEqual(safety.blockingOperator, "$geoNear");
  });

  it("supports disabling an intermediate stage and re-serializes seamlessly", () => {
    const s0 = createStageItem("$match");
    s0.config = { filter: '{"score": {"$gt": 50}}' };

    const s1 = createStageItem("$sort");
    s1.config = { fields: [{ field: "score", direction: -1 }] };

    const s2 = createStageItem("$limit");
    s2.config = { limit: 5 };

    let stages = [s0, s1, s2];
    assert.strictEqual(serializePipeline(stages).length, 3);

    // Disable $sort
    stages = toggleStageEnabled(stages, s1.id);
    assert.strictEqual(stages[1].enabled, false);

    const serialized = serializePipeline(stages);
    assert.strictEqual(serialized.length, 2);
    assert.deepStrictEqual(serialized[0], { $match: { score: { $gt: 50 } } });
    assert.deepStrictEqual(serialized[1], { $limit: 5 });
  });

  it("supports switching a stage to raw mode and editing JSON", () => {
    const s0 = createStageItem("$match");
    s0.config = { filter: '{"status": "pending"}' };

    let stages = [s0];
    stages = toggleStageRaw(stages, s0.id);
    assert.strictEqual(stages[0].isRaw, true);

    // Edit rawJson to complex query with $or
    const customJson = JSON.stringify({
      $match: {
        $or: [{ status: "pending" }, { retryCount: { $lt: 3 } }],
      },
    });
    stages = updateStageRawJson(stages, s0.id, customJson);

    // Validate
    assert.strictEqual(validatePipeline(stages).isValid, true);

    // Serialize
    const serialized = serializePipeline(stages);
    assert.strictEqual(serialized.length, 1);
    assert.deepStrictEqual(serialized[0], {
      $match: {
        $or: [{ status: "pending" }, { retryCount: { $lt: 3 } }],
      },
    });

    // Broken JSON marks pipeline invalid
    stages = updateStageRawJson(stages, s0.id, "{ invalid json");
    const invalidResult = validatePipeline(stages);
    assert.strictEqual(invalidResult.isValid, false);
    assert.ok(invalidResult.errors[0].message.includes("Invalid JSON syntax"));
  });

  it("preserves stage execution order when reordering", () => {
    const s0 = createStageItem("$match");
    s0.config = { filter: '{"active": true}' };

    const s1 = createStageItem("$group");
    s1.config = { idType: "field", idField: "$category", accumulators: [{ name: "c", op: "$sum", expr: "1" }] };

    const s2 = createStageItem("$sort");
    s2.config = { fields: [{ field: "c", direction: -1 }] };

    let stages = [s0, s1, s2];

    // Move $sort (index 2) to before $group (index 1)
    stages = reorderStages(stages, 2, 1);
    assert.strictEqual(stages[0].id, s0.id);
    assert.strictEqual(stages[1].id, s2.id);
    assert.strictEqual(stages[2].id, s1.id);

    const serialized = serializePipeline(stages);
    assert.strictEqual(Object.keys(serialized[0])[0], "$match");
    assert.strictEqual(Object.keys(serialized[1])[0], "$sort");
    assert.strictEqual(Object.keys(serialized[2])[0], "$group");
  });
});
