import { DropMode } from "@/features/database/types";
import { migrationService } from "@/services/bridge/migration";
import { useState } from "react";
import { toast } from "sonner";

interface DropTableDialogProps {
    open: boolean;
    onOpenChange: (open: boolean) => void;
    dbId: string;
    schemaName: string;
    tableName: string;
    onSuccess?: () => void;
}


export default function useDropTableDialog({ onOpenChange, dbId, schemaName, tableName, onSuccess }: DropTableDialogProps) {
    const [mode, setMode] = useState<DropMode>("RESTRICT");
    const [confirmText, setConfirmText] = useState("");
    const [isSubmitting, setIsSubmitting] = useState(false);

    const resetForm = () => {
        setMode("RESTRICT");
        setConfirmText("");
    };

    const handleClose = () => {
        if (!isSubmitting) {
            resetForm();
            onOpenChange(false);
        }
    };

    const handleSubmit = async () => {
        // Validate confirmation
        if (confirmText !== tableName) {
            toast.error("Table name doesn't match", {
                description: `Please type "${tableName}" to confirm deletion.`,
            });
            return;
        }

        setIsSubmitting(true);

        try {
            // Generate migration instead of dropping table directly
            const result = await migrationService.generateDropMigration({
                dbId,
                schemaName,
                tableName,
                mode,
            });

            // Auto-apply the migration immediately
            await migrationService.applyMigration(dbId, result.version);

            toast.success("Table dropped successfully!", {
                description: `Migration ${result.filename} was generated and applied. You can rollback from the Migrations panel if needed.`,
            });

            resetForm();
            onOpenChange(false);

            if (onSuccess) {
                onSuccess();
            }
        } catch (error: any) {
            console.error("Failed to drop table:", error);
            toast.error("Failed to drop table", {
                description: error.message || "An unknown error occurred",
            });
        } finally {
            setIsSubmitting(false);
        }
    };

    return {
        mode,
        setMode,
        confirmText,
        setConfirmText,
        isSubmitting,
        handleClose,
        handleSubmit,
    }
}