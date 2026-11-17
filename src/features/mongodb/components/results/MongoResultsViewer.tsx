import React, { useMemo, useState } from "react";
import {
  Clock,
  Copy,
  Check,
  Database,
  Layers,
  ListTree,
  Table as TableIcon,
  AlertCircle,
  Loader2,
  Hash,
  Tags,
  X,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { DataTable } from "@/components/shared/DataTable";
import { MongoDocumentCell, formatMongoValue } from "../MongoDocumentCell";
import { MongoTreeViewer } from "./MongoTreeViewer";
import { MongoExplainView } from "./MongoExplainView";
import {
  MongoMqlExecuteResult,
  MongoExplainResult,
  EJSONDocument,
  MongoFindMqlResult,
  MongoAggregateMqlResult,
  MongoCountMqlResult,
  MongoDistinctMqlResult,
} from "../../types";
import { toast } from "sonner";
import { cn } from "@/lib/utils";

export interface MongoResultsViewerProps {
  result?: MongoMqlExecuteResult | MongoExplainResult | null;
  isLoading?: boolean;
  error?: Error | string | null;
  onClear?: () => void;
  className?: string;
  defaultViewMode?: "tree" | "table";
}

/**
 * Type guard for MongoExplainResult
 */
export function isExplainResult(result: any): result is MongoExplainResult {
  return Boolean(
    result && typeof result === "object" && "queryPlanner" in result && "rawExplain" in result,
  );
}

export const MongoResultsViewer: React.FC<MongoResultsViewerProps> = ({
  result,
  isLoading = false,
  error = null,
  onClear,
  className,
  defaultViewMode = "table",
}) => {
  const [viewMode, setViewMode] = useState<"tree" | "table">(defaultViewMode);
  const [copiedAll, setCopiedAll] = useState(false);

  // Extract errorMessage if error prop is an Error or string
  const errorMessage = useMemo(() => {
    if (!error) return null;
    return typeof error === "string" ? error : error.message || "An unexpected error occurred.";
  }, [error]);

  // Extract documents array if find or aggregate operation
  const documents: EJSONDocument[] | null = useMemo(() => {
    if (!result || isExplainResult(result)) return null;
    if (result.operation === "find" || result.operation === "aggregate") {
      return (result as MongoFindMqlResult | MongoAggregateMqlResult).documents || [];
    }
    return null;
  }, [result]);

  // Derive column list for Table View, pinning _id to the first position
  const columns = useMemo(() => {
    if (!documents || documents.length === 0) return [];
    const keySet = new Set<string>();
    documents.forEach((doc) => {
      if (doc && typeof doc === "object") {
        Object.keys(doc).forEach((k) => keySet.add(k));
      }
    });
    keySet.delete("_id");
    const otherCols = Array.from(keySet).sort();
    return ["_id", ...otherCols];
  }, [documents]);

  const handleCopyAll = () => {
    if (!result) return;
    let payload: any = result;
    if (documents) {
      payload = documents;
    } else if (!isExplainResult(result) && result.operation === "distinct") {
      payload = (result as MongoDistinctMqlResult).values;
    }
    navigator.clipboard.writeText(JSON.stringify(payload, null, 2));
    setCopiedAll(true);
    toast.success("Results copied to clipboard");
    setTimeout(() => setCopiedAll(false), 1500);
  };

  // 1. Loading State
  if (isLoading) {
    return (
      <div
        className={cn(
          "flex flex-col items-center justify-center h-full min-h-[220px] p-8 text-center text-muted-foreground bg-background select-none",
          className,
        )}
      >
        <Loader2 className="h-8 w-8 animate-spin text-primary mb-3" />
        <p className="text-sm font-medium text-foreground">Executing MongoDB Operation...</p>
        <p className="text-xs text-muted-foreground/80 mt-1 max-w-sm">
          Processing request through bridge MQL engine. Cursor documents and metrics will appear
          once finished.
        </p>
      </div>
    );
  }

  // 2. Error State
  if (errorMessage) {
    return (
      <div
        className={cn(
          "flex flex-col items-center justify-center h-full min-h-[220px] p-6 text-center bg-background",
          className,
        )}
      >
        <div className="max-w-xl w-full rounded-lg border border-destructive/40 bg-destructive/10 p-5 text-left text-destructive space-y-3">
          <div className="flex items-center gap-2">
            <AlertCircle className="h-5 w-5 shrink-0" />
            <h4 className="font-semibold text-sm">Query Execution Failed</h4>
          </div>
          <div className="p-3 rounded bg-background/80 border border-destructive/20 font-mono text-xs text-destructive break-all select-text overflow-auto max-h-48">
            {errorMessage}
          </div>
          <div className="flex items-center justify-between">
            <p className="text-[11px] text-destructive/80">
              Check query syntax, collection schema, or permission limits and try running again.
            </p>
            {onClear && (
              <Button
                variant="outline"
                size="sm"
                onClick={onClear}
                className="h-6 px-2 text-xs border-destructive/30 hover:bg-destructive/10"
              >
                Dismiss
              </Button>
            )}
          </div>
        </div>
      </div>
    );
  }

  // 3. Empty State (No query run yet)
  if (!result) {
    return (
      <div
        className={cn(
          "flex flex-col items-center justify-center h-full min-h-[220px] p-8 text-center text-muted-foreground bg-background select-none",
          className,
        )}
      >
        <div className="h-12 w-12 rounded-xl bg-muted/40 border border-border/50 flex items-center justify-center mb-3">
          <Layers className="h-6 w-6 text-muted-foreground/60" />
        </div>
        <p className="text-sm font-semibold text-foreground">No Results</p>
        <p className="text-xs text-muted-foreground/80 mt-1 max-w-sm">
          Execute an MQL operation or Explain above to inspect query results and execution
          statistics.
        </p>
      </div>
    );
  }

  // 4. Render Explain Result
  if (isExplainResult(result)) {
    return (
      <div className={cn("flex flex-col h-full overflow-hidden bg-background", className)}>
        {/* Top metrics toolbar */}
        <div className="h-10 px-4 border-b border-border/40 bg-muted/20 flex items-center justify-between shrink-0 text-xs">
          <div className="flex items-center gap-3">
            <div className="flex items-center gap-1.5 font-mono text-foreground font-medium">
              <Database className="h-3.5 w-3.5 text-emerald-500" />
              <span>db.{result.collection}</span>
            </div>
            <span className="text-muted-foreground/40">|</span>
            <Badge variant="outline" className="text-[11px] px-1.5 py-0 h-5 font-mono">
              explain({result.operation})
            </Badge>
            <div className="flex items-center gap-1 text-muted-foreground">
              <Clock className="h-3.5 w-3.5" />
              <span>{result.executionTimeMs}ms</span>
            </div>
          </div>

          <div className="flex items-center gap-2">
            {onClear && (
              <Button
                variant="ghost"
                size="sm"
                onClick={onClear}
                className="h-7 px-2 text-xs gap-1 text-muted-foreground hover:text-foreground"
                title="Clear Results"
              >
                <X className="h-3 w-3" />
                Clear
              </Button>
            )}

            <Button
              variant="ghost"
              size="sm"
              onClick={handleCopyAll}
              className="h-7 px-2 text-xs gap-1 text-muted-foreground hover:text-foreground"
            >
              {copiedAll ? (
                <Check className="h-3 w-3 text-emerald-500" />
              ) : (
                <Copy className="h-3 w-3" />
              )}
              Copy Explain JSON
            </Button>
          </div>
        </div>

        {/* Explain body */}
        <div className="flex-1 overflow-auto">
          <MongoExplainView explainResult={result} />
        </div>
      </div>
    );
  }

  // 5. Render Count Operations (`countDocuments` & `estimatedDocumentCount`)
  if (result.operation === "countDocuments" || result.operation === "estimatedDocumentCount") {
    const countResult = result as MongoCountMqlResult;
    return (
      <div className={cn("flex flex-col h-full overflow-hidden bg-background", className)}>
        {/* Top metrics toolbar */}
        <div className="h-10 px-4 border-b border-border/40 bg-muted/20 flex items-center justify-between shrink-0 text-xs">
          <div className="flex items-center gap-3">
            <div className="flex items-center gap-1.5 font-mono text-foreground font-medium">
              <Database className="h-3.5 w-3.5 text-emerald-500" />
              <span>db.{countResult.collection}</span>
            </div>
            <span className="text-muted-foreground/40">|</span>
            <Badge variant="outline" className="text-[11px] px-1.5 py-0 h-5 font-mono">
              {countResult.operation}()
            </Badge>
            <div className="flex items-center gap-1 text-muted-foreground">
              <Clock className="h-3.5 w-3.5" />
              <span>{countResult.executionTimeMs}ms</span>
            </div>
          </div>

          <div className="flex items-center gap-2">
            {onClear && (
              <Button
                variant="ghost"
                size="sm"
                onClick={onClear}
                className="h-7 px-2 text-xs gap-1 text-muted-foreground hover:text-foreground"
                title="Clear Results"
              >
                <X className="h-3 w-3" />
                Clear
              </Button>
            )}

            <Button
              variant="ghost"
              size="sm"
              onClick={handleCopyAll}
              className="h-7 px-2 text-xs gap-1 text-muted-foreground hover:text-foreground"
            >
              {copiedAll ? (
                <Check className="h-3 w-3 text-emerald-500" />
              ) : (
                <Copy className="h-3 w-3" />
              )}
              Copy JSON
            </Button>
          </div>
        </div>

        {/* Count Metric Body */}
        <div className="flex-1 flex flex-col items-center justify-center p-8 text-center">
          <div className="p-6 rounded-2xl bg-muted/20 border border-border/50 max-w-sm w-full space-y-2">
            <div className="flex items-center justify-center h-10 w-10 mx-auto rounded-full bg-primary/10 text-primary">
              <Hash className="h-5 w-5" />
            </div>
            <p className="text-xs font-medium text-muted-foreground uppercase tracking-wider">
              {countResult.operation === "estimatedDocumentCount"
                ? "Estimated Document Count"
                : "Count Documents Result"}
            </p>
            <div className="text-4xl font-extrabold font-mono tracking-tight text-foreground select-text py-1">
              {countResult.count.toLocaleString()}
            </div>
            <p className="text-[11px] text-muted-foreground">
              Calculated in {countResult.executionTimeMs}ms on collection{" "}
              <code className="font-mono text-foreground">{countResult.collection}</code>
            </p>
          </div>
        </div>
      </div>
    );
  }

  // 6. Render Distinct Operation
  if (result.operation === "distinct") {
    const distinctResult = result as MongoDistinctMqlResult;
    return (
      <div className={cn("flex flex-col h-full overflow-hidden bg-background", className)}>
        {/* Top metrics toolbar */}
        <div className="h-10 px-4 border-b border-border/40 bg-muted/20 flex items-center justify-between shrink-0 text-xs">
          <div className="flex items-center gap-3">
            <div className="flex items-center gap-1.5 font-mono text-foreground font-medium">
              <Database className="h-3.5 w-3.5 text-emerald-500" />
              <span>db.{distinctResult.collection}</span>
            </div>
            <span className="text-muted-foreground/40">|</span>
            <Badge variant="outline" className="text-[11px] px-1.5 py-0 h-5 font-mono">
              distinct("{distinctResult.field}")
            </Badge>
            <span className="text-muted-foreground">{distinctResult.count} distinct values</span>
            <div className="flex items-center gap-1 text-muted-foreground">
              <Clock className="h-3.5 w-3.5" />
              <span>{distinctResult.executionTimeMs}ms</span>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <div className="flex items-center border border-border/60 rounded p-0.5 bg-background">
              <Button
                variant={viewMode === "table" ? "secondary" : "ghost"}
                size="sm"
                onClick={() => setViewMode("table")}
                className="h-6 px-2 text-[11px] gap-1"
                title="List View"
              >
                <TableIcon className="h-3 w-3" />
                List
              </Button>
              <Button
                variant={viewMode === "tree" ? "secondary" : "ghost"}
                size="sm"
                onClick={() => setViewMode("tree")}
                className="h-6 px-2 text-[11px] gap-1"
                title="Tree View"
              >
                <ListTree className="h-3 w-3" />
                Tree
              </Button>
            </div>

            {onClear && (
              <Button
                variant="ghost"
                size="sm"
                onClick={onClear}
                className="h-7 px-2 text-xs gap-1 text-muted-foreground hover:text-foreground"
                title="Clear Results"
              >
                <X className="h-3 w-3" />
                Clear
              </Button>
            )}

            <Button
              variant="ghost"
              size="sm"
              onClick={handleCopyAll}
              className="h-7 px-2 text-xs gap-1 text-muted-foreground hover:text-foreground"
            >
              {copiedAll ? (
                <Check className="h-3 w-3 text-emerald-500" />
              ) : (
                <Copy className="h-3 w-3" />
              )}
              Copy JSON
            </Button>
          </div>
        </div>

        {/* Distinct Values Body */}
        <div className="flex-1 overflow-auto">
          {viewMode === "tree" ? (
            <MongoTreeViewer data={distinctResult.values} defaultExpandedDepth={1} />
          ) : (
            <div className="p-4 space-y-2">
              <div className="text-xs font-semibold text-muted-foreground mb-2 flex items-center gap-1.5">
                <Tags className="h-3.5 w-3.5" />
                <span>Unique values for field "{distinctResult.field}":</span>
              </div>
              <div className="border border-border/50 rounded-lg overflow-hidden divide-y divide-border/40 font-mono text-xs">
                {distinctResult.values.map((val, idx) => {
                  const formatted = formatMongoValue(val);
                  return (
                    <div
                      key={idx}
                      className="px-3 py-1.5 flex items-center justify-between hover:bg-muted/40 transition-colors"
                    >
                      <div className="flex items-center gap-2 select-text">
                        <span className="text-muted-foreground/60 w-6 text-right select-none">
                          {idx + 1}.
                        </span>
                        {formatted.badgeText && (
                          <Badge
                            variant="outline"
                            className={cn(
                              "text-[10px] px-1 py-0 h-4 border leading-none font-semibold select-none",
                              formatted.badgeColor || "bg-muted/60 text-muted-foreground",
                            )}
                          >
                            {formatted.badgeText}
                          </Badge>
                        )}
                        <span className="text-foreground">{formatted.display}</span>
                      </div>
                      <button
                        onClick={() => {
                          navigator.clipboard.writeText(
                            typeof val === "object" ? JSON.stringify(val) : String(val),
                          );
                          toast.success("Copied value");
                        }}
                        className="text-muted-foreground hover:text-foreground p-1 rounded hover:bg-muted"
                        title="Copy value"
                      >
                        <Copy className="h-3 w-3" />
                      </button>
                    </div>
                  );
                })}
              </div>
            </div>
          )}
        </div>
      </div>
    );
  }

  // 7. Render Document Arrays (`find` & `aggregate`)
  const isFind = result.operation === "find";
  const docCount = documents?.length ?? 0;
  const executionInfo = isFind
    ? `${docCount} documents (total: ${(result as MongoFindMqlResult).totalReturned})`
    : `${docCount} documents (${(result as MongoAggregateMqlResult).stageCount} stages)`;

  return (
    <div className={cn("flex flex-col h-full overflow-hidden bg-background", className)}>
      {/* Top metrics toolbar */}
      <div className="h-10 px-4 border-b border-border/40 bg-muted/20 flex items-center justify-between shrink-0 text-xs">
        <div className="flex items-center gap-3">
          <div className="flex items-center gap-1.5 font-mono text-foreground font-medium">
            <Database className="h-3.5 w-3.5 text-emerald-500" />
            <span>db.{result.collection}</span>
          </div>
          <span className="text-muted-foreground/40">|</span>
          <Badge variant="outline" className="text-[11px] px-1.5 py-0 h-5 font-mono">
            {result.operation}()
          </Badge>
          <span className="text-muted-foreground font-mono">{executionInfo}</span>
          <div className="flex items-center gap-1 text-muted-foreground">
            <Clock className="h-3.5 w-3.5" />
            <span>{result.executionTimeMs}ms</span>
          </div>
        </div>

        {/* View toggle & Copy actions */}
        <div className="flex items-center gap-2">
          <div className="flex items-center border border-border/60 rounded p-0.5 bg-background">
            <Button
              variant={viewMode === "table" ? "secondary" : "ghost"}
              size="sm"
              onClick={() => setViewMode("table")}
              className="h-6 px-2 text-[11px] gap-1"
              title="Table View"
            >
              <TableIcon className="h-3 w-3" />
              Table
            </Button>
            <Button
              variant={viewMode === "tree" ? "secondary" : "ghost"}
              size="sm"
              onClick={() => setViewMode("tree")}
              className="h-6 px-2 text-[11px] gap-1"
              title="Tree View"
            >
              <ListTree className="h-3 w-3" />
              Tree
            </Button>
          </div>

          {onClear && (
            <Button
              variant="ghost"
              size="sm"
              onClick={onClear}
              className="h-7 px-2 text-xs gap-1 text-muted-foreground hover:text-foreground"
              title="Clear Results"
            >
              <X className="h-3 w-3" />
              Clear
            </Button>
          )}

          <Button
            variant="ghost"
            size="sm"
            onClick={handleCopyAll}
            disabled={!documents || documents.length === 0}
            className="h-7 px-2 text-xs gap-1 text-muted-foreground hover:text-foreground"
          >
            {copiedAll ? (
              <Check className="h-3 w-3 text-emerald-500" />
            ) : (
              <Copy className="h-3 w-3" />
            )}
            Copy All JSON
          </Button>
        </div>
      </div>

      {/* Main results body */}
      <div className="flex-1 overflow-hidden relative">
        {docCount === 0 ? (
          <div className="flex flex-col items-center justify-center h-full p-8 text-center text-muted-foreground">
            <Layers className="h-8 w-8 text-muted-foreground/40 mb-2" />
            <p className="text-xs font-medium text-foreground">0 documents returned</p>
            <p className="text-[11px] text-muted-foreground/80 mt-0.5">
              No matching documents were found for this query filter.
            </p>
          </div>
        ) : viewMode === "tree" ? (
          <MongoTreeViewer data={documents} defaultExpandedDepth={1} />
        ) : (
          <div className="h-full w-full overflow-hidden">
            <DataTable
              data={documents!}
              columns={columns}
              maxHeight="none"
              showRowNumbers={true}
              renderCell={(val, col, row) => (
                <MongoDocumentCell value={val} column={col} row={row} />
              )}
            />
          </div>
        )}
      </div>
    </div>
  );
};
