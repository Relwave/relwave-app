import { useState } from "react";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { ScrollArea, ScrollBar } from "@/components/ui/scroll-area";
import {
  Database,
  Pencil,
  Trash2,
  ArrowUp,
  ArrowDown,
  ArrowUpDown,
  Copy,
  Check,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { formatTimestamp } from "@/lib/utils";
import { toast } from "sonner";

export interface DataTableColumnDef {
  name: string;
  type?: string;
}

interface DataTableProps {
  data: Array<Record<string, any>>;
  columns?: Array<DataTableColumnDef | string>;
  maxHeight?: string;
  showRowNumbers?: boolean;
  onEditRow?: (row: Record<string, any>) => void;
  onDeleteRow?: (row: Record<string, any>) => void;
  emptyMessage?: string;
  sortColumn?: string;
  sortDirection?: "asc" | "desc";
  onSort?: (column: string) => void;
}

export const DataTable = ({
  data,
  columns: propColumns,
  maxHeight = "100%",
  showRowNumbers = true,
  onEditRow,
  onDeleteRow,
  emptyMessage,
  sortColumn,
  sortDirection,
  onSort,
}: DataTableProps) => {
  const [copiedCellKey, setCopiedCellKey] = useState<string | null>(null);

  // Normalize columns from either props or first row of data
  const columns: DataTableColumnDef[] = (() => {
    if (propColumns && propColumns.length > 0) {
      return propColumns.map((col) => (typeof col === "string" ? { name: col } : col));
    }
    if (data && data.length > 0) {
      return Object.keys(data[0]).map((name) => ({ name }));
    }
    return [];
  })();

  const isEmpty = !data || data.length === 0;

  const handleCellCopy = (value: any, key: string, e: React.MouseEvent) => {
    e.stopPropagation();
    if (value === null || value === undefined) return;
    const str = typeof value === "object" ? JSON.stringify(value, null, 2) : String(value);
    navigator.clipboard.writeText(str);
    setCopiedCellKey(key);
    const preview = str.length > 25 ? `${str.slice(0, 25)}...` : str;
    toast.success(`Copied: ${preview}`, { duration: 1500 });
    setTimeout(() => {
      setCopiedCellKey((curr) => (curr === key ? null : curr));
    }, 1500);
  };

  // If there is no data AND no columns defined, show generic placeholder
  if (isEmpty && columns.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-12 px-4 text-center">
        <div className="rounded-full bg-muted/30 p-3 mb-3">
          <Database className="h-6 w-6 text-muted-foreground/50" />
        </div>
        <p className="text-sm font-medium text-muted-foreground">No results found</p>
        <p className="text-xs text-muted-foreground/60 mt-1 max-w-55">
          {emptyMessage || "This table is empty or the query returned no data"}
        </p>
      </div>
    );
  }

  const columnNames = columns.map((col) => col.name);
  const hasRowActions = onEditRow || onDeleteRow;
  const colSpan = columnNames.length + (showRowNumbers ? 1 : 0) + (hasRowActions ? 1 : 0);

  const tableContent = (
    <Table>
      <TableHeader className="sticky top-0 z-10">
        <TableRow className="bg-muted/45 hover:bg-muted/45 border-b border-border/30 backdrop-blur-sm">
          {showRowNumbers && (
            <TableHead className="w-12 text-center text-[11px] font-medium text-muted-foreground/60 px-3 py-2 select-none">
              #
            </TableHead>
          )}
          {columns.map((column) => {
            const isSorted = sortColumn === column.name;
            return (
              <TableHead
                key={column.name}
                className="text-xs font-semibold font-mono text-muted-foreground/80 whitespace-nowrap px-4 py-2.5 first:pl-4 select-none"
              >
                <div
                  className={`flex items-center gap-1.5 ${
                    onSort
                      ? "cursor-pointer hover:text-foreground transition-colors group/header"
                      : ""
                  }`}
                  onClick={() => onSort?.(column.name)}
                >
                  <span className={isSorted ? "text-primary font-bold" : ""}>{column.name}</span>
                  {column.type && (
                    <span className="text-[10px] font-normal text-muted-foreground/60 px-1 py-0.2 rounded bg-muted/60">
                      {column.type}
                    </span>
                  )}
                  {onSort && (
                    <span className="ml-1 text-muted-foreground/40 group-hover/header:text-foreground transition-colors">
                      {isSorted ? (
                        sortDirection === "asc" ? (
                          <ArrowUp className="h-3 w-3 text-primary stroke-[2.5]" />
                        ) : (
                          <ArrowDown className="h-3 w-3 text-primary stroke-[2.5]" />
                        )
                      ) : (
                        <ArrowUpDown className="h-2.5 w-2.5 opacity-0 group-hover/header:opacity-100 transition-opacity" />
                      )}
                    </span>
                  )}
                </div>
              </TableHead>
            );
          })}
          {hasRowActions && (
            <TableHead className="w-24 text-center text-[11px] font-medium text-muted-foreground/60 px-2 py-2 select-none">
              Actions
            </TableHead>
          )}
        </TableRow>
      </TableHeader>
      <TableBody>
        {isEmpty ? (
          <TableRow className="hover:bg-transparent">
            <TableCell
              colSpan={colSpan}
              className="h-36 text-center text-muted-foreground text-xs select-none"
            >
              <div className="flex flex-col items-center justify-center gap-1.5 py-6">
                <Database className="h-5 w-5 text-muted-foreground/30 mb-1" />
                <span className="font-medium text-muted-foreground/80 text-sm">Table is empty</span>
                <span className="text-xs text-muted-foreground/60">
                  0 rows • Defined with {columns.length} columns ({columnNames.join(", ")})
                </span>
              </div>
            </TableCell>
          </TableRow>
        ) : (
          data.map((row, index) => (
            <TableRow
              key={index}
              className="group transition-colors hover:bg-accent/20 border-b border-border/10 last:border-0"
            >
              {showRowNumbers && (
                <TableCell className="w-12 text-center text-[11px] tabular-nums text-muted-foreground/40 px-3 py-2 font-normal">
                  {index + 1}
                </TableCell>
              )}
              {columnNames.map((column) => {
                const cellKey = `${index}-${column}`;
                const val = row[column];
                const isCopied = copiedCellKey === cellKey;
                const hasValue = val !== null && val !== undefined;

                return (
                  <TableCell
                    key={column}
                    className="group/cell relative font-mono text-xs whitespace-nowrap px-4 py-2 max-w-75 truncate transition-colors"
                    title={
                      hasValue
                        ? typeof val === "object"
                          ? JSON.stringify(val)
                          : String(val)
                        : "NULL"
                    }
                  >
                    <div className="flex items-center justify-between gap-1">
                      <div className="truncate flex-1">{formatCellValue(val, column)}</div>
                      {hasValue && (
                        <button
                          onClick={(e) => handleCellCopy(val, cellKey, e)}
                          className="opacity-0 group-hover/cell:opacity-100 p-1 rounded hover:bg-muted/80 text-muted-foreground hover:text-foreground transition-all shrink-0 ml-1"
                          title="Copy cell value"
                        >
                          {isCopied ? (
                            <Check className="h-3 w-3 text-emerald-500 stroke-[2.5]" />
                          ) : (
                            <Copy className="h-3 w-3" />
                          )}
                        </button>
                      )}
                    </div>
                  </TableCell>
                );
              })}
              {hasRowActions && (
                <TableCell className="w-24 px-2 py-1">
                  <div className="flex items-center justify-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                    {onEditRow && (
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-7 w-7 hover:bg-primary/10"
                        onClick={() => onEditRow(row)}
                        title="Edit row"
                      >
                        <Pencil className="h-3.5 w-3.5 text-muted-foreground hover:text-primary" />
                      </Button>
                    )}
                    {onDeleteRow && (
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-7 w-7 hover:bg-destructive/10"
                        onClick={() => onDeleteRow(row)}
                        title="Delete row"
                      >
                        <Trash2 className="h-3.5 w-3.5 text-muted-foreground hover:text-destructive" />
                      </Button>
                    )}
                  </div>
                </TableCell>
              )}
            </TableRow>
          ))
        )}
      </TableBody>
    </Table>
  );

  // If maxHeight is "none", render table directly (parent handles scrolling)
  if (maxHeight === "none") {
    return (
      <div className="max-w-full min-w-0 rounded-lg border border-border/50 overflow-x-auto bg-background/70 shadow-sm">
        {tableContent}
      </div>
    );
  }

  // Otherwise use ScrollArea with maxHeight
  return (
    <div className="max-w-full min-w-0 rounded-lg border border-border/50 overflow-hidden bg-background/70 shadow-sm">
      <ScrollArea className="w-full" style={{ maxHeight }}>
        {tableContent}
        <ScrollBar orientation="horizontal" />
        <ScrollBar orientation="vertical" />
      </ScrollArea>
    </div>
  );
};

// Helper function to format cell values with improved styling
function formatCellValue(value: any, columnName?: string): React.ReactNode {
  if (value === null || value === undefined) {
    return (
      <span className="inline-flex items-center px-1.5 py-0.2 rounded text-[10px] font-mono tracking-wider italic text-muted-foreground/45 bg-muted/40 border border-border/20 select-none">
        NULL
      </span>
    );
  }

  if (typeof value === "boolean") {
    return (
      <span
        className={`inline-flex items-center px-1.5 py-0.5 rounded text-[11px] font-mono font-medium border ${
          value
            ? "bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border-emerald-500/20"
            : "bg-rose-500/10 text-rose-600 dark:text-rose-400 border-rose-500/20"
        }`}
      >
        {value.toString()}
      </span>
    );
  }

  if (typeof value === "number") {
    const isLikelyTimestampCol = columnName
      ?.toLowerCase()
      .match(/time|date|created|updated|deleted/);
    if (isLikelyTimestampCol) {
      if (value > 1e9 && value < 1e10) {
        // Seconds
        return (
          <span className="text-violet-600 dark:text-violet-400 font-mono tabular-nums">
            {formatTimestamp(new Date(value * 1000).toISOString())}
          </span>
        );
      } else if (value > 1e12 && value < 1e13) {
        // Milliseconds
        return (
          <span className="text-violet-600 dark:text-violet-400 font-mono tabular-nums">
            {formatTimestamp(new Date(value).toISOString())}
          </span>
        );
      }
    }
    return (
      <span className="text-indigo-600 dark:text-indigo-400 tabular-nums font-mono">
        {value.toLocaleString()}
      </span>
    );
  }

  if (value instanceof Date) {
    return (
      <span className="text-violet-600 dark:text-violet-400 font-mono tabular-nums">
        {formatTimestamp(value.toISOString())}
      </span>
    );
  }

  if (typeof value === "object") {
    try {
      const jsonStr = JSON.stringify(value);
      return (
        <span className="text-amber-600 dark:text-amber-400 text-xs font-mono bg-amber-500/10 border border-amber-500/20 px-1.5 py-0.5 rounded">
          {jsonStr.slice(0, 80)}
          {jsonStr.length > 80 ? "…" : ""}
        </span>
      );
    } catch {
      return <span className="text-muted-foreground font-mono text-xs">[Object]</span>;
    }
  }

  const strValue = String(value);

  if (strValue === "") {
    return (
      <span className="text-muted-foreground/35 text-[10px] italic font-mono select-none">
        &lt;empty&gt;
      </span>
    );
  }

  // Check if it looks like a date string
  if (typeof strValue === "string" && /^\d{4}-\d{2}-\d{2}/.test(strValue)) {
    return (
      <span className="text-violet-600 dark:text-violet-400 font-mono tabular-nums">
        {formatTimestamp(strValue)}
      </span>
    );
  }

  // Check if it's a UNIX timestamp (seconds or ms) based on column name heuristic
  const isLikelyTimestampCol = columnName?.toLowerCase().match(/time|date|created|updated|deleted/);
  if (isLikelyTimestampCol) {
    // 10 digits (seconds) or 13 digits (ms)
    if (/^\d{10}$/.test(strValue)) {
      return (
        <span className="text-violet-600 dark:text-violet-400 font-mono tabular-nums">
          {formatTimestamp(new Date(Number(strValue) * 1000).toISOString())}
        </span>
      );
    }
    if (/^\d{13}$/.test(strValue)) {
      return (
        <span className="text-violet-600 dark:text-violet-400 font-mono tabular-nums">
          {formatTimestamp(new Date(Number(strValue)).toISOString())}
        </span>
      );
    }
  }

  // Check if it looks like an ID or UUID
  if (/^[a-f0-9-]{36}$/i.test(strValue)) {
    return <span className="text-slate-500 dark:text-slate-400 text-xs font-mono">{strValue}</span>;
  }

  if (strValue.length > 80) {
    return (
      <span className="text-foreground/90 font-mono">
        {strValue.slice(0, 80)}
        <span className="text-muted-foreground font-sans">…</span>
      </span>
    );
  }

  return <span className="text-foreground/90 font-mono">{strValue}</span>;
}
