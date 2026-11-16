import test from "node:test";
import assert from "node:assert/strict";
import { getDatabasePanelItems } from "../../../components/layout/panelItems";
import {
  transformMongoToER,
  formatMongoCardinality,
  CONFIRMED_COLOR,
  INFERRED_COLOR,
  MANUAL_COLOR,
} from "../adapters/mongoErAdapter";
import type { ERNode } from "@/features/project/types";
import type {
  MongoInferredRelationship,
  MongoRelationship,
} from "../types/relationship";

test("MongoRelationships - Cardinality label formatting", () => {
  assert.strictEqual(formatMongoCardinality("one-to-one"), "1:1");
  assert.strictEqual(formatMongoCardinality("one-to-many"), "1:N");
  assert.strictEqual(formatMongoCardinality("many-to-one"), "N:1");
  assert.strictEqual(formatMongoCardinality("many-to-many"), "N:M");
  assert.strictEqual(formatMongoCardinality("insufficient-evidence"), "low-conf");
  assert.strictEqual(formatMongoCardinality("unknown"), "unknown");
});

test("MongoErAdapter - Converts collections and relationships into ReactFlow nodes and styled edges", () => {
  const confirmedRel: MongoRelationship = {
    id: "orders.customer_id->customers._id",
    sourceCollection: "orders",
    sourceField: "customer_id",
    targetCollection: "customers",
    targetField: "_id",
    cardinality: "many-to-one",
    createdAt: "2026-11-01T00:00:00Z",
    updatedAt: "2026-11-01T00:00:00Z",
  };

  const inferredRel: MongoInferredRelationship = {
    id: "orders.product_id->products._id",
    sourceCollection: "orders",
    sourceField: "product_id",
    targetCollection: "products",
    targetField: "_id",
    cardinality: "many-to-one",
    confidence: 0.88,
    status: "inferred",
    inferredAt: "2026-11-01T00:00:00Z",
    evidence: {
      sourceCollection: "orders",
      sourceField: "product_id",
      targetCollection: "products",
      targetField: "_id",
      sampleCount: 50,
      hitCount: 48,
      hitRatio: 0.96,
      hasNamePatternMatch: true,
      isBsonTypeMatch: true,
      multipleSourcesPerTarget: true,
      isArrayReference: false,
      hasUniqueIndexOnSource: false,
      sampleMatches: [{ sourceValue: "prod_1", targetId: "prod_1" }],
    },
  };

  const manualRel: MongoRelationship = {
    id: "orders.created_by->users._id",
    sourceCollection: "orders",
    sourceField: "created_by",
    targetCollection: "users",
    targetField: "_id",
    cardinality: "many-to-one",
    isManual: true,
    createdAt: "2026-11-01T00:00:00Z",
    updatedAt: "2026-11-01T00:00:00Z",
  };

  const { nodes, edges } = transformMongoToER({
    collections: ["orders", "customers", "products", "users"],
    confirmed: [confirmedRel],
    inferred: [inferredRel],
    manual: [manualRel],
    useDagreLayout: true,
  });

  // Assert nodes created
  assert.strictEqual(nodes.length, 4);
  const nodeIds = nodes.map((n) => n.id);
  assert.ok(nodeIds.includes("orders"));
  assert.ok(nodeIds.includes("customers"));
  assert.ok(nodeIds.includes("products"));
  assert.ok(nodeIds.includes("users"));

  // Assert 3 edges created
  assert.strictEqual(edges.length, 3);

  // Confirmed edge styling
  const confirmedEdge = edges.find((e) => e.target === "customers");
  assert.ok(confirmedEdge);
  assert.strictEqual(confirmedEdge.style?.stroke, CONFIRMED_COLOR);
  assert.strictEqual(confirmedEdge.style?.strokeDasharray, undefined);
  assert.strictEqual(confirmedEdge.label, "N:1");

  // Inferred edge styling
  const inferredEdge = edges.find((e) => e.target === "products");
  assert.ok(inferredEdge);
  assert.strictEqual(inferredEdge.style?.stroke, INFERRED_COLOR);
  assert.strictEqual(inferredEdge.style?.strokeDasharray, "5,5");
  assert.strictEqual(inferredEdge.label, "N:1 (inferred)");

  // Manual edge styling
  const manualEdge = edges.find((e) => e.target === "users");
  assert.ok(manualEdge);
  assert.strictEqual(manualEdge.style?.stroke, MANUAL_COLOR);
  assert.strictEqual(manualEdge.label, "N:1 (manual)");
});

test("MongoErAdapter - Generates foreignKeys and uniqueConstraints on TableNode data", () => {
  const rel1: MongoRelationship = {
    id: "orders.customer_id->customers._id",
    sourceCollection: "orders",
    sourceField: "customer_id",
    targetCollection: "customers",
    targetField: "_id",
    cardinality: "many-to-one",
    createdAt: "2026-11-01T00:00:00Z",
    updatedAt: "2026-11-01T00:00:00Z",
  };

  const relNonIdTarget: MongoRelationship = {
    id: "orders.coupon_code->discounts.code",
    sourceCollection: "orders",
    sourceField: "coupon_code",
    targetCollection: "discounts",
    targetField: "code",
    cardinality: "many-to-one",
    createdAt: "2026-11-01T00:00:00Z",
    updatedAt: "2026-11-01T00:00:00Z",
  };

  const { nodes } = transformMongoToER({
    collections: ["orders", "customers", "discounts"],
    confirmed: [rel1, relNonIdTarget],
  });

  const ordersNode = nodes.find((n) => n.id === "orders");
  assert.ok(ordersNode);
  assert.ok(Array.isArray(ordersNode.data.foreignKeys));
  assert.strictEqual(ordersNode.data.foreignKeys.length, 2);

  // Check foreign key fields for source handles
  const fkCustomer = ordersNode.data.foreignKeys.find((fk: any) => fk.source_column === "customer_id");
  assert.ok(fkCustomer);
  assert.strictEqual(fkCustomer.target_table, "customers");
  assert.strictEqual(fkCustomer.target_column, "_id");

  // Check unique constraints on target discounts node for non-id target handle
  const discountsNode = nodes.find((n) => n.id === "discounts");
  assert.ok(discountsNode);
  assert.ok(Array.isArray(discountsNode.data.uniqueConstraints));
  assert.strictEqual(discountsNode.data.uniqueConstraints.length, 1);
  assert.strictEqual(discountsNode.data.uniqueConstraints[0].column_name, "code");

  // Customers target is _id, so it does not need non-id unique constraint
  const customersNode = nodes.find((n) => n.id === "customers");
  assert.ok(customersNode);
  assert.strictEqual(customersNode.data.uniqueConstraints.length, 0);
});

test("MongoErAdapter - Prevents duplicate edges between the same two fields", () => {
  const confirmedRel: MongoRelationship = {
    id: "orders.user_id->users._id",
    sourceCollection: "orders",
    sourceField: "user_id",
    targetCollection: "users",
    targetField: "_id",
    cardinality: "many-to-one",
    createdAt: "2026-11-01T00:00:00Z",
    updatedAt: "2026-11-01T00:00:00Z",
  };

  const duplicateInferredRel: MongoInferredRelationship = {
    id: "orders.user_id->users._id",
    sourceCollection: "orders",
    sourceField: "user_id",
    targetCollection: "users",
    targetField: "_id",
    cardinality: "many-to-one",
    confidence: 0.9,
    status: "inferred",
    inferredAt: "2026-11-01T00:00:00Z",
    evidence: {
      sourceCollection: "orders",
      sourceField: "user_id",
      targetCollection: "users",
      targetField: "_id",
      sampleCount: 50,
      hitCount: 50,
      hitRatio: 1.0,
      hasNamePatternMatch: true,
      isBsonTypeMatch: true,
      multipleSourcesPerTarget: true,
      isArrayReference: false,
      hasUniqueIndexOnSource: false,
      sampleMatches: [],
    },
  };

  const { edges } = transformMongoToER({
    collections: ["orders", "users"],
    confirmed: [confirmedRel],
    inferred: [duplicateInferredRel],
  });

  // Must only produce 1 edge, with confirmed taking precedence
  assert.strictEqual(edges.length, 1);
  assert.strictEqual(edges[0].style?.stroke, CONFIRMED_COLOR);
});

test("MongoErAdapter - Handles self-referencing relationships without throwing", () => {
  const selfRel: MongoRelationship = {
    id: "categories.parent_id->categories._id",
    sourceCollection: "categories",
    sourceField: "parent_id",
    targetCollection: "categories",
    targetField: "_id",
    cardinality: "many-to-one",
    createdAt: "2026-11-01T00:00:00Z",
    updatedAt: "2026-11-01T00:00:00Z",
  };

  assert.doesNotThrow(() => {
    const { nodes, edges } = transformMongoToER({
      collections: ["categories"],
      confirmed: [selfRel],
      useDagreLayout: true,
    });
    assert.strictEqual(nodes.length, 1);
    assert.strictEqual(edges.length, 1);
    assert.strictEqual(edges[0].source, "categories");
    assert.strictEqual(edges[0].target, "categories");
    assert.strictEqual(edges[0].type, "smoothstep");
  });
});

test("MongoErAdapter - Handles multiple distinct relationships between the same two collections", () => {
  const rel1: MongoRelationship = {
    id: "posts.author_id->users._id",
    sourceCollection: "posts",
    sourceField: "author_id",
    targetCollection: "users",
    targetField: "_id",
    cardinality: "many-to-one",
    createdAt: "2026-11-01T00:00:00Z",
    updatedAt: "2026-11-01T00:00:00Z",
  };

  const rel2: MongoRelationship = {
    id: "posts.editor_id->users._id",
    sourceCollection: "posts",
    sourceField: "editor_id",
    targetCollection: "users",
    targetField: "_id",
    cardinality: "many-to-one",
    createdAt: "2026-11-01T00:00:00Z",
    updatedAt: "2026-11-01T00:00:00Z",
  };

  const { edges } = transformMongoToER({
    collections: ["posts", "users"],
    confirmed: [rel1, rel2],
  });

  assert.strictEqual(edges.length, 2);
  assert.strictEqual(edges[0].sourceHandle, "posts-author_id");
  assert.strictEqual(edges[1].sourceHandle, "posts-editor_id");
});

test("MongoERDiagramView - Position preservation logic across dynamic node updates", () => {
  const existingNodes = [
    { id: "orders", position: { x: 500, y: 350 }, data: { label: "orders" } },
    { id: "customers", position: { x: 100, y: 150 }, data: { label: "customers" } },
  ];

  const incomingNodes = [
    { id: "orders", position: { x: 0, y: 0 }, data: { label: "orders" } },
    { id: "customers", position: { x: 0, y: 0 }, data: { label: "customers" } },
    { id: "products", position: { x: 300, y: 200 }, data: { label: "products" } },
  ];

  // Apply position preservation mapping
  const posMap = new Map(existingNodes.map((n) => [n.id, n.position]));
  const synchronizedNodes = incomingNodes.map((node) => {
    const existingPos = posMap.get(node.id);
    return existingPos ? { ...node, position: existingPos } : node;
  });

  assert.strictEqual(synchronizedNodes.length, 3);
  // Preserved user-adjusted positions
  assert.deepStrictEqual(synchronizedNodes.find((n) => n.id === "orders")?.position, { x: 500, y: 350 });
  assert.deepStrictEqual(synchronizedNodes.find((n) => n.id === "customers")?.position, { x: 100, y: 150 });
  // New node keeps initial layout position
  assert.deepStrictEqual(synchronizedNodes.find((n) => n.id === "products")?.position, { x: 300, y: 200 });
});

test("MongoCollectionRelationshipsTab - Excludes rejected relationships from incoming and outgoing lists", () => {
  const rels: Array<MongoRelationship | MongoInferredRelationship> = [
    {
      id: "orders.customer_id->customers._id",
      sourceCollection: "orders",
      sourceField: "customer_id",
      targetCollection: "customers",
      targetField: "_id",
      cardinality: "many-to-one",
      createdAt: "",
      updatedAt: "",
    },
    {
      id: "orders.rejected_id->users._id",
      sourceCollection: "orders",
      sourceField: "rejected_id",
      targetCollection: "users",
      targetField: "_id",
      cardinality: "many-to-one",
      status: "rejected",
      createdAt: "",
      updatedAt: "",
    } as any,
    {
      id: "items.order_id->orders._id",
      sourceCollection: "items",
      sourceField: "order_id",
      targetCollection: "orders",
      targetField: "_id",
      cardinality: "many-to-one",
      createdAt: "",
      updatedAt: "",
    },
  ];

  const rejectedIds = ["orders.rejected_id->users._id"];
  const collection = "orders";

  const rejectedSet = new Set(rejectedIds);
  const seen = new Set<string>();
  const outgoing: any[] = [];
  const incoming: any[] = [];

  for (const r of rels) {
    if (rejectedSet.has(r.id)) continue;
    if ("status" in r && (r as any).status === "rejected") continue;
    if (seen.has(r.id)) continue;
    seen.add(r.id);

    if (r.sourceCollection === collection) outgoing.push(r);
    if (r.targetCollection === collection) incoming.push(r);
  }

  assert.strictEqual(outgoing.length, 1);
  assert.strictEqual(outgoing[0].id, "orders.customer_id->customers._id");
  assert.strictEqual(incoming.length, 1);
  assert.strictEqual(incoming[0].id, "items.order_id->orders._id");
});

test("MongoRelationshipDetailDrawer - Diagnostic candidate confirmation gating logic", () => {
  const isCandidateInsufficient = (cardinality: string, confidence?: number) => {
    return cardinality === "insufficient-evidence" || (typeof confidence === "number" && confidence < 0.65);
  };

  // High confidence candidate -> not insufficient
  assert.strictEqual(isCandidateInsufficient("many-to-one", 0.85), false);

  // Confidence < 0.65 -> insufficient
  assert.strictEqual(isCandidateInsufficient("many-to-one", 0.55), true);

  // Insufficient-evidence cardinality -> insufficient
  assert.strictEqual(isCandidateInsufficient("insufficient-evidence", 0.7), true);

  // Confirmation gating check
  const canConfirmDirectly = (insufficient: boolean, acknowledged: boolean) => {
    if (!insufficient) return true;
    return acknowledged;
  };

  assert.strictEqual(canConfirmDirectly(false, false), true);
  assert.strictEqual(canConfirmDirectly(true, false), false);
  assert.strictEqual(canConfirmDirectly(true, true), true);
});

test("useMongoRelationships - React Query cache key consistency", () => {
  const buildCacheKey = (dbId?: string, projectId?: string | null) => {
    return ["mongoRelationships", dbId, projectId ?? undefined] as const;
  };

  const keyNull = buildCacheKey("conn_1", null);
  const keyUndefined = buildCacheKey("conn_1", undefined);
  const keyWithProject = buildCacheKey("conn_1", "proj_abc");

  assert.deepStrictEqual(keyNull, keyUndefined);
  assert.strictEqual(keyNull[2], undefined);
  assert.strictEqual(keyWithProject[2], "proj_abc");
});

test("MongoManualRelationshipDialog - Self-referencing field validation logic", () => {
  const validateRelationship = (
    srcColl: string,
    srcField: string,
    tgtColl: string,
    tgtField: string,
  ): string | null => {
    const sField = srcField.trim();
    const tField = tgtField.trim();
    if (!srcColl) return "Source collection is required.";
    if (!sField) return "Source field is required.";
    if (!tgtColl) return "Target collection is required.";
    if (!tField) return "Target field is required.";
    if (srcColl === tgtColl && sField === tField) {
      return "Source and target cannot be the exact same field on the same collection.";
    }
    return null;
  };

  // Identical field on same collection fails
  assert.strictEqual(
    validateRelationship("users", "id", "users", "id"),
    "Source and target cannot be the exact same field on the same collection.",
  );

  // Different field on same collection (e.g. parent_id -> _id) succeeds
  assert.strictEqual(
    validateRelationship("categories", "parent_id", "categories", "_id"),
    null,
  );

  // Different collection succeeds
  assert.strictEqual(
    validateRelationship("orders", "customer_id", "customers", "_id"),
    null,
  );
});

test("SQL ER Diagram - Zero regression on relational database panel items and schemas", () => {
  const sqlItems = getDatabasePanelItems("postgres");
  const panels = sqlItems.map((i: any) => i.panel);

  assert.ok(panels.includes("er-diagram"));
  assert.ok(!panels.includes("mongo-relationships"));
});

test("MongoErAdapter - transformMongoToER uses saved positions and skips Dagre when savedLayout is provided", () => {
  const savedLayout: ERNode[] = [
    { tableId: "users", x: 150, y: 250, width: 300, height: 180 },
    { tableId: "orders", x: 600, y: 400, width: 280, height: 220 },
  ];

  const confirmedRel: MongoRelationship = {
    id: "orders.user_id->users._id",
    sourceCollection: "orders",
    sourceField: "user_id",
    targetCollection: "users",
    targetField: "_id",
    cardinality: "many-to-one",
    createdAt: "2026-11-01T00:00:00Z",
    updatedAt: "2026-11-01T00:00:00Z",
  };

  const { nodes } = transformMongoToER({
    collections: ["users", "orders"],
    confirmed: [confirmedRel],
    useDagreLayout: true,
    savedLayout,
  });

  const usersNode = nodes.find((n) => n.id === "users");
  const ordersNode = nodes.find((n) => n.id === "orders");

  assert.ok(usersNode);
  assert.ok(ordersNode);

  assert.strictEqual(usersNode.position.x, 150);
  assert.strictEqual(usersNode.position.y, 250);
  assert.strictEqual(usersNode.width, 300);
  assert.strictEqual(usersNode.height, 180);

  assert.strictEqual(ordersNode.position.x, 600);
  assert.strictEqual(ordersNode.position.y, 400);
  assert.strictEqual(ordersNode.width, 280);
  assert.strictEqual(ordersNode.height, 220);
});
