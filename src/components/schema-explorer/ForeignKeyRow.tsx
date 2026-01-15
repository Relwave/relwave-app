import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Trash2 } from "lucide-react";
import { ForeignKeyConstraint } from "@/types/database";

const REFERENTIAL_ACTIONS = [
    { value: "CASCADE", label: "CASCADE" },
    { value: "SET NULL", label: "SET NULL" },
    { value: "RESTRICT", label: "RESTRICT" },
    { value: "NO ACTION", label: "NO ACTION" },
    { value: "SET DEFAULT", label: "SET DEFAULT" },
];

interface ForeignKeyRowProps {
    foreignKey: ForeignKeyConstraint;
    index: number;
    onUpdate: (index: number, field: keyof ForeignKeyConstraint, value: string) => void;
    onRemove: (index: number) => void;
    availableColumns: string[];
    availableTables: Array<{ schema: string; name: string }>;
    currentSchema: string;
}

export default function ForeignKeyRow({
    foreignKey,
    index,
    onUpdate,
    onRemove,
    availableColumns,
    availableTables,
    currentSchema,
}: ForeignKeyRowProps) {
    return (
        <div className="border border-border/50 rounded-lg p-4 space-y-3 bg-card/50">
            {/* FK Header */}
            <div className="flex items-center justify-between">
                <span className="text-xs font-medium text-muted-foreground">
                    Foreign Key {index + 1}
                </span>
                <Button
                    type="button"
                    variant="ghost"
                    size="icon"
                    onClick={() => onRemove(index)}
                    className="h-7 w-7 text-destructive hover:text-destructive hover:bg-destructive/10"
                >
                    <Trash2 className="h-3.5 w-3.5" />
                </Button>
            </div>

            {/* FK Fields */}
            <div className="grid grid-cols-2 gap-3">
                {/* Constraint Name */}
                <div className="space-y-1.5 col-span-2">
                    <Label htmlFor={`fk-name-${index}`} className="text-xs">
                        Constraint Name
                    </Label>
                    <Input
                        id={`fk-name-${index}`}
                        placeholder="fk_users_role_id"
                        value={foreignKey.constraint_name}
                        onChange={(e) => onUpdate(index, "constraint_name", e.target.value)}
                        className="h-9 font-mono text-sm"
                    />
                </div>

                {/* Source Column */}
                <div className="space-y-1.5">
                    <Label htmlFor={`fk-source-col-${index}`} className="text-xs">
                        Source Column
                    </Label>
                    <Select
                        value={foreignKey.source_column}
                        onValueChange={(value) => onUpdate(index, "source_column", value)}
                    >
                        <SelectTrigger id={`fk-source-col-${index}`} className="h-9 text-sm">
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

                {/* Target Table */}
                <div className="space-y-1.5">
                    <Label htmlFor={`fk-target-table-${index}`} className="text-xs">
                        References Table
                    </Label>
                    <Select
                        value={foreignKey.target_table}
                        onValueChange={(value) => onUpdate(index, "target_table", value)}
                    >
                        <SelectTrigger id={`fk-target-table-${index}`} className="h-9 text-sm">
                            <SelectValue placeholder="Select table" />
                        </SelectTrigger>
                        <SelectContent>
                            {availableTables.map((table) => (
                                <SelectItem key={`${table.schema}.${table.name}`} value={table.name}>
                                    {table.schema !== currentSchema ? `${table.schema}.${table.name}` : table.name}
                                </SelectItem>
                            ))}
                        </SelectContent>
                    </Select>
                </div>

                {/* Target Column */}
                <div className="space-y-1.5">
                    <Label htmlFor={`fk-target-col-${index}`} className="text-xs">
                        References Column
                    </Label>
                    <Input
                        id={`fk-target-col-${index}`}
                        placeholder="id"
                        value={foreignKey.target_column}
                        onChange={(e) => onUpdate(index, "target_column", e.target.value)}
                        className="h-9 font-mono text-sm"
                    />
                </div>

                {/* ON DELETE */}
                <div className="space-y-1.5">
                    <Label htmlFor={`fk-on-delete-${index}`} className="text-xs">
                        ON DELETE
                    </Label>
                    <Select
                        value={foreignKey.delete_rule || ""}
                        onValueChange={(value) => onUpdate(index, "delete_rule", value)}
                    >
                        <SelectTrigger id={`fk-on-delete-${index}`} className="h-9 text-sm">
                            <SelectValue placeholder="Select action" />
                        </SelectTrigger>
                        <SelectContent>
                            {REFERENTIAL_ACTIONS.map((action) => (
                                <SelectItem key={action.value} value={action.value}>
                                    {action.label}
                                </SelectItem>
                            ))}
                        </SelectContent>
                    </Select>
                </div>

                {/* ON UPDATE */}
                <div className="space-y-1.5">
                    <Label htmlFor={`fk-on-update-${index}`} className="text-xs">
                        ON UPDATE
                    </Label>
                    <Select
                        value={foreignKey.update_rule || ""}
                        onValueChange={(value) => onUpdate(index, "update_rule", value)}
                    >
                        <SelectTrigger id={`fk-on-update-${index}`} className="h-9 text-sm">
                            <SelectValue placeholder="Select action" />
                        </SelectTrigger>
                        <SelectContent>
                            {REFERENTIAL_ACTIONS.map((action) => (
                                <SelectItem key={action.value} value={action.value}>
                                    {action.label}
                                </SelectItem>
                            ))}
                        </SelectContent>
                    </Select>
                </div>
            </div>
        </div>
    );
}
