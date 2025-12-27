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
  if (!data || data.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center h-48 rounded-lg border border-dashed border-border bg-muted/30 text-muted-foreground">
        <Info className="h-8 w-8 mb-2 opacity-50" />
        <p className="text-sm font-medium">No Data Available</p>
        <p className="text-xs text-muted-foreground">The query returned an empty result set.</p>
      </div>
    );
  }

  const columns = Object.keys(data[0]);

  return (
    <ScrollArea className="h-[400px] w-full rounded-lg border border-border">
      <Table>
        <TableHeader className="sticky top-0 bg-muted/80 backdrop-blur-sm">
          <TableRow>
            {columns.map((column) => (
              <TableHead
                key={column}
                className="font-medium text-xs uppercase tracking-wide text-muted-foreground whitespace-nowrap"
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
              className="hover:bg-muted/50"
            >
              {columns.map((column) => (
                <TableCell 
                  key={column} 
                  className="font-mono text-sm whitespace-nowrap"
                >
                  {row[column]?.toString() || (
                    <span className="text-muted-foreground text-xs">NULL</span>
                  )}
                </TableCell>
              ))}
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </ScrollArea>
  );
};