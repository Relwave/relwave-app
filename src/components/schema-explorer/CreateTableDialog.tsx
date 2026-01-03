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
import { Loader2, Table } from "lucide-react";
import TableDesignerForm from "./TableDesignerForm";
import AddIndexesDialog from "./AddIndexesDialog";
import { CreateTableColumn, ForeignKeyConstraint } from "@/types/database";
import { bridgeApi } from "@/services/bridgeApi";

interface CreateTableDialogProps {
    open: boolean;
    onOpenChange: (open: boolean) => void;
    dbId: string;
    schemaName: string;
    onSuccess?: () => void;
}

export default function CreateTableDialog({
    open,
    onOpenChange,
    dbId,
    schemaName,
    onSuccess,
}: CreateTableDialogProps) {
    const [tableName, setTableName] = useState("");
    const [columns, setColumns] = useState<CreateTableColumn[]>([]);
    const [foreignKeys, setForeignKeys] = useState<ForeignKeyConstraint[]>([]);
    const [isSubmitting, setIsSubmitting] = useState(false);
    const [availableTables, setAvailableTables] = useState<Array<{ schema: string; name: string }>>([]);

    // State for indexes dialog
    const [showIndexesDialog, setShowIndexesDialog] = useState(false);
    const [createdTableName, setCreatedTableName] = useState("");

    // Fetch available tables when dialog opens
    useEffect(() => {
        if (open && dbId) {
            fetchAvailableTables();
        }
    }, [open, dbId]);

    const fetchAvailableTables = async () => {
        try {
            const schema = await bridgeApi.getSchema(dbId);
            const tables: Array<{ schema: string; name: string }> = [];

            schema?.schemas?.forEach((schemaGroup: any) => {
                schemaGroup.tables?.forEach((table: any) => {
                    tables.push({
                        schema: schemaGroup.name,
                        name: table.name,
                    });
                });
            });

            setAvailableTables(tables);
        } catch (error) {
            console.error("Failed to fetch available tables:", error);
        }
    };

    const resetForm = () => {
        setTableName("");
        setColumns([]);
        setForeignKeys([]);
    };

    const handleClose = () => {
        if (!isSubmitting) {
            resetForm();
            onOpenChange(false);
        }
    };

    const validateForm = (): boolean => {
        if (!tableName.trim()) {
            toast.error("Table name is required");
            return false;
        }

        if (columns.length === 0) {
            toast.error("At least one column is required");
            return false;
        }

        // Check for empty column names
        const emptyNames = columns.filter((col) => !col.name.trim());
        if (emptyNames.length > 0) {
            toast.error("All columns must have a name");
            return false;
        }

        // Check for duplicate column names
        const names = columns.map((col) => col.name.toLowerCase());
        const duplicates = names.filter((name, index) => names.indexOf(name) !== index);
        if (duplicates.length > 0) {
            toast.error(`Duplicate column name: ${duplicates[0]}`);
            return false;
        }

        // Validate foreign keys
        for (let i = 0; i < foreignKeys.length; i++) {
            const fk = foreignKeys[i];
            if (!fk.constraint_name.trim()) {
                toast.error(`Foreign key ${i + 1}: Constraint name is required`);
                return false;
            }
            if (!fk.source_column.trim()) {
                toast.error(`Foreign key ${i + 1}: Source column is required`);
                return false;
            }
            if (!fk.target_table.trim()) {
                toast.error(`Foreign key ${i + 1}: Target table is required`);
                return false;
            }
            if (!fk.target_column.trim()) {
                toast.error(`Foreign key ${i + 1}: Target column is required`);
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
            // Prepare foreign keys with updated table name
            const preparedForeignKeys = foreignKeys.map((fk) => ({
                ...fk,
                source_table: tableName.trim(),
                source_schema: schemaName,
            }));

            // Create the table with columns and foreign keys
            await bridgeApi.createTable({
                dbId,
                schemaName,
                tableName: tableName.trim(),
                columns: columns.map((col) => ({
                    ...col,
                    name: col.name.trim(),
                    default_value: col.default_value?.trim() || undefined,
                })),
                foreignKeys: preparedForeignKeys,
            });

            toast.success("Table created successfully", {
                description: `Table "${tableName}" has been created in schema "${schemaName}".`,
            });

            // Store created table name and column names for indexes dialog
            setCreatedTableName(tableName.trim());

            // Close this dialog
            resetForm();
            onOpenChange(false);

            // Open indexes dialog
            setShowIndexesDialog(true);

        } catch (error: any) {
            console.error("Failed to create table:", error);
            toast.error("Failed to create table", {
                description: error.message || "An unknown error occurred",
            });
            setIsSubmitting(false);
        } finally {
            setIsSubmitting(false);
        }
    };

    const handleIndexesSuccess = () => {
        setShowIndexesDialog(false);
        setCreatedTableName("");
        if (onSuccess) {
            onSuccess();
        }
    };

    return (
        <>
            <Dialog open={open} onOpenChange={handleClose}>
                <DialogContent className="max-w-4xl max-h-[90vh] overflow-y-auto">
                    <DialogHeader>
                        <DialogTitle className="flex items-center gap-2">
                            <Table className="h-5 w-5" />
                            Create New Table
                        </DialogTitle>
                        <DialogDescription>
                            Create a new table in schema <span className="font-mono font-medium">{schemaName}</span>
                        </DialogDescription>
                    </DialogHeader>

                    <TableDesignerForm
                        tableName={tableName}
                        onTableNameChange={setTableName}
                        columns={columns}
                        onColumnsChange={setColumns}
                        foreignKeys={foreignKeys}
                        onForeignKeysChange={setForeignKeys}
                        currentSchema={schemaName}
                        availableTables={availableTables}
                    />

                    <DialogFooter>
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
                            disabled={isSubmitting}
                        >
                            {isSubmitting ? (
                                <>
                                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                                    Creating...
                                </>
                            ) : (
                                "Create Table"
                            )}
                        </Button>
                    </DialogFooter>
                </DialogContent>
            </Dialog>

            {/* Indexes Dialog - shown after table creation */}
            <AddIndexesDialog
                open={showIndexesDialog}
                onOpenChange={setShowIndexesDialog}
                dbId={dbId}
                schemaName={schemaName}
                tableName={createdTableName}
                availableColumns={columns.map((col) => col.name).filter(Boolean)}
                onSuccess={handleIndexesSuccess}
            />
        </>
    );
}
