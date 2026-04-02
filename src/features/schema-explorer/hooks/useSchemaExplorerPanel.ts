import { toast } from "sonner";
import { useSchemaExplorerData } from "./useSchemaExplorerData";
import { useEffect, useState } from "react";
import { useInvalidateCache } from "@/features/project/hooks/useDbQueries";


export function useSchemaExplorerPanel({ dbId, projectId }: { dbId: string; projectId?: string | null }) {
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

    return {
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
    }
}