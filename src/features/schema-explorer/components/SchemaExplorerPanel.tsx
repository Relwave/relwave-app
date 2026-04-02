import { AlertCircle, RefreshCw, Download, Wifi, WifiOff } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Spinner } from "@/components/ui/spinner";
import { ColumnDetails, DatabaseSchemaDetails, SchemaGroup, TableSchemaDetails } from "@/features/database/types";
import SchemaExplorerHeader from "./SchemaExplorerHeader";
import MetaDataPanel from "./MetaDataPanel";
import { useSchemaExplorerPanel } from "../hooks/useSchemaExplorerPanel";
import { TreeViewPanel } from "@/features/tree";


interface Column extends ColumnDetails {
    foreignKeyRef?: string;
}

interface TableSchema extends TableSchemaDetails {
    columns: Column[];
}

interface Schema extends SchemaGroup {
    tables: TableSchema[];
}

interface DatabaseSchema extends DatabaseSchemaDetails {
    schemas: Schema[];
}

interface SchemaExplorerPanelProps {
    dbId: string;
    projectId?: string | null;
}

export default function SchemaExplorerPanel({ dbId, projectId }: SchemaExplorerPanelProps) {
    // Offline-first data source: prefers live DB, falls back to project files
    const {
        isLoading,
        schemaData,
        refetch,
        error,
        expandedSchemas,
        expandedTables,
        invalidateDatabase,
        isSyncing,
        syncFromDatabase,
        selectedItem,
        setSelectedItem,
        setIsSyncing,
        hasLiveSchema,
        toggleSchema,
        toggleTable,
        dataSource,
        selectedTable
    } = useSchemaExplorerPanel({ dbId, projectId });
    // --- Conditional rendering ---
    if (isLoading) {
        return (
            <div className="h-full flex items-center justify-center bg-background">
                <Spinner className="size-16" />
            </div>
        );
    }

    if (error || !schemaData) {
        return (
            <div className="h-full flex items-center justify-center bg-background">
                <div className="text-center p-8 border border-destructive/30 rounded-xl bg-destructive/10 text-destructive">
                    <AlertCircle className="h-10 w-10 text-destructive mx-auto mb-4" />
                    <h2 className="text-xl font-bold mb-2">No Schema Available</h2>
                    <p className="text-sm text-muted-foreground mb-1">{typeof error === "string" ? error : "No schema data could be loaded."}</p>
                    <p className="text-xs text-muted-foreground mb-4">Connect to a database or sync schema to use offline.</p>
                    <div className="flex gap-2 justify-center">
                        <Button
                            onClick={() => {
                                if (dbId) invalidateDatabase(dbId);
                                refetch();
                            }}
                            variant="outline"
                            size="sm"
                        >
                            <RefreshCw className="h-4 w-4 mr-2" /> Retry
                        </Button>
                        {projectId && (
                            <Button
                                onClick={async () => {
                                    setIsSyncing(true);
                                    try { await syncFromDatabase(); } finally { setIsSyncing(false); }
                                }}
                                size="sm"
                                disabled={isSyncing || !hasLiveSchema}
                            >
                                {isSyncing ? <Spinner className="h-4 w-4 mr-2" /> : <Download className="h-4 w-4 mr-2" />}
                                Sync from Database
                            </Button>
                        )}
                    </div>
                </div>
            </div>
        );
    }

    // --- Main renderer ---
    return (
        <div className="h-full flex flex-col bg-background text-foreground overflow-hidden">
            <SchemaExplorerHeader
                dbId={dbId!}
                database={schemaData}
                selectedTable={selectedTable}
                onTableCreated={() => {
                    if (dbId) invalidateDatabase(dbId);
                    refetch();
                }}
            />

            <div className="flex-1 flex overflow-hidden">
                <TreeViewPanel
                    database={schemaData}
                    expandedSchemas={expandedSchemas}
                    expandedTables={expandedTables}
                    selectedItem={selectedItem}
                    toggleSchema={toggleSchema}
                    toggleTable={toggleTable}
                    setSelectedItem={setSelectedItem}
                    handlePreviewRows={() => { }}
                    handleShowDDL={() => { }}
                    handleCopy={() => { }}
                    handleExport={() => { }}
                />
                <MetaDataPanel
                    database={schemaData}
                    selectedItem={selectedItem}
                />
            </div>

            {/* Footer */}
            <div className="border-t border-border bg-card px-4 py-2">
                <div className="container mx-auto flex items-center justify-between text-xs text-muted-foreground">
                    <div className="flex items-center gap-3">
                        <span>
                            {schemaData?.schemas?.length} Schemas • {schemaData?.schemas?.flatMap(s => s.tables).length} Tables
                        </span>
                        {/* Data source badge */}
                        {dataSource === "live" ? (
                            <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded-full text-[10px] font-medium bg-emerald-500/15 text-emerald-600 dark:text-emerald-400 border border-emerald-500/20">
                                <Wifi className="h-2.5 w-2.5" />
                                Live
                            </span>
                        ) : dataSource === "project" ? (
                            <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded-full text-[10px] font-medium bg-amber-500/15 text-amber-600 dark:text-amber-400 border border-amber-500/20">
                                <WifiOff className="h-2.5 w-2.5" />
                                Offline
                            </span>
                        ) : null}
                    </div>
                    <div className="flex items-center gap-2">
                        {dataSource === "project" && hasLiveSchema && (
                            <Button
                                variant="ghost"
                                size="sm"
                                className="h-6 text-xs px-2"
                                onClick={async () => {
                                    setIsSyncing(true);
                                    try { await syncFromDatabase(); } finally { setIsSyncing(false); }
                                }}
                                disabled={isSyncing}
                            >
                                {isSyncing ? <Spinner className="h-3 w-3 mr-1" /> : <Download className="h-3 w-3 mr-1" />}
                                Sync
                            </Button>
                        )}
                        <span>Click table to highlight • Drag to pan • Scroll to zoom</span>
                    </div>
                </div>
            </div>
        </div>
    );
}
