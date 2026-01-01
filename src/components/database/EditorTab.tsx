import { FC } from "react";
import { Button } from "@/components/ui/button";
import { Loader2, Play, RefreshCw, X, Code2, Clock, AlertCircle } from "lucide-react";
import SqlEditor from "./SqlEditor";
import { DataTable } from "@/components/common/DataTable";
import { QueryProgress, TableRow } from "@/types/database";

interface EditorTabProps {
  query: string;
  tableData: TableRow[];
  rowCount: number;
  queryProgress: QueryProgress | null;
  queryError: string | null;
  isExecuting: boolean;
  onQueryChange: (query: string) => void;
  onExecuteQuery: () => void;
  onCancelQuery: () => void;
}

const EditorTab: FC<EditorTabProps> = ({
  query,
  tableData,
  rowCount,
  queryProgress,
  queryError,
  isExecuting,
  onQueryChange,
  onExecuteQuery,
  onCancelQuery,
}) => {
  const canExecute = !isExecuting && query.trim().length > 0;

  return (
    <>
      {/* SQL Query Editor */}
      <div className="border border-border/20 rounded-lg overflow-hidden">
        <div className="border-b border-border/20 px-6 py-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2.5">
              <Code2 className="h-4 w-4 text-muted-foreground/60" />
              <div>
                <h3 className="text-sm font-medium text-foreground">SQL Query Editor</h3>
                <p className="text-xs text-muted-foreground/70 mt-0.5">
                  Write and execute your queries
                </p>
              </div>
            </div>

            <div className="flex items-center gap-2">
              {isExecuting && (
                <Button variant="destructive" size="sm" onClick={onCancelQuery} className="h-8 text-xs">
                  <X className="h-3.5 w-3.5 mr-1" />
                  Cancel
                </Button>
              )}
              <Button onClick={onExecuteQuery} disabled={!canExecute} size="sm" className="h-8 text-xs">
                {isExecuting ? (
                  <>
                    <RefreshCw className="h-3.5 w-3.5 mr-1 animate-spin" />
                    Executing...
                  </>
                ) : (
                  <>
                    <Play className="h-3.5 w-3.5 mr-1" />
                    Execute
                  </>
                )}
              </Button>
            </div>
          </div>
        </div>

        <div className="p-6">
          <SqlEditor
            value={query}
            onChange={onQueryChange}
            disabled={isExecuting}
            placeholder="-- Enter your SQL query here
SELECT * FROM users WHERE role = 'Admin';

-- Press Execute to run your query"
            minHeight="200px"
          />
        </div>
      </div>

      {/* Query Results */}
      <div className="border border-border/20 rounded-lg overflow-hidden">
        <div className="border-b border-border/20 px-6 py-4">
          <div className="flex items-center justify-between">
            <div>
              <h3 className="text-sm font-medium text-foreground">Query Results</h3>
              <div className="flex items-center gap-2 mt-0.5">
                <p className="text-xs text-muted-foreground/70">
                  {isExecuting ? (
                    <>
                      <RefreshCw className="h-3 w-3 animate-spin inline mr-1" />
                      Fetching results... ({rowCount.toLocaleString()} rows)
                    </>
                  ) : (
                    `${rowCount.toLocaleString()} rows retrieved`
                  )}
                </p>
                {queryProgress && (
                  <span className="flex items-center gap-1 text-xs text-muted-foreground/60">
                    <Clock className="h-3 w-3" />
                    {queryProgress.elapsed}s
                  </span>
                )}
              </div>
            </div>

            <div className="flex items-center gap-2">
              <div
                className={`h-1.5 w-1.5 rounded-full ${queryError ? "bg-red-500" : isExecuting ? "bg-yellow-500" : "bg-emerald-500"
                  }`}
              />
              <span className="text-xs text-muted-foreground/70">
                {queryError ? "Error" : isExecuting ? "Processing" : "Complete"}
              </span>
            </div>
          </div>
        </div>

        <div className="p-6">
          {isExecuting && rowCount === 0 ? (
            <div className="text-center py-12 text-muted-foreground">
              <Loader2 className="h-7 w-7 animate-spin mx-auto mb-3 text-muted-foreground/50" />
              <p className="text-sm font-medium">Awaiting first results batch...</p>
              <p className="text-xs text-muted-foreground/60 mt-1">
                Your query is being processed
              </p>
            </div>
          ) : queryError ? (
            <div className="flex flex-col items-center justify-center py-12 text-muted-foreground">
              <AlertCircle className="h-7 w-7 text-destructive mb-3" />
              <p className="text-sm font-medium text-destructive">Query Failed</p>
              <p className="text-xs text-muted-foreground/60 mt-1 max-w-md text-center px-4">
                {queryError}
              </p>
            </div>
          ) : (
            <DataTable data={tableData} />
          )}
        </div>
      </div>
    </>
  );
};

export default EditorTab;