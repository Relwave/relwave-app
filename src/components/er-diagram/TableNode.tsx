import { ColumnDetails, ForeignKeyInfo, TableSchemaDetails } from '@/types/database';
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
            <div className={`min-w-[220px] shadow-md border border-border rounded-md bg-card relative border-l-4 ${schemaColorClass} ${highlightClass} transition-all duration-200`}>
                {/* Header */}
                <div className="bg-muted px-3 py-2 font-mono text-sm font-medium flex items-center gap-2 rounded-tr-md border-b border-border">
                    <button
                        onClick={() => setIsCollapsed(!isCollapsed)}
                        className="p-0.5 hover:bg-background/50 rounded transition-colors"
                    >
                        {isCollapsed ? (
                            <ChevronRight className="h-3.5 w-3.5 text-muted-foreground" />
                        ) : (
                            <ChevronDown className="h-3.5 w-3.5 text-muted-foreground" />
                        )}
                    </button>
                    <Table2 className="h-3.5 w-3.5 text-muted-foreground" />
                    <span className="text-foreground font-semibold">{data.label}</span>
                    <span className="text-[10px] text-muted-foreground ml-auto px-1.5 py-0.5 bg-background/50 rounded">
                        {data.schema}
                    </span>
                </div>

                {/* Columns */}
                <div className="divide-y divide-border">
                    {visibleColumns.map((col) => {
                        const isUnique = uniqueColumns.has(col.name);
                        const isIndexed = indexedColumns.has(col.name);
                        const isFkSource = fkSourceColumns.has(col.name);
                        const isPkTarget = pkColumns.has(col.name);
                        const handleId = `${data.label}-${col.name}`;
                        const fkInfo = fkTargetMap.get(col.name);

                        // Build tooltip content
                        const tooltipContent = (
                            <div className="text-xs space-y-1 max-w-[250px]">
                                <div className="font-semibold border-b pb-1 mb-1 text-white">{col.name}</div>
                                <div className="text-muted-foreground"><span>Type:</span> {col.type}</div>
                                <div className='text-muted-foreground'><span>Nullable:</span> {col.nullable ? "Yes" : "No"}</div>
                                {col.defaultValue && (
                                    <div><span className="text-muted-foreground">Default:</span> {col.defaultValue}</div>
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
                                        className="px-3 py-1.5 text-xs font-mono flex items-center justify-between gap-2 relative hover:bg-muted/50 transition-colors cursor-default"
                                    >
                                        {/* Left handle for incoming connections (target) - for PK/unique columns */}
                                        {(isPkTarget || isUnique) && (
                                            <Handle
                                                type="target"
                                                position={Position.Left}
                                                id={handleId}
                                                className="w-2! h-2! bg-amber-500! border-amber-600!"
                                                style={{ top: '50%' }}
                                            />
                                        )}

                                        {/* Right handle for outgoing connections (source) - for FK columns */}
                                        {isFkSource && (
                                            <Handle
                                                type="source"
                                                position={Position.Right}
                                                id={handleId}
                                                className="w-2! h-2! bg-cyan-500! border-cyan-600!"
                                                style={{ top: '50%' }}
                                            />
                                        )}

                                        <div className="flex items-center gap-1.5 min-w-0">
                                            {col.isPrimaryKey && (
                                                <Key className="h-3 w-3 text-amber-500 shrink-0" />
                                            )}
                                            <span className={`truncate ${col.isPrimaryKey
                                                ? "text-amber-600 dark:text-amber-400 font-medium"
                                                : col.isForeignKey
                                                    ? "text-cyan-600 dark:text-cyan-400"
                                                    : "text-foreground"
                                                }`}>
                                                {col.name}
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
                                            <span className="text-muted-foreground text-[10px]">{col.type}</span>
                                            {col.isForeignKey && (
                                                <span className="text-cyan-500">→</span>
                                            )}
                                            {!col.nullable && (
                                                <span className="text-[10px] text-red-500 font-bold">*</span>
                                            )}
                                        </div>
                                    </div>
                                </TooltipTrigger>
                                <TooltipContent side="right" className="bg-popover border shadow-lg">
                                    {tooltipContent}
                                </TooltipContent>
                            </Tooltip>
                        );
                    })}
                </div>

                {/* Collapsed indicator */}
                {isCollapsed && data.columns.length > visibleColumns.length && (
                    <div className="px-3 py-1 text-[10px] text-muted-foreground text-center bg-muted/30">
                        +{data.columns.length - visibleColumns.length} more columns
                    </div>
                )}

                {/* Footer with constraint counts */}
                {(data.foreignKeys?.length || data.indexes?.length || data.checkConstraints?.length) ? (
                    <div className="px-3 py-1.5 bg-muted/50 text-[10px] text-muted-foreground flex gap-3 rounded-br-md border-t border-border">
                        {data.foreignKeys && data.foreignKeys.length > 0 && (
                            <Tooltip>
                                <TooltipTrigger asChild>
                                    <span className="cursor-help hover:text-foreground transition-colors">
                                        {data.foreignKeys.length} FK
                                    </span>
                                </TooltipTrigger>
                                <TooltipContent side="bottom" className="bg-popover border shadow-lg text-white">
                                    <div className="text-xs space-y-1">
                                        <div className="font-semibold border-b pb-1">Foreign Keys</div>
                                        {data.foreignKeys.map(fk => (
                                            <div key={fk.constraint_name}>
                                                {fk.source_column} → {fk.target_table}.{fk.target_column}
                                            </div>
                                        ))}
                                    </div>
                                </TooltipContent>
                            </Tooltip>
                        )}
                        {data.indexes && data.indexes.length > 0 && (
                            <Tooltip>
                                <TooltipTrigger asChild>
                                    <span className="cursor-help hover:text-foreground transition-colors">
                                        {data.indexes.length} IDX
                                    </span>
                                </TooltipTrigger>
                                <TooltipContent side="bottom" className="bg-popover border shadow-lg text-white">
                                    <div className="text-xs space-y-1">
                                        <div className="font-semibold border-b pb-1">Indexes</div>
                                        {data.indexes.map(idx => (
                                            <div key={idx.index_name}>
                                                {idx.index_name} ({idx.column_name})
                                                {idx.is_unique && " • Unique"}
                                            </div>
                                        ))}
                                    </div>
                                </TooltipContent>
                            </Tooltip>
                        )}
                        {data.checkConstraints && data.checkConstraints.length > 0 && (
                            <Tooltip>
                                <TooltipTrigger asChild>
                                    <span className="cursor-help hover:text-foreground transition-colors">
                                        {data.checkConstraints.length} CHK
                                    </span>
                                </TooltipTrigger>
                                <TooltipContent side="bottom" className="bg-popover border shadow-lg">
                                    <div className="text-xs space-y-1">
                                        <div className="font-semibold border-b pb-1">Check Constraints</div>
                                        {data.checkConstraints.map(chk => (
                                            <div key={chk.constraint_name} className="max-w-[200px] truncate">
                                                {chk.constraint_name}: {chk.definition}
                                            </div>
                                        ))}
                                    </div>
                                </TooltipContent>
                            </Tooltip>
                        )}
                        <span className="ml-auto">{data.columns.length} cols</span>
                    </div>
                ) : null}
            </div>
        </TooltipProvider>
    );
};

export default TableNode