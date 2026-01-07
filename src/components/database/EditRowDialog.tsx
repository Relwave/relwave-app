import { useState, useEffect } from "react";
import { toast } from "sonner";
import {
    Dialog,
    DialogContent,
    DialogDescription,
    DialogFooter,
    DialogHeader,
    DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Spinner } from "@/components/ui/spinner";
import { bridgeApi } from "@/services/bridgeApi";

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

export default function EditRowDialog({
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

            await bridgeApi.updateRow({
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

    return (
        <Dialog open={open} onOpenChange={onOpenChange}>
            <DialogContent className="sm:max-w-[520px]">
                <DialogHeader>
                    <DialogTitle className="text-base">Edit Row</DialogTitle>
                    <DialogDescription className="text-xs">
                        Editing row in <span className="font-mono">{schemaName}.{tableName}</span>
                        <span className="ml-2 text-muted-foreground">
                            ({primaryKeyColumn}: {String(rowData?.[primaryKeyColumn] ?? "")})
                        </span>
                    </DialogDescription>
                </DialogHeader>

                <ScrollArea className="max-h-[400px] pr-4">
                    <div className="space-y-4 py-4">
                        {columns.map((col) => {
                            const isPK = col === primaryKeyColumn;
                            return (
                                <div key={col} className="space-y-2">
                                    <div className="flex items-center justify-between">
                                        <Label className="text-xs font-medium">
                                            {col}
                                            {isPK && (
                                                <span className="text-muted-foreground ml-1 text-[10px]">(PK - readonly)</span>
                                            )}
                                        </Label>
                                    </div>

                                    <div className="flex items-center gap-2">
                                        <Input
                                            value={formData[col] || ""}
                                            onChange={(e) => handleInputChange(col, e.target.value)}
                                            disabled={isPK || nullFields.has(col)}
                                            className="text-sm h-8"
                                        />
                                        {!isPK && (
                                            <div className="flex items-center gap-1.5 shrink-0">
                                                <Checkbox
                                                    id={`null-${col}`}
                                                    checked={nullFields.has(col)}
                                                    onCheckedChange={(checked) => toggleNull(col, !!checked)}
                                                />
                                                <Label
                                                    htmlFor={`null-${col}`}
                                                    className="text-[10px] text-muted-foreground cursor-pointer"
                                                >
                                                    NULL
                                                </Label>
                                            </div>
                                        )}
                                    </div>
                                </div>
                            );
                        })}
                    </div>
                </ScrollArea>

                <DialogFooter>
                    <Button
                        variant="outline"
                        onClick={() => onOpenChange(false)}
                        size="sm"
                        className="text-xs"
                    >
                        Cancel
                    </Button>
                    <Button
                        onClick={handleSubmit}
                        disabled={submitting}
                        size="sm"
                        className="text-xs"
                    >
                        {submitting ? (
                            <>
                                <Spinner className="h-3 w-3 mr-1.5" />
                                Saving...
                            </>
                        ) : (
                            "Save Changes"
                        )}
                    </Button>
                </DialogFooter>
            </DialogContent>
        </Dialog>
    );
}
