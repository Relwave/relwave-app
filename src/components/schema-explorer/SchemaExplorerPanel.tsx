import { useState, useEffect } from "react";
import { toast } from "sonner";
import { AlertCircle, RefreshCw, Download, Wifi, WifiOff } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Spinner } from "@/components/ui/spinner";
import { useInvalidateCache } from "@/hooks/useDbQueries";
import { useSchemaExplorerData } from "@/hooks/useSchemaExplorerData";
import { ColumnDetails, DatabaseSchemaDetails, SchemaGroup, TableSchemaDetails } from "@/types/database";
import TreeViewPanel from "@/components/schema-explorer/TreeViewPanel";
import SchemaExplorerHeader from "@/components/schema-explorer/SchemaExplorerHeader";
import MetaDataPanel from "@/components/schema-explorer/MetaDataPanel";

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
        schemaData,
        isLoading,
        dataSource,
        hasLiveSchema,
        syncFromDatabase,
        refetch,
    } = useSchemaExplorerData(dbId, projectId);

    const [isSyncing, setIsSyncing] = useState(false);
    const { invalidateDatabase } = useInvalidateCache();
    const error = dataSource === "none" && !isLoading ? "No schema data available" : null;

    const [expandedSchemas, setExpandedSchemas] = useState<Set<string>>(new Set());
    const [expandedTables, setExpandedTables] = useState<Set<string>>(new Set());
    const [selectedItem, setSelectedItem] = useState<string | null>(null);
    const [selectedTable, setSelectedTable] = useState<{ schema: string; name: string; columns: string[] } | null>(null);

    // Initialize expanded schemas and selected item when data loads
    useEffect(() => {
        if (schemaData) {
            setSelectedItem(schemaData.name);
            if (schemaData.schemas && schemaData.schemas.length > 0) {
                setExpandedSchemas(new Set([schemaData.schemas[0].name]));
            }
        }
    }, [schemaData]);

    // Update selectedTable when selectedItem changes
    useEffect(() => {
        if (!selectedItem || !schemaData) {
            setSelectedTable(null);
            return;
        }

        // Parse selectedItem format: "database.schema.table"
        const parts = selectedItem.split(':::');

        // If it's just database or database.schema, no table selected
        if (parts.length < 3) {
            setSelectedTable(null);
            return;
        }

        const schemaName = parts[1];
        const tableName = parts[2];

        // Find the table in schemaData
        const schema = schemaData.schemas?.find((s: any) => s.name === schemaName);
        if (!schema) {
            setSelectedTable(null);
            return;
        }

        const table = schema.tables?.find((t: any) => t.name === tableName);
        if (!table) {
            setSelectedTable(null);
            return;
        }

        // Extract column names
        const columns = table.columns?.map((c: any) => c.name) || [];

        setSelectedTable({
            schema: schemaName,
            name: tableName,
            columns: columns
        });
    }, [selectedItem, schemaData]);

    // --- Toggle helpers ---
    const toggleSchema = (schemaName: string) => {
        const newExpanded = new Set(expandedSchemas);
        newExpanded.has(schemaName) ? newExpanded.delete(schemaName) : newExpanded.add(schemaName);
        setExpandedSchemas(newExpanded);
    };

    const toggleTable = (tableName: string) => {
        const newExpanded = new Set(expandedTables);
        newExpanded.has(tableName) ? newExpanded.delete(tableName) : newExpanded.add(tableName);
        setExpandedTables(newExpanded);
    };

    // --- Action handlers ---
    const handlePreviewRows = (tableName: string) => toast.success(`Showing preview for ${tableName}`);
    const handleShowDDL = (tableName: string) => toast.success(`Generated DDL for ${tableName}`);
    const handleCopy = (text: string, type: string) => {
        const el = document.createElement("textarea");
        el.value = text;
        document.body.appendChild(el);
        el.select();
        document.execCommand("copy");
        document.body.removeChild(el);
        toast.success(`${type} copied to clipboard`);
    };
    const handleExport = (tableName: string) => toast.success(`Exported ${tableName} successfully`);

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
