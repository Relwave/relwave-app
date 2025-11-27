import { useState, useEffect, useCallback } from "react";
import { useParams, Link } from "react-router-dom";
import { ChevronRight, ChevronDown, Database, Layers, Table, Eye, FileCode, Copy, Download, Key, Link2, AlertCircle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { ScrollArea } from "@/components/ui/scroll-area";
import {
    ContextMenu,
    ContextMenuContent,
    ContextMenuItem,
    ContextMenuTrigger,
} from "@/components/ui/context-menu";

import { Badge } from "@/components/ui/badge";
import { toast } from "sonner";
import { bridgeApi, DatabaseSchemaDetails, ColumnDetails, TableSchemaDetails, SchemaGroup } from "@/services/bridgeApi"; // Import API and types
import Loader from "@/components/Loader";

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

export default function SchemaExplorer() {
    const { id: dbId } = useParams<{ id: string }>();

    const [schemaData, setSchemaData] = useState<DatabaseSchema | null>(null);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);

    const [expandedSchemas, setExpandedSchemas] = useState<Set<string>>(new Set());
    const [expandedTables, setExpandedTables] = useState<Set<string>>(new Set());
    const [selectedItem, setSelectedItem] = useState<string | null>(null);



    const fetchSchema = useCallback(async () => {
        if (!dbId) return;

        try {
            setLoading(true);
            setError(null);

            const result = await bridgeApi.getSchema(dbId);

            if (result) {
                setSchemaData(result as DatabaseSchema);
                setSelectedItem(result.name);
                if (result.schemas.length > 0) {
                    setExpandedSchemas(new Set([result.schemas[0].name]));
                }
            } else {
                setError(`Database ID ${dbId} found no schema data.`);
            }

        } catch (err: any) {
            console.error("Failed to fetch schema:", err);
            setError(err.message || "Failed to connect and load schema metadata.");
            toast.error("Schema Load Failed", {
                description: err.message
            });
        } finally {
            setLoading(false);
        }
    }, [dbId]);

    useEffect(() => {
        fetchSchema();
    }, [fetchSchema]);



    const toggleSchema = (schemaName: string) => {
        const newExpanded = new Set(expandedSchemas);
        if (newExpanded.has(schemaName)) {
            newExpanded.delete(schemaName);
        } else {
            newExpanded.add(schemaName);
        }
        setExpandedSchemas(newExpanded);
    };

    const toggleTable = (tableName: string) => {
        const newExpanded = new Set(expandedTables);
        if (newExpanded.has(tableName)) {
            newExpanded.delete(tableName);
        } else {
            newExpanded.add(tableName);
        }
        setExpandedTables(newExpanded);
    };


    const handlePreviewRows = (tableName: string) => {
        toast.success(`Showing preview for ${tableName}`);
    };

    const handleShowDDL = (tableName: string) => {
        toast.success(`Generated DDL for ${tableName}`);
    };

    const handleCopy = (text: string, type: string) => {
        const el = document.createElement('textarea');
        el.value = text;
        document.body.appendChild(el);
        el.select();
        document.execCommand('copy');
        document.body.removeChild(el);

        toast.success(`${type} copied to clipboard`);
    };

    const handleExport = (tableName: string) => {
        toast.success(`Exported ${tableName} successfully`);
    };


    if (loading) {
        return (
            <div className="min-h-screen flex items-center justify-center bg-gray-50 dark:bg-gray-950 text-black dark:text-white">
                <Loader />
            </div>
        );
    }

    if (error || !schemaData) {
        return (
            <div className="min-h-screen flex items-center justify-center bg-gray-50 dark:bg-gray-950 text-black dark:text-white">
                <div className="text-center p-8 border border-red-500/30 rounded-xl bg-red-900/10">
                    <AlertCircle className="h-10 w-10 text-red-500 mx-auto mb-4" />
                    <h2 className="text-xl font-bold mb-2">Error</h2>
                    <p className="text-sm text-gray-500 dark:text-gray-400">{error || "No schema data could be loaded."}</p>
                    <Button onClick={fetchSchema} variant="outline" className="mt-4 border-gray-300 dark:border-gray-700">Retry Load</Button>
                </div>
            </div>
        );
    }

    // Get the current database object
    const database = schemaData;


    // --- Main Renderer ---

    return (
        <div className="min-h-screen bg-white dark:bg-gray-950 flex flex-col text-black dark:text-white">
            {/* Header */}
            <header className="border-b border-gray-200 dark:border-gray-800 bg-gray-100 dark:bg-gray-900 px-6 py-4 shrink-0">
                <div className="flex items-center justify-between">
                    <div className="flex items-center gap-4">
                        <Link to={`/${dbId}`}>
                            <Button variant="outline" size="sm">
                                ← Back
                            </Button>
                        </Link>
                        <div>
                            <h1 className="text-2xl font-bold text-gray-900 dark:text-white">Schema Explorer</h1>
                            <p className="text-sm text-gray-600 dark:text-gray-400">
                                {database.name} | Browse structure and metadata
                            </p>
                        </div>
                    </div>
                </div>
            </header>

            {/* Content */}
            <div className="flex-1 flex overflow-hidden">
                {/* Tree View Panel */}
                <div className="w-96 border-r border-gray-200 dark:border-gray-800 bg-white dark:bg-gray-900 shrink-0">
                    <ScrollArea className="h-full">
                        <div className="p-4">
                            {/* Database Level (Root) */}
                            <div key={database.name} className="mb-2">
                                <div
                                    className={`flex items-center gap-2 p-2 rounded-md font-semibold text-sm text-cyan-600 dark:text-cyan-400`}
                                    onClick={() => setSelectedItem(database.name)} // Select the DB itself
                                >
                                    <Database className="h-4 w-4" />
                                    <span>{database.name}</span>
                                </div>

                                {/* Schema Level */}
                                <div className="ml-4 mt-1">
                                    {database.schemas.map((schema) => (
                                        <div key={schema.name} className="mb-1">
                                            <div
                                                className={`flex items-center gap-2 p-2 rounded-md cursor-pointer 
                                                        hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors 
                                                        ${selectedItem === `${database.name}.${schema.name}` ? "bg-gray-200 dark:bg-gray-800" : ""
                                                    }`}
                                                onClick={() => {
                                                    toggleSchema(schema.name);
                                                    setSelectedItem(`${database.name}.${schema.name}`);
                                                }}
                                            >
                                                {expandedSchemas.has(schema.name) ? (
                                                    <ChevronDown className="h-4 w-4 text-gray-500" />
                                                ) : (
                                                    <ChevronRight className="h-4 w-4 text-gray-500" />
                                                )}
                                                <Layers className="h-4 w-4 text-indigo-600 dark:text-indigo-400" />
                                                <span className="font-medium text-sm text-gray-900 dark:text-white">{schema.name}</span>
                                            </div>

                                            {/* Table Level */}
                                            {expandedSchemas.has(schema.name) && (
                                                <div className="ml-6 mt-1">
                                                    {schema.tables.map((table) => (
                                                        <ContextMenu key={table.name}>
                                                            <ContextMenuTrigger>
                                                                <div className="mb-1">
                                                                    <div
                                                                        className={`flex items-center gap-2 p-2 rounded-md cursor-pointer 
                                                                            hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors 
                                                                            ${selectedItem === `${database.name}.${schema.name}.${table.name}` ? "bg-gray-200 dark:bg-gray-800" : ""
                                                                            }`}
                                                                        onClick={() => {
                                                                            toggleTable(table.name);
                                                                            setSelectedItem(`${database.name}.${schema.name}.${table.name}`);
                                                                        }}
                                                                    >
                                                                        {expandedTables.has(table.name) ? (
                                                                            <ChevronDown className="h-4 w-4 text-gray-500" />
                                                                        ) : (
                                                                            <ChevronRight className="h-4 w-4 text-gray-500" />
                                                                        )}
                                                                        <Table className="h-4 w-4 text-teal-600 dark:text-teal-400" />
                                                                        <span className="text-sm text-gray-900 dark:text-white">{table.name}</span>
                                                                        {table.type !== "BASE TABLE" && (
                                                                            <Badge variant="outline" className="ml-auto text-xs text-blue-600 dark:text-blue-400 border-blue-600/50">
                                                                                {table.type.toUpperCase()}
                                                                            </Badge>
                                                                        )}
                                                                    </div>

                                                                    {/* Column Level */}
                                                                    {expandedTables.has(table.name) && (
                                                                        <div className="ml-6 mt-1">
                                                                            {table.columns.map((column) => (
                                                                                <ContextMenu key={column.name}>
                                                                                    <ContextMenuTrigger>
                                                                                        <div className="mb-0.5">
                                                                                            <div
                                                                                                className={`flex items-center justify-between gap-2 p-1.5 rounded-md cursor-pointer text-xs 
                                                                                                    hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors
                                                                                                    ${selectedItem === `${database.name}.${schema.name}.${table.name}.${column.name}` ? "bg-gray-200 dark:bg-gray-800" : ""
                                                                                                    }`}
                                                                                                onClick={() =>
                                                                                                    setSelectedItem(`${database.name}.${schema.name}.${table.name}.${column.name}`)
                                                                                                }
                                                                                            >
                                                                                                <div className="flex items-center gap-1 flex-1 min-w-0">
                                                                                                    {column.isPrimaryKey && <Key className="h-3 w-3 text-yellow-600 dark:text-yellow-400 shrink-0" />}
                                                                                                    {column.isForeignKey && <Link2 className="h-3 w-3 text-blue-600 dark:text-blue-400 shrink-0" />}
                                                                                                    <span className="truncate text-gray-800 dark:text-gray-200">{column.name}</span>
                                                                                                </div>
                                                                                                <span className="text-gray-500 dark:text-gray-400 text-xs shrink-0">{column.type}</span>
                                                                                            </div>
                                                                                        </div>
                                                                                    </ContextMenuTrigger>
                                                                                    <ContextMenuContent className="bg-white border-gray-300 dark:bg-gray-900 dark:border-gray-700">
                                                                                        <ContextMenuItem onClick={() => handleCopy(column.name, "Column name")}><Copy className="h-4 w-4 mr-2" />Copy Column Name</ContextMenuItem>
                                                                                    </ContextMenuContent>
                                                                                </ContextMenu>
                                                                            ))}
                                                                        </div>
                                                                    )}
                                                                </div>
                                                            </ContextMenuTrigger>
                                                            <ContextMenuContent className="bg-white border-gray-300 dark:bg-gray-900 dark:border-gray-700">
                                                                <ContextMenuItem onClick={() => handlePreviewRows(table.name)}><Eye className="h-4 w-4 mr-2" />Preview Rows</ContextMenuItem>
                                                                <ContextMenuItem onClick={() => handleShowDDL(table.name)}><FileCode className="h-4 w-4 mr-2" />Show DDL</ContextMenuItem>
                                                                <ContextMenuItem onClick={() => handleCopy(table.name, "Table name")}><Copy className="h-4 w-4 mr-2" />Copy Table Name</ContextMenuItem>
                                                                <ContextMenuItem onClick={() => handleExport(table.name)}><Download className="h-4 w-4 mr-2" />Export Table</ContextMenuItem>
                                                            </ContextMenuContent>
                                                        </ContextMenu>
                                                    ))}
                                                </div>
                                            )}
                                        </div>
                                    ))}
                                </div>
                            </div>
                        </div>
                    </ScrollArea>
                </div>

                {/* Metadata Panel */}
                <div className="flex-1 overflow-auto bg-white dark:bg-gray-950">
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
                                                    <h2 className="text-2xl font-bold text-gray-900 dark:text-white mb-2">{columnName}</h2>
                                                    <p className="text-sm text-gray-500 dark:text-gray-400">
                                                        {dbName}.{schemaName}.{tableName}.{columnName}
                                                    </p>
                                                </div>

                                                <div className="grid grid-cols-2 gap-4">
                                                    <div className="p-4 border border-gray-300 dark:border-gray-700 rounded-lg bg-gray-100 dark:bg-gray-900">
                                                        <div className="text-sm font-semibold text-gray-500 dark:text-gray-400 mb-1">Data Type</div>
                                                        <div className="text-lg font-mono text-gray-900 dark:text-white">{column.type}</div>
                                                    </div>
                                                    <div className="p-4 border border-gray-300 dark:border-gray-700 rounded-lg bg-gray-100 dark:bg-gray-900">
                                                        <div className="text-sm font-semibold text-gray-500 dark:text-gray-400 mb-1">Nullable</div>
                                                        <div className="text-lg text-gray-900 dark:text-white">{column.nullable ? "Yes" : "No"}</div>
                                                    </div>
                                                    {column.defaultValue && (
                                                        <div className="p-4 border border-gray-300 dark:border-gray-700 rounded-lg bg-gray-100 dark:bg-gray-900 col-span-2">
                                                            <div className="text-sm font-semibold text-gray-500 dark:text-gray-400 mb-1">Default Value</div>
                                                            <div className="text-lg font-mono text-gray-900 dark:text-white">{column.defaultValue}</div>
                                                        </div>
                                                    )}
                                                </div>

                                                <div>
                                                    <h3 className="text-lg font-semibold text-gray-900 dark:text-white mb-3">Constraints</h3>
                                                    <div className="space-y-2">
                                                        {column.isPrimaryKey && (
                                                            <div className="flex items-center gap-2 p-3 border border-gray-300 dark:border-gray-700 rounded-lg bg-gray-100 dark:bg-gray-900">
                                                                <Key className="h-5 w-5 text-yellow-600 dark:text-yellow-400" />
                                                                <div>
                                                                    <div className="font-semibold text-gray-900 dark:text-white">Primary Key</div>
                                                                    <div className="text-sm text-gray-500 dark:text-gray-400">This column is a primary key</div>
                                                                </div>
                                                            </div>
                                                        )}
                                                        {column.isForeignKey && (
                                                            <div className="flex items-center gap-2 p-3 border border-gray-300 dark:border-gray-700 rounded-lg bg-gray-100 dark:bg-gray-900">
                                                                <Link2 className="h-5 w-5 text-blue-600 dark:text-blue-400" />
                                                                <div>
                                                                    <div className="font-semibold text-gray-900 dark:text-white">Foreign Key</div>
                                                                    <div className="text-sm text-gray-500 dark:text-gray-400">
                                                                        References: {column.foreignKeyRef || 'N/A'}
                                                                    </div>
                                                                </div>
                                                            </div>
                                                        )}
                                                        {column.isUnique && (
                                                            <div className="flex items-center gap-2 p-3 border border-gray-300 dark:border-gray-700 rounded-lg bg-gray-100 dark:bg-gray-900">
                                                                <AlertCircle className="h-5 w-5 text-purple-600 dark:text-purple-400" />
                                                                <div>
                                                                    <div className="font-semibold text-gray-900 dark:text-white">Unique</div>
                                                                    <div className="text-sm text-gray-500 dark:text-gray-400">Values must be unique</div>
                                                                </div>
                                                            </div>
                                                        )}
                                                        {!column.isPrimaryKey && !column.isForeignKey && !column.isUnique && (
                                                            <div className="text-sm text-gray-500 dark:text-gray-400 p-2 border border-dashed border-gray-300 dark:border-gray-700 rounded-lg">
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
                                                        <h2 className="text-2xl font-bold text-gray-900 dark:text-white">{tableName}</h2>
                                                        {table.type !== "BASE TABLE" && (
                                                            <Badge variant="outline" className="text-blue-600 dark:text-blue-400 border-blue-600/50">{table.type.toUpperCase()}</Badge>
                                                        )}
                                                    </div>
                                                    <p className="text-sm text-gray-500 dark:text-gray-400">
                                                        {dbName}.{schemaName}.{tableName}
                                                    </p>
                                                </div>

                                                <div className="grid grid-cols-3 gap-4">
                                                    <div className="p-4 border border-gray-300 dark:border-gray-700 rounded-lg bg-gray-100 dark:bg-gray-900">
                                                        <div className="text-sm font-semibold text-gray-500 dark:text-gray-400 mb-1">Columns</div>
                                                        <div className="text-2xl font-bold text-gray-900 dark:text-white">{table.columns.length}</div>
                                                    </div>
                                                    <div className="p-4 border border-gray-300 dark:border-gray-700 rounded-lg bg-gray-100 dark:bg-gray-900">
                                                        <div className="text-sm font-semibold text-gray-500 dark:text-gray-400 mb-1">Primary Keys</div>
                                                        <div className="text-2xl font-bold text-gray-900 dark:text-white">
                                                            {table.columns.filter((c) => c.isPrimaryKey).length}
                                                        </div>
                                                    </div>
                                                    <div className="p-4 border border-gray-300 dark:border-gray-700 rounded-lg bg-gray-100 dark:bg-gray-900">
                                                        <div className="text-sm font-semibold text-gray-500 dark:text-gray-400 mb-1">Foreign Keys</div>
                                                        <div className="text-2xl font-bold text-gray-900 dark:text-white">
                                                            {table.columns.filter((c) => c.isForeignKey).length}
                                                        </div>
                                                    </div>
                                                </div>

                                                <div>
                                                    <h3 className="text-lg font-semibold text-gray-900 dark:text-white mb-3">Columns</h3>
                                                    <div className="border border-gray-300 dark:border-gray-700 rounded-lg overflow-hidden">
                                                        <table className="w-full">
                                                            <thead className="bg-gray-100 dark:bg-gray-800 text-gray-700 dark:text-gray-200">
                                                                <tr>
                                                                    <th className="text-left p-3 text-sm font-semibold">Name</th>
                                                                    <th className="text-left p-3 text-sm font-semibold">Type</th>
                                                                    <th className="text-left p-3 text-sm font-semibold">Nullable</th>
                                                                    <th className="text-left p-3 text-sm font-semibold">Constraints</th>
                                                                </tr>
                                                            </thead>
                                                            <tbody>
                                                                {table.columns.map((column) => (
                                                                    <tr key={column.name} className="border-t border-gray-200 dark:border-gray-800 hover:bg-gray-50 dark:hover:bg-gray-800/50">
                                                                        <td className="p-3 font-mono text-sm text-gray-900 dark:text-white">{column.name}</td>
                                                                        <td className="p-3 font-mono text-sm text-gray-500 dark:text-gray-400">{column.type}</td>
                                                                        <td className="p-3 text-sm text-gray-900 dark:text-white">{column.nullable ? "Yes" : "No"}</td>
                                                                        <td className="p-3 text-sm">
                                                                            <div className="flex gap-1">
                                                                                {column.isPrimaryKey && (<Badge variant="outline" className="text-xs text-yellow-600 dark:text-yellow-400 border-yellow-600/50">PK</Badge>)}
                                                                                {column.isForeignKey && (<Badge variant="outline" className="text-xs text-blue-600 dark:text-blue-400 border-blue-600/50">FK</Badge>)}
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
                                        <div className="text-center text-gray-500 dark:text-gray-400 py-12">
                                            Select a table or column to view detailed metadata.
                                        </div>
                                    );
                                })()
                            ) : (
                                <div className="text-center text-gray-500 dark:text-gray-400 py-12">
                                    Select an item from the tree to view details
                                </div>
                            )}
                        </div>
                    </ScrollArea>
                </div>
            </div >
        </div >
    );
}