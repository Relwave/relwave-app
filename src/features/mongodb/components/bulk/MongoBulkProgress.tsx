/**
 * MongoDB Milestone 7 Phase 4 — Bulk Operation Live Progress Card
 *
 * Atomic progress component rendering real-time document counts,
 * throughput, format badges, and cancellation trigger.
 */

import React from "react";
import { Progress } from "@/components/ui/progress";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Loader2, AlertTriangle, Upload, Download, XCircle } from "lucide-react";
import type { TrackedAsyncBulkOperation } from "../../types/bulk";
import { formatBytes } from "./MongoBulkExportDialog";

export interface MongoBulkProgressProps {
  operation: TrackedAsyncBulkOperation;
  onCancel?: (operationId: string) => void;
  className?: string;
}

export function MongoBulkProgress({ operation, onCancel, className = "" }: MongoBulkProgressProps) {
  const isImport = operation.type === "import";
  const isActive = operation.status === "pending" || operation.status === "in_progress";

  const percent =
    operation.processedDocuments > 0
      ? Math.min(
          100,
          Math.round((operation.successfulDocuments / operation.processedDocuments) * 100),
        )
      : operation.status === "in_progress"
        ? 15
        : 5;

  return (
    <div
      className={`rounded-xl border border-border/70 bg-card/60 p-4 shadow-xs backdrop-blur-md space-y-3 ${className}`}
      data-testid={`bulk-progress-${operation.operationId}`}
    >
      {/* Header */}
      <div className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-2 overflow-hidden">
          {isImport ? (
            <div className="rounded-md bg-primary/10 p-1.5 text-primary">
              <Upload className="h-4 w-4" />
            </div>
          ) : (
            <div className="rounded-md bg-emerald-500/10 p-1.5 text-emerald-500">
              <Download className="h-4 w-4" />
            </div>
          )}
          <div className="truncate">
            <div className="text-sm font-semibold truncate">
              {isImport ? "Importing" : "Exporting"} '{operation.collection}'
            </div>
            <div className="text-[11px] font-mono text-muted-foreground truncate">
              {operation.operationId}
            </div>
          </div>
        </div>

        <div className="flex items-center gap-1.5">
          {operation.format && (
            <Badge variant="outline" className="text-[10px] uppercase">
              {operation.format}
            </Badge>
          )}
          <Badge
            variant={operation.status === "in_progress" ? "default" : "secondary"}
            className="text-[10px] capitalize"
          >
            {operation.status === "in_progress" && (
              <Loader2 className="h-2.5 w-2.5 animate-spin mr-1 inline" />
            )}
            {operation.status}
          </Badge>
        </div>
      </div>

      {/* Unreachable Warning */}
      {operation.isUnreachable && (
        <div className="flex items-center gap-1.5 rounded-md border border-amber-500/30 bg-amber-500/10 p-2 text-xs text-amber-500">
          <AlertTriangle className="h-3.5 w-3.5 shrink-0" />
          <span>Connection unreachable. Retrying in background...</span>
        </div>
      )}

      {/* Progress Bar */}
      <div className="space-y-1">
        <div className="flex items-center justify-between text-xs text-muted-foreground">
          <span>Processed: {operation.processedDocuments.toLocaleString()}</span>
          <span>{percent}%</span>
        </div>
        <Progress value={percent} className="h-2" />
      </div>

      {/* Live Metrics */}
      <div className="grid grid-cols-3 gap-2 text-center text-xs">
        <div className="rounded-md border border-border/50 bg-background/50 p-1.5">
          <div className="text-muted-foreground text-[10px]">Inserted / OK</div>
          <div className="font-semibold text-emerald-500">
            {operation.successfulDocuments.toLocaleString()}
          </div>
        </div>
        <div className="rounded-md border border-border/50 bg-background/50 p-1.5">
          <div className="text-muted-foreground text-[10px]">Failed</div>
          <div className="font-semibold text-rose-500">
            {operation.failedDocuments.toLocaleString()}
          </div>
        </div>
        <div className="rounded-md border border-border/50 bg-background/50 p-1.5">
          <div className="text-muted-foreground text-[10px]">Size</div>
          <div className="font-semibold text-primary">
            {formatBytes(operation.fileSizeBytes ?? 0)}
          </div>
        </div>
      </div>

      {/* Actions */}
      {isActive && onCancel && (
        <div className="flex justify-end pt-1">
          <Button
            size="sm"
            variant="outline"
            className="h-7 text-xs text-destructive hover:bg-destructive/10"
            onClick={() => onCancel(operation.operationId)}
          >
            <XCircle className="h-3.5 w-3.5 mr-1" />
            Cancel Operation
          </Button>
        </div>
      )}
    </div>
  );
}
