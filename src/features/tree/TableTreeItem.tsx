// features/schema-explorer/components/tree/TableTreeItem.tsx

import { ChevronDown, ChevronRight, Copy, Download, Eye, FileCode, Table } from "lucide-react";
import { ContextMenu, ContextMenuContent, ContextMenuItem, ContextMenuTrigger } from "@/components/ui/context-menu";
import { Badge } from "@/components/ui/badge";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { ForeignKeyInfo } from "@/features/database/types";
import { Column } from "../er-diagram/types";
import { ColumnTreeItem } from "./ColumnTreeItem";

interface TableTreeItemProps {
    table: any;
    dbName: string;
    schemaName: string;
    isExpanded: boolean;
    isSelected: boolean;
    selectedItem: string | null;
    onToggle: () => void;
    onSelect: () => void;
    onSelectItem: (key: string) => void;
    onPreviewRows: (tableName: string) => void;
    onShowDDL: (tableName: string) => void;
    onCopy: (value: string, label: string) => void;
    onExport: (tableName: string) => void;
}

const getFkInfo = (column: Column, foreignKeys?: ForeignKeyInfo[]) =>
    foreignKeys?.find((fk) => fk.source_column === column.name);

export const TableTreeItem = ({
    table,
    dbName,
    schemaName,
    isExpanded,
    isSelected,
    selectedItem,
    onToggle,
    onSelect,
    onSelectItem,
    onPreviewRows,
    onShowDDL,
    onCopy,
    onExport,
}: TableTreeItemProps) => {
    const fkCount = table.foreignKeys?.length || 0;

    return (
        <ContextMenu>
            <ContextMenuTrigger>
                <div className="mb-1">
                    {/* Table Row */}
                    <div
                        className={`flex items-center gap-2 p-2 rounded-md cursor-pointer
                            hover:bg-accent transition-colors
                            ${isSelected ? "bg-accent/60" : ""}`}
                        onClick={() => { onToggle(); onSelect(); }}
                    >
                        {isExpanded
                            ? <ChevronDown className="h-4 w-4 text-muted-foreground" />
                            : <ChevronRight className="h-4 w-4 text-muted-foreground" />
                        }
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

                    {/* Columns */}
                    {isExpanded && (
                        <div className="ml-6 mt-1">
                            {table.columns.map((column: Column) => (
                                <ColumnTreeItem
                                    key={column.name}
                                    column={column}
                                    isSelected={selectedItem === `${dbName}:::${schemaName}:::${table.name}:::${column.name}`}
                                    fkInfo={getFkInfo(column, table.foreignKeys)}
                                    isIndexed={!!table.indexes?.some((idx: any) => idx.column_name === column.name && !idx.is_primary)}
                                    isUnique={!!table.uniqueConstraints?.some((uc: any) => uc.column_name === column.name)}
                                    onSelect={() => onSelectItem(`${dbName}:::${schemaName}:::${table.name}:::${column.name}`)}
                                    onCopy={onCopy}
                                />
                            ))}
                        </div>
                    )}
                </div>
            </ContextMenuTrigger>
            <ContextMenuContent className="bg-popover border-border">
                <ContextMenuItem onClick={() => onPreviewRows(table.name)} className="hover:bg-accent">
                    <Eye className="h-4 w-4 mr-2" />Preview Rows
                </ContextMenuItem>
                <ContextMenuItem onClick={() => onShowDDL(table.name)} className="hover:bg-accent">
                    <FileCode className="h-4 w-4 mr-2" />Show DDL
                </ContextMenuItem>
                <ContextMenuItem onClick={() => onCopy(table.name, "Table name")} className="hover:bg-accent">
                    <Copy className="h-4 w-4 mr-2" />Copy Table Name
                </ContextMenuItem>
                <ContextMenuItem onClick={() => onExport(table.name)} className="hover:bg-accent">
                    <Download className="h-4 w-4 mr-2" />Export Table
                </ContextMenuItem>
            </ContextMenuContent>
        </ContextMenu>
    );
};