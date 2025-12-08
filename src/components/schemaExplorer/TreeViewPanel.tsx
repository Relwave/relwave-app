import React from 'react'
import { ScrollArea } from '../ui/scroll-area';
import { ChevronDown, ChevronRight, Copy, Database, Download, Eye, FileCode, Key, Layers, Link2, Table } from 'lucide-react';
import { ContextMenu, ContextMenuContent, ContextMenuItem, ContextMenuTrigger } from '../ui/context-menu';
import { ColumnDetails, DatabaseSchemaDetails, SchemaGroup, TableSchemaDetails } from '@/services/bridgeApi';
import { Badge } from "@/components/ui/badge";


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

interface TreeViewPanelProps {
    database: DatabaseSchema;
    expandedSchemas: Set<string>;
    expandedTables: Set<string>;
    toggleSchema: (schemaName: string) => void;
    toggleTable: (tableName: string) => void;
    selectedItem: string | null;
    setSelectedItem: (itemPath: string) => void;
    handlePreviewRows: (tableName: string) => void;
    handleShowDDL: (tableName: string) => void;
    handleCopy: (name: string, type: string) => void;
    handleExport: (tableName: string) => void;
}



const TreeViewPanel = ({ database, expandedSchemas, expandedTables, toggleSchema, toggleTable, selectedItem, setSelectedItem, handlePreviewRows, handleShowDDL, handleCopy, handleExport }: TreeViewPanelProps) => {
    return (
        <div className="w-96 border-r border-border bg-card shrink-0">
            <ScrollArea className="h-full">
                <div className="p-4">
                    {/* Database Level (Root) */}
                    <div key={database.name} className="mb-2">
                        <div
                            className={`flex items-center gap-2 p-2 rounded-md font-semibold text-sm text-primary`}
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
                                                    hover:bg-accent transition-colors 
                                                    ${selectedItem === `${database.name}.${schema.name}` ? "bg-accent/60" : ""
                                            }`}
                                        onClick={() => {
                                            toggleSchema(schema.name);
                                            setSelectedItem(`${database.name}.${schema.name}`);
                                        }}
                                    >
                                        {expandedSchemas.has(schema.name) ? (
                                            <ChevronDown className="h-4 w-4 text-muted-foreground" />
                                        ) : (
                                            <ChevronRight className="h-4 w-4 text-muted-foreground" />
                                        )}
                                        <Layers className="h-4 w-4 text-indigo-600 dark:text-indigo-400" />
                                        <span className="font-medium text-sm text-foreground">{schema.name}</span>
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
                                                                            hover:bg-accent transition-colors 
                                                                            ${selectedItem === `${database.name}.${schema.name}.${table.name}` ? "bg-accent/60" : ""
                                                                    }`}
                                                                onClick={() => {
                                                                    toggleTable(table.name);
                                                                    setSelectedItem(`${database.name}.${schema.name}.${table.name}`);
                                                                }}
                                                            >
                                                                {expandedTables.has(table.name) ? (
                                                                    <ChevronDown className="h-4 w-4 text-muted-foreground" />
                                                                ) : (
                                                                    <ChevronRight className="h-4 w-4 text-muted-foreground" />
                                                                )}
                                                                <Table className="h-4 w-4 text-teal-600 dark:text-teal-400" />
                                                                <span className="text-sm text-foreground">{table.name}</span>
                                                                {table.type !== "BASE TABLE" && (
                                                                    <Badge variant="outline" className="ml-auto text-xs text-primary border-primary/50">
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
                                                                                                    hover:bg-accent transition-colors
                                                                                                    ${selectedItem === `${database.name}.${schema.name}.${table.name}.${column.name}` ? "bg-accent/60" : ""
                                                                                            }`}
                                                                                        onClick={() =>
                                                                                            setSelectedItem(`${database.name}.${schema.name}.${table.name}.${column.name}`)
                                                                                        }
                                                                                    >
                                                                                        <div className="flex items-center gap-1 flex-1 min-w-0">
                                                                                            {column.isPrimaryKey && <Key className="h-3 w-3 text-amber-600 dark:text-amber-400 shrink-0" />}
                                                                                            {column.isForeignKey && <Link2 className="h-3 w-3 text-primary shrink-0" />}
                                                                                            <span className="truncate text-foreground">{column.name}</span>
                                                                                        </div>
                                                                                        <span className="text-muted-foreground text-xs shrink-0">{column.type}</span>
                                                                                    </div>
                                                                                </div>
                                                                            </ContextMenuTrigger>
                                                                            {/* Context Menu: Use theme colors */}
                                                                            <ContextMenuContent className="bg-popover border-border">
                                                                                <ContextMenuItem onClick={() => handleCopy(column.name, "Column name")} className="hover:bg-accent"><Copy className="h-4 w-4 mr-2" />Copy Column Name</ContextMenuItem>
                                                                            </ContextMenuContent>
                                                                        </ContextMenu>
                                                                    ))}
                                                                </div>
                                                            )}
                                                        </div>
                                                    </ContextMenuTrigger>
                                                    {/* Context Menu: Use theme colors */}
                                                    <ContextMenuContent className="bg-popover border-border">
                                                        <ContextMenuItem onClick={() => handlePreviewRows(table.name)} className="hover:bg-accent"><Eye className="h-4 w-4 mr-2" />Preview Rows</ContextMenuItem>
                                                        <ContextMenuItem onClick={() => handleShowDDL(table.name)} className="hover:bg-accent"><FileCode className="h-4 w-4 mr-2" />Show DDL</ContextMenuItem>
                                                        <ContextMenuItem onClick={() => handleCopy(table.name, "Table name")} className="hover:bg-accent"><Copy className="h-4 w-4 mr-2" />Copy Table Name</ContextMenuItem>
                                                        <ContextMenuItem onClick={() => handleExport(table.name)} className="hover:bg-accent"><Download className="h-4 w-4 mr-2" />Export Table</ContextMenuItem>
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
        </div>)
}

export default TreeViewPanel