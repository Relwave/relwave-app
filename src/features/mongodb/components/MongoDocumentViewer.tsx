import React, { useMemo, useState } from "react";
import { DataTable } from "@/components/shared/DataTable";
import { MongoDocumentCell } from "./MongoDocumentCell";
import { MongoFilterInput } from "./MongoFilterInput";
import { EJSONDocument } from "../types";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Copy,
  Check,
  ChevronLeft,
  ChevronRight,
  ChevronsLeft,
  ChevronsRight,
  RefreshCw,
  Database,
} from "lucide-react";
import { toast } from "sonner";

export function MongoDocumentViewer({
  collection,
  documents,
  totalDocuments,
  page,
  pageSize,
  totalPages,
  isLoading,
  sortField,
  sortDirection,
  onSort,
  onPageChange,
  onPageSizeChange,
  filterInput,
  onFilterInputChange,
  onApplyFilter,
  onResetFilter,
  isFilterApplied,
  onRefresh,
}: {
  collection: string;
  documents: EJSONDocument[];
  totalDocuments: number;
  page: number;
  pageSize: number;
  totalPages: number;
  isLoading: boolean;
  sortField: string | null;
  sortDirection: 1 | -1 | null;
  onSort: (field: string) => void;
  onPageChange: (newPage: number) => void;
  onPageSizeChange: (newSize: number) => void;
  filterInput: string;
  onFilterInputChange: (text: string) => void;
  onApplyFilter: (filter: EJSONDocument | undefined) => void;
  onResetFilter: () => void;
  isFilterApplied: boolean;
  onRefresh: () => void;
}) {
  const [copiedAll, setCopiedAll] = useState(false);

  // Derive column list, pinning _id to the first position
  const columns = useMemo(() => {
    if (!documents || documents.length === 0) return [];
    const keySet = new Set<string>();
    documents.forEach((doc) => {
      Object.keys(doc).forEach((k) => keySet.add(k));
    });
    keySet.delete("_id");
    const otherCols = Array.from(keySet).sort();
    return ["_id", ...otherCols];
  }, [documents]);

  const handleCopyAll = () => {
    if (!documents || documents.length === 0) return;
    const str = JSON.stringify(documents, null, 2);
    navigator.clipboard.writeText(str);
    setCopiedAll(true);
    toast.success(`Copied ${documents.length} visible documents to clipboard`);
    setTimeout(() => setCopiedAll(false), 1500);
  };

  const startDoc = (page - 1) * pageSize + 1;
  const endDoc = Math.min(page * pageSize, totalDocuments);

  return (
    <div className="flex-1 flex flex-col h-full overflow-hidden bg-background">
      {/* Top action toolbar */}
      <div className="p-3 border-b border-border/40 flex flex-wrap items-center justify-between gap-3">
        <MongoFilterInput
          filterInput={filterInput}
          onFilterInputChange={onFilterInputChange}
          onApply={onApplyFilter}
          onReset={onResetFilter}
          isApplied={isFilterApplied}
        />

        <div className="flex items-center gap-2">
          <Button
            variant="outline"
            size="sm"
            onClick={handleCopyAll}
            disabled={documents.length === 0}
            className="h-9 gap-1.5 text-xs"
          >
            {copiedAll ? (
              <Check className="h-3.5 w-3.5 text-emerald-500" />
            ) : (
              <Copy className="h-3.5 w-3.5" />
            )}
            Copy Page JSON
          </Button>

          <Button
            variant="ghost"
            size="icon"
            onClick={onRefresh}
            className="h-9 w-9 text-muted-foreground hover:text-foreground"
            title="Refresh documents"
          >
            <RefreshCw className={`h-4 w-4 ${isLoading ? "animate-spin" : ""}`} />
          </Button>
        </div>
      </div>

      {/* Main table area */}
      <div className="flex-1 overflow-auto p-4">
        {isLoading && documents.length === 0 ? (
          <div className="h-full flex flex-col items-center justify-center text-muted-foreground gap-2">
            <RefreshCw className="h-6 w-6 animate-spin text-emerald-500" />
            <p className="text-xs">Loading documents...</p>
          </div>
        ) : documents.length === 0 ? (
          <div className="h-full flex flex-col items-center justify-center text-center p-8">
            <div className="rounded-full bg-muted/40 p-4 mb-3">
              <Database className="h-8 w-8 text-muted-foreground/60" />
            </div>
            <h3 className="text-sm font-medium text-foreground">No documents found</h3>
            <p className="text-xs text-muted-foreground mt-1 max-w-sm">
              {isFilterApplied
                ? "No documents matched your active filter."
                : `Collection "${collection}" has no documents.`}
            </p>
          </div>
        ) : (
          <DataTable
            data={documents}
            columns={columns}
            maxHeight="none"
            showRowNumbers={true}
            sortColumn={sortField || undefined}
            sortDirection={sortDirection === 1 ? "asc" : sortDirection === -1 ? "desc" : undefined}
            onSort={onSort}
            renderCell={(val, col, row) => <MongoDocumentCell value={val} column={col} row={row} />}
          />
        )}
      </div>

      {/* Pagination Footer */}
      <div className="px-4 py-2.5 border-t border-border/40 bg-sidebar/30 flex items-center justify-between text-xs text-muted-foreground">
        <div className="flex items-center gap-3">
          <span>
            {totalDocuments > 0 ? (
              <>
                Showing <strong className="text-foreground">{startDoc.toLocaleString()}</strong> –{" "}
                <strong className="text-foreground">{endDoc.toLocaleString()}</strong> of{" "}
                <strong className="text-foreground">{totalDocuments.toLocaleString()}</strong>{" "}
                documents
              </>
            ) : (
              "0 documents"
            )}
          </span>

          <div className="flex items-center gap-1.5 ml-4">
            <span>Per page:</span>
            <Select value={String(pageSize)} onValueChange={(val) => onPageSizeChange(Number(val))}>
              <SelectTrigger className="h-7 w-18 text-xs bg-background/50 border-border/40">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="10">10</SelectItem>
                <SelectItem value="25">25</SelectItem>
                <SelectItem value="50">50</SelectItem>
                <SelectItem value="100">100</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </div>

        <div className="flex items-center gap-1">
          <Button
            variant="ghost"
            size="icon"
            className="h-7 w-7"
            disabled={page <= 1 || isLoading}
            onClick={() => onPageChange(1)}
            title="First page"
          >
            <ChevronsLeft className="h-3.5 w-3.5" />
          </Button>
          <Button
            variant="ghost"
            size="icon"
            className="h-7 w-7"
            disabled={page <= 1 || isLoading}
            onClick={() => onPageChange(page - 1)}
            title="Previous page"
          >
            <ChevronLeft className="h-3.5 w-3.5" />
          </Button>
          <span className="px-2 font-mono text-xs">
            Page {page} of {totalPages || 1}
          </span>
          <Button
            variant="ghost"
            size="icon"
            className="h-7 w-7"
            disabled={page >= totalPages || isLoading}
            onClick={() => onPageChange(page + 1)}
            title="Next page"
          >
            <ChevronRight className="h-3.5 w-3.5" />
          </Button>
          <Button
            variant="ghost"
            size="icon"
            className="h-7 w-7"
            disabled={page >= totalPages || isLoading}
            onClick={() => onPageChange(totalPages)}
            title="Last page"
          >
            <ChevronsRight className="h-3.5 w-3.5" />
          </Button>
        </div>
      </div>
    </div>
  );
}
