/**
 * MongoDB Milestone 7 Phase 4 — Bulk Operations Panel
 *
 * Database-level view hosting summary metrics, active operation highlight cards,
 * history table, and modal triggers with Stage 5 integration options.
 */

import React, { useState, useMemo } from "react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Upload,
  Download,
  Activity,
  CheckCircle2,
  XCircle,
  Database,
} from "lucide-react";
import { useMongoBulkOperationsStore } from "../../hooks/useMongoBulkOperationsStore";
import { MongoBulkProgress } from "./MongoBulkProgress";
import { MongoBulkOperationsHistory } from "./MongoBulkOperationsHistory";
import { MongoBulkImportDialog } from "./MongoBulkImportDialog";
import { MongoBulkExportDialog } from "./MongoBulkExportDialog";
import { isAsyncBulkOperation } from "../../types/bulk";
import type { BulkOperationsStoreServiceContract } from "../../hooks/useMongoBulkOperationsStore";

export interface MongoBulkOperationsPanelProps {
  dbId: string;
  databaseName: string;
  activeCollection?: string;
  service?: BulkOperationsStoreServiceContract;
}

export function MongoBulkOperationsPanel({
  dbId,
  databaseName,
  activeCollection = "",
  service,
}: MongoBulkOperationsPanelProps) {
  const store = useMongoBulkOperationsStore({ service });
  const [isImportOpen, setIsImportOpen] = useState(false);
  const [isExportOpen, setIsExportOpen] = useState(false);

  const dbOperations = useMemo(() => {
    return store.operationsByDb[dbId] || [];
  }, [store.operationsByDb, dbId]);

  // Metric Computations
  const totalCount = dbOperations.length;

  const activeOperations = useMemo(() => {
    return dbOperations.filter((op) => {
      if (isAsyncBulkOperation(op)) {
        return op.status === "pending" || op.status === "in_progress";
      }
      return op.status === "running";
    });
  }, [dbOperations]);

  const activeCount = activeOperations.length;

  const completedCount = useMemo(() => {
    return dbOperations.filter((op) => op.status === "completed").length;
  }, [dbOperations]);

  const failedOrCancelledCount = useMemo(() => {
    return dbOperations.filter((op) =>
      ["failed", "cancelled", "stale"].includes(op.status),
    ).length;
  }, [dbOperations]);

  const expiredCount = useMemo(() => {
    const now = Date.now();
    return dbOperations.filter((op) => {
      if (!isAsyncBulkOperation(op)) return false;
      const isTerminalOrStale = ["completed", "failed", "cancelled", "stale"].includes(op.status);
      return isTerminalOrStale && now > new Date(op.expiresAt).getTime();
    }).length;
  }, [dbOperations]);

  return (
    <div className="space-y-6 p-6" data-testid="mongo-bulk-operations-panel">
      {/* Header */}
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-2">
            <h1 className="text-2xl font-bold tracking-tight">Bulk Operations</h1>
            <Badge variant="outline" className="flex items-center gap-1 font-mono text-xs">
              <Database className="h-3 w-3 text-primary" />
              {databaseName}
            </Badge>
          </div>
          <p className="text-sm text-muted-foreground mt-1">
            Manage chunked imports, streaming exports, and bulk mutations.
          </p>
        </div>

        <div className="flex items-center gap-2">
          <Button
            onClick={() => setIsImportOpen(true)}
            className="text-xs h-9"
            data-testid="panel-import-button"
          >
            <Upload className="h-4 w-4 mr-1.5" />
            Import Documents
          </Button>

          <Button
            onClick={() => setIsExportOpen(true)}
            variant="outline"
            className="text-xs h-9"
            data-testid="panel-export-button"
          >
            <Download className="h-4 w-4 mr-1.5" />
            Export Documents
          </Button>
        </div>
      </div>

      {/* Summary Cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <div className="rounded-xl border border-border/70 bg-card/60 p-4 shadow-xs backdrop-blur-md">
          <div className="flex items-center justify-between text-xs text-muted-foreground">
            <span>Total Operations</span>
            <Activity className="h-4 w-4 text-primary" />
          </div>
          <div className="text-2xl font-bold mt-2" data-testid="metric-total">
            {totalCount}
          </div>
        </div>

        <div className="rounded-xl border border-border/70 bg-card/60 p-4 shadow-xs backdrop-blur-md">
          <div className="flex items-center justify-between text-xs text-muted-foreground">
            <span>Active</span>
            <Activity className="h-4 w-4 text-blue-500 animate-pulse" />
          </div>
          <div className="text-2xl font-bold text-blue-500 mt-2" data-testid="metric-active">
            {activeCount}
          </div>
        </div>

        <div className="rounded-xl border border-border/70 bg-card/60 p-4 shadow-xs backdrop-blur-md">
          <div className="flex items-center justify-between text-xs text-muted-foreground">
            <span>Completed</span>
            <CheckCircle2 className="h-4 w-4 text-emerald-500" />
          </div>
          <div className="text-2xl font-bold text-emerald-500 mt-2" data-testid="metric-completed">
            {completedCount}
          </div>
        </div>

        <div className="rounded-xl border border-border/70 bg-card/60 p-4 shadow-xs backdrop-blur-md">
          <div className="flex items-center justify-between text-xs text-muted-foreground">
            <span>Failed / Cancelled</span>
            <XCircle className="h-4 w-4 text-rose-500" />
          </div>
          <div className="text-2xl font-bold text-rose-500 mt-2" data-testid="metric-failed">
            {failedOrCancelledCount}
          </div>
        </div>
      </div>

      {/* Active Operations Highlight Section */}
      {activeCount > 0 && (
        <div className="space-y-3" data-testid="active-operations-highlight">
          <h2 className="text-sm font-semibold text-foreground flex items-center gap-2">
            <span className="relative flex h-2 w-2">
              <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-blue-400 opacity-75"></span>
              <span className="relative inline-flex rounded-full h-2 w-2 bg-blue-500"></span>
            </span>
            Active Operations ({activeCount})
          </h2>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {activeOperations.map((op) => {
              if (isAsyncBulkOperation(op)) {
                return (
                  <MongoBulkProgress
                    key={op.operationId}
                    operation={op}
                    onCancel={(id) => store.cancelOperation(id)}
                  />
                );
              }
              return null;
            })}
          </div>
        </div>
      )}

      {/* History Section */}
      <div className="space-y-3">
        <h2 className="text-sm font-semibold text-foreground">Operation History</h2>
        <MongoBulkOperationsHistory
          operations={dbOperations}
          onCancel={(id) => store.cancelOperation(id)}
          onCleanup={(id) => store.cleanupOperation(id)}
          onRetry={(id) => store.retryPolling(id)}
          onRemove={(id) => store.removeOperation(id)}
          onClearExpired={() => store.clearExpiredOperations(dbId)}
          expiredCount={expiredCount}
        />
      </div>

      {/* Delegated Mode Modals */}
      <MongoBulkImportDialog
        open={isImportOpen}
        onOpenChange={setIsImportOpen}
        dbId={dbId}
        databaseName={databaseName}
        defaultCollection={activeCollection}
        cancelOnUnmount={false}
        service={service as any}
        onOperationStart={(op, abortCtrl, cancelFn) => {
          store.registerAsyncOperation(dbId, op, {
            abortController: abortCtrl,
            cancelFn,
          });
        }}
        onChunkAcknowledged={(prog, res) => {
          const currentOps = store.operationsByDb[dbId] || [];
          const activeOp = currentOps.find(
            (o) => isAsyncBulkOperation(o) && o.operationId === res.operationId,
          );
          if (activeOp && isAsyncBulkOperation(activeOp)) {
            store.updateAsyncOperation(res.operationId, {
              status: "in_progress",
              processedDocuments: prog.documentsSubmitted,
              successfulDocuments: prog.totalInserted,
              failedDocuments: prog.totalFailed,
            });
          }
        }}
        onTerminalState={(opId, status, error) => {
          store.updateAsyncOperation(opId, {
            status,
            error,
          });
        }}
      />

      <MongoBulkExportDialog
        open={isExportOpen}
        onOpenChange={setIsExportOpen}
        dbId={dbId}
        databaseName={databaseName}
        defaultCollection={activeCollection}
        cancelOnUnmount={false}
        externalPolling={true}
        service={service as any}
        onOperationStart={(op) => {
          store.registerAsyncOperation(dbId, op);
        }}
      />
    </div>
  );
}
