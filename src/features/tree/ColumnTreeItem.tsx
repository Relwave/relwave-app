// features/schema-explorer/components/tree/ColumnTreeItem.tsx

import { Copy, Key, Link2 } from "lucide-react";
import { ContextMenu, ContextMenuContent, ContextMenuItem, ContextMenuTrigger } from "@/components/ui/context-menu";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { ForeignKeyInfo } from "@/features/database/types";
import { Column } from "../er-diagram/types";

interface ColumnTreeItemProps {
    column: Column;
    isSelected: boolean;
    fkInfo?: ForeignKeyInfo;
    isIndexed: boolean;
    isUnique: boolean;
    onSelect: () => void;
    onCopy: (value: string, label: string) => void;
}

export const ColumnTreeItem = ({
    column,
    isSelected,
    fkInfo,
    isIndexed,
    isUnique,
    onSelect,
    onCopy,
}: ColumnTreeItemProps) => (
    <ContextMenu>
        <ContextMenuTrigger>
            <Tooltip>
                <TooltipTrigger asChild>
                    <div className="mb-0.5">
                        <div
                            className={`flex items-center justify-between gap-2 p-1.5 rounded-md cursor-pointer text-xs
                                hover:bg-accent transition-colors
                                ${isSelected ? "bg-accent/60" : ""}`}
                            onClick={onSelect}
                        >
                            <div className="flex items-center gap-1 flex-1 min-w-0">
                                {column.isPrimaryKey && <Key className="h-3 w-3 text-amber-600 dark:text-amber-400 shrink-0" />}
                                {column.isForeignKey && <Link2 className="h-3 w-3 text-cyan-600 dark:text-cyan-400 shrink-0" />}
                                <span className={`truncate font-mono ${column.isPrimaryKey
                                    ? "text-amber-600 dark:text-amber-400 font-medium"
                                    : column.isForeignKey
                                        ? "text-cyan-600 dark:text-cyan-400"
                                        : "text-foreground"
                                    }`}>
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
                                {!column.nullable && <span className="text-red-500 font-bold text-[10px]">*</span>}
                            </div>
                        </div>
                    </div>
                </TooltipTrigger>
                <TooltipContent side="right" className="max-w-62.5">
                    <div className="text-xs space-y-1">
                        <div className="font-semibold">{column.name}</div>
                        <div>Type: {column.type}</div>
                        <div>Nullable: {column.nullable ? "Yes" : "No"}</div>
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
            <ContextMenuItem onClick={() => onCopy(column.name, "Column name")} className="hover:bg-accent">
                <Copy className="h-4 w-4 mr-2" />Copy Column Name
            </ContextMenuItem>
            <ContextMenuItem onClick={() => onCopy(column.type, "Column type")} className="hover:bg-accent">
                <Copy className="h-4 w-4 mr-2" />Copy Type
            </ContextMenuItem>
        </ContextMenuContent>
    </ContextMenu>
);