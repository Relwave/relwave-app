/**
 * MongoDB Milestone 7 Phase 4 Stage 5 — History Table Component Tests
 *
 * Exercises:
 * - Search filtering (by collection name and operationId)
 * - Type dropdown filtering (all, import, export, insert, update, delete)
 * - Status dropdown filtering (all, active, completed, failed, cancelled, stale)
 * - Action buttons:
 *   - onCancel(id) for active operations
 *   - onCleanup(id) for export operations
 *   - onRetry(id) for unreachable async operations
 *   - onRemove(id)
 *   - onClearExpired() and disabled state when expiredCount === 0
 */

import { describe, it } from "node:test";
import assert from "node:assert/strict";
import React from "react";
import ReactDOMServer from "react-dom/server";
import {
  MongoBulkOperationsHistory,
  type MongoBulkOperationsHistoryProps,
} from "../components/bulk/MongoBulkOperationsHistory";
import type { BulkHistoryEntry } from "../types/bulk";

function renderWithFilters(
  props: MongoBulkOperationsHistoryProps,
  filters: { search?: string; type?: string; status?: string } = {},
): string {
  const internals = (React as any).__CLIENT_INTERNALS_DO_NOT_USE_OR_WARN_USERS_THEY_CANNOT_UPGRADE;
  function TestWrapper() {
    const origUseState = internals.H.useState;
    let stateIndex = 0;
    internals.H.useState = (initial: any) => {
      stateIndex++;
      if (stateIndex === 1) return [filters.search ?? initial, () => {}];
      if (stateIndex === 2) return [filters.type ?? initial, () => {}];
      if (stateIndex === 3) return [filters.status ?? initial, () => {}];
      return [initial, () => {}];
    };
    try {
      return MongoBulkOperationsHistory(props);
    } finally {
      internals.H.useState = origUseState;
    }
  }

  return ReactDOMServer.renderToStaticMarkup(React.createElement(TestWrapper));
}

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

const sampleOperations: BulkHistoryEntry[] = [
  {
    kind: "async",
    operationId: "op-import-active",
    dbId: "db-1",
    collection: "orders",
    type: "import",
    status: "in_progress",
    processedDocuments: 100,
    successfulDocuments: 90,
    failedDocuments: 10,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    expiresAt: new Date(Date.now() + 3600000).toISOString(),
  },
  {
    kind: "async",
    operationId: "op-export-done",
    dbId: "db-1",
    collection: "customers",
    type: "export",
    status: "completed",
    processedDocuments: 500,
    successfulDocuments: 500,
    failedDocuments: 0,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    expiresAt: new Date(Date.now() + 3600000).toISOString(),
  },
  {
    kind: "async",
    operationId: "op-unreachable-failed",
    dbId: "db-1",
    collection: "analytics",
    type: "export",
    status: "failed",
    isUnreachable: true,
    processedDocuments: 20,
    successfulDocuments: 0,
    failedDocuments: 20,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    expiresAt: new Date(Date.now() + 3600000).toISOString(),
  },
  {
    kind: "sync",
    id: "sync-mutation-1",
    dbId: "db-1",
    collection: "inventory",
    type: "insert",
    status: "completed",
    timestamp: new Date().toISOString(),
    insertedCount: 42,
  },
];

describe("MongoBulkOperationsHistory Component Tests", () => {
  it("renders status badges and operation details", () => {
    const html = renderWithFilters({
      operations: sampleOperations,
      expiredCount: 0,
    });

    assert.ok(html.includes("orders"));
    assert.ok(html.includes("customers"));
    assert.ok(html.includes("in_progress"));
    assert.ok(html.includes("completed"));
  });

  it("renders empty state message when operation list is empty", () => {
    const html = renderWithFilters({
      operations: [],
      expiredCount: 0,
    });

    assert.ok(html.includes("No bulk operations found"));
  });

  it("displays expired count in Clear Expired button", () => {
    const html = renderWithFilters({
      operations: [],
      onClearExpired: () => {},
      expiredCount: 3,
    });

    assert.ok(html.includes("Clear Expired (3)"));
  });

  it("search filtering filters rows by collection name and operationId", () => {
    // Filter by collection name 'orders'
    const htmlCol = renderWithFilters(
      { operations: sampleOperations, expiredCount: 0 },
      { search: "orders" },
    );
    assert.ok(htmlCol.includes("orders"));
    assert.ok(!htmlCol.includes("customers"));
    assert.ok(!htmlCol.includes("analytics"));

    // Filter by operationId 'op-export-done'
    const htmlId = renderWithFilters(
      { operations: sampleOperations, expiredCount: 0 },
      { search: "op-export-done" },
    );
    assert.ok(htmlId.includes("customers"));
    assert.ok(!htmlId.includes("orders"));
    assert.ok(!htmlId.includes("analytics"));
  });

  it("type dropdown filtering filters rows by type", () => {
    // Type: import
    const htmlImport = renderWithFilters(
      { operations: sampleOperations, expiredCount: 0 },
      { type: "import" },
    );
    assert.ok(htmlImport.includes("orders"));
    assert.ok(!htmlImport.includes("customers"));
    assert.ok(!htmlImport.includes("inventory"));

    // Type: export
    const htmlExport = renderWithFilters(
      { operations: sampleOperations, expiredCount: 0 },
      { type: "export" },
    );
    assert.ok(htmlExport.includes("customers"));
    assert.ok(htmlExport.includes("analytics"));
    assert.ok(!htmlExport.includes("orders"));

    // Type: insert
    const htmlInsert = renderWithFilters(
      { operations: sampleOperations, expiredCount: 0 },
      { type: "insert" },
    );
    assert.ok(htmlInsert.includes("inventory"));
    assert.ok(!htmlInsert.includes("orders"));
    assert.ok(!htmlInsert.includes("customers"));
  });

  it("status dropdown filtering filters rows by status", () => {
    // Status: active (matches pending, in_progress, running)
    const htmlActive = renderWithFilters(
      { operations: sampleOperations, expiredCount: 0 },
      { status: "active" },
    );
    assert.ok(htmlActive.includes("orders")); // in_progress
    assert.ok(!htmlActive.includes("customers")); // completed
    assert.ok(!htmlActive.includes("analytics")); // failed

    // Status: completed
    const htmlCompleted = renderWithFilters(
      { operations: sampleOperations, expiredCount: 0 },
      { status: "completed" },
    );
    assert.ok(htmlCompleted.includes("customers"));
    assert.ok(!htmlCompleted.includes("orders"));

    // Status: failed
    const htmlFailed = renderWithFilters(
      { operations: sampleOperations, expiredCount: 0 },
      { status: "failed" },
    );
    assert.ok(htmlFailed.includes("analytics"));
    assert.ok(!htmlFailed.includes("customers"));
  });

  it("action buttons invoke onCancel, onCleanup, onRetry, and onRemove callbacks", () => {
    const cancelled: string[] = [];
    const cleaned: string[] = [];
    const retried: string[] = [];
    const removed: string[] = [];

    let vdom: any;
    function Wrapper() {
      vdom = MongoBulkOperationsHistory({
        operations: sampleOperations,
        onCancel: (id) => cancelled.push(id),
        onCleanup: (id) => cleaned.push(id),
        onRetry: (id) => retried.push(id),
        onRemove: (id) => removed.push(id),
      });
      return null;
    }
    ReactDOMServer.renderToStaticMarkup(React.createElement(Wrapper));

    // Find and invoke Cancel button (active operation: op-import-active)
    const cancelBtns = findVdomNodes(vdom, (n) => n.props?.title === "Cancel");
    assert.ok(cancelBtns.length > 0);
    cancelBtns[0].props.onClick();
    assert.deepEqual(cancelled, ["op-import-active"]);

    // Find and invoke Clean temporary cache button (export operations)
    const cleanupBtns = findVdomNodes(vdom, (n) => n.props?.title === "Clean temporary cache");
    assert.ok(cleanupBtns.length > 0);
    cleanupBtns[0].props.onClick();
    assert.deepEqual(cleaned, ["op-export-done"]);

    // Find and invoke Retry connection button (unreachable operation: op-unreachable-failed)
    const retryBtns = findVdomNodes(vdom, (n) => n.props?.title === "Retry connection");
    assert.ok(retryBtns.length > 0);
    retryBtns[0].props.onClick();
    assert.deepEqual(retried, ["op-unreachable-failed"]);

    // Find and invoke Remove buttons
    const removeBtns = findVdomNodes(vdom, (n) => n.props?.title === "Remove from history");
    assert.ok(removeBtns.length > 0);
    removeBtns[0].props.onClick();
    assert.equal(removed.length, 1);
  });

  it("clear expired button invokes onClearExpired and is disabled when expiredCount === 0", () => {
    let clearExpiredCalled = false;

    // Test with expiredCount > 0
    let vdomEnabled: any;
    function WrapperEnabled() {
      vdomEnabled = MongoBulkOperationsHistory({
        operations: [],
        expiredCount: 4,
        onClearExpired: () => {
          clearExpiredCalled = true;
        },
      });
      return null;
    }
    ReactDOMServer.renderToStaticMarkup(React.createElement(WrapperEnabled));

    const clearBtn = findVdomNodes(
      vdomEnabled,
      (n) => n.props?.["data-testid"] === "clear-expired-button",
    );
    assert.equal(clearBtn.length, 1);
    assert.equal(clearBtn[0].props.disabled, false);
    clearBtn[0].props.onClick();
    assert.equal(clearExpiredCalled, true);

    // Test with expiredCount === 0
    let vdomDisabled: any;
    function WrapperDisabled() {
      vdomDisabled = MongoBulkOperationsHistory({
        operations: [],
        expiredCount: 0,
        onClearExpired: () => {},
      });
      return null;
    }
    ReactDOMServer.renderToStaticMarkup(React.createElement(WrapperDisabled));

    const disabledBtn = findVdomNodes(
      vdomDisabled,
      (n) => n.props?.["data-testid"] === "clear-expired-button",
    );
    assert.equal(disabledBtn.length, 1);
    assert.equal(disabledBtn[0].props.disabled, true);
  });
});
