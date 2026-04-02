import { AlterTableOperation } from "@/features/database/types";
import { migrationService } from "@/services/bridge/migration";
import { useState } from "react";
import { toast } from "sonner";



interface AlterTableDialogProps {
    open: boolean;
    onOpenChange: (open: boolean) => void;
    dbId: string;
    schemaName: string;
    tableName: string;
    availableColumns: string[];
    onSuccess?: () => void;
}



export function useAlterTableDialog({ onOpenChange, dbId, schemaName, tableName, onSuccess }: AlterTableDialogProps) {
    const [operations, setOperations] = useState<AlterTableOperation[]>([]);
    const [isSubmitting, setIsSubmitting] = useState(false);

    const resetForm = () => {
        setOperations([]);
    };

    const handleClose = () => {
        if (!isSubmitting) {
            resetForm();
            onOpenChange(false);
        }
    };

    const addOperation = () => {
        // Default to ADD_COLUMN
        const newOp: AlterTableOperation = {
            type: "ADD_COLUMN",
            column: {
                name: "",
                type: "TEXT",
                not_nullable: false,
                is_primary_key: false,
                default_value: "",
            },
        };
        setOperations([...operations, newOp]);
    };

    const removeOperation = (index: number) => {
        setOperations(operations.filter((_, i) => i !== index));
    };

    const updateOperation = (index: number, newOp: AlterTableOperation) => {
        const updated = [...operations];
        updated[index] = newOp;
        setOperations(updated);
    };

    const handleSubmit = async () => {
        if (operations.length === 0) {
            toast.error("At least one operation is required");
            return;
        }

        // Validate operations
        for (let i = 0; i < operations.length; i++) {
            const op = operations[i];

            if (op.type === "ADD_COLUMN") {
                if (!op.column.name.trim()) {
                    toast.error(`Operation ${i + 1}: Column name is required`);
                    return;
                }
            } else if (op.type === "DROP_COLUMN" || op.type === "SET_NOT_NULL" ||
                op.type === "DROP_NOT_NULL" || op.type === "DROP_DEFAULT" ||
                op.type === "ALTER_TYPE") {
                if (!op.column_name?.trim()) {
                    toast.error(`Operation ${i + 1}: Column name is required`);
                    return;
                }
            } else if (op.type === "RENAME_COLUMN") {
                if (!op.from?.trim() || !op.to?.trim()) {
                    toast.error(`Operation ${i + 1}: Both column names are required`);
                    return;
                }
            } else if (op.type === "SET_DEFAULT") {
                if (!op.column_name?.trim() || !op.default_value?.trim()) {
                    toast.error(`Operation ${i + 1}: Column name and default value are required`);
                    return;
                }
            }
        }

        setIsSubmitting(true);

        try {
            // Generate migration instead of altering table directly
            const result = await migrationService.generateAlterMigration({
                dbId,
                schemaName,
                tableName,
                operations,
            });

            // Auto-apply the migration immediately
            await migrationService.applyMigration(dbId, result.version);

            toast.success("Table altered successfully!", {
                description: `Migration ${result.filename} was generated and applied. You can rollback from the Migrations panel if needed.`,
            });
            onOpenChange(false);

            if (onSuccess) {
                onSuccess();
            }
        } catch (error: any) {
            console.error("Failed to create migration:", error);
            toast.error("Failed to create migration", {
                description: error.message || "An unknown error occurred",
            });
        } finally {
            setIsSubmitting(false);
        }
    };

    return {
        operations,
        addOperation,
        removeOperation,
        updateOperation,
        handleSubmit,
        handleClose,
        isSubmitting,
    }

}
