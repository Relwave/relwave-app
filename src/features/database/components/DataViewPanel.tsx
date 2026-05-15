// features/database/components/DataViewPanel.tsx

import { RefreshCw, Download, FileText, ChevronDown, PanelLeftClose, PanelLeft } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Spinner } from "@/components/ui/spinner";
import { cn } from "@/lib/utils";
import {
    DropdownMenu,
    DropdownMenuContent,
    DropdownMenuItem,
    DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import TablesExplorerPanel from "./TablesExplorerPanel";
import ContentViewerPanel from "./ContentViewerPanel";
import { SelectedTable } from "../types";

interface DataViewPanelProps {
    // Database info
    dbId: string;
    databaseName: string | undefined;
    tables: any[];
    selectedTable: SelectedTable | null;
    schemas: string[];
    selectedSchema: string;
    setSelectedSchema: (schema: string) => void;

    // Data
    tableData: any[];
    totalRows: number;
    currentPage: number;
    pageSize: number;
    isLoadingData: boolean;
    loadingTables: boolean;

    // Sidebar
    sidebarOpen: boolean;
    onToggleSidebar: () => void;

    // Actions
    onRefresh: () => void;
    onMigrationsOpen: () => void;
    onExport: (format: "csv" | "json") => void;
    isExporting: boolean;
    onChart: () => void;
    onInsert: () => void;
    onTableSelect: (tableName: string, schemaName: string) => Promise<void>;
    onPageChange: (page: number) => void;
    onPageSizeChange: (size: number) => void;

    // Search
    searchTerm: string;
    searchResults: Record<string, any>[] | null;
    searchResultCount: number | undefined;
    isSearching: boolean;
    searchPage: number;
    isSearchActive: boolean;
    onSearchChange: (term: string) => void;
    onSearch: () => void;
    onSearchPageChange: (page: number) => void;
    onSearchRefresh: () => void;

    // Row operations
    onEditRow: (row: Record<string, any>) => void;
    onDeleteRow: (row: Record<string, any>) => void;
}

export const DataViewPanel = ({
    dbId,
    databaseName,
    tables,
    selectedTable,
    schemas,
    selectedSchema,
    setSelectedSchema,
    tableData,
    totalRows,
    currentPage,
    pageSize,
    isLoadingData,
    loadingTables,
    sidebarOpen,
    onToggleSidebar,
    onRefresh,
    onMigrationsOpen,
    onExport,
    isExporting,
    onChart,
    onInsert,
    onTableSelect,
    onPageChange,
    onPageSizeChange,
    searchTerm,
    searchResults,
    searchResultCount,
    isSearching,
    searchPage,
    isSearchActive,
    onSearchChange,
    onSearch,
    onSearchPageChange,
    onSearchRefresh,
    onEditRow,
    onDeleteRow,
}: DataViewPanelProps) => {
    return (
        <>
            {/* Header */}
            <header className="shrink-0 border-b border-border/30 bg-background/80 backdrop-blur-xl">
                <div className="px-6 py-3 flex items-center justify-between gap-4 min-w-0">
                    <div className="flex items-center gap-3 min-w-0">
                        <Button
                            variant="ghost"
                            size="icon"
                            className="h-8 w-8"
                            onClick={onToggleSidebar}
                            title={sidebarOpen ? "Hide sidebar" : "Show sidebar"}
                        >
                            {sidebarOpen ? (
                                <PanelLeftClose className="h-4 w-4" />
                            ) : (
                                <PanelLeft className="h-4 w-4" />
                            )}
                        </Button>
                        <div className="min-w-0">
                            <div className="flex items-center gap-2">
                                <h1 className="text-lg font-semibold tracking-tight truncate">{databaseName || "Database"}</h1>
                                {schemas.length > 0 && (
                                    <DropdownMenu>
                                        <DropdownMenuTrigger asChild>
                                            <Button variant="outline" size="sm" className="h-6 text-xs px-2 ml-2 border-dashed bg-background/60">
                                                {selectedSchema}
                                                <ChevronDown className="h-3 w-3 ml-1" />
                                            </Button>
                                        </DropdownMenuTrigger>
                                        <DropdownMenuContent align="start">
                                            {schemas.map((s) => (
                                                <DropdownMenuItem key={s} onClick={() => setSelectedSchema(s)}>
                                                    {s}
                                                </DropdownMenuItem>
                                            ))}
                                        </DropdownMenuContent>
                                    </DropdownMenu>
                                )}
                            </div>
                            <p className="text-xs text-muted-foreground">
                                {tables.length} tables in {selectedSchema}
                            </p>
                        </div>
                    </div>

                    <div className="flex items-center gap-2 shrink-0">
                        <Button size="sm" variant="outline" onClick={onMigrationsOpen} className="text-xs">
                            <FileText className="h-3.5 w-3.5 mr-1.5" />
                            Migrations
                        </Button>
                        <DropdownMenu>
                            <DropdownMenuTrigger asChild>
                                <Button size="sm" variant="outline" disabled={isExporting} className="text-xs">
                                    {isExporting ? (
                                        <>
                                            <Spinner className="h-3.5 w-3.5 mr-1.5" />
                                            Exporting...
                                        </>
                                    ) : (
                                        <>
                                            <Download className="h-3.5 w-3.5 mr-1.5" />
                                            Export
                                            <ChevronDown className="h-3 w-3 ml-1" />
                                        </>
                                    )}
                                </Button>
                            </DropdownMenuTrigger>
                            <DropdownMenuContent align="end">
                                <DropdownMenuItem onClick={() => onExport("csv")}>
                                    Export as CSV
                                </DropdownMenuItem>
                                <DropdownMenuItem onClick={() => onExport("json")}>
                                    Export as JSON
                                </DropdownMenuItem>
                            </DropdownMenuContent>
                        </DropdownMenu>
                        <Button
                            variant="ghost"
                            size="icon"
                            onClick={onRefresh}
                            disabled={loadingTables}
                            className="h-8 w-8"
                        >
                            {loadingTables ? <Spinner className="h-4 w-4" /> : <RefreshCw className="h-4 w-4" />}
                        </Button>
                    </div>
                </div>
            </header>

            {/* Content */}
            <div className="flex-1 min-h-0 min-w-0 flex overflow-hidden p-3 gap-3">
                <div
                    className={cn(
                        "shrink-0 min-h-0 rounded-lg border border-border/50 bg-card/45 transition-all duration-200 overflow-hidden shadow-sm",
                        sidebarOpen ? "w-64" : "w-0"
                    )}
                >
                    <TablesExplorerPanel
                        dbId={dbId}
                        tables={tables}
                        selectedTable={selectedTable}
                        selectedSchema={selectedSchema}
                        onSelectTable={onTableSelect}
                        loading={loadingTables}
                    />
                </div>

                <div className="flex-1 min-w-0 min-h-0 overflow-hidden rounded-lg border border-border/50 bg-card/50 shadow-sm">
                    <ContentViewerPanel
                        selectedTable={selectedTable?.name || null}
                        tableData={isSearchActive ? searchResults! : tableData}
                        totalRows={isSearchActive ? (searchResultCount || 0) : totalRows}
                        currentPage={isSearchActive ? searchPage : currentPage}
                        pageSize={pageSize}
                        isLoading={isLoadingData}
                        onRefresh={isSearchActive ? onSearchRefresh : onRefresh}
                        onPageChange={isSearchActive ? onSearchPageChange : onPageChange}
                        onPageSizeChange={onPageSizeChange}
                        onChart={onChart}
                        onInsert={onInsert}
                        searchTerm={searchTerm}
                        onSearchChange={onSearchChange}
                        onSearch={onSearch}
                        isSearching={isSearching}
                        searchResultCount={searchResultCount}
                        onEditRow={onEditRow}
                        onDeleteRow={onDeleteRow}
                    />
                </div>
            </div>
        </>
    );
};
