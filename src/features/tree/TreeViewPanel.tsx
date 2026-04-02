// features/schema-explorer/components/TreeViewPanel.tsx

import { ChevronDown, ChevronRight, Database, Layers } from "lucide-react";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Badge } from "@/components/ui/badge";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { DatabaseSchema } from "../schema-explorer/types";
import { TableTreeItem } from "./TableTreeItem";
import { EnumSection, SequenceSection } from "./SchemaExtras";

export interface TreeViewPanelProps {
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


const TreeViewPanel = ({
    database,
    expandedSchemas,
    expandedTables,
    toggleSchema,
    toggleTable,
    selectedItem,
    setSelectedItem,
    handlePreviewRows,
    handleShowDDL,
    handleCopy,
    handleExport,
}: TreeViewPanelProps) => {
    return (
        <TooltipProvider delayDuration={300}>
            <div className="w-96 border-r border-border bg-card shrink-0">
                <ScrollArea className="h-full">
                    <div className="p-4">

                        {/* Database */}
                        <div className="mb-2">
                            <div
                                className={`flex items-center gap-2 p-2 rounded-md font-semibold text-sm
                                    text-primary cursor-pointer hover:bg-accent/50 transition-colors
                                    ${selectedItem === database.name ? "bg-accent/60" : ""}`}
                                onClick={() => setSelectedItem(database.name)}
                            >
                                <Database className="h-4 w-4" />
                                <span>{database.name}</span>
                                <Badge variant="outline" className="ml-auto text-[10px]">
                                    {database.schemas.length} schemas
                                </Badge>
                            </div>

                            {/* Schemas */}
                            <div className="ml-4 mt-1">
                                {database.schemas.map((schema) => {
                                    const schemaKey = `${database.name}:::${schema.name}`;
                                    const isSchemaExpanded = expandedSchemas.has(schema.name);
                                    const enumCount = schema.enumTypes?.length || 0;
                                    const seqCount = schema.sequences?.length || 0;

                                    return (
                                        <div key={schema.name} className="mb-1">
                                            {/* Schema Row */}
                                            <div
                                                className={`flex items-center gap-2 p-2 rounded-md cursor-pointer
                                                    hover:bg-accent transition-colors
                                                    ${selectedItem === schemaKey ? "bg-accent/60" : ""}`}
                                                onClick={() => { toggleSchema(schema.name); setSelectedItem(schemaKey); }}
                                            >
                                                {isSchemaExpanded
                                                    ? <ChevronDown className="h-4 w-4 text-muted-foreground" />
                                                    : <ChevronRight className="h-4 w-4 text-muted-foreground" />
                                                }
                                                <Layers className="h-4 w-4 text-indigo-600 dark:text-indigo-400" />
                                                <span className="font-medium text-sm text-foreground font-mono">{schema.name}</span>
                                                <div className="ml-auto flex items-center gap-1">
                                                    <Badge variant="outline" className="text-[10px]">{schema.tables.length}</Badge>
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

                                            {/* Schema Contents */}
                                            {isSchemaExpanded && (
                                                <div className="ml-6 mt-1">
                                                    {schema.tables.map((table) => (
                                                        <TableTreeItem
                                                            key={table.name}
                                                            table={table}
                                                            dbName={database.name}
                                                            schemaName={schema.name}
                                                            isExpanded={expandedTables.has(table.name)}
                                                            isSelected={selectedItem === `${database.name}:::${schema.name}:::${table.name}`}
                                                            selectedItem={selectedItem}
                                                            onToggle={() => toggleTable(table.name)}
                                                            onSelect={() => setSelectedItem(`${database.name}:::${schema.name}:::${table.name}`)}
                                                            onSelectItem={setSelectedItem}
                                                            onPreviewRows={handlePreviewRows}
                                                            onShowDDL={handleShowDDL}
                                                            onCopy={handleCopy}
                                                            onExport={handleExport}
                                                        />
                                                    ))}

                                                    {schema.enumTypes && schema.enumTypes.length > 0 && (
                                                        <EnumSection
                                                            dbName={database.name}
                                                            schemaName={schema.name}
                                                            enumTypes={schema.enumTypes}
                                                            selectedItem={selectedItem}
                                                            onSelect={setSelectedItem}
                                                        />
                                                    )}

                                                    {schema.sequences && schema.sequences.length > 0 && (
                                                        <SequenceSection
                                                            dbName={database.name}
                                                            schemaName={schema.name}
                                                            sequences={schema.sequences}
                                                            selectedItem={selectedItem}
                                                            onSelect={setSelectedItem}
                                                        />
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
};

export default TreeViewPanel;