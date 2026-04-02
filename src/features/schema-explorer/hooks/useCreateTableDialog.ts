import { CreateTableColumn, ForeignKeyConstraint } from "@/features/database/types";
import { databaseService } from "@/services/bridge/database";
import { migrationService } from "@/services/bridge/migration";
import { useEffect, useState } from "react";
import { toast } from "sonner";

interface CreateTableDialogProps {
    open: boolean;
    onOpenChange: (open: boolean) => void;
    dbId: string;
    schemaName: string;
    onSuccess?: () => void;
}


export function useCreateTableDialog({ onOpenChange, dbId, schemaName, onSuccess, open }: CreateTableDialogProps) {
    const [tableName, setTableName] = useState("");
    const [columns, setColumns] = useState<CreateTableColumn[]>([]);
    const [foreignKeys, setForeignKeys] = useState<ForeignKeyConstraint[]>([]);
    const [isSubmitting, setIsSubmitting] = useState(false);
    const [availableTables, setAvailableTables] = useState<Array<{ schema: string; name: string }>>([]);

    // State for indexes dialog
    const [showIndexesDialog, setShowIndexesDialog] = useState(false);
    const [createdTableName, setCreatedTableName] = useState("");

    // Fetch available tables when dialog opens
    useEffect(() => {
        if (open && dbId) {
            fetchAvailableTables();
        }
    }, [open, dbId]);

    const fetchAvailableTables = async () => {
        try {
            const schema = await databaseService.getSchema(dbId);
            const tables: Array<{ schema: string; name: string }> = [];

            schema?.schemas?.forEach((schemaGroup: any) => {
                schemaGroup.tables?.forEach((table: any) => {
                    tables.push({
                        schema: schemaGroup.name,
                        name: table.name,
                    });
                });
            });

            setAvailableTables(tables);
        } catch (error) {
            console.error("Failed to fetch available tables:", error);
        }
    };

    const resetForm = () => {
        setTableName("");
        setColumns([]);
        setForeignKeys([]);
    };

    const handleClose = () => {
        if (!isSubmitting) {
            resetForm();
            onOpenChange(false);
        }
    };

    const validateForm = (): boolean => {
        if (!tableName.trim()) {
            toast.error("Table name is required");
            return false;
        }

        if (columns.length === 0) {
            toast.error("At least one column is required");
            return false;
        }

        // Check for empty column names
        const emptyNames = columns.filter((col) => !col.name.trim());
        if (emptyNames.length > 0) {
            toast.error("All columns must have a name");
            return false;
        }

        // Check for duplicate column names
        const names = columns.map((col) => col.name.toLowerCase());
        const duplicates = names.filter((name, index) => names.indexOf(name) !== index);
        if (duplicates.length > 0) {
            toast.error(`Duplicate column name: ${duplicates[0]}`);
            return false;
        }

        // Validate foreign keys
        for (let i = 0; i < foreignKeys.length; i++) {
            const fk = foreignKeys[i];
            if (!fk.constraint_name.trim()) {
                toast.error(`Foreign key ${i + 1}: Constraint name is required`);
                return false;
            }
            if (!fk.source_column.trim()) {
                toast.error(`Foreign key ${i + 1}: Source column is required`);
                return false;
            }
            if (!fk.target_table.trim()) {
                toast.error(`Foreign key ${i + 1}: Target table is required`);
                return false;
            }
            if (!fk.target_column.trim()) {
                toast.error(`Foreign key ${i + 1}: Target column is required`);
                return false;
            }
        }

        return true;
    };

    const handleSubmit = async () => {
        if (!validateForm()) {
            return;
        }

        setIsSubmitting(true);

        try {
            // Prepare foreign keys with updated table name
            const preparedForeignKeys = foreignKeys.map((fk) => ({
                ...fk,
                source_table: tableName.trim(),
                source_schema: schemaName,
            }));

            // Generate migration instead of creating table directly
            const result = await migrationService.generateCreateMigration({
                dbId,
                schemaName,
                tableName: tableName.trim(),
                columns: columns.map((col) => ({
                    ...col,
                    name: col.name.trim(),
                    default_value: col.default_value?.trim() || undefined,
                })),
                foreignKeys: preparedForeignKeys,
            });

            // Auto-apply the migration immediately
            await migrationService.applyMigration(dbId, result.version);

            toast.success("Table created successfully!", {
                description: `Migration ${result.filename} was generated and applied. You can rollback from the Migrations panel if needed.`,
            });

            // Close dialog and reset form
            resetForm();
            onOpenChange(false);

            // Call success callback if provided
            if (onSuccess) {
                onSuccess();
            }

        } catch (error: any) {
            console.error("Failed to create migration:", error);
            toast.error("Failed to create migration", {
                description: error.message || "An unknown error occurred",
            });
            setIsSubmitting(false);
        } finally {
            setIsSubmitting(false);
        }
    };

    const handleIndexesSuccess = () => {
        setShowIndexesDialog(false);
        setCreatedTableName("");
        if (onSuccess) {
            onSuccess();
        }
    };

    return {
        tableName,
        setTableName,
        columns,
        setColumns,
        foreignKeys,
        setForeignKeys,
        availableTables,
        isSubmitting,
        handleSubmit,
        handleClose,
        showIndexesDialog,
        setShowIndexesDialog,
        createdTableName,
        setCreatedTableName,
        handleIndexesSuccess
    }
}