import { useState, useEffect, useCallback } from "react";
import { useParams, Link } from "react-router-dom";
import {
    Play,
    Square,
    Database,
    Table2,
    ChevronRight,
    Plus,
    X,
    AlertCircle,
    CheckCircle2,
    Loader2,
    PanelLeftClose,
    PanelLeft,
    History,
    FileCode,
    Trash2,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
    Tooltip,
    TooltipContent,
    TooltipTrigger,
} from "@/components/ui/tooltip";
import { useBridgeQuery } from "@/hooks/useBridgeQuery";
import { useDatabaseDetails } from "@/hooks/useDatabaseDetails";
import BridgeLoader from "@/components/feedback/BridgeLoader";
import SqlEditor from "@/components/database/SqlEditor";
import { DataTable } from "@/components/common/DataTable";
import { cn } from "@/lib/utils";

interface QueryTab {
    id: string;
    name: string;
    query: string;
    results: Record<string, any>[];
    rowCount: number;
    error: string | null;
    executionTime: number | null;
    status: 'idle' | 'running' | 'success' | 'error';
}

const SQLWorkspace = () => {
    const { id: dbId } = useParams<{ id: string }>();
    const { data: bridgeReady, isLoading: bridgeLoading } = useBridgeQuery();

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
    const [queryHistory, setQueryHistory] = useState<Array<{
        query: string;
        timestamp: Date;
        rowCount: number;
        success: boolean;
    }>>([]);

    const {
        databaseName,
        tables,
        query,
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

    const addNewTab = () => {
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
    };

    const closeTab = (tabId: string, e: React.MouseEvent) => {
        e.stopPropagation();
        if (tabs.length === 1) return;

        const tabIndex = tabs.findIndex(t => t.id === tabId);
        const newTabs = tabs.filter(t => t.id !== tabId);
        setTabs(newTabs);

        if (activeTabId === tabId) {
            const newActiveIndex = Math.min(tabIndex, newTabs.length - 1);
            setActiveTabId(newTabs[newActiveIndex].id);
        }
    };

    const insertTableQuery = (tableName: string, schema: string) => {
        const newQuery = `SELECT * FROM "${schema}"."${tableName}" LIMIT 100;`;
        updateActiveTabQuery(newQuery);
    };

    const loadFromHistory = (historyQuery: string) => {
        updateActiveTabQuery(historyQuery);
    };

    if (bridgeLoading || bridgeReady === undefined) {
        return <BridgeLoader />;
    }

    return (
        <div className="h-[calc(100vh-32px)] flex flex-col bg-background">
            {/* Top Bar - VS Code style */}
            <header className="h-12 border-b border-border/40 bg-background flex items-center justify-between px-4 shrink-0">
                <div className="flex items-center gap-3">
                    <Link
                        className="h-8 px-2 text-muted-foreground hover:text-foreground"
                        to={`/${dbId}`}
                    >
                        <Button
                            variant="ghost"
                            size="sm"
                        >
                            <Database className="h-4 w-4 mr-2" />
                            <span className="text-sm font-medium">{databaseName || 'Database'}</span>

                        </Button>
                    </Link>
                    <ChevronRight className="h-4 w-4 text-muted-foreground/50" />
                    <span className="text-sm font-medium text-foreground">SQL Workspace</span>
                </div>

                <div className="flex items-center gap-2">
                    {/* Execution status */}
                    {isExecuting && (
                        <div className="flex items-center gap-2 text-xs text-muted-foreground bg-muted/50 px-3 py-1.5 rounded-md">
                            <Loader2 className="h-3.5 w-3.5 animate-spin text-primary" />
                            <span>{queryProgress?.rows || 0} rows</span>
                            <span className="text-muted-foreground/50">•</span>
                            <span>{queryProgress?.elapsed || 0}s</span>
                        </div>
                    )}

                    {/* Run/Stop buttons */}
                    {isExecuting ? (
                        <Button
                            size="sm"
                            variant="destructive"
                            onClick={handleCancelQuery}
                            className="h-8 gap-1.5"
                        >
                            <Square className="h-3.5 w-3.5" />
                            Stop
                        </Button>
                    ) : (
                        <Button
                            size="sm"
                            onClick={handleExecuteQuery}
                            disabled={!activeTab?.query.trim()}
                            className="h-8 gap-1.5"
                        >
                            <Play className="h-3.5 w-3.5" />
                            Run Query
                        </Button>
                    )}
                </div>
            </header>

            {/* Main Content */}
            <div className="flex-1 flex overflow-hidden">
                {/* Left Sidebar */}
                <aside
                    className={cn(
                        "border-r border-border/40 bg-muted/20 flex flex-col shrink-0 transition-all duration-200",
                        sidebarCollapsed ? "w-12" : "w-64"
                    )}
                >
                    {/* Sidebar Header */}
                    <div className="h-10 border-b border-border/40 flex items-center justify-between px-3">
                        {!sidebarCollapsed && (
                            <Tabs value={sidebarTab} onValueChange={(v) => setSidebarTab(v as 'tables' | 'history')}>
                                <TabsList className="h-7 p-0.5 bg-transparent">
                                    <TabsTrigger value="tables" className="h-6 px-2 text-xs data-[state=active]:bg-background">
                                        Tables
                                    </TabsTrigger>
                                    <TabsTrigger value="history" className="h-6 px-2 text-xs data-[state=active]:bg-background">
                                        History
                                    </TabsTrigger>
                                </TabsList>
                            </Tabs>
                        )}
                        <Button
                            variant="ghost"
                            size="icon"
                            className="h-7 w-7"
                            onClick={() => setSidebarCollapsed(!sidebarCollapsed)}
                        >
                            {sidebarCollapsed ? (
                                <PanelLeft className="h-4 w-4" />
                            ) : (
                                <PanelLeftClose className="h-4 w-4" />
                            )}
                        </Button>
                    </div>

                    {/* Sidebar Content */}
                    {!sidebarCollapsed && (
                        <ScrollArea className="flex-1">
                            {sidebarTab === 'tables' ? (
                                <div className="p-2">
                                    {tables.map((table) => (
                                        <button
                                            key={`${table.schema}.${table.name}`}
                                            onClick={() => insertTableQuery(table.name, table.schema)}
                                            className="w-full flex items-center gap-2 px-2 py-1.5 rounded-md text-left hover:bg-muted/50 transition-colors group"
                                        >
                                            <Table2 className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
                                            <span className="text-xs truncate flex-1 font-mono">{table.name}</span>
                                            <span className="text-[10px] text-muted-foreground/60 opacity-0 group-hover:opacity-100 font-mono">
                                                {table.schema}
                                            </span>
                                        </button>
                                    ))}
                                </div>
                            ) : (
                                <div className="p-2">
                                    {queryHistory.length === 0 ? (
                                        <div className="text-center py-8 text-muted-foreground">
                                            <History className="h-8 w-8 mx-auto mb-2 opacity-30" />
                                            <p className="text-xs">No query history</p>
                                        </div>
                                    ) : (
                                        queryHistory.map((item, index) => (
                                            <button
                                                key={index}
                                                onClick={() => loadFromHistory(item.query)}
                                                className="w-full text-left px-2 py-2 rounded-md hover:bg-muted/50 transition-colors mb-1"
                                            >
                                                <div className="flex items-center gap-1.5 mb-1">
                                                    {item.success ? (
                                                        <CheckCircle2 className="h-3 w-3 text-emerald-500" />
                                                    ) : (
                                                        <AlertCircle className="h-3 w-3 text-destructive" />
                                                    )}
                                                    <span className="text-[10px] text-muted-foreground">
                                                        {item.rowCount} rows • {item.timestamp.toLocaleTimeString()}
                                                    </span>
                                                </div>
                                                <p className="text-xs font-mono text-muted-foreground truncate">
                                                    {item.query.slice(0, 50)}...
                                                </p>
                                            </button>
                                        ))
                                    )}
                                </div>
                            )}
                        </ScrollArea>
                    )}

                    {/* Collapsed Sidebar Icons */}
                    {sidebarCollapsed && (
                        <div className="flex flex-col items-center gap-1 p-2">
                            <Tooltip>
                                <TooltipTrigger asChild>
                                    <Button
                                        variant={sidebarTab === 'tables' ? 'secondary' : 'ghost'}
                                        size="icon"
                                        className="h-8 w-8"
                                        onClick={() => {
                                            setSidebarTab('tables');
                                            setSidebarCollapsed(false);
                                        }}
                                    >
                                        <Table2 className="h-4 w-4" />
                                    </Button>
                                </TooltipTrigger>
                                <TooltipContent side="right">Tables</TooltipContent>
                            </Tooltip>
                            <Tooltip>
                                <TooltipTrigger asChild>
                                    <Button
                                        variant={sidebarTab === 'history' ? 'secondary' : 'ghost'}
                                        size="icon"
                                        className="h-8 w-8"
                                        onClick={() => {
                                            setSidebarTab('history');
                                            setSidebarCollapsed(false);
                                        }}
                                    >
                                        <History className="h-4 w-4" />
                                    </Button>
                                </TooltipTrigger>
                                <TooltipContent side="right">History</TooltipContent>
                            </Tooltip>
                        </div>
                    )}
                </aside>

                {/* Editor Area */}
                <div className="flex-1 flex flex-col min-w-0">
                    {/* Query Tabs */}
                    <div className="h-9 border-b border-border/40 bg-muted/10 flex items-center gap-0 overflow-x-auto shrink-0">
                        {tabs.map((tab) => (
                            <button
                                key={tab.id}
                                onClick={() => setActiveTabId(tab.id)}
                                className={cn(
                                    "h-full px-3 flex items-center gap-2 border-r border-border/30 min-w-[120px] max-w-[180px] group transition-colors",
                                    activeTabId === tab.id
                                        ? "bg-background text-foreground"
                                        : "text-muted-foreground hover:text-foreground hover:bg-muted/30"
                                )}
                            >
                                <FileCode className="h-3.5 w-3.5 shrink-0" />
                                <span className="text-xs truncate flex-1">{tab.name}</span>
                                {tab.status === 'running' && (
                                    <Loader2 className="h-3 w-3 animate-spin text-primary shrink-0" />
                                )}
                                {tab.status === 'success' && (
                                    <CheckCircle2 className="h-3 w-3 text-emerald-500 shrink-0" />
                                )}
                                {tab.status === 'error' && (
                                    <AlertCircle className="h-3 w-3 text-destructive shrink-0" />
                                )}
                                {tabs.length > 1 && (
                                    <button
                                        onClick={(e) => closeTab(tab.id, e)}
                                        className="opacity-0 group-hover:opacity-100 hover:bg-muted rounded p-0.5 shrink-0"
                                    >
                                        <X className="h-3 w-3" />
                                    </button>
                                )}
                            </button>
                        ))}
                        <Tooltip>
                            <TooltipTrigger asChild>
                                <button
                                    onClick={addNewTab}
                                    className="h-full px-3 text-muted-foreground hover:text-foreground hover:bg-muted/30 transition-colors"
                                >
                                    <Plus className="h-4 w-4" />
                                </button>
                            </TooltipTrigger>
                            <TooltipContent>New Query Tab</TooltipContent>
                        </Tooltip>
                    </div>

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

                        {/* Results Panel */}
                        <div className="flex-1 flex flex-col overflow-hidden bg-background">
                            {/* Results Header */}
                            <div className="h-9 border-b border-border/40 px-4 flex items-center justify-between bg-muted/10 shrink-0">
                                <div className="flex items-center gap-3">
                                    <span className="text-xs font-medium">Results</span>
                                    {activeTab?.status === 'success' && (
                                        <span className="text-xs text-muted-foreground">
                                            {activeTab.rowCount.toLocaleString()} rows
                                            {activeTab.executionTime && (
                                                <span className="ml-2">• {activeTab.executionTime}s</span>
                                            )}
                                        </span>
                                    )}
                                </div>
                                {activeTab?.results && activeTab.results.length > 0 && (
                                    <Button
                                        variant="ghost"
                                        size="sm"
                                        className="h-6 text-xs"
                                        onClick={() => setTabs(prev => prev.map(tab =>
                                            tab.id === activeTabId ? { ...tab, results: [], rowCount: 0, status: 'idle' } : tab
                                        ))}
                                    >
                                        <Trash2 className="h-3 w-3 mr-1" />
                                        Clear
                                    </Button>
                                )}
                            </div>

                            {/* Results Content */}
                            <div className="flex-1 overflow-auto">
                                {activeTab?.status === 'running' ? (
                                    <div className="flex flex-col items-center justify-center h-full text-muted-foreground">
                                        <Loader2 className="h-8 w-8 animate-spin text-primary mb-3" />
                                        <p className="text-sm">Executing query...</p>
                                        {queryProgress && (
                                            <p className="text-xs mt-1">
                                                {queryProgress.rows} rows • {queryProgress.elapsed}s
                                            </p>
                                        )}
                                    </div>
                                ) : activeTab?.error ? (
                                    <div className="flex flex-col items-center justify-center h-full text-destructive p-8">
                                        <AlertCircle className="h-8 w-8 mb-3 opacity-60" />
                                        <p className="text-sm font-medium mb-2">Query Failed</p>
                                        <p className="text-xs text-center max-w-md opacity-80">{activeTab.error}</p>
                                    </div>
                                ) : activeTab?.results && activeTab.results.length > 0 ? (
                                    <div className="p-4">
                                        <DataTable data={activeTab.results} maxHeight="100%" />
                                    </div>
                                ) : (
                                    <div className="flex flex-col items-center justify-center h-full text-muted-foreground">
                                        <Database className="h-10 w-10 mb-3 opacity-20" />
                                        <p className="text-sm">Run a query to see results</p>
                                        <p className="text-xs mt-1 opacity-60">
                                            Click on a table or write your SQL above
                                        </p>
                                    </div>
                                )}
                            </div>
                        </div>
                    </div>
                </div>
            </div>

            {/* Status Bar */}
            <footer className="h-6 border-t border-border/40 bg-muted/20 px-4 flex items-center justify-between text-[10px] text-muted-foreground shrink-0">
                <div className="flex items-center gap-4">
                    <span className="flex items-center gap-1">
                        <span className="w-2 h-2 rounded-full bg-emerald-500"></span>
                        Connected
                    </span>
                    <span>{databaseName}</span>
                    <span>{tables.length} tables</span>
                </div>
                <div className="flex items-center gap-4">
                    <span>PostgreSQL</span>
                    {activeTab && <span>Ln {activeTab.query.split('\n').length}</span>}
                </div>
            </footer>
        </div>
    );
};

export default SQLWorkspace;
