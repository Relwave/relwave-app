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
import {
    Select,
    SelectContent,
    SelectItem,
    SelectTrigger,
    SelectValue,
} from "@/components/ui/select";
import { ColumnDetails, ForeignKeyInfo } from "@/features/database/types";
import { useInsertDataDialog } from "../hooks/useInsertDataDialog";

interface InsertDataDialogProps {
    open: boolean;
    onOpenChange: (open: boolean) => void;
    dbId: string;
    schemaName: string;
    tableName: string;
    onSuccess?: () => void;
}

interface FKOption {
    value: string;
    label: string;
}

export default function InsertDataDialog({
    open,
    onOpenChange,
    dbId,
    schemaName,
    tableName,
    onSuccess,
}: InsertDataDialogProps) {

    const {
        columns,
        foreignKeys,
        formData,
        nullFields,
        loading,
        submitting,
        getFKForColumn,
        handleInputChange,
        toggleNull,
        handleSubmit,
        getPlaceholder,
        loadingFKs,
        fkOptions
    } = useInsertDataDialog({
        open,
        onOpenChange,
        dbId,
        schemaName,
        tableName,
        onSuccess
    })

    const renderInput = (col: ColumnDetails) => {
        const fk = getFKForColumn(col.name);
        const isNullChecked = nullFields.has(col.name);
        const isLoadingFK = loadingFKs.has(col.name);
        const options = fkOptions[col.name] || [];


        // FK column - show dropdown
        if (fk && options.length > 0) {
            return (
                <Select
                    value={formData[col.name] || ""}
                    onValueChange={(val) => handleInputChange(col.name, val)}
                    disabled={isNullChecked}
                >
                    <SelectTrigger className="text-sm h-8">
                        <SelectValue placeholder={`Select from ${fk.target_table}...`} />
                    </SelectTrigger>
                    <SelectContent>
                        {options.map((opt) => (
                            <SelectItem key={opt.value} value={opt.value} className="text-sm">
                                {opt.label}
                            </SelectItem>
                        ))}
                    </SelectContent>
                </Select>
            );
        }

        // FK column still loading
        if (fk && isLoadingFK) {
            return (
                <div className="flex items-center gap-2 h-8 px-3 border rounded-md bg-muted/30">
                    <Spinner className="h-3 w-3" />
                    <span className="text-xs text-muted-foreground">Loading {fk.target_table}...</span>
                </div>
            );
        }

        // Regular input
        return (
            <Input
                value={formData[col.name] || ""}
                onChange={(e) => handleInputChange(col.name, e.target.value)}
                placeholder={getPlaceholder(col)}
                disabled={isNullChecked}
                className="text-sm h-8"
            />
        );
    };

    return (
        <Dialog open={open} onOpenChange={onOpenChange}>
            <DialogContent className="sm:max-w-130">
                <DialogHeader>
                    <DialogTitle className="text-base">Insert Row</DialogTitle>
                    <DialogDescription className="text-xs">
                        Insert a new row into <span className="font-mono">{schemaName}.{tableName}</span>
                    </DialogDescription>
                </DialogHeader>

                {loading ? (
                    <div className="flex items-center justify-center py-8">
                        <Spinner className="h-6 w-6" />
                    </div>
                ) : (
                    <ScrollArea className="max-h-100 pr-4">
                        <div className="space-y-4 py-4">
                            {columns.map((col) => {
                                const fk = getFKForColumn(col.name);
                                return (
                                    <div key={col.name} className="space-y-2">
                                        <div className="flex items-center justify-between">
                                            <Label className="text-xs font-medium">
                                                {col.name}
                                                {col.nullable && !col.defaultValue && (
                                                    <span className="text-destructive ml-1">*</span>
                                                )}
                                                {col.isPrimaryKey && (
                                                    <span className="text-muted-foreground ml-1 text-[10px]">(PK)</span>
                                                )}
                                                {fk && (
                                                    <span className="text-primary ml-1 text-[10px]">(FK → {fk.target_table})</span>
                                                )}
                                            </Label>
                                            <span className="text-[10px] text-muted-foreground font-mono">
                                                {col.type}
                                            </span>
                                        </div>

                                        <div className="flex items-center gap-2">
                                            <div className="flex-1">
                                                {renderInput(col)}
                                            </div>
                                            {!col.nullable && (
                                                <div className="flex items-center gap-1.5 shrink-0">
                                                    <Checkbox
                                                        id={`null-${col.name}`}
                                                        checked={nullFields.has(col.name)}
                                                        onCheckedChange={(checked) => toggleNull(col.name, !!checked)}
                                                    />
                                                    <Label
                                                        htmlFor={`null-${col.name}`}
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

                            {columns.length === 0 && (
                                <p className="text-sm text-muted-foreground text-center py-4">
                                    No columns found
                                </p>
                            )}
                        </div>
                    </ScrollArea>
                )}

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
                        disabled={submitting || loading || columns.length === 0}
                        size="sm"
                        className="text-xs"
                    >
                        {submitting ? (
                            <>
                                <Spinner className="h-3 w-3 mr-1.5" />
                                Inserting...
                            </>
                        ) : (
                            "Insert Row"
                        )}
                    </Button>
                </DialogFooter>
            </DialogContent>
        </Dialog>
    );
}
