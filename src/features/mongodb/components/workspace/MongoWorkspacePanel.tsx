import { useState, useEffect, useCallback } from "react";
import { useMongoCollections } from "@/features/project/hooks/useDbQueries";
import { useExecuteMql, useExplainMql } from "../../hooks/useMongoMql";
import { MongoMqlEditor } from "../editor/MongoMqlEditor";
import { Button } from "@/components/ui/button";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Database,
  Play,
  FileSearch,
  CheckCircle2,
  AlertCircle,
  Loader2,
  Layers,
} from "lucide-react";
import type { MongoMqlOperation, MongoExplainTarget } from "../../types";

export type MongoWorkspaceOpType =
  | "find"
  | "aggregate"
  | "countDocuments"
  | "estimatedDocumentCount"
  | "distinct";

export const OPERATION_TEMPLATES: Record<MongoWorkspaceOpType, string> = {
  find: `{\n  "filter": {}\n}`,
  countDocuments: `{\n  "filter": {}\n}`,
  estimatedDocumentCount: `{}`,
  distinct: `{\n  "field": "_id",\n  "filter": {}\n}`,
  aggregate: `[\n  {\n    "$match": {}\n  }\n]`,
};

export const EXPLAIN_SUPPORTED_OPERATIONS = new Set<MongoWorkspaceOpType>(["find", "aggregate"]);

export function isExplainSupported(op: MongoWorkspaceOpType): boolean {
  return EXPLAIN_SUPPORTED_OPERATIONS.has(op);
}

export function getExplainDisabledReason(op: MongoWorkspaceOpType): string | null {
  if (isExplainSupported(op)) return null;
  return `Explain plan is only supported for find() and aggregate() operations in MongoDB M5. It is unavailable for ${op}().`;
}

export function MongoWorkspacePanel({
  dbId,
  databaseName,
}: {
  dbId: string;
  databaseName: string;
}) {
  const { data: collectionsData, isLoading: collectionsLoading } = useMongoCollections(dbId);

  const collections = collectionsData?.collections || [];
  const [selectedCollection, setSelectedCollection] = useState<string>("");
  const [operation, setOperation] = useState<MongoWorkspaceOpType>("find");
  const [queryText, setQueryText] = useState<string>(OPERATION_TEMPLATES.find);
  const [validationError, setValidationError] = useState<string | null>(null);
  const [statusMessage, setStatusMessage] = useState<string | null>(null);

  // Sync initial collection or reset if connection dbId changes
  useEffect(() => {
    if (collections.length > 0 && !collections.some((c) => c.name === selectedCollection)) {
      setSelectedCollection(collections[0].name);
    }
  }, [collections, selectedCollection]);

  // Handle operation change and update template if unmodified
  const handleOperationChange = useCallback(
    (newOp: MongoWorkspaceOpType) => {
      setOperation(newOp);
      setValidationError(null);
      setQueryText(OPERATION_TEMPLATES[newOp]);
    },
    []
  );

  const executeMqlMutation = useExecuteMql(dbId);
  const explainMqlMutation = useExplainMql(dbId);

  const isExecuting = executeMqlMutation.isPending || explainMqlMutation.isPending;

  const handleRunQuery = useCallback(() => {
    setValidationError(null);
    setStatusMessage(null);

    if (!selectedCollection) {
      setValidationError("Please select a collection before running a query.");
      return;
    }

    let parsedPayload: any;
    try {
      parsedPayload = JSON.parse(queryText.trim() || "{}");
    } catch (err: any) {
      setValidationError(`Invalid JSON payload: ${err.message}`);
      return;
    }

    let opPayload: MongoMqlOperation;
    if (operation === "find") {
      opPayload = {
        operation: "find",
        payload: {
          filter: parsedPayload.filter ?? parsedPayload,
          projection: parsedPayload.projection,
          sort: parsedPayload.sort,
          skip: parsedPayload.skip,
          limit: parsedPayload.limit,
        },
      };
    } else if (operation === "aggregate") {
      if (!Array.isArray(parsedPayload)) {
        setValidationError("Aggregation pipeline must be a JSON array of stage objects.");
        return;
      }
      opPayload = {
        operation: "aggregate",
        payload: { pipeline: parsedPayload },
      };
    } else if (operation === "countDocuments") {
      opPayload = {
        operation: "countDocuments",
        payload: {
          filter: parsedPayload.filter ?? parsedPayload,
          skip: parsedPayload.skip,
          limit: parsedPayload.limit,
        },
      };
    } else if (operation === "estimatedDocumentCount") {
      if (parsedPayload && Object.keys(parsedPayload).length > 0) {
        setValidationError("estimatedDocumentCount does not accept a filter; payload must be empty `{}`.");
        return;
      }
      opPayload = {
        operation: "estimatedDocumentCount",
        payload: undefined,
      };
    } else if (operation === "distinct") {
      if (!parsedPayload.field || typeof parsedPayload.field !== "string") {
        setValidationError('distinct requires a "field" property specifying the field path.');
        return;
      }
      opPayload = {
        operation: "distinct",
        payload: {
          field: parsedPayload.field,
          filter: parsedPayload.filter,
        },
      };
    } else {
      setValidationError(`Unsupported operation: ${operation}`);
      return;
    }

    executeMqlMutation.mutate(
      { collection: selectedCollection, op: opPayload },
      {
        onSuccess: (res) => {
          if (res.operation === "find" || res.operation === "aggregate") {
            setStatusMessage(
              `Query completed successfully in ${res.executionTimeMs}ms. (${res.documents.length} documents returned)`
            );
          } else if (res.operation === "distinct") {
            setStatusMessage(
              `Distinct completed successfully in ${res.executionTimeMs}ms. (${res.count} unique values)`
            );
          } else {
            setStatusMessage(
              `Count completed successfully in ${res.executionTimeMs}ms. (Total: ${res.count})`
            );
          }
        },
      }
    );
  }, [selectedCollection, queryText, operation, executeMqlMutation]);

  const handleExplain = useCallback(() => {
    setValidationError(null);
    setStatusMessage(null);

    if (!selectedCollection) {
      setValidationError("Please select a collection before explaining a query.");
      return;
    }

    let parsedPayload: any;
    try {
      parsedPayload = JSON.parse(queryText.trim() || "{}");
    } catch (err: any) {
      setValidationError(`Invalid JSON payload: ${err.message}`);
      return;
    }

    let target: MongoExplainTarget;
    if (operation === "find") {
      target = {
        operation: "find",
        filter: parsedPayload.filter ?? parsedPayload,
        projection: parsedPayload.projection,
        sort: parsedPayload.sort,
        skip: parsedPayload.skip,
        limit: parsedPayload.limit,
      };
    } else if (operation === "aggregate") {
      if (!Array.isArray(parsedPayload)) {
        setValidationError("Aggregation pipeline must be a JSON array of stage objects to explain.");
        return;
      }
      target = {
        operation: "aggregate",
        pipeline: parsedPayload,
      };
    } else {
      setValidationError(
        getExplainDisabledReason(operation) || "Explain is only supported for 'find' and 'aggregate' operations."
      );
      return;
    }

    explainMqlMutation.mutate(
      { collection: selectedCollection, target, verbosity: "executionStats" },
      {
        onSuccess: (res) => {
          setStatusMessage(
            `Explain plan calculated in ${res.executionTimeMs}ms. Winning plan: ${
              (res.queryPlanner.winningPlan as any)?.stage || "OPTIMAL"
            }`
          );
        },
      }
    );
  }, [selectedCollection, queryText, operation, explainMqlMutation]);

  const activeError =
    validationError ||
    (executeMqlMutation.error ? executeMqlMutation.error.message : null) ||
    (explainMqlMutation.error ? explainMqlMutation.error.message : null);

  return (
    <div className="h-[calc(100vh-32px)] flex flex-col overflow-hidden bg-background text-foreground">
      {/* Header bar */}
      <div className="h-13 px-4 border-b border-border/40 flex items-center justify-between bg-sidebar/40 shrink-0 gap-4">
        <div className="flex items-center gap-3">
          <div className="flex items-center gap-2">
            <div className="h-6 w-6 rounded bg-emerald-500/10 border border-emerald-500/20 flex items-center justify-center">
              <Database className="h-3.5 w-3.5 text-emerald-500" />
            </div>
            <span className="font-semibold text-sm">{databaseName}</span>
          </div>

          <span className="text-muted-foreground/40">/</span>

          {/* Collection selector */}
          <div className="w-52">
            <Select
              value={selectedCollection}
              onValueChange={setSelectedCollection}
              disabled={collectionsLoading || collections.length === 0}
            >
              <SelectTrigger className="h-8 text-xs bg-muted/50">
                <SelectValue
                  placeholder={
                    collectionsLoading
                      ? "Loading collections..."
                      : collections.length === 0
                      ? "No collections"
                      : "Select collection"
                  }
                />
              </SelectTrigger>
              <SelectContent>
                {collections.map((col) => (
                  <SelectItem key={col.name} value={col.name} className="text-xs font-mono">
                    {col.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {/* Operation selector */}
          <div className="w-44">
            <Select
              value={operation}
              onValueChange={(val) => handleOperationChange(val as MongoWorkspaceOpType)}
            >
              <SelectTrigger className="h-8 text-xs bg-muted/50 font-mono">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="find" className="text-xs font-mono">
                  find()
                </SelectItem>
                <SelectItem value="aggregate" className="text-xs font-mono">
                  aggregate()
                </SelectItem>
                <SelectItem value="countDocuments" className="text-xs font-mono">
                  countDocuments()
                </SelectItem>
                <SelectItem value="estimatedDocumentCount" className="text-xs font-mono">
                  estimatedDocCount()
                </SelectItem>
                <SelectItem value="distinct" className="text-xs font-mono">
                  distinct()
                </SelectItem>
              </SelectContent>
            </Select>
          </div>
        </div>

        {/* Action buttons */}
        <div className="flex items-center gap-2">
          <Tooltip>
            <TooltipTrigger asChild>
              <span>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={handleExplain}
                  disabled={isExecuting || !isExplainSupported(operation) || !selectedCollection}
                  className="h-8 text-xs gap-1.5"
                >
                  <FileSearch className="h-3.5 w-3.5 text-muted-foreground" />
                  Explain
                </Button>
              </span>
            </TooltipTrigger>
            <TooltipContent side="bottom" className="max-w-xs text-xs">
              {!isExplainSupported(operation)
                ? (getExplainDisabledReason(operation) ?? "Explain is unavailable for this operation.")
                : "Explain execution plan (queryPlanner & executionStats)"}
            </TooltipContent>
          </Tooltip>

          <Button
            size="sm"
            onClick={handleRunQuery}
            disabled={isExecuting || !selectedCollection}
            className="h-8 text-xs gap-1.5 bg-primary text-primary-foreground hover:bg-primary/90"
          >
            {isExecuting ? (
              <Loader2 className="h-3.5 w-3.5 animate-spin" />
            ) : (
              <Play className="h-3.5 w-3.5 fill-current" />
            )}
            Run Query
            <kbd className="ml-1 text-[10px] bg-primary-foreground/20 px-1 py-0.2 rounded font-mono">
              Mod+Enter
            </kbd>
          </Button>
        </div>
      </div>

      {/* Main workspace body */}
      <div className="flex-1 flex flex-col p-4 gap-4 overflow-hidden min-h-0">
        {/* Error banner */}
        {activeError && (
          <div className="shrink-0 rounded-md border border-destructive/40 bg-destructive/10 px-3 py-2 text-xs text-destructive flex items-center gap-2">
            <AlertCircle className="h-4 w-4 shrink-0" />
            <span className="font-mono break-all">{activeError}</span>
          </div>
        )}

        {/* Success / Status banner */}
        {statusMessage && !activeError && (
          <div className="shrink-0 rounded-md border border-emerald-500/30 bg-emerald-500/10 px-3 py-2 text-xs text-emerald-600 dark:text-emerald-400 flex items-center gap-2">
            <CheckCircle2 className="h-4 w-4 shrink-0" />
            <span>{statusMessage}</span>
          </div>
        )}

        {/* Code Editor Pane */}
        <div className="flex-1 min-h-[220px] flex flex-col">
          <div className="text-xs font-semibold text-muted-foreground mb-1.5 flex items-center justify-between">
            <span>Query Payload (EJSON v2 JSON)</span>
            <span className="text-[11px] font-normal text-muted-foreground/60">
              Autocomplete available ($match, $project, $gt, etc.)
            </span>
          </div>
          <div className="flex-1 min-h-0">
            <MongoMqlEditor
              value={queryText}
              onChange={setQueryText}
              disabled={isExecuting}
              onExecute={handleRunQuery}
              minHeight="100%"
            />
          </div>
        </div>

        {/* Results Viewer Shell (Phase 3 Placeholder) */}
        <div className="h-48 shrink-0 rounded-lg border border-dashed border-border/60 bg-muted/20 flex flex-col items-center justify-center p-6 text-center text-muted-foreground">
          <Layers className="h-8 w-8 text-muted-foreground/40 mb-2" />
          <p className="text-sm font-medium text-foreground">Results Viewer (Phase 3)</p>
          <p className="text-xs text-muted-foreground/80 max-w-md mt-1">
            Collapsible JSON Tree and Virtualized Table View will be mounted here in Phase 3.
            Bridge MQL RPC execution is fully integrated and validated.
          </p>
        </div>
      </div>
    </div>
  );
}
