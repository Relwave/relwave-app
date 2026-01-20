import {
    Table2,
    PanelLeftClose,
    PanelLeft,
    History,
    AlertCircle,
    CheckCircle2,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
    Tooltip,
    TooltipContent,
    TooltipTrigger,
} from "@/components/ui/tooltip";
import { cn } from "@/lib/utils";
import { TableInfo, QueryHistoryItem } from "./types";

interface WorkspaceSidebarProps {
    tables: TableInfo[];
    queryHistory: QueryHistoryItem[];
    collapsed: boolean;
    activeTab: 'tables' | 'history';
    onToggleCollapse: () => void;
    onTabChange: (tab: 'tables' | 'history') => void;
    onTableClick: (tableName: string, schema: string) => void;
    onHistoryClick: (query: string) => void;
}

export function WorkspaceSidebar({
    tables,
    queryHistory,
    collapsed,
    activeTab,
    onToggleCollapse,
    onTabChange,
    onTableClick,
    onHistoryClick,
}: WorkspaceSidebarProps) {
    return (
        <aside
            className={cn(
                "border-r border-border/40 bg-muted/20 flex flex-col shrink-0 transition-all duration-200",
                collapsed ? "w-12" : "w-64"
            )}
        >
            {/* Sidebar Header */}
            <div className="h-10 border-b border-border/40 flex items-center justify-between px-3">
                {!collapsed && (
                    <Tabs value={activeTab} onValueChange={(v) => onTabChange(v as 'tables' | 'history')}>
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
                    onClick={onToggleCollapse}
                >
                    {collapsed ? (
                        <PanelLeft className="h-4 w-4" />
                    ) : (
                        <PanelLeftClose className="h-4 w-4" />
                    )}
                </Button>
            </div>

            {/* Sidebar Content */}
            {!collapsed && (
                <ScrollArea className="flex-1">
                    {activeTab === 'tables' ? (
                        <div className="p-2">
                            {tables.map((table) => (
                                <button
                                    key={`${table.schema}.${table.name}`}
                                    onClick={() => onTableClick(table.name, table.schema)}
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
                                        onClick={() => onHistoryClick(item.query)}
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
            {collapsed && (
                <div className="flex flex-col items-center gap-1 p-2">
                    <Tooltip>
                        <TooltipTrigger asChild>
                            <Button
                                variant={activeTab === 'tables' ? 'secondary' : 'ghost'}
                                size="icon"
                                className="h-8 w-8"
                                onClick={() => {
                                    onTabChange('tables');
                                    onToggleCollapse();
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
                                variant={activeTab === 'history' ? 'secondary' : 'ghost'}
                                size="icon"
                                className="h-8 w-8"
                                onClick={() => {
                                    onTabChange('history');
                                    onToggleCollapse();
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
    );
}
