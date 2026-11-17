/**
 * MongoDB Stage 8 Phase 1 — Frontend Read-Only Affordances Test Suite
 *
 * Validates AUD-02 read-only UI restrictions across:
 * 1. MongoDocumentViewer:
 *    - Toolbar "Insert Document" disabled state, tooltip, and Tailwind classes
 *    - DataTable suppression of row-level inline edit and delete handlers
 * 2. MongoCollectionsSidebar:
 *    - "Create new collection" button disabled state, title, and Tailwind classes
 *    - Suppression of row-level "Drop Collection" action button
 * 3. MongoDataViewPanel:
 *    - Propagation of effective read-only state to MongoCollectionsSidebar and MongoDocumentViewer
 */

import { describe, it } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import React from "react";
import ReactDOMServer from "react-dom/server";
import { MongoDocumentViewer } from "../components/MongoDocumentViewer";
import { MongoCollectionsSidebar } from "../components/MongoCollectionsSidebar";
import { DataTable } from "@/components/shared/DataTable";

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

function renderSidebarVdom(props: any): any {
  let capturedVdom: any;
  function Wrapper() {
    capturedVdom = MongoCollectionsSidebar(props);
    return null;
  }
  ReactDOMServer.renderToStaticMarkup(React.createElement(Wrapper));
  return capturedVdom;
}

describe("MongoDB Stage 8 Phase 1: Frontend Read-Only Affordances", () => {
  const defaultViewerProps = {
    collection: "customers",
    documents: [{ _id: "cust-1", name: "Acme Corp" }],
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
    onInsertDocument: () => {},
    onEditDocument: () => {},
    onDeleteDocument: () => {},
    onImportClick: () => {},
    onExportClick: () => {},
    onBulkMutationClick: () => {},
  };

  describe("MongoDocumentViewer Read-Only Affordances", () => {
    it("disables 'Insert Document' button with tooltip and classes when isReadOnly is true", () => {
      const vdom = renderViewerVdom({
        ...defaultViewerProps,
        isReadOnly: true,
      });

      const insertButtons = findVdomNodes(vdom, (n) => {
        const text = Array.isArray(n.props?.children)
          ? n.props.children.join(" ")
          : String(n.props?.children || "");
        return text.includes("Insert Document");
      });

      assert.strictEqual(insertButtons.length, 1, "Must render exactly 1 Insert Document button");
      const [insertBtn] = insertButtons;

      assert.strictEqual(
        insertBtn.props.disabled,
        true,
        "Insert Document must be disabled in read-only mode",
      );
      assert.strictEqual(
        insertBtn.props.title,
        "Database is read-only",
        "Insert Document must display 'Database is read-only' title",
      );
      assert.ok(
        insertBtn.props.className?.includes("disabled:opacity-50") &&
          insertBtn.props.className?.includes("disabled:cursor-not-allowed"),
        `Insert Document button must include disabled styling classes, got: ${insertBtn.props.className}`,
      );
    });

    it("enables 'Insert Document' button when isReadOnly is false and not system collection", () => {
      const vdom = renderViewerVdom({
        ...defaultViewerProps,
        isReadOnly: false,
      });

      const insertButtons = findVdomNodes(vdom, (n) => {
        const text = Array.isArray(n.props?.children)
          ? n.props.children.join(" ")
          : String(n.props?.children || "");
        return text.includes("Insert Document");
      });

      assert.strictEqual(insertButtons.length, 1);
      const [insertBtn] = insertButtons;

      assert.strictEqual(
        insertBtn.props.disabled,
        false,
        "Insert Document must be enabled when writable",
      );
      assert.strictEqual(
        insertBtn.props.title,
        undefined,
        "Insert Document should have no read-only title",
      );
    });

    it("disables 'Insert Document' button on system collection regardless of isReadOnly", () => {
      const vdom = renderViewerVdom({
        ...defaultViewerProps,
        collection: "system.profile",
        isReadOnly: false,
      });

      const insertButtons = findVdomNodes(vdom, (n) => {
        const text = Array.isArray(n.props?.children)
          ? n.props.children.join(" ")
          : String(n.props?.children || "");
        return text.includes("Insert Document");
      });

      assert.strictEqual(insertButtons.length, 1);
      const [insertBtn] = insertButtons;

      assert.strictEqual(
        insertBtn.props.disabled,
        true,
        "Insert Document must be disabled on system collections",
      );
    });

    it("suppresses row-level inline Edit and Delete action handlers in DataTable when isReadOnly is true", () => {
      const vdom = renderViewerVdom({
        ...defaultViewerProps,
        isReadOnly: true,
      });

      const dataTables = findVdomNodes(vdom, (n) => n.type === DataTable);
      assert.strictEqual(dataTables.length, 1, "Must render DataTable");
      const [table] = dataTables;

      assert.strictEqual(
        table.props.onEditRow,
        undefined,
        "DataTable must receive onEditRow=undefined when isReadOnly is true",
      );
      assert.strictEqual(
        table.props.onDeleteRow,
        undefined,
        "DataTable must receive onDeleteRow=undefined when isReadOnly is true",
      );
    });

    it("provides row-level inline Edit and Delete action handlers in DataTable when isReadOnly is false", () => {
      const vdom = renderViewerVdom({
        ...defaultViewerProps,
        isReadOnly: false,
      });

      const dataTables = findVdomNodes(vdom, (n) => n.type === DataTable);
      assert.strictEqual(dataTables.length, 1, "Must render DataTable");
      const [table] = dataTables;

      assert.strictEqual(
        typeof table.props.onEditRow,
        "function",
        "DataTable must receive onEditRow function when writable",
      );
      assert.strictEqual(
        typeof table.props.onDeleteRow,
        "function",
        "DataTable must receive onDeleteRow function when writable",
      );
    });
  });

  describe("MongoCollectionsSidebar Read-Only Affordances", () => {
    const defaultSidebarProps = {
      collections: [
        { name: "users", type: "collection" as const },
        { name: "logs", type: "collection" as const },
        { name: "system.views", type: "collection" as const },
      ],
      selectedCollection: "users",
      onSelectCollection: () => {},
      isLoading: false,
      onRefresh: () => {},
      onCreateCollection: () => {},
      onDropCollection: () => {},
    };

    it("disables 'Create new collection' button with title and classes when isReadOnly is true", () => {
      const vdom = renderSidebarVdom({
        ...defaultSidebarProps,
        isReadOnly: true,
      });

      const createButtons = findVdomNodes(vdom, (n) => n.props?.title === "Database is read-only");
      assert.strictEqual(
        createButtons.length,
        1,
        "Must find Create Collection button with read-only title",
      );
      const [btn] = createButtons;

      assert.strictEqual(btn.props.disabled, true, "Create Collection button must be disabled");
      assert.ok(
        btn.props.className?.includes("disabled:opacity-40") &&
          btn.props.className?.includes("disabled:cursor-not-allowed"),
        `Create Collection button must have disabled classes, got: ${btn.props.className}`,
      );
    });

    it("enables 'Create new collection' button when isReadOnly is false", () => {
      const vdom = renderSidebarVdom({
        ...defaultSidebarProps,
        isReadOnly: false,
      });

      const createButtons = findVdomNodes(vdom, (n) => n.props?.title === "Create new collection");
      assert.strictEqual(
        createButtons.length,
        1,
        "Must find Create Collection button with active title",
      );
      const [btn] = createButtons;

      assert.strictEqual(
        btn.props.disabled,
        false,
        "Create Collection button must not be disabled",
      );
    });

    it("suppresses 'Drop Collection' context action buttons when isReadOnly is true", () => {
      const vdom = renderSidebarVdom({
        ...defaultSidebarProps,
        isReadOnly: true,
      });

      const dropButtons = findVdomNodes(
        vdom,
        (n) => typeof n.props?.title === "string" && n.props.title.startsWith("Drop "),
      );
      assert.strictEqual(
        dropButtons.length,
        0,
        "Drop Collection buttons must be completely omitted from the DOM when isReadOnly is true",
      );
    });

    it("renders 'Drop Collection' context buttons only for non-system collections when writable", () => {
      const vdom = renderSidebarVdom({
        ...defaultSidebarProps,
        isReadOnly: false,
      });

      const dropButtons = findVdomNodes(
        vdom,
        (n) => typeof n.props?.title === "string" && n.props.title.startsWith("Drop "),
      );
      // 'users' and 'logs' should have drop buttons, 'system.views' should NOT
      assert.strictEqual(
        dropButtons.length,
        2,
        "Must render drop buttons for the 2 non-system collections",
      );
      const titles = dropButtons.map((b) => b.props.title);
      assert.ok(titles.includes("Drop users"));
      assert.ok(titles.includes("Drop logs"));
      assert.ok(
        !titles.includes("Drop system.views"),
        "System collection must never render drop button",
      );
    });
  });

  describe("MongoDataViewPanel Read-Only Propagation", () => {
    it("propagates isEffectiveReadOnly down to MongoCollectionsSidebar and MongoDocumentViewer", () => {
      const dataViewPanelPath = path.resolve(
        process.cwd(),
        "src/features/mongodb/components/MongoDataViewPanel.tsx",
      );
      const content = fs.readFileSync(dataViewPanelPath, "utf-8");

      assert.ok(
        content.includes("<MongoCollectionsSidebar"),
        "Must render MongoCollectionsSidebar",
      );
      assert.ok(
        /<MongoCollectionsSidebar[\s\S]*?isReadOnly=\{isEffectiveReadOnly\}/.test(content),
        "MongoCollectionsSidebar must receive isReadOnly={isEffectiveReadOnly}",
      );
      assert.ok(
        /<MongoDocumentViewer[\s\S]*?isReadOnly=\{isEffectiveReadOnly\}/.test(content),
        "MongoDocumentViewer must receive isReadOnly={isEffectiveReadOnly}",
      );
    });
  });
});
