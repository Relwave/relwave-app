import { ScrollArea } from '@/components/ui/scroll-area';
import { ChevronDown, ChevronRight, Copy, Database, Download, Eye, FileCode, Hash, Key, Layers, Link2, List, ListChecks, Table } from 'lucide-react';
import { ContextMenu, ContextMenuContent, ContextMenuItem, ContextMenuTrigger } from '@/components/ui/context-menu';
import { Badge } from "@/components/ui/badge";
import {
    ColumnDetails,
    DatabaseSchemaDetails,
    SchemaGroup,
    TableSchemaDetails,
    ForeignKeyInfo,
} from '@/types/database';
import {
    Tooltip,
    TooltipContent,
    TooltipProvider,
    TooltipTrigger,
} from "@/components/ui/tooltip";


interface Column extends ColumnDetails {
    foreignKeyRef?: string;
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

// Helper to get FK info for a column
const getFkInfo = (column: Column, foreignKeys?: ForeignKeyInfo[]): ForeignKeyInfo | undefined => {
    return foreignKeys?.find(fk => fk.source_column === column.name);
};

const TreeViewPanel = ({ database, expandedSchemas, expandedTables, toggleSchema, toggleTable, selectedItem, setSelectedItem, handlePreviewRows, handleShowDDL, handleCopy, handleExport }: TreeViewPanelProps) => {
    return (
        <TooltipProvider delayDuration={300}>
            <div className="w-96 border-r border-border bg-card shrink-0">
                <ScrollArea className="h-full">
                    <div className="p-4">
                        {/* Database Level (Root) */}
                        <div key={database.name} className="mb-2">
                            <div
                                className={`flex items-center gap-2 p-2 rounded-md font-semibold text-sm text-primary cursor-pointer hover:bg-accent/50 transition-colors ${selectedItem === database.name ? 'bg-accent/60' : ''}`}
                                onClick={() => setSelectedItem(database.name)}
                            >
                                <Database className="h-4 w-4" />
                                <span>{database.name}</span>
                                <Badge variant="outline" className="ml-auto text-[10px]">
                                    {database.schemas.length} schemas
                                </Badge>
                            </div>

                            {/* Schema Level */}
                            <div className="ml-4 mt-1">
                                {database.schemas.map((schema) => {
                                    const tableCount = schema.tables.length;
                                    const enumCount = schema.enumTypes?.length || 0;
                                    const seqCount = schema.sequences?.length || 0;

                                    return (
                                        <div key={schema.name} className="mb-1">
                                            <div
                                                className={`flex items-center gap-2 p-2 rounded-md cursor-pointer 
                                                        hover:bg-accent transition-colors 
                                                        ${selectedItem === `${database.name}.${schema.name}` ? "bg-accent/60" : ""}`}
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
                                                <span className="font-medium text-sm text-foreground font-mono">{schema.name}</span>
                                                <div className="ml-auto flex items-center gap-1">
                                                    <Badge variant="outline" className="text-[10px]">{tableCount}</Badge>
                                                    {enumCount > 0 && (
                                                        <Tooltip>
                                                            <TooltipTrigger>
                                                                <Badge variant="outline" className="text-[10px] text-purple-600 border-purple-600/50">
                                                                    {enumCount} E
                                                                </Badge>
                                                            </TooltipTrigger>
                                                            <TooltipContent>Enum Types</TooltipContent>
                                                        </Tooltip>
                                                    )}
                                                    {seqCount > 0 && (
                                                        <Tooltip>
                                                            <TooltipTrigger>
                                                                <Badge variant="outline" className="text-[10px] text-emerald-600 border-emerald-600/50">
                                                                    {seqCount} S
                                                                </Badge>
                                                            </TooltipTrigger>
                                                            <TooltipContent>Sequences</TooltipContent>
                                                        </Tooltip>
                                                    )}
                                                </div>
                                            </div>

                                            {/* Schema Contents (Tables, Enums, Sequences) */}
                                            {expandedSchemas.has(schema.name) && (
                                                <div className="ml-6 mt-1">
                                                    {/* Tables */}
                                                    {schema.tables.map((table) => {
                                                        const fkCount = table.foreignKeys?.length || 0;
                                                        const idxCount = table.indexes?.length || 0;
                                                        const chkCount = table.checkConstraints?.length || 0;

                                                        return (
                                                            <ContextMenu key={table.name}>
                                                                <ContextMenuTrigger>
                                                                    <div className="mb-1">
                                                                        <div
                                                                            className={`flex items-center gap-2 p-2 rounded-md cursor-pointer 
                                                                                    hover:bg-accent transition-colors 
                                                                                    ${selectedItem === `${database.name}.${schema.name}.${table.name}` ? "bg-accent/60" : ""}`}
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
                                                                            <span className="text-sm text-foreground font-mono">{table.name}</span>
                                                                            <div className="ml-auto flex items-center gap-1">
                                                                                {table.type !== "BASE TABLE" && (
                                                                                    <Badge variant="outline" className="text-[10px] text-primary border-primary/50">
                                                                                        VIEW
                                                                                    </Badge>
                                                                                )}
                                                                                {fkCount > 0 && (
                                                                                    <Tooltip>
                                                                                        <TooltipTrigger>
                                                                                            <Badge variant="outline" className="text-[10px] text-cyan-600 border-cyan-600/50">
                                                                                                {fkCount} FK
                                                                                            </Badge>
                                                                                        </TooltipTrigger>
                                                                                        <TooltipContent>Foreign Keys</TooltipContent>
                                                                                    </Tooltip>
                                                                                )}
                                                                            </div>
                                                                        </div>

                                                                        {/* Column Level */}
                                                                        {expandedTables.has(table.name) && (
                                                                            <div className="ml-6 mt-1">
                                                                                {table.columns.map((column) => {
                                                                                    const fkInfo = getFkInfo(column, table.foreignKeys);
                                                                                    const isIndexed = table.indexes?.some(idx => idx.column_name === column.name && !idx.is_primary);
                                                                                    const isUnique = table.uniqueConstraints?.some(uc => uc.column_name === column.name);

                                                                                    return (
                                                                                        <ContextMenu key={column.name}>
                                                                                            <ContextMenuTrigger>
                                                                                                <Tooltip>
                                                                                                    <TooltipTrigger asChild>
                                                                                                        <div className="mb-0.5">
                                                                                                            <div
                                                                                                                className={`flex items-center justify-between gap-2 p-1.5 rounded-md cursor-pointer text-xs 
                                                                                                                        hover:bg-accent transition-colors
                                                                                                                        ${selectedItem === `${database.name}.${schema.name}.${table.name}.${column.name}` ? "bg-accent/60" : ""}`}
                                                                                                                onClick={() =>
                                                                                                                    setSelectedItem(`${database.name}.${schema.name}.${table.name}.${column.name}`)
                                                                                                                }
                                                                                                            >
                                                                                                                <div className="flex items-center gap-1 flex-1 min-w-0">
                                                                                                                    {column.isPrimaryKey && <Key className="h-3 w-3 text-amber-600 dark:text-amber-400 shrink-0" />}
                                                                                                                    {column.isForeignKey && <Link2 className="h-3 w-3 text-cyan-600 dark:text-cyan-400 shrink-0" />}
                                                                                                                    <span className={`truncate font-mono ${column.isPrimaryKey ? 'text-amber-600 dark:text-amber-400 font-medium' : column.isForeignKey ? 'text-cyan-600 dark:text-cyan-400' : 'text-foreground'}`}>
                                                                                                                        {column.name}
                                                                                                                    </span>
                                                                                                                    {isUnique && (
                                                                                                                        <span className="text-[9px] px-1 py-0.5 bg-purple-100 dark:bg-purple-900/30 text-purple-600 dark:text-purple-400 rounded shrink-0">
                                                                                                                            UQ
                                                                                                                        </span>
                                                                                                                    )}
                                                                                                                    {isIndexed && (
                                                                                                                        <span className="text-[9px] px-1 py-0.5 bg-blue-100 dark:bg-blue-900/30 text-blue-600 dark:text-blue-400 rounded shrink-0">
                                                                                                                            IDX
                                                                                                                        </span>
                                                                                                                    )}
                                                                                                                </div>
                                                                                                                <div className="flex items-center gap-1 shrink-0">
                                                                                                                    <span className="text-muted-foreground text-[10px]">{column.type}</span>
                                                                                                                    {!column.nullable && (
                                                                                                                        <span className="text-red-500 font-bold text-[10px]">*</span>
                                                                                                                    )}
                                                                                                                </div>
                                                                                                            </div>
                                                                                                        </div>
                                                                                                    </TooltipTrigger>
                                                                                                    <TooltipContent side="right" className="max-w-[250px]">
                                                                                                        <div className="text-xs space-y-1">
                                                                                                            <div className="font-semibold">{column.name}</div>
                                                                                                            <div>Type: {column.type}</div>
                                                                                                            <div>Nullable: {column.nullable ? 'Yes' : 'No'}</div>
                                                                                                            {column.defaultValue && <div>Default: {column.defaultValue}</div>}
                                                                                                            {fkInfo && (
                                                                                                                <div className="text-cyan-500 pt-1 border-t">
                                                                                                                    → {fkInfo.target_table}.{fkInfo.target_column}
                                                                                                                </div>
                                                                                                            )}
                                                                                                        </div>
                                                                                                    </TooltipContent>
                                                                                                </Tooltip>
                                                                                            </ContextMenuTrigger>
                                                                                            <ContextMenuContent className="bg-popover border-border">
                                                                                                <ContextMenuItem onClick={() => handleCopy(column.name, "Column name")} className="hover:bg-accent">
                                                                                                    <Copy className="h-4 w-4 mr-2" />Copy Column Name
                                                                                                </ContextMenuItem>
                                                                                                <ContextMenuItem onClick={() => handleCopy(column.type, "Column type")} className="hover:bg-accent">
                                                                                                    <Copy className="h-4 w-4 mr-2" />Copy Type
                                                                                                </ContextMenuItem>
                                                                                            </ContextMenuContent>
                                                                                        </ContextMenu>
                                                                                    );
                                                                                })}
                                                                            </div>
                                                                        )}
                                                                    </div>
                                                                </ContextMenuTrigger>
                                                                <ContextMenuContent className="bg-popover border-border">
                                                                    <ContextMenuItem onClick={() => handlePreviewRows(table.name)} className="hover:bg-accent">
                                                                        <Eye className="h-4 w-4 mr-2" />Preview Rows
                                                                    </ContextMenuItem>
                                                                    <ContextMenuItem onClick={() => handleShowDDL(table.name)} className="hover:bg-accent">
                                                                        <FileCode className="h-4 w-4 mr-2" />Show DDL
                                                                    </ContextMenuItem>
                                                                    <ContextMenuItem onClick={() => handleCopy(table.name, "Table name")} className="hover:bg-accent">
                                                                        <Copy className="h-4 w-4 mr-2" />Copy Table Name
                                                                    </ContextMenuItem>
                                                                    <ContextMenuItem onClick={() => handleExport(table.name)} className="hover:bg-accent">
                                                                        <Download className="h-4 w-4 mr-2" />Export Table
                                                                    </ContextMenuItem>
                                                                </ContextMenuContent>
                                                            </ContextMenu>
                                                        );
                                                    })}

                                                    {/* Enum Types Section */}
                                                    {schema.enumTypes && schema.enumTypes.length > 0 && (
                                                        <div className="mt-3 pt-2 border-t border-border">
                                                            <div className="text-[10px] font-semibold text-muted-foreground uppercase mb-1 px-2">Enum Types</div>
                                                            {/* Group enums by name */}
                                                            {Array.from(new Set(schema.enumTypes.map(e => e.enum_name))).map(enumName => {
                                                                const enumValues = schema.enumTypes?.filter(e => e.enum_name === enumName).map(e => e.enum_value) || [];
                                                                return (
                                                                    <Tooltip key={enumName}>
                                                                        <TooltipTrigger asChild>
                                                                            <div
                                                                                className={`flex items-center gap-2 p-1.5 rounded-md cursor-pointer text-xs hover:bg-accent transition-colors
                                                                                        ${selectedItem === `${database.name}.${schema.name}.enum.${enumName}` ? "bg-accent/60" : ""}`}
                                                                                onClick={() => setSelectedItem(`${database.name}.${schema.name}.enum.${enumName}`)}
                                                                            >
                                                                                <List className="h-3 w-3 text-purple-600 dark:text-purple-400" />
                                                                                <span className="text-foreground">{enumName}</span>
                                                                                <Badge variant="outline" className="ml-auto text-[9px]">{enumValues.length}</Badge>
                                                                            </div>
                                                                        </TooltipTrigger>
                                                                        <TooltipContent side="right">
                                                                            <div className="text-xs">
                                                                                <div className="font-semibold mb-1">Values:</div>
                                                                                {enumValues.map(v => (
                                                                                    <div key={v} className="text-muted-foreground">• {v}</div>
                                                                                ))}
                                                                            </div>
                                                                        </TooltipContent>
                                                                    </Tooltip>
                                                                );
                                                            })}
                                                        </div>
                                                    )}

                                                    {/* Sequences Section */}
                                                    {schema.sequences && schema.sequences.length > 0 && (
                                                        <div className="mt-3 pt-2 border-t border-border">
                                                            <div className="text-[10px] font-semibold text-muted-foreground uppercase mb-1 px-2">Sequences</div>
                                                            {schema.sequences.map(seq => (
                                                                <Tooltip key={seq.sequence_name}>
                                                                    <TooltipTrigger asChild>
                                                                        <div
                                                                            className={`flex items-center gap-2 p-1.5 rounded-md cursor-pointer text-xs hover:bg-accent transition-colors
                                                                                    ${selectedItem === `${database.name}.${schema.name}.seq.${seq.sequence_name}` ? "bg-accent/60" : ""}`}
                                                                            onClick={() => setSelectedItem(`${database.name}.${schema.name}.seq.${seq.sequence_name}`)}
                                                                        >
                                                                            <Hash className="h-3 w-3 text-emerald-600 dark:text-emerald-400" />
                                                                            <span className="text-foreground truncate">{seq.sequence_name}</span>
                                                                        </div>
                                                                    </TooltipTrigger>
                                                                    <TooltipContent side="right">
                                                                        <div className="text-xs">
                                                                            {seq.table_name && seq.column_name ? (
                                                                                <span>Used by: {seq.table_name}.{seq.column_name}</span>
                                                                            ) : (
                                                                                <span>Standalone sequence</span>
                                                                            )}
                                                                        </div>
                                                                    </TooltipContent>
                                                                </Tooltip>
                                                            ))}
                                                        </div>
                                                    )}
                                                </div>
                                            )}
                                        </div>
                                    );
                                })}
                            </div>
                        </div>
                    </div>
                </ScrollArea>
            </div>
        </TooltipProvider>
    );
}

export default TreeViewPanel