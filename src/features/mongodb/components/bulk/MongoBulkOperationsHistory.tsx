/**
 * MongoDB Milestone 7 Phase 4 — Bulk Operations History Table
 *
 * Searchable, filterable history table for bridge-managed operations
 * and synchronous bulk mutations.
 */

import React, { useState, useMemo } from "react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Search,
  Upload,
  Download,
  Trash2,
  RefreshCw,
  XCircle,
  FileText,
  AlertTriangle,
  HardDrive,
} from "lucide-react";
import type { BulkHistoryEntry, TrackedAsyncBulkOperation } from "../../types/bulk";
import { isAsyncBulkOperation } from "../../types/bulk";
import { formatBytes } from "./MongoBulkExportDialog";

export interface MongoBulkOperationsHistoryProps {
  operations: BulkHistoryEntry[];
  onCancel?: (operationId: string) => void;
  onCleanup?: (operationId: string) => void;
  onRetry?: (operationId: string) => void;
  onRemove?: (operationId: string) => void;
  onClearExpired?: () => void;
  expiredCount?: number;
}

export function MongoBulkOperationsHistory({
  operations,
  onCancel,
  onCleanup,
  onRetry,
  onRemove,
  onClearExpired,
  expiredCount = 0,
}: MongoBulkOperationsHistoryProps) {
  const [searchQuery, setSearchQuery] = useState("");
  const [typeFilter, setTypeFilter] = useState<string>("all");
  const [statusFilter, setStatusFilter] = useState<string>("all");

  const filteredOperations = useMemo(() => {
    return operations.filter((op) => {
      const isAsync = isAsyncBulkOperation(op);
      const identifier = isAsync ? op.operationId : op.id;
      const collection = op.collection;

      // Search match
      if (searchQuery.trim()) {
        const q = searchQuery.toLowerCase();
        const matchesId = identifier.toLowerCase().includes(q);
        const matchesCol = collection.toLowerCase().includes(q);
        if (!matchesId && !matchesCol) return false;
      }

      // Type match
      if (typeFilter !== "all") {
        if (op.type !== typeFilter) return false;
      }

      // Status match
      if (statusFilter !== "all") {
        if (statusFilter === "active") {
          const isActive =
            (isAsync && (op.status === "pending" || op.status === "in_progress")) ||
            (!isAsync && op.status === "running");
          if (!isActive) return false;
        } else if (op.status !== statusFilter) {
          return false;
        }
      }

      return true;
    });
  }, [operations, searchQuery, typeFilter, statusFilter]);

  return (
    <div className="space-y-4" data-testid="bulk-operations-history">
      {/* Filter Toolbar */}
      <div className="flex flex-col sm:flex-row items-center justify-between gap-3">
        <div className="relative w-full sm:w-72">
          <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder="Search by collection or operation ID..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="pl-8 h-9 text-xs"
            data-testid="history-search-input"
          />
        </div>

        <div className="flex items-center gap-2 w-full sm:w-auto justify-end">
          {/* Type Filter */}
          <select
            value={typeFilter}
            onChange={(e) => setTypeFilter(e.target.value)}
            className="h-9 rounded-md border border-input bg-background px-2.5 py-1 text-xs shadow-xs focus-visible:outline-hidden"
            data-testid="history-type-filter"
          >
            <option value="all">All Types</option>
            <option value="import">Import</option>
            <option value="export">Export</option>
            <option value="insert">Insert</option>
            <option value="update">Update</option>
            <option value="delete">Delete</option>
          </select>

          {/* Status Filter */}
          <select
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value)}
            className="h-9 rounded-md border border-input bg-background px-2.5 py-1 text-xs shadow-xs focus-visible:outline-hidden"
            data-testid="history-status-filter"
          >
            <option value="all">All Statuses</option>
            <option value="active">Active</option>
            <option value="completed">Completed</option>
            <option value="partial_success">Partial Success</option>
            <option value="failed">Failed</option>
            <option value="cancelled">Cancelled</option>
            <option value="stale">Stale</option>
          </select>

          {/* Clear Expired Button */}
          {onClearExpired && (
            <Button
              size="sm"
              variant="outline"
              disabled={expiredCount === 0}
              onClick={onClearExpired}
              className="h-9 text-xs"
              data-testid="clear-expired-button"
            >
              Clear Expired ({expiredCount})
            </Button>
          )}
        </div>
      </div>

      {/* History Table */}
      <div className="rounded-xl border border-border/70 overflow-hidden shadow-xs">
        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs">
            <thead className="bg-muted/40 border-b border-border/70 font-semibold text-muted-foreground">
              <tr>
                <th className="px-3.5 py-2.5">Type</th>
                <th className="px-3.5 py-2.5">Collection</th>
                <th className="px-3.5 py-2.5">Status</th>
                <th className="px-3.5 py-2.5">Documents</th>
                <th className="px-3.5 py-2.5">Created</th>
                <th className="px-3.5 py-2.5">Expires</th>
                <th className="px-3.5 py-2.5 text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border/60 font-medium">
              {filteredOperations.length === 0 ? (
                <tr>
                  <td colSpan={7} className="px-4 py-8 text-center text-muted-foreground">
                    No bulk operations found
                  </td>
                </tr>
              ) : (
                filteredOperations.map((entry) => {
                  const isAsync = isAsyncBulkOperation(entry);
                  const id = isAsync ? entry.operationId : entry.id;
                  const isActive =
                    (isAsync && (entry.status === "pending" || entry.status === "in_progress")) ||
                    (!isAsync && entry.status === "running");

                  return (
                    <tr
                      key={id}
                      className="hover:bg-muted/20 transition-colors"
                      data-testid={`history-row-${id}`}
                    >
                      {/* Type */}
                      <td className="px-3.5 py-2.5 whitespace-nowrap">
                        <div className="flex items-center gap-1.5 font-semibold capitalize">
                          {entry.type === "import" && <Upload className="h-3.5 w-3.5 text-primary" />}
                          {entry.type === "export" && <Download className="h-3.5 w-3.5 text-emerald-500" />}
                          {!isAsync && <FileText className="h-3.5 w-3.5 text-amber-500" />}
                          <span>{entry.type}</span>
                        </div>
                      </td>

                      {/* Collection */}
                      <td className="px-3.5 py-2.5 font-mono whitespace-nowrap truncate max-w-[140px]">
                        {entry.collection}
                      </td>

                      {/* Status */}
                      <td className="px-3.5 py-2.5 whitespace-nowrap">
                        <div className="flex items-center gap-1">
                          {entry.status === "partial_success" ? (
                            <Badge
                              variant="outline"
                              className="capitalize text-[10px] text-amber-500 border-amber-500/40"
                            >
                              Partial Success
                            </Badge>
                          ) : (
                            <Badge
                              variant={
                                entry.status === "completed"
                                  ? "default"
                                  : entry.status === "failed"
                                    ? "destructive"
                                    : "secondary"
                              }
                              className="capitalize text-[10px]"
                            >
                              {entry.status}
                            </Badge>
                          )}
                          {isAsync && entry.isUnreachable && (
                            <Badge variant="outline" className="text-[10px] text-amber-500 border-amber-500/40">
                              Unreachable
                            </Badge>
                          )}
                        </div>
                      </td>

                      {/* Documents */}
                      <td className="px-3.5 py-2.5 whitespace-nowrap">
                        {isAsync ? (
                          <div className="flex flex-col">
                            <span>
                              {entry.successfulDocuments.toLocaleString()} /{" "}
                              {entry.processedDocuments.toLocaleString()}
                            </span>
                            {entry.failedDocuments > 0 && (
                              <span className="text-[10px] text-rose-500">
                                {entry.failedDocuments} failed
                              </span>
                            )}
                          </div>
                        ) : entry.status === "partial_success" ? (
                          <span className="text-amber-500 font-medium">
                            {entry.insertedCount ?? 0} inserted, {entry.failedCount ?? 0} failed
                          </span>
                        ) : (
                          <span>
                            {entry.modifiedCount ?? entry.insertedCount ?? entry.deletedCount ?? 0} docs
                          </span>
                        )}
                      </td>

                      {/* Created */}
                      <td className="px-3.5 py-2.5 whitespace-nowrap text-muted-foreground text-[11px]">
                        {new Date(isAsync ? entry.createdAt : entry.timestamp).toLocaleTimeString([], {
                          hour: "2-digit",
                          minute: "2-digit",
                        })}
                      </td>

                      {/* Expires */}
                      <td className="px-3.5 py-2.5 whitespace-nowrap text-muted-foreground text-[11px]">
                        {isAsync ? (
                          Date.now() > new Date(entry.expiresAt).getTime() ? (
                            <span className="text-amber-500 font-semibold">Expired</span>
                          ) : (
                            new Date(entry.expiresAt).toLocaleTimeString([], {
                              hour: "2-digit",
                              minute: "2-digit",
                            })
                          )
                        ) : (
                          "—"
                        )}
                      </td>

                      {/* Actions */}
                      <td className="px-3.5 py-2.5 whitespace-nowrap text-right">
                        <div className="flex items-center justify-end gap-1">
                          {isActive && onCancel && (
                            <Button
                              size="sm"
                              variant="ghost"
                              className="h-7 px-2 text-xs text-destructive hover:bg-destructive/10"
                              onClick={() => onCancel(id)}
                              title="Cancel"
                            >
                              <XCircle className="h-3.5 w-3.5" />
                            </Button>
                          )}

                          {isAsync && entry.isUnreachable && onRetry && (
                            <Button
                              size="sm"
                              variant="ghost"
                              className="h-7 px-2 text-xs text-amber-500 hover:bg-amber-500/10"
                              onClick={() => onRetry(id)}
                              title="Retry connection"
                            >
                              <RefreshCw className="h-3.5 w-3.5" />
                            </Button>
                          )}

                          {isAsync && entry.type === "export" && onCleanup && (
                            <Button
                              size="sm"
                              variant="ghost"
                              className="h-7 px-2 text-xs text-muted-foreground hover:bg-muted"
                              onClick={() => onCleanup(id)}
                              title="Clean temporary cache"
                            >
                              <HardDrive className="h-3.5 w-3.5" />
                            </Button>
                          )}

                          {onRemove && (
                            <Button
                              size="sm"
                              variant="ghost"
                              className="h-7 px-2 text-xs text-muted-foreground hover:text-destructive hover:bg-destructive/10"
                              onClick={() => onRemove(id)}
                              title="Remove from history"
                            >
                              <Trash2 className="h-3.5 w-3.5" />
                            </Button>
                          )}
                        </div>
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
