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
import {
    Select,
    SelectContent,
    SelectItem,
    SelectTrigger,
    SelectValue,
} from "@/components/ui/select";
import { Loader2, AlertTriangle } from "lucide-react";
import { DropMode } from "@/features/database/types";
import useDropTableDialog from "../hooks/useDropTableDialog";

interface DropTableDialogProps {
    open: boolean;
    onOpenChange: (open: boolean) => void;
    dbId: string;
    schemaName: string;
    tableName: string;
    onSuccess?: () => void;
}

export default function DropTableDialog({
    open,
    onOpenChange,
    dbId,
    schemaName,
    tableName,
    onSuccess,
}: DropTableDialogProps) {
    const {
        handleClose,
        handleSubmit,
        setConfirmText,
        setMode,
        mode,
        confirmText,
        isSubmitting
    } = useDropTableDialog({
        open,
        onOpenChange,
        dbId,
        schemaName,
        tableName,
        onSuccess,
    })

    return (
        <Dialog open={open} onOpenChange={handleClose}>
            <DialogContent className="max-w-md">
                <DialogHeader>
                    <DialogTitle className="flex items-center gap-2 text-destructive">
                        <AlertTriangle className="h-5 w-5" />
                        Drop Table
                    </DialogTitle>
                    <DialogDescription>
                        This action cannot be undone. This will permanently delete table{" "}
                        <span className="font-mono font-medium">{tableName}</span> from schema{" "}
                        <span className="font-mono font-medium">{schemaName}</span>.
                        A migration will be created for rollback if needed.
                    </DialogDescription>
                </DialogHeader>

                <div className="space-y-4">
                    {/* Drop Mode Selection */}
                    <div className="space-y-2">
                        <Label htmlFor="drop-mode" className="text-sm font-medium">
                            Drop Mode
                        </Label>
                        <Select value={mode} onValueChange={(value) => setMode(value as DropMode)}>
                            <SelectTrigger id="drop-mode">
                                <SelectValue />
                            </SelectTrigger>
                            <SelectContent>
                                <SelectItem value="RESTRICT">
                                    <div className="flex flex-col items-start">
                                        <span className="font-medium">RESTRICT</span>
                                        <span className="text-xs text-muted-foreground">
                                            Fail if foreign keys reference this table
                                        </span>
                                    </div>
                                </SelectItem>
                                <SelectItem value="DETACH_FKS">
                                    <div className="flex flex-col items-start">
                                        <span className="font-medium">DETACH FKs</span>
                                        <span className="text-xs text-muted-foreground">
                                            Drop dependent foreign keys first
                                        </span>
                                    </div>
                                </SelectItem>
                                <SelectItem value="CASCADE">
                                    <div className="flex flex-col items-start">
                                        <span className="font-medium text-destructive">CASCADE</span>
                                        <span className="text-xs text-muted-foreground">
                                            Drop all dependent objects (dangerous!)
                                        </span>
                                    </div>
                                </SelectItem>
                            </SelectContent>
                        </Select>
                    </div>

                    {/* Confirmation Input */}
                    <div className="space-y-2">
                        <Label htmlFor="confirm-input" className="text-sm font-medium">
                            Type table name to confirm
                        </Label>
                        <Input
                            id="confirm-input"
                            placeholder={tableName}
                            value={confirmText}
                            onChange={(e) => setConfirmText(e.target.value)}
                            className="font-mono"
                        />
                    </div>

                    {/* Warning Box */}
                    <div className="border border-destructive/50 bg-destructive/5 rounded-lg p-4">
                        <p className="text-sm text-destructive">
                            <strong>⚠️ Warning:</strong> This will permanently delete the table and all its data.
                            {mode === "CASCADE" && " CASCADE mode will also drop all dependent objects!"}
                        </p>
                    </div>
                </div>

                <DialogFooter>
                    <Button type="button" variant="outline" onClick={handleClose} disabled={isSubmitting}>
                        Cancel
                    </Button>
                    <Button
                        type="button"
                        variant="destructive"
                        onClick={handleSubmit}
                        disabled={isSubmitting || confirmText !== tableName}
                    >
                        {isSubmitting ? (
                            <>
                                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                                Dropping...
                            </>
                        ) : (
                            "Drop Table"
                        )}
                    </Button>
                </DialogFooter>
            </DialogContent>
        </Dialog>
    );
}
