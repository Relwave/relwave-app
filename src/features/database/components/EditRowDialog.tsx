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
import { useEditDialog } from "../hooks/useEditDialog";

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

    const {
        formData,
        nullFields,
        submitting,
        handleInputChange,
        toggleNull,
        handleSubmit,
        columns,
    } = useEditDialog({
        open,
        onOpenChange,
        dbId,
        schemaName,
        tableName,
        primaryKeyColumn,
        rowData,
        onSuccess
    })

    return (
        <Dialog open={open} onOpenChange={onOpenChange}>
            <DialogContent className="sm:max-w-130">
                <DialogHeader>
                    <DialogTitle className="text-base">Edit Row</DialogTitle>
                    <DialogDescription className="text-xs">
                        Editing row in <span className="font-mono">{schemaName}.{tableName}</span>
                        <span className="ml-2 text-muted-foreground">
                            ({primaryKeyColumn}: {String(rowData?.[primaryKeyColumn] ?? "")})
                        </span>
                    </DialogDescription>
                </DialogHeader>

                <ScrollArea className="max-h-100 pr-4">
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
