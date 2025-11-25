import { SelectedTable, TableInfo } from "@/pages/DatabaseDetails";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "../ui/card";
import { Loader2, Table2 } from "lucide-react";

interface TableSidebarProps {
    tables: TableInfo[];
    selectedTable: SelectedTable | null;
    loading: boolean;
    onTableSelect: (tableName: string, schemaName: string) => void;
}

const TableSidebar: React.FC<TableSidebarProps> = ({ tables, selectedTable, loading, onTableSelect }) => (
    <Card className="bg-white dark:bg-gray-900/50 border border-gray-300 dark:border-primary/10 rounded-xl shadow-md dark:shadow-2xl">
        <CardHeader className="border-b border-gray-200 dark:border-primary/10 pb-4">
            <CardTitle className="text-xl flex items-center gap-3 text-gray-900 dark:text-white">
                <Table2 className="h-6 w-6 text-cyan-600 dark:text-cyan-400" />
                Schemas & Tables
            </CardTitle>
            <CardDescription className="text-gray-500 dark:text-gray-400">
                {loading ? "Loading..." : `Total: ${tables.length}`}
            </CardDescription>
        </CardHeader>
        <CardContent className="space-y-2 pt-4 max-h-[80vh] overflow-y-auto">
            {loading ? (
                <div className="text-center py-8 text-gray-500 dark:text-gray-400">
                    <Loader2 className="h-6 w-6 animate-spin mx-auto mb-2" />
                    Loading tables...
                </div>
            ) : tables.length === 0 ? (
                <div className="text-center py-8 text-gray-500 dark:text-gray-400">
                    No tables found
                </div>
            ) : (
                tables.map((table) => (
                    <button
                        key={`${table.schema}.${table.name}`}
                        onClick={() => onTableSelect(table.name, table.schema)}
                        className={`w-full text-left p-4 rounded-lg transition-all duration-200 flex flex-col 
                                    hover:bg-gray-100 dark:hover:bg-gray-800 
                                    ${selectedTable?.name === table.name
                                ? "bg-cyan-100/50 dark:bg-linear-to-r dark:from-cyan-600/30 dark:to-fuchsia-700/30 border border-cyan-500/50 shadow-md text-gray-900 dark:text-white"
                                : "bg-gray-50 dark:bg-gray-800/60 border border-transparent text-gray-700 dark:text-gray-300"
                            }`}
                    >
                        <div className="font-mono font-semibold text-base">{table.name}</div>
                        <div className="text-xs text-gray-500 dark:text-gray-400 mt-1 flex justify-between">
                            <span>{table.schema}</span>
                            <span className="text-gray-500">{table.type}</span>
                        </div>
                    </button>
                ))
            )}
        </CardContent>
    </Card>
);
export default TableSidebar;