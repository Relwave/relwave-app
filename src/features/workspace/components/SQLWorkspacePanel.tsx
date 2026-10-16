import { useState, useEffect, useCallback, useRef } from "react";
import { useBridgeQuery } from "@/services/bridge/useBridgeQuery";
import { useDatabaseDetails } from "@/features/database/hooks/useDatabaseDetails";
import { WorkspaceHeader } from "./WorkspaceHeader";
import { WorkspaceSidebar } from "./WorkspaceSidebar";
import { QueryTabBar } from "./QueryTabBar";
import { ResultsPanel } from "./ResultsPanel";
import { StatusBar } from "./StatusBar";
import { QueryTab, QueryHistoryItem } from "../types";
import { SqlEditor } from "./SqlEditor";
import { SQLWorkspacePanelLoadingState } from "@/features/workspace/components/SQLWorkspacePanelLoadingState";
import { NLQueryDialog } from "./NLQueryDialog";

interface SQLWorkspacePanelProps {
  dbId: string;
}

const SQLWorkspacePanel = ({ dbId }: SQLWorkspacePanelProps) => {
  const { data: bridgeReady } = useBridgeQuery();

  // Sidebar state
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
  const [sidebarTab, setSidebarTab] = useState<"tables" | "history">("tables");

  // Query tabs state
  const [tabs, setTabs] = useState<QueryTab[]>([
    {
      id: "1",
      name: "Query 1",
      query: "-- Write your SQL query here\nSELECT * FROM ",
      results: [],
      rowCount: 0,
      error: null,
      executionTime: null,
      status: "idle",
    },
  ]);
  const [activeTabId, setActiveTabId] = useState("1");
  const executingTabIdRef = useRef<string>(activeTabId);
  const wasExecutingRef = useRef<boolean>(false);

  // Query history
  const [queryHistory, setQueryHistory] = useState<QueryHistoryItem[]>([]);

  const [isNLDialogOpen, setIsNLDialogOpen] = useState(false);

  const {
    databaseName,
    databaseType,
    tables,
    queryProgress,
    queryError,
    executionTime,
    isExecuting,
    setQuery,
    handleExecuteQuery,
    handleCancelQuery,
    queryResults,
    rowCount,
  } = useDatabaseDetails({
    dbId,
    bridgeReady: bridgeReady ?? false,
  });

  // Sync with active tab
  const activeTab = tabs.find((t) => t.id === activeTabId);

  useEffect(() => {
    if (activeTab) {
      setQuery(activeTab.query);
    }
  }, [activeTabId]);

  // Update tab when query changes
  const updateActiveTabQuery = useCallback(
    (newQuery: string) => {
      setTabs((prev) =>
        prev.map((tab) => (tab.id === activeTabId ? { ...tab, query: newQuery } : tab)),
      );
      setQuery(newQuery);
    },
    [activeTabId, setQuery],
  );

  const handleRunActiveQuery = useCallback(() => {
    if (!activeTab?.query.trim() || isExecuting) return;
    const targetId = activeTabId;
    executingTabIdRef.current = targetId;
    wasExecutingRef.current = true;
    setTabs((prev) =>
      prev.map((tab) => (tab.id === targetId ? { ...tab, status: "running", error: null } : tab)),
    );
    handleExecuteQuery(activeTab.query);
  }, [activeTab?.query, isExecuting, activeTabId, handleExecuteQuery]);

  // Keyboard shortcut Ctrl+Enter / Cmd+Enter to execute active query
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key === "Enter") {
        e.preventDefault();
        handleRunActiveQuery();
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [handleRunActiveQuery]);

  // Update tab results when query transitions from running to finished
  useEffect(() => {
    if (isExecuting) {
      wasExecutingRef.current = true;
      return;
    }

    if (wasExecutingRef.current && !isExecuting) {
      wasExecutingRef.current = false;
      const targetTabId = executingTabIdRef.current || activeTabId;

      let executedQuery = "";
      setTabs((prev) =>
        prev.map((tab) => {
          if (tab.id === targetTabId) {
            executedQuery = tab.query;
            return {
              ...tab,
              results: queryResults,
              rowCount: rowCount,
              error: queryError,
              status: queryError ? "error" : "success",
              executionTime: executionTime,
            };
          }
          return tab;
        }),
      );

      if (executedQuery.trim() && !queryError) {
        setQueryHistory((prev) => {
          if (prev.length > 0 && prev[0].query === executedQuery) {
            return prev;
          }
          return [
            {
              query: executedQuery,
              timestamp: new Date(),
              rowCount: rowCount,
              success: true,
            },
            ...prev.slice(0, 49),
          ];
        });
      }
    }
  }, [isExecuting, queryResults, rowCount, queryError, executionTime, activeTabId]);

  const addNewTab = useCallback(() => {
    const newId = Date.now().toString();
    const newTab: QueryTab = {
      id: newId,
      name: `Query ${tabs.length + 1}`,
      query: "-- New query\nSELECT ",
      results: [],
      rowCount: 0,
      error: null,
      executionTime: null,
      status: "idle",
    };
    setTabs((prev) => [...prev, newTab]);
    setActiveTabId(newId);
  }, [tabs.length]);

  const closeTab = useCallback(
    (tabId: string, e: React.MouseEvent) => {
      e.stopPropagation();
      if (tabs.length === 1) return;

      const tabIndex = tabs.findIndex((t) => t.id === tabId);
      const newTabs = tabs.filter((t) => t.id !== tabId);
      setTabs(newTabs);

      if (activeTabId === tabId) {
        const newActiveIndex = Math.min(tabIndex, newTabs.length - 1);
        setActiveTabId(newTabs[newActiveIndex].id);
      }
    },
    [tabs, activeTabId],
  );

  const insertTableQuery = useCallback(
    (tableName: string, schema: string) => {
      let newQuery = "";
      if (databaseType === "sqlite") {
        newQuery = `SELECT * FROM "${tableName}" LIMIT 100;`;
      } else if (
        databaseType === "mysql" ||
        databaseType === "mariadb" ||
        databaseType === "clickhouse"
      ) {
        newQuery = `SELECT * FROM \`${schema}\`.\`${tableName}\` LIMIT 100;`;
      } else {
        newQuery = `SELECT * FROM "${schema}"."${tableName}" LIMIT 100;`;
      }
      updateActiveTabQuery(newQuery);
    },
    [databaseType, updateActiveTabQuery],
  );

  const loadFromHistory = useCallback(
    (historyQuery: string) => {
      updateActiveTabQuery(historyQuery);
    },
    [updateActiveTabQuery],
  );

  const clearResults = useCallback(() => {
    setTabs((prev) =>
      prev.map((tab) =>
        tab.id === activeTabId ? { ...tab, results: [], rowCount: 0, status: "idle" } : tab,
      ),
    );
  }, [activeTabId]);

  const handleApplyNLQuerySQL = useCallback(
    (sql: string) => {
      const currentQuery = activeTab?.query || "";
      const cleanQuery =
        currentQuery.trim() === "-- Write your SQL query here\nSELECT * FROM" ||
        currentQuery.trim() === "-- New query\nSELECT"
          ? ""
          : currentQuery;

      const newQuery = cleanQuery ? `${cleanQuery}\n\n${sql}` : sql;
      updateActiveTabQuery(newQuery);
    },
    [activeTab?.query, updateActiveTabQuery],
  );

  if (!bridgeReady) {
    return <SQLWorkspacePanelLoadingState />;
  }

  return (
    <div className="h-full flex flex-col bg-transparent">
      <WorkspaceHeader
        dbId={dbId}
        databaseName={databaseName || "Database"}
        isExecuting={isExecuting}
        queryProgress={queryProgress}
        canExecute={!!activeTab?.query.trim()}
        activeQuery={activeTab?.query}
        onExecute={handleRunActiveQuery}
        onCancel={handleCancelQuery}
        onNLQueryClick={() => setIsNLDialogOpen(true)}
      />

      {/* Main Content */}
      <div className="flex-1 flex overflow-hidden p-3 gap-3">
        <WorkspaceSidebar
          tables={tables}
          queryHistory={queryHistory}
          collapsed={sidebarCollapsed}
          activeTab={sidebarTab}
          onToggleCollapse={() => setSidebarCollapsed(!sidebarCollapsed)}
          onTabChange={setSidebarTab}
          onTableClick={insertTableQuery}
          onHistoryClick={loadFromHistory}
        />

        {/* Editor Area */}
        <div className="flex-1 flex flex-col min-w-0 rounded-lg border border-border/50 bg-card/55 shadow-sm overflow-hidden">
          <QueryTabBar
            tabs={tabs}
            activeTabId={activeTabId}
            onTabSelect={setActiveTabId}
            onTabClose={closeTab}
            onNewTab={addNewTab}
          />

          {/* Split View: Editor + Results */}
          <div className="flex-1 flex flex-col overflow-hidden">
            {/* Editor */}
            <div className="h-[45%] min-h-[200px] border-b border-border/40 bg-background/70 overflow-y-auto">
              <SqlEditor
                value={activeTab?.query || ""}
                onChange={updateActiveTabQuery}
                onExecute={handleRunActiveQuery}
                dialect={
                  databaseType === "mysql" || databaseType === "mariadb" ? "mysql" : "postgresql"
                }
                disabled={isExecuting}
                minHeight="100%"
                placeholder="-- Enter your SQL query and press Run (or Ctrl+Enter)"
              />
            </div>

            <ResultsPanel
              activeTab={activeTab}
              queryProgress={queryProgress}
              onClearResults={clearResults}
            />
          </div>
        </div>
      </div>

      <StatusBar
        databaseName={databaseName || "Database"}
        tableCount={tables.length}
        lineCount={activeTab?.query.split("\n").length || 1}
      />

      <NLQueryDialog
        isOpen={isNLDialogOpen}
        onOpenChange={setIsNLDialogOpen}
        dbId={dbId}
        onApplySQL={handleApplyNLQuerySQL}
      />
    </div>
  );
};

export default SQLWorkspacePanel;
