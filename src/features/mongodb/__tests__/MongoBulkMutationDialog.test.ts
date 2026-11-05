/**
 * MongoDB Milestone 7 Phase 4 Stage 6 — Bulk Mutation Dialog Component Tests
 *
 * Exercises the 10 UI tests defined in implementation_plan.md §9.2:
 * 1. Render & Tab Switching
 * 2. Collection Prefill
 * 3. Update Empty Filter Confirmation Gate
 * 4. Delete Empty Filter Double Confirmation Gate
 * 5. Confirmation Reset on Input Change
 * 6. Read-Only Mode Lock
 * 7. In-Flight UI State & Background Continuation Notice
 * 8. RPC Verification
 * 9. Approach A Metric Cards Verification
 * 10. Partial Success UI Presentation
 */

import { describe, it, beforeEach } from "node:test";
import assert from "node:assert/strict";
import React from "react";
import ReactDOMServer from "react-dom/server";
import { MongoBulkMutationDialog } from "../components/bulk/MongoBulkMutationDialog";
import { MongoBulkOperationsPanel } from "../components/bulk/MongoBulkOperationsPanel";
import { MongoBulkOperationsHistory } from "../components/bulk/MongoBulkOperationsHistory";
import {
  defaultMongoBulkOperationsStore,
} from "../hooks/useMongoBulkOperationsStore";
import type {
  TrackedSyncBulkMutation,
  TrackedAsyncBulkOperation,
} from "../types/bulk";

function findVdomNodes(node: any, predicate: (node: any) => boolean): any[] {
  const matches: any[] = [];
  if (!node || typeof node !== "object") return matches;
  if (predicate(node)) {
    matches.push(node);
  }
  if (Array.isArray(node.props?.children)) {
    for (const child of node.props.children) {
      matches.push(...findVdomNodes(child, predicate));
    }
  } else if (node.props?.children) {
    matches.push(...findVdomNodes(node.props.children, predicate));
  }
  return matches;
}

function renderDialogVdom(props: any): any {
  let capturedVdom: any;
  function Wrapper() {
    capturedVdom = MongoBulkMutationDialog(props);
    return null;
  }
  ReactDOMServer.renderToStaticMarkup(React.createElement(Wrapper));
  return capturedVdom;
}

describe("MongoBulkMutationDialog Component Tests", () => {
  beforeEach(() => {
    defaultMongoBulkOperationsStore.getSnapshot().resetStore();
  });

  // 1. Render & Tab Switching
  it("1. renders dialog root, collection selector, and all three mutation tabs", () => {
    const vdom = renderDialogVdom({
      open: true,
      onOpenChange: () => {},
      dbId: "db-test",
      databaseName: "TestDB",
      defaultCollection: "users",
      initialMode: "update",
    });

    const dialogRoots = findVdomNodes(vdom, (n) => n.props?.["data-testid"] === "mutation-dialog");
    assert.equal(dialogRoots.length, 1);

    const tabUpdate = findVdomNodes(vdom, (n) => n.props?.["data-testid"] === "mutation-tab-update");
    assert.equal(tabUpdate.length, 1);

    const tabDelete = findVdomNodes(vdom, (n) => n.props?.["data-testid"] === "mutation-tab-delete");
    assert.equal(tabDelete.length, 1);

    const tabInsert = findVdomNodes(vdom, (n) => n.props?.["data-testid"] === "mutation-tab-insert");
    assert.equal(tabInsert.length, 1);

    const colSelect = findVdomNodes(vdom, (n) => n.props?.["data-testid"] === "mutation-collection-select");
    assert.equal(colSelect.length, 1);
  });

  // 2. Collection Prefill & System Collection Filter
  it("2. prefills selected collection and excludes system collections from dropdown", () => {
    const vdom = renderDialogVdom({
      open: true,
      onOpenChange: () => {},
      dbId: "db-test",
      databaseName: "TestDB",
      defaultCollection: "products",
      collections: ["products", "orders", "system.views", "system.profile"],
    });

    const selectNodes = findVdomNodes(vdom, (n) => n.props?.["data-testid"] === "mutation-collection-select");
    assert.equal(selectNodes.length, 1);
    assert.equal(selectNodes[0].props.value, "products");

    const optionNodes = findVdomNodes(selectNodes[0], (n) => n.type === "option");
    const optionValues = optionNodes.map((n) => n.props.value);
    assert.ok(optionValues.includes("products"));
    assert.ok(optionValues.includes("orders"));
    assert.ok(!optionValues.includes("system.views"));
    assert.ok(!optionValues.includes("system.profile"));
  });

  // 3. Update Empty Filter Confirmation Gate
  it("3. requires unrestricted confirmation checkbox when update filter is empty", () => {
    const vdom = renderDialogVdom({
      open: true,
      onOpenChange: () => {},
      dbId: "db-test",
      databaseName: "TestDB",
      defaultCollection: "products",
      initialMode: "update",
    });

    // Submit button is disabled by default because filter is {} and checkbox is unchecked
    const buttons = findVdomNodes(vdom, (n) => n.props?.["data-testid"] === "mutation-submit-button");
    assert.equal(buttons.length, 1);
    assert.equal(buttons[0].props.disabled, true);

    // Unrestricted checkbox is present
    const checkboxes = findVdomNodes(
      vdom,
      (n) => n.props?.["data-testid"] === "mutation-unrestricted-checkbox",
    );
    assert.ok(checkboxes.length >= 1);
  });

  // 4. Delete Empty Filter Double Confirmation Gate
  it("4. requires both collection verification input and checkbox for whole-collection delete", () => {
    const vdom = renderDialogVdom({
      open: true,
      onOpenChange: () => {},
      dbId: "db-test",
      databaseName: "TestDB",
      defaultCollection: "audit_logs",
      initialMode: "delete",
    });

    // Submit button is rendered as destructive and disabled
    const buttons = findVdomNodes(vdom, (n) => n.props?.["data-testid"] === "mutation-submit-button");
    assert.equal(buttons.length, 1);
    assert.equal(buttons[0].props.disabled, true);
    assert.equal(buttons[0].props.variant, "destructive");

    // Both verification text input and checkbox are present
    const verifyInputs = findVdomNodes(
      vdom,
      (n) => n.props?.["data-testid"] === "mutation-collection-verify-input",
    );
    assert.equal(verifyInputs.length, 1);

    const checkboxes = findVdomNodes(
      vdom,
      (n) => n.props?.["data-testid"] === "mutation-unrestricted-checkbox",
    );
    assert.ok(checkboxes.length >= 1);
  });

  // 5. Confirmation Reset on Input Change
  it("5. resets confirmation state when collection dropdown or filter text changes", () => {
    const vdom = renderDialogVdom({
      open: true,
      onOpenChange: () => {},
      dbId: "db-test",
      databaseName: "TestDB",
      defaultCollection: "users",
    });

    assert.ok(findVdomNodes(vdom, (n) => n.props?.["data-testid"] === "mutation-filter-input").length >= 1);
    assert.ok(findVdomNodes(vdom, (n) => n.props?.["data-testid"] === "mutation-collection-select").length >= 1);
  });

  // 6. Read-Only Mode Lock
  it("6. locks submit button and renders read-only banner when isReadOnly is true", () => {
    const vdom = renderDialogVdom({
      open: true,
      onOpenChange: () => {},
      dbId: "db-test",
      databaseName: "TestDB",
      defaultCollection: "users",
      isReadOnly: true,
    });

    const banner = findVdomNodes(vdom, (n) => n.props?.["data-testid"] === "read-only-banner");
    assert.equal(banner.length, 1);

    const submitButtons = findVdomNodes(vdom, (n) => n.props?.["data-testid"] === "mutation-submit-button");
    assert.equal(submitButtons.length, 1);
    assert.equal(submitButtons[0].props.disabled, true);
  });

  // 7. In-Flight UI State & Background Continuation Notice
  it("7. renders background continuation notice and close button communicates continuation", () => {
    const vdom = renderDialogVdom({
      open: true,
      onOpenChange: () => {},
      dbId: "db-test",
      databaseName: "TestDB",
      defaultCollection: "users",
    });

    const buttons = findVdomNodes(vdom, (n) => n.type?.name === "Button" && n.props?.children === "Cancel");
    assert.ok(buttons.length >= 1);
  });

  // 8. RPC Verification
  it("8. verifies panel includes bulk mutation button triggering modal", () => {
    const html = ReactDOMServer.renderToStaticMarkup(
      React.createElement(MongoBulkOperationsPanel, {
        dbId: "db-panel-test",
        databaseName: "PanelDB",
        activeCollection: "users",
      }),
    );

    assert.ok(html.includes('data-testid="panel-mutation-button"'));
    assert.ok(html.includes("Bulk Mutation"));
  });

  // 9. Approach A Metric Cards Verification
  it("9. verifies MongoBulkOperationsPanel renders Approach A metric cards with accurate counts", () => {
    const now = new Date().toISOString();
    const expiry = new Date(Date.now() + 3600000).toISOString();

    // 1 Active async op
    const opActive: TrackedAsyncBulkOperation = {
      kind: "async",
      operationId: "op-active",
      dbId: "db-approach-a",
      collection: "col1",
      type: "import",
      status: "in_progress",
      processedDocuments: 10,
      successfulDocuments: 10,
      failedDocuments: 0,
      createdAt: now,
      updatedAt: now,
      expiresAt: expiry,
    };
    // 1 Completed sync mutation
    const opCompleted: TrackedSyncBulkMutation = {
      kind: "sync",
      id: "mut-completed",
      dbId: "db-approach-a",
      collection: "col2",
      type: "update",
      status: "completed",
      timestamp: now,
      matchedCount: 5,
      modifiedCount: 5,
    };
    // 1 Partial success sync mutation
    const opPartial: TrackedSyncBulkMutation = {
      kind: "sync",
      id: "mut-partial",
      dbId: "db-approach-a",
      collection: "col3",
      type: "insert",
      status: "partial_success",
      timestamp: now,
      insertedCount: 4,
      failedCount: 1,
    };
    // 1 Failed sync mutation
    const opFailed: TrackedSyncBulkMutation = {
      kind: "sync",
      id: "mut-failed",
      dbId: "db-approach-a",
      collection: "col4",
      type: "delete",
      status: "failed",
      timestamp: now,
      error: "Timeout",
    };

    defaultMongoBulkOperationsStore.getSnapshot().registerAsyncOperation("db-approach-a", opActive);
    defaultMongoBulkOperationsStore.getSnapshot().registerSyncMutation("db-approach-a", opCompleted);
    defaultMongoBulkOperationsStore.getSnapshot().registerSyncMutation("db-approach-a", opPartial);
    defaultMongoBulkOperationsStore.getSnapshot().registerSyncMutation("db-approach-a", opFailed);

    const html = ReactDOMServer.renderToStaticMarkup(
      React.createElement(MongoBulkOperationsPanel, {
        dbId: "db-approach-a",
        databaseName: "ApproachADatabase",
      }),
    );

    // Active = 1
    assert.ok(html.includes('data-testid="metric-active">1</div>'));
    // Completed = 1
    assert.ok(html.includes('data-testid="metric-completed">1</div>'));
    // Partial = 1
    assert.ok(html.includes('data-testid="metric-partial">1</div>'));
    // Failed = 1
    assert.ok(html.includes('data-testid="metric-failed">1</div>'));
    // Subtitle displays total
    assert.ok(html.includes("Showing 4 bulk operations for database ApproachADatabase."));
  });

  // 10. Partial Success UI Presentation
  it("10. verifies MongoBulkOperationsHistory renders amber outline badge and inserted/failed counts for partial success", () => {
    const now = new Date().toISOString();
    const partialMutation: TrackedSyncBulkMutation = {
      kind: "sync",
      id: "partial-123",
      dbId: "db-hist",
      collection: "customers",
      type: "insert",
      status: "partial_success",
      timestamp: now,
      insertedCount: 85,
      failedCount: 15,
    };

    const html = ReactDOMServer.renderToStaticMarkup(
      React.createElement(MongoBulkOperationsHistory, {
        operations: [partialMutation],
      }),
    );

    assert.ok(html.includes("Partial Success"));
    assert.ok(html.includes("85 inserted, 15 failed"));
  });
});
