import { useParams, Link } from "react-router-dom";
import { useState, useCallback, useEffect, useMemo } from "react";
import {
  Node,
  useNodesState,
  useEdgesState,
  addEdge,
  Connection,
} from "reactflow";
import ReactFlow, { Background, BackgroundVariant, Controls } from "reactflow";
import "reactflow/dist/style.css";
import { toast } from "sonner";
import {
  Play,
  Square,
  Database,
  Table2,
  ChevronRight,
  ChevronDown,
  X,
  Loader2,
  PanelLeftClose,
  PanelLeft,
  History,
  Columns3,
  Code,
  Sparkles,
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
import { useFullSchema } from "@/hooks/useDbQueries";
import { useQueryHistory } from "@/hooks/useQueryHistory";
import { useDatabase } from "@/hooks/useDbQueries";
import BridgeLoader from "@/components/feedback/BridgeLoader";
import { useBridgeQuery } from "@/hooks/useBridgeQuery";
import TableNode from "@/components/er-diagram/TableNode";
import { DataTable } from "@/components/common/DataTable";
import { TableRow } from "@/types/database";
import { bridgeApi } from "@/services/bridgeApi";
import { cn } from "@/lib/utils";

const nodeTypes = {
  table: TableNode,
};

const QueryBuilder = () => {
  const { id: dbId } = useParams<{ id: string }>();
  const { data: bridgeReady, isLoading: bridgeLoading } = useBridgeQuery();
  const { data: dbDetails } = useDatabase(dbId || "");

  // Sidebar state
  const [sidebarOpen, setSidebarOpen] = useState(true);
  const [tablesExpanded, setTablesExpanded] = useState(true);
  const [historyExpanded, setHistoryExpanded] = useState(false);
  const [configExpanded, setConfigExpanded] = useState(true);

  // ReactFlow state
  const [nodes, setNodes, onNodesChange] = useNodesState([]);
  const [edges, setEdges, onEdgesChange] = useEdgesState([]);

  // Query config state
  const [filters, setFilters] = useState<Array<{ column: string; operator: string; value: string }>>([]);
  const [sortBy, setSortBy] = useState("");
  const [sortOrder, setSortOrder] = useState<"ASC" | "DESC">("ASC");
  const [groupBy, setGroupBy] = useState("");
  const [limit, setLimit] = useState<number>(100);
  const [selectedColumns, setSelectedColumns] = useState<string[]>([]);

  // SQL & Execution state
  const [generatedSQL, setGeneratedSQL] = useState("");
  const [querySessionId, setQuerySessionId] = useState<string | null>(null);
  const [isExecuting, setIsExecuting] = useState(false);
  const [rowCount, setRowCount] = useState(0);
  const [queryProgress, setQueryProgress] = useState<{ rows: number; elapsed: number } | null>(null);
  const [tableData, setTableData] = useState<TableRow[]>([]);

  // Edge context menu
  const [selectedEdge, setSelectedEdge] = useState<any>(null);
  const [menuPosition, setMenuPosition] = useState<{ x: number; y: number } | null>(null);

  // Schema data
  const { data: schemaData, isLoading: loading } = useFullSchema(dbId);
  const { history, addQuery, clearHistory } = useQueryHistory(dbId || "default");

  const databaseName = dbDetails?.name || dbId;

  // Get all tables from schema
  const allTables = useMemo(() => {
    if (!schemaData) return [];
    return schemaData.schemas.flatMap((schema) => schema.tables);
  }, [schemaData]);

  // Get available columns from added nodes
  const availableColumns = useMemo(() => {
    return nodes.flatMap((node) =>
      node.data.columns?.map((col: any) => ({
        value: `${node.data.tableName}.${col.name}`,
        label: `${node.data.tableName}.${col.name}`,
        table: node.data.tableName,
      })) || []
    );
  }, [nodes]);

  const addTable = useCallback(
    (tableName: string) => {
      if (!schemaData || !tableName) return;

      const table = allTables.find((t) => t.name === tableName);
      if (!table) {
        toast.error("Table not found");
        return;
      }

      const exists = nodes.some(
        (node) => node.type === "table" && node.data?.tableName === table.name
      );

      if (exists) {
        toast.warning(`${table.name} is already added`);
        return;
      }

      const newNode: Node = {
        id: `table-${table.name}`,
        type: "table",
        position: {
          x: 50 + nodes.length * 50,
          y: 50 + nodes.length * 30,
        },
        data: {
          label: table.name,
          tableName: table.name,
          columns: table.columns,
        },
      };

      setNodes((nds) => [...nds, newNode]);
      toast.success(`Added ${table.name}`);
    },
    [schemaData, allTables, nodes, setNodes]
  );

  const removeTable = useCallback(
    (nodeId: string) => {
      setNodes((nds) => nds.filter((n) => n.id !== nodeId));
      setEdges((eds) => eds.filter((e) => e.source !== nodeId && e.target !== nodeId));
    },
    [setNodes, setEdges]
  );

  const onConnect = useCallback(
    (params: Connection) => {
      if (!params.source || !params.target || params.source === params.target) return;

      setEdges((eds) => {
        const exists = eds.some(
          (e) => e.source === params.source && e.target === params.target
        );
        if (exists) return eds;

        return addEdge(
          {
            ...params,
            data: { joinType: "INNER" },
            animated: true,
            style: { stroke: "hsl(var(--primary))" },
            label: "INNER",
            labelStyle: { fill: "hsl(var(--primary))", fontWeight: 500, fontSize: 10 },
          },
          eds
        );
      });
    },
    [setEdges]
  );

  const onEdgeClick = (event: React.MouseEvent, edge: any) => {
    event.preventDefault();
    setSelectedEdge(edge);
    setMenuPosition({ x: event.clientX, y: event.clientY });
  };

  const updateEdgeJoinType = useCallback(
    (joinType: "INNER" | "LEFT" | "RIGHT" | "FULL") => {
      if (!selectedEdge) return;

      const joinColors = {
        INNER: "hsl(var(--primary))",
        LEFT: "#10B981",
        RIGHT: "#F59E0B",
        FULL: "#8B5CF6",
      };

      setEdges((eds) =>
        eds.map((edge) => {
          if (edge.id === selectedEdge.id) {
            return {
              ...edge,
              data: { joinType },
              style: { stroke: joinColors[joinType] },
              label: joinType,
              labelStyle: { fill: joinColors[joinType], fontWeight: 500, fontSize: 10 },
            };
          }
          return edge;
        })
      );

      setSelectedEdge(null);
      setMenuPosition(null);
    },
    [selectedEdge, setEdges]
  );

  const addFilter = useCallback(() => {
    setFilters((prev) => [...prev, { column: "", operator: "=", value: "" }]);
  }, []);

  const removeFilter = useCallback((index: number) => {
    setFilters((prev) => prev.filter((_, i) => i !== index));
  }, []);

  const generateSQL = useCallback(() => {
    if (!nodes.length) {
      toast.error("Add at least one table");
      return;
    }

    const tables = nodes.map((n) => n.data.tableName);

    const joins = edges
      .map((e) => {
        const sourceNode = nodes.find((n) => n.id === e.source);
        const targetNode = nodes.find((n) => n.id === e.target);
        if (!sourceNode || !targetNode) return null;

        const joinType = e.data?.joinType || "INNER";
        return `${joinType} JOIN ${targetNode.data.tableName} ON ${sourceNode.data.tableName}.id = ${targetNode.data.tableName}.${sourceNode.data.tableName}_id`;
      })
      .filter(Boolean)
      .join("\n");

    const whereClause = filters
      .filter((f) => f.column && f.value)
      .map((f) => `${f.column} ${f.operator} '${f.value}'`)
      .join(" AND ");

    const columns = selectedColumns.length > 0 ? selectedColumns.join(", ") : "*";
    let sql = `SELECT ${columns}\nFROM ${tables[0]}`;

    if (joins) sql += `\n${joins}`;
    if (whereClause) sql += `\nWHERE ${whereClause}`;
    if (groupBy) sql += `\nGROUP BY ${groupBy}`;
    if (sortBy) sql += `\nORDER BY ${sortBy} ${sortOrder}`;
    if (limit > 0) sql += `\nLIMIT ${limit}`;

    sql += ";";

    setGeneratedSQL(sql);
    addQuery(sql, tables);
    toast.success("SQL generated");
  }, [nodes, edges, filters, groupBy, sortBy, sortOrder, limit, selectedColumns, addQuery]);

  const executeQuery = async () => {
    if (!dbId || !generatedSQL) {
      toast.error("Generate SQL first");
      return;
    }

    try {
      if (querySessionId) {
        await handleCancelQuery();
      }

      setTableData([]);
      setRowCount(0);
      setQueryProgress(null);
      setIsExecuting(true);

      const sessionId = await bridgeApi.createSession();
      setQuerySessionId(sessionId);

      await bridgeApi.runQuery({
        sessionId,
        dbId,
        sql: generatedSQL,
      });
    } catch (error) {
      toast.error("Execution failed", { description: (error as Error).message });
      setIsExecuting(false);
    }
  };

  const handleCancelQuery = async () => {
    if (!querySessionId) return;
    try {
      await bridgeApi.cancelSession(querySessionId);
      toast.info("Query cancelled");
    } catch (error: any) {
      toast.error("Failed to cancel", { description: error.message });
    }
  };

  // Query event listeners
  useEffect(() => {
    const handleResult = (event: CustomEvent) => {
      if (event.detail.sessionId !== querySessionId) return;
      setTableData((prev) => [...prev, ...event.detail.rows]);
      setRowCount((prev) => prev + event.detail.rows.length);
    };

    const handleProgress = (event: CustomEvent) => {
      if (event.detail.sessionId !== querySessionId) return;
      setQueryProgress({
        rows: event.detail.rowsSoFar,
        elapsed: Math.round(event.detail.elapsedMs / 1000),
      });
    };

    const handleDone = (event: CustomEvent) => {
      if (event.detail.sessionId !== querySessionId) return;
      setIsExecuting(false);
      setQuerySessionId(null);
      setQueryProgress(null);

      const { rows, timeMs, status } = event.detail;
      if (status === "success") {
        toast.success(`${rows.toLocaleString()} rows in ${(timeMs / 1000).toFixed(2)}s`);
      } else {
        toast.warning(`Stopped after ${rows.toLocaleString()} rows`);
      }
    };

    const handleError = (event: CustomEvent) => {
      if (event.detail.sessionId !== querySessionId) return;
      setIsExecuting(false);
      setQuerySessionId(null);
      setQueryProgress(null);
      toast.error("Query failed", { description: event.detail.error?.message });
    };

    const listeners = [
      { name: "bridge:query.result", handler: handleResult },
      { name: "bridge:query.progress", handler: handleProgress },
      { name: "bridge:query.done", handler: handleDone },
      { name: "bridge:query.error", handler: handleError },
    ];

    listeners.forEach((l) => window.addEventListener(l.name, l.handler as EventListener));
    return () => {
      listeners.forEach((l) => window.removeEventListener(l.name, l.handler as EventListener));
    };
  }, [querySessionId]);

  if (bridgeLoading || bridgeReady === undefined || loading) {
    return <BridgeLoader />;
  }

  return (
    <div className="h-[calc(100vh-32px)] flex flex-col bg-background">
      {/* Top Bar */}
      <header className="h-12 border-b border-border/40 bg-background flex items-center justify-between px-4 shrink-0">
        <div className="flex items-center gap-3">
          <Link to={`/${dbId}`}>
            <Button variant="ghost" size="sm" className="h-8 gap-2">
              <Database className="h-4 w-4" />
              <span className="text-sm font-medium">{databaseName}</span>
            </Button>
          </Link>
          <ChevronRight className="h-4 w-4 text-muted-foreground/50" />
          <span className="text-sm font-medium">Query Builder</span>
        </div>

        <div className="flex items-center gap-2">
          {isExecuting && (
            <div className="flex items-center gap-2 text-xs text-muted-foreground bg-muted/50 px-3 py-1.5 rounded-md">
              <Loader2 className="h-3.5 w-3.5 animate-spin text-primary" />
              <span>{queryProgress?.rows || 0} rows</span>
              <span className="text-muted-foreground/50">•</span>
              <span>{queryProgress?.elapsed || 0}s</span>
            </div>
          )}

          <Button
            size="sm"
            variant="outline"
            onClick={generateSQL}
            disabled={nodes.length === 0}
            className="h-8 gap-1.5"
          >
            <Sparkles className="h-3.5 w-3.5" />
            Generate
          </Button>

          {isExecuting ? (
            <Button size="sm" variant="destructive" onClick={handleCancelQuery} className="h-8 gap-1.5">
              <Square className="h-3.5 w-3.5" />
              Stop
            </Button>
          ) : (
            <Button
              size="sm"
              onClick={executeQuery}
              disabled={!generatedSQL}
              className="h-8 gap-1.5"
            >
              <Play className="h-3.5 w-3.5" />
              Execute
            </Button>
          )}
        </div>
      </header>

      {/* Main Content */}
      <div className="flex-1 flex overflow-hidden">
        {/* Left Sidebar */}
        <aside
          className={cn(
            "border-r border-border/40 bg-muted/20 flex flex-col shrink-0 transition-all duration-200",
            sidebarOpen ? "w-64" : "w-0"
          )}
        >
          {sidebarOpen && (
            <>
              {/* Sidebar Header */}
              <div className="h-10 border-b border-border/40 flex items-center justify-between px-3 shrink-0">
                <span className="text-xs font-medium text-muted-foreground uppercase tracking-wider">
                  Explorer
                </span>
                <Button
                  variant="ghost"
                  size="sm"
                  className="h-6 w-6 p-0"
                  onClick={() => setSidebarOpen(false)}
                >
                  <PanelLeftClose className="h-3.5 w-3.5" />
                </Button>
              </div>

              <ScrollArea className="flex-1">
                <div className="p-2 space-y-1">
                  {/* Tables Section */}
                  <Collapsible open={tablesExpanded} onOpenChange={setTablesExpanded}>
                    <CollapsibleTrigger className="flex items-center gap-2 w-full px-2 py-1.5 text-xs font-medium text-muted-foreground hover:text-foreground rounded hover:bg-muted/50">
                      {tablesExpanded ? (
                        <ChevronDown className="h-3.5 w-3.5" />
                      ) : (
                        <ChevronRight className="h-3.5 w-3.5" />
                      )}
                      <Table2 className="h-3.5 w-3.5" />
                      TABLES
                      <span className="ml-auto text-[10px] text-muted-foreground/60">
                        {allTables.length}
                      </span>
                    </CollapsibleTrigger>
                    <CollapsibleContent className="mt-1">
                      <div className="space-y-0.5 pl-4">
                        {allTables.map((table) => {
                          const isAdded = nodes.some(
                            (n) => n.data?.tableName === table.name
                          );
                          return (
                            <button
                              key={table.name}
                              onClick={() => {
                                if (isAdded) {
                                  const nodeId = `table-${table.name}`;
                                  removeTable(nodeId);
                                } else {
                                  addTable(table.name);
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
                              <span className="truncate">{table.name}</span>
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
                  <Collapsible open={configExpanded} onOpenChange={setConfigExpanded}>
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
                              onClick={() => setSelectedColumns([])}
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
                              setSelectedColumns([...selectedColumns, val]);
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
                                    setSelectedColumns(selectedColumns.filter((c) => c !== col))
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
                                  onValueChange={(val) => {
                                    const newFilters = [...filters];
                                    newFilters[index].column = val;
                                    setFilters(newFilters);
                                  }}
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
                                  onValueChange={(val) => {
                                    const newFilters = [...filters];
                                    newFilters[index].operator = val;
                                    setFilters(newFilters);
                                  }}
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
                                  onChange={(e) => {
                                    const newFilters = [...filters];
                                    newFilters[index].value = e.target.value;
                                    setFilters(newFilters);
                                  }}
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
                          <Select value={sortBy} onValueChange={setSortBy}>
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
                            onValueChange={(v) => setSortOrder(v as "ASC" | "DESC")}
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
                        <Select value={groupBy} onValueChange={setGroupBy}>
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
                              onClick={() => setLimit(val)}
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
                  <Collapsible open={historyExpanded} onOpenChange={setHistoryExpanded}>
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
                              onClick={() => setGeneratedSQL(item.sql)}
                              className="w-full text-left px-2 py-1.5 text-[10px] text-muted-foreground hover:text-foreground hover:bg-muted/50 rounded truncate"
                            >
                              {item.sql.substring(0, 40)}...
                            </button>
                          ))}
                          {history.length > 0 && (
                            <button
                              onClick={clearHistory}
                              className="w-full text-left px-2 py-1 text-[10px] text-destructive/70 hover:text-destructive"
                            >
                              Clear history
                            </button>
                          )}
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
            </>
          )}
        </aside>

        {/* Toggle Sidebar Button (when closed) */}
        {!sidebarOpen && (
          <div className="w-10 border-r border-border/40 flex flex-col items-center py-2">
            <Button
              variant="ghost"
              size="sm"
              className="h-8 w-8 p-0"
              onClick={() => setSidebarOpen(true)}
            >
              <PanelLeft className="h-4 w-4" />
            </Button>
          </div>
        )}

        {/* Main Area */}
        <div className="flex-1 flex flex-col overflow-hidden">
          {/* Visual Diagram Area */}
          <div className="flex-1 relative min-h-[300px]">
            {/* Edge Join Type Menu */}
            {menuPosition && selectedEdge && (
              <>
                <div
                  className="fixed inset-0 z-40"
                  onClick={() => {
                    setSelectedEdge(null);
                    setMenuPosition(null);
                  }}
                />
                <div
                  className="fixed z-50 bg-popover border rounded-lg shadow-lg p-1.5 min-w-[100px]"
                  style={{ left: menuPosition.x, top: menuPosition.y }}
                >
                  <div className="text-[10px] font-medium text-muted-foreground mb-1 px-2">
                    Join Type
                  </div>
                  {[
                    { type: "INNER", color: "hsl(var(--primary))" },
                    { type: "LEFT", color: "#10B981" },
                    { type: "RIGHT", color: "#F59E0B" },
                    { type: "FULL", color: "#8B5CF6" },
                  ].map(({ type, color }) => (
                    <button
                      key={type}
                      onClick={() => updateEdgeJoinType(type as any)}
                      className="w-full text-left px-2 py-1 text-xs hover:bg-accent rounded flex items-center gap-2"
                    >
                      <span
                        className="w-2.5 h-2.5 rounded-full"
                        style={{ backgroundColor: color }}
                      />
                      {type}
                    </button>
                  ))}
                </div>
              </>
            )}

            {/* Added Tables Pills */}
            {nodes.length > 0 && (
              <div className="absolute top-3 left-3 z-10 flex flex-wrap gap-1.5">
                {nodes.map((node) => (
                  <span
                    key={node.id}
                    className="inline-flex items-center gap-1 bg-background/90 border border-border/40 text-xs px-2 py-1 rounded-md shadow-sm"
                  >
                    <Table2 className="h-3 w-3 text-primary" />
                    {node.data.tableName}
                    <button
                      onClick={() => removeTable(node.id)}
                      className="ml-0.5 text-muted-foreground hover:text-destructive"
                    >
                      <X className="h-3 w-3" />
                    </button>
                  </span>
                ))}
              </div>
            )}

            <ReactFlow
              nodes={nodes}
              edges={edges}
              onNodesChange={onNodesChange}
              onEdgesChange={onEdgesChange}
              onConnect={onConnect}
              onEdgeClick={onEdgeClick}
              nodeTypes={nodeTypes}
              fitView
              className="bg-muted/10"
            >
              <Background variant={BackgroundVariant.Dots} gap={16} size={1} className="opacity-30" />
              <Controls className="bg-background border-border/40" />
            </ReactFlow>

            {/* Empty State */}
            {nodes.length === 0 && (
              <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
                <div className="text-center">
                  <Table2 className="h-10 w-10 mx-auto text-muted-foreground/30 mb-3" />
                  <p className="text-sm text-muted-foreground/60">
                    Click tables from sidebar to add them
                  </p>
                  <p className="text-xs text-muted-foreground/40 mt-1">
                    Connect tables to create joins
                  </p>
                </div>
              </div>
            )}
          </div>

          {/* Bottom Panel - SQL & Results */}
          <div className="h-[45%] border-t border-border/40 flex flex-col">
            {/* Tabs */}
            <div className="h-9 border-b border-border/40 flex items-center px-2 shrink-0 bg-muted/20">
              <div className="flex items-center gap-1">
                <div className="flex items-center gap-1.5 px-3 py-1 text-xs font-medium border-b-2 border-primary text-foreground">
                  <Code className="h-3 w-3" />
                  SQL
                </div>
                {tableData.length > 0 && (
                  <div className="flex items-center gap-1.5 px-3 py-1 text-xs text-muted-foreground">
                    <span className="text-[10px] bg-primary/10 text-primary px-1.5 py-0.5 rounded">
                      {rowCount} rows
                    </span>
                  </div>
                )}
              </div>
            </div>

            {/* Content */}
            <div className="flex-1 flex overflow-hidden">
              {/* SQL Preview */}
              <div className="w-1/3 border-r border-border/40 flex flex-col">
                <ScrollArea className="flex-1">
                  {generatedSQL ? (
                    <pre className="p-3 text-xs font-mono text-muted-foreground whitespace-pre-wrap">
                      {generatedSQL}
                    </pre>
                  ) : (
                    <div className="flex items-center justify-center h-full text-xs text-muted-foreground/50">
                      Generate SQL to preview
                    </div>
                  )}
                </ScrollArea>
              </div>

              {/* Results */}
              <div className="flex-1 overflow-auto">
                {tableData.length > 0 ? (
                  <DataTable data={tableData} />
                ) : (
                  <div className="flex items-center justify-center h-full text-xs text-muted-foreground/50">
                    Execute query to see results
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Status Bar */}
      <footer className="h-6 border-t border-border/40 bg-muted/30 flex items-center justify-between px-3 text-[10px] text-muted-foreground shrink-0">
        <div className="flex items-center gap-3">
          <span>{nodes.length} table{nodes.length !== 1 ? "s" : ""}</span>
          <span>{edges.length} join{edges.length !== 1 ? "s" : ""}</span>
          {filters.length > 0 && <span>{filters.length} filter{filters.length !== 1 ? "s" : ""}</span>}
        </div>
        <div className="flex items-center gap-3">
          {limit > 0 && <span>Limit: {limit}</span>}
          {isExecuting && <span className="text-primary">Executing...</span>}
        </div>
      </footer>
    </div>
  );
};

export default QueryBuilder;
