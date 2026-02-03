import { Node } from "reactflow";
import {
    Table2,
    ChevronRight,
    ChevronDown,
    X,
    PanelLeftClose,
    PanelLeft,
    History,
    Columns3,
    Layers,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { ScrollArea } from "@/components/ui/scroll-area";
import {
    Select,
    SelectContent,
    SelectItem,
    SelectTrigger,
    SelectValue,
} from "@/components/ui/select";
import {
    Collapsible,
    CollapsibleContent,
    CollapsibleTrigger,
} from "@/components/ui/collapsible";
import { cn } from "@/lib/utils";
import { QueryFilter, ColumnOption, QueryHistoryItem, TableSchema } from "./types";
import { BuilderSidebarProps } from "./types";


export function BuilderSidebar({
    isOpen,
    onToggle,
    tables,
    nodes,
    history,
    availableColumns,
    availableSchemas,
    selectedSchema,
    onSchemaChange,
    filters,
    selectedColumns,
    sortBy,
    sortOrder,
    groupBy,
    limit,
    tablesExpanded,
    configExpanded,
    historyExpanded,
    onTablesExpandedChange,
    onConfigExpandedChange,
    onHistoryExpandedChange,
    onAddTable,
    onRemoveTable,
    onFiltersChange,
    onSelectedColumnsChange,
    onSortByChange,
    onSortOrderChange,
    onGroupByChange,
    onLimitChange,
    onHistorySelect,
    onClearHistory,
}: BuilderSidebarProps) {
    const addFilter = () => {
        onFiltersChange([...filters, { column: "", operator: "=", value: "" }]);
    };

    const removeFilter = (index: number) => {
        onFiltersChange(filters.filter((_, i) => i !== index));
    };

    const updateFilter = (index: number, field: keyof QueryFilter, value: string) => {
        const newFilters = [...filters];
        newFilters[index][field] = value;
        onFiltersChange(newFilters);
    };

    if (!isOpen) {
        return (
            <div className="w-10 border-r border-border/40 flex flex-col items-center py-2">
                <Button
                    variant="ghost"
                    size="sm"
                    className="h-8 w-8 p-0"
                    onClick={onToggle}
                >
                    <PanelLeft className="h-4 w-4" />
                </Button>
            </div>
        );
    }

    return (
        <aside className="w-64 border-r border-border/40 bg-muted/20 flex flex-col shrink-0">
            {/* Sidebar Header */}
            <div className="h-10 border-b border-border/40 flex items-center justify-between px-3 shrink-0">
                <span className="text-xs font-medium text-muted-foreground uppercase tracking-wider">
                    Explorer
                </span>
                <Button
                    variant="ghost"
                    size="sm"
                    className="h-6 w-6 p-0"
                    onClick={onToggle}
                >
                    <PanelLeftClose className="h-3.5 w-3.5" />
                </Button>
            </div>

            <ScrollArea className="flex-1">
                <div className="p-2 space-y-1">
                    {/* Tables Section */}
                    <Collapsible open={tablesExpanded} onOpenChange={onTablesExpandedChange}>
                        <CollapsibleTrigger className="flex items-center gap-2 w-full px-2 py-1.5 text-xs font-medium text-muted-foreground hover:text-foreground rounded hover:bg-muted/50">
                            {tablesExpanded ? (
                                <ChevronDown className="h-3.5 w-3.5" />
                            ) : (
                                <ChevronRight className="h-3.5 w-3.5" />
                            )}
                            <Table2 className="h-3.5 w-3.5" />
                            TABLES
                            <span className="ml-auto text-[10px] text-muted-foreground/60">
                                {tables.length}
                            </span>
                        </CollapsibleTrigger>
                        <CollapsibleContent className="mt-1 space-y-2">
                            {/* Schema Filter */}
                            {availableSchemas.length > 0 && (
                                <div className="px-2">
                                    <Select
                                        value={selectedSchema}
                                        onValueChange={onSchemaChange}
                                    >
                                        <SelectTrigger className="h-7 text-xs">
                                            <Layers className="h-3 w-3 mr-1.5 shrink-0" />
                                            <SelectValue placeholder="All Schemas" />
                                        </SelectTrigger>
                                        <SelectContent>
                                            <SelectItem value="__all__">
                                                <span className="flex items-center gap-2">
                                                    All Schemas
                                                </span>
                                            </SelectItem>
                                            {availableSchemas.map((schema) => (
                                                <SelectItem key={schema} value={schema}>
                                                    {schema}
                                                </SelectItem>
                                            ))}
                                        </SelectContent>
                                    </Select>
                                </div>
                            )}
                            <div className="space-y-0.5 pl-4">
                                {tables.map((table) => {
                                    const isAdded = nodes.some(
                                        (n) => n.data?.tableName === table.name
                                    );
                                    return (
                                        <button
                                            key={table.name}
                                            onClick={() => {
                                                if (isAdded) {
                                                    onRemoveTable(`table-${table.name}`);
                                                } else {
                                                    onAddTable(table.name);
                                                }
                                            }}
                                            className={cn(
                                                "flex items-center gap-2 w-full px-2 py-1 text-xs rounded transition-colors text-left",
                                                isAdded
                                                    ? "text-primary bg-primary/10 hover:bg-primary/5"
                                                    : "text-muted-foreground hover:text-foreground hover:bg-muted/50"
                                            )}
                                        >
                                            <Table2 className="h-3 w-3 shrink-0" />
                                            <span className="truncate font-mono">{table.name}</span>
                                            {isAdded && (
                                                <span className="ml-auto text-[10px] text-primary">
                                                    ✓
                                                </span>
                                            )}
                                        </button>
                                    );
                                })}
                            </div>
                        </CollapsibleContent>
                    </Collapsible>

                    {/* Query Config Section */}
                    <Collapsible open={configExpanded} onOpenChange={onConfigExpandedChange}>
                        <CollapsibleTrigger className="flex items-center gap-2 w-full px-2 py-1.5 text-xs font-medium text-muted-foreground hover:text-foreground rounded hover:bg-muted/50">
                            {configExpanded ? (
                                <ChevronDown className="h-3.5 w-3.5" />
                            ) : (
                                <ChevronRight className="h-3.5 w-3.5" />
                            )}
                            <Columns3 className="h-3.5 w-3.5" />
                            CONFIGURATION
                        </CollapsibleTrigger>
                        <CollapsibleContent className="mt-1 space-y-3 px-2">
                            {/* Selected Columns */}
                            <div className="space-y-1.5">
                                <div className="flex items-center justify-between">
                                    <span className="text-[10px] font-medium text-muted-foreground uppercase">
                                        Columns
                                    </span>
                                    {selectedColumns.length > 0 && (
                                        <button
                                            onClick={() => onSelectedColumnsChange([])}
                                            className="text-[10px] text-muted-foreground hover:text-foreground"
                                        >
                                            Clear
                                        </button>
                                    )}
                                </div>
                                <Select
                                    value=""
                                    onValueChange={(val) => {
                                        if (!selectedColumns.includes(val)) {
                                            onSelectedColumnsChange([...selectedColumns, val]);
                                        }
                                    }}
                                >
                                    <SelectTrigger className="h-7 text-xs">
                                        <SelectValue placeholder="Add column..." />
                                    </SelectTrigger>
                                    <SelectContent>
                                        {availableColumns.length > 0 ? (
                                            availableColumns.map((col) => (
                                                <SelectItem key={col.value} value={col.value} className="text-xs">
                                                    {col.value.split(".")[1]}
                                                </SelectItem>
                                            ))
                                        ) : (
                                            <SelectItem value="_" disabled className="text-xs">
                                                Add tables first
                                            </SelectItem>
                                        )}
                                    </SelectContent>
                                </Select>
                                {selectedColumns.length > 0 && (
                                    <div className="flex flex-wrap gap-1">
                                        {selectedColumns.map((col) => (
                                            <span
                                                key={col}
                                                className="inline-flex items-center gap-1 bg-primary/10 text-primary px-1.5 py-0.5 rounded text-[10px]"
                                            >
                                                {col.split(".")[1]}
                                                <button
                                                    onClick={() =>
                                                        onSelectedColumnsChange(selectedColumns.filter((c) => c !== col))
                                                    }
                                                >
                                                    <X className="h-2.5 w-2.5" />
                                                </button>
                                            </span>
                                        ))}
                                    </div>
                                )}
                                {selectedColumns.length === 0 && (
                                    <p className="text-[10px] text-muted-foreground/60">SELECT *</p>
                                )}
                            </div>

                            {/* Filters */}
                            <div className="space-y-1.5">
                                <div className="flex items-center justify-between">
                                    <span className="text-[10px] font-medium text-muted-foreground uppercase">
                                        Filters
                                    </span>
                                    <button
                                        onClick={addFilter}
                                        className="text-[10px] text-primary hover:text-primary/80"
                                    >
                                        + Add
                                    </button>
                                </div>
                                {filters.length > 0 ? (
                                    <div className="space-y-1.5">
                                        {filters.map((filter, index) => (
                                            <div key={index} className="flex items-center gap-1">
                                                <Select
                                                    value={filter.column}
                                                    onValueChange={(val) => updateFilter(index, "column", val)}
                                                >
                                                    <SelectTrigger className="h-6 text-[10px] flex-1">
                                                        <SelectValue placeholder="Col" />
                                                    </SelectTrigger>
                                                    <SelectContent>
                                                        {availableColumns.map((col) => (
                                                            <SelectItem key={col.value} value={col.value} className="text-xs">
                                                                {col.value.split(".")[1]}
                                                            </SelectItem>
                                                        ))}
                                                    </SelectContent>
                                                </Select>
                                                <Select
                                                    value={filter.operator}
                                                    onValueChange={(val) => updateFilter(index, "operator", val)}
                                                >
                                                    <SelectTrigger className="h-6 text-[10px] w-12">
                                                        <SelectValue />
                                                    </SelectTrigger>
                                                    <SelectContent>
                                                        <SelectItem value="=">=</SelectItem>
                                                        <SelectItem value="!=">!=</SelectItem>
                                                        <SelectItem value=">">{">"}</SelectItem>
                                                        <SelectItem value="<">{"<"}</SelectItem>
                                                        <SelectItem value="LIKE">LIKE</SelectItem>
                                                    </SelectContent>
                                                </Select>
                                                <Input
                                                    value={filter.value}
                                                    onChange={(e) => updateFilter(index, "value", e.target.value)}
                                                    placeholder="Value"
                                                    className="h-6 text-[10px] flex-1"
                                                />
                                                <button
                                                    onClick={() => removeFilter(index)}
                                                    className="text-muted-foreground hover:text-destructive p-0.5"
                                                >
                                                    <X className="h-3 w-3" />
                                                </button>
                                            </div>
                                        ))}
                                    </div>
                                ) : (
                                    <p className="text-[10px] text-muted-foreground/60">No filters</p>
                                )}
                            </div>

                            {/* Sort */}
                            <div className="space-y-1.5">
                                <span className="text-[10px] font-medium text-muted-foreground uppercase">
                                    Sort By
                                </span>
                                <div className="flex gap-1">
                                    <Select value={sortBy} onValueChange={onSortByChange}>
                                        <SelectTrigger className="h-7 text-xs flex-1">
                                            <SelectValue placeholder="Column..." />
                                        </SelectTrigger>
                                        <SelectContent>
                                            {availableColumns.map((col) => (
                                                <SelectItem key={col.value} value={col.value} className="text-xs">
                                                    {col.value.split(".")[1]}
                                                </SelectItem>
                                            ))}
                                        </SelectContent>
                                    </Select>
                                    <Select
                                        value={sortOrder}
                                        onValueChange={(v) => onSortOrderChange(v as "ASC" | "DESC")}
                                    >
                                        <SelectTrigger className="h-7 text-xs w-16">
                                            <SelectValue />
                                        </SelectTrigger>
                                        <SelectContent>
                                            <SelectItem value="ASC" className="text-xs">ASC</SelectItem>
                                            <SelectItem value="DESC" className="text-xs">DESC</SelectItem>
                                        </SelectContent>
                                    </Select>
                                </div>
                            </div>

                            {/* Group By */}
                            <div className="space-y-1.5">
                                <span className="text-[10px] font-medium text-muted-foreground uppercase">
                                    Group By
                                </span>
                                <Select value={groupBy} onValueChange={onGroupByChange}>
                                    <SelectTrigger className="h-7 text-xs">
                                        <SelectValue placeholder="Column..." />
                                    </SelectTrigger>
                                    <SelectContent>
                                        {availableColumns.map((col) => (
                                            <SelectItem key={col.value} value={col.value} className="text-xs">
                                                {col.value.split(".")[1]}
                                            </SelectItem>
                                        ))}
                                    </SelectContent>
                                </Select>
                            </div>

                            {/* Limit */}
                            <div className="space-y-1.5">
                                <span className="text-[10px] font-medium text-muted-foreground uppercase">
                                    Limit
                                </span>
                                <div className="flex gap-1">
                                    {[10, 50, 100, 500].map((val) => (
                                        <button
                                            key={val}
                                            onClick={() => onLimitChange(val)}
                                            className={cn(
                                                "flex-1 h-6 text-[10px] rounded border transition-colors",
                                                limit === val
                                                    ? "border-primary bg-primary/10 text-primary"
                                                    : "border-border/40 text-muted-foreground hover:border-primary/50"
                                            )}
                                        >
                                            {val}
                                        </button>
                                    ))}
                                </div>
                            </div>
                        </CollapsibleContent>
                    </Collapsible>

                    {/* History Section */}
                    <Collapsible open={historyExpanded} onOpenChange={onHistoryExpandedChange}>
                        <CollapsibleTrigger className="flex items-center gap-2 w-full px-2 py-1.5 text-xs font-medium text-muted-foreground hover:text-foreground rounded hover:bg-muted/50">
                            {historyExpanded ? (
                                <ChevronDown className="h-3.5 w-3.5" />
                            ) : (
                                <ChevronRight className="h-3.5 w-3.5" />
                            )}
                            <History className="h-3.5 w-3.5" />
                            HISTORY
                            <span className="ml-auto text-[10px] text-muted-foreground/60">
                                {history.length}
                            </span>
                        </CollapsibleTrigger>
                        <CollapsibleContent className="mt-1">
                            {history.length > 0 ? (
                                <div className="space-y-1 pl-4 pr-2">
                                    {history.slice(0, 10).map((item) => (
                                        <button
                                            key={item.timestamp}
                                            onClick={() => onHistorySelect(item.sql)}
                                            className="w-full text-left px-2 py-1.5 text-[10px] text-muted-foreground hover:text-foreground hover:bg-muted/50 rounded truncate"
                                        >
                                            {item.sql.substring(0, 40)}...
                                        </button>
                                    ))}
                                    <button
                                        onClick={onClearHistory}
                                        className="w-full text-left px-2 py-1 text-[10px] text-destructive/70 hover:text-destructive"
                                    >
                                        Clear history
                                    </button>
                                </div>
                            ) : (
                                <p className="text-[10px] text-muted-foreground/60 px-6 py-2">
                                    No history yet
                                </p>
                            )}
                        </CollapsibleContent>
                    </Collapsible>
                </div>
            </ScrollArea>
        </aside>
    );
}
