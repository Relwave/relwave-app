/**
 * MongoDB Milestone 7 Phase 4 Stage 5 — Panel Component Tests
 *
 * Exercises:
 * - Panel header, metric cards, and launch buttons
 * - Modal triggers identifiers (panel-import-button, panel-export-button)
 * - Metric calculations (Total, Active, Completed, Failed / Cancelled)
 * - Active operations highlight card rendering and conditional visibility
 * - Delegated modal prop verification (cancelOnUnmount: false, externalPolling: true)
 */

import { describe, it } from "node:test";
import assert from "node:assert/strict";
import React from "react";
import ReactDOMServer from "react-dom/server";
import { MongoBulkOperationsPanel } from "../components/bulk/MongoBulkOperationsPanel";
import { defaultMongoBulkOperationsStore } from "../hooks/useMongoBulkOperationsStore";
import type { TrackedAsyncBulkOperation, TrackedSyncBulkMutation } from "../types/bulk";

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

describe("MongoBulkOperationsPanel Component Tests", () => {
  it("renders panel header, metric cards, and launch buttons with proper data-testids", () => {
    defaultMongoBulkOperationsStore.getSnapshot().resetStore();

    const html = ReactDOMServer.renderToStaticMarkup(
      React.createElement(MongoBulkOperationsPanel, {
        dbId: "db-demo",
        databaseName: "DemoDatabase",
        activeCollection: "users",
      }),
    );

    assert.ok(html.includes("Bulk Operations"));
    assert.ok(html.includes("DemoDatabase"));
    assert.ok(html.includes("Import Documents"));
    assert.ok(html.includes("Export Documents"));
    assert.ok(html.includes('data-testid="panel-import-button"'));
    assert.ok(html.includes('data-testid="panel-export-button"'));
    assert.ok(html.includes("Total Operations"));
    assert.ok(html.includes("Active"));
    assert.ok(html.includes("Completed"));
    assert.ok(html.includes("Failed / Cancelled"));
  });

  it("calculates summary metric cards accurately from store operations", () => {
    defaultMongoBulkOperationsStore.getSnapshot().resetStore();

    const now = new Date().toISOString();
    const expiry = new Date(Date.now() + 3600000).toISOString();

    // 1 pending async op
    const op1: TrackedAsyncBulkOperation = {
      kind: "async",
      operationId: "op-pending",
      dbId: "db-calc",
      collection: "col1",
      type: "import",
      status: "pending",
      processedDocuments: 0,
      successfulDocuments: 0,
      failedDocuments: 0,
      createdAt: now,
      updatedAt: now,
      expiresAt: expiry,
    };
    // 1 in_progress async op
    const op2: TrackedAsyncBulkOperation = {
      kind: "async",
      operationId: "op-active",
      dbId: "db-calc",
      collection: "col2",
      type: "export",
      status: "in_progress",
      processedDocuments: 50,
      successfulDocuments: 50,
      failedDocuments: 0,
      createdAt: now,
      updatedAt: now,
      expiresAt: expiry,
    };
    // 1 completed async op
    const op3: TrackedAsyncBulkOperation = {
      kind: "async",
      operationId: "op-completed",
      dbId: "db-calc",
      collection: "col3",
      type: "export",
      status: "completed",
      processedDocuments: 100,
      successfulDocuments: 100,
      failedDocuments: 0,
      createdAt: now,
      updatedAt: now,
      expiresAt: expiry,
    };
    // 1 failed async op
    const op4: TrackedAsyncBulkOperation = {
      kind: "async",
      operationId: "op-failed",
      dbId: "db-calc",
      collection: "col4",
      type: "export",
      status: "failed",
      processedDocuments: 10,
      successfulDocuments: 0,
      failedDocuments: 10,
      createdAt: now,
      updatedAt: now,
      expiresAt: expiry,
    };
    // 1 cancelled async op
    const op5: TrackedAsyncBulkOperation = {
      kind: "async",
      operationId: "op-cancelled",
      dbId: "db-calc",
      collection: "col5",
      type: "import",
      status: "cancelled",
      processedDocuments: 20,
      successfulDocuments: 20,
      failedDocuments: 0,
      createdAt: now,
      updatedAt: now,
      expiresAt: expiry,
    };
    // 1 stale async op
    const op6: TrackedAsyncBulkOperation = {
      kind: "async",
      operationId: "op-stale",
      dbId: "db-calc",
      collection: "col6",
      type: "export",
      status: "stale",
      processedDocuments: 5,
      successfulDocuments: 5,
      failedDocuments: 0,
      createdAt: now,
      updatedAt: now,
      expiresAt: expiry,
    };
    // 1 running sync mutation
    const op7: TrackedSyncBulkMutation = {
      kind: "sync",
      id: "sync-running",
      dbId: "db-calc",
      collection: "col7",
      type: "insert",
      status: "running",
      timestamp: now,
    };

    defaultMongoBulkOperationsStore.getSnapshot().registerAsyncOperation("db-calc", op1);
    defaultMongoBulkOperationsStore.getSnapshot().registerAsyncOperation("db-calc", op2);
    defaultMongoBulkOperationsStore.getSnapshot().registerAsyncOperation("db-calc", op3);
    defaultMongoBulkOperationsStore.getSnapshot().registerAsyncOperation("db-calc", op4);
    defaultMongoBulkOperationsStore.getSnapshot().registerAsyncOperation("db-calc", op5);
    defaultMongoBulkOperationsStore.getSnapshot().registerAsyncOperation("db-calc", op6);
    defaultMongoBulkOperationsStore.getSnapshot().registerSyncMutation("db-calc", op7);

    const html = ReactDOMServer.renderToStaticMarkup(
      React.createElement(MongoBulkOperationsPanel, {
        dbId: "db-calc",
        databaseName: "CalcDatabase",
        activeCollection: "col1",
      }),
    );

    // Total = 7
    assert.ok(html.includes('data-testid="metric-total">7</div>'));
    // Active = op-pending + op-active + sync-running = 3
    assert.ok(html.includes('data-testid="metric-active">3</div>'));
    // Completed = op-completed = 1
    assert.ok(html.includes('data-testid="metric-completed">1</div>'));
    // Failed/Cancelled = op-failed + op-cancelled + op-stale = 3
    assert.ok(html.includes('data-testid="metric-failed">3</div>'));

    defaultMongoBulkOperationsStore.getSnapshot().resetStore();
  });

  it("renders active operations highlight when active operations exist and hides section when none", () => {
    defaultMongoBulkOperationsStore.getSnapshot().resetStore();

    // Case 1: No active operations
    const htmlEmpty = ReactDOMServer.renderToStaticMarkup(
      React.createElement(MongoBulkOperationsPanel, {
        dbId: "db-highlight",
        databaseName: "EmptyDatabase",
      }),
    );
    assert.ok(!htmlEmpty.includes('data-testid="active-operations-highlight"'));

    // Case 2: Active operation present
    const activeOp: TrackedAsyncBulkOperation = {
      kind: "async",
      operationId: "op-active-highlight",
      dbId: "db-highlight",
      collection: "orders",
      type: "import",
      status: "in_progress",
      processedDocuments: 200,
      successfulDocuments: 150,
      failedDocuments: 0,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      expiresAt: new Date(Date.now() + 3600000).toISOString(),
    };
    defaultMongoBulkOperationsStore.getSnapshot().registerAsyncOperation("db-highlight", activeOp);

    const htmlActive = ReactDOMServer.renderToStaticMarkup(
      React.createElement(MongoBulkOperationsPanel, {
        dbId: "db-highlight",
        databaseName: "ActiveDatabase",
      }),
    );
    assert.ok(htmlActive.includes('data-testid="active-operations-highlight"'));
    assert.ok(htmlActive.includes("Active Operations (1)"));

    defaultMongoBulkOperationsStore.getSnapshot().resetStore();
  });

  it("passes correct Stage 5 delegated props to import and export dialogs", () => {
    let capturedVdom: any;
    function Wrapper() {
      capturedVdom = MongoBulkOperationsPanel({
        dbId: "db-delegated-props",
        databaseName: "PropDatabase",
        activeCollection: "inventory",
      });
      return null;
    }
    ReactDOMServer.renderToStaticMarkup(React.createElement(Wrapper));

    // Find import dialog and verify delegated cancelOnUnmount: false
    const importDialogs = findVdomNodes(
      capturedVdom,
      (n) => n.type?.name === "MongoBulkImportDialog",
    );
    assert.equal(importDialogs.length, 1);
    assert.equal(importDialogs[0].props.cancelOnUnmount, false);

    // Find export dialog and verify delegated cancelOnUnmount: false and externalPolling: true
    const exportDialogs = findVdomNodes(
      capturedVdom,
      (n) => n.type?.name === "MongoBulkExportDialog",
    );
    assert.equal(exportDialogs.length, 1);
    assert.equal(exportDialogs[0].props.cancelOnUnmount, false);
    assert.equal(exportDialogs[0].props.externalPolling, true);
  });
});
