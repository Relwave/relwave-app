import { FC, useMemo } from 'react';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Loader2, Table2, ChevronLeft, ChevronRight } from 'lucide-react';
import { DataTable } from '@/components/common/DataTable';
import { SelectedTable, TableRow } from '@/types/database';
import { Button } from '@/components/ui/button';

interface DataTabProps {
    selectedTable: SelectedTable | null;
    isExecuting: boolean;
    tableData: TableRow[];
    rowCount: number;
    totalRows: number;
    currentPage: number;
    pageSize: number;
    onPageChange: (page: number) => void;
    onPageSizeChange: (size: number) => void;
}

const PAGE_SIZE_OPTIONS = [10, 25, 50, 100, 200];

const DataTab: FC<DataTabProps> = ({
    selectedTable,
    isExecuting,
    tableData,
    rowCount,
    totalRows,
    currentPage,
    pageSize,
    onPageChange,
    onPageSizeChange,
}) => {
    const tableName = selectedTable
        ? `${selectedTable.schema}.${selectedTable.name}`
        : "No table selected";

    // If totalRows is 0 but we have data, use rowCount as fallback
    const effectiveTotalRows = totalRows > 0 ? totalRows : rowCount;
    const totalPages = Math.ceil(effectiveTotalRows / pageSize) || 1;
    const startRow = effectiveTotalRows > 0 ? (currentPage - 1) * pageSize + 1 : 0;
    const endRow = Math.min(currentPage * pageSize, effectiveTotalRows);

    const canGoPrevious = currentPage > 1;
    // If we don't know total, allow next if current page is full
    const canGoNext = totalRows > 0
        ? currentPage < totalPages
        : rowCount === pageSize;

    const hasData = tableData.length > 0;

    // Generate page numbers to display
    const pageNumbers = useMemo(() => {
        const pages: (number | 'ellipsis')[] = [];
        const maxVisiblePages = 5;

        if (totalPages <= maxVisiblePages) {
            // Show all pages if total is small
            for (let i = 1; i <= totalPages; i++) {
                pages.push(i);
            }
        } else {
            // Always show first page
            pages.push(1);

            if (currentPage > 3) {
                pages.push('ellipsis');
            }

            // Show pages around current page
            const start = Math.max(2, currentPage - 1);
            const end = Math.min(totalPages - 1, currentPage + 1);

            for (let i = start; i <= end; i++) {
                pages.push(i);
            }

            if (currentPage < totalPages - 2) {
                pages.push('ellipsis');
            }

            // Always show last page
            if (totalPages > 1) {
                pages.push(totalPages);
            }
        }

        return pages;
    }, [currentPage, totalPages]);

    return (
        <div className="border border-border/20 rounded-lg overflow-hidden">
            {/* Minimal Header */}
            <div className="border-b border-border/20 px-6 py-4">
                <div className="flex items-center justify-between">
                    <div className="flex items-center gap-3">
                        <Table2 className="h-4 w-4 text-muted-foreground/60" />
                        <div>
                            <h3 className="font-mono text-sm font-medium tracking-tight text-foreground">
                                {tableName}
                            </h3>
                            <p className="text-xs text-muted-foreground/70 mt-0.5">
                                {isExecuting
                                    ? "Fetching data..."
                                    : totalRows > 0
                                        ? `${startRow.toLocaleString()}–${endRow.toLocaleString()} of ${totalRows.toLocaleString()} rows`
                                        : rowCount > 0
                                            ? `${rowCount.toLocaleString()} rows · Page ${currentPage}`
                                            : "No data available"}
                            </p>
                        </div>
                    </div>
                    {isExecuting && (
                        <Loader2 className="h-4 w-4 animate-spin text-muted-foreground/60" />
                    )}
                </div>
            </div>

            {/* Content Area */}
            {isExecuting && rowCount === 0 ? (
                <div className="flex flex-col items-center justify-center py-16 text-muted-foreground">
                    <Loader2 className="h-7 w-7 animate-spin mb-3 text-muted-foreground/50" />
                    <p className="text-sm font-medium">Loading data</p>
                    <p className="text-xs text-muted-foreground/60 mt-1">
                        Fetching from {selectedTable?.name || 'table'}...
                    </p>
                </div>
            ) : (
                <div className="flex flex-col">
                    <div className="p-6 max-h-[60vh] overflow-auto">
                        <DataTable data={tableData} maxHeight="none" />
                    </div>

                    {/* Minimal Pagination */}
                    {hasData && (
                        <div className="flex items-center justify-between px-6 py-3 border-t border-border/20">
                            <div className="flex items-center gap-2">
                                <span className="text-xs text-muted-foreground/70">Show</span>
                                <Select
                                    value={pageSize.toString()}
                                    onValueChange={(value) => onPageSizeChange(Number(value))}
                                    disabled={isExecuting}
                                >
                                    <SelectTrigger className="w-[70px] h-8 text-xs">
                                        <SelectValue />
                                    </SelectTrigger>
                                    <SelectContent align="start">
                                        {PAGE_SIZE_OPTIONS.map((size) => (
                                            <SelectItem key={size} value={size.toString()} className="text-xs">
                                                {size}
                                            </SelectItem>
                                        ))}
                                    </SelectContent>
                                </Select>
                                <span className="text-xs text-muted-foreground/70">per page</span>
                            </div>

                            <div className="flex items-center gap-0.5">
                                <Button
                                    variant="ghost"
                                    size="sm"
                                    className="h-8 w-8 p-0 hover:bg-muted/50"
                                    onClick={() => canGoPrevious && !isExecuting && onPageChange(currentPage - 1)}
                                    disabled={!canGoPrevious || isExecuting}
                                >
                                    <ChevronLeft className="h-3.5 w-3.5" />
                                </Button>

                                {totalRows > 0 && pageNumbers.map((page, index) => (
                                    page === 'ellipsis' ? (
                                        <span key={index} className="px-2 text-xs text-muted-foreground/40">•••</span>
                                    ) : (
                                        <Button
                                            key={index}
                                            variant="ghost"
                                            size="sm"
                                            className={`h-8 min-w-[32px] px-2 text-xs transition-colors ${currentPage === page
                                                ? 'bg-muted text-foreground font-medium'
                                                : 'text-muted-foreground/70 hover:text-foreground hover:bg-muted/50'
                                                }`}
                                            onClick={() => !isExecuting && onPageChange(page)}
                                            disabled={isExecuting}
                                        >
                                            {page}
                                        </Button>
                                    )
                                ))}

                                {totalRows === 0 && (
                                    <Button
                                        variant="ghost"
                                        size="sm"
                                        className="h-8 min-w-[32px] px-2 text-xs bg-muted text-foreground font-medium"
                                        disabled
                                    >
                                        {currentPage}
                                    </Button>
                                )}

                                <Button
                                    variant="ghost"
                                    size="sm"
                                    className="h-8 w-8 p-0 hover:bg-muted/50"
                                    onClick={() => canGoNext && !isExecuting && onPageChange(currentPage + 1)}
                                    disabled={!canGoNext || isExecuting}
                                >
                                    <ChevronRight className="h-3.5 w-3.5" />
                                </Button>
                            </div>
                        </div>
                    )}
                </div>
            )}
        </div>
    );
};

export default DataTab;