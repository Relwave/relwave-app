import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Checkbox } from "@/components/ui/checkbox";
import { Trash2 } from "lucide-react";
import { CreateIndexDefinition } from "@/types/database";

const INDEX_TYPES = [
    { value: "BTREE", label: "BTREE" },
    { value: "HASH", label: "HASH" },
    { value: "GIN", label: "GIN" },
    { value: "GIST", label: "GIST" },
];

interface IndexRowProps {
    index: CreateIndexDefinition;
    indexIndex: number;
    onUpdate: (index: number, field: keyof CreateIndexDefinition, value: any) => void;
    onRemove: (index: number) => void;
    availableColumns: string[];
    tableName: string;
}

export default function IndexRow({
    index,
    indexIndex,
    onUpdate,
    onRemove,
    availableColumns,
}: IndexRowProps) {
    return (
        <div className="border border-border/50 rounded-lg p-4 space-y-3 bg-card/50">
            {/* Index Header */}
            <div className="flex items-center justify-between">
                <span className="text-xs font-medium text-muted-foreground">
                    Index {indexIndex + 1}
                </span>
                <Button
                    type="button"
                    variant="ghost"
                    size="icon"
                    onClick={() => onRemove(indexIndex)}
                    className="h-7 w-7 text-destructive hover:text-destructive hover:bg-destructive/10"
                >
                    <Trash2 className="h-3.5 w-3.5" />
                </Button>
            </div>

            {/* Index Fields */}
            <div className="grid grid-cols-2 gap-3">
                {/* Index Name */}
                <div className="space-y-1.5">
                    <Label htmlFor={`idx-name-${indexIndex}`} className="text-xs">
                        Index Name
                    </Label>
                    <Input
                        id={`idx-name-${indexIndex}`}
                        placeholder="idx_users_email"
                        value={index.index_name}
                        onChange={(e) => onUpdate(indexIndex, "index_name", e.target.value)}
                        className="h-9 font-mono text-sm"
                    />
                </div>

                {/* Column */}
                <div className="space-y-1.5">
                    <Label htmlFor={`idx-column-${indexIndex}`} className="text-xs">
                        Column
                    </Label>
                    <Select
                        value={index.column_name}
                        onValueChange={(value) => onUpdate(indexIndex, "column_name", value)}
                    >
                        <SelectTrigger id={`idx-column-${indexIndex}`} className="h-9 text-sm">
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

                {/* Index Type */}
                <div className="space-y-1.5">
                    <Label htmlFor={`idx-type-${indexIndex}`} className="text-xs">
                        Index Type
                    </Label>
                    <Select
                        value={index.index_type || "BTREE"}
                        onValueChange={(value) => onUpdate(indexIndex, "index_type", value)}
                    >
                        <SelectTrigger id={`idx-type-${indexIndex}`} className="h-9 text-sm">
                            <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                            {INDEX_TYPES.map((type) => (
                                <SelectItem key={type.value} value={type.value}>
                                    {type.label}
                                </SelectItem>
                            ))}
                        </SelectContent>
                    </Select>
                </div>

                {/* Unique Checkbox */}
                <div className="space-y-1.5 flex items-end pb-2">
                    <div className="flex items-center space-x-2">
                        <Checkbox
                            id={`idx-unique-${indexIndex}`}
                            checked={index.is_unique}
                            onCheckedChange={(checked) =>
                                onUpdate(indexIndex, "is_unique", checked === true)
                            }
                        />
                        <Label
                            htmlFor={`idx-unique-${indexIndex}`}
                            className="text-xs font-normal cursor-pointer"
                        >
                            Unique Index
                        </Label>
                    </div>
                </div>

                {/* Predicate (WHERE clause for partial indexes) */}
                <div className="space-y-1.5 col-span-2">
                    <Label htmlFor={`idx-predicate-${indexIndex}`} className="text-xs">
                        WHERE Clause (optional - for partial indexes)
                    </Label>
                    <Input
                        id={`idx-predicate-${indexIndex}`}
                        placeholder="e.g., status = 'active'"
                        value={index.predicate || ""}
                        onChange={(e) => onUpdate(indexIndex, "predicate", e.target.value)}
                        className="h-9 font-mono text-sm"
                    />
                </div>
            </div>
        </div>
    );
}
