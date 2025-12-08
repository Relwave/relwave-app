import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Info } from "lucide-react";

interface DataTableProps {
  data: Array<Record<string, any>>;
}

export const DataTable = ({ data }: DataTableProps) => {
  // Determine the background/border classes for the table container
  const tableContainerClass = "rounded-xl border border-border bg-card shadow-elevated";

  // Determine the table header style
  const tableHeaderClass = "sticky top-0 bg-card/80 backdrop-blur-sm border-b border-border";

  // Determine the empty state style
  const emptyStateClass = "flex flex-col items-center justify-center h-48 rounded-lg border border-dashed border-border bg-muted/30 text-muted-foreground p-6";

  if (!data || data.length === 0) {
    return (
      <div className={emptyStateClass}>
        <Info className="h-8 w-8 mb-3 text-muted-foreground/80" />
        <p className="text-lg font-semibold text-foreground/80">No Data Available</p>
        <p className="text-sm text-muted-foreground">The query returned an empty result set.</p>
      </div>
    );
  }

  const columns = Object.keys(data[0]);

  return (
    // ScrollArea ensures horizontal scrolling for many columns and vertical for many rows
    <ScrollArea className={`h-[400px] w-full ${tableContainerClass}`}>
      {/* Container to force table to stretch to the content needed, enabling horizontal scroll */}
      <div className="relative w-full overflow-auto">
        <Table className="w-full">
          <TableHeader className={tableHeaderClass}>
            <TableRow className="hover:bg-transparent">
              {columns.map((column) => (
                <TableHead
                  key={column}
                  className="font-mono font-bold text-foreground uppercase text-xs tracking-wider min-w-[120px] p-3"
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
                // Stripe rows using accent/muted background and borders
                className={`border-border/50 transition-all duration-150 
                                    ${index % 2 === 0 ? 'bg-transparent' : 'bg-muted/30'} 
                                    hover:bg-accent hover:border-primary/50`}
              >
                {columns.map((column) => (
                  <TableCell key={column} className="font-mono text-sm text-foreground whitespace-nowrap p-3">
                    {row[column]?.toString() || (
                      <span className="text-muted-foreground italic">NULL</span>
                    )}
                  </TableCell>
                ))}
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>
    </ScrollArea>
  );
};