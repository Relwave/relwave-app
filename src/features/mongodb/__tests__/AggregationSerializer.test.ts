import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  serializePipeline,
  formatPipelineScript,
} from "../components/aggregation/pipelineSerializer";
import { createStageItem } from "../components/aggregation/pipelineModel";

describe("MongoDB Aggregation Serializer", () => {
  it("omits disabled stages during serialization", () => {
    const s1 = createStageItem("$match");
    s1.config = { filter: '{"status": "A"}' };

    const s2 = createStageItem("$limit");
    s2.config = { limit: 10 };
    s2.enabled = false;

    const s3 = createStageItem("$project");
    s3.config = { fields: [{ field: "name", value: 1 }] };

    const serialized = serializePipeline([s1, s2, s3]);
    assert.strictEqual(serialized.length, 2);
    assert.deepStrictEqual(serialized[0], { $match: { status: "A" } });
    assert.deepStrictEqual(serialized[1], { $project: { name: 1 } });
  });

  it("serializes $match stage correctly", () => {
    const s = createStageItem("$match");
    s.config = { filter: '{"score": {"$gt": 80}}' };

    const serialized = serializePipeline([s]);
    assert.deepStrictEqual(serialized, [{ $match: { score: { $gt: 80 } } }]);

    // Empty filter serializes to empty object
    s.config = { filter: "" };
    assert.deepStrictEqual(serializePipeline([s]), [{ $match: {} }]);
  });

  it("serializes $project stage with include, exclude, and expression values", () => {
    const s = createStageItem("$project");
    s.config = {
      fields: [
        { field: "_id", value: 0 },
        { field: "name", value: 1 },
        { field: "upperName", value: '{"$toUpper": "$name"}' },
        { field: "tag", value: "static-tag" },
      ],
    };

    const serialized = serializePipeline([s]);
    assert.deepStrictEqual(serialized, [
      {
        $project: {
          _id: 0,
          name: 1,
          upperName: { $toUpper: "$name" },
          tag: "static-tag",
        },
      },
    ]);
  });

  it("serializes $group stage with field, null, and custom _id plus accumulators", () => {
    // 1. Group by field
    const s1 = createStageItem("$group");
    s1.config = {
      idType: "field",
      idField: "dept",
      accumulators: [
        { name: "totalEmployees", op: "$sum", expr: "1" },
        { name: "avgSalary", op: "$avg", expr: "$salary" },
      ],
    };
    assert.deepStrictEqual(serializePipeline([s1]), [
      {
        $group: {
          _id: "$dept",
          totalEmployees: { $sum: 1 },
          avgSalary: { $avg: "$salary" },
        },
      },
    ]);

    // 2. Group by null
    const s2 = createStageItem("$group");
    s2.config = {
      idType: "null",
      accumulators: [{ name: "count", op: "$sum", expr: "1" }],
    };
    assert.deepStrictEqual(serializePipeline([s2]), [
      {
        $group: {
          _id: null,
          count: { $sum: 1 },
        },
      },
    ]);

    // 3. Group by custom JSON expression
    const s3 = createStageItem("$group");
    s3.config = {
      idType: "custom",
      customId: '{"month": {"$month": "$date"}, "year": {"$year": "$date"}}',
      accumulators: [],
    };
    assert.deepStrictEqual(serializePipeline([s3]), [
      {
        $group: {
          _id: { month: { $month: "$date" }, year: { $year: "$date" } },
        },
      },
    ]);
  });

  it("serializes $sort stage with directions", () => {
    const s = createStageItem("$sort");
    s.config = {
      fields: [
        { field: "score", direction: -1 },
        { field: "name", direction: 1 },
      ],
    };
    assert.deepStrictEqual(serializePipeline([s]), [
      {
        $sort: {
          score: -1,
          name: 1,
        },
      },
    ]);
  });

  it("serializes $limit and $skip stages to numeric values", () => {
    const sLimit = createStageItem("$limit");
    sLimit.config = { limit: 25 };

    const sSkip = createStageItem("$skip");
    sSkip.config = { skip: 10 };

    assert.deepStrictEqual(serializePipeline([sLimit, sSkip]), [
      { $limit: 25 },
      { $skip: 10 },
    ]);
  });

  it("serializes $lookup stage correctly", () => {
    const s = createStageItem("$lookup");
    s.config = {
      from: "orders",
      localField: "customerId",
      foreignField: "_id",
      as: "customerOrders",
    };
    assert.deepStrictEqual(serializePipeline([s]), [
      {
        $lookup: {
          from: "orders",
          localField: "customerId",
          foreignField: "_id",
          as: "customerOrders",
        },
      },
    ]);
  });

  it("serializes $unwind stage string vs object with preserveNullAndEmptyArrays", () => {
    // Basic unwind
    const s1 = createStageItem("$unwind");
    s1.config = { path: "tags", preserveNullAndEmptyArrays: false };
    assert.deepStrictEqual(serializePipeline([s1]), [{ $unwind: "$tags" }]);

    // Unwind with preserveNullAndEmptyArrays
    const s2 = createStageItem("$unwind");
    s2.config = { path: "$tags", preserveNullAndEmptyArrays: true };
    assert.deepStrictEqual(serializePipeline([s2]), [
      {
        $unwind: {
          path: "$tags",
          preserveNullAndEmptyArrays: true,
        },
      },
    ]);
  });

  it("serializes $addFields stage with JSON expressions and strings", () => {
    const s = createStageItem("$addFields");
    s.config = {
      fields: [
        {
          key: "fullName",
          value: '{"$concat": ["$firstName", " ", "$lastName"]}',
        },
        { key: "category", value: "general" },
      ],
    };
    assert.deepStrictEqual(serializePipeline([s]), [
      {
        $addFields: {
          fullName: { $concat: ["$firstName", " ", "$lastName"] },
          category: "general",
        },
      },
    ]);
  });

  it("serializes $raw stage and raw-mode stages cleanly", () => {
    const sRaw = createStageItem("$raw");
    sRaw.rawJson = '{"$facet": {"categorized": [{"$sortByCount": "$type"}]}}';

    const serialized = serializePipeline([sRaw]);
    assert.deepStrictEqual(serialized, [
      { $facet: { categorized: [{ $sortByCount: "$type" }] } },
    ]);

    // Raw mode on standard stage with full wrapper
    const sLimit = createStageItem("$limit");
    sLimit.isRaw = true;
    sLimit.rawJson = '{"$limit": 99}';
    assert.deepStrictEqual(serializePipeline([sLimit]), [{ $limit: 99 }]);

    // Raw mode with unwrapped body
    sLimit.rawJson = "50";
    assert.deepStrictEqual(serializePipeline([sLimit]), [{ $limit: 50 }]);
  });

  it("formats pipeline script for standard and complex collection identifiers", () => {
    const s = createStageItem("$limit");
    s.config = { limit: 5 };

    // Valid JS identifier
    const scriptStandard = formatPipelineScript("users", [s]);
    assert.strictEqual(
      scriptStandard,
      'db.users.aggregate([\n  {\n    "$limit": 5\n  }\n])',
    );

    // Identifier needing brackets
    const scriptSpecial = formatPipelineScript("order-items.2026", [s]);
    assert.strictEqual(
      scriptSpecial,
      'db.collection("order-items.2026").aggregate([\n  {\n    "$limit": 5\n  }\n])',
    );

    // Empty pipeline
    assert.strictEqual(formatPipelineScript("users", []), "db.users.aggregate([])");
  });
});
