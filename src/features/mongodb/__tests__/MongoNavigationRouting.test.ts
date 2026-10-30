import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { getDatabasePanelItems } from "../../../components/layout/panelItems";
import {
  OPERATION_TEMPLATES,
  isExplainSupported,
  getExplainDisabledReason,
  EXPLAIN_SUPPORTED_OPERATIONS,
} from "../components/workspace/MongoWorkspacePanel";

test("Navigation Routing - MongoDB returns dedicated panel items", () => {
  const mongoItems = getDatabasePanelItems("mongodb");
  const panelKeys = mongoItems.map((i) => i.panel);

  assert.deepStrictEqual(panelKeys, ["data", "mongo-workspace", "mongo-aggregation"]);
  assert.strictEqual(mongoItems[0].label, "Data View");
  assert.strictEqual(mongoItems[1].label, "Query Workspace");
  assert.strictEqual(mongoItems[2].label, "Aggregation Builder");

  // Case-insensitive test
  const mongoUpperItems = getDatabasePanelItems("MongoDB");
  assert.deepStrictEqual(mongoUpperItems.map((i) => i.panel), ["data", "mongo-workspace", "mongo-aggregation"]);
});

test("Navigation Routing - Relational databases retain full SQL suite without regression", () => {
  const relationalDbs = ["postgres", "postgresql", "mysql", "mariadb", "sqlite", "clickhouse", "duckdb"];

  for (const db of relationalDbs) {
    const items = getDatabasePanelItems(db);
    const panelKeys = items.map((i) => i.panel);

    assert.ok(panelKeys.includes("data"), `${db} must have data panel`);
    assert.ok(panelKeys.includes("sql-workspace"), `${db} must retain sql-workspace`);
    assert.ok(panelKeys.includes("query-builder"), `${db} must retain query-builder`);
    assert.ok(panelKeys.includes("schema-explorer"), `${db} must retain schema-explorer`);
    assert.ok(panelKeys.includes("er-diagram"), `${db} must retain er-diagram`);
    assert.ok(panelKeys.includes("migrations"), `${db} must retain migrations`);
    assert.ok(panelKeys.includes("git-status"), `${db} must retain git-status`);
    assert.ok(!panelKeys.includes("mongo-workspace"), `${db} must not contain mongo-workspace`);
    assert.ok(!panelKeys.includes("mongo-aggregation"), `${db} must not contain mongo-aggregation`);
  }
});

test("MongoWorkspace - Operation Templates validation", () => {
  assert.strictEqual(typeof OPERATION_TEMPLATES.find, "string");
  assert.strictEqual(typeof OPERATION_TEMPLATES.aggregate, "string");
  assert.strictEqual(typeof OPERATION_TEMPLATES.countDocuments, "string");
  assert.strictEqual(typeof OPERATION_TEMPLATES.estimatedDocumentCount, "string");
  assert.strictEqual(typeof OPERATION_TEMPLATES.distinct, "string");

  // All templates must parse into valid JSON
  const findJson = JSON.parse(OPERATION_TEMPLATES.find);
  const aggJson = JSON.parse(OPERATION_TEMPLATES.aggregate);
  const countJson = JSON.parse(OPERATION_TEMPLATES.countDocuments);
  const estJson = JSON.parse(OPERATION_TEMPLATES.estimatedDocumentCount);
  const distJson = JSON.parse(OPERATION_TEMPLATES.distinct);

  assert.ok(typeof findJson === "object" && findJson !== null);
  assert.ok(Array.isArray(aggJson), "Aggregate template must be an array of stages");
  assert.ok(aggJson.length > 0 && aggJson[0].$match !== undefined, "Aggregate template has $match");
  assert.ok(typeof countJson === "object" && countJson !== null);
  assert.deepStrictEqual(estJson, {}, "estimatedDocumentCount template must be empty object");
  assert.ok(typeof distJson.field === "string", "distinct template must have field property");
});

test("MongoWorkspace - Explain restriction to supported operations (find & aggregate only)", () => {
  // Supported
  assert.strictEqual(isExplainSupported("find"), true);
  assert.strictEqual(isExplainSupported("aggregate"), true);
  assert.strictEqual(getExplainDisabledReason("find"), null);
  assert.strictEqual(getExplainDisabledReason("aggregate"), null);

  // Unsupported operations must be explicitly rejected
  assert.strictEqual(isExplainSupported("countDocuments"), false);
  assert.strictEqual(isExplainSupported("estimatedDocumentCount"), false);
  assert.strictEqual(isExplainSupported("distinct"), false);

  assert.ok(getExplainDisabledReason("countDocuments")?.includes("only supported for find() and aggregate()"));
  assert.ok(getExplainDisabledReason("estimatedDocumentCount")?.includes("only supported for find() and aggregate()"));
  assert.ok(getExplainDisabledReason("distinct")?.includes("only supported for find() and aggregate()"));
});

test("Isolation Guarantee - Zero SQL execution services or hooks in MongoDB panels", () => {
  const workspacePath = path.resolve(process.cwd(), "src/features/mongodb/components/workspace/MongoWorkspacePanel.tsx");
  const aggregationPath = path.resolve(process.cwd(), "src/features/mongodb/components/aggregation/MongoAggregationPanel.tsx");

  const workspaceContent = fs.readFileSync(workspacePath, "utf-8");
  const aggregationContent = fs.readFileSync(aggregationPath, "utf-8");

  // Assert no SQL query execution or SQL workspace components are referenced
  assert.strictEqual(workspaceContent.includes("runQuery"), false, "MongoWorkspacePanel must not call SQL runQuery");
  assert.strictEqual(workspaceContent.includes("SQLWorkspacePanel"), false, "MongoWorkspacePanel must not import SQLWorkspacePanel");
  assert.strictEqual(workspaceContent.includes("useDatabaseDetails"), false, "MongoWorkspacePanel must not use SQL useDatabaseDetails");

  assert.strictEqual(aggregationContent.includes("runQuery"), false, "MongoAggregationPanel must not call SQL runQuery");
  assert.strictEqual(aggregationContent.includes("QueryBuilderPanel"), false, "MongoAggregationPanel must not import QueryBuilderPanel");
});
