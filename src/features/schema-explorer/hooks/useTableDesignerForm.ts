import { CreateTableColumn, ForeignKeyConstraint } from "@/features/database/types";

interface TableDesignerFormProps {
    tableName: string;
    onTableNameChange: (name: string) => void;
    columns: CreateTableColumn[];
    onColumnsChange: (columns: CreateTableColumn[]) => void;
    foreignKeys: ForeignKeyConstraint[];
    onForeignKeysChange: (foreignKeys: ForeignKeyConstraint[]) => void;
    currentSchema: string;
    availableTables: Array<{ schema: string; name: string }>;
}

export default function useTableDesignerForm({ tableName,
    columns,
    onColumnsChange,
    foreignKeys,
    onForeignKeysChange,
    currentSchema,
}: TableDesignerFormProps) {
    const addColumn = () => {
        const newColumn: CreateTableColumn = {
            name: "",
            type: "TEXT",
            not_nullable: false,
            is_primary_key: false,
            default_value: "",
        };
        onColumnsChange([...columns, newColumn]);
    };

    const removeColumn = (index: number) => {
        onColumnsChange(columns.filter((_, i) => i !== index));
    };

    const updateColumn = (index: number, field: keyof CreateTableColumn, value: any) => {
        const updated = columns.map((col, i) => {
            if (i === index) {
                return { ...col, [field]: value };
            }
            return col;
        });
        onColumnsChange(updated);
    };

    const addForeignKey = () => {
        const newForeignKey: ForeignKeyConstraint = {
            constraint_name: "",
            source_schema: currentSchema,
            source_table: tableName,
            source_column: "",
            target_schema: currentSchema,
            target_table: "",
            target_column: "",
            update_rule: "NO ACTION",
            delete_rule: "NO ACTION",
        };
        onForeignKeysChange([...foreignKeys, newForeignKey]);
    };

    const removeForeignKey = (index: number) => {
        onForeignKeysChange(foreignKeys.filter((_, i) => i !== index));
    };

    const updateForeignKey = (index: number, field: keyof ForeignKeyConstraint, value: string) => {
        const updated = foreignKeys.map((fk, i) => {
            if (i === index) {
                return { ...fk, [field]: value };
            }
            return fk;
        });
        onForeignKeysChange(updated);
    };

    return {
        addColumn,
        addForeignKey,
        removeColumn,
        removeForeignKey,
        updateColumn,
        updateForeignKey
    }
}