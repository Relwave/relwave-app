import { FC, useMemo } from 'react';
import { Card, CardHeader, CardContent, CardTitle, CardDescription } from '@/components/ui/card';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import {
    Pagination,
    PaginationContent,
    PaginationEllipsis,
    PaginationItem,
    PaginationLink,
    PaginationNext,
    PaginationPrevious,
} from '@/components/ui/pagination';
import { RefreshCw } from 'lucide-react';
import { DataTable } from '@/components/common/DataTable';
import { SelectedTable, TableRow } from '@/types/database';

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
        <Card className="border rounded-lg">
            <CardHeader className="border-b pb-4">
                <div className="flex items-center justify-between">
                    <div>
                        <CardTitle className="font-mono text-lg">{tableName} Data</CardTitle>
                        <CardDescription>
                            {isExecuting
                                ? "Loading data..."
                                : totalRows > 0
                                    ? `Showing ${startRow.toLocaleString()} - ${endRow.toLocaleString()} of ${totalRows.toLocaleString()} rows`
                                    : `Showing ${rowCount.toLocaleString()} rows (page ${currentPage})`}
                        </CardDescription>
                    </div>
                </div>
            </CardHeader>
            <CardContent className="pt-4">
                {isExecuting && rowCount === 0 ? (
                    <div className="text-center py-16 text-muted-foreground">
                        <RefreshCw className="h-6 w-6 animate-spin mx-auto mb-3" />
                        <p className="text-sm">
                            Fetching data from {selectedTable?.name || 'table'}...
                        </p>
                    </div>
                ) : (
                    <>
                        <DataTable data={tableData} />

                        {/* Pagination Controls - Show when there's data */}
                        {hasData && (
                            <div className="flex flex-col sm:flex-row items-center justify-between gap-4 mt-4 pt-4 border-t">
                                <div className="flex items-center gap-2">
                                    <span className="text-sm text-muted-foreground">Rows per page:</span>
                                    <Select
                                        value={pageSize.toString()}
                                        onValueChange={(value) => onPageSizeChange(Number(value))}
                                        disabled={isExecuting}
                                    >
                                        <SelectTrigger className="w-[70px] h-8">
                                            <SelectValue />
                                        </SelectTrigger>
                                        <SelectContent>
                                            {PAGE_SIZE_OPTIONS.map((size) => (
                                                <SelectItem key={size} value={size.toString()}>
                                                    {size}
                                                </SelectItem>
                                            ))}
                                        </SelectContent>
                                    </Select>
                                </div>

                                <Pagination>
                                    <PaginationContent>
                                        <PaginationItem>
                                            <PaginationPrevious
                                                onClick={() => canGoPrevious && !isExecuting && onPageChange(currentPage - 1)}
                                                className={(!canGoPrevious || isExecuting) ? 'pointer-events-none opacity-50' : ''}
                                            />
                                        </PaginationItem>

                                        {totalRows > 0 && pageNumbers.map((page, index) => (
                                            <PaginationItem key={index}>
                                                {page === 'ellipsis' ? (
                                                    <PaginationEllipsis />
                                                ) : (
                                                    <PaginationLink
                                                        onClick={() => !isExecuting && onPageChange(page)}
                                                        isActive={currentPage === page}
                                                        className={isExecuting ? 'pointer-events-none opacity-50' : ''}
                                                    >
                                                        {page}
                                                    </PaginationLink>
                                                )}
                                            </PaginationItem>
                                        ))}

                                        {totalRows === 0 && (
                                            <PaginationItem>
                                                <PaginationLink isActive>
                                                    {currentPage}
                                                </PaginationLink>
                                            </PaginationItem>
                                        )}

                                        <PaginationItem>
                                            <PaginationNext
                                                onClick={() => canGoNext && !isExecuting && onPageChange(currentPage + 1)}
                                                className={(!canGoNext || isExecuting) ? 'pointer-events-none opacity-50' : ''}
                                            />
                                        </PaginationItem>
                                    </PaginationContent>
                                </Pagination>
                            </div>
                        )}
                    </>
                )}
            </CardContent>
        </Card>
    );
};

export default DataTab;