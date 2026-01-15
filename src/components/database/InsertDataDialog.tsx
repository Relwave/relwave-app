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
import {
    Select,
    SelectContent,
    SelectItem,
    SelectTrigger,
    SelectValue,
} from "@/components/ui/select";
import { bridgeApi } from "@/services/bridgeApi";
import { ColumnDetails, ForeignKeyInfo } from "@/types/database";

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
    const [columns, setColumns] = useState<ColumnDetails[]>([]);
    const [foreignKeys, setForeignKeys] = useState<ForeignKeyInfo[]>([]);
    const [formData, setFormData] = useState<Record<string, string>>({});
    const [nullFields, setNullFields] = useState<Set<string>>(new Set());
    const [loading, setLoading] = useState(false);
    const [submitting, setSubmitting] = useState(false);

    // FK lookup values cache
    const [fkOptions, setFkOptions] = useState<Record<string, FKOption[]>>({});
    const [loadingFKs, setLoadingFKs] = useState<Set<string>>(new Set());

    // Reset state when dialog closes
    useEffect(() => {
        if (!open) {
            setColumns([]);
            setForeignKeys([]);
            setFormData({});
            setNullFields(new Set());
            setFkOptions({});
            setLoadingFKs(new Set());
        }
    }, [open]);

    // Fetch schema when dialog opens
    useEffect(() => {
        if (open && dbId && schemaName && tableName) {
            fetchTableInfo();
        }
    }, [open, dbId, schemaName, tableName]);

    const fetchTableInfo = async () => {
        setLoading(true);
        try {
            const schemaData = await bridgeApi.getSchema(dbId);
            if (!schemaData) {
                throw new Error("Failed to fetch schema");
            }

            // Find the target table in schema
            const schema = schemaData.schemas.find(s => s.name === schemaName);
            const table = schema?.tables.find(t => t.name === tableName);

            if (!table) {
                throw new Error(`Table ${schemaName}.${tableName} not found`);
            }

            setColumns(table.columns || []);
            setForeignKeys(table.foreignKeys || []);

            // Initialize form data with empty strings
            const initialData: Record<string, string> = {};
            table.columns?.forEach((col) => {
                initialData[col.name] = "";
            });
            setFormData(initialData);

            // Load FK options for each FK column
            const fkMap: Record<string, ForeignKeyInfo> = {};
            table.foreignKeys?.forEach(fk => {
                fkMap[fk.source_column] = fk;
            });

            // Fetch FK reference values
            for (const fk of table.foreignKeys || []) {
                loadFKOptions(fk);
            }
        } catch (error) {
            toast.error("Failed to fetch table information");
            console.error(error);
        } finally {
            setLoading(false);
        }
    };

    const loadFKOptions = async (fk: ForeignKeyInfo) => {
        const key = fk.source_column;
        setLoadingFKs(prev => new Set(prev).add(key));

        try {
            // Fetch first 100 rows from referenced table
            const result = await bridgeApi.fetchTableData(
                dbId,
                fk.target_schema,
                fk.target_table,
                100,
                1
            );

            const options: FKOption[] = result.rows.map(row => {
                const value = String(row[fk.target_column] ?? "");
                // Try to show a more descriptive label if there's a name column
                const nameCol = Object.keys(row).find(k =>
                    k.toLowerCase().includes('name') ||
                    k.toLowerCase().includes('title')
                );
                const label = nameCol ? `${value} - ${row[nameCol]}` : value;
                return { value, label };
            });

            setFkOptions(prev => ({ ...prev, [key]: options }));
        } catch (error) {
            console.error(`Failed to load FK options for ${fk.target_table}:`, error);
            setFkOptions(prev => ({ ...prev, [key]: [] }));
        } finally {
            setLoadingFKs(prev => {
                const next = new Set(prev);
                next.delete(key);
                return next;
            });
        }
    };

    const getFKForColumn = (columnName: string): ForeignKeyInfo | undefined => {
        return foreignKeys.find(fk => fk.source_column === columnName);
    };

    const handleInputChange = (columnName: string, value: string) => {
        setFormData(prev => ({ ...prev, [columnName]: value }));
        // If user types something, remove from null fields
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
            const rowData: Record<string, any> = {};

            for (const col of columns) {
                const value = formData[col.name];
                const isNull = nullFields.has(col.name);

                if (isNull) {
                    rowData[col.name] = null;
                } else if (value === "") {
                    // Skip empty fields - let DB use defaults or error
                    if (col.defaultValue) {
                        continue;
                    }
                    if (!col.nullable) {
                        continue;
                    }
                    // Required field with no value - let DB handle
                    continue;
                } else {
                    rowData[col.name] = parseValue(value, col.type);
                }
            }

            await bridgeApi.insertRow({
                dbId,
                schemaName,
                tableName,
                rowData,
            });

            toast.success("Row inserted successfully");
            onOpenChange(false);
            onSuccess?.();
        } catch (error: any) {
            toast.error(error.message || "Failed to insert row");
        } finally {
            setSubmitting(false);
        }
    };

    const parseValue = (value: string, type: string): any => {
        const lowerType = type.toLowerCase();

        if (lowerType.includes("int") || lowerType.includes("serial")) {
            const num = parseInt(value, 10);
            return isNaN(num) ? value : num;
        }
        if (lowerType.includes("float") || lowerType.includes("double") ||
            lowerType.includes("decimal") || lowerType.includes("numeric") ||
            lowerType.includes("real")) {
            const num = parseFloat(value);
            return isNaN(num) ? value : num;
        }
        if (lowerType.includes("bool")) {
            return value.toLowerCase() === "true" || value === "1";
        }
        if (lowerType.includes("json")) {
            try {
                return JSON.parse(value);
            } catch {
                return value;
            }
        }

        return value;
    };

    const getPlaceholder = (col: ColumnDetails): string => {
        if (col.defaultValue) {
            return `Default: ${col.defaultValue}`;
        }
        return col.type;
    };

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
            <DialogContent className="sm:max-w-[520px]">
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
                    <ScrollArea className="max-h-[400px] pr-4">
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
