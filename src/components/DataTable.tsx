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
      <div className="flex flex-col items-center justify-center h-48 rounded-lg border border-dashed border-gray-700 bg-gray-900/50 text-gray-500 p-6">
        <Info className="h-8 w-8 mb-3 text-gray-600" />
        <p className="text-lg font-semibold text-gray-400">No Data Available</p>
        <p className="text-sm text-gray-500">The query returned an empty result set.</p>
      </div>
    );
  }

  const columns = Object.keys(data[0]);

  return (
    // ScrollArea ensures horizontal scrolling for many columns and vertical for many rows
    <ScrollArea className="h-[400px] w-full rounded-xl border border-primary/20 bg-gray-900/70 shadow-lg">
      {/* Container to force table to stretch to the content needed, enabling horizontal scroll */}
      <div className="relative w-full overflow-auto">
        <Table className="w-full">
          <TableHeader className="sticky top-0 bg-gray-900 backdrop-blur-sm border-b border-primary/10">
            <TableRow className="hover:bg-transparent">
              {columns.map((column) => (
                <TableHead key={column} className="font-mono font-bold text-white uppercase text-xs tracking-wider min-w-[120px]">
                  {column}
                </TableHead>
              ))}
            </TableRow>
          </TableHeader>
          <TableBody>
            {data.map((row, index) => (
              <TableRow
                key={index}
                className={`border-gray-800 transition-all duration-150 
                  ${index % 2 === 0 ? 'bg-transparent' : 'bg-gray-800/50'} 
                  hover:bg-cyan-900/40 hover:border-cyan-500/50`}
              >
                {columns.map((column) => (
                  <TableCell key={column} className="font-mono text-sm text-gray-300 whitespace-nowrap">
                    {row[column]?.toString() || (
                      <span className="text-gray-600 italic">NULL</span>
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