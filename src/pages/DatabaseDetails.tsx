import { useState } from "react";
import { useParams, Link } from "react-router-dom";
import { RefreshCw, Download, FileText, ChevronDown, Terminal } from "lucide-react";
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
import VerticalIconBar from "@/components/common/VerticalIconBar";
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

const DatabaseDetail = () => {
  const { id: dbId } = useParams<{ id: string }>();
  const { data: bridgeReady, isLoading: bridgeLoading } = useBridgeQuery();
  const [migrationsOpen, setMigrationsOpen] = useState(false);
  const [chartOpen, setChartOpen] = useState(false);
  const [insertDialogOpen, setInsertDialogOpen] = useState(false);
  const [editDialogOpen, setEditDialogOpen] = useState(false);
  const [editingRow, setEditingRow] = useState<Record<string, any> | null>(null);
  const [primaryKeyColumn, setPrimaryKeyColumn] = useState<string>("");
  // Delete confirmation state
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [deletingRow, setDeletingRow] = useState<Record<string, any> | null>(null);
  const [deleteRowPK, setDeleteRowPK] = useState<string>("");
  const [deleteHasPK, setDeleteHasPK] = useState(false);
  // Search state
  const [searchTerm, setSearchTerm] = useState("");
  const [searchResults, setSearchResults] = useState<Record<string, any>[] | null>(null);
  const [searchResultCount, setSearchResultCount] = useState<number | undefined>(undefined);
  const [isSearching, setIsSearching] = useState(false);
  const [searchPage, setSearchPage] = useState(1);

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
    error,
    handleTableSelect,
    fetchTables,
    handlePageChange,
    handlePageSizeChange,
    refetchTableData,
  } = useDatabaseDetails({
    dbId,
    bridgeReady: bridgeReady ?? false,
  });

  // Export hook - exports all tables to CSV or JSON
  const { exportAllTables, isExporting } = useExport({
    dbId: dbId || "",
    databaseName: databaseName || "database",
  });

  // Fetch migrations data
  const { data: migrationsResponse } = useMigrations(dbId);
  const migrationsData = migrationsResponse?.migrations || {
    local: [],
    applied: [],
  };
  const baselined = migrationsResponse?.baselined || false;

  // Show loader during bridge loading or initial undefined state
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

  return (
    <div className="h-[calc(100vh-32px)] flex bg-background text-foreground overflow-hidden">
      <VerticalIconBar dbId={dbId} />

      <main className="flex-1 ml-[60px] flex flex-col">
        {/* Header */}
        <header className="border-b border-border/20 bg-background/95 backdrop-blur-sm">
          <div className="px-8 py-4 flex items-center justify-between">
            <div>
              <h1 className="text-xl font-semibold">{databaseName || 'Database'}</h1>
              <p className="text-xs text-muted-foreground mt-0.5">
                {tables.length} tables
              </p>
            </div>

            <div className="flex items-center gap-2">
              <Link to={`/database/${dbId}/sql-workspace`}>
                <Button
                  size="sm"
                  variant="default"
                  className="text-xs"
                >
                  <Terminal className="h-3.5 w-3.5 mr-1.5" />
                  SQL Workspace
                </Button>
              </Link>
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
                  <Button
                    size="sm"
                    variant="outline"
                    disabled={isExporting}
                    className="text-xs"
                  >
                    {isExporting ? (
                      <>
                        <Spinner className="h-3.5 w-3.5 mr-1.5" />
                        Exporting...
                      </>
                    ) : (
                      <>
                        <Download className="h-3.5 w-3.5 mr-1.5" />
                        Export All
                        <ChevronDown className="h-3 w-3 ml-1" />
                      </>
                    )}
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end">
                  <DropdownMenuItem onClick={() => exportAllTables("csv")}>
                    <FileText className="h-3.5 w-3.5 mr-2" />
                    Export as CSV
                  </DropdownMenuItem>
                  <DropdownMenuItem onClick={() => exportAllTables("json")}>
                    <FileText className="h-3.5 w-3.5 mr-2" />
                    Export as JSON
                  </DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
              <Button
                size="sm"
                variant="outline"
                onClick={fetchTables}
                disabled={loadingTables}
                className="text-xs"
              >
                {loadingTables ? (
                  <Spinner className="h-3.5 w-3.5" />
                ) : (
                  <RefreshCw className="h-3.5 w-3.5" />
                )}
              </Button>
            </div>
          </div>
        </header>

        {/* Split Screen Content */}
        <div className="flex flex-1 overflow-hidden">
          {/* Left Panel: Tables Explorer */}
          <TablesExplorerPanel
            dbId={dbId || ''}
            tables={tables}
            selectedTable={selectedTable}
            onSelectTable={handleTableSelect}
            loading={loadingTables}
          />

          {/* Right Panel: Content Viewer */}
          <ContentViewerPanel
            selectedTable={selectedTable?.name || null}
            tableData={searchResults !== null ? searchResults : tableData}
            totalRows={searchResults !== null ? (searchResultCount || 0) : totalRows}
            currentPage={searchResults !== null ? searchPage : currentPage}
            pageSize={pageSize}
            onRefresh={() => {
              if (searchResults !== null && searchTerm) {
                // Re-run search on refresh
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
                // Search pagination
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
              setSearchPage(1); // Reset to page 1 for new search
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
              // Fetch primary key for this table (may be empty)
              try {
                let pk = "";
                try {
                  pk = await bridgeApi.getPrimaryKeys(
                    dbId || "",
                    selectedTable?.schema || "public",
                    selectedTable?.name || ""
                  );
                } catch {
                  // No PK found - will use first column as identifier
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

                let confirmMsg: string;
                if (hasPK) {
                  confirmMsg = `Delete row with ${pk} = ${row[pk]}?`;
                } else {
                  confirmMsg = `Delete this row? (Table has no primary key - using all columns to identify)`;
                }

                // Store delete info and open confirm dialog
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
      </main>

      {/* Right Slide-out: Migrations */}
      <SlideOutPanel
        isOpen={migrationsOpen}
        onClose={() => setMigrationsOpen(false)}
        title="Migrations"
        disableScroll={true}
      >
        <MigrationsPanel
          migrations={migrationsData}
          baselined={baselined}
          dbId={dbId || ""}
        />
      </SlideOutPanel>

      {/* Right Slide-out: Chart Visualization */}
      <SlideOutPanel
        isOpen={chartOpen}
        onClose={() => setChartOpen(false)}
        title="Chart Visualization"
        width="60%"
      >
        {selectedTable && (
          <div className="p-6">
            <ChartVisualization
              selectedTable={selectedTable}
              dbId={dbId}
            />
          </div>
        )}
      </SlideOutPanel>

      {/* Insert Data Dialog */}
      {selectedTable && (
        <InsertDataDialog
          open={insertDialogOpen}
          onOpenChange={setInsertDialogOpen}
          dbId={dbId || ""}
          schemaName={selectedTable.schema || "public"}
          tableName={selectedTable.name}
          onSuccess={() => {
            // Refresh table data after insert
            refetchTableData();
          }}
        />
      )}

      {/* Edit Row Dialog */}
      {selectedTable && editingRow && (
        <EditRowDialog
          open={editDialogOpen}
          onOpenChange={(open) => {
            setEditDialogOpen(open);
            if (!open) setEditingRow(null);
          }}
          dbId={dbId || ""}
          schemaName={selectedTable.schema || "public"}
          tableName={selectedTable.name}
          primaryKeyColumn={primaryKeyColumn}
          rowData={editingRow}
          onSuccess={() => {
            refetchTableData();
          }}
        />
      )}

      {/* Delete Confirmation Dialog */}
      <ConfirmDialog
        open={deleteDialogOpen}
        onOpenChange={(open) => {
          setDeleteDialogOpen(open);
          if (!open) setDeletingRow(null);
        }}
        title="Delete Row"
        description={
          deleteHasPK
            ? `Are you sure you want to delete the row with ${deleteRowPK} = ${deletingRow?.[deleteRowPK]}?`
            : "Are you sure you want to delete this row? (Table has no primary key - using all columns to identify)"
        }
        confirmLabel="Delete"
        cancelLabel="Cancel"
        variant="destructive"
        onConfirm={async () => {
          if (!deletingRow || !selectedTable) return;
          try {
            await bridgeApi.deleteRow({
              dbId: dbId || "",
              schemaName: selectedTable.schema || "public",
              tableName: selectedTable.name,
              primaryKeyColumn: deleteHasPK ? deleteRowPK : "",
              primaryKeyValue: deleteHasPK ? deletingRow[deleteRowPK] : deletingRow,
            });
            toast.success("Row deleted successfully");
            refetchTableData();
            setDeleteDialogOpen(false);
            setDeletingRow(null);
          } catch (err: any) {
            toast.error(err.message || "Failed to delete row");
          }
        }}
      />
    </div>
  );
};

export default DatabaseDetail;
