// pages/DatabaseDetail.tsx

import { useParams } from "react-router-dom";
import { useBridgeQuery } from "@/services/bridge/useBridgeQuery";
import { useDatabaseDetails } from "@/features/database/hooks/useDatabaseDetails";
import { useDatabaseDetailPage } from "@/features/database/hooks/useDatabaseDetailPage";
import { useMigrations, useFullSchema } from "@/features/project/hooks/useDbQueries";
import { useExport } from "@/features/database/hooks/useExport";
import { useProjectSync } from "@/features/project/hooks/useProjectSync";
import { useProjectDir } from "@/features/project/hooks/useProjectQueries";
import { useRowOperations } from "@/features/database/hooks/useRowOperations";
import BridgeLoader from "@/components/feedback/BridgeLoader";
import VerticalIconBar from "@/components/layout/VerticalIconBar";
import SlideOutPanel from "@/components/layout/SlideOutPanel";
import ConfirmDialog from "@/components/shared/ConfirmDialog";

import { DatabaseErrorView } from "@/features/database/components/DatabaseErrorView";
import { DataViewPanel } from "@/features/database/components/DataViewPanel";
import { MigrationsPanel } from "@/features/database/components";
import InsertDataDialog from "@/features/database/components/InsertDataDialog";
import EditRowDialog from "@/features/database/components/EditRowDialog";
import { ChartVisualization } from "@/features/chart/components";
import ERDiagramPanel from "@/features/er-diagram/components/ERDiagramPanel";
import { QueryBuilderPanel } from "@/features/query-builder/components";
import { SchemaExplorerPanel } from "@/features/schema-explorer/components";
import SQLWorkspacePanel from "@/features/workspace/components/SQLWorkspacePanel";
import GitStatusPanel from "@/features/git/components/GitStatusPanel";
import GitStatusBar from "@/features/git/components/GitStatusBar";

const DatabaseDetail = () => {
  const { id: dbId } = useParams<{ id: string }>();
  const { data: bridgeReady, isLoading: bridgeLoading } = useBridgeQuery();

  // Page UI state
  const {
    activePanel,
    setActivePanel,
    migrationsOpen,
    setMigrationsOpen,
    chartOpen,
    setChartOpen,
    insertDialogOpen,
    setInsertDialogOpen,
    sidebarOpen,
    toggleSidebar,
  } = useDatabaseDetailPage();

  // Core database data
  const {
    databaseName,
    tables,
    selectedTable,
    tableData,
    totalRows,
    currentPage,
    pageSize,
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
  } = useDatabaseDetails({ dbId, bridgeReady: bridgeReady ?? false });

  // Row operations — search, edit, delete
  const rowOps = useRowOperations({
    dbId: dbId || "",
    selectedTable,
    pageSize,
    refetchTableData,
  });

  // Export
  const { exportAllTables, isExporting } = useExport({
    dbId: dbId || "",
    databaseName: databaseName || "database",
  });

  // Migrations
  const { data: migrationsResponse } = useMigrations(dbId);
  const migrationsData = migrationsResponse?.migrations || { local: [], applied: [] };
  const baselined = migrationsResponse?.baselined || false;

  // Project sync
  const { data: schemaData } = useFullSchema(dbId);
  const { projectId } = useProjectSync(dbId, schemaData ?? undefined);
  const { data: projectDir } = useProjectDir(projectId);

  // ---- Guards ----
  if (bridgeLoading || bridgeReady === undefined) return <BridgeLoader />;
  if (error) return <DatabaseErrorView error={error} isRetrying={loadingTables} onRetry={fetchTables} />;

  // ---- Panel router ----
  const renderPanel = () => {
    switch (activePanel) {
      case "sql-workspace": return <SQLWorkspacePanel dbId={dbId || ""} />;
      case "query-builder": return <QueryBuilderPanel dbId={dbId || ""} />;
      case "schema-explorer": return <SchemaExplorerPanel dbId={dbId || ""} projectId={projectId} />;
      case "er-diagram": return <ERDiagramPanel projectId={projectId} />;
      case "git-status": return <GitStatusPanel projectDir={projectDir} />;
      default:
        return (
          <DataViewPanel
            dbId={dbId || ""}
            databaseName={databaseName}
            tables={tables}
            selectedTable={selectedTable}
            schemas={schemas}
            selectedSchema={selectedSchema}
            setSelectedSchema={setSelectedSchema}
            tableData={tableData}
            totalRows={totalRows}
            currentPage={currentPage}
            pageSize={pageSize}
            isLoadingData={isLoadingData}
            loadingTables={loadingTables}
            sidebarOpen={sidebarOpen}
            onToggleSidebar={toggleSidebar}
            onRefresh={fetchTables}
            onMigrationsOpen={() => setMigrationsOpen(true)}
            onExport={exportAllTables}
            isExporting={isExporting}
            onChart={() => setChartOpen(true)}
            onInsert={() => setInsertDialogOpen(true)}
            onTableSelect={handleTableSelect}
            onPageChange={handlePageChange}
            onPageSizeChange={handlePageSizeChange}
            // Search
            searchTerm={rowOps.searchTerm}
            searchResults={rowOps.searchResults}
            searchResultCount={rowOps.searchResultCount}
            isSearching={rowOps.isSearching}
            searchPage={rowOps.searchPage}
            isSearchActive={rowOps.isSearchActive}
            onSearchChange={rowOps.handleSearchChange}
            onSearch={rowOps.handleSearch}
            onSearchPageChange={rowOps.handleSearchPageChange}
            onSearchRefresh={rowOps.handleSearchRefresh}
            // Row ops
            onEditRow={rowOps.handleEditRow}
            onDeleteRow={rowOps.handleDeleteRow}
          />
        );
    }
  };

  return (
    <div className="h-[calc(100vh-32px)] flex flex-col bg-background text-foreground overflow-hidden">
      <div className="flex-1 flex overflow-hidden">
        <VerticalIconBar
          dbId={dbId}
          activePanel={activePanel}
          onPanelChange={setActivePanel}
        />
        <main className="flex-1 ml-15 flex flex-col overflow-hidden">
          {renderPanel()}
        </main>
      </div>

      {/* Status bar */}
      <div className="shrink-0 h-7 border-t border-border/30 bg-background/95 backdrop-blur-sm flex items-center px-2 ml-15 gap-4">
        <GitStatusBar projectDir={projectDir} />
        <div className="flex-1" />
        <span className="text-[10px] text-muted-foreground/60 font-mono">
          {databaseName || "Database"}
        </span>
      </div>

      {/* Migrations */}
      <SlideOutPanel isOpen={migrationsOpen} onClose={() => setMigrationsOpen(false)} title="Migrations" disableScroll>
        <MigrationsPanel dbId={dbId || ""} migrations={migrationsData} baselined={baselined} />
      </SlideOutPanel>

      {/* Chart */}
      <SlideOutPanel isOpen={chartOpen} onClose={() => setChartOpen(false)} title={`Chart: ${selectedTable?.name || "Table"}`} width="60%">
        {selectedTable && <ChartVisualization selectedTable={selectedTable} dbId={dbId} />}
      </SlideOutPanel>

      {/* Insert */}
      <InsertDataDialog
        open={insertDialogOpen}
        onOpenChange={setInsertDialogOpen}
        dbId={dbId || ""}
        tableName={selectedTable?.name || ""}
        schemaName={selectedTable?.schema || ""}
        onSuccess={() => { refetchTableData(); setInsertDialogOpen(false); }}
      />

      {/* Edit */}
      <EditRowDialog
        open={rowOps.editDialogOpen}
        onOpenChange={rowOps.setEditDialogOpen}
        dbId={dbId || ""}
        tableName={selectedTable?.name || ""}
        schemaName={selectedTable?.schema || ""}
        rowData={rowOps.editingRow || {}}
        primaryKeyColumn={rowOps.primaryKeyColumn}
        onSuccess={rowOps.handleEditSuccess}
      />

      {/* Delete */}
      <ConfirmDialog
        open={rowOps.deleteDialogOpen}
        onOpenChange={rowOps.setDeleteDialogOpen}
        title="Delete Row"
        description={
          rowOps.deleteHasPK
            ? `Delete row with ${rowOps.deleteRowPK} = ${rowOps.deletingRow?.[rowOps.deleteRowPK]}?`
            : "Delete this row? (Table has no primary key)"
        }
        confirmLabel="Delete"
        variant="destructive"
        onConfirm={rowOps.handleConfirmDelete}
      />
    </div>
  );
};

export default DatabaseDetail;