/**
 * MongoDB Milestone 7 Phase 4 — Bulk Export Dialog
 *
 * Implements the 4-step wizard for streaming bulk export:
 * 1. Configure: collection, format (JSON, NDJSON, CSV), filter inheritance, projection, limit
 * 2. Exporting: live streaming progress, documents processed, cursor file size, cancellation
 * 3. Ready to Save: disk save dialog via @tauri-apps/plugin-dialog with failure-safe overwrite prompt
 * 4. Completed: summary metrics (bytes written, destination path), advisory warnings, done action
 *
 * Adheres to docs/M7_PHASE4_SPEC.md §5, §6, §7.1, §9.1, and §13 (Stage 4).
 */

import React, { useState, useEffect, useCallback, useId } from "react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Checkbox } from "@/components/ui/checkbox";
import { Badge } from "@/components/ui/badge";
import {
  Download,
  FileText,
  CheckCircle2,
  AlertCircle,
  XCircle,
  Loader2,
  AlertTriangle,
  FileSpreadsheet,
  FileCode,
  HardDrive,
  RefreshCw,
} from "lucide-react";
import { toast } from "sonner";
import { hasTauriInvoke } from "@/services/bridge/bridgeClient";
import type { MongoBulkFormat, TrackedAsyncBulkOperation } from "../../types/bulk";
import {
  useMongoBulkExport,
  type BulkExportServiceContract,
} from "../../hooks/useMongoBulkExport";
import { useMongoBulkOperationsStore } from "../../hooks/useMongoBulkOperationsStore";
import { validateCollectionName } from "../../utils/validation";

export interface MongoBulkExportDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  dbId: string;
  databaseName: string;
  defaultCollection?: string;
  initialFilter?: Record<string, unknown>;
  service?: BulkExportServiceContract;
  onExportComplete?: () => void;
  cancelOnUnmount?: boolean;
  externalPolling?: boolean;
  onOperationStart?: (operation: TrackedAsyncBulkOperation) => void;
}

export function formatBytes(bytes: number): string {
  if (bytes <= 0) return "0 B";
  const units = ["B", "KB", "MB", "GB"];
  const i = Math.floor(Math.log(bytes) / Math.log(1024));
  return `${(bytes / Math.pow(1024, i)).toFixed(i === 0 ? 0 : 2)} ${units[i]}`;
}

export function MongoBulkExportDialog({
  open,
  onOpenChange,
  dbId,
  databaseName,
  defaultCollection = "",
  initialFilter,
  service,
  onExportComplete,
  cancelOnUnmount,
  externalPolling,
  onOperationStart,
}: MongoBulkExportDialogProps) {
  const collectionInputId = useId();
  const filterInputId = useId();
  const projectionInputId = useId();
  const limitInputId = useId();
  const customPathInputId = useId();

  const [collection, setCollection] = useState<string>(defaultCollection);
  const [collectionError, setCollectionError] = useState<string | null>(null);
  const [format, setFormat] = useState<MongoBulkFormat>("json");

  const [inheritFilter, setInheritFilter] = useState<boolean>(Boolean(initialFilter));
  const [filterText, setFilterText] = useState<string>(
    initialFilter ? JSON.stringify(initialFilter, null, 2) : "",
  );
  const [filterError, setFilterError] = useState<string | null>(null);

  const [projectionText, setProjectionText] = useState<string>("");
  const [projectionError, setProjectionError] = useState<string | null>(null);

  const [limitText, setLimitText] = useState<string>("");
  const [limitError, setLimitError] = useState<string | null>(null);

  const [manualPath, setManualPath] = useState<string>("");
  const [pendingSavePath, setPendingSavePath] = useState<string | null>(null);
  const [showOverwriteAlert, setShowOverwriteAlert] = useState<boolean>(false);
  const [showCancelConfirm, setShowCancelConfirm] = useState<boolean>(false);

  const {
    state: exportState,
    saveStatus,
    progress,
    operationId,
    error: exportError,
    warning: exportWarning,
    destinationPath: savedDestinationPath,
    startExport,
    cancelExport,
    saveToFile,
    reset: resetExport,
    syncExternalStatus,
  } = useMongoBulkExport(dbId, service, {
    cancelOnUnmount,
    externalPolling,
    onOperationStart,
  });

  // Wire reactive store subscription when externalPolling === true
  const store = useMongoBulkOperationsStore({ service });
  useEffect(() => {
    if (!externalPolling || !operationId) return;
    const dbOps = store.operationsByDb[dbId] || [];
    const op = dbOps.find((entry) => entry.kind === "async" && entry.operationId === operationId);
    if (op && op.kind === "async") {
      syncExternalStatus({
        status: op.status,
        processedDocuments: op.processedDocuments,
        successfulDocuments: op.successfulDocuments,
        failedDocuments: op.failedDocuments,
        fileSizeBytes: op.fileSizeBytes,
        error: op.error,
      });
    }
  }, [externalPolling, operationId, store.operationsByDb, dbId, syncExternalStatus]);

  // Initialize/reset form when dialog opens
  useEffect(() => {
    if (open) {
      setCollection(defaultCollection);
      const nameVal = validateCollectionName(defaultCollection);
      setCollectionError(defaultCollection ? (nameVal.valid ? null : nameVal.error ?? null) : null);
      setFormat("json");
      const hasInit = Boolean(initialFilter && Object.keys(initialFilter).length > 0);
      setInheritFilter(hasInit);
      setFilterText(hasInit ? JSON.stringify(initialFilter, null, 2) : "");
      setFilterError(null);
      setProjectionText("");
      setProjectionError(null);
      setLimitText("");
      setLimitError(null);
      setManualPath("");
      setPendingSavePath(null);
      setShowOverwriteAlert(false);
      setShowCancelConfirm(false);
      resetExport();
    }
  }, [open, defaultCollection, initialFilter, resetExport]);

  // Handle Inherit Filter checkbox toggle
  const handleInheritFilterToggle = (checked: boolean) => {
    setInheritFilter(checked);
    if (checked && initialFilter) {
      setFilterText(JSON.stringify(initialFilter, null, 2));
      setFilterError(null);
    } else if (!checked) {
      setFilterText("");
      setFilterError(null);
    }
  };

  const handleCollectionChange = (val: string) => {
    setCollection(val);
    const res = validateCollectionName(val);
    setCollectionError(res.valid ? null : res.error ?? "Invalid collection name");
  };

  const handleFilterChange = (val: string) => {
    setFilterText(val);
    if (!val.trim()) {
      setFilterError(null);
      return;
    }
    try {
      const parsed = JSON.parse(val);
      if (typeof parsed !== "object" || parsed === null || Array.isArray(parsed)) {
        setFilterError("Filter must be a valid JSON object");
      } else {
        setFilterError(null);
      }
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "Invalid JSON syntax";
      setFilterError(msg);
    }
  };

  const handleProjectionChange = (val: string) => {
    setProjectionText(val);
    if (!val.trim()) {
      setProjectionError(null);
      return;
    }
    try {
      const parsed = JSON.parse(val);
      if (typeof parsed !== "object" || parsed === null || Array.isArray(parsed)) {
        setProjectionError("Projection must be a valid JSON object");
      } else {
        setProjectionError(null);
      }
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "Invalid JSON syntax";
      setProjectionError(msg);
    }
  };

  const handleLimitChange = (val: string) => {
    setLimitText(val);
    if (!val.trim()) {
      setLimitError(null);
      return;
    }
    const num = Number(val);
    if (!Number.isInteger(num) || num <= 0) {
      setLimitError("Limit must be a positive integer");
    } else {
      setLimitError(null);
    }
  };

  const handleStartExport = async () => {
    const colVal = validateCollectionName(collection);
    if (!colVal.valid) {
      setCollectionError(colVal.error ?? "Invalid collection name");
      return;
    }

    let parsedFilter: Record<string, unknown> | undefined;
    if (filterText.trim()) {
      try {
        parsedFilter = JSON.parse(filterText);
      } catch {
        setFilterError("Invalid filter JSON");
        return;
      }
    }

    let parsedProjection: Record<string, unknown> | undefined;
    if (projectionText.trim()) {
      try {
        parsedProjection = JSON.parse(projectionText);
      } catch {
        setProjectionError("Invalid projection JSON");
        return;
      }
    }

    let parsedLimit: number | undefined;
    if (limitText.trim()) {
      const num = Number(limitText);
      if (Number.isInteger(num) && num > 0) {
        parsedLimit = num;
      } else {
        setLimitError("Limit must be a positive integer");
        return;
      }
    }

    try {
      await startExport({
        collection,
        format,
        filter: parsedFilter,
        projection: parsedProjection,
        limit: parsedLimit,
      });
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      toast.error(`Export start failed: ${msg}`);
    }
  };

  const handleCancelClick = async () => {
    if (showCancelConfirm) {
      await cancelExport();
      setShowCancelConfirm(false);
    } else {
      setShowCancelConfirm(true);
    }
  };

  const executeSave = async (destPath: string, overwrite: boolean) => {
    try {
      const res = await saveToFile(destPath, overwrite);
      setShowOverwriteAlert(false);
      setPendingSavePath(null);
      toast.success(`Export saved successfully to ${res.destinationPath}`);
      if (res.warning) {
        toast.warning(res.warning);
      }
    } catch (err: unknown) {
      const errRecord = typeof err === "object" && err !== null ? (err as Record<string, unknown>) : null;
      const code = typeof errRecord?.code === "string" ? errRecord.code : "";
      const msg = err instanceof Error ? err.message : String(err);

      if (code === "MONGO_FILE_EXISTS" || msg.includes("MONGO_FILE_EXISTS") || msg.includes("already exists")) {
        setPendingSavePath(destPath);
        setShowOverwriteAlert(true);
      } else {
        toast.error(`Save to disk failed: ${msg}`);
      }
    }
  };

  const handleSaveToDisk = async () => {
    if (hasTauriInvoke()) {
      try {
        const { save } = await import("@tauri-apps/plugin-dialog");
        const ext = format === "json" ? "json" : format === "ndjson" ? "ndjson" : "csv";
        const filterName =
          format === "json"
            ? "JSON Array (*.json)"
            : format === "ndjson"
              ? "NDJSON (*.ndjson, *.jsonl)"
              : "CSV (*.csv)";
        const extensions = format === "json" ? ["json"] : format === "ndjson" ? ["ndjson", "jsonl"] : ["csv"];

        const selectedPath = await save({
          defaultPath: `${collection || "export"}.${ext}`,
          filters: [{ name: filterName, extensions }],
        });

        if (selectedPath) {
          await executeSave(selectedPath, false);
        }
      } catch (err: unknown) {
        console.warn("Tauri file dialog failed, falling back to manual path:", err);
      }
    } else {
      // In browser preview / test environment: use manual path input
      if (manualPath.trim()) {
        await executeSave(manualPath.trim(), false);
      } else {
        toast.error("Please provide a destination file path to save");
      }
    }
  };

  const handleConfirmOverwrite = async () => {
    if (pendingSavePath) {
      const pathToSave = pendingSavePath;
      setPendingSavePath(null);
      await executeSave(pathToSave, true);
    }
  };

  const handleCancelOverwrite = () => {
    setShowOverwriteAlert(false);
    setPendingSavePath(null);
  };

  const handleFinish = () => {
    onExportComplete?.();
    onOpenChange(false);
  };

  const handleOpenChange = useCallback(
    async (nextOpen: boolean) => {
      if (!nextOpen) {
        const shouldCancel = cancelOnUnmount ?? true;
        if (shouldCancel) {
          if (exportState === "starting" || exportState === "exporting") {
            try {
              await cancelExport();
            } catch {
              // ignore
            }
          } else if (exportState === "ready-to-save") {
            try {
              await resetExport();
            } catch {
              // ignore
            }
          }
        }
      }
      onOpenChange(nextOpen);
    },
    [exportState, cancelExport, resetExport, onOpenChange, cancelOnUnmount],
  );

  const isConfigValid =
    Boolean(collection.trim()) && !collectionError && !filterError && !projectionError && !limitError;

  return (
    <>
      <Dialog open={open} onOpenChange={handleOpenChange}>
        <DialogContent className="max-w-2xl bg-popover/95 border-border shadow-2xl backdrop-blur-xl">
          {/* ================================================================= */}
          {/* STEP 1: CONFIGURE EXPORT */}
          {/* ================================================================= */}
          {exportState === "idle" && (
            <>
              <DialogHeader>
                <DialogTitle className="flex items-center gap-2 text-xl font-bold">
                  <Download className="h-5 w-5 text-primary" />
                  Export MongoDB Collection
                </DialogTitle>
                <DialogDescription>
                  Configure query filters, projections, and formats to stream collection data from{" "}
                  <span className="font-semibold text-foreground">{databaseName}</span> to disk.
                </DialogDescription>
              </DialogHeader>

              <div className="space-y-4 py-2">
                {/* Collection Input */}
                <div className="space-y-1.5">
                  <Label htmlFor={collectionInputId} className="text-xs font-semibold">
                    Target Collection
                  </Label>
                  <Input
                    id={collectionInputId}
                    placeholder="e.g. orders"
                    value={collection}
                    onChange={(e) => handleCollectionChange(e.target.value)}
                    className={collectionError ? "border-destructive focus-visible:ring-destructive" : ""}
                  />
                  {collectionError && (
                    <p className="text-xs text-destructive font-medium">{collectionError}</p>
                  )}
                </div>

                {/* Export Format Selector */}
                <div className="space-y-1.5">
                  <Label className="text-xs font-semibold">Export Format</Label>
                  <div className="grid grid-cols-3 gap-3">
                    <button
                      type="button"
                      onClick={() => setFormat("json")}
                      className={`flex flex-col items-center justify-center p-3 rounded-lg border text-left transition-all ${
                        format === "json"
                          ? "border-primary bg-primary/10 shadow-xs"
                          : "border-border/70 hover:border-border hover:bg-muted/40"
                      }`}
                    >
                      <FileCode className="h-5 w-5 mb-1.5 text-primary" />
                      <span className="text-xs font-bold">JSON Array</span>
                      <span className="text-[10px] text-muted-foreground">Standard JSON document array</span>
                    </button>

                    <button
                      type="button"
                      onClick={() => setFormat("ndjson")}
                      className={`flex flex-col items-center justify-center p-3 rounded-lg border text-left transition-all ${
                        format === "ndjson"
                          ? "border-primary bg-primary/10 shadow-xs"
                          : "border-border/70 hover:border-border hover:bg-muted/40"
                      }`}
                    >
                      <FileText className="h-5 w-5 mb-1.5 text-primary" />
                      <span className="text-xs font-bold">NDJSON / JSONL</span>
                      <span className="text-[10px] text-muted-foreground">Newline-delimited documents</span>
                    </button>

                    <button
                      type="button"
                      onClick={() => setFormat("csv")}
                      className={`flex flex-col items-center justify-center p-3 rounded-lg border text-left transition-all ${
                        format === "csv"
                          ? "border-primary bg-primary/10 shadow-xs"
                          : "border-border/70 hover:border-border hover:bg-muted/40"
                      }`}
                    >
                      <FileSpreadsheet className="h-5 w-5 mb-1.5 text-primary" />
                      <span className="text-xs font-bold">CSV</span>
                      <span className="text-[10px] text-muted-foreground">RFC 4180 flattened fields</span>
                    </button>
                  </div>
                </div>

                {/* Filter Editor */}
                <div className="space-y-1.5">
                  <div className="flex items-center justify-between">
                    <Label htmlFor={filterInputId} className="text-xs font-semibold">
                      Filter Query (Optional EJSON)
                    </Label>
                    {initialFilter && Object.keys(initialFilter).length > 0 && (
                      <div className="flex items-center space-x-2">
                        <Checkbox
                          id="inherit-filter"
                          checked={inheritFilter}
                          onCheckedChange={(checked) => handleInheritFilterToggle(Boolean(checked))}
                        />
                        <label
                          htmlFor="inherit-filter"
                          className="text-xs text-muted-foreground cursor-pointer select-none"
                        >
                          Inherit active viewer filter
                        </label>
                      </div>
                    )}
                  </div>
                  <Textarea
                    id={filterInputId}
                    placeholder='{ "status": "completed", "total": { "$gte": 100 } }'
                    value={filterText}
                    onChange={(e) => handleFilterChange(e.target.value)}
                    rows={3}
                    className={`font-mono text-xs ${
                      filterError ? "border-destructive focus-visible:ring-destructive" : ""
                    }`}
                  />
                  {filterError && <p className="text-xs text-destructive">{filterError}</p>}
                </div>

                {/* Projection Editor & Document Limit */}
                <div className="grid grid-cols-2 gap-3">
                  <div className="space-y-1.5">
                    <Label htmlFor={projectionInputId} className="text-xs font-semibold">
                      Projection (Optional)
                    </Label>
                    <Input
                      id={projectionInputId}
                      placeholder='{ "password": 0, "token": 0 }'
                      value={projectionText}
                      onChange={(e) => handleProjectionChange(e.target.value)}
                      className={`font-mono text-xs ${
                        projectionError ? "border-destructive focus-visible:ring-destructive" : ""
                      }`}
                    />
                    {projectionError && <p className="text-xs text-destructive">{projectionError}</p>}
                  </div>

                  <div className="space-y-1.5">
                    <Label htmlFor={limitInputId} className="text-xs font-semibold">
                      Document Limit (Optional)
                    </Label>
                    <Input
                      id={limitInputId}
                      type="number"
                      placeholder="e.g. 50000 (blank for all)"
                      value={limitText}
                      onChange={(e) => handleLimitChange(e.target.value)}
                      min={1}
                      className={`text-xs ${
                        limitError ? "border-destructive focus-visible:ring-destructive" : ""
                      }`}
                    />
                    {limitError && <p className="text-xs text-destructive">{limitError}</p>}
                  </div>
                </div>
              </div>

              <DialogFooter className="gap-2 sm:gap-0">
                <Button variant="outline" onClick={() => onOpenChange(false)}>
                  Cancel
                </Button>
                <Button onClick={handleStartExport} disabled={!isConfigValid}>
                  <Download className="h-4 w-4 mr-1.5" />
                  Start Export
                </Button>
              </DialogFooter>
            </>
          )}

          {/* ================================================================= */}
          {/* STEP 2: EXPORTING STREAM */}
          {/* ================================================================= */}
          {(exportState === "starting" || exportState === "exporting") && (
            <>
              <DialogHeader>
                <DialogTitle className="flex items-center gap-2 text-xl font-bold">
                  <Loader2 className="h-5 w-5 animate-spin text-primary" />
                  Exporting Collection Data
                </DialogTitle>
                <DialogDescription>
                  Streaming documents from '{collection}' directly to temporary disk cache.
                </DialogDescription>
              </DialogHeader>

              <div className="space-y-5 py-4">
                <div className="flex flex-col items-center justify-center p-6 rounded-xl border border-border/60 bg-muted/20 text-center">
                  <Loader2 className="h-10 w-10 animate-spin text-primary mb-3" />
                  <div className="text-sm font-semibold">Streaming Cursor Active</div>
                  <div className="text-xs text-muted-foreground mt-1">
                    Zero in-memory buffering. Writing stream to temporary disk storage.
                  </div>
                </div>

                {/* Progress Indicators */}
                <div className="grid grid-cols-2 gap-3">
                  <div className="rounded-lg border border-border/70 bg-card/60 p-3 text-center">
                    <div className="text-xs text-muted-foreground">Documents Processed</div>
                    <div className="text-2xl font-bold text-primary mt-1">
                      {progress.processedDocuments.toLocaleString()}
                    </div>
                  </div>
                  <div className="rounded-lg border border-border/70 bg-card/60 p-3 text-center">
                    <div className="text-xs text-muted-foreground">Stream Cache Size</div>
                    <div className="text-2xl font-bold text-foreground mt-1">
                      {formatBytes(progress.fileSizeBytes ?? 0)}
                    </div>
                  </div>
                </div>

                {/* Cancel Confirmation Prompt */}
                {showCancelConfirm && (
                  <div className="rounded-lg border border-amber-500/30 bg-amber-500/10 p-3 text-xs text-amber-500 flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <AlertTriangle className="h-4 w-4 shrink-0" />
                      <span>Are you sure you want to cancel this export?</span>
                    </div>
                    <div className="flex items-center gap-2">
                      <Button
                        size="sm"
                        variant="destructive"
                        className="h-7 text-xs"
                        onClick={cancelExport}
                      >
                        Yes, Cancel
                      </Button>
                      <Button
                        size="sm"
                        variant="outline"
                        className="h-7 text-xs"
                        onClick={() => setShowCancelConfirm(false)}
                      >
                        Keep Exporting
                      </Button>
                    </div>
                  </div>
                )}
              </div>

              <DialogFooter>
                {!showCancelConfirm && (
                  <Button variant="outline" onClick={handleCancelClick}>
                    Cancel Export
                  </Button>
                )}
              </DialogFooter>
            </>
          )}

          {/* ================================================================= */}
          {/* STEP 3: READY TO SAVE / SAVING */}
          {/* ================================================================= */}
          {(exportState === "ready-to-save" || exportState === "saving") && (
            <>
              <DialogHeader>
                <DialogTitle className="flex items-center gap-2 text-xl font-bold">
                  <HardDrive className="h-5 w-5 text-emerald-500" />
                  Export Stream Ready
                </DialogTitle>
                <DialogDescription>
                  Collection data has been streamed to bridge storage. Choose a destination to publish the file.
                </DialogDescription>
              </DialogHeader>

              <div className="space-y-4 py-3">
                {/* Export Summary */}
                <div className="grid grid-cols-3 gap-3">
                  <div className="rounded-lg border border-border/70 bg-card/60 p-3 text-center">
                    <div className="text-xs text-muted-foreground">Total Exported</div>
                    <div className="text-xl font-bold text-emerald-500 mt-1">
                      {(progress.successfulDocuments || progress.processedDocuments).toLocaleString()} docs
                    </div>
                  </div>
                  <div className="rounded-lg border border-border/70 bg-card/60 p-3 text-center">
                    <div className="text-xs text-muted-foreground">File Size</div>
                    <div className="text-xl font-bold text-primary mt-1">
                      {formatBytes(progress.fileSizeBytes ?? 0)}
                    </div>
                  </div>
                  <div className="rounded-lg border border-border/70 bg-card/60 p-3 text-center">
                    <div className="text-xs text-muted-foreground">Format</div>
                    <div className="text-xl font-bold text-foreground mt-1">
                      {format.toUpperCase()}
                    </div>
                  </div>
                </div>

                {/* Non-Tauri fallback destination input */}
                {!hasTauriInvoke() && (
                  <div className="space-y-1.5 rounded-lg border border-border/60 bg-muted/20 p-3">
                    <Label htmlFor={customPathInputId} className="text-xs font-semibold">
                      Destination File Path
                    </Label>
                    <Input
                      id={customPathInputId}
                      placeholder={`e.g. C:/exports/${collection}.${format}`}
                      value={manualPath}
                      onChange={(e) => setManualPath(e.target.value)}
                      className="text-xs font-mono"
                    />
                    <p className="text-[11px] text-muted-foreground">
                      Running outside desktop runtime. Specify an absolute destination file path.
                    </p>
                  </div>
                )}
              </div>

              <DialogFooter className="gap-2 sm:gap-0">
                <Button variant="outline" onClick={resetExport} disabled={saveStatus === "saving"}>
                  Discard
                </Button>
                <Button
                  onClick={handleSaveToDisk}
                  disabled={saveStatus === "saving"}
                  className="bg-emerald-600 hover:bg-emerald-700 text-white"
                >
                  {saveStatus === "saving" ? (
                    <>
                      <Loader2 className="h-4 w-4 animate-spin mr-1.5" />
                      Saving to Disk...
                    </>
                  ) : (
                    <>
                      <HardDrive className="h-4 w-4 mr-1.5" />
                      Save to Disk
                    </>
                  )}
                </Button>
              </DialogFooter>
            </>
          )}

          {/* ================================================================= */}
          {/* STEP 4: COMPLETED */}
          {/* ================================================================= */}
          {exportState === "completed" && (
            <>
              <DialogHeader>
                <DialogTitle className="flex items-center gap-2 text-xl font-bold text-emerald-500">
                  <CheckCircle2 className="h-6 w-6 text-emerald-500" />
                  Export Saved Successfully
                </DialogTitle>
                <DialogDescription>
                  Collection data has been safely written and committed to disk.
                </DialogDescription>
              </DialogHeader>

              <div className="space-y-4 py-3">
                {/* Advisory Warning Banner if present */}
                {exportWarning && (
                  <div className="flex items-start gap-2 rounded-md border border-amber-500/30 bg-amber-500/10 p-3 text-xs text-amber-500">
                    <AlertTriangle className="h-4 w-4 shrink-0 mt-0.5" />
                    <div>{exportWarning}</div>
                  </div>
                )}

                {/* Metrics */}
                <div className="grid grid-cols-2 gap-3">
                  <div className="rounded-lg border border-border/70 bg-card/60 p-3 text-center">
                    <div className="text-xs text-muted-foreground">Documents Exported</div>
                    <div className="text-2xl font-bold text-emerald-500 mt-1">
                      {(progress.successfulDocuments || progress.processedDocuments).toLocaleString()}
                    </div>
                  </div>
                  <div className="rounded-lg border border-border/70 bg-card/60 p-3 text-center">
                    <div className="text-xs text-muted-foreground">Bytes Written</div>
                    <div className="text-2xl font-bold text-primary mt-1">
                      {formatBytes(progress.bytesWritten ?? progress.fileSizeBytes ?? 0)}
                    </div>
                  </div>
                </div>

                {/* Destination File Path */}
                {(savedDestinationPath || progress.destinationPath) && (
                  <div className="rounded-lg border border-border/60 bg-muted/20 p-3">
                    <div className="text-xs text-muted-foreground font-semibold">Saved Destination</div>
                    <div className="text-xs font-mono font-medium text-foreground break-all mt-1">
                      {savedDestinationPath || progress.destinationPath}
                    </div>
                  </div>
                )}
              </div>

              <DialogFooter>
                <Button onClick={handleFinish} className="w-full sm:w-auto">
                  Done
                </Button>
              </DialogFooter>
            </>
          )}

          {/* ================================================================= */}
          {/* TERMINAL: CANCELLED */}
          {/* ================================================================= */}
          {exportState === "cancelled" && (
            <>
              <DialogHeader>
                <DialogTitle className="flex items-center gap-2 text-xl font-bold text-amber-500">
                  <AlertTriangle className="h-6 w-6 text-amber-500" />
                  Export Cancelled
                </DialogTitle>
                <DialogDescription>
                  The bulk export operation was cancelled. All temporary bridge streaming files have been cleaned up.
                </DialogDescription>
              </DialogHeader>

              <div className="py-4 text-center">
                <div className="text-sm text-muted-foreground">
                  No changes were written to your destination disk. You can configure and run a new export at any time.
                </div>
              </div>

              <DialogFooter className="gap-2 sm:gap-0">
                <Button variant="outline" onClick={() => onOpenChange(false)}>
                  Close
                </Button>
                <Button onClick={resetExport}>
                  <RefreshCw className="h-4 w-4 mr-1.5" />
                  Start Over
                </Button>
              </DialogFooter>
            </>
          )}

          {/* ================================================================= */}
          {/* TERMINAL: FAILED */}
          {/* ================================================================= */}
          {exportState === "failed" && (
            <>
              <DialogHeader>
                <DialogTitle className="flex items-center gap-2 text-xl font-bold text-destructive">
                  <XCircle className="h-6 w-6 text-destructive" />
                  {saveStatus === "save_failed" ? "Save to Disk Failed" : "Export Operation Failed"}
                </DialogTitle>
                <DialogDescription>
                  {saveStatus === "save_failed"
                    ? "Export streaming succeeded, but publishing to destination disk failed. The source file is preserved for retry."
                    : "The bulk export stream encountered an unrecoverable error and stopped."}
                </DialogDescription>
              </DialogHeader>

              <div className="space-y-4 py-3">
                {exportError && (
                  <div className="flex items-start gap-2 rounded-md border border-destructive/30 bg-destructive/10 p-3 text-xs text-destructive">
                    <AlertCircle className="h-4 w-4 shrink-0 mt-0.5" />
                    <div className="break-all">{exportError}</div>
                  </div>
                )}

                {saveStatus === "save_failed" && (
                  <div className="text-xs text-muted-foreground rounded-lg border border-border/60 bg-muted/20 p-3">
                    Your export stream file remains safe in bridge temporary storage. You may retry saving to a different destination path or filename without repeating the database export.
                  </div>
                )}
              </div>

              <DialogFooter className="gap-2 sm:gap-0">
                <Button variant="outline" onClick={() => onOpenChange(false)}>
                  Close
                </Button>
                {saveStatus === "save_failed" ? (
                  <Button onClick={handleSaveToDisk} className="bg-emerald-600 hover:bg-emerald-700 text-white">
                    <HardDrive className="h-4 w-4 mr-1.5" />
                    Retry Save to Disk
                  </Button>
                ) : (
                  <Button onClick={resetExport}>
                    <RefreshCw className="h-4 w-4 mr-1.5" />
                    Start Over
                  </Button>
                )}
              </DialogFooter>
            </>
          )}
        </DialogContent>
      </Dialog>

      {/* =================================================================== */}
      {/* OVERWRITE CONFIRMATION ALERT DIALOG */}
      {/* =================================================================== */}
      <AlertDialog
        open={showOverwriteAlert}
        onOpenChange={(nextOpen) => {
          setShowOverwriteAlert(nextOpen);
          if (!nextOpen) {
            setPendingSavePath(null);
          }
        }}
      >
        <AlertDialogContent className="bg-popover border-border">
          <AlertDialogHeader>
            <AlertDialogTitle className="flex items-center gap-2 text-amber-500">
              <AlertTriangle className="h-5 w-5" />
              File Already Exists
            </AlertDialogTitle>
            <AlertDialogDescription className="text-xs text-muted-foreground">
              A file already exists at the destination path:
              <br />
              <span className="font-mono text-foreground font-semibold break-all">
                {pendingSavePath}
              </span>
              <br />
              <br />
              Do you want to replace it? Overwriting will atomically replace the existing file.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel onClick={handleCancelOverwrite}>
              Cancel
            </AlertDialogCancel>
            <AlertDialogAction
              onClick={handleConfirmOverwrite}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              Replace File
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
