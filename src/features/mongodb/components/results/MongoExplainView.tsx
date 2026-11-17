import React, { useState, useMemo } from "react";
import {
  AlertTriangle,
  CheckCircle2,
  Clock,
  Database,
  FileSearch,
  Layers,
  ChevronDown,
  ChevronRight,
  Info,
  Zap,
  Square,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { MongoTreeViewer } from "./MongoTreeViewer";
import { MongoExplainResult } from "../../types";
import { cn } from "@/lib/utils";

export interface ExplainAnalysis {
  winningStage: string;
  isCollScan: boolean;
  isIxScan: boolean;
  indexName?: string;
  executionTimeMs: number;
  totalDocsExamined?: number;
  totalKeysExamined?: number;
  nReturned?: number;
  hasExecutionStats: boolean;
  efficiencyRatio?: number;
  highScanRatio: boolean;
  rejectedPlansCount: number;
  namespace: string;
}

/**
 * Recursively inspects stages in winningPlan or executionStages to find stage types and index names.
 */
function inspectStagesRecursive(node: any, stages: Array<{ stage: string; indexName?: string }>) {
  if (!node || typeof node !== "object") return;

  if (typeof node.stage === "string") {
    stages.push({
      stage: node.stage,
      indexName: typeof node.indexName === "string" ? node.indexName : undefined,
    });
  }

  if (node.inputStage) {
    inspectStagesRecursive(node.inputStage, stages);
  }
  if (Array.isArray(node.inputStages)) {
    for (const s of node.inputStages) {
      inspectStagesRecursive(s, stages);
    }
  }
  if (Array.isArray(node.stages)) {
    for (const s of node.stages) {
      inspectStagesRecursive(s, stages);
    }
  }
  if (node.queryPlan) {
    inspectStagesRecursive(node.queryPlan, stages);
  }
}

/**
 * Parses and extracts key execution and planning metrics from MongoExplainResult.
 */
export function analyzeExplainPlan(explain: MongoExplainResult): ExplainAnalysis {
  const queryPlanner = explain.queryPlanner || ({} as any);
  const executionStats = explain.executionStats;
  const winningPlan = queryPlanner.winningPlan || {};

  const collectedStages: Array<{ stage: string; indexName?: string }> = [];
  inspectStagesRecursive(winningPlan, collectedStages);
  if (executionStats?.executionStages) {
    inspectStagesRecursive(executionStats.executionStages, collectedStages);
  }

  const isCollScan = collectedStages.some((s) => s.stage === "COLLSCAN");
  const ixScanItem = collectedStages.find((s) => s.stage === "IXSCAN" || s.indexName);
  const isIxScan = Boolean(ixScanItem);
  const indexName = ixScanItem?.indexName;

  // Determine primary winning stage
  let winningStage = "UNKNOWN";
  if (typeof winningPlan.stage === "string") {
    winningStage = winningPlan.stage;
  } else if (collectedStages.length > 0) {
    winningStage = collectedStages[0].stage;
  }

  const executionTimeMs = executionStats?.executionTimeMillis ?? explain.executionTimeMs ?? 0;
  const hasExecutionStats = Boolean(executionStats);

  const totalDocsExamined = executionStats?.totalDocsExamined;
  const totalKeysExamined = executionStats?.totalKeysExamined;
  const nReturned = executionStats?.nReturned;

  let efficiencyRatio: number | undefined;
  let highScanRatio = false;

  if (hasExecutionStats && typeof totalDocsExamined === "number" && typeof nReturned === "number") {
    if (nReturned > 0) {
      efficiencyRatio = totalDocsExamined / nReturned;
      if (efficiencyRatio > 10) {
        highScanRatio = true;
      }
    } else if (totalDocsExamined > 0) {
      highScanRatio = true;
    }
  }

  return {
    winningStage,
    isCollScan,
    isIxScan,
    indexName,
    executionTimeMs,
    totalDocsExamined,
    totalKeysExamined,
    nReturned,
    hasExecutionStats,
    efficiencyRatio,
    highScanRatio,
    rejectedPlansCount: queryPlanner.rejectedPlans?.length ?? 0,
    namespace: queryPlanner.namespace ?? explain.collection,
  };
}

export interface MongoExplainViewProps {
  explainResult: MongoExplainResult;
  className?: string;
  onCancel?: () => void;
  isExecuting?: boolean;
}

export const MongoExplainView: React.FC<MongoExplainViewProps> = ({
  explainResult,
  className,
  onCancel,
  isExecuting = false,
}) => {
  const [showRawTree, setShowRawTree] = useState(false);

  const analysis = useMemo(() => {
    return analyzeExplainPlan(explainResult);
  }, [explainResult]);

  return (
    <div className={cn("flex flex-col h-full overflow-auto p-4 gap-4 bg-background", className)}>
      {onCancel && (
        <div className="flex justify-end">
          <Button
            variant="destructive"
            size="sm"
            onClick={onCancel}
            disabled={!isExecuting}
            className="h-7 px-2 text-xs gap-1"
            data-testid="cancel-explain-button"
            title="Cancel Explain execution"
          >
            <Square className="h-3 w-3 fill-current" />
            Cancel
          </Button>
        </div>
      )}
      {/* 1. COLLSCAN Warning Banner if unindexed */}
      {analysis.isCollScan && !analysis.isIxScan && (
        <div className="rounded-lg border border-amber-500/40 bg-amber-500/10 p-3 text-xs text-amber-600 dark:text-amber-400 flex items-start gap-3">
          <AlertTriangle className="h-5 w-5 shrink-0 text-amber-500 mt-0.5" />
          <div className="space-y-1">
            <p className="font-semibold text-sm text-foreground">
              COLLSCAN (Collection Scan) Detected
            </p>
            <p className="leading-relaxed">
              This query executed without an index and performed a full collection scan
              {analysis.totalDocsExamined !== undefined
                ? ` across ${analysis.totalDocsExamined.toLocaleString()} documents.`
                : "."}{" "}
              Creating an index on the filtered fields will significantly improve read performance.
            </p>
          </div>
        </div>
      )}

      {/* 2. High Scan-to-Return Ratio Warning */}
      {analysis.highScanRatio && !analysis.isCollScan && (
        <div className="rounded-lg border border-amber-500/30 bg-amber-500/5 p-3 text-xs text-amber-600 dark:text-amber-400 flex items-start gap-2.5">
          <Info className="h-4 w-4 shrink-0 mt-0.5" />
          <div className="space-y-0.5">
            <span className="font-semibold">Inefficient Index Filtering: </span>
            <span>
              Scanned {analysis.totalDocsExamined?.toLocaleString()} documents to return{" "}
              {analysis.nReturned?.toLocaleString()} results. Review composite index ordering.
            </span>
          </div>
        </div>
      )}

      {/* 3. Summary Metrics Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 gap-3">
        {/* Winning Stage Card */}
        <Card className="bg-muted/20 border-border/50">
          <CardHeader className="p-3 pb-1">
            <CardTitle className="text-xs font-medium text-muted-foreground flex items-center justify-between">
              <span>Winning Stage</span>
              <Layers className="h-3.5 w-3.5 text-muted-foreground/60" />
            </CardTitle>
          </CardHeader>
          <CardContent className="p-3 pt-1">
            <div className="flex items-center gap-1.5 mt-1">
              {analysis.isIxScan ? (
                <Badge className="bg-emerald-500/15 text-emerald-600 dark:text-emerald-400 border-emerald-500/30 text-xs font-mono">
                  <CheckCircle2 className="h-3 w-3 mr-1" />
                  {analysis.winningStage}
                </Badge>
              ) : analysis.isCollScan ? (
                <Badge variant="destructive" className="text-xs font-mono">
                  <AlertTriangle className="h-3 w-3 mr-1" />
                  COLLSCAN
                </Badge>
              ) : (
                <Badge variant="secondary" className="text-xs font-mono">
                  {analysis.winningStage}
                </Badge>
              )}
            </div>
            <p className="text-[11px] text-muted-foreground/80 mt-1 truncate">
              {analysis.isIxScan
                ? `Index: ${analysis.indexName || "Active"}`
                : analysis.isCollScan
                  ? "Full collection scan"
                  : "Optimized plan"}
            </p>
          </CardContent>
        </Card>

        {/* Execution Time Card */}
        <Card className="bg-muted/20 border-border/50">
          <CardHeader className="p-3 pb-1">
            <CardTitle className="text-xs font-medium text-muted-foreground flex items-center justify-between">
              <span>Execution Time</span>
              <Clock className="h-3.5 w-3.5 text-muted-foreground/60" />
            </CardTitle>
          </CardHeader>
          <CardContent className="p-3 pt-1">
            <div className="text-xl font-bold font-mono tracking-tight mt-0.5">
              {analysis.executionTimeMs}
              <span className="text-xs font-normal text-muted-foreground ml-1">ms</span>
            </div>
            <p className="text-[11px] text-muted-foreground/80 mt-1">
              Operation: {explainResult.operation}()
            </p>
          </CardContent>
        </Card>

        {/* Documents Examined vs Returned Card */}
        <Card className="bg-muted/20 border-border/50">
          <CardHeader className="p-3 pb-1">
            <CardTitle className="text-xs font-medium text-muted-foreground flex items-center justify-between">
              <span>Docs Examined / Returned</span>
              <Database className="h-3.5 w-3.5 text-muted-foreground/60" />
            </CardTitle>
          </CardHeader>
          <CardContent className="p-3 pt-1">
            {analysis.hasExecutionStats ? (
              <>
                <div className="text-lg font-bold font-mono tracking-tight mt-0.5">
                  {analysis.totalDocsExamined?.toLocaleString() ?? 0}
                  <span className="text-muted-foreground font-normal mx-1">/</span>
                  <span className="text-emerald-600 dark:text-emerald-400">
                    {analysis.nReturned?.toLocaleString() ?? 0}
                  </span>
                </div>
                <p className="text-[11px] text-muted-foreground/80 mt-1">
                  Keys examined: {analysis.totalKeysExamined?.toLocaleString() ?? 0}
                </p>
              </>
            ) : (
              <div className="text-xs text-muted-foreground italic mt-2">
                Planner only (no stats)
              </div>
            )}
          </CardContent>
        </Card>

        {/* Index Utilization Card */}
        <Card className="bg-muted/20 border-border/50">
          <CardHeader className="p-3 pb-1">
            <CardTitle className="text-xs font-medium text-muted-foreground flex items-center justify-between">
              <span>Index Status</span>
              <Zap className="h-3.5 w-3.5 text-muted-foreground/60" />
            </CardTitle>
          </CardHeader>
          <CardContent className="p-3 pt-1">
            <div className="mt-1">
              {analysis.isIxScan ? (
                <span className="inline-flex items-center text-xs font-medium text-emerald-600 dark:text-emerald-400">
                  <CheckCircle2 className="h-3.5 w-3.5 mr-1" />
                  Index Utilized
                </span>
              ) : (
                <span className="inline-flex items-center text-xs font-medium text-amber-600 dark:text-amber-400">
                  <AlertTriangle className="h-3.5 w-3.5 mr-1" />
                  No Index Used
                </span>
              )}
            </div>
            <p className="text-[11px] text-muted-foreground/80 mt-1 truncate">
              {analysis.indexName ? `Index: ${analysis.indexName}` : "Unindexed query"}
            </p>
          </CardContent>
        </Card>
      </div>

      {/* 4. Notice if executionStats were omitted */}
      {!analysis.hasExecutionStats && (
        <div className="rounded-md border border-border/50 bg-muted/20 px-3 py-2 text-xs text-muted-foreground flex items-center gap-2">
          <Info className="h-3.5 w-3.5 shrink-0" />
          <span>
            Execution statistics were not returned (queryPlanner verbosity). Run explain with
            executionStats to view docs examined.
          </span>
        </div>
      )}

      {/* 5. Collapsible Raw Explain Document */}
      <div className="border border-border/50 rounded-lg overflow-hidden bg-card mt-2">
        <button
          onClick={() => setShowRawTree(!showRawTree)}
          className="w-full flex items-center justify-between px-4 py-2.5 bg-muted/30 hover:bg-muted/50 transition-colors text-xs font-semibold text-foreground select-none"
        >
          <div className="flex items-center gap-2">
            <FileSearch className="h-4 w-4 text-muted-foreground" />
            <span>Raw Explain Tree</span>
            <span className="text-muted-foreground font-normal text-[11px]">
              ({explainResult.rawExplain ? Object.keys(explainResult.rawExplain).length : 0} root
              properties)
            </span>
          </div>
          {showRawTree ? (
            <ChevronDown className="h-4 w-4 text-muted-foreground" />
          ) : (
            <ChevronRight className="h-4 w-4 text-muted-foreground" />
          )}
        </button>

        {showRawTree && (
          <div className="border-t border-border/40 p-2 min-h-[250px] max-h-[500px] overflow-auto">
            <MongoTreeViewer
              data={explainResult.rawExplain || explainResult}
              defaultExpandedDepth={2}
            />
          </div>
        )}
      </div>
    </div>
  );
};
