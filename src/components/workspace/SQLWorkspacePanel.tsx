import { useState, useEffect, useCallback } from "react";
import { useBridgeQuery } from "@/hooks/useBridgeQuery";
import { useDatabaseDetails } from "@/hooks/useDatabaseDetails";
import { Spinner } from "@/components/ui/spinner";
import { SqlEditor } from "@/components/workspace/SqlEditor";

// Sub-components
import { WorkspaceHeader } from "./WorkspaceHeader";
import { WorkspaceSidebar } from "./WorkspaceSidebar";
import { QueryTabBar } from "./QueryTabBar";
import { ResultsPanel } from "./ResultsPanel";
import { StatusBar } from "./StatusBar";

// Types
import { QueryTab, QueryHistoryItem } from "./types";

interface SQLWorkspacePanelProps {
    dbId: string;
}

const SQLWorkspacePanel = ({ dbId }: SQLWorkspacePanelProps) => {
    const { data: bridgeReady } = useBridgeQuery();

    // Sidebar state
    const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
    const [sidebarTab, setSidebarTab] = useState<'tables' | 'history'>('tables');

    // Query tabs state
    const [tabs, setTabs] = useState<QueryTab[]>([
        {
            id: '1',
            name: 'Query 1',
            query: '-- Write your SQL query here\nSELECT * FROM ',
            results: [],
            rowCount: 0,
            error: null,
            executionTime: null,
            status: 'idle',
        }
    ]);
    const [activeTabId, setActiveTabId] = useState('1');

    // Query history
    const [queryHistory, setQueryHistory] = useState<QueryHistoryItem[]>([]);

    const {
        databaseName,
        tables,
        queryProgress,
        queryError,
        isExecuting,
        setQuery,
        handleExecuteQuery,
        handleCancelQuery,
        tableData,
        rowCount,
    } = useDatabaseDetails({
        dbId,
        bridgeReady: bridgeReady ?? false,
    });

    // Sync with active tab
    const activeTab = tabs.find(t => t.id === activeTabId);

    useEffect(() => {
        if (activeTab) {
            setQuery(activeTab.query);
        }
    }, [activeTabId]);

    // Update tab when query changes
    const updateActiveTabQuery = useCallback((newQuery: string) => {
        setTabs(prev => prev.map(tab =>
            tab.id === activeTabId ? { ...tab, query: newQuery } : tab
        ));
        setQuery(newQuery);
    }, [activeTabId, setQuery]);

    // Update tab results when query completes
    useEffect(() => {
        if (!isExecuting && tableData.length > 0) {
            setTabs(prev => prev.map(tab =>
                tab.id === activeTabId ? {
                    ...tab,
                    results: tableData,
                    rowCount: rowCount,
                    error: queryError,
                    status: queryError ? 'error' : 'success',
                    executionTime: queryProgress?.elapsed || null,
                } : tab
            ));

            // Add to history
            if (activeTab?.query.trim()) {
                setQueryHistory(prev => [{
                    query: activeTab.query,
                    timestamp: new Date(),
                    rowCount: rowCount,
                    success: !queryError,
                }, ...prev.slice(0, 49)]);
            }
        }
    }, [isExecuting, tableData, rowCount, queryError]);

    // Update tab status when executing
    useEffect(() => {
        if (isExecuting) {
            setTabs(prev => prev.map(tab =>
                tab.id === activeTabId ? { ...tab, status: 'running' } : tab
            ));
        }
    }, [isExecuting, activeTabId]);

    const addNewTab = useCallback(() => {
        const newId = Date.now().toString();
        const newTab: QueryTab = {
            id: newId,
            name: `Query ${tabs.length + 1}`,
            query: '-- New query\nSELECT ',
            results: [],
            rowCount: 0,
            error: null,
            executionTime: null,
            status: 'idle',
        };
        setTabs(prev => [...prev, newTab]);
        setActiveTabId(newId);
    }, [tabs.length]);

    const closeTab = useCallback((tabId: string, e: React.MouseEvent) => {
        e.stopPropagation();
        if (tabs.length === 1) return;

        const tabIndex = tabs.findIndex(t => t.id === tabId);
        const newTabs = tabs.filter(t => t.id !== tabId);
        setTabs(newTabs);

        if (activeTabId === tabId) {
            const newActiveIndex = Math.min(tabIndex, newTabs.length - 1);
            setActiveTabId(newTabs[newActiveIndex].id);
        }
    }, [tabs, activeTabId]);

    const insertTableQuery = useCallback((tableName: string, schema: string) => {
        const newQuery = `SELECT * FROM "${schema}"."${tableName}" LIMIT 100;`;
        updateActiveTabQuery(newQuery);
    }, [updateActiveTabQuery]);

    const loadFromHistory = useCallback((historyQuery: string) => {
        updateActiveTabQuery(historyQuery);
    }, [updateActiveTabQuery]);

    const clearResults = useCallback(() => {
        setTabs(prev => prev.map(tab =>
            tab.id === activeTabId ? { ...tab, results: [], rowCount: 0, status: 'idle' } : tab
        ));
    }, [activeTabId]);

    if (!bridgeReady) {
        return (
            <div className="h-full flex items-center justify-center">
                <Spinner className="h-8 w-8" />
            </div>
        );
    }

    return (
        <div className="h-full flex flex-col bg-background">
            <WorkspaceHeader
                databaseName={databaseName || 'Database'}
                isExecuting={isExecuting}
                queryProgress={queryProgress}
                canExecute={!!activeTab?.query.trim()}
                onExecute={handleExecuteQuery}
                onCancel={handleCancelQuery}
            />

            {/* Main Content */}
            <div className="flex-1 flex overflow-hidden">
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
                <div className="flex-1 flex flex-col min-w-0">
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
                        <div className="h-[45%] min-h-[200px] border-b border-border/40">
                            <SqlEditor
                                value={activeTab?.query || ''}
                                onChange={updateActiveTabQuery}
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
                databaseName={databaseName || 'Database'}
                tableCount={tables.length}
                lineCount={activeTab?.query.split('\n').length || 1}
            />
        </div>
    );
};

export default SQLWorkspacePanel;
