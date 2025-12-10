import { useState, useEffect, useCallback } from "react";
import { useParams } from "react-router-dom";
import { AlertCircle, RefreshCw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";
import {
    bridgeApi,
    DatabaseSchemaDetails,
    ColumnDetails,
    TableSchemaDetails,
    SchemaGroup
} from "@/services/bridgeApi";
import TreeViewPanel from "@/components/schemaExplorer/TreeViewPanel";
import SchemaExplorerHeader from "@/components/schemaExplorer/SchemaExplorerHeader";
import MetaDataPanel from "@/components/schemaExplorer/MetaDataPanel";
import { Spinner } from "@/components/ui/spinner";
import { useBridgeQuery } from "@/hooks/useBridgeQuery";

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

export default function SchemaExplorer() {
    const { id: dbId } = useParams<{ id: string }>();
    const { data: bridgeReady, isLoading: bridgeLoading } = useBridgeQuery();

    const [schemaData, setSchemaData] = useState<DatabaseSchema | null>(null);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);

    const [expandedSchemas, setExpandedSchemas] = useState<Set<string>>(new Set());
    const [expandedTables, setExpandedTables] = useState<Set<string>>(new Set());
    const [selectedItem, setSelectedItem] = useState<string | null>(null);

    // --- Fetch schema after bridge is ready ---
    const fetchSchema = useCallback(async () => {
        if (!bridgeReady || !dbId) return;

        setLoading(true);
        setError(null);

        try {
            const result = await bridgeApi.getSchema(dbId);

            if (result) {
                const dbSchema = result as DatabaseSchema;
                setSchemaData(dbSchema);
                setSelectedItem(dbSchema.name);

                if (dbSchema.schemas.length > 0) {
                    setExpandedSchemas(new Set([dbSchema.schemas[0].name]));
                }
            } else {
                setError(`Database ID ${dbId} found no schema data.`);
            }
        } catch (err: any) {
            console.error("Failed to fetch schema:", err);
            setError(err.message || "Failed to connect and load schema metadata.");
            toast.error("Schema Load Failed", { description: err.message });
        } finally {
            setLoading(false);
        }
    }, [bridgeReady, dbId]);

    useEffect(() => {
        fetchSchema();
    }, [fetchSchema]);

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
    if (bridgeLoading || loading) {
        return (
            <div className="min-h-screen flex items-center justify-center bg-background dark:bg-[#050505] text-foreground">
                <Spinner className="size-16" />
            </div>
        );
    }

    if (error || !schemaData) {
        return (
            <div className="min-h-screen flex items-center justify-center bg-background dark:bg-[#050505] text-foreground">
                <div className="text-center p-8 border border-destructive/30 rounded-xl bg-destructive/10 text-destructive">
                    <AlertCircle className="h-10 w-10 text-destructive mx-auto mb-4" />
                    <h2 className="text-xl font-bold mb-2">Error</h2>
                    <p className="text-sm text-muted-foreground">{error || "No schema data could be loaded."}</p>
                    <Button
                        onClick={fetchSchema}
                        className="mt-4 bg-primary hover:bg-primary/90 text-white shadow-md shadow-primary/30"
                    >
                        <RefreshCw className="h-4 w-4 mr-2" /> Retry Load
                    </Button>
                </div>
            </div>
        );
    }

    // --- Main renderer ---
    return (
        <div className="min-h-screen bg-background flex flex-col text-foreground dark:bg-[#050505]">
            <SchemaExplorerHeader dbId={dbId!} database={schemaData} />

            <div className="flex-1 flex overflow-hidden">
                <TreeViewPanel
                    database={schemaData}
                    expandedSchemas={expandedSchemas}
                    expandedTables={expandedTables}
                    toggleSchema={toggleSchema}
                    toggleTable={toggleTable}
                    selectedItem={selectedItem}
                    setSelectedItem={setSelectedItem}
                    handlePreviewRows={handlePreviewRows}
                    handleShowDDL={handleShowDDL}
                    handleCopy={handleCopy}
                    handleExport={handleExport}
                />

                <MetaDataPanel database={schemaData} selectedItem={selectedItem} />
            </div>
        </div>
    );
}
