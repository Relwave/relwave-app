/**
 * MongoDB Milestone 7 Phase 4 — Bulk Import Dialog
 *
 * Implements the 4-step wizard for chunked bulk import:
 * 1. File Selection & Format Detection (with drag & drop and 16/32 MB size screening)
 * 2. Non-blocking Sample Preview
 * 3. Live Uploading Progress Meter & Cancellation
 * 4. Completion / Failure / Cancellation Summary
 *
 * Adheres to docs/M7_PHASE4_SPEC.md §4.
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
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Progress } from "@/components/ui/progress";
import { Badge } from "@/components/ui/badge";
import {
  Upload,
  FileText,
  CheckCircle2,
  AlertCircle,
  XCircle,
  Loader2,
  ArrowLeft,
  ArrowRight,
  AlertTriangle,
  Database,
  FileSpreadsheet,
  FileCode,
} from "lucide-react";
import { toast } from "sonner";
import type {
  MongoBulkDocument,
  MongoBulkFormat,
  TrackedAsyncBulkOperation,
  MongoBulkOperationStatus,
  MongoBulkImportChunkResult,
} from "../../types/bulk";
import {
  useMongoBulkImport,
  type BulkImportServiceContract,
  type ImportProgress,
} from "../../hooks/useMongoBulkImport";
import { previewImportFile } from "../../utils/importReader";
import { validateFileSize, MAX_IMPORT_TOTAL_SIZE_BYTES } from "../../utils/payloadAccounting";
import { validateCollectionName } from "../../utils/validation";

export interface MongoBulkImportDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  dbId: string;
  databaseName: string;
  defaultCollection?: string;
  onImportComplete?: () => void;
  service?: BulkImportServiceContract;
  cancelOnUnmount?: boolean;
  onOperationStart?: (
    operation: TrackedAsyncBulkOperation,
    abortController: AbortController,
    cancelFn: () => Promise<void>,
  ) => void;
  onChunkAcknowledged?: (progress: ImportProgress, chunkResult: MongoBulkImportChunkResult) => void;
  onTerminalState?: (operationId: string, status: MongoBulkOperationStatus, error?: string) => void;
}

type DialogStep = "select-file" | "preview" | "uploading" | "summary";

export function detectFormatFromFileName(fileName: string): MongoBulkFormat | null {
  const lower = fileName.toLowerCase();
  if (lower.endsWith(".json")) return "json";
  if (lower.endsWith(".ndjson") || lower.endsWith(".jsonl")) return "ndjson";
  if (lower.endsWith(".csv")) return "csv";
  return null;
}

export function formatBytes(bytes: number): string {
  if (bytes <= 0) return "0 B";
  const units = ["B", "KB", "MB", "GB"];
  const i = Math.floor(Math.log(bytes) / Math.log(1024));
  return `${(bytes / Math.pow(1024, i)).toFixed(i === 0 ? 0 : 2)} ${units[i]}`;
}

export function MongoBulkImportDialog({
  open,
  onOpenChange,
  dbId,
  databaseName,
  defaultCollection = "",
  onImportComplete,
  service,
  cancelOnUnmount,
  onOperationStart,
  onChunkAcknowledged,
  onTerminalState,
}: MongoBulkImportDialogProps) {
  const [step, setStep] = useState<DialogStep>("select-file");
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [targetCollection, setTargetCollection] = useState<string>(defaultCollection);
  const [format, setFormat] = useState<MongoBulkFormat>("json");
  const [fileAdvisory, setFileAdvisory] = useState<string | null>(null);
  const [fileError, setFileError] = useState<string | null>(null);
  const [collectionError, setCollectionError] = useState<string | null>(null);

  const [previewDocs, setPreviewDocs] = useState<MongoBulkDocument[]>([]);
  const [isPreviewLoading, setIsPreviewLoading] = useState<boolean>(false);
  const [previewError, setPreviewError] = useState<string | null>(null);
  const [isDragOver, setIsDragOver] = useState<boolean>(false);
  const [showCancelConfirm, setShowCancelConfirm] = useState<boolean>(false);

  const fileInputId = useId();

  const {
    state: importState,
    progress,
    error: importError,
    startImport,
    cancelImport,
    reset: resetImport,
  } = useMongoBulkImport(dbId, service, {
    cancelOnUnmount,
    onOperationStart,
    onChunkAcknowledged,
    onTerminalState,
  });

  // Reset when dialog opens
  useEffect(() => {
    if (open) {
      setStep("select-file");
      setSelectedFile(null);
      setTargetCollection(defaultCollection);
      setFormat("json");
      setFileAdvisory(null);
      setFileError(null);
      setCollectionError(null);
      setPreviewDocs([]);
      setPreviewError(null);
      setShowCancelConfirm(false);
      resetImport();
    }
  }, [open, defaultCollection, resetImport]);

  // Transition to summary when import reaches a terminal state
  useEffect(() => {
    if (step === "uploading") {
      if (importState === "completed" || importState === "failed" || importState === "cancelled") {
        setStep("summary");
      }
    }
  }, [importState, step]);

  const handleFileSelection = useCallback(
    (file: File) => {
      setSelectedFile(file);
      setFileError(null);
      setFileAdvisory(null);

      // Validate file size
      const sizeValidation = validateFileSize(file.size);
      if (!sizeValidation.valid) {
        setFileError(sizeValidation.error ?? "Invalid file size");
      } else if (sizeValidation.advisory) {
        setFileAdvisory(sizeValidation.advisory);
      }

      // Auto detect format
      const detected = detectFormatFromFileName(file.name);
      if (detected) {
        setFormat(detected);
      }

      // Default collection from file name if none selected
      if (!targetCollection) {
        const cleanName = file.name.replace(/\.[^/.]+$/, "").replace(/[^a-zA-Z0-9_-]/g, "_");
        setTargetCollection(cleanName);
        const nameValidation = validateCollectionName(cleanName);
        setCollectionError(nameValidation.valid ? null : (nameValidation.error ?? null));
      }
    },
    [targetCollection],
  );

  const handleCollectionChange = (val: string) => {
    setTargetCollection(val);
    const res = validateCollectionName(val);
    setCollectionError(res.valid ? null : (res.error ?? "Invalid collection name"));
  };

  const handleProceedToPreview = async () => {
    if (!selectedFile) return;

    const nameVal = validateCollectionName(targetCollection);
    if (!nameVal.valid) {
      setCollectionError(nameVal.error ?? "Invalid collection name");
      return;
    }

    setStep("preview");
    setIsPreviewLoading(true);
    setPreviewError(null);

    try {
      const docs = await previewImportFile(selectedFile, format, 5);
      setPreviewDocs(docs);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      setPreviewError(msg);
      toast.error(`Preview parsing error: ${msg}`);
    } finally {
      setIsPreviewLoading(false);
    }
  };

  const handleStartUpload = async () => {
    if (!selectedFile) return;
    setStep("uploading");
    try {
      await startImport(selectedFile, targetCollection, format);
      toast.success("Bulk import completed successfully!");
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      toast.error(`Import failed: ${msg}`);
    }
  };

  const handleCancelClick = async () => {
    if (showCancelConfirm) {
      await cancelImport();
      setShowCancelConfirm(false);
    } else {
      setShowCancelConfirm(true);
    }
  };

  const handleFinish = () => {
    onImportComplete?.();
    onOpenChange(false);
  };

  const handleOpenChange = useCallback(
    async (nextOpen: boolean) => {
      if (!nextOpen) {
        const shouldCancel = cancelOnUnmount ?? true;
        if (shouldCancel) {
          if (
            importState === "validating" ||
            importState === "starting" ||
            importState === "uploading"
          ) {
            try {
              await cancelImport();
            } catch {
              // ignore
            }
          }
        }
      }
      onOpenChange(nextOpen);
    },
    [importState, cancelImport, onOpenChange, cancelOnUnmount],
  );

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent className="max-w-2xl bg-popover/95 border-border shadow-2xl backdrop-blur-xl">
        {/* ================================================================= */}
        {/* STEP 1: SELECT FILE */}
        {/* ================================================================= */}
        {step === "select-file" && (
          <>
            <DialogHeader>
              <DialogTitle className="flex items-center gap-2 text-xl font-bold">
                <Upload className="h-5 w-5 text-primary" />
                Bulk Import Documents
              </DialogTitle>
              <DialogDescription>
                Import JSON array, NDJSON (JSON Lines), or CSV documents into MongoDB database{" "}
                <span className="font-semibold text-foreground">{databaseName}</span>.
              </DialogDescription>
            </DialogHeader>

            <div className="space-y-4 py-2">
              {/* File Dropzone */}
              <div
                onDragOver={(e) => {
                  e.preventDefault();
                  setIsDragOver(true);
                }}
                onDragLeave={() => setIsDragOver(false)}
                onDrop={(e) => {
                  e.preventDefault();
                  setIsDragOver(false);
                  const files = e.dataTransfer.files;
                  if (files && files.length > 0) {
                    handleFileSelection(files[0]);
                  }
                }}
                className={`relative flex flex-col items-center justify-center rounded-lg border-2 border-dashed p-6 transition-colors ${
                  isDragOver
                    ? "border-primary bg-primary/10"
                    : "border-border/80 hover:border-primary/50 hover:bg-accent/40"
                }`}
              >
                <input
                  id={fileInputId}
                  type="file"
                  accept=".json,.ndjson,.jsonl,.csv"
                  className="hidden"
                  onChange={(e) => {
                    if (e.target.files && e.target.files.length > 0) {
                      handleFileSelection(e.target.files[0]);
                    }
                  }}
                />
                <label
                  htmlFor={fileInputId}
                  className="flex flex-col items-center justify-center cursor-pointer space-y-2 text-center"
                >
                  <div className="rounded-full bg-primary/10 p-3 text-primary">
                    <Upload className="h-6 w-6" />
                  </div>
                  <div>
                    <span className="font-semibold text-foreground underline decoration-primary/50">
                      Click to choose a file
                    </span>{" "}
                    or drag and drop here
                  </div>
                  <p className="text-xs text-muted-foreground">
                    Supports JSON array (.json), NDJSON (.ndjson, .jsonl), or CSV (.csv) up to 32 MB
                  </p>
                </label>
              </div>

              {/* Selected File Details */}
              {selectedFile && (
                <div className="flex items-center justify-between rounded-md border border-border/70 bg-card/60 p-3 text-sm">
                  <div className="flex items-center gap-2 overflow-hidden">
                    <FileText className="h-5 w-5 shrink-0 text-primary" />
                    <div className="truncate">
                      <div className="font-medium truncate">{selectedFile.name}</div>
                      <div className="text-xs text-muted-foreground">
                        {formatBytes(selectedFile.size)}
                      </div>
                    </div>
                  </div>
                  <Badge variant="outline" className="capitalize">
                    {format}
                  </Badge>
                </div>
              )}

              {/* Advisory Warning */}
              {fileAdvisory && (
                <div className="flex items-start gap-2 rounded-md border border-amber-500/30 bg-amber-500/10 p-3 text-xs text-amber-500">
                  <AlertTriangle className="h-4 w-4 shrink-0 mt-0.5" />
                  <div>{fileAdvisory}</div>
                </div>
              )}

              {/* File Error */}
              {fileError && (
                <div className="flex items-start gap-2 rounded-md border border-destructive/30 bg-destructive/10 p-3 text-xs text-destructive">
                  <AlertCircle className="h-4 w-4 shrink-0 mt-0.5" />
                  <div>{fileError}</div>
                </div>
              )}

              {/* Target Collection & Format Selection */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="space-y-1.5">
                  <Label htmlFor="collection-input" className="text-xs font-medium">
                    Target Collection
                  </Label>
                  <Input
                    id="collection-input"
                    value={targetCollection}
                    onChange={(e) => handleCollectionChange(e.target.value)}
                    placeholder="e.g. users or audit_logs"
                    className="h-9"
                  />
                  {collectionError && <p className="text-xs text-destructive">{collectionError}</p>}
                </div>

                <div className="space-y-1.5">
                  <Label className="text-xs font-medium">Format</Label>
                  <div className="grid grid-cols-3 gap-1">
                    <Button
                      type="button"
                      size="sm"
                      variant={format === "json" ? "default" : "outline"}
                      className="text-xs h-9"
                      onClick={() => setFormat("json")}
                    >
                      <FileCode className="h-3.5 w-3.5 mr-1" />
                      JSON
                    </Button>
                    <Button
                      type="button"
                      size="sm"
                      variant={format === "ndjson" ? "default" : "outline"}
                      className="text-xs h-9"
                      onClick={() => setFormat("ndjson")}
                    >
                      <FileText className="h-3.5 w-3.5 mr-1" />
                      NDJSON
                    </Button>
                    <Button
                      type="button"
                      size="sm"
                      variant={format === "csv" ? "default" : "outline"}
                      className="text-xs h-9"
                      onClick={() => setFormat("csv")}
                    >
                      <FileSpreadsheet className="h-3.5 w-3.5 mr-1" />
                      CSV
                    </Button>
                  </div>
                </div>
              </div>
            </div>

            <DialogFooter className="gap-2 sm:gap-0">
              <Button variant="outline" onClick={() => onOpenChange(false)}>
                Cancel
              </Button>
              <Button
                onClick={handleProceedToPreview}
                disabled={!selectedFile || !!fileError || !targetCollection || !!collectionError}
              >
                Next: Preview
                <ArrowRight className="h-4 w-4 ml-1" />
              </Button>
            </DialogFooter>
          </>
        )}

        {/* ================================================================= */}
        {/* STEP 2: PREVIEW */}
        {/* ================================================================= */}
        {step === "preview" && (
          <>
            <DialogHeader>
              <DialogTitle className="flex items-center gap-2 text-xl font-bold">
                <Database className="h-5 w-5 text-primary" />
                Preview Sample Documents
              </DialogTitle>
              <DialogDescription>
                Previewing parsed documents from{" "}
                <span className="font-semibold text-foreground">{selectedFile?.name}</span> before
                importing into collection{" "}
                <span className="font-semibold text-foreground">{targetCollection}</span>.
              </DialogDescription>
            </DialogHeader>

            <div className="space-y-3 py-2">
              {isPreviewLoading && (
                <div className="flex flex-col items-center justify-center p-8 space-y-2 text-muted-foreground">
                  <Loader2 className="h-8 w-8 animate-spin text-primary" />
                  <p className="text-sm">Parsing initial sample documents...</p>
                </div>
              )}

              {previewError && (
                <div className="flex items-start gap-2 rounded-md border border-destructive/30 bg-destructive/10 p-3 text-sm text-destructive">
                  <AlertCircle className="h-5 w-5 shrink-0 mt-0.5" />
                  <div>
                    <div className="font-semibold">Failed to parse preview</div>
                    <div className="text-xs">{previewError}</div>
                  </div>
                </div>
              )}

              {!isPreviewLoading && !previewError && previewDocs.length > 0 && (
                <div className="space-y-2">
                  <div className="flex items-center justify-between text-xs text-muted-foreground">
                    <span>Showing first {previewDocs.length} parsed documents:</span>
                    <Badge variant="outline" className="text-xs">
                      Format: {format.toUpperCase()}
                    </Badge>
                  </div>
                  <div className="max-h-64 overflow-y-auto rounded-md border border-border/80 bg-zinc-950 p-3 font-mono text-xs text-zinc-100">
                    <pre className="whitespace-pre-wrap break-all">
                      {JSON.stringify(previewDocs, null, 2)}
                    </pre>
                  </div>
                </div>
              )}
            </div>

            <DialogFooter className="gap-2 sm:gap-0">
              <Button variant="outline" onClick={() => setStep("select-file")}>
                <ArrowLeft className="h-4 w-4 mr-1" />
                Back
              </Button>
              <Button onClick={handleStartUpload} disabled={isPreviewLoading || !!previewError}>
                Start Import
                <Upload className="h-4 w-4 ml-1" />
              </Button>
            </DialogFooter>
          </>
        )}

        {/* ================================================================= */}
        {/* STEP 3: UPLOADING */}
        {/* ================================================================= */}
        {step === "uploading" && (
          <>
            <DialogHeader>
              <DialogTitle className="flex items-center gap-2 text-xl font-bold">
                <Loader2 className="h-5 w-5 animate-spin text-primary" />
                Importing into '{targetCollection}'
              </DialogTitle>
              <DialogDescription>
                Streaming chunked documents to MongoDB bridge. Do not close this window.
              </DialogDescription>
            </DialogHeader>

            <div className="space-y-5 py-4">
              {/* Progress Bar */}
              <div className="space-y-1.5">
                <div className="flex items-center justify-between text-xs text-muted-foreground">
                  <span>Chunk {progress.currentChunkIndex + 1} processing</span>
                  <span>
                    {progress.documentsSubmitted > 0
                      ? Math.round(
                          (progress.documentsAcknowledged / progress.documentsSubmitted) * 100,
                        )
                      : 0}
                    % acknowledged
                  </span>
                </div>
                <Progress
                  value={
                    progress.documentsSubmitted > 0
                      ? (progress.documentsAcknowledged / progress.documentsSubmitted) * 100
                      : 5
                  }
                  className="h-2.5"
                />
              </div>

              {/* Live Metric Counters */}
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                <div className="rounded-lg border border-border/70 bg-card/60 p-3 text-center">
                  <div className="text-xs text-muted-foreground">Parsed</div>
                  <div className="text-lg font-bold text-foreground">
                    {progress.documentsParsed.toLocaleString()}
                  </div>
                </div>
                <div className="rounded-lg border border-border/70 bg-card/60 p-3 text-center">
                  <div className="text-xs text-muted-foreground">Inserted</div>
                  <div className="text-lg font-bold text-emerald-500">
                    {progress.totalInserted.toLocaleString()}
                  </div>
                </div>
                <div className="rounded-lg border border-border/70 bg-card/60 p-3 text-center">
                  <div className="text-xs text-muted-foreground">Failed</div>
                  <div className="text-lg font-bold text-rose-500">
                    {progress.totalFailed.toLocaleString()}
                  </div>
                </div>
                <div className="rounded-lg border border-border/70 bg-card/60 p-3 text-center">
                  <div className="text-xs text-muted-foreground">Transferred</div>
                  <div className="text-lg font-bold text-primary">
                    {formatBytes(progress.cumulativeBytesSent)}
                  </div>
                </div>
              </div>

              {/* Payload Meter vs 16 MB Limit */}
              <div className="space-y-1">
                <div className="flex items-center justify-between text-xs text-muted-foreground">
                  <span>Session Payload Meter</span>
                  <span>
                    {(progress.cumulativeBytesSent / (1024 * 1024)).toFixed(2)} MB /{" "}
                    {(MAX_IMPORT_TOTAL_SIZE_BYTES / (1024 * 1024)).toFixed(0)} MB
                  </span>
                </div>
                <Progress
                  value={(progress.cumulativeBytesSent / MAX_IMPORT_TOTAL_SIZE_BYTES) * 100}
                  className="h-1.5"
                />
              </div>
            </div>

            <DialogFooter>
              <Button
                variant={showCancelConfirm ? "destructive" : "outline"}
                onClick={handleCancelClick}
              >
                {showCancelConfirm ? "Confirm Stop Import" : "Cancel Import"}
              </Button>
            </DialogFooter>
          </>
        )}

        {/* ================================================================= */}
        {/* STEP 4: SUMMARY */}
        {/* ================================================================= */}
        {step === "summary" && (
          <>
            <DialogHeader>
              <DialogTitle className="flex items-center gap-2 text-xl font-bold">
                {importState === "completed" && (
                  <>
                    <CheckCircle2 className="h-6 w-6 text-emerald-500" />
                    Import Completed
                  </>
                )}
                {importState === "cancelled" && (
                  <>
                    <AlertTriangle className="h-6 w-6 text-amber-500" />
                    Import Cancelled
                  </>
                )}
                {importState === "failed" && (
                  <>
                    <XCircle className="h-6 w-6 text-destructive" />
                    Import Failed
                  </>
                )}
              </DialogTitle>
              <DialogDescription>
                {importState === "completed" &&
                  `Documents successfully imported into collection '${targetCollection}'.`}
                {importState === "cancelled" &&
                  "Import operation was cancelled by the user. Partial documents remain committed."}
                {importState === "failed" &&
                  "Import encountered an error and halted. Partial documents may remain committed."}
              </DialogDescription>
            </DialogHeader>

            <div className="space-y-4 py-3">
              {/* Failure Error Banner */}
              {importState === "failed" && importError && (
                <div className="flex items-start gap-2 rounded-md border border-destructive/30 bg-destructive/10 p-3 text-xs text-destructive">
                  <AlertCircle className="h-4 w-4 shrink-0 mt-0.5" />
                  <div className="break-all">{importError}</div>
                </div>
              )}

              {/* Summary Stats Grid */}
              <div className="grid grid-cols-3 gap-3">
                <div className="rounded-lg border border-border/70 bg-card/60 p-3 text-center">
                  <div className="text-xs text-muted-foreground">Inserted</div>
                  <div className="text-xl font-bold text-emerald-500">
                    {progress.totalInserted.toLocaleString()}
                  </div>
                </div>
                <div className="rounded-lg border border-border/70 bg-card/60 p-3 text-center">
                  <div className="text-xs text-muted-foreground">Failed</div>
                  <div className="text-xl font-bold text-rose-500">
                    {progress.totalFailed.toLocaleString()}
                  </div>
                </div>
                <div className="rounded-lg border border-border/70 bg-card/60 p-3 text-center">
                  <div className="text-xs text-muted-foreground">Transferred</div>
                  <div className="text-xl font-bold text-primary">
                    {formatBytes(progress.cumulativeBytesSent)}
                  </div>
                </div>
              </div>
            </div>

            <DialogFooter>
              <Button onClick={handleFinish}>Done</Button>
            </DialogFooter>
          </>
        )}
      </DialogContent>
    </Dialog>
  );
}
