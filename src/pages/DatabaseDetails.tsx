import { useState } from "react";
import { useParams } from "react-router-dom";
import { RefreshCw, Download, FileText, ChevronDown, PanelLeftClose, PanelLeft } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { useBridgeQuery } from "@/hooks/useBridgeQuery";
import { useDatabaseDetails } from "@/hooks/useDatabaseDetails";
import { useMigrations } from "@/hooks/useDbQueries";
import { useExport } from "@/hooks/useExport";
import BridgeLoader from "@/components/feedback/BridgeLoader";
import { Spinner } from "@/components/ui/spinner";
import VerticalIconBar, { PanelType } from "@/components/common/VerticalIconBar";
import SlideOutPanel from "@/components/common/SlideOutPanel";
import TablesExplorerPanel from "@/components/database/TablesExplorerPanel";
import ContentViewerPanel from "@/components/database/ContentViewerPanel";
import { MigrationsPanel } from "@/components/database";
import InsertDataDialog from "@/components/database/InsertDataDialog";
import EditRowDialog from "@/components/database/EditRowDialog";
import ConfirmDialog from "@/components/common/ConfirmDialog";
import { ChartVisualization } from "@/components/chart/ChartVisualization";
import { bridgeApi } from "@/services/bridgeApi";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import SQLWorkspacePanel from "@/components/workspace/SQLWorkspacePanel";
import QueryBuilderPanel from "@/components/query-builder/QueryBuilderPanel";
import SchemaExplorerPanel from "@/components/schema-explorer/SchemaExplorerPanel";
import ERDiagramPanel from "@/components/er-diagram/ERDiagramPanel";

const DatabaseDetail = () => {
  const { id: dbId } = useParams<{ id: string }>();
  const { data: bridgeReady, isLoading: bridgeLoading } = useBridgeQuery();
  const [activePanel, setActivePanel] = useState<PanelType>('data');
  const [migrationsOpen, setMigrationsOpen] = useState(false);
  const [chartOpen, setChartOpen] = useState(false);
  const [insertDialogOpen, setInsertDialogOpen] = useState(false);
  const [editDialogOpen, setEditDialogOpen] = useState(false);
  const [editingRow, setEditingRow] = useState<Record<string, any> | null>(null);
  const [primaryKeyColumn, setPrimaryKeyColumn] = useState<string>("");
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [deletingRow, setDeletingRow] = useState<Record<string, any> | null>(null);
  const [deleteRowPK, setDeleteRowPK] = useState<string>("");
  const [deleteHasPK, setDeleteHasPK] = useState(false);
  const [searchTerm, setSearchTerm] = useState("");
  const [searchResults, setSearchResults] = useState<Record<string, any>[] | null>(null);
  const [searchResultCount, setSearchResultCount] = useState<number | undefined>(undefined);
  const [isSearching, setIsSearching] = useState(false);
  const [searchPage, setSearchPage] = useState(1);
  const [sidebarOpen, setSidebarOpen] = useState(true);

  const {
    databaseName,
    tables,
    selectedTable,
    tableData,
    totalRows,
    currentPage,
    pageSize,
    loading,
    loadingTables,
    isLoadingData,
    error,
    handleTableSelect,
    fetchTables,
    handlePageChange,
    handlePageSizeChange,
    refetchTableData,
    schemas,
    selectedSchema,
    setSelectedSchema,
  } = useDatabaseDetails({
    dbId,
    bridgeReady: bridgeReady ?? false,
  });

  const { exportAllTables, isExporting } = useExport({
    dbId: dbId || "",
    databaseName: databaseName || "database",
  });

  const { data: migrationsResponse } = useMigrations(dbId);
  const migrationsData = migrationsResponse?.migrations || {
    local: [],
    applied: [],
  };
  const baselined = migrationsResponse?.baselined || false;

  if (bridgeLoading || bridgeReady === undefined) {
    return <BridgeLoader />;
  }

  if (error) {
    return (
      <div className="h-[calc(100vh-32px)] flex items-center justify-center bg-background text-foreground">
        <Card className="max-w-md w-full mx-4 border-border/20">
          <CardHeader className="border-b border-border/20">
            <CardTitle className="text-base">Connection Error</CardTitle>
          </CardHeader>
          <CardContent className="pt-4">
            <p className="text-sm text-muted-foreground/70 mb-3">
              Failed to connect to the database:
            </p>
            <pre className="bg-muted/30 text-destructive p-3 rounded-md text-xs font-mono overflow-auto border border-border/20">
              {error}
            </pre>
            <div className="mt-4 flex gap-2">
              <Button size="sm" onClick={fetchTables} disabled={loadingTables} className="text-xs">
                {loadingTables ? (
                  <>
                    <Spinner className="h-3.5 w-3.5 mr-1.5" />
                    Retrying...
                  </>
                ) : (
                  <>
                    <RefreshCw className="h-3.5 w-3.5 mr-1.5" />
                    Retry
                  </>
                )}
              </Button>
            </div>
          </CardContent>
        </Card>
      </div>
    );
  }

  // Render the active panel content
  const renderPanelContent = () => {
    switch (activePanel) {
      case 'sql-workspace':
        return <SQLWorkspacePanel dbId={dbId || ''} />;
      case 'query-builder':
        return <QueryBuilderPanel dbId={dbId || ''} />;
      case 'schema-explorer':
        return <SchemaExplorerPanel dbId={dbId || ''} />;
      case 'er-diagram':
        return <ERDiagramPanel />;
      case 'data':
      default:
        return (
          <>
            {/* Header for Data View */}
            <header className="shrink-0 border-b border-border/20 bg-background/95 backdrop-blur-sm">
              <div className="px-6 py-3 flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <Button
                    variant="ghost"
                    size="icon"
                    className="h-8 w-8"
                    onClick={() => setSidebarOpen(!sidebarOpen)}
                    title={sidebarOpen ? "Hide sidebar" : "Show sidebar"}
                  >
                    {sidebarOpen ? (
                      <PanelLeftClose className="h-4 w-4" />
                    ) : (
                      <PanelLeft className="h-4 w-4" />
                    )}
                  </Button>
                  <div>
                    <div className="flex items-center gap-2">
                      <h1 className="text-lg font-semibold">{databaseName || 'Database'}</h1>
                      {schemas.length > 0 && (
                        <DropdownMenu>
                          <DropdownMenuTrigger asChild>
                            <Button variant="outline" size="sm" className="h-6 text-xs px-2 ml-2 border-dashed">
                              {selectedSchema}
                              <ChevronDown className="h-3 w-3 ml-1" />
                            </Button>
                          </DropdownMenuTrigger>
                          <DropdownMenuContent align="start">
                            {schemas.map(s => (
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

                <div className="flex items-center gap-2">
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => setMigrationsOpen(true)}
                    className="text-xs"
                  >
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
                      <DropdownMenuItem onClick={() => exportAllTables("csv")}>
                        Export as CSV
                      </DropdownMenuItem>
                      <DropdownMenuItem onClick={() => exportAllTables("json")}>
                        Export as JSON
                      </DropdownMenuItem>
                    </DropdownMenuContent>
                  </DropdownMenu>
                  <Button
                    variant="ghost"
                    size="icon"
                    onClick={fetchTables}
                    disabled={loadingTables}
                    className="h-8 w-8"
                  >
                    {loadingTables ? (
                      <Spinner className="h-4 w-4" />
                    ) : (
                      <RefreshCw className="h-4 w-4" />
                    )}
                  </Button>
                </div>
              </div>
            </header>

            {/* Content Area for Data View */}
            <div className="flex-1 flex overflow-hidden">
              {/* Sidebar */}
              <div
                className={cn(
                  "shrink-0 border-r border-border/20 transition-all duration-200 overflow-hidden",
                  sidebarOpen ? "w-64" : "w-0"
                )}
              >
                <TablesExplorerPanel
                  dbId={dbId || ''}
                  tables={tables}
                  selectedTable={selectedTable}
                  selectedSchema={selectedSchema}
                  onSelectTable={handleTableSelect}
                  loading={loadingTables}
                />
              </div>

              {/* Main Content */}
              <div className="flex-1 overflow-hidden">
                <ContentViewerPanel
                  selectedTable={selectedTable?.name || null}
                  tableData={searchResults !== null ? searchResults : tableData}
                  totalRows={searchResults !== null ? (searchResultCount || 0) : totalRows}
                  currentPage={searchResults !== null ? searchPage : currentPage}
                  pageSize={pageSize}
                  isLoading={isLoadingData}
                  onRefresh={() => {
                    if (searchResults !== null && searchTerm) {
                      setSearchPage(1);
                      bridgeApi.searchTable({
                        dbId: dbId || "",
                        schemaName: selectedTable?.schema || "public",
                        tableName: selectedTable?.name || "",
                        searchTerm,
                        page: 1,
                        pageSize,
                      }).then(result => {
                        setSearchResults(result.rows);
                        setSearchResultCount(result.total);
                      }).catch(() => { });
                    } else {
                      fetchTables();
                    }
                  }}
                  onPageChange={async (page) => {
                    if (searchResults !== null && searchTerm && selectedTable && dbId) {
                      setSearchPage(page);
                      setIsSearching(true);
                      try {
                        const result = await bridgeApi.searchTable({
                          dbId,
                          schemaName: selectedTable.schema || "public",
                          tableName: selectedTable.name,
                          searchTerm,
                          page,
                          pageSize,
                        });
                        setSearchResults(result.rows);
                        setSearchResultCount(result.total);
                      } finally {
                        setIsSearching(false);
                      }
                    } else {
                      handlePageChange(page);
                    }
                  }}
                  onPageSizeChange={handlePageSizeChange}
                  onChart={() => setChartOpen(true)}
                  onInsert={() => setInsertDialogOpen(true)}
                  searchTerm={searchTerm}
                  onSearchChange={(term) => {
                    setSearchTerm(term);
                    if (!term) {
                      setSearchResults(null);
                      setSearchResultCount(undefined);
                    }
                  }}
                  onSearch={async () => {
                    if (!searchTerm || !selectedTable || !dbId) return;
                    setIsSearching(true);
                    setSearchPage(1);
                    try {
                      const result = await bridgeApi.searchTable({
                        dbId,
                        schemaName: selectedTable.schema || "public",
                        tableName: selectedTable.name,
                        searchTerm,
                        page: 1,
                        pageSize,
                      });
                      setSearchResults(result.rows);
                      setSearchResultCount(result.total);
                    } catch (err: any) {
                      toast.error(err.message || "Search failed");
                      setSearchResults(null);
                      setSearchResultCount(undefined);
                    } finally {
                      setIsSearching(false);
                    }
                  }}
                  isSearching={isSearching}
                  searchResultCount={searchResultCount}
                  onEditRow={async (row) => {
                    try {
                      let pk = "";
                      try {
                        pk = await bridgeApi.getPrimaryKeys(
                          dbId || "",
                          selectedTable?.schema || "public",
                          selectedTable?.name || ""
                        );
                      } catch {
                        pk = Object.keys(row)[0] || "";
                      }
                      setPrimaryKeyColumn(pk);
                      setEditingRow(row);
                      setEditDialogOpen(true);
                    } catch (err: any) {
                      toast.error("Cannot edit: " + (err.message || "Unknown error"));
                    }
                  }}
                  onDeleteRow={async (row) => {
                    try {
                      let pk = "";
                      let hasPK = false;
                      try {
                        pk = await bridgeApi.getPrimaryKeys(
                          dbId || "",
                          selectedTable?.schema || "public",
                          selectedTable?.name || ""
                        );
                        hasPK = !!pk;
                      } catch {
                        hasPK = false;
                      }
                      setDeletingRow(row);
                      setDeleteRowPK(pk);
                      setDeleteHasPK(hasPK);
                      setDeleteDialogOpen(true);
                    } catch (err: any) {
                      toast.error(err.message || "Failed to prepare delete");
                    }
                  }}
                />
              </div>
            </div>
          </>
        );
    }
  };

  return (
    <div className="h-[calc(100vh-32px)] flex bg-background text-foreground overflow-hidden">
      <VerticalIconBar
        dbId={dbId}
        activePanel={activePanel}
        onPanelChange={setActivePanel}
      />

      <main className="flex-1 ml-[60px] flex flex-col overflow-hidden">
        {renderPanelContent()}
      </main>

      {/* Migrations Panel */}
      <SlideOutPanel
        isOpen={migrationsOpen}
        onClose={() => setMigrationsOpen(false)}
        title="Migrations"
        disableScroll={true}
      >
        <MigrationsPanel
          dbId={dbId || ""}
          migrations={migrationsData}
          baselined={baselined}
        />
      </SlideOutPanel>

      {/* Chart Panel */}
      <SlideOutPanel
        isOpen={chartOpen}
        onClose={() => setChartOpen(false)}
        title={`Chart: ${selectedTable?.name || 'Table'}`}
        width="60%"
      >
        {selectedTable && (
          <ChartVisualization
            selectedTable={selectedTable}
            dbId={dbId}
          />
        )}
      </SlideOutPanel>

      {/* Insert Dialog */}
      <InsertDataDialog
        open={insertDialogOpen}
        onOpenChange={setInsertDialogOpen}
        dbId={dbId || ""}
        tableName={selectedTable?.name || ""}
        schemaName={selectedTable?.schema || ""}
        onSuccess={() => {
          refetchTableData();
          setInsertDialogOpen(false);
        }}
      />

      {/* Edit Dialog */}
      <EditRowDialog
        open={editDialogOpen}
        onOpenChange={setEditDialogOpen}
        dbId={dbId || ""}
        tableName={selectedTable?.name || ""}
        schemaName={selectedTable?.schema || ""}
        rowData={editingRow || {}}
        primaryKeyColumn={primaryKeyColumn}
        onSuccess={() => {
          refetchTableData();
          setEditDialogOpen(false);
        }}
      />

      {/* Delete Confirm Dialog */}
      <ConfirmDialog
        open={deleteDialogOpen}
        onOpenChange={setDeleteDialogOpen}
        title="Delete Row"
        description={
          deleteHasPK
            ? `Delete row with ${deleteRowPK} = ${deletingRow?.[deleteRowPK]}?`
            : `Delete this row? (Table has no primary key)`
        }
        confirmLabel="Delete"
        variant="destructive"
        onConfirm={async () => {
          if (!deletingRow || !selectedTable || !dbId) return;
          try {
            await bridgeApi.deleteRow({
              dbId,
              schemaName: selectedTable.schema || "public",
              tableName: selectedTable.name,
              primaryKeyColumn: deleteRowPK,
              primaryKeyValue: deletingRow[deleteRowPK],
            });
            toast.success("Row deleted");
            refetchTableData();
          } catch (err: any) {
            toast.error(err.message || "Delete failed");
          }
        }}
      />
    </div>
  );
};

export default DatabaseDetail;
