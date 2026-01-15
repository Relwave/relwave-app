import { RefreshCw, Plus, TrendingUp, Search, X, Loader2, Table } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { DataTable } from '@/components/common/DataTable';
import { TableRow } from '@/types/database';

interface ContentViewerPanelProps {
    selectedTable: string | null;
    tableData: TableRow[];
    totalRows: number;
    currentPage: number;
    pageSize: number;
    isLoading?: boolean;
    onRefresh: () => void;
    onPageChange: (page: number) => void;
    onPageSizeChange: (size: number) => void;
    onInsert?: () => void;
    onChart?: () => void;
    onEditRow?: (row: Record<string, any>) => void;
    onDeleteRow?: (row: Record<string, any>) => void;
    searchTerm?: string;
    onSearchChange?: (term: string) => void;
    onSearch?: () => void;
    isSearching?: boolean;
    searchResultCount?: number;
}

export default function ContentViewerPanel({
    selectedTable,
    tableData,
    totalRows,
    currentPage,
    pageSize,
    isLoading,
    onRefresh,
    onPageChange,
    onPageSizeChange,
    onInsert,
    onChart,
    onEditRow,
    onDeleteRow,
    searchTerm,
    onSearchChange,
    onSearch,
    isSearching,
    searchResultCount,
}: ContentViewerPanelProps) {
    const totalPages = Math.ceil(totalRows / pageSize);

    if (!selectedTable) {
        return (
            <div className="h-full flex items-center justify-center bg-muted/5">
                <div className="text-center">
                    <Table className="mx-auto h-12 w-12 text-muted-foreground/30 mb-3" />
                    <p className="text-sm text-muted-foreground">
                        Select a table to view data
                    </p>
                </div>
            </div>
        );
    }

    return (
        <div className="h-full flex flex-col">
            {/* Header */}
            <div className="shrink-0 px-4 py-3 border-b border-border/20 bg-background">
                <div className="flex items-center justify-between">
                    <div>
                        <h2 className="text-base font-medium">{selectedTable}</h2>
                        <p className="text-xs text-muted-foreground">
                            {totalRows.toLocaleString()} rows
                        </p>
                    </div>
                    <div className="flex items-center gap-2">
                        {onInsert && (
                            <Button size="sm" variant="outline" onClick={onInsert} className="h-8 text-xs">
                                <Plus className="h-3.5 w-3.5 mr-1" />
                                Insert
                            </Button>
                        )}
                        {onChart && (
                            <Button size="sm" variant="outline" onClick={onChart} className="h-8 text-xs">
                                <TrendingUp className="h-3.5 w-3.5 mr-1" />
                                Chart
                            </Button>
                        )}
                        <Button size="sm" variant="ghost" onClick={onRefresh} className="h-8 w-8 p-0">
                            <RefreshCw className="h-3.5 w-3.5" />
                        </Button>
                    </div>
                </div>

                {/* Search Bar */}
                {onSearchChange && (
                    <div className="flex items-center gap-2 mt-3">
                        <div className="relative flex-1 max-w-sm">
                            <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
                            <Input
                                type="text"
                                placeholder="Search..."
                                value={searchTerm || ""}
                                onChange={(e) => onSearchChange(e.target.value)}
                                onKeyDown={(e) => e.key === "Enter" && onSearch?.()}
                                className="pl-8 pr-8 h-8 text-xs"
                            />
                            {searchTerm && (
                                <button
                                    onClick={() => onSearchChange("")}
                                    className="absolute right-2 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                                >
                                    <X className="h-3.5 w-3.5" />
                                </button>
                            )}
                        </div>
                        <Button
                            size="sm"
                            variant="outline"
                            onClick={onSearch}
                            disabled={!searchTerm || isSearching}
                            className="h-8 text-xs"
                        >
                            {isSearching ? "..." : "Search"}
                        </Button>
                        {typeof searchResultCount === 'number' && searchTerm && (
                            <span className="text-xs text-muted-foreground">
                                {searchResultCount} found
                            </span>
                        )}
                    </div>
                )}
            </div>

            {/* Data Table with Scroll */}
            <div className="flex-1 overflow-auto">
                {isLoading ? (
                    <div className="flex flex-col items-center justify-center h-full gap-2">
                        <Loader2 className="h-6 w-6 animate-spin text-primary" />
                    </div>
                ) : tableData.length === 0 ? (
                    <div className="flex items-center justify-center h-full">
                        <p className="text-sm text-muted-foreground">No data</p>
                    </div>
                ) : (
                    <div className="p-4">
                        <DataTable
                            data={tableData}
                            maxHeight="none"
                            onEditRow={onEditRow}
                            onDeleteRow={onDeleteRow}
                        />
                    </div>
                )}
            </div>

            {/* Pagination */}
            {totalRows > 0 && (
                <div className="shrink-0 px-4 py-2 border-t border-border/20 bg-background flex items-center justify-between">
                    <div className="flex items-center gap-3">
                        <span className="text-xs text-muted-foreground">
                            {((currentPage - 1) * pageSize) + 1}-{Math.min(currentPage * pageSize, totalRows)} of {totalRows.toLocaleString()}
                        </span>
                        <select
                            value={pageSize}
                            onChange={(e) => onPageSizeChange(Number(e.target.value))}
                            className="text-xs border border-border/30 rounded px-2 py-1 bg-background h-7"
                        >
                            <option value={10}>10</option>
                            <option value={25}>25</option>
                            <option value={50}>50</option>
                            <option value={100}>100</option>
                        </select>
                    </div>
                    <div className="flex items-center gap-1">
                        <Button
                            size="sm"
                            variant="ghost"
                            onClick={() => onPageChange(1)}
                            disabled={currentPage === 1}
                            className="h-7 px-2 text-xs"
                        >
                            First
                        </Button>
                        <Button
                            size="sm"
                            variant="ghost"
                            onClick={() => onPageChange(currentPage - 1)}
                            disabled={currentPage === 1}
                            className="h-7 px-2 text-xs"
                        >
                            Prev
                        </Button>
                        <span className="text-xs text-muted-foreground px-2">
                            {currentPage}/{totalPages}
                        </span>
                        <Button
                            size="sm"
                            variant="ghost"
                            onClick={() => onPageChange(currentPage + 1)}
                            disabled={currentPage === totalPages}
                            className="h-7 px-2 text-xs"
                        >
                            Next
                        </Button>
                        <Button
                            size="sm"
                            variant="ghost"
                            onClick={() => onPageChange(totalPages)}
                            disabled={currentPage === totalPages}
                            className="h-7 px-2 text-xs"
                        >
                            Last
                        </Button>
                    </div>
                </div>
            )}
        </div>
    );
}
