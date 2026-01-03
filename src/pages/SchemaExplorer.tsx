import { useState, useEffect } from "react";
import { useParams } from "react-router-dom";
import { AlertCircle, RefreshCw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";
import TreeViewPanel from "@/components/schema-explorer/TreeViewPanel";
import SchemaExplorerHeader from "@/components/schema-explorer/SchemaExplorerHeader";
import MetaDataPanel from "@/components/schema-explorer/MetaDataPanel";
import { Spinner } from "@/components/ui/spinner";
import { useFullSchema, useInvalidateCache } from "@/hooks/useDbQueries";
import { ColumnDetails, DatabaseSchemaDetails, SchemaGroup, TableSchemaDetails } from "@/types/database";

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

    // Use React Query for schema data (cached!)
    const {
        data: schemaData,
        isLoading,
        error: queryError,
        refetch
    } = useFullSchema(dbId);

    const { invalidateDatabase } = useInvalidateCache();
    const error = queryError ? (queryError as Error).message : null;

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
        const parts = selectedItem.split('.');

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
                        onClick={() => {
                            if (dbId) invalidateDatabase(dbId);
                            refetch();
                        }}
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
            <SchemaExplorerHeader
                dbId={dbId!}
                database={schemaData}
                selectedTable={selectedTable}
                onTableCreated={() => {
                    // Invalidate cache and refetch schema data
                    if (dbId) invalidateDatabase(dbId);
                    refetch();
                }}
            />

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
