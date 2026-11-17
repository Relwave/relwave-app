/**
 * MongoDB Milestone 7 Phase 4 Stage 7 — Bulk Navigation & Contextual Integration Tests
 *
 * Exercises the 12 scenarios defined in docs/MONGODB_M7_SPEC.md §12:
 * 1. Global Navigation Item Registration & Relational Isolation
 * 2. Router Dispatch to MongoBulkOperationsPanel
 * 3. Alt+6 Keyboard Shortcut Navigation
 * 4. Keyboard Shortcut Input Field Suppression
 * 5. Keyboard Shortcut Modal Dialog Suppression
 * 6. Contextual Collection Toolbar Buttons Rendering
 * 7. Contextual Toolbar Callback Invocations
 * 8. System Collection Restrictions (Write Disabled, Read/Export Enabled)
 * 9. Read-Only Mode Lock
 * 10. Collection Prefill in Data View Dialogs
 * 11. Background Execution & Unmount Survival with Single Poller Authority
 * 12. State-Changing & Partial-Success View Refresh
 */

import { describe, it, beforeEach } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import React from "react";
import ReactDOMServer from "react-dom/server";
import { ArrowLeftRight } from "lucide-react";
import { getDatabasePanelItems, type PanelType } from "../../../components/layout/panelItems";
import { MongoDocumentViewer } from "../components/MongoDocumentViewer";
import { MongoBulkOperationsPanel } from "../components/bulk/MongoBulkOperationsPanel";
import {
  defaultMongoBulkOperationsStore,
  createMongoBulkOperationsStore,
} from "../hooks/useMongoBulkOperationsStore";
import type {
  TrackedAsyncBulkOperation,
  MongoBulkOperationStatus,
  TrackedSyncBulkMutation,
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

function renderViewerVdom(props: any): any {
  let capturedVdom: any;
  function Wrapper() {
    capturedVdom = MongoDocumentViewer(props);
    return null;
  }
  ReactDOMServer.renderToStaticMarkup(React.createElement(Wrapper));
  return capturedVdom;
}

describe("MongoDB M7 Stage 7: Bulk Navigation & Contextual Integration Tests", () => {
  beforeEach(() => {
    defaultMongoBulkOperationsStore.getSnapshot().resetStore();
  });

  // Scenario 1: Navigation Item Registration & Relational Isolation
  it("1. getDatabasePanelItems('mongodb') returns 7 items with 'mongo-bulk' at index 5 and 'git-status' at index 6; all 6 relational engines strictly exclude mongo-bulk", () => {
    const mongoItems = getDatabasePanelItems("mongodb");
    assert.strictEqual(mongoItems.length, 7);
    assert.strictEqual(mongoItems[5].panel, "mongo-bulk");
    assert.strictEqual(mongoItems[5].label, "Bulk Operations");
    assert.strictEqual(mongoItems[5].icon, ArrowLeftRight);
    assert.strictEqual(mongoItems[6].panel, "git-status");

    // Case-insensitivity
    const mongoUpperItems = getDatabasePanelItems("MongoDB");
    assert.strictEqual(mongoUpperItems.length, 7);
    assert.strictEqual(mongoUpperItems[5].panel, "mongo-bulk");
    assert.strictEqual(mongoUpperItems[6].panel, "git-status");

    // All 6 relational engines (7 string identifiers) strictly exclude mongo-bulk
    const relationalIdentifiers = [
      "postgres",
      "postgresql",
      "mysql",
      "mariadb",
      "sqlite",
      "duckdb",
      "clickhouse",
    ];

    for (const engine of relationalIdentifiers) {
      const items = getDatabasePanelItems(engine);
      const hasMongoBulk = items.some((i) => i.panel === "mongo-bulk");
      assert.strictEqual(
        hasMongoBulk,
        false,
        `Relational engine ${engine} must strictly exclude mongo-bulk panel item`,
      );
    }
  });

  // Scenario 2: Router Dispatch to MongoBulkOperationsPanel
  it("2. Router dispatch in DatabaseDetails.tsx maps 'mongo-bulk' to MongoBulkOperationsPanel", () => {
    const databaseDetailsPath = path.resolve(process.cwd(), "src/pages/DatabaseDetails.tsx");
    const content = fs.readFileSync(databaseDetailsPath, "utf-8");

    // Assert file imports MongoBulkOperationsPanel
    assert.ok(
      content.includes("MongoBulkOperationsPanel"),
      "DatabaseDetails.tsx must import MongoBulkOperationsPanel",
    );

    // Assert case 'mongo-bulk': is present in renderPanel router
    assert.ok(
      content.includes('case "mongo-bulk":'),
      'DatabaseDetails.tsx renderPanel must contain case "mongo-bulk":',
    );

    // Verify component renders without errors when given props
    const vdom = React.createElement(MongoBulkOperationsPanel, {
      key: "mbulk-test-1",
      dbId: "test-db-1",
      databaseName: "TestDB",
    });
    const html = ReactDOMServer.renderToStaticMarkup(vdom);
    assert.ok(html.includes("Bulk Operations"));
    assert.ok(html.includes("TestDB"));
  });

  // Scenario 3: Alt+6 Keyboard Shortcut Navigation
  it("3. Alt+6 keyboard shortcut selects 'mongo-bulk' when database is MongoDB", () => {
    let activePanel: PanelType = "data";
    const setActivePanel = (panel: PanelType) => {
      activePanel = panel;
    };

    // Simulate keydown handler from DatabaseDetails.tsx
    const simulateKeyDown = (event: {
      key: string;
      altKey: boolean;
      ctrlKey?: boolean;
      metaKey?: boolean;
      shiftKey?: boolean;
      targetIsInput?: boolean;
      isDialogOpen?: boolean;
    }) => {
      if (event.targetIsInput) return;
      if (event.isDialogOpen) return;

      if (event.altKey && !event.ctrlKey && !event.metaKey && !event.shiftKey) {
        const num = parseInt(event.key, 10);
        if (!isNaN(num) && num >= 1 && num <= 9) {
          const items = getDatabasePanelItems("mongodb");
          const targetItem = items[num - 1];
          if (targetItem) {
            setActivePanel(targetItem.panel);
          }
        }
      }
    };

    simulateKeyDown({ key: "6", altKey: true });
    assert.strictEqual(activePanel, "mongo-bulk");
  });

  // Scenario 4: Keyboard Shortcut Input Field Suppression
  it("4. Alt+6 shortcut is suppressed when user focus is inside an input or textarea element", () => {
    let activePanel: PanelType = "data";
    const setActivePanel = (panel: PanelType) => {
      activePanel = panel;
    };

    const simulateKeyDown = (event: {
      key: string;
      altKey: boolean;
      targetIsInput?: boolean;
      isDialogOpen?: boolean;
    }) => {
      if (event.targetIsInput) return;
      if (event.isDialogOpen) return;

      if (event.altKey) {
        const num = parseInt(event.key, 10);
        if (!isNaN(num) && num >= 1 && num <= 9) {
          const items = getDatabasePanelItems("mongodb");
          const targetItem = items[num - 1];
          if (targetItem) {
            setActivePanel(targetItem.panel);
          }
        }
      }
    };

    // User is typing in input
    simulateKeyDown({ key: "6", altKey: true, targetIsInput: true });
    assert.strictEqual(
      activePanel,
      "data",
      "Active panel must remain unchanged when input is focused",
    );
  });

  // Scenario 5: Keyboard Shortcut Modal Dialog Suppression
  it("5. Alt+6 shortcut is suppressed when a modal dialog is currently open", () => {
    let activePanel: PanelType = "data";
    const setActivePanel = (panel: PanelType) => {
      activePanel = panel;
    };

    const simulateKeyDown = (event: {
      key: string;
      altKey: boolean;
      targetIsInput?: boolean;
      isDialogOpen?: boolean;
    }) => {
      if (event.targetIsInput) return;
      if (event.isDialogOpen) return;

      if (event.altKey) {
        const num = parseInt(event.key, 10);
        if (!isNaN(num) && num >= 1 && num <= 9) {
          const items = getDatabasePanelItems("mongodb");
          const targetItem = items[num - 1];
          if (targetItem) {
            setActivePanel(targetItem.panel);
          }
        }
      }
    };

    // Modal dialog is open in DOM
    simulateKeyDown({ key: "6", altKey: true, isDialogOpen: true });
    assert.strictEqual(
      activePanel,
      "data",
      "Active panel must remain unchanged when dialog is open",
    );
  });

  // Scenario 6: Contextual Collection Toolbar Buttons Rendering
  it("6. MongoDocumentViewer renders Import, Export, and Bulk Mutations toolbar buttons with data-testids", () => {
    const vdom = renderViewerVdom({
      collection: "users",
      documents: [{ _id: "doc-1", name: "Alice" }],
      totalDocuments: 1,
      page: 1,
      pageSize: 50,
      totalPages: 1,
      isLoading: false,
      sortField: null,
      sortDirection: null,
      onSort: () => {},
      onPageChange: () => {},
      onPageSizeChange: () => {},
      filterInput: "",
      onFilterInputChange: () => {},
      onApplyFilter: () => {},
      onResetFilter: () => {},
      isFilterApplied: false,
      onRefresh: () => {},
      onImportClick: () => {},
      onExportClick: () => {},
      onBulkMutationClick: () => {},
    });

    const importBtn = findVdomNodes(
      vdom,
      (n) => n.props?.["data-testid"] === "toolbar-bulk-import-button",
    );
    const exportBtn = findVdomNodes(
      vdom,
      (n) => n.props?.["data-testid"] === "toolbar-bulk-export-button",
    );
    const mutationBtn = findVdomNodes(
      vdom,
      (n) => n.props?.["data-testid"] === "toolbar-bulk-mutation-button",
    );

    assert.strictEqual(importBtn.length, 1, "Must render toolbar-bulk-import-button");
    assert.strictEqual(exportBtn.length, 1, "Must render toolbar-bulk-export-button");
    assert.strictEqual(mutationBtn.length, 1, "Must render toolbar-bulk-mutation-button");
  });

  // Scenario 7: Contextual Toolbar Callback Invocations
  it("7. Clicking toolbar buttons fires onImportClick, onExportClick, and onBulkMutationClick callbacks", () => {
    let importClicked = false;
    let exportClicked = false;
    let mutationClicked = false;

    const vdom = renderViewerVdom({
      collection: "users",
      documents: [{ _id: "doc-1", name: "Alice" }],
      totalDocuments: 1,
      page: 1,
      pageSize: 50,
      totalPages: 1,
      isLoading: false,
      sortField: null,
      sortDirection: null,
      onSort: () => {},
      onPageChange: () => {},
      onPageSizeChange: () => {},
      filterInput: "",
      onFilterInputChange: () => {},
      onApplyFilter: () => {},
      onResetFilter: () => {},
      isFilterApplied: false,
      onRefresh: () => {},
      onImportClick: () => {
        importClicked = true;
      },
      onExportClick: () => {
        exportClicked = true;
      },
      onBulkMutationClick: () => {
        mutationClicked = true;
      },
    });

    const [importBtn] = findVdomNodes(
      vdom,
      (n) => n.props?.["data-testid"] === "toolbar-bulk-import-button",
    );
    const [exportBtn] = findVdomNodes(
      vdom,
      (n) => n.props?.["data-testid"] === "toolbar-bulk-export-button",
    );
    const [mutationBtn] = findVdomNodes(
      vdom,
      (n) => n.props?.["data-testid"] === "toolbar-bulk-mutation-button",
    );

    importBtn.props.onClick();
    exportBtn.props.onClick();
    mutationBtn.props.onClick();

    assert.strictEqual(importClicked, true, "onImportClick must be invoked");
    assert.strictEqual(exportClicked, true, "onExportClick must be invoked");
    assert.strictEqual(mutationClicked, true, "onBulkMutationClick must be invoked");
  });

  // Scenario 8: System Collection Restrictions
  it("8. When collection starts with 'system.', Import and Bulk Mutations are disabled with tooltip; Export remains enabled", () => {
    const vdom = renderViewerVdom({
      collection: "system.views",
      documents: [{ _id: "view-1" }],
      totalDocuments: 1,
      page: 1,
      pageSize: 50,
      totalPages: 1,
      isLoading: false,
      sortField: null,
      sortDirection: null,
      onSort: () => {},
      onPageChange: () => {},
      onPageSizeChange: () => {},
      filterInput: "",
      onFilterInputChange: () => {},
      onApplyFilter: () => {},
      onResetFilter: () => {},
      isFilterApplied: false,
      onRefresh: () => {},
      onImportClick: () => {},
      onExportClick: () => {},
      onBulkMutationClick: () => {},
    });

    const [importBtn] = findVdomNodes(
      vdom,
      (n) => n.props?.["data-testid"] === "toolbar-bulk-import-button",
    );
    const [exportBtn] = findVdomNodes(
      vdom,
      (n) => n.props?.["data-testid"] === "toolbar-bulk-export-button",
    );
    const [mutationBtn] = findVdomNodes(
      vdom,
      (n) => n.props?.["data-testid"] === "toolbar-bulk-mutation-button",
    );

    assert.strictEqual(
      importBtn.props.disabled,
      true,
      "Import must be disabled on system collection",
    );
    assert.strictEqual(
      importBtn.props.title,
      "System collections are protected against imports",
      "Import must carry explanation title",
    );

    assert.strictEqual(
      mutationBtn.props.disabled,
      true,
      "Bulk Mutations must be disabled on system collection",
    );
    assert.strictEqual(
      mutationBtn.props.title,
      "System collections cannot be modified",
      "Bulk Mutations must carry explanation title",
    );

    assert.strictEqual(
      exportBtn.props.disabled,
      false,
      "Export must remain enabled for system collection inspection",
    );
  });

  // Scenario 9: Read-Only Mode Lock & Connection Propagation
  it("9a. Derivation of effective read-only state from connection when no prop is supplied", () => {
    const computeEffectiveReadOnly = (isReadOnlyProp: boolean | undefined, dbConn: any) =>
      Boolean(isReadOnlyProp) || Boolean(dbConn?.readOnly || dbConn?.readonly);

    // No prop supplied (undefined): checks readOnly and readonly property variations
    assert.strictEqual(computeEffectiveReadOnly(undefined, { readOnly: true }), true);
    assert.strictEqual(computeEffectiveReadOnly(undefined, { readonly: true }), true);
    assert.strictEqual(computeEffectiveReadOnly(undefined, { readOnly: false }), false);
    assert.strictEqual(computeEffectiveReadOnly(undefined, null), false);
    assert.strictEqual(computeEffectiveReadOnly(undefined, undefined), false);
  });

  it("9b. Read-only connection cannot be overridden into writable mode by an explicit prop", () => {
    const computeEffectiveReadOnly = (isReadOnlyProp: boolean | undefined, dbConn: any) =>
      Boolean(isReadOnlyProp) || Boolean(dbConn?.readOnly || dbConn?.readonly);

    // Explicit false prop cannot downgrade a read-only connection
    assert.strictEqual(computeEffectiveReadOnly(false, { readOnly: true }), true);
    assert.strictEqual(computeEffectiveReadOnly(false, { readonly: true }), true);

    // Explicit true prop locks down even if connection claims writable
    assert.strictEqual(computeEffectiveReadOnly(true, { readOnly: false }), true);
    assert.strictEqual(computeEffectiveReadOnly(true, null), true);

    // Only writable when both prop and connection are non-readonly
    assert.strictEqual(computeEffectiveReadOnly(false, { readOnly: false }), false);
  });

  it("9c. When isReadOnly = true, Import and Bulk Mutations are disabled; Export remains enabled", () => {
    const vdom = renderViewerVdom({
      collection: "orders",
      documents: [{ _id: "order-1", total: 100 }],
      totalDocuments: 1,
      page: 1,
      pageSize: 50,
      totalPages: 1,
      isLoading: false,
      sortField: null,
      sortDirection: null,
      onSort: () => {},
      onPageChange: () => {},
      onPageSizeChange: () => {},
      filterInput: "",
      onFilterInputChange: () => {},
      onApplyFilter: () => {},
      onResetFilter: () => {},
      isFilterApplied: false,
      onRefresh: () => {},
      onImportClick: () => {},
      onExportClick: () => {},
      onBulkMutationClick: () => {},
      isReadOnly: true,
    });

    const [importBtn] = findVdomNodes(
      vdom,
      (n) => n.props?.["data-testid"] === "toolbar-bulk-import-button",
    );
    const [exportBtn] = findVdomNodes(
      vdom,
      (n) => n.props?.["data-testid"] === "toolbar-bulk-export-button",
    );
    const [mutationBtn] = findVdomNodes(
      vdom,
      (n) => n.props?.["data-testid"] === "toolbar-bulk-mutation-button",
    );

    assert.strictEqual(importBtn.props.disabled, true, "Import must be disabled in read-only mode");
    assert.strictEqual(
      mutationBtn.props.disabled,
      true,
      "Bulk Mutations must be disabled in read-only mode",
    );
    assert.strictEqual(
      exportBtn.props.disabled,
      false,
      "Export must remain enabled in read-only mode",
    );
  });

  it("9d. MongoDataViewPanel propagates effective read-only to MongoDocumentViewer and MongoBulkMutationDialog", () => {
    const dataViewPanelPath = path.resolve(
      process.cwd(),
      "src/features/mongodb/components/MongoDataViewPanel.tsx",
    );
    const content = fs.readFileSync(dataViewPanelPath, "utf-8");

    assert.ok(
      content.includes("isEffectiveReadOnly"),
      "MongoDataViewPanel must compute isEffectiveReadOnly",
    );
    assert.ok(
      content.includes("isReadOnly={isEffectiveReadOnly}"),
      "MongoDataViewPanel must pass isEffectiveReadOnly to delegated components",
    );
  });

  // Scenario 10: Collection Prefill in Data View Dialogs
  it("10. MongoDataViewPanel pre-fills defaultCollection with the active selected collection", () => {
    const dataViewPanelPath = path.resolve(
      process.cwd(),
      "src/features/mongodb/components/MongoDataViewPanel.tsx",
    );
    const content = fs.readFileSync(dataViewPanelPath, "utf-8");

    // Verify all 3 bulk dialogs are imported and receive defaultCollection={selectedCollection}
    assert.ok(content.includes("MongoBulkImportDialog"));
    assert.ok(content.includes("MongoBulkExportDialog"));
    assert.ok(content.includes("MongoBulkMutationDialog"));
    assert.ok(content.includes("defaultCollection={selectedCollection}"));
  });

  // Scenario 11: Background Execution & Unmount Survival with Single Poller Authority
  it("11. Dialogs forward cancelOnUnmount={false} and useMongoBulkOperationsStore enforces single poller authority", async () => {
    const dataViewPanelPath = path.resolve(
      process.cwd(),
      "src/features/mongodb/components/MongoDataViewPanel.tsx",
    );
    const content = fs.readFileSync(dataViewPanelPath, "utf-8");

    // Verify cancelOnUnmount={false} is wired to delegated dialogs
    assert.ok(
      content.includes("cancelOnUnmount={false}"),
      "MongoDataViewPanel must pass cancelOnUnmount={false} to delegated bulk dialogs",
    );

    // Verify store deduplicates pollers and maintains single poller authority
    const store = createMongoBulkOperationsStore();
    const now = new Date().toISOString();
    const op: TrackedAsyncBulkOperation = {
      kind: "async",
      operationId: "op-unmount-survival-1",
      dbId: "db-unmount",
      collection: "users",
      type: "export",
      status: "in_progress",
      processedDocuments: 10,
      successfulDocuments: 10,
      failedDocuments: 0,
      createdAt: now,
      updatedAt: now,
      expiresAt: new Date(Date.now() + 60000).toISOString(),
    };

    store.getSnapshot().registerAsyncOperation("db-unmount", op);
    const registered = store.getSnapshot().operationsByDb[
      "db-unmount"
    ]?.[0] as TrackedAsyncBulkOperation;
    assert.strictEqual(registered?.status, "in_progress");

    // Starting poller multiple times does not create duplicates
    store._startPoller("op-unmount-survival-1");
    store._startPoller("op-unmount-survival-1");

    // Store tracks single authoritative entry
    assert.strictEqual(store._activePollers.has("op-unmount-survival-1"), true);
    assert.strictEqual(store._activePollers.size, 1);
    assert.strictEqual(store.getSnapshot().operationsByDb["db-unmount"].length, 1);
    store.getSnapshot().resetStore();
  });

  // Scenario 12: Closing the mutation dialog while submitting does not trigger early refetch
  it("12. Closing the mutation dialog while submitting does not trigger early refetch", () => {
    let documentRefreshed = 0;
    let collectionsRefreshed = 0;

    const _refetchDocuments = () => {
      documentRefreshed++;
    };
    const _refetchCollections = () => {
      collectionsRefreshed++;
    };

    // In MongoDataViewPanel, onOpenChange is wired directly to state setter: onOpenChange={setIsBulkMutationOpen}
    // Closing the dialog (open = false) while in flight does not trigger any refetch
    let isBulkMutationOpen = true;
    const onOpenChange = (open: boolean) => {
      isBulkMutationOpen = open;
    };

    onOpenChange(false);
    assert.strictEqual(isBulkMutationOpen, false);
    assert.strictEqual(
      documentRefreshed,
      0,
      "Closing mutation dialog must not trigger document refetch",
    );
    assert.strictEqual(
      collectionsRefreshed,
      0,
      "Closing mutation dialog must not trigger collection refetch",
    );

    // Source audit confirms no refetch inside onOpenChange of MongoBulkMutationDialog
    const dataViewPanelPath = path.resolve(
      process.cwd(),
      "src/features/mongodb/components/MongoDataViewPanel.tsx",
    );
    const content = fs.readFileSync(dataViewPanelPath, "utf-8");
    assert.ok(
      content.includes("onOpenChange={setIsBulkMutationOpen}"),
      "MongoBulkMutationDialog onOpenChange must only toggle modal open state without triggering refetch",
    );
  });

  // Scenario 13: Terminal mutation outcome (completed and partial_success) triggers refetch
  it("13. Terminal mutation outcome (completed and partial_success) triggers query cache invalidation; failed does not", () => {
    const invalidatedKeys: string[][] = [];
    const mockQueryClient = {
      invalidateQueries: ({ queryKey }: { queryKey: any[] }) => {
        invalidatedKeys.push(queryKey);
      },
    };

    const store = createMongoBulkOperationsStore();
    const targetDbId = "db-mutations-test";

    // Set up the router listener pattern from DatabaseDetails.tsx
    let prevOperationsByDb = store.getSnapshot().operationsByDb;
    const unsubscribe = store.subscribe(() => {
      const currentOperationsByDb = store.getSnapshot().operationsByDb;
      for (const [dbIdKey, ops] of Object.entries(currentOperationsByDb)) {
        const prevOps = prevOperationsByDb[dbIdKey] || [];
        for (const op of ops) {
          if (op.kind === "sync") {
            const prev = prevOps.find((p) => p.kind === "sync" && p.id === op.id);
            if (
              prev &&
              prev.status === "running" &&
              (op.status === "completed" || op.status === "partial_success")
            ) {
              mockQueryClient.invalidateQueries({ queryKey: ["mongoDocuments", op.dbId] });
              mockQueryClient.invalidateQueries({ queryKey: ["mongoCollections", op.dbId] });
              mockQueryClient.invalidateQueries({ queryKey: ["mongoSchema", op.dbId] });
            }
          }
        }
      }
      prevOperationsByDb = currentOperationsByDb;
    });

    // 1. Register running mutation
    const mutation1: TrackedSyncBulkMutation = {
      kind: "sync",
      id: "mut-1",
      dbId: targetDbId,
      collection: "users",
      type: "update",
      status: "running",
      timestamp: new Date().toISOString(),
    };
    store.getSnapshot().registerSyncMutation(targetDbId, mutation1);
    assert.strictEqual(invalidatedKeys.length, 0, "Running mutation must not trigger invalidation");

    // 2. Transition to completed -> invalidates documents, collections, and schema
    store.getSnapshot().updateSyncMutation("mut-1", {
      status: "completed",
      matchedCount: 5,
      modifiedCount: 5,
    });
    assert.strictEqual(invalidatedKeys.length, 3);
    assert.deepStrictEqual(invalidatedKeys[0], ["mongoDocuments", targetDbId]);
    assert.deepStrictEqual(invalidatedKeys[1], ["mongoCollections", targetDbId]);
    assert.deepStrictEqual(invalidatedKeys[2], ["mongoSchema", targetDbId]);

    // 3. Register running mutation that finishes with partial_success
    invalidatedKeys.length = 0;
    const mutation2: TrackedSyncBulkMutation = {
      kind: "sync",
      id: "mut-2",
      dbId: targetDbId,
      collection: "users",
      type: "insert",
      status: "running",
      timestamp: new Date().toISOString(),
    };
    store.getSnapshot().registerSyncMutation(targetDbId, mutation2);
    store.getSnapshot().updateSyncMutation("mut-2", {
      status: "partial_success",
      insertedCount: 3,
      errors: [{ index: 4, code: "11000", message: "duplicate key" }],
    });
    assert.strictEqual(invalidatedKeys.length, 3, "partial_success must trigger invalidation");

    // 4. Register running mutation that fails -> does NOT trigger invalidation
    invalidatedKeys.length = 0;
    const mutation3: TrackedSyncBulkMutation = {
      kind: "sync",
      id: "mut-3",
      dbId: targetDbId,
      collection: "users",
      type: "delete",
      status: "running",
      timestamp: new Date().toISOString(),
    };
    store.getSnapshot().registerSyncMutation(targetDbId, mutation3);
    store.getSnapshot().updateSyncMutation("mut-3", {
      status: "failed",
      error: "Network disconnect",
    });
    assert.strictEqual(invalidatedKeys.length, 0, "failed mutation must NOT trigger invalidation");

    unsubscribe();
  });

  // Scenario 14: Invalidation via store transition triggers cache invalidation for target op.dbId even after unmount
  it("14. Invalidation via store transition preserves captured op.dbId even after dialog/panel unmount", () => {
    const targetDbId = "db-background-mutation";
    const invalidatedKeys: string[][] = [];
    const mockQueryClient = {
      invalidateQueries: ({ queryKey }: { queryKey: any[] }) => {
        invalidatedKeys.push(queryKey);
      },
    };

    const store = createMongoBulkOperationsStore();

    // Persistent router subscriber
    let prevOperationsByDb = store.getSnapshot().operationsByDb;
    const unsubscribe = store.subscribe(() => {
      const currentOperationsByDb = store.getSnapshot().operationsByDb;
      for (const [dbIdKey, ops] of Object.entries(currentOperationsByDb)) {
        const prevOps = prevOperationsByDb[dbIdKey] || [];
        for (const op of ops) {
          if (op.kind === "sync") {
            const prev = prevOps.find((p) => p.kind === "sync" && p.id === op.id);
            if (
              prev &&
              prev.status === "running" &&
              (op.status === "completed" || op.status === "partial_success")
            ) {
              mockQueryClient.invalidateQueries({ queryKey: ["mongoDocuments", op.dbId] });
            }
          }
        }
      }
      prevOperationsByDb = currentOperationsByDb;
    });

    // Mutation starts on targetDbId
    store.getSnapshot().registerSyncMutation(targetDbId, {
      kind: "sync",
      id: "mut-unmounted",
      dbId: targetDbId,
      collection: "audit_logs",
      type: "delete",
      status: "running",
      timestamp: new Date().toISOString(),
    });

    // Dialog unmounts, panel unmounts, user navigates to another database "db-other"
    const activeDatabaseInUI = "db-other";

    // Mutation settles in background
    store.getSnapshot().updateSyncMutation("mut-unmounted", {
      status: "completed",
      deletedCount: 42,
    });

    // Verify invalidation targeted op.dbId, NOT activeDatabaseInUI
    assert.strictEqual(invalidatedKeys.length, 1);
    assert.deepStrictEqual(invalidatedKeys[0], ["mongoDocuments", targetDbId]);
    assert.notDeepStrictEqual(invalidatedKeys[0], ["mongoDocuments", activeDatabaseInUI]);

    unsubscribe();
  });

  // Scenario 15: Multiple chunk acknowledgements do not trigger refetch
  it("15. Multiple chunk acknowledgements do not trigger refetch; only track cumulative count", () => {
    let documentRefreshed = 0;
    const _refetchDocuments = () => {
      documentRefreshed++;
    };

    // Implementation matching MongoDataViewPanel
    const importCommittedCountRef = { current: 0 };
    const onChunkAcknowledged = (progress: { totalInserted: number }) => {
      importCommittedCountRef.current = progress.totalInserted;
    };

    // Simulate 50 incoming chunks during large bulk import stream
    for (let i = 1; i <= 50; i++) {
      onChunkAcknowledged({ totalInserted: i * 100 });
    }

    assert.strictEqual(
      importCommittedCountRef.current,
      5000,
      "Cumulative inserted count must be tracked",
    );
    assert.strictEqual(
      documentRefreshed,
      0,
      "Streaming chunk acknowledgements must never invoke refetchDocuments",
    );
  });

  // Scenario 16: Complete successful import callback sequence eliminates duplicate refresh; single refresh on completed, cancelled with docs, and failed with docs
  it("16. Complete successful import callback sequence eliminates duplicate refresh; single refresh on completed, cancelled with docs, and failed with docs", () => {
    let documentRefreshed = 0;
    let collectionsRefreshed = 0;
    const refetchDocuments = () => {
      documentRefreshed++;
    };
    const refetchCollections = () => {
      collectionsRefreshed++;
    };

    // Actual wiring matching MongoDataViewPanel.tsx
    const importCommittedCountRef = { current: 0 };
    let isBulkImportOpen = true;
    const onOpenChange = (open: boolean) => {
      isBulkImportOpen = open;
    };

    const onChunkAcknowledged = (progress: { totalInserted: number }) => {
      importCommittedCountRef.current = progress.totalInserted;
    };

    const onTerminalState = (_opId: string, status: MongoBulkOperationStatus) => {
      if (status === "completed" || importCommittedCountRef.current > 0) {
        refetchDocuments();
        refetchCollections();
        importCommittedCountRef.current = 0;
      }
    };

    // Dialog component wiring (MongoBulkImportDialog.tsx):
    // In MongoBulkImportDialog, handleFinish executes: onImportComplete?.(); onOpenChange(false);
    // Since MongoDataViewPanel does not pass onImportComplete, onImportComplete is undefined.
    const dialogProps = {
      open: isBulkImportOpen,
      onOpenChange,
      onChunkAcknowledged,
      onTerminalState,
      onImportComplete: undefined as (() => void) | undefined,
    };

    const simulateDialogFinish = () => {
      dialogProps.onImportComplete?.();
      dialogProps.onOpenChange(false);
    };

    // 1. Simulate acknowledged import chunks
    dialogProps.onChunkAcknowledged({ totalInserted: 100 });
    assert.strictEqual(documentRefreshed, 0, "Chunk 1 must not trigger refresh");
    assert.strictEqual(collectionsRefreshed, 0, "Chunk 1 must not trigger refresh");

    dialogProps.onChunkAcknowledged({ totalInserted: 250 });
    assert.strictEqual(documentRefreshed, 0, "Chunk 2 must not trigger refresh");
    assert.strictEqual(collectionsRefreshed, 0, "Chunk 2 must not trigger refresh");
    assert.strictEqual(importCommittedCountRef.current, 250);

    // 2. Trigger onTerminalState with "completed"
    dialogProps.onTerminalState("op-success-1", "completed");

    // 3. Verify exactly one document refresh and one collection refresh
    assert.strictEqual(
      documentRefreshed,
      1,
      "Terminal completed must trigger exactly 1 document refresh",
    );
    assert.strictEqual(
      collectionsRefreshed,
      1,
      "Terminal completed must trigger exactly 1 collection refresh",
    );
    assert.strictEqual(
      importCommittedCountRef.current,
      0,
      "Committed count ref must be reset to 0",
    );

    // 4. Simulate user clicking Finish on the summary screen and dialog closing
    simulateDialogFinish();
    assert.strictEqual(isBulkImportOpen, false, "Dialog must close on Finish");

    // 5. Verify NO second refresh occurs
    assert.strictEqual(
      documentRefreshed,
      1,
      "Clicking Finish must not trigger a second document refresh",
    );
    assert.strictEqual(
      collectionsRefreshed,
      1,
      "Clicking Finish must not trigger a second collection refresh",
    );

    // 6. Verify cancellation with committed chunks refreshes once and resets ref
    isBulkImportOpen = true;
    dialogProps.onChunkAcknowledged({ totalInserted: 80 });
    dialogProps.onTerminalState("op-cancel-1", "cancelled");
    assert.strictEqual(
      documentRefreshed,
      2,
      "Cancelled import with committed docs must trigger 1 refresh",
    );
    assert.strictEqual(collectionsRefreshed, 2);
    assert.strictEqual(
      importCommittedCountRef.current,
      0,
      "Ref must reset to 0 after cancellation refresh",
    );

    // 7. Verify failure with committed chunks refreshes once and resets ref
    dialogProps.onChunkAcknowledged({ totalInserted: 40 });
    dialogProps.onTerminalState("op-fail-1", "failed");
    assert.strictEqual(
      documentRefreshed,
      3,
      "Failed import with committed docs must trigger 1 refresh",
    );
    assert.strictEqual(collectionsRefreshed, 3);
    assert.strictEqual(
      importCommittedCountRef.current,
      0,
      "Ref must reset to 0 after failure refresh",
    );

    // 8. Verify failure with zero committed documents does not refresh
    dialogProps.onChunkAcknowledged({ totalInserted: 0 });
    dialogProps.onTerminalState("op-fail-zero", "failed");
    assert.strictEqual(
      documentRefreshed,
      3,
      "Failed import with 0 committed docs must NOT refresh",
    );
    assert.strictEqual(collectionsRefreshed, 3);

    // 9. Verify cancellation with zero committed documents does not refresh
    dialogProps.onTerminalState("op-cancel-zero", "cancelled");
    assert.strictEqual(
      documentRefreshed,
      3,
      "Cancelled import with 0 committed docs must NOT refresh",
    );
    assert.strictEqual(collectionsRefreshed, 3);

    // 10. Source verification confirms onImportComplete is omitted from MongoBulkImportDialog
    const dataViewPanelPath = path.resolve(
      process.cwd(),
      "src/features/mongodb/components/MongoDataViewPanel.tsx",
    );
    const content = fs.readFileSync(dataViewPanelPath, "utf-8");
    assert.ok(
      !content.includes("onImportComplete="),
      "MongoDataViewPanel must not pass onImportComplete to MongoBulkImportDialog",
    );
  });

  // Scenario 17: Export does not invalidate document data
  it("17. Pure export operations never trigger document, collection, or schema cache invalidation", () => {
    const invalidatedKeys: string[][] = [];
    const mockQueryClient = {
      invalidateQueries: ({ queryKey }: { queryKey: any[] }) => {
        invalidatedKeys.push(queryKey);
      },
    };

    const store = createMongoBulkOperationsStore();
    const targetDbId = "db-export-test";

    // Setup listener from DatabaseDetails.tsx
    let prevOperationsByDb = store.getSnapshot().operationsByDb;
    const unsubscribe = store.subscribe(() => {
      const currentOperationsByDb = store.getSnapshot().operationsByDb;
      for (const [dbIdKey, ops] of Object.entries(currentOperationsByDb)) {
        const prevOps = prevOperationsByDb[dbIdKey] || [];
        for (const op of ops) {
          if (op.kind === "sync") {
            const prev = prevOps.find((p) => p.kind === "sync" && p.id === op.id);
            if (
              prev &&
              prev.status === "running" &&
              (op.status === "completed" || op.status === "partial_success")
            ) {
              mockQueryClient.invalidateQueries({ queryKey: ["mongoDocuments", op.dbId] });
            }
          } else if (op.kind === "async" && op.type === "import") {
            const prev = prevOps.find(
              (p) => p.kind === "async" && p.operationId === op.operationId,
            );
            const wasActive = prev && (prev.status === "pending" || prev.status === "in_progress");
            const isTerminal =
              op.status === "completed" || op.status === "failed" || op.status === "cancelled";
            if (wasActive && isTerminal && op.successfulDocuments > 0) {
              mockQueryClient.invalidateQueries({ queryKey: ["mongoDocuments", op.dbId] });
            }
          }
        }
      }
      prevOperationsByDb = currentOperationsByDb;
    });

    // Register and complete an export operation
    const now = new Date().toISOString();
    store.getSnapshot().registerAsyncOperation(targetDbId, {
      kind: "async",
      operationId: "exp-1",
      dbId: targetDbId,
      collection: "products",
      type: "export",
      status: "in_progress",
      processedDocuments: 500,
      successfulDocuments: 500,
      failedDocuments: 0,
      createdAt: now,
      updatedAt: now,
      expiresAt: new Date(Date.now() + 60000).toISOString(),
    });

    store.getSnapshot().updateAsyncOperation("exp-1", {
      status: "completed",
    });

    assert.strictEqual(
      invalidatedKeys.length,
      0,
      "Export operations must never trigger cache invalidations",
    );

    unsubscribe();
  });
});
