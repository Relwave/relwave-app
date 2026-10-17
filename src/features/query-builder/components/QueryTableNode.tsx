import React, { useState, useMemo } from "react";
import { Handle, Position, NodeProps } from "reactflow";
import { Table2, X, ChevronDown, ChevronRight, Key, Search, Link2 } from "lucide-react";
import { TooltipProvider } from "@/components/ui/tooltip";
import { Input } from "@/components/ui/input";
import { ColumnDetails } from "@/features/database/types";

interface QueryTableNodeData {
  label: string;
  tableName: string;
  columns?: ColumnDetails[];
  schema?: string;
  onRemove?: (nodeId: string) => void;
}

export const QueryTableNode: React.FC<NodeProps<QueryTableNodeData>> = ({ id, data }) => {
  const [isCollapsed, setIsCollapsed] = useState(false);
  const [searchFilter, setSearchFilter] = useState("");

  const tableName = data.tableName || data.label || "table";
  const columns = data.columns || [];

  const filteredColumns = useMemo(() => {
    if (!searchFilter.trim()) return columns;
    const q = searchFilter.toLowerCase();
    return columns.filter((col) => col.name.toLowerCase().includes(q));
  }, [columns, searchFilter]);

  const handleRemove = (e: React.MouseEvent) => {
    e.stopPropagation();
    if (data.onRemove) {
      data.onRemove(id);
    } else {
      window.dispatchEvent(new CustomEvent("querybuilder:removetable", { detail: { id } }));
    }
  };

  const handleColumnClick = (colName: string) => {
    window.dispatchEvent(
      new CustomEvent("querybuilder:togglecolumn", {
        detail: { column: `${tableName}.${colName}` },
      }),
    );
  };

  return (
    <TooltipProvider delayDuration={200}>
      <div className="min-w-60 max-w-72 shadow-lg border border-border/80 rounded-lg bg-card/95 backdrop-blur-md relative transition-all duration-150 overflow-hidden text-xs">
        {/* Table-level Target Handle (Left) */}
        <Handle
          type="target"
          position={Position.Left}
          id={`${tableName}-header-target`}
          className="w-2.5 h-2.5 !bg-muted-foreground/60 hover:!bg-primary !border-2 !border-background transition-transform hover:scale-125 -left-1.5 z-20"
          title={`Join to table ${tableName}`}
        />

        {/* Table-level Source Handle (Right) */}
        <Handle
          type="source"
          position={Position.Right}
          id={`${tableName}-header-source`}
          className="w-2.5 h-2.5 !bg-muted-foreground/60 hover:!bg-primary !border-2 !border-background transition-transform hover:scale-125 -right-1.5 z-20"
          title={`Join from table ${tableName}`}
        />

        {/* Node Header */}
        <div className="px-3 py-2 bg-muted/60 border-b border-border/60 flex items-center justify-between gap-2">
          <div className="flex items-center gap-1.5 min-w-0">
            <button
              onClick={() => setIsCollapsed(!isCollapsed)}
              className="p-0.5 hover:bg-background/60 rounded text-muted-foreground transition-colors shrink-0"
              title={isCollapsed ? "Expand columns" : "Collapse columns"}
            >
              {isCollapsed ? (
                <ChevronRight className="h-3.5 w-3.5" />
              ) : (
                <ChevronDown className="h-3.5 w-3.5" />
              )}
            </button>
            <Table2 className="h-3.5 w-3.5 text-primary shrink-0" />
            <span className="font-semibold font-mono text-foreground truncate" title={tableName}>
              {tableName}
            </span>
          </div>

          <div className="flex items-center gap-1 shrink-0">
            {data.schema && data.schema !== "public" && data.schema !== "main" && (
              <span className="text-[9px] text-muted-foreground px-1 py-0.2 bg-background/50 rounded uppercase font-mono">
                {data.schema}
              </span>
            )}
            <button
              onClick={handleRemove}
              className="p-1 text-muted-foreground/70 hover:text-destructive hover:bg-destructive/10 rounded transition-colors"
              title="Remove table from canvas"
            >
              <X className="h-3.5 w-3.5" />
            </button>
          </div>
        </div>

        {/* Search bar if many columns */}
        {!isCollapsed && columns.length > 8 && (
          <div className="p-1.5 border-b border-border/40 bg-background/50">
            <div className="relative flex items-center">
              <Search className="h-3 w-3 absolute left-2 text-muted-foreground pointer-events-none" />
              <Input
                type="text"
                placeholder="Filter columns..."
                value={searchFilter}
                onChange={(e) => setSearchFilter(e.target.value)}
                className="h-6 pl-7 text-[10px] bg-background/60 border-border/40"
              />
            </div>
          </div>
        )}

        {/* Column List */}
        {!isCollapsed && (
          <div className="p-1 space-y-0.5 max-h-64 overflow-y-auto">
            {filteredColumns.map((col) => {
              const targetHandleId = `${tableName}.${col.name}-target`;
              const sourceHandleId = `${tableName}.${col.name}-source`;

              return (
                <div
                  key={col.name}
                  className="group relative flex items-center justify-between text-[11px] px-2 py-1 font-mono rounded hover:bg-accent/50 cursor-pointer transition-colors"
                  onClick={() => handleColumnClick(col.name)}
                  title="Click to toggle column in SELECT clause"
                >
                  {/* Left Column Handle (Target) */}
                  <Handle
                    type="target"
                    position={Position.Left}
                    id={targetHandleId}
                    className="w-2 h-2 !bg-muted-foreground/40 hover:!bg-primary !border-2 !border-background transition-transform hover:scale-125 -left-1 z-20"
                    title={`Connect target: ${tableName}.${col.name}`}
                  />

                  {/* Left Column Icon & Name */}
                  <div className="flex items-center gap-1.5 min-w-0 flex-1">
                    {col.isPrimaryKey ? (
                      <span title="Primary Key" className="shrink-0 flex items-center">
                        <Key className="h-3 w-3 text-amber-500" />
                      </span>
                    ) : col.isForeignKey ? (
                      <span title="Foreign Key" className="shrink-0 flex items-center">
                        <Link2 className="h-3 w-3 text-cyan-500" />
                      </span>
                    ) : (
                      <span className="w-1.5 h-1.5 rounded-full bg-muted-foreground/40 shrink-0 group-hover:bg-primary/70 transition-colors" />
                    )}

                    <span
                      className={`truncate ${
                        col.isPrimaryKey
                          ? "font-semibold text-foreground"
                          : col.isForeignKey
                            ? "text-cyan-500 font-medium"
                            : "text-foreground/90"
                      }`}
                    >
                      {col.name}
                    </span>

                    {!col.nullable && (
                      <span
                        className="text-[10px] text-destructive shrink-0 font-bold"
                        title="NOT NULL"
                      >
                        *
                      </span>
                    )}
                  </div>

                  {/* Right Column Type */}
                  <div className="flex items-center gap-1 shrink-0 ml-2">
                    <span className="text-[10px] text-muted-foreground font-sans truncate max-w-20">
                      {col.type}
                    </span>
                  </div>

                  {/* Right Column Handle (Source) */}
                  <Handle
                    type="source"
                    position={Position.Right}
                    id={sourceHandleId}
                    className="w-2 h-2 !bg-muted-foreground/40 hover:!bg-primary !border-2 !border-background transition-transform hover:scale-125 -right-1 z-20"
                    title={`Connect source: ${tableName}.${col.name}`}
                  />
                </div>
              );
            })}

            {filteredColumns.length === 0 && (
              <div className="p-2 text-center text-[10px] text-muted-foreground">
                No matching columns
              </div>
            )}
          </div>
        )}

        {/* Collapsed State Bar */}
        {isCollapsed && (
          <div className="px-3 py-1.5 text-[10px] text-muted-foreground text-center bg-muted/20">
            {columns.length} columns hidden
          </div>
        )}
      </div>
    </TooltipProvider>
  );
};

export default QueryTableNode;
