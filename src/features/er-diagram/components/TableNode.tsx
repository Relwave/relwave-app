import { ColumnDetails, ForeignKeyInfo, TableSchemaDetails } from '@/features/database/types';
import { ChevronDown, ChevronRight, Key, Table2 } from 'lucide-react';
import React, { useState } from 'react'
import { Handle, Position } from 'reactflow';
import {
    Tooltip,
    TooltipContent,
    TooltipProvider,
    TooltipTrigger,
} from "@/components/ui/tooltip";

interface Column extends ColumnDetails {
    fkRef?: string;
}

interface TableNodeData {
    label: string;
    schema: string;
    columns: Column[];
    foreignKeys?: ForeignKeyInfo[];
    indexes?: TableSchemaDetails["indexes"];
    uniqueConstraints?: TableSchemaDetails["uniqueConstraints"];
    checkConstraints?: TableSchemaDetails["checkConstraints"];
    isHighlighted?: boolean;
}

// Schema color mapping
const SCHEMA_COLORS: Record<string, string> = {
    public: "border-l-blue-500",
    private: "border-l-purple-500",
    auth: "border-l-emerald-500",
    analytics: "border-l-amber-500",
};

const TableNode: React.FC<{ data: TableNodeData }> = ({ data }) => {
    const [isCollapsed, setIsCollapsed] = useState(false);

    // Build a set of unique columns for quick lookup
    const uniqueColumns = new Set(
        data.uniqueConstraints?.map(uc => uc.column_name) || []
    );

    // Build a set of indexed columns
    const indexedColumns = new Set(
        data.indexes?.filter(idx => !idx.is_primary).map(idx => idx.column_name) || []
    );

    // Build sets for FK source and target columns
    const fkSourceColumns = new Set(
        data.foreignKeys?.map(fk => fk.source_column) || []
    );

    // Map FK source to target info for tooltips
    const fkTargetMap = new Map(
        data.foreignKeys?.map(fk => [fk.source_column, fk]) || []
    );

    // Columns that are referenced by other tables (targets of FKs)
    const pkColumns = new Set(
        data.columns.filter(col => col.isPrimaryKey).map(col => col.name)
    );

    // Filter columns based on collapse state
    const visibleColumns = isCollapsed
        ? data.columns.filter(col => col.isPrimaryKey || col.isForeignKey)
        : data.columns;

    const schemaColorClass = SCHEMA_COLORS[data.schema] || "border-l-gray-500";
    const highlightClass = data.isHighlighted
        ? "ring-2 ring-cyan-500 ring-offset-2 ring-offset-background"
        : "";

    return (
        <TooltipProvider delayDuration={200}>
            <div className={`min-w-56 shadow-md border border-border rounded-lg bg-card relative ${highlightClass} transition-all duration-200 overflow-hidden`}>
                {/* Header */}
                <div className="px-3 py-2 bg-muted/50 border-b border-border/50 flex justify-between items-center">
                    <div className="flex items-center gap-2 text-xs font-bold font-mono">
                        <button
                            onClick={() => setIsCollapsed(!isCollapsed)}
                            className="p-0.5 hover:bg-background/50 rounded transition-colors mr-0.5"
                        >
                            {isCollapsed ? (
                                <ChevronRight className="h-3.5 w-3.5 text-muted-foreground" />
                            ) : (
                                <ChevronDown className="h-3.5 w-3.5 text-muted-foreground" />
                            )}
                        </button>
                        <Table2 className="h-3.5 w-3.5 text-blue-500 shrink-0" />
                        <span className="text-foreground">{data.label}</span>
                    </div>
                    {data.schema !== 'public' && (
                        <span className="text-[9px] text-muted-foreground ml-2 px-1.5 py-0.5 bg-background/50 rounded uppercase tracking-wider">
                            {data.schema}
                        </span>
                    )}
                </div>

                {/* Columns */}
                <div className="p-2 space-y-1 bg-background/95">
                    {visibleColumns.map((col) => {
                        const isUnique = uniqueColumns.has(col.name);
                        const isIndexed = indexedColumns.has(col.name);
                        const isFkSource = fkSourceColumns.has(col.name);
                        const isPkTarget = pkColumns.has(col.name);
                        const handleId = `${data.label}-${col.name}`;
                        const fkInfo = fkTargetMap.get(col.name);

                        // Build tooltip content
                        const tooltipContent = (
                            <div className="text-xs space-y-1 max-w-62.5">
                                <div className="font-semibold border-b pb-1 mb-1 dark:text-white text-black">{col.name}</div>
                                <div className="text-muted-foreground"><span>Type:</span> {col.type}</div>
                                <div className='text-muted-foreground'><span>Nullable:</span> {col.nullable ? "Yes" : "No"}</div>
                                {col.defaultValue && (
                                    <div><span className="text- dark:text-muted-foreground">Default:</span> {col.defaultValue}</div>
                                )}
                                {col.isPrimaryKey && (
                                    <div className="text-amber-500">🔑 Primary Key</div>
                                )}
                                {fkInfo && (
                                    <div className="text-cyan-500 border-t pt-1 mt-1">
                                        <div>→ References: {fkInfo.target_table}.{fkInfo.target_column}</div>
                                        <div className="text-[10px] text-muted-foreground">
                                            ON DELETE: {fkInfo.delete_rule} | ON UPDATE: {fkInfo.update_rule}
                                        </div>
                                    </div>
                                )}
                                {isUnique && <div className="text-purple-500">Unique constraint</div>}
                                {isIndexed && <div className="text-blue-500">Indexed</div>}
                            </div>
                        );

                        return (
                            <Tooltip key={handleId}>
                                <TooltipTrigger asChild>
                                    <div
                                        id={handleId}
                                        className={`flex justify-between items-center text-[11px] px-1.5 py-0.5 font-mono relative cursor-default ${isFkSource ? 'bg-cyan-500/10 rounded' : 'hover:bg-muted/50 rounded transition-colors'}`}
                                    >
                                        {/* Left handle for incoming connections (target) - for PK/unique columns */}
                                        {(isPkTarget || isUnique) && (
                                            <Handle
                                                type="target"
                                                position={Position.Left}
                                                id={handleId}
                                                className="w-1! h-1! opacity-0 pointer-events-none"
                                                style={{ left: '-8px' }}
                                            />
                                        )}

                                        {/* Right handle for outgoing connections (source) - for FK columns */}
                                        {isFkSource && (
                                            <Handle
                                                type="source"
                                                position={Position.Right}
                                                id={handleId}
                                                className="w-1! h-1! opacity-0 pointer-events-none"
                                                style={{ right: '-8px' }}
                                            />
                                        )}

                                        <div className="flex items-center gap-1.5 min-w-0 flex-1">
                                            {col.isPrimaryKey ? (
                                                <span className="w-2.5 h-2.5 bg-amber-500 rounded-full shrink-0" />
                                            ) : col.isForeignKey ? (
                                                <span className="w-2.5 h-2.5 bg-cyan-500 rounded-full shrink-0" />
                                            ) : (
                                                <span className="w-2.5 h-2.5 shrink-0" />
                                            )}
                                            
                                            <span className={`truncate ${col.isPrimaryKey ? "font-medium" : col.isForeignKey ? "text-cyan-600 dark:text-cyan-400 font-medium" : "text-foreground"}`}>
                                                {col.name}
                                            </span>
                                            
                                            {!col.nullable && (
                                                <span className="text-[10px] text-red-500 font-bold shrink-0">*</span>
                                            )}
                                        </div>
                                        <div className="flex items-center gap-1 shrink-0 ml-4">
                                            <span className="text-muted-foreground">{col.type}</span>
                                        </div>
                                    </div>
                                </TooltipTrigger>
                                <TooltipContent side="right" className="bg-popover border shadow-lg">
                                    {tooltipContent}
                                </TooltipContent>
                            </Tooltip>
                        );
                    })}

                    {/* Collapsed indicator */}
                    {isCollapsed && data.columns.length > visibleColumns.length && (
                        <div className="px-3 py-1 text-[10px] text-muted-foreground text-center bg-muted/30 rounded-md mt-1">
                            +{data.columns.length - visibleColumns.length} more columns
                        </div>
                    )}
                </div>
            </div>
        </TooltipProvider>
    );
};

export default TableNode