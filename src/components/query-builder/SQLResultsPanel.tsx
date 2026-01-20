import { Code } from "lucide-react";
import { ScrollArea } from "@/components/ui/scroll-area";
import { DataTable } from "@/components/common/DataTable";
import { TableRow } from "@/types/database";

interface SQLResultsPanelProps {
    generatedSQL: string;
    tableData: TableRow[];
    rowCount: number;
}

export function SQLResultsPanel({
    generatedSQL,
    tableData,
    rowCount,
}: SQLResultsPanelProps) {
    return (
        <div className="h-[45%] border-t border-border/40 flex flex-col">
            {/* Tabs */}
            <div className="h-9 border-b border-border/40 flex items-center px-2 shrink-0 bg-muted/20">
                <div className="flex items-center gap-1">
                    <div className="flex items-center gap-1.5 px-3 py-1 text-xs font-medium border-b-2 border-primary text-foreground">
                        <Code className="h-3 w-3" />
                        SQL
                    </div>
                    {tableData.length > 0 && (
                        <div className="flex items-center gap-1.5 px-3 py-1 text-xs text-muted-foreground">
                            <span className="text-[10px] bg-primary/10 text-primary px-1.5 py-0.5 rounded">
                                {rowCount} rows
                            </span>
                        </div>
                    )}
                </div>
            </div>

            {/* Content */}
            <div className="flex-1 flex overflow-hidden">
                {/* SQL Preview */}
                <div className="w-1/3 border-r border-border/40 flex flex-col">
                    <ScrollArea className="flex-1">
                        {generatedSQL ? (
                            <pre className="p-3 text-xs font-mono text-muted-foreground whitespace-pre-wrap">
                                {generatedSQL}
                            </pre>
                        ) : (
                            <div className="flex items-center justify-center h-full text-xs text-muted-foreground/50">
                                Generate SQL to preview
                            </div>
                        )}
                    </ScrollArea>
                </div>

                {/* Results */}
                <div className="flex-1 overflow-auto">
                    {tableData.length > 0 ? (
                        <DataTable data={tableData} />
                    ) : (
                        <div className="flex items-center justify-center h-full text-xs text-muted-foreground/50">
                            Execute query to see results
                        </div>
                    )}
                </div>
            </div>
        </div>
    );
}
