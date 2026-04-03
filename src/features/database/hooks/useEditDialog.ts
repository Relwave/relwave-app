import { useState, useEffect } from "react";
import { databaseService } from "@/services/bridge/database";
import { toast } from "sonner";

interface EditRowDialogProps {
    open: boolean;
    onOpenChange: (open: boolean) => void;
    dbId: string;
    schemaName: string;
    tableName: string;
    primaryKeyColumn: string;
    rowData: Record<string, any>;
    onSuccess?: () => void;
}

export function useEditDialog({
    open,
    onOpenChange,
    dbId,
    schemaName,
    tableName,
    primaryKeyColumn,
    rowData,
    onSuccess,
}: EditRowDialogProps) {
    const [formData, setFormData] = useState<Record<string, string>>({});
    const [nullFields, setNullFields] = useState<Set<string>>(new Set());
    const [submitting, setSubmitting] = useState(false);

    // Initialize form data when dialog opens
    useEffect(() => {
        if (open && rowData) {
            const initial: Record<string, string> = {};
            const nulls = new Set<string>();

            Object.entries(rowData).forEach(([key, value]) => {
                if (value === null) {
                    nulls.add(key);
                    initial[key] = "";
                } else if (typeof value === "object") {
                    initial[key] = JSON.stringify(value);
                } else {
                    initial[key] = String(value);
                }
            });

            setFormData(initial);
            setNullFields(nulls);
        }
    }, [open, rowData]);

    const handleInputChange = (columnName: string, value: string) => {
        setFormData(prev => ({ ...prev, [columnName]: value }));
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
            const updatedData: Record<string, any> = {};
            const primaryKeyValue = rowData[primaryKeyColumn];

            Object.keys(formData).forEach(key => {
                // Skip primary key in update data
                if (key === primaryKeyColumn) return;

                if (nullFields.has(key)) {
                    updatedData[key] = null;
                } else {
                    const value = formData[key];
                    const originalValue = rowData[key];

                    // Try to preserve original type
                    if (typeof originalValue === "number") {
                        const num = parseFloat(value);
                        updatedData[key] = isNaN(num) ? value : num;
                    } else if (typeof originalValue === "boolean") {
                        updatedData[key] = value.toLowerCase() === "true" || value === "1";
                    } else if (typeof originalValue === "object" && originalValue !== null) {
                        try {
                            updatedData[key] = JSON.parse(value);
                        } catch {
                            updatedData[key] = value;
                        }
                    } else {
                        updatedData[key] = value;
                    }
                }
            });

            await databaseService.updateRow({
                dbId,
                schemaName,
                tableName,
                primaryKeyColumn,
                primaryKeyValue,
                rowData: updatedData,
            });

            toast.success("Row updated successfully");
            onOpenChange(false);
            onSuccess?.();
        } catch (error: any) {
            toast.error(error.message || "Failed to update row");
        } finally {
            setSubmitting(false);
        }
    };

    const columns = Object.keys(rowData || {});

    return {
        formData,
        nullFields,
        submitting,
        handleInputChange,
        toggleNull,
        handleSubmit,
        columns,
    }
}