import { useState } from "react";
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
import { Loader2, Database, Plus } from "lucide-react";
import { Label } from "@/components/ui/label";
import IndexRow from "./IndexRow";
import { CreateIndexDefinition } from "@/types/database";
import { bridgeApi } from "@/services/bridgeApi";

interface AddIndexesDialogProps {
    open: boolean;
    onOpenChange: (open: boolean) => void;
    dbId: string;
    schemaName: string;
    tableName: string;
    availableColumns: string[];
    onSuccess?: () => void;
}

export default function AddIndexesDialog({
    open,
    onOpenChange,
    dbId,
    schemaName,
    tableName,
    availableColumns,
    onSuccess,
}: AddIndexesDialogProps) {
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

            const res = await bridgeApi.createIndexes({
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

    return (
        <Dialog open={open} onOpenChange={handleClose}>
            <DialogContent className="max-w-3xl max-h-[90vh] overflow-y-auto">
                <DialogHeader>
                    <DialogTitle className="flex items-center gap-2">
                        <Database className="h-5 w-5" />
                        Add Indexes to Table {tableName}
                    </DialogTitle>
                    <DialogDescription>
                        Create indexes for table <span className="font-mono font-medium">{tableName}</span> in schema{" "}
                        <span className="font-mono font-medium">{schemaName}</span>
                    </DialogDescription>
                </DialogHeader>

                <div className="space-y-4">
                    {/* Indexes Section */}
                    <div className="space-y-3">
                        <div className="flex items-center justify-between">
                            <Label className="text-sm font-medium">Indexes</Label>
                            <Button
                                type="button"
                                variant="outline"
                                size="sm"
                                onClick={addIndex}
                                className="h-8 gap-1.5"
                            >
                                <Plus className="h-3.5 w-3.5" />
                                Add Index
                            </Button>
                        </div>

                        {indexes.length === 0 ? (
                            <div className="border border-dashed border-border/50 rounded-lg p-8 text-center">
                                <Database className="h-12 w-12 mx-auto mb-3 text-muted-foreground/50" />
                                <p className="text-sm text-muted-foreground mb-2">
                                    No indexes defined yet
                                </p>
                                <p className="text-xs text-muted-foreground">
                                    Indexes improve query performance. Click "Add Index" to get started.
                                </p>
                            </div>
                        ) : (
                            <div className="space-y-3 max-h-[400px] overflow-y-auto pr-2">
                                {indexes.map((idx, index) => (
                                    <IndexRow
                                        key={index}
                                        index={idx}
                                        indexIndex={index}
                                        onUpdate={updateIndex}
                                        onRemove={removeIndex}
                                        availableColumns={availableColumns}
                                        tableName={tableName}
                                    />
                                ))}
                            </div>
                        )}
                    </div>

                    {/* Info box */}
                    <div className="border border-blue-500/20 bg-blue-500/5 rounded-lg p-4">
                        <p className="text-sm text-muted-foreground">
                            <strong className="text-foreground">💡 Tip:</strong> You can add indexes now or skip and add them later.
                            Indexes improve query performance but may slow down write operations.
                        </p>
                    </div>
                </div>

                <DialogFooter className="gap-2">
                    <Button
                        type="button"
                        variant="ghost"
                        onClick={handleSkip}
                        disabled={isSubmitting}
                    >
                        Skip for Now
                    </Button>
                    <Button
                        type="button"
                        variant="outline"
                        onClick={handleClose}
                        disabled={isSubmitting}
                    >
                        Cancel
                    </Button>
                    <Button
                        type="button"
                        onClick={handleSubmit}
                        disabled={isSubmitting || indexes.length === 0}
                    >
                        {isSubmitting ? (
                            <>
                                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                                Creating...
                            </>
                        ) : (
                            `Create ${indexes.length} Index${indexes.length !== 1 ? "es" : ""}`
                        )}
                    </Button>
                </DialogFooter>
            </DialogContent>
        </Dialog>
    );
}
