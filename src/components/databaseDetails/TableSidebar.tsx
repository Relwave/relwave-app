// src/components/databaseDetails/TableSelectorDropdown.tsx

import { SelectedTable, TableInfo } from "@/pages/DatabaseDetails";
import { Table2 } from "lucide-react";
import {
    Select,
    SelectContent,
    SelectGroup,
    SelectItem,
    SelectLabel,
    SelectTrigger,
    SelectValue,
} from "@/components/ui/select";
import { Spinner } from "../ui/spinner";

interface TableSelectorDropdownProps {
    tables: TableInfo[];
    selectedTable: SelectedTable | null;
    loading: boolean;
    onTableSelect: (tableName: string, schemaName: string) => void;
}

const TableSelectorDropdown: React.FC<TableSelectorDropdownProps> = ({
    tables,
    selectedTable,
    loading,
    onTableSelect
}) => {
    // Group tables by schema for better organization in the dropdown
    const tablesBySchema = tables.reduce((acc, table) => {
        const schema = table.schema;
        if (!acc[schema]) {
            acc[schema] = [];
        }
        acc[schema].push(table);
        return acc;
    }, {} as Record<string, TableInfo[]>);

    const selectedValue = selectedTable
        ? `${selectedTable.schema}.${selectedTable.name}`
        : "";

    const handleValueChange = (value: string) => {
        if (value) {
            const [schemaName, tableName] = value.split('.');
            onTableSelect(tableName, schemaName);
        }
    };

    return (
        <div className="w-full sm:w-64">
            {loading ? (
                <div className="flex items-center space-x-2 text-sm text-muted-foreground">
                    <Spinner className="h-4 w-4 animate-spin" />
                    <span>Loading tables...</span>
                </div>
            ) : (
                <Select value={selectedValue} onValueChange={handleValueChange} disabled={tables.length === 0}>
                    {/* SelectTrigger: uses bg-input/border/hover-border-primary for clean look */}
                    <SelectTrigger
                        className="w-full text-base font-mono bg-input border-border hover:border-primary transition-colors"
                    >
                        {/* Accent color for the icon: using text-primary */}
                        <Table2 className="h-4 w-4 mr-2 text-primary" />
                        <SelectValue placeholder="Select a Table..." className="truncate">
                            {selectedTable ? selectedTable.name : "Select a Table..."}
                        </SelectValue>
                    </SelectTrigger>

                    {/* Select Content uses standard popover styles */}
                    <SelectContent className="max-h-[300px] bg-popover border-border">
                        {tables.length === 0 ? (
                            <SelectItem value="no-tables" disabled>No tables found</SelectItem>
                        ) : (
                            Object.entries(tablesBySchema).map(([schema, tables]) => (
                                <SelectGroup key={schema}>
                                    {/* Accent color for the schema label: using text-primary */}
                                    <SelectLabel className="font-bold text-primary">{schema}</SelectLabel>
                                    {tables.map((table) => (
                                        <SelectItem
                                            key={`${table.schema}.${table.name}`}
                                            value={`${table.schema}.${table.name}`}
                                            // Highlight uses accent color (e.g., hover:bg-accent or focus:bg-primary/10)
                                            className="font-mono focus:bg-accent"
                                        >
                                            <span className="font-semibold">{table.name}</span>
                                            <span className="ml-2 text-xs text-muted-foreground">({table.type})</span>
                                        </SelectItem>
                                    ))}
                                </SelectGroup>
                            ))
                        )}
                    </SelectContent>
                </Select>
            )}
        </div>
    );
};
export default TableSelectorDropdown;