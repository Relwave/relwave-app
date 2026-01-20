import { Database, AlertCircle, Loader2, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { DataTable } from "@/components/common/DataTable";
import { QueryTab } from "./types";

interface ResultsPanelProps {
    activeTab: QueryTab | undefined;
    queryProgress: { rows: number; elapsed: number } | null;
    onClearResults: () => void;
}

export function ResultsPanel({
    activeTab,
    queryProgress,
    onClearResults,
}: ResultsPanelProps) {
    return (
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
                        onClick={onClearResults}
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
    );
}
