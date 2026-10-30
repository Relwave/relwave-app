import { useState, useEffect, useCallback, useRef } from "react";
import { useMongoCollections } from "@/features/project/hooks/useDbQueries";
import { useExecuteMql, useExplainMql } from "../../hooks/useMongoMql";
import { MongoMqlEditor } from "../editor/MongoMqlEditor";
import { MongoResultsViewer } from "../results";
import { MongoHistoryDrawer } from "../history";
import { addHistoryEntry, REDACTED_TEMPLATE_ADVISORY } from "../../history";
import { parseMongoshQuery, MongoshParseResult } from "../../parser";
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
  History,
} from "lucide-react";
import type {
  MongoMqlOperation,
  MongoExplainTarget,
  MongoMqlExecuteResult,
  MongoExplainResult,
} from "../../types";
import type { MqlHistoryEntry } from "../../history/types";

export type MongoWorkspaceOpType =
  | "find"
  | "aggregate"
  | "countDocuments"
  | "estimatedDocumentCount"
  | "distinct";

export type MongoWorkspaceInputMode = "json" | "mongosh";

export const OPERATION_TEMPLATES: Record<MongoWorkspaceOpType, string> = {
  find: `{\n  "filter": {}\n}`,
  countDocuments: `{\n  "filter": {}\n}`,
  estimatedDocumentCount: `{}`,
  distinct: `{\n  "field": "_id",\n  "filter": {}\n}`,
  aggregate: `[\n  {\n    "$match": {}\n  }\n]`,
};

export const MONGOSH_DEFAULT_TEMPLATE = "db.users.find({})";

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
  const [inputMode, setInputMode] = useState<MongoWorkspaceInputMode>("json");
  const [operation, setOperation] = useState<MongoWorkspaceOpType>("find");
  const [queryText, setQueryText] = useState<string>(OPERATION_TEMPLATES.find);
  const [validationError, setValidationError] = useState<string | null>(null);
  const [statusMessage, setStatusMessage] = useState<string | null>(null);

  // Active result state (supports find, aggregate, count, distinct, and explain)
  const [lastResult, setLastResult] = useState<MongoMqlExecuteResult | MongoExplainResult | null>(null);

  // History drawer state
  const [isHistoryOpen, setIsHistoryOpen] = useState(false);

  // Ref to track active connection ID to guard against race conditions on connection switch
  const activeDbIdRef = useRef(dbId);

  const executeMqlMutation = useExecuteMql(dbId);
  const explainMqlMutation = useExplainMql(dbId);

  // Clear state, mutations, and close drawers when connection switches
  useEffect(() => {
    activeDbIdRef.current = dbId;
    setLastResult(null);
    setValidationError(null);
    setStatusMessage(null);
    setIsHistoryOpen(false);
    executeMqlMutation.reset();
    explainMqlMutation.reset();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [dbId]);

  // Sync initial collection or reset if connection dbId changes
  useEffect(() => {
    if (collections.length > 0 && !collections.some((c) => c.name === selectedCollection)) {
      setSelectedCollection(collections[0].name);
    }
  }, [collections, selectedCollection]);

  // Handle operation change in JSON mode
  const handleOperationChange = useCallback(
    (newOp: MongoWorkspaceOpType) => {
      setOperation(newOp);
      setValidationError(null);
      setQueryText(OPERATION_TEMPLATES[newOp]);
    },
    []
  );

  // Handle switching between JSON and Mongosh input modes
  const handleModeChange = useCallback(
    (newMode: MongoWorkspaceInputMode) => {
      if (newMode === inputMode) return;
      setInputMode(newMode);
      setValidationError(null);

      if (newMode === "mongosh") {
        const isDefaultJson = Object.values(OPERATION_TEMPLATES).some(
          (t) => t.trim() === queryText.trim()
        );
        if (isDefaultJson || !queryText.trim()) {
          const col = selectedCollection || (collections[0]?.name ?? "users");
          setQueryText(`db.${col}.find({})`);
        }
      } else {
        if (queryText.trim().startsWith("db.") && queryText.includes(".find({})")) {
          setQueryText(OPERATION_TEMPLATES[operation]);
        }
      }
    },
    [inputMode, queryText, selectedCollection, collections, operation]
  );

  const isExecuting = executeMqlMutation.isPending || explainMqlMutation.isPending;

  const handleRunQuery = useCallback(() => {
    setValidationError(null);
    setStatusMessage(null);

    let targetCollection = selectedCollection;
    let opPayload: MongoMqlOperation;

    if (inputMode === "mongosh") {
      let parsed: MongoshParseResult;
      try {
        parsed = parseMongoshQuery(queryText);
      } catch (err: any) {
        setValidationError(`Mongosh Syntax Error: ${err.message}`);
        return;
      }
      targetCollection = parsed.collection;
      opPayload = parsed.op;
    } else {
      // JSON mode
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
    }

    const currentOpName = opPayload.operation;

    executeMqlMutation.mutate(
      { collection: targetCollection, op: opPayload },
      {
        onSuccess: (res) => {
          if (activeDbIdRef.current !== dbId) return;

          setLastResult(res);

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

          // Persist safe execution metadata to connection history
          addHistoryEntry(dbId, {
            collection: targetCollection,
            operation: res.operation,
            queryText,
            durationMs: res.executionTimeMs,
            status: "success",
            resultCount:
              res.operation === "find" || res.operation === "aggregate"
                ? res.documents.length
                : res.count,
          });
        },
        onError: (err) => {
          if (activeDbIdRef.current !== dbId) return;

          const errMsg = err?.message || "Execution error occurred";
          setLastResult(null);

          // Persist safe failure metadata to connection history
          addHistoryEntry(dbId, {
            collection: targetCollection,
            operation: currentOpName,
            queryText,
            durationMs: 0,
            status: "error",
            errorMessage: errMsg,
          });
        },
      }
    );
  }, [inputMode, selectedCollection, queryText, operation, executeMqlMutation, dbId]);

  const handleExplain = useCallback(() => {
    setValidationError(null);
    setStatusMessage(null);

    let targetCollection = selectedCollection;
    let target: MongoExplainTarget;

    if (inputMode === "mongosh") {
      let parsed: MongoshParseResult;
      try {
        parsed = parseMongoshQuery(queryText);
      } catch (err: any) {
        setValidationError(`Mongosh Syntax Error: ${err.message}`);
        return;
      }

      targetCollection = parsed.collection;

      if (parsed.op.operation === "find") {
        target = {
          operation: "find",
          filter: parsed.op.payload.filter,
          projection: parsed.op.payload.projection,
          sort: parsed.op.payload.sort,
          skip: parsed.op.payload.skip,
          limit: parsed.op.payload.limit,
        };
      } else if (parsed.op.operation === "aggregate") {
        target = {
          operation: "aggregate",
          pipeline: parsed.op.payload.pipeline,
          allowDiskUse: parsed.op.payload.allowDiskUse,
        };
      } else {
        setValidationError(
          getExplainDisabledReason(parsed.op.operation as MongoWorkspaceOpType) ||
            "Explain is only supported for 'find' and 'aggregate' operations."
        );
        return;
      }
    } else {
      // JSON mode
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
    }

    const currentOpName = target.operation;

    explainMqlMutation.mutate(
      { collection: targetCollection, target, verbosity: "executionStats" },
      {
        onSuccess: (res) => {
          if (activeDbIdRef.current !== dbId) return;

          setLastResult(res);
          setStatusMessage(
            `Explain plan calculated in ${res.executionTimeMs}ms. Winning plan: ${
              (res.queryPlanner.winningPlan as any)?.stage || "OPTIMAL"
            }`
          );

          addHistoryEntry(dbId, {
            collection: targetCollection,
            operation: `explain(${res.operation})`,
            queryText,
            durationMs: res.executionTimeMs,
            status: "success",
          });
        },
        onError: (err) => {
          if (activeDbIdRef.current !== dbId) return;

          const errMsg = err?.message || "Explain plan execution failed";
          setLastResult(null);

          addHistoryEntry(dbId, {
            collection: targetCollection,
            operation: `explain(${currentOpName})`,
            queryText,
            durationMs: 0,
            status: "error",
            errorMessage: errMsg,
          });
        },
      }
    );
  }, [inputMode, selectedCollection, queryText, operation, explainMqlMutation, dbId]);

  // Handle loading a query or template from history
  const handleSelectHistoryEntry = useCallback(
    (entry: MqlHistoryEntry) => {
      const textToLoad = entry.rawQueryText || entry.redactedQueryText;
      setQueryText(textToLoad);
      setValidationError(null);

      // Inferred input mode from loaded query
      if (textToLoad.trim().startsWith("db.")) {
        setInputMode("mongosh");
      } else {
        setInputMode("json");
        if (entry.operation in OPERATION_TEMPLATES) {
          setOperation(entry.operation as MongoWorkspaceOpType);
        }
      }

      // Update selected collection if available in active connection
      if (entry.collection && collections.some((c) => c.name === entry.collection)) {
        setSelectedCollection(entry.collection);
      }

      if (entry.isRedacted) {
        setStatusMessage(REDACTED_TEMPLATE_ADVISORY);
      } else {
        setStatusMessage("Loaded query from history into editor.");
      }
    },
    [collections]
  );

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

          {/* Operation selector (Active in JSON mode; disabled/inferred in mongosh mode) */}
          <div className="w-44">
            <Select
              value={operation}
              onValueChange={(val) => handleOperationChange(val as MongoWorkspaceOpType)}
              disabled={inputMode === "mongosh"}
            >
              <SelectTrigger
                className="h-8 text-xs bg-muted/50 font-mono"
                title={inputMode === "mongosh" ? "In mongosh mode, operation is declared in query (e.g. db.coll.find())" : undefined}
              >
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
          {/* Query History button */}
          <Button
            variant="outline"
            size="sm"
            onClick={() => setIsHistoryOpen(true)}
            className="h-8 text-xs gap-1.5"
            title="Open Query History"
          >
            <History className="h-3.5 w-3.5 text-muted-foreground" />
            History
          </Button>

          {/* Explain button */}
          <Tooltip>
            <TooltipTrigger asChild>
              <span>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={handleExplain}
                  disabled={isExecuting || (inputMode === "json" && !isExplainSupported(operation)) || !selectedCollection}
                  className="h-8 text-xs gap-1.5"
                >
                  <FileSearch className="h-3.5 w-3.5 text-muted-foreground" />
                  Explain
                </Button>
              </span>
            </TooltipTrigger>
            <TooltipContent side="bottom" className="max-w-xs text-xs">
              {inputMode === "json" && !isExplainSupported(operation)
                ? (getExplainDisabledReason(operation) ?? "Explain is unavailable for this operation.")
                : "Explain execution plan (queryPlanner & executionStats)"}
            </TooltipContent>
          </Tooltip>

          {/* Run Query button */}
          <Button
            size="sm"
            onClick={handleRunQuery}
            disabled={isExecuting || (!selectedCollection && inputMode === "json")}
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
      <div className="flex-1 flex flex-col p-4 gap-3 overflow-hidden min-h-0">
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
        <div className="h-56 shrink-0 flex flex-col">
          <div className="text-xs font-semibold text-muted-foreground mb-1.5 flex items-center justify-between">
            {/* Input Mode Selector */}
            <div className="flex items-center gap-2">
              <span className="text-muted-foreground font-medium">Input Mode:</span>
              <div className="flex items-center border border-border/60 rounded p-0.5 bg-muted/30">
                <Button
                  variant={inputMode === "json" ? "secondary" : "ghost"}
                  size="sm"
                  onClick={() => handleModeChange("json")}
                  className="h-6 px-2 text-[11px] font-mono"
                >
                  JSON
                </Button>
                <Button
                  variant={inputMode === "mongosh" ? "secondary" : "ghost"}
                  size="sm"
                  onClick={() => handleModeChange("mongosh")}
                  className="h-6 px-2 text-[11px] font-mono"
                >
                  mongosh
                </Button>
              </div>
            </div>

            <span className="text-[11px] font-normal text-muted-foreground/60">
              {inputMode === "mongosh"
                ? "Full mongosh syntax supported (e.g. db.users.find({ age: { $gt: 21 } }))"
                : "Autocomplete available ($match, $project, $gt, etc.)"}
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

        {/* Results Viewer */}
        <div className="flex-1 min-h-[240px] rounded-lg border border-border/50 overflow-hidden bg-background">
          <MongoResultsViewer
            result={lastResult}
            isLoading={isExecuting}
            error={activeError}
            onClear={() => {
              setLastResult(null);
              setValidationError(null);
            }}
          />
        </div>
      </div>

      {/* Query History Drawer */}
      <MongoHistoryDrawer
        dbId={dbId}
        isOpen={isHistoryOpen}
        onClose={() => setIsHistoryOpen(false)}
        onSelectEntry={handleSelectHistoryEntry}
      />
    </div>
  );
}
