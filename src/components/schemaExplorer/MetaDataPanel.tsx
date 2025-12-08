import { Key, Link2, AlertCircle } from "lucide-react";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Badge } from "@/components/ui/badge";
import { DatabaseSchemaDetails, ColumnDetails, TableSchemaDetails, SchemaGroup } from "@/services/bridgeApi"; // Import API and types


interface Column extends ColumnDetails {
    foreignKeyRef?: string; // Add if foreignKeyRef detail is manually available
}

interface TableSchema extends TableSchemaDetails {
    columns: Column[];
}

interface Schema extends SchemaGroup {
    tables: TableSchema[];
}

interface DatabaseSchema extends DatabaseSchemaDetails {
    schemas: Schema[];
}

interface MetaDataPanelProps {
    selectedItem: string | null;
    database: DatabaseSchema | null;
}



const MetaDataPanel = ({ selectedItem, database }: MetaDataPanelProps) => {
    return (
        <div className="flex-1 overflow-auto bg-background">
            <ScrollArea className="h-full">
                <div className="p-6">
                    {selectedItem ? (
                        (() => {
                            const parts = selectedItem.split(".");

                            // Helper function to find the objects
                            const db = database;
                            const schema = parts.length >= 2 ? db?.schemas.find((s) => s.name === parts[1]) : undefined;
                            const table = parts.length >= 3 ? schema?.tables.find((t) => t.name === parts[2]) : undefined;
                            const column = parts.length === 4 ? table?.columns.find((c) => c.name === parts[3]) : undefined;

                            if (parts.length === 4 && column) {
                                // Column selected
                                const [dbName, schemaName, tableName, columnName] = parts;
                                return (
                                    <div className="space-y-6">
                                        <div>
                                            <h2 className="text-2xl font-bold text-foreground mb-2">{columnName}</h2>
                                            <p className="text-sm text-muted-foreground">
                                                {dbName}.{schemaName}.{tableName}.{columnName}
                                            </p>
                                        </div>

                                        <div className="grid grid-cols-2 gap-4">
                                            {/* Data Card 1: Data Type */}
                                            <div className="p-4 border border-border rounded-lg bg-card shadow-sm">
                                                <div className="text-sm font-semibold text-muted-foreground mb-1">Data Type</div>
                                                <div className="text-lg font-mono text-foreground">{column.type}</div>
                                            </div>
                                            {/* Data Card 2: Nullable */}
                                            <div className="p-4 border border-border rounded-lg bg-card shadow-sm">
                                                <div className="text-sm font-semibold text-muted-foreground mb-1">Nullable</div>
                                                <div className="text-lg text-foreground">{column.nullable ? "Yes" : "No"}</div>
                                            </div>
                                            {column.defaultValue && (
                                                <div className="p-4 border border-border rounded-lg bg-card shadow-sm col-span-2">
                                                    <div className="text-sm font-semibold text-muted-foreground mb-1">Default Value</div>
                                                    <div className="text-lg font-mono text-foreground">{column.defaultValue}</div>
                                                </div>
                                            )}
                                        </div>

                                        <div>
                                            <h3 className="text-lg font-semibold text-foreground mb-3">Constraints</h3>
                                            <div className="space-y-2">
                                                {column.isPrimaryKey && (
                                                    <div className="flex items-center gap-2 p-3 border border-border rounded-lg bg-card shadow-sm">
                                                        <Key className="h-5 w-5 text-amber-600 dark:text-amber-400" />
                                                        <div>
                                                            <div className="font-semibold text-foreground">Primary Key</div>
                                                            <div className="text-sm text-muted-foreground">This column is a primary key</div>
                                                        </div>
                                                    </div>
                                                )}
                                                {column.isForeignKey && (
                                                    <div className="flex items-center gap-2 p-3 border border-border rounded-lg bg-card shadow-sm">
                                                        <Link2 className="h-5 w-5 text-primary" />
                                                        <div>
                                                            <div className="font-semibold text-foreground">Foreign Key</div>
                                                            <div className="text-sm text-muted-foreground">
                                                                References: {column.foreignKeyRef || 'N/A'}
                                                            </div>
                                                        </div>
                                                    </div>
                                                )}
                                                {column.isUnique && (
                                                    <div className="flex items-center gap-2 p-3 border border-border rounded-lg bg-card shadow-sm">
                                                        <AlertCircle className="h-5 w-5 text-purple-600 dark:text-purple-400" />
                                                        <div>
                                                            <div className="font-semibold text-foreground">Unique</div>
                                                            <div className="text-sm text-muted-foreground">Values must be unique</div>
                                                        </div>
                                                    </div>
                                                )}
                                                {!column.isPrimaryKey && !column.isForeignKey && !column.isUnique && (
                                                    <div className="text-sm text-muted-foreground p-2 border border-dashed border-border rounded-lg">
                                                        No complex constraints applied.
                                                    </div>
                                                )}
                                            </div>
                                        </div>
                                    </div>
                                );
                            } else if (parts.length === 3 && table) {
                                // Table selected
                                const [dbName, schemaName, tableName] = parts;
                                return (
                                    <div className="space-y-6">
                                        <div>
                                            <div className="flex items-center gap-2 mb-2">
                                                <h2 className="text-2xl font-bold text-foreground">{tableName}</h2>
                                                {table.type !== "BASE TABLE" && (
                                                    <Badge variant="outline" className="text-primary border-primary/50">{table.type.toUpperCase()}</Badge>
                                                )}
                                            </div>
                                            <p className="text-sm text-muted-foreground">
                                                {dbName}.{schemaName}.{tableName}
                                            </p>
                                        </div>

                                        <div className="grid grid-cols-3 gap-4">
                                            {/* Stat Card 1: Columns */}
                                            <div className="p-4 border border-border rounded-lg bg-card shadow-sm">
                                                <div className="text-sm font-semibold text-muted-foreground mb-1">Columns</div>
                                                <div className="text-2xl font-bold text-foreground">{table.columns.length}</div>
                                            </div>
                                            {/* Stat Card 2: Primary Keys */}
                                            <div className="p-4 border border-border rounded-lg bg-card shadow-sm">
                                                <div className="text-sm font-semibold text-muted-foreground mb-1">Primary Keys</div>
                                                <div className="text-2xl font-bold text-foreground">
                                                    {table.columns.filter((c) => c.isPrimaryKey).length}
                                                </div>
                                            </div>
                                            {/* Stat Card 3: Foreign Keys */}
                                            <div className="p-4 border border-border rounded-lg bg-card shadow-sm">
                                                <div className="text-sm font-semibold text-muted-foreground mb-1">Foreign Keys</div>
                                                <div className="text-2xl font-bold text-foreground">
                                                    {table.columns.filter((c) => c.isForeignKey).length}
                                                </div>
                                            </div>
                                        </div>

                                        <div>
                                            <h3 className="text-lg font-semibold text-foreground mb-3">Columns</h3>
                                            {/* Table of Columns: Use theme colors for borders, backgrounds, and text */}
                                            <div className="border border-border rounded-lg overflow-hidden">
                                                <table className="w-full">
                                                    <thead className="bg-muted text-muted-foreground">
                                                        <tr>
                                                            <th className="text-left p-3 text-sm font-semibold">Name</th>
                                                            <th className="text-left p-3 text-sm font-semibold">Type</th>
                                                            <th className="text-left p-3 text-sm font-semibold">Nullable</th>
                                                            <th className="text-left p-3 text-sm font-semibold">Constraints</th>
                                                        </tr>
                                                    </thead>
                                                    <tbody>
                                                        {table.columns.map((column) => (
                                                            <tr key={column.name} className="border-t border-border hover:bg-muted/50">
                                                                <td className="p-3 font-mono text-sm text-foreground">{column.name}</td>
                                                                <td className="p-3 font-mono text-sm text-muted-foreground">{column.type}</td>
                                                                <td className="p-3 text-sm text-foreground">{column.nullable ? "Yes" : "No"}</td>
                                                                <td className="p-3 text-sm">
                                                                    <div className="flex gap-1">
                                                                        {column.isPrimaryKey && (<Badge variant="outline" className="text-xs text-amber-600 dark:text-amber-400 border-amber-600/50">PK</Badge>)}
                                                                        {column.isForeignKey && (<Badge variant="outline" className="text-xs text-primary border-primary/50">FK</Badge>)}
                                                                        {column.isUnique && (<Badge variant="outline" className="text-xs text-purple-600 dark:text-purple-400 border-purple-600/50">UNIQUE</Badge>)}
                                                                    </div>
                                                                </td>
                                                            </tr>
                                                        ))}
                                                    </tbody>
                                                </table>
                                            </div>
                                        </div>
                                    </div>
                                );
                            }

                            return (
                                <div className="text-center text-muted-foreground py-12">
                                    Select a table or column to view detailed metadata.
                                </div>
                            );
                        })()
                    ) : (
                        <div className="text-center text-muted-foreground py-12">
                            Select an item from the tree to view details
                        </div>
                    )}
                </div>
            </ScrollArea>
        </div>
    )
}

export default MetaDataPanel