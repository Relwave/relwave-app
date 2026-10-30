import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  generateStageId,
  createStageItem,
  duplicateStage,
  toggleStageEnabled,
  toggleStageRaw,
  toggleStageCollapsed,
  updateStageConfig,
  updateStageRawJson,
  deleteStage,
  reorderStages,
  moveStageUp,
  moveStageDown,
} from "../components/aggregation/pipelineModel";
import { SupportedStageType } from "../components/aggregation/types";

describe("MongoDB Aggregation Pipeline Model", () => {
  it("generateStageId produces unique valid UUIDs", () => {
    const id1 = generateStageId();
    const id2 = generateStageId();
    assert.notStrictEqual(id1, id2);
    assert.match(
      id1,
      /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i,
    );
  });

  const supportedTypes: SupportedStageType[] = [
    "$match",
    "$project",
    "$group",
    "$sort",
    "$limit",
    "$skip",
    "$lookup",
    "$unwind",
    "$addFields",
    "$raw",
  ];

  it("creates default items for all 10 supported stages", () => {
    for (const type of supportedTypes) {
      const stage = createStageItem(type);
      assert.strictEqual(stage.type, type);
      assert.strictEqual(stage.enabled, true);
      assert.strictEqual(stage.collapsed, false);
      assert.ok(stage.id.length > 0);
      assert.ok(typeof stage.config === "object");
      assert.ok(typeof stage.rawJson === "string" && stage.rawJson.length > 0);
      if (type === "$raw") {
        assert.strictEqual(stage.isRaw, true);
      } else {
        assert.strictEqual(stage.isRaw, false);
      }
    }
  });

  it("duplicates stage with a new unique ID while retaining state", () => {
    const original = createStageItem("$match");
    original.config = { filter: '{"active": false}' };
    original.rawJson = '{"$match": {"active": false}}';

    const duplicated = duplicateStage(original);
    assert.notStrictEqual(duplicated.id, original.id);
    assert.strictEqual(duplicated.type, original.type);
    assert.deepStrictEqual(duplicated.config, original.config);
    assert.strictEqual(duplicated.rawJson, original.rawJson);
    assert.strictEqual(duplicated.enabled, original.enabled);
  });

  it("toggles enabled state correctly", () => {
    const s1 = createStageItem("$match");
    const s2 = createStageItem("$sort");
    let list = [s1, s2];

    list = toggleStageEnabled(list, s1.id);
    assert.strictEqual(list[0].enabled, false);
    assert.strictEqual(list[1].enabled, true);

    list = toggleStageEnabled(list, s1.id);
    assert.strictEqual(list[0].enabled, true);
  });

  it("toggles raw mode and serializes config to rawJson if missing", () => {
    const s1 = createStageItem("$limit");
    s1.config = { limit: 25 };
    s1.rawJson = "";
    let list = [s1];

    list = toggleStageRaw(list, s1.id);
    assert.strictEqual(list[0].isRaw, true);
    assert.ok(list[0].rawJson.includes("25"));

    list = toggleStageRaw(list, s1.id);
    assert.strictEqual(list[0].isRaw, false);
  });

  it("toggles collapsed state correctly", () => {
    const s1 = createStageItem("$match");
    let list = [s1];

    list = toggleStageCollapsed(list, s1.id);
    assert.strictEqual(list[0].collapsed, true);

    list = toggleStageCollapsed(list, s1.id);
    assert.strictEqual(list[0].collapsed, false);
  });

  it("updates stage config and synchronizes rawJson when not in raw mode", () => {
    const s1 = createStageItem("$limit");
    let list = [s1];

    list = updateStageConfig(list, s1.id, { limit: 50 });
    assert.strictEqual(list[0].config.limit, 50);
    assert.ok(list[0].rawJson.includes("50"));
  });

  it("updates raw JSON directly", () => {
    const s1 = createStageItem("$raw");
    let list = [s1];

    list = updateStageRawJson(list, s1.id, '{"$count": "total"}');
    assert.strictEqual(list[0].rawJson, '{"$count": "total"}');
  });

  it("deletes a stage by ID", () => {
    const s1 = createStageItem("$match");
    const s2 = createStageItem("$sort");
    let list = [s1, s2];

    list = deleteStage(list, s1.id);
    assert.strictEqual(list.length, 1);
    assert.strictEqual(list[0].id, s2.id);

    // No-op for non-existent ID
    list = deleteStage(list, "non-existent");
    assert.strictEqual(list.length, 1);
  });

  it("reorders stages correctly and respects bounds", () => {
    const s1 = createStageItem("$match");
    const s2 = createStageItem("$sort");
    const s3 = createStageItem("$limit");
    const list = [s1, s2, s3];

    // Out of bounds checks
    assert.deepStrictEqual(reorderStages(list, -1, 1), list);
    assert.deepStrictEqual(reorderStages(list, 0, 5), list);
    assert.deepStrictEqual(reorderStages(list, 10, 0), list);

    // Valid reorder: move index 0 to index 2
    const reordered = reorderStages(list, 0, 2);
    assert.strictEqual(reordered[0].id, s2.id);
    assert.strictEqual(reordered[1].id, s3.id);
    assert.strictEqual(reordered[2].id, s1.id);
  });

  it("moves stages up and down with boundary safeguards", () => {
    const s1 = createStageItem("$match");
    const s2 = createStageItem("$sort");
    const s3 = createStageItem("$limit");
    let list = [s1, s2, s3];

    // Cannot move top stage up
    assert.deepStrictEqual(moveStageUp(list, 0), list);

    // Cannot move bottom stage down
    assert.deepStrictEqual(moveStageDown(list, 2), list);

    // Move index 1 up
    list = moveStageUp(list, 1);
    assert.strictEqual(list[0].id, s2.id);
    assert.strictEqual(list[1].id, s1.id);

    // Move index 0 down
    list = moveStageDown(list, 0);
    assert.strictEqual(list[0].id, s1.id);
    assert.strictEqual(list[1].id, s2.id);
  });
});
