// src/components/databaseDetails/TableSelectorDropdown.tsx

import { SelectedTable, TableInfo } from "@/pages/DatabaseDetails";
import { Table2, Loader2 } from "lucide-react";
import {
    Select,
    SelectContent,
    SelectGroup,
    SelectItem,
    SelectLabel,
    SelectTrigger,
    SelectValue,
} from "@/components/ui/select"; // Import your Select components

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
                <div className="flex items-center space-x-2 text-sm text-gray-500 dark:text-gray-400">
                    <Loader2 className="h-4 w-4 animate-spin" />
                    <span>Loading tables...</span>
                </div>
            ) : (
                <Select value={selectedValue} onValueChange={handleValueChange} disabled={tables.length === 0}>
                    {/* Refined SelectTrigger for cleaner SaaS look */}
                    <SelectTrigger
                        className="w-full text-base font-mono bg-white dark:bg-gray-800 border-gray-300 dark:border-gray-700 hover:border-blue-500 dark:hover:border-blue-500 transition-colors"
                    >
                        {/* Accent color for the icon */}
                        <Table2 className="h-4 w-4 mr-2 text-blue-600 dark:text-blue-400" />
                        <SelectValue placeholder="Select a Table..." className="truncate">
                            {selectedTable ? selectedTable.name : "Select a Table..."}
                        </SelectValue>
                    </SelectTrigger>

                    {/* Select Content uses standard dark/light shading */}
                    <SelectContent className="max-h-[300px] bg-white dark:bg-gray-800 border-gray-300 dark:border-gray-700">
                        {tables.length === 0 ? (
                            <SelectItem value="no-tables" disabled>No tables found</SelectItem>
                        ) : (
                            Object.entries(tablesBySchema).map(([schema, tables]) => (
                                <SelectGroup key={schema}>
                                    {/* Accent color for the schema label */}
                                    <SelectLabel className="font-bold text-blue-600 dark:text-blue-400">{schema}</SelectLabel>
                                    {tables.map((table) => (
                                        <SelectItem
                                            key={`${table.schema}.${table.name}`}
                                            value={`${table.schema}.${table.name}`}
                                            className="font-mono focus:bg-blue-100 dark:focus:bg-blue-900/50"
                                        >
                                            <span className="font-semibold">{table.name}</span>
                                            <span className="ml-2 text-xs text-gray-500 dark:text-gray-400">({table.type})</span>
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