import { RefreshCw, Download, Plus, TrendingUp } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { DataTable } from '@/components/common/DataTable';
import { Pagination } from '@/components/ui/pagination';
import { TableRow } from '@/types/database';

interface ContentViewerPanelProps {
    selectedTable: string | null;
    tableData: TableRow[];
    totalRows: number;
    currentPage: number;
    pageSize: number;
    onRefresh: () => void;
    onPageChange: (page: number) => void;
    onPageSizeChange: (size: number) => void;
    onExport?: () => void;
    onInsert?: () => void;
    onChart?: () => void;
    onEditRow?: (row: Record<string, any>) => void;
    onDeleteRow?: (row: Record<string, any>) => void;
}

export default function ContentViewerPanel({
    selectedTable,
    tableData,
    totalRows,
    currentPage,
    pageSize,
    onRefresh,
    onPageChange,
    onPageSizeChange,
    onExport,
    onInsert,
    onChart,
    onEditRow,
    onDeleteRow,
}: ContentViewerPanelProps) {
    if (!selectedTable) {
        return (
            <div className="flex-1 flex items-center justify-center bg-muted/10">
                <div className="text-center">
                    <div className="mb-3 text-muted-foreground/40">
                        <svg
                            className="mx-auto h-16 w-16"
                            fill="none"
                            viewBox="0 0 24 24"
                            stroke="currentColor"
                        >
                            <path
                                strokeLinecap="round"
                                strokeLinejoin="round"
                                strokeWidth={1.5}
                                d="M4 7h16M4 12h16M4 17h16"
                            />
                        </svg>
                    </div>
                    <p className="text-sm text-muted-foreground">
                        ← Select a table to view data
                    </p>
                </div>
            </div>
        );
    }

    const totalPages = Math.ceil(totalRows / pageSize);

    return (
        <div className="flex-1 flex flex-col bg-background">
            {/* Header */}
            <div className="px-6 py-4 border-b border-border/20">
                <div className="flex items-center justify-between mb-3">
                    <div>
                        <h2 className="text-lg font-semibold">{selectedTable}</h2>
                        <p className="text-xs text-muted-foreground">
                            {totalRows.toLocaleString()} rows total
                        </p>
                    </div>

                    {/* Quick Actions */}
                    <div className="flex items-center gap-2">
                        {onInsert && (
                            <Button size="sm" variant="outline" onClick={onInsert} className="text-xs">
                                <Plus className="h-3.5 w-3.5 mr-1.5" />
                                Insert
                            </Button>
                        )}
                        {onChart && (
                            <Button size="sm" variant="outline" onClick={onChart} className="text-xs">
                                <TrendingUp className="h-3.5 w-3.5 mr-1.5" />
                                Chart
                            </Button>
                        )}
                        {onExport && (
                            <Button size="sm" variant="outline" onClick={onExport} className="text-xs">
                                <Download className="h-3.5 w-3.5 mr-1.5" />
                                Export
                            </Button>
                        )}
                        <Button size="sm" variant="outline" onClick={onRefresh} className="text-xs">
                            <RefreshCw className="h-3.5 w-3.5 mr-1.5" />
                            Refresh
                        </Button>
                    </div>
                </div>
            </div>

            {/* Data Table */}
            <div className="flex-1 overflow-auto px-6 py-4">
                {tableData.length === 0 ? (
                    <div className="flex items-center justify-center h-full">
                        <p className="text-sm text-muted-foreground">No data available</p>
                    </div>
                ) : (
                    <DataTable
                        data={tableData}
                        onEditRow={onEditRow}
                        onDeleteRow={onDeleteRow}
                    />
                )}
            </div>

            {/* Pagination */}
            {totalRows > 0 && (
                <div className="px-6 py-3 border-t border-border/20 flex items-center justify-between">
                    <div className="flex items-center gap-4">
                        <span className="text-xs text-muted-foreground">
                            Showing {((currentPage - 1) * pageSize) + 1} to {Math.min(currentPage * pageSize, totalRows)} of {totalRows.toLocaleString()} rows
                        </span>

                        <select
                            value={pageSize}
                            onChange={(e) => onPageSizeChange(Number(e.target.value))}
                            className="text-xs border border-border/20 rounded px-2 py-1 bg-background"
                        >
                            <option value={10}>10 / page</option>
                            <option value={25}>25 / page</option>
                            <option value={50}>50 / page</option>
                            <option value={100}>100 / page</option>
                            <option value={250}>250 / page</option>
                        </select>
                    </div>

                    <div className="flex items-center gap-2">
                        <Button
                            size="sm"
                            variant="outline"
                            onClick={() => onPageChange(1)}
                            disabled={currentPage === 1}
                            className="text-xs h-8"
                        >
                            First
                        </Button>
                        <Button
                            size="sm"
                            variant="outline"
                            onClick={() => onPageChange(currentPage - 1)}
                            disabled={currentPage === 1}
                            className="text-xs h-8"
                        >
                            Previous
                        </Button>
                        <span className="text-xs text-muted-foreground px-3">
                            Page {currentPage} of {totalPages}
                        </span>
                        <Button
                            size="sm"
                            variant="outline"
                            onClick={() => onPageChange(currentPage + 1)}
                            disabled={currentPage === totalPages}
                            className="text-xs h-8"
                        >
                            Next
                        </Button>
                        <Button
                            size="sm"
                            variant="outline"
                            onClick={() => onPageChange(totalPages)}
                            disabled={currentPage === totalPages}
                            className="text-xs h-8"
                        >
                            Last
                        </Button>
                    </div>
                </div>
            )}
        </div>
    );
}
