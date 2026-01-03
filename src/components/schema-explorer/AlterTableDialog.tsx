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
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
    Select,
    SelectContent,
    SelectItem,
    SelectTrigger,
    SelectValue,
} from "@/components/ui/select";
import { Loader2, Settings, Plus, Trash2 } from "lucide-react";
import { Checkbox } from "@/components/ui/checkbox";
import { AlterTableOperation, CreateTableColumn } from "@/types/database";
import { bridgeApi } from "@/services/bridgeApi";

const DATA_TYPES = [
    { value: "INT", label: "Integer" },
    { value: "BIGINT", label: "Big Integer" },
    { value: "TEXT", label: "Text" },
    { value: "BOOLEAN", label: "Boolean" },
    { value: "TIMESTAMP", label: "Timestamp" },
    { value: "JSON", label: "JSON" },
];

const OPERATION_TYPES = [
    { value: "ADD_COLUMN", label: "Add Column" },
    { value: "DROP_COLUMN", label: "Drop Column" },
    { value: "RENAME_COLUMN", label: "Rename Column" },
    { value: "ALTER_TYPE", label: "Change Column Type" },
    { value: "SET_NOT_NULL", label: "Set NOT NULL" },
    { value: "DROP_NOT_NULL", label: "Drop NOT NULL" },
    { value: "SET_DEFAULT", label: "Set DEFAULT" },
    { value: "DROP_DEFAULT", label: "Drop DEFAULT" },
];

interface AlterTableDialogProps {
    open: boolean;
    onOpenChange: (open: boolean) => void;
    dbId: string;
    schemaName: string;
    tableName: string;
    availableColumns: string[];
    onSuccess?: () => void;
}

export default function AlterTableDialog({
    open,
    onOpenChange,
    dbId,
    schemaName,
    tableName,
    availableColumns,
    onSuccess,
}: AlterTableDialogProps) {
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
            await bridgeApi.alterTable({
                dbId,
                schemaName,
                tableName,
                operations,
            });

            toast.success("Table altered successfully", {
                description: `Applied ${operations.length} operation(s) to table "${tableName}".`,
            });

            resetForm();
            onOpenChange(false);

            if (onSuccess) {
                onSuccess();
            }
        } catch (error: any) {
            console.error("Failed to alter table:", error);
            toast.error("Failed to alter table", {
                description: error.message || "An unknown error occurred",
            });
        } finally {
            setIsSubmitting(false);
        }
    };

    return (
        <Dialog open={open} onOpenChange={handleClose}>
            <DialogContent className="max-w-3xl max-h-[90vh] overflow-y-auto">
                <DialogHeader>
                    <DialogTitle className="flex items-center gap-2">
                        <Settings className="h-5 w-5" />
                        Alter Table: {tableName}
                    </DialogTitle>
                    <DialogDescription>
                        Modify the structure of table <span className="font-mono font-medium">{tableName}</span>{" "}
                        in schema <span className="font-mono font-medium">{schemaName}</span>
                    </DialogDescription>
                </DialogHeader>

                <div className="space-y-4">
                    {/* Operations List */}
                    <div className="space-y-3">
                        <div className="flex items-center justify-between">
                            <Label className="text-sm font-medium">Operations</Label>
                            <Button
                                type="button"
                                variant="outline"
                                size="sm"
                                onClick={addOperation}
                                className="h-8 gap-1.5"
                            >
                                <Plus className="h-3.5 w-3.5" />
                                Add Operation
                            </Button>
                        </div>

                        {operations.length === 0 ? (
                            <div className="border border-dashed border-border/50 rounded-lg p-8 text-center">
                                <Settings className="h-12 w-12 mx-auto mb-3 text-muted-foreground/50" />
                                <p className="text-sm text-muted-foreground mb-2">
                                    No operations defined yet
                                </p>
                                <p className="text-xs text-muted-foreground">
                                    Click "Add Operation" to modify the table structure
                                </p>
                            </div>
                        ) : (
                            <div className="space-y-3 max-h-[400px] overflow-y-auto pr-2">
                                {operations.map((op, index) => (
                                    <OperationRow
                                        key={index}
                                        operation={op}
                                        index={index}
                                        availableColumns={availableColumns}
                                        onUpdate={(newOp) => updateOperation(index, newOp)}
                                        onRemove={() => removeOperation(index)}
                                    />
                                ))}
                            </div>
                        )}
                    </div>
                </div>

                <DialogFooter className="gap-2">
                    <Button type="button" variant="outline" onClick={handleClose} disabled={isSubmitting}>
                        Cancel
                    </Button>
                    <Button
                        type="button"
                        onClick={handleSubmit}
                        disabled={isSubmitting || operations.length === 0}
                    >
                        {isSubmitting ? (
                            <>
                                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                                Applying...
                            </>
                        ) : (
                            `Apply ${operations.length} Operation${operations.length !== 1 ? "s" : ""}`
                        )}
                    </Button>
                </DialogFooter>
            </DialogContent>
        </Dialog>
    );
}

// Operation Row Component
interface OperationRowProps {
    operation: AlterTableOperation;
    index: number;
    availableColumns: string[];
    onUpdate: (operation: AlterTableOperation) => void;
    onRemove: () => void;
}

function OperationRow({ operation, index, availableColumns, onUpdate, onRemove }: OperationRowProps) {
    const updateType = (newType: string) => {
        // Create a new operation based on type
        let newOp: AlterTableOperation;

        switch (newType) {
            case "ADD_COLUMN":
                newOp = {
                    type: "ADD_COLUMN",
                    column: {
                        name: "",
                        type: "TEXT",
                        not_nullable: false,
                        is_primary_key: false,
                        default_value: "",
                    },
                };
                break;
            case "DROP_COLUMN":
                newOp = { type: "DROP_COLUMN", column_name: "" };
                break;
            case "RENAME_COLUMN":
                newOp = { type: "RENAME_COLUMN", from: "", to: "" };
                break;
            case "ALTER_TYPE":
                newOp = { type: "ALTER_TYPE", column_name: "", new_type: "TEXT" };
                break;
            case "SET_NOT_NULL":
                newOp = { type: "SET_NOT_NULL", column_name: "", new_type: "TEXT" };
                break;
            case "DROP_NOT_NULL":
                newOp = { type: "DROP_NOT_NULL", column_name: "", new_type: "TEXT" };
                break;
            case "SET_DEFAULT":
                newOp = { type: "SET_DEFAULT", column_name: "", default_value: "" };
                break;
            case "DROP_DEFAULT":
                newOp = { type: "DROP_DEFAULT", column_name: "" };
                break;
            default:
                return;
        }

        onUpdate(newOp);
    };

    return (
        <div className="border border-border/50 rounded-lg p-4 space-y-3 bg-card/50">
            {/* Header */}
            <div className="flex items-center justify-between">
                <span className="text-xs font-medium text-muted-foreground">Operation {index + 1}</span>
                <Button
                    type="button"
                    variant="ghost"
                    size="icon"
                    onClick={onRemove}
                    className="h-7 w-7 text-destructive hover:text-destructive hover:bg-destructive/10"
                >
                    <Trash2 className="h-3.5 w-3.5" />
                </Button>
            </div>

            {/* Operation Type Selector */}
            <div className="space-y-1.5">
                <Label className="text-xs">Operation Type</Label>
                <Select value={operation.type} onValueChange={updateType}>
                    <SelectTrigger className="h-9 text-sm">
                        <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                        {OPERATION_TYPES.map((type) => (
                            <SelectItem key={type.value} value={type.value}>
                                {type.label}
                            </SelectItem>
                        ))}
                    </SelectContent>
                </Select>
            </div>

            {/* Operation-specific fields */}
            {operation.type === "ADD_COLUMN" && (
                <AddColumnFields
                    column={operation.column}
                    onChange={(column) => onUpdate({ ...operation, column })}
                />
            )}

            {operation.type === "DROP_COLUMN" && (
                <ColumnSelector
                    label="Column to Drop"
                    value={operation.column_name}
                    availableColumns={availableColumns}
                    onChange={(column_name) => onUpdate({ ...operation, column_name })}
                />
            )}

            {operation.type === "RENAME_COLUMN" && (
                <div className="grid grid-cols-2 gap-3">
                    <div className="space-y-1.5">
                        <Label className="text-xs">From</Label>
                        <Select
                            value={operation.from}
                            onValueChange={(from) => onUpdate({ ...operation, from })}
                        >
                            <SelectTrigger className="h-9 text-sm">
                                <SelectValue placeholder="Select column" />
                            </SelectTrigger>
                            <SelectContent>
                                {availableColumns.map((col) => (
                                    <SelectItem key={col} value={col}>
                                        {col}
                                    </SelectItem>
                                ))}
                            </SelectContent>
                        </Select>
                    </div>
                    <div className="space-y-1.5">
                        <Label className="text-xs">To</Label>
                        <Input
                            placeholder="new_name"
                            value={operation.to}
                            onChange={(e) => onUpdate({ ...operation, to: e.target.value })}
                            className="h-9 font-mono text-sm"
                        />
                    </div>
                </div>
            )}

            {operation.type === "ALTER_TYPE" && (
                <div className="grid grid-cols-2 gap-3">
                    <ColumnSelector
                        label="Column"
                        value={operation.column_name}
                        availableColumns={availableColumns}
                        onChange={(column_name) => onUpdate({ ...operation, column_name })}
                    />
                    <div className="space-y-1.5">
                        <Label className="text-xs">New Type</Label>
                        <Select
                            value={operation.new_type}
                            onValueChange={(new_type) => onUpdate({ ...operation, new_type })}
                        >
                            <SelectTrigger className="h-9 text-sm">
                                <SelectValue />
                            </SelectTrigger>
                            <SelectContent>
                                {DATA_TYPES.map((type) => (
                                    <SelectItem key={type.value} value={type.value}>
                                        {type.label}
                                    </SelectItem>
                                ))}
                            </SelectContent>
                        </Select>
                    </div>
                </div>
            )}

            {(operation.type === "SET_NOT_NULL" || operation.type === "DROP_NOT_NULL") && (
                <div className="grid grid-cols-2 gap-3">
                    <ColumnSelector
                        label="Column"
                        value={operation.column_name}
                        availableColumns={availableColumns}
                        onChange={(column_name) => onUpdate({ ...operation, column_name })}
                    />
                    <div className="space-y-1.5">
                        <Label className="text-xs">Column Type</Label>
                        <Select
                            value={operation.new_type}
                            onValueChange={(new_type) => onUpdate({ ...operation, new_type })}
                        >
                            <SelectTrigger className="h-9 text-sm">
                                <SelectValue placeholder="Select type" />
                            </SelectTrigger>
                            <SelectContent>
                                {DATA_TYPES.map((type) => (
                                    <SelectItem key={type.value} value={type.value}>
                                        {type.label}
                                    </SelectItem>
                                ))}
                            </SelectContent>
                        </Select>
                        <p className="text-xs text-muted-foreground">
                            MySQL requires type for NULL constraint changes
                        </p>
                    </div>
                </div>
            )}

            {operation.type === "SET_DEFAULT" && (
                <div className="grid grid-cols-2 gap-3">
                    <ColumnSelector
                        label="Column"
                        value={operation.column_name}
                        availableColumns={availableColumns}
                        onChange={(column_name) => onUpdate({ ...operation, column_name })}
                    />
                    <div className="space-y-1.5">
                        <Label className="text-xs">Default Value</Label>
                        <Input
                            placeholder="e.g., 'value', 0, NULL"
                            value={operation.default_value}
                            onChange={(e) => onUpdate({ ...operation, default_value: e.target.value })}
                            className="h-9 font-mono text-sm"
                        />
                    </div>
                </div>
            )}

            {operation.type === "DROP_DEFAULT" && (
                <ColumnSelector
                    label="Column"
                    value={operation.column_name}
                    availableColumns={availableColumns}
                    onChange={(column_name) => onUpdate({ ...operation, column_name })}
                />
            )}
        </div>
    );
}

// Helper Components
function AddColumnFields({
    column,
    onChange,
}: {
    column: CreateTableColumn;
    onChange: (column: CreateTableColumn) => void;
}) {
    return (
        <div className="space-y-3">
            <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1.5">
                    <Label className="text-xs">Column Name</Label>
                    <Input
                        placeholder="column_name"
                        value={column.name}
                        onChange={(e) => onChange({ ...column, name: e.target.value })}
                        className="h-9 font-mono text-sm"
                    />
                </div>
                <div className="space-y-1.5">
                    <Label className="text-xs">Type</Label>
                    <Select value={column.type} onValueChange={(type) => onChange({ ...column, type })}>
                        <SelectTrigger className="h-9 text-sm">
                            <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                            {DATA_TYPES.map((type) => (
                                <SelectItem key={type.value} value={type.value}>
                                    {type.label}
                                </SelectItem>
                            ))}
                        </SelectContent>
                    </Select>
                </div>
            </div>
            <div className="space-y-1.5">
                <Label className="text-xs">Default Value (optional)</Label>
                <Input
                    placeholder="e.g., NULL, 'value', 0"
                    value={column.default_value || ""}
                    onChange={(e) => onChange({ ...column, default_value: e.target.value })}
                    className="h-9 font-mono text-sm"
                />
            </div>
            <div className="flex items-center space-x-2">
                <Checkbox
                    checked={column.not_nullable}
                    onCheckedChange={(checked) => onChange({ ...column, not_nullable: checked === true })}
                />
                <Label className="text-xs font-normal cursor-pointer">NOT NULL</Label>
            </div>
        </div>
    );
}

function ColumnSelector({
    label,
    value,
    availableColumns,
    onChange,
}: {
    label: string;
    value?: string;
    availableColumns: string[];
    onChange: (value: string) => void;
}) {
    return (
        <div className="space-y-1.5">
            <Label className="text-xs">{label}</Label>
            <Select value={value} onValueChange={onChange}>
                <SelectTrigger className="h-9 text-sm">
                    <SelectValue placeholder="Select column" />
                </SelectTrigger>
                <SelectContent>
                    {availableColumns.map((col) => (
                        <SelectItem key={col} value={col}>
                            {col}
                        </SelectItem>
                    ))}
                </SelectContent>
            </Select>
        </div>
    );
}
