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
import { useAddIndexDialog } from "../hooks/useAddIndexDialog";

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
    const {
        handleClose,
        handleSkip,
        handleSubmit,
        addIndex,
        removeIndex,
        updateIndex,
        indexes,
        isSubmitting }
        = useAddIndexDialog({
            onOpenChange,
            dbId,
            schemaName,
            tableName,
            onSuccess
        });

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
                            <div className="space-y-3 max-h-100 overflow-y-auto pr-2">
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
