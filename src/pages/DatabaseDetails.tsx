// pages/DatabaseDetail.tsx

import { useParams } from "react-router-dom";
import { useQueryClient } from "@tanstack/react-query";
import { useBridgeQuery } from "@/services/bridge/useBridgeQuery";
import { useDatabaseDetails } from "@/features/database/hooks/useDatabaseDetails";
import { useDatabaseDetailPage } from "@/features/database/hooks/useDatabaseDetailPage";
import { useMigrations, useFullSchema, useDatabase } from "@/features/project/hooks/useDbQueries";
import { useExport } from "@/features/database/hooks/useExport";
import { useProjectSync } from "@/features/project/hooks/useProjectSync";
import { useProjectDir, useProjectByDatabaseId } from "@/features/project/hooks/useProjectQueries";
import { useRowOperations } from "@/features/database/hooks/useRowOperations";
import BridgeLoader from "@/components/feedback/BridgeLoader";
import VerticalIconBar, { getDatabasePanelItems } from "@/components/layout/VerticalIconBar";
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
import { MonitoringPanel } from "@/features/monitoring/components/MonitoringPanel";
import AIWorkspacePanel from "@/features/database/components/AIWorkspacePanel";
import { ShortcutsHelp } from "@/components/shared/ShortcutsHelp";
import { ShortcutsTrigger } from "@/components/shared/ShortcutsTrigger";
import { MigrationSyncDialog } from "@/features/project/components/MigrationSyncDialog";
import { getDatabaseKind } from "@/lib/databases";
import { MongoDataViewPanel } from "@/features/mongodb/components/MongoDataViewPanel";
import { MongoWorkspacePanel } from "@/features/mongodb/components/workspace/MongoWorkspacePanel";
import { MongoAggregationPanel } from "@/features/mongodb/components/aggregation/MongoAggregationPanel";
import { MongoMigrationsPanel } from "@/features/mongodb/components/migrations/MongoMigrationsPanel";
import { MongoRelationshipsPanel } from "@/features/mongodb/components/relationships";
import { MongoBulkOperationsPanel } from "@/features/mongodb/components/bulk";
import { defaultMongoBulkOperationsStore } from "@/features/mongodb/hooks/useMongoBulkOperationsStore";
import { useState, useEffect } from "react";

const DatabaseDetail = () => {
  const { id: dbId } = useParams<{ id: string }>();
  const { data: bridgeReady, isLoading: bridgeLoading } = useBridgeQuery();
  const [shortcutsOpen, setShortcutsOpen] = useState(false);

  // Page UI state
  const {
    activePanel,
    // ... rest of imports ...
    setActivePanel,
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
    databaseType,
    tables,
    selectedTable,
    tableData,
    tableColumns,
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

  const isNosql = getDatabaseKind(databaseType) === "nosql";
  const { data: dbConn } = useDatabase(isNosql ? dbId : undefined);
  const isReadOnlyConnection = Boolean((dbConn as any)?.readOnly || (dbConn as any)?.readonly);

  const queryClient = useQueryClient();

  // Background bulk operations terminal cache invalidation (preserves captured target dbId across unmounts)
  useEffect(() => {
    if (!isNosql) return;

    let prevOperationsByDb = defaultMongoBulkOperationsStore.getSnapshot().operationsByDb;

    return defaultMongoBulkOperationsStore.subscribe(() => {
      const currentOperationsByDb = defaultMongoBulkOperationsStore.getSnapshot().operationsByDb;

      for (const [targetDbId, ops] of Object.entries(currentOperationsByDb)) {
        const prevOps = prevOperationsByDb[targetDbId] || [];
        for (const op of ops) {
          if (op.kind === "sync") {
            const prev = prevOps.find((p) => p.kind === "sync" && p.id === op.id);
            if (
              prev &&
              prev.status === "running" &&
              (op.status === "completed" || op.status === "partial_success")
            ) {
              queryClient.invalidateQueries({ queryKey: ["mongoDocuments", op.dbId] });
              queryClient.invalidateQueries({ queryKey: ["mongoCollections", op.dbId] });
              queryClient.invalidateQueries({ queryKey: ["mongoSchema", op.dbId] });
            }
          } else if (op.kind === "async" && op.type === "import") {
            const prev = prevOps.find((p) => p.kind === "async" && p.operationId === op.operationId);
            const wasActive = prev && (prev.status === "pending" || prev.status === "in_progress");
            const isTerminal = op.status === "completed" || op.status === "failed" || op.status === "cancelled";
            if (wasActive && isTerminal && op.successfulDocuments > 0) {
              queryClient.invalidateQueries({ queryKey: ["mongoDocuments", op.dbId] });
              queryClient.invalidateQueries({ queryKey: ["mongoCollections", op.dbId] });
              queryClient.invalidateQueries({ queryKey: ["mongoSchema", op.dbId] });
            }
          }
        }
      }
      prevOperationsByDb = currentOperationsByDb;
    });
  }, [isNosql, queryClient]);

  // Migrations
  const { data: migrationsResponse } = useMigrations(isNosql ? undefined : dbId);
  const migrationsData = migrationsResponse?.migrations || { local: [], applied: [] };
  const baselined = migrationsResponse?.baselined || false;

  // Project sync
  const { data: schemaData, refetch: refetchSchema } = useFullSchema(isNosql ? undefined : dbId);
  const { projectId, importAnalysis, importAnalysisLoading, refetchImportAnalysis } =
    useProjectSync(isNosql ? undefined : dbId, isNosql ? undefined : (schemaData ?? undefined));
  const { data: noSqlProject } = useProjectByDatabaseId(isNosql ? dbId : undefined);
  const effectiveProjectId = isNosql ? (noSqlProject?.id ?? null) : projectId;
  const { data: projectDir } = useProjectDir(projectId);
  const [migrationSyncDismissed, setMigrationSyncDismissed] = useState(false);

  // Keyboard shortcut listener: Alt+1..9 switches active database panel
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      // Don't intercept if user is typing in a form input or textarea
      const target = e.target as HTMLElement | null;
      if (target instanceof HTMLInputElement || target instanceof HTMLTextAreaElement) {
        return;
      }

      // Don't switch if a modal dialog is currently open
      if (document.querySelector('[role="dialog"]')) {
        return;
      }

      if (e.altKey && !e.ctrlKey && !e.metaKey && !e.shiftKey) {
        const num = parseInt(e.key, 10);
        if (!isNaN(num) && num >= 1 && num <= 9) {
          const items = getDatabasePanelItems(databaseType);
          const targetItem = items[num - 1];
          if (targetItem) {
            e.preventDefault();
            setActivePanel(targetItem.panel);
          }
        }
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [databaseType, setActivePanel]);

  // ---- Guards ----
  if (bridgeLoading || bridgeReady === undefined) return <BridgeLoader />;
  if (error)
    return <DatabaseErrorView error={error} isRetrying={loadingTables} onRetry={fetchTables} />;

  // ---- Panel router ----
  const renderPanel = () => {
    if (isNosql) {
      switch (activePanel) {
        case "mongo-workspace":
          return (
            <MongoWorkspacePanel
              key={`mws-${dbId}`}
              dbId={dbId!}
              databaseName={databaseName || ""}
            />
          );
        case "mongo-aggregation":
          return (
            <MongoAggregationPanel
              key={`magg-${dbId}`}
              dbId={dbId!}
              databaseName={databaseName || ""}
            />
          );
        case "mongo-migrations":
          return (
            <MongoMigrationsPanel
              key={`mmig-${dbId}`}
              dbId={dbId!}
              databaseName={databaseName || ""}
            />
          );
        case "mongo-relationships":
          return (
            <MongoRelationshipsPanel
              key={`mrel-${dbId}`}
              dbId={dbId!}
              projectId={effectiveProjectId}
              databaseName={databaseName || ""}
            />
          );
        case "mongo-bulk":
          return (
            <MongoBulkOperationsPanel
              key={`mbulk-${dbId}`}
              dbId={dbId!}
              databaseName={databaseName || ""}
            />
          );
        case "er-diagram":
          return (
            <MongoRelationshipsPanel
              key={`mrel-${dbId}`}
              dbId={dbId!}
              projectId={effectiveProjectId}
              databaseName={databaseName || ""}
              initialView="diagram"
            />
          );
        case "data":
        default:
          return (
            <MongoDataViewPanel
              dbId={dbId!}
              projectId={effectiveProjectId}
              databaseName={databaseName || ""}
              isReadOnly={isReadOnlyConnection}
            />
          );
      }
    }

    switch (activePanel) {
      case "sql-workspace":
        return <SQLWorkspacePanel key={`sql-${dbId}`} dbId={dbId || ""} />;
      case "query-builder":
        return <QueryBuilderPanel key={`qb-${dbId}`} dbId={dbId || ""} />;
      case "schema-explorer":
        return (
          <SchemaExplorerPanel key={`schema-${dbId}`} dbId={dbId || ""} projectId={projectId} />
        );
      case "er-diagram":
        return <ERDiagramPanel key={`er-${dbId}`} projectId={projectId} />;
      case "monitoring":
        return (
          <MonitoringPanel
            key={`mon-${dbId}`}
            dbId={dbId || ""}
            databaseName={databaseName}
            databaseType={databaseType}
          />
        );
      case "git-status":
        return (
          <GitStatusPanel key={`git-${dbId}`} projectDir={projectDir} projectId={projectId ?? ""} />
        );
      case "ai-workspace":
        return (
          <AIWorkspacePanel key={`ai-${dbId}`} dbId={dbId || ""} onNavigate={setActivePanel} />
        );
      case "migrations":
        return (
          <div className="p-6 h-full" key={`mig-${dbId}`}>
            <MigrationsPanel dbId={dbId || ""} migrations={migrationsData} baselined={baselined} />
          </div>
        );
      default:
        return (
          <DataViewPanel
            key={`data-${dbId}`}
            dbId={dbId || ""}
            databaseName={databaseName}
            tables={tables}
            selectedTable={selectedTable}
            schemas={schemas}
            selectedSchema={selectedSchema}
            setSelectedSchema={setSelectedSchema}
            tableData={tableData}
            tableColumns={tableColumns}
            totalRows={totalRows}
            currentPage={currentPage}
            pageSize={pageSize}
            isLoadingData={isLoadingData}
            loadingTables={loadingTables}
            sidebarOpen={sidebarOpen}
            onToggleSidebar={toggleSidebar}
            onRefresh={fetchTables}
            onMigrationsOpen={() => setActivePanel("migrations")}
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
    <div className="w-full h-[calc(100vh-32px)] flex flex-col app-surface text-foreground overflow-hidden">
      <div className="flex-1 flex overflow-hidden pl-15 min-w-0">
        <VerticalIconBar
          dbId={dbId}
          databaseType={databaseType}
          activePanel={activePanel}
          onPanelChange={setActivePanel}
        />
        <main className="flex-1 min-w-0 flex flex-col overflow-hidden">{renderPanel()}</main>
      </div>

      {/* Status bar */}
      <div className="shrink-0 h-7 border-t border-border/30 bg-background/80 backdrop-blur-xl flex items-center px-2 pl-15 gap-4 min-w-0">
        <GitStatusBar projectDir={projectDir} />
        <div className="flex-1" />
        <ShortcutsTrigger onClick={() => setShortcutsOpen(true)} />
        <span className="text-[10px] text-muted-foreground/60 font-mono">
          {databaseName || "Database"}
        </span>
      </div>

      <ShortcutsHelp open={shortcutsOpen} onOpenChange={setShortcutsOpen} />

      {/* Migration Sync Dialog — prompts user when imported project has pending migrations */}
      {projectId && !migrationSyncDismissed && !importAnalysisLoading && (
        <MigrationSyncDialog
          projectId={projectId}
          analysis={importAnalysis}
          onClose={() => setMigrationSyncDismissed(true)}
          onApplied={() => {
            setMigrationSyncDismissed(true);
            refetchImportAnalysis();
            fetchTables();
            refetchSchema();
          }}
        />
      )}

      {/* Chart */}
      <SlideOutPanel
        isOpen={chartOpen}
        onClose={() => setChartOpen(false)}
        title={`Chart: ${selectedTable?.name || "Table"}`}
        width="60%"
      >
        {selectedTable && <ChartVisualization selectedTable={selectedTable} dbId={dbId} />}
      </SlideOutPanel>

      {/* Insert */}
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
