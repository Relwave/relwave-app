import { useEffect, useState } from "react";
import { ColumnDetails, ForeignKeyInfo } from "../types";
import { databaseService } from "@/services/bridge/database";
import { queryService } from "@/services/bridge/query";
import { toast } from "sonner";

interface InsertDataDialogProps {
    open: boolean;
    onOpenChange: (open: boolean) => void;
    dbId: string;
    schemaName: string;
    tableName: string;
    onSuccess?: () => void;
}

interface FKOption {
    value: string;
    label: string;
}

export function useInsertDataDialog({ open,
    onOpenChange,
    dbId,
    schemaName,
    tableName,
    onSuccess, }: InsertDataDialogProps) {
    const [columns, setColumns] = useState<ColumnDetails[]>([]);
    const [foreignKeys, setForeignKeys] = useState<ForeignKeyInfo[]>([]);
    const [formData, setFormData] = useState<Record<string, string>>({});
    const [nullFields, setNullFields] = useState<Set<string>>(new Set());
    const [loading, setLoading] = useState(false);
    const [submitting, setSubmitting] = useState(false);

    // FK lookup values cache
    const [fkOptions, setFkOptions] = useState<Record<string, FKOption[]>>({});
    const [loadingFKs, setLoadingFKs] = useState<Set<string>>(new Set());

    // Reset state when dialog closes
    useEffect(() => {
        if (!open) {
            setColumns([]);
            setForeignKeys([]);
            setFormData({});
            setNullFields(new Set());
            setFkOptions({});
            setLoadingFKs(new Set());
        }
    }, [open]);

    // Fetch schema when dialog opens
    useEffect(() => {
        if (open && dbId && schemaName && tableName) {
            fetchTableInfo();
        }
    }, [open, dbId, schemaName, tableName]);

    const fetchTableInfo = async () => {
        setLoading(true);
        try {
            const schemaData = await databaseService.getSchema(dbId);
            if (!schemaData) {
                throw new Error("Failed to fetch schema");
            }

            // Find the target table in schema
            const schema = schemaData.schemas.find(s => s.name === schemaName);
            const table = schema?.tables.find(t => t.name === tableName);

            if (!table) {
                throw new Error(`Table ${schemaName}.${tableName} not found`);
            }

            setColumns(table.columns || []);
            setForeignKeys(table.foreignKeys || []);

            // Initialize form data with empty strings
            const initialData: Record<string, string> = {};
            table.columns?.forEach((col) => {
                initialData[col.name] = "";
            });
            setFormData(initialData);

            // Load FK options for each FK column
            const fkMap: Record<string, ForeignKeyInfo> = {};
            table.foreignKeys?.forEach(fk => {
                fkMap[fk.source_column] = fk;
            });

            // Fetch FK reference values
            for (const fk of table.foreignKeys || []) {
                loadFKOptions(fk);
            }
        } catch (error) {
            toast.error("Failed to fetch table information");
            console.error(error);
        } finally {
            setLoading(false);
        }
    };

    const loadFKOptions = async (fk: ForeignKeyInfo) => {
        const key = fk.source_column;
        setLoadingFKs(prev => new Set(prev).add(key));

        try {
            // Fetch first 100 rows from referenced table
            const result = await queryService.fetchTableData(
                dbId,
                fk.target_schema,
                fk.target_table,
                100,
                1
            );

            const options: FKOption[] = result.rows.map(row => {
                const value = String(row[fk.target_column] ?? "");
                // Try to show a more descriptive label if there's a name column
                const nameCol = Object.keys(row).find(k =>
                    k.toLowerCase().includes('name') ||
                    k.toLowerCase().includes('title')
                );
                const label = nameCol ? `${value} - ${row[nameCol]}` : value;
                return { value, label };
            });

            setFkOptions(prev => ({ ...prev, [key]: options }));
        } catch (error) {
            console.error(`Failed to load FK options for ${fk.target_table}:`, error);
            setFkOptions(prev => ({ ...prev, [key]: [] }));
        } finally {
            setLoadingFKs(prev => {
                const next = new Set(prev);
                next.delete(key);
                return next;
            });
        }
    };

    const getFKForColumn = (columnName: string): ForeignKeyInfo | undefined => {
        return foreignKeys.find(fk => fk.source_column === columnName);
    };

    const handleInputChange = (columnName: string, value: string) => {
        setFormData(prev => ({ ...prev, [columnName]: value }));
        // If user types something, remove from null fields
        if (value) {
            setNullFields(prev => {
                const next = new Set(prev);
                next.delete(columnName);
                return next;
            });
        }
    };

    const toggleNull = (columnName: string, checked: boolean) => {
        setNullFields(prev => {
            const next = new Set(prev);
            if (checked) {
                next.add(columnName);
                setFormData(p => ({ ...p, [columnName]: "" }));
            } else {
                next.delete(columnName);
            }
            return next;
        });
    };

    const handleSubmit = async () => {
        setSubmitting(true);
        try {
            const rowData: Record<string, any> = {};

            for (const col of columns) {
                const value = formData[col.name];
                const isNull = nullFields.has(col.name);

                if (isNull) {
                    rowData[col.name] = null;
                } else if (value === "") {
                    // Skip empty fields - let DB use defaults or error
                    if (col.defaultValue) {
                        continue;
                    }
                    if (!col.nullable) {
                        continue;
                    }
                    // Required field with no value - let DB handle
                    continue;
                } else {
                    rowData[col.name] = parseValue(value, col.type);
                }
            }

            await databaseService.insertRow({
                dbId,
                schemaName,
                tableName,
                rowData,
            });

            toast.success("Row inserted successfully");
            onOpenChange(false);
            onSuccess?.();
        } catch (error: any) {
            toast.error(error.message || "Failed to insert row");
        } finally {
            setSubmitting(false);
        }
    };

    const parseValue = (value: string, type: string): any => {
        const lowerType = type.toLowerCase();

        if (lowerType.includes("int") || lowerType.includes("serial")) {
            const num = parseInt(value, 10);
            return isNaN(num) ? value : num;
        }
        if (lowerType.includes("float") || lowerType.includes("double") ||
            lowerType.includes("decimal") || lowerType.includes("numeric") ||
            lowerType.includes("real")) {
            const num = parseFloat(value);
            return isNaN(num) ? value : num;
        }
        if (lowerType.includes("bool")) {
            return value.toLowerCase() === "true" || value === "1";
        }
        if (lowerType.includes("json")) {
            try {
                return JSON.parse(value);
            } catch {
                return value;
            }
        }

        return value;
    };

    const getPlaceholder = (col: ColumnDetails): string => {
        if (col.defaultValue) {
            return `Default: ${col.defaultValue}`;
        }
        return col.type;
    };

    return {
        columns,
        foreignKeys,
        formData,
        nullFields,
        loading,
        submitting,
        getFKForColumn,
        handleInputChange,
        toggleNull,
        handleSubmit,
        getPlaceholder,
        loadingFKs,
        fkOptions
    }
}