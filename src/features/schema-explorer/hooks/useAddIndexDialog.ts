import { CreateIndexDefinition } from "@/features/database/types";
import { databaseService } from "@/services/bridge/database";
import { useState } from "react";
import { toast } from "sonner";


interface AddIndexesDialogProps {
    onOpenChange: (open: boolean) => void;
    dbId: string;
    schemaName: string;
    tableName: string;
    onSuccess?: () => void;
}


export function useAddIndexDialog({ onOpenChange, dbId, schemaName, tableName, onSuccess }: AddIndexesDialogProps) {
    const [indexes, setIndexes] = useState<CreateIndexDefinition[]>([]);
    const [isSubmitting, setIsSubmitting] = useState(false);

    const resetForm = () => {
        setIndexes([]);
    };

    const handleClose = () => {
        if (!isSubmitting) {
            resetForm();
            onOpenChange(false);
        }
    };

    const addIndex = () => {
        const newIndex: CreateIndexDefinition = {
            table_name: tableName,
            index_name: "",
            column_name: "",
            is_unique: false,
            is_primary: false,
            index_type: "BTREE",
        };
        setIndexes([...indexes, newIndex]);
    };

    const removeIndex = (index: number) => {
        setIndexes(indexes.filter((_, i) => i !== index));
    };

    const updateIndex = (index: number, field: keyof CreateIndexDefinition, value: any) => {
        const updated = indexes.map((idx, i) => {
            if (i === index) {
                return { ...idx, [field]: value };
            }
            return idx;
        });
        setIndexes(updated);
    };

    const validateForm = (): boolean => {
        if (indexes.length === 0) {
            toast.error("At least one index is required");
            return false;
        }

        // Validate indexes
        for (let i = 0; i < indexes.length; i++) {
            const idx = indexes[i];
            if (!idx.index_name.trim()) {
                toast.error(`Index ${i + 1}: Index name is required`);
                return false;
            }
            if (!idx.column_name.trim()) {
                toast.error(`Index ${i + 1}: Column is required`);
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
            // Prepare indexes with updated table name
            const preparedIndexes = indexes.map((idx) => ({
                ...idx,
                table_name: tableName.trim(),
            }));

            const res = await databaseService.createIndexes({
                dbId,
                schemaName,
                indexes: preparedIndexes,
            });

            toast.success("Indexes created successfully", {
                description: `${indexes.length} index(es) created for table "${tableName}".`,
            });

            resetForm();
            onOpenChange(false);

            if (onSuccess) {
                onSuccess();
            }
        } catch (error: any) {
            console.error("Failed to create indexes:", error);
            toast.error("Failed to create indexes", {
                description: error.message || "An unknown error occurred",
            });
        } finally {
            setIsSubmitting(false);
        }
    };

    const handleSkip = () => {
        resetForm();
        onOpenChange(false);
        if (onSuccess) {
            onSuccess();
        }
    };

    return {
        indexes,
        isSubmitting,
        addIndex,
        removeIndex,
        updateIndex,
        handleSubmit,
        handleClose,
        handleSkip,
    };

}