import { FC } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Loader2, Play, RefreshCw, X, Code2, Clock } from "lucide-react";
import { Textarea } from "@/components/ui/textarea";
import { DataTable } from "@/components/common/DataTable";
import { QueryProgress, TableRow } from "@/types/database";

interface EditorTabProps {
  query: string;
  tableData: TableRow[];
  rowCount: number;
  queryProgress: QueryProgress | null;
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
  isExecuting,
  onQueryChange,
  onExecuteQuery,
  onCancelQuery,
}) => {
  const canExecute = !isExecuting && query.trim().length > 0;

  return (
    <>
      {/* SQL Query Editor Card */}
      <Card className="border rounded-lg">
        <CardHeader className="border-b pb-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <Code2 className="h-5 w-5 text-muted-foreground" />
              <div>
                <CardTitle className="text-lg font-semibold">SQL Query Editor</CardTitle>
                <p className="text-xs text-muted-foreground mt-1">
                  Write and execute your queries
                </p>
              </div>
            </div>

            <div className="flex items-center gap-2">
              {isExecuting && (
                <Button variant="destructive" size="sm" onClick={onCancelQuery}>
                  <X className="h-4 w-4 mr-1" />
                  Cancel
                </Button>
              )}
              <Button onClick={onExecuteQuery} disabled={!canExecute} size="sm">
                {isExecuting ? (
                  <>
                    <RefreshCw className="h-4 w-4 mr-1 animate-spin" />
                    Executing...
                  </>
                ) : (
                  <>
                    <Play className="h-4 w-4 mr-1" />
                    Execute Query
                  </>
                )}
              </Button>
            </div>
          </div>
        </CardHeader>

        <CardContent className="pt-4">
          <div className="relative">
            <Textarea
              value={query}
              onChange={(e) => onQueryChange(e.target.value)}
              disabled={isExecuting}
              className="font-mono text-sm min-h-[200px] resize-y bg-muted/30 border"
              placeholder="-- Enter your SQL query here
SELECT * FROM users WHERE role = 'Admin';

-- Press Execute to run your query"
            />

            <div className="absolute bottom-2 right-2 text-xs text-muted-foreground bg-background/80 px-2 py-0.5 rounded">
              {query.length} chars
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Query Results Section */}
      <Card className="border rounded-lg">
        <CardHeader className="border-b pb-4">
          <div className="flex items-center justify-between">
            <div>
              <CardTitle className="text-lg font-semibold">Query Results</CardTitle>
              <CardDescription className="flex items-center gap-2 mt-1">
                {isExecuting ? (
                  <>
                    <RefreshCw className="h-3 w-3 animate-spin" />
                    <span>Fetching results... ({rowCount.toLocaleString()} rows)</span>
                  </>
                ) : (
                  <span>{rowCount.toLocaleString()} rows retrieved</span>
                )}
                {queryProgress && (
                  <span className="flex items-center gap-1 text-xs text-muted-foreground">
                    <Clock className="h-3 w-3" />
                    {queryProgress.elapsed}s
                  </span>
                )}
              </CardDescription>
            </div>

            <div className="flex items-center gap-2">
              <div
                className={`h-2 w-2 rounded-full ${isExecuting ? "bg-yellow-500" : "bg-emerald-500"}`}
              />
              <span className="text-xs text-muted-foreground">
                {isExecuting ? "Processing" : "Complete"}
              </span>
            </div>
          </div>
        </CardHeader>

        <CardContent className="pt-4">
          {isExecuting && rowCount === 0 ? (
            <div className="text-center py-16 text-muted-foreground">
              <Loader2 className="h-8 w-8 animate-spin mx-auto mb-3" />
              <p className="text-sm font-medium">Awaiting first results batch...</p>
              <p className="text-xs text-muted-foreground mt-1">
                Your query is being processed
              </p>
            </div>
          ) : (
            <DataTable data={tableData} />
          )}
        </CardContent>
      </Card>
    </>
  );
};

export default EditorTab;