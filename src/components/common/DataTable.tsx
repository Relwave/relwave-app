import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { ScrollArea, ScrollBar } from "@/components/ui/scroll-area";
import { Database } from "lucide-react";

interface DataTableProps {
  data: Array<Record<string, any>>;
  maxHeight?: string;
  showRowNumbers?: boolean;
}

export const DataTable = ({ data, maxHeight = "100%", showRowNumbers = true }: DataTableProps) => {
  if (!data || data.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-12 px-4 text-center">
        <div className="rounded-full bg-muted/30 p-3 mb-3">
          <Database className="h-6 w-6 text-muted-foreground/50" />
        </div>
        <p className="text-sm font-medium text-muted-foreground">No results found</p>
        <p className="text-xs text-muted-foreground/60 mt-1 max-w-[220px]">
          This table is empty or the query returned no data
        </p>
      </div>
    );
  }

  const columns = Object.keys(data[0]);

  const tableContent = (
    <Table>
      <TableHeader>
        <TableRow className="bg-muted/20 hover:bg-muted/20 border-b border-border/20">
          {showRowNumbers && (
            <TableHead className="w-12 text-center text-[11px] font-medium text-muted-foreground/60 px-3 py-2">
              #
            </TableHead>
          )}
          {columns.map((column) => (
            <TableHead
              key={column}
              className="text-xs font-medium text-muted-foreground/70 whitespace-nowrap px-4 py-2.5 first:pl-4"
            >
              {column}
            </TableHead>
          ))}
        </TableRow>
      </TableHeader>
      <TableBody>
        {data.map((row, index) => (
          <TableRow
            key={index}
            className="group transition-colors hover:bg-muted/10 border-b border-border/10 last:border-0"
          >
            {showRowNumbers && (
              <TableCell className="w-12 text-center text-[11px] tabular-nums text-muted-foreground/40 px-3 py-2 font-normal">
                {index + 1}
              </TableCell>
            )}
            {columns.map((column) => (
              <TableCell
                key={column}
                className="font-mono text-xs whitespace-nowrap px-4 py-2.5 max-w-[300px] truncate"
                title={row[column]?.toString() || 'NULL'}
              >
                {row[column] !== null && row[column] !== undefined ? (
                  formatCellValue(row[column])
                ) : (
                  <span className="text-muted-foreground/40 italic text-xs font-sans">null</span>
                )}
              </TableCell>
            ))}
          </TableRow>
        ))}
      </TableBody>
    </Table>
  );

  // If maxHeight is "none", don't use ScrollArea (parent handles scrolling)
  if (maxHeight === "none") {
    return (
      <div className="rounded-md border border-border/20 overflow-hidden bg-background">
        {tableContent}
      </div>
    );
  }

  // Otherwise use ScrollArea with maxHeight
  return (
    <div className="rounded-md border border-border/20 overflow-hidden bg-background">
      <ScrollArea className="w-full" style={{ maxHeight }}>
        {tableContent}
        <ScrollBar orientation="horizontal" />
        <ScrollBar orientation="vertical" />
      </ScrollArea>
    </div>
  );
};

// Helper function to format cell values with improved styling
function formatCellValue(value: any): React.ReactNode {
  if (value === null || value === undefined) {
    return <span className="text-muted-foreground/40 italic text-xs font-sans">null</span>;
  }

  if (typeof value === 'boolean') {
    return (
      <span className={`inline-flex items-center px-1.5 py-0.5 rounded text-[11px] font-medium ${value
        ? 'bg-emerald-500/10 text-emerald-600 dark:text-emerald-400'
        : 'bg-rose-500/10 text-rose-600 dark:text-rose-400'
        }`}>
        {value.toString()}
      </span>
    );
  }

  if (typeof value === 'number') {
    return (
      <span className="text-indigo-600 dark:text-indigo-400 tabular-nums">
        {value.toLocaleString()}
      </span>
    );
  }

  if (value instanceof Date) {
    return (
      <span className="text-violet-600 dark:text-violet-400">
        {value.toLocaleString()}
      </span>
    );
  }

  if (typeof value === 'object') {
    try {
      const jsonStr = JSON.stringify(value);
      return (
        <span className="text-amber-600 dark:text-amber-400 text-xs bg-amber-500/5 px-1.5 py-0.5 rounded">
          {jsonStr.slice(0, 80)}
          {jsonStr.length > 80 ? '…' : ''}
        </span>
      );
    } catch {
      return <span className="text-muted-foreground">[Object]</span>;
    }
  }

  const strValue = String(value);

  // Check if it looks like a date string
  if (/^\d{4}-\d{2}-\d{2}/.test(strValue)) {
    return <span className="text-violet-600 dark:text-violet-400">{strValue}</span>;
  }

  // Check if it looks like an ID or UUID
  if (/^[a-f0-9-]{36}$/i.test(strValue)) {
    return <span className="text-slate-500 dark:text-slate-400 text-xs">{strValue}</span>;
  }

  if (strValue.length > 80) {
    return (
      <span className="text-foreground/90">
        {strValue.slice(0, 80)}
        <span className="text-muted-foreground">…</span>
      </span>
    );
  }

  return <span className="text-foreground/90">{strValue}</span>;
}