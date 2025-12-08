import { useState, useEffect, useCallback } from "react";
import { useParams } from "react-router-dom";
import { AlertCircle, RefreshCw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";
import { bridgeApi, DatabaseSchemaDetails, ColumnDetails, TableSchemaDetails, SchemaGroup } from "@/services/bridgeApi"; // Import API and types
import Loader from "@/components/Loader";
import TreeViewPanel from "@/components/schemaExplorer/TreeViewPanel";
import SchemaExplorerHeader from "@/components/schemaExplorer/SchemaExplorerHeader";
import MetaDataPanel from "@/components/schemaExplorer/MetaDataPanel";

interface Column extends ColumnDetails {
    foreignKeyRef?: string; // Add if foreignKeyRef detail is manually available
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

    const [schemaData, setSchemaData] = useState<DatabaseSchema | null>(null);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);

    const [expandedSchemas, setExpandedSchemas] = useState<Set<string>>(new Set());
    const [expandedTables, setExpandedTables] = useState<Set<string>>(new Set());
    const [selectedItem, setSelectedItem] = useState<string | null>(null);



    const fetchSchema = useCallback(async () => {
        if (!dbId) return;

        try {
            setLoading(true);
            setError(null);

            const result = await bridgeApi.getSchema(dbId);

            if (result) {
                setSchemaData(result as DatabaseSchema);
                setSelectedItem(result.name);
                // Expand the first schema found by default
                if (result.schemas.length > 0) {
                    setExpandedSchemas(new Set([result.schemas[0].name]));
                }
            } else {
                setError(`Database ID ${dbId} found no schema data.`);
            }

        } catch (err: any) {
            console.error("Failed to fetch schema:", err);
            setError(err.message || "Failed to connect and load schema metadata.");
            toast.error("Schema Load Failed", {
                description: err.message
            });
        } finally {
            setLoading(false);
        }
    }, [dbId]);

    useEffect(() => {
        fetchSchema();
    }, [fetchSchema]);



    const toggleSchema = (schemaName: string) => {
        const newExpanded = new Set(expandedSchemas);
        if (newExpanded.has(schemaName)) {
            newExpanded.delete(schemaName);
        } else {
            newExpanded.add(schemaName);
        }
        setExpandedSchemas(newExpanded);
    };

    const toggleTable = (tableName: string) => {
        const newExpanded = new Set(expandedTables);
        if (newExpanded.has(tableName)) {
            newExpanded.delete(tableName);
        } else {
            newExpanded.add(tableName);
        }
        setExpandedTables(newExpanded);
    };


    const handlePreviewRows = (tableName: string) => {
        toast.success(`Showing preview for ${tableName}`);
    };

    const handleShowDDL = (tableName: string) => {
        toast.success(`Generated DDL for ${tableName}`);
    };

    const handleCopy = (text: string, type: string) => {
        const el = document.createElement('textarea');
        el.value = text;
        document.body.appendChild(el);
        el.select();
        document.execCommand('copy');
        document.body.removeChild(el);

        toast.success(`${type} copied to clipboard`);
    };

    const handleExport = (tableName: string) => {
        toast.success(`Exported ${tableName} successfully`);
    };


    if (loading) {
        return (
            // Use theme colors for background
            <div className="min-h-screen flex items-center justify-center bg-background dark:bg-[#050505] text-foreground">
                <Loader />
            </div>
        );
    }

    if (error || !schemaData) {
        return (
            // Use clean error styling with theme colors
            <div className="min-h-screen flex items-center justify-center bg-background dark:bg-[#050505] text-foreground">
                <div className="text-center p-8 border border-destructive/30 rounded-xl bg-destructive/10 text-destructive">
                    <AlertCircle className="h-10 w-10 text-destructive mx-auto mb-4" />
                    <h2 className="text-xl font-bold mb-2">Error</h2>
                    <p className="text-sm text-muted-foreground">{error || "No schema data could be loaded."}</p>
                    <Button
                        onClick={fetchSchema}
                        // Use solid primary color (cyan) for retry
                        className="mt-4 bg-primary hover:bg-primary/90 text-white shadow-md shadow-primary/30"
                    >
                        <RefreshCw className="h-4 w-4 mr-2" /> Retry Load
                    </Button>
                </div>
            </div>
        );
    }

    // Get the current database object
    const database = schemaData;


    // --- Main Renderer ---

    return (
        <div className="min-h-screen bg-background flex flex-col text-foreground dark:bg-[#050505]">
            <SchemaExplorerHeader dbId={dbId!} database={database} />

            <div className="flex-1 flex overflow-hidden">
                {/* Tree View Panel */}
                <TreeViewPanel
                    database={database}
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

                {/* Metadata Panel */}
                <MetaDataPanel
                    database={database}
                    selectedItem={selectedItem}
                />
            </div >
        </div >
    );
}