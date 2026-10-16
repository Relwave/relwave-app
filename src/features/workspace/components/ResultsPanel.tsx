import {
  Database,
  AlertCircle,
  Loader2,
  Trash2,
  Copy,
  FileSpreadsheet,
  FileJson,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { DataTable } from "@/components/shared/DataTable";
import { QueryTab } from "../types";
import { toast } from "sonner";

interface ResultsPanelProps {
  activeTab: QueryTab | undefined;
  queryProgress: { rows: number; elapsed: number } | null;
  onClearResults: () => void;
}

export function ResultsPanel({ activeTab, queryProgress, onClearResults }: ResultsPanelProps) {
  const handleCopyCSV = () => {
    if (!activeTab?.results || activeTab.results.length === 0) return;
    const headers = Object.keys(activeTab.results[0]);
    const csvRows = [
      headers.join(","),
      ...activeTab.results.map((r) =>
        headers
          .map((h) => {
            const val = r[h];
            if (val === null || val === undefined) return "";
            const str = String(val).replace(/"/g, '""');
            return `"${str}"`;
          })
          .join(","),
      ),
    ];
    navigator.clipboard.writeText(csvRows.join("\n"));
    toast.success("Results copied as CSV", { duration: 1500 });
  };

  const handleCopyJSON = () => {
    if (!activeTab?.results || activeTab.results.length === 0) return;
    navigator.clipboard.writeText(JSON.stringify(activeTab.results, null, 2));
    toast.success("Results copied as JSON", { duration: 1500 });
  };

  const handleCopyError = () => {
    if (!activeTab?.error) return;
    navigator.clipboard.writeText(activeTab.error);
    toast.success("Error message copied", { duration: 1500 });
  };

  return (
    <div className="flex-1 flex flex-col overflow-hidden bg-background">
      {/* Results Header */}
      <div className="h-9 border-b border-border/40 px-4 flex items-center justify-between bg-muted/10 shrink-0">
        <div className="flex items-center gap-3">
          <span className="text-xs font-medium">Results</span>
          {activeTab?.status === "success" && (
            <span className="text-xs text-muted-foreground font-mono tabular-nums">
              {activeTab.rowCount.toLocaleString()} rows
              {activeTab.executionTime && (
                <span className="ml-2">• {activeTab.executionTime}s</span>
              )}
            </span>
          )}
        </div>
        {activeTab?.results && activeTab.results.length > 0 && (
          <div className="flex items-center gap-1.5">
            <Button
              variant="outline"
              size="sm"
              className="h-6 text-xs px-2 gap-1"
              onClick={handleCopyCSV}
              title="Copy results as CSV format"
            >
              <FileSpreadsheet className="h-3 w-3" />
              CSV
            </Button>
            <Button
              variant="outline"
              size="sm"
              className="h-6 text-xs px-2 gap-1"
              onClick={handleCopyJSON}
              title="Copy results as formatted JSON"
            >
              <FileJson className="h-3 w-3" />
              JSON
            </Button>
            <Button
              variant="ghost"
              size="sm"
              className="h-6 text-xs px-2"
              onClick={onClearResults}
              title="Clear results view"
            >
              <Trash2 className="h-3 w-3 mr-1" />
              Clear
            </Button>
          </div>
        )}
      </div>

      {/* Results Content */}
      <div className="flex-1 overflow-auto">
        {activeTab?.status === "running" ? (
          <div className="flex flex-col items-center justify-center h-full text-muted-foreground font-mono">
            <Loader2 className="h-8 w-8 animate-spin text-primary mb-3" />
            <p className="text-sm">Executing query...</p>
            {queryProgress && (
              <p className="text-xs mt-1 tabular-nums">
                {queryProgress.rows} rows • {queryProgress.elapsed}s
              </p>
            )}
          </div>
        ) : activeTab?.error ? (
          <div className="flex flex-col items-center justify-center h-full text-destructive p-8">
            <AlertCircle className="h-8 w-8 mb-3 opacity-60" />
            <p className="text-sm font-medium mb-1">Query Failed</p>
            <p className="text-xs text-center max-w-lg opacity-85 font-mono bg-destructive/10 border border-destructive/20 p-3 rounded-md mb-3 select-text">
              {activeTab.error}
            </p>
            <Button
              size="sm"
              variant="outline"
              className="h-7 text-xs gap-1.5 border-destructive/30 hover:bg-destructive/10"
              onClick={handleCopyError}
            >
              <Copy className="h-3 w-3" />
              Copy Error
            </Button>
          </div>
        ) : activeTab?.results && activeTab.results.length > 0 ? (
          <div className="p-4">
            <DataTable data={activeTab.results} maxHeight="100%" />
          </div>
        ) : activeTab?.status === "success" ? (
          <div className="flex flex-col items-center justify-center h-full text-muted-foreground">
            <Database className="h-10 w-10 mb-3 opacity-20" />
            <p className="text-sm font-medium">Query executed successfully</p>
            <p className="text-xs mt-1 opacity-60">0 rows returned</p>
          </div>
        ) : (
          <div className="flex flex-col items-center justify-center h-full text-muted-foreground">
            <Database className="h-10 w-10 mb-3 opacity-20" />
            <p className="text-sm">Run a query to see results</p>
            <p className="text-xs mt-1 opacity-60">Click on a table or write your SQL above</p>
          </div>
        )}
      </div>
    </div>
  );
}
