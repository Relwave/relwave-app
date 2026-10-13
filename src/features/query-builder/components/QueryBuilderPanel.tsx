import { useState, useCallback, useEffect, useMemo } from "react";
import { Node, useNodesState, useEdgesState, addEdge, Connection } from "reactflow";
import "reactflow/dist/style.css";
import { toast } from "sonner";
import { useFullSchema } from "@/features/project/hooks/useDbQueries";
import { useQueryHistory } from "@/features/query-builder/hooks/useQueryHistory";
import { useDatabase } from "@/features/project/hooks/useDbQueries";
import { useBridgeQuery } from "@/services/bridge/useBridgeQuery";
import { TableRow } from "@/features/database/types";
import { BuilderHeader } from "./BuilderHeader";
import { BuilderSidebar } from "./BuilderSidebar";
import { DiagramCanvas } from "./DiagramCanvas";
import { SQLResultsPanel } from "./SQLResultsPanel";
import { BuilderStatusBar } from "./BuilderStatusBar";
import { QueryFilter, ColumnOption } from "../types";
import { sessionService } from "@/services/bridge/session";
import { queryService } from "@/services/bridge/query";
import { QueryBuilderPanelLoadingState } from "./QueryBuilderPanelLoadingState";

interface QueryBuilderPanelProps {
  dbId: string;
}

const QueryBuilderPanel = ({ dbId }: QueryBuilderPanelProps) => {
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
  const [filters, setFilters] = useState<QueryFilter[]>([]);
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
  const [queryProgress, setQueryProgress] = useState<{ rows: number; elapsed: number } | null>(
    null,
  );
  const [tableData, setTableData] = useState<TableRow[]>([]);

  // Edge context menu
  const [selectedEdge, setSelectedEdge] = useState<any>(null);
  const [menuPosition, setMenuPosition] = useState<{ x: number; y: number } | null>(null);

  // Schema data
  const { data: schemaData, isLoading: loading } = useFullSchema(dbId);
  const { history, addQuery, clearHistory } = useQueryHistory(dbId || "default");

  const databaseName = dbDetails?.name || dbId;

  // Schema filter state
  const [selectedSchema, setSelectedSchema] = useState<string>("__all__");

  // Get available schema names
  const availableSchemas = useMemo(() => {
    if (!schemaData?.schemas) return [];
    return schemaData.schemas.filter((s) => s.tables?.length > 0).map((s) => s.name);
  }, [schemaData]);

  // Get tables filtered by selected schema
  const allTables = useMemo(() => {
    if (!schemaData) return [];
    if (selectedSchema === "__all__") {
      return schemaData.schemas.flatMap((schema) => schema.tables);
    }
    const schema = schemaData.schemas.find((s) => s.name === selectedSchema);
    return schema?.tables || [];
  }, [schemaData, selectedSchema]);

  // Get available columns from added nodes
  const availableColumns: ColumnOption[] = useMemo(() => {
    return nodes.flatMap(
      (node) =>
        node.data.columns?.map((col: any) => ({
          value: `${node.data.tableName}.${col.name}`,
          label: `${node.data.tableName}.${col.name}`,
          table: node.data.tableName,
        })) || [],
    );
  }, [nodes]);

  // Prune invalid column selections whenever availableColumns changes
  useEffect(() => {
    const validColSet = new Set(availableColumns.map((c) => c.value));
    setSelectedColumns((prev) => prev.filter((col) => validColSet.has(col)));
    setFilters((prev) => prev.filter((f) => !f.column || validColSet.has(f.column)));
    setSortBy((prev) => (prev && validColSet.has(prev) ? prev : ""));
    setGroupBy((prev) => (prev && validColSet.has(prev) ? prev : ""));
  }, [availableColumns]);

  const addTable = useCallback(
    (tableName: string) => {
      if (!schemaData || !tableName) return;

      const table = allTables.find((t) => t.name === tableName);
      if (!table) {
        toast.error("Table not found");
        return;
      }

      const exists = nodes.some(
        (node) => node.type === "table" && node.data?.tableName === table.name,
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
          schema: (table as any).schema || (selectedSchema !== "__all__" ? selectedSchema : "main"),
        },
      };

      setNodes((nds) => [...nds, newNode]);
      toast.success(`Added ${table.name}`);
    },
    [schemaData, allTables, nodes, setNodes, selectedSchema],
  );

  const removeTable = useCallback(
    (nodeId: string) => {
      const nodeToRemove = nodes.find((n) => n.id === nodeId);
      const tableName = nodeToRemove?.data?.tableName;

      if (tableName) {
        setSelectedColumns((prev) => prev.filter((col) => !col.startsWith(`${tableName}.`)));
        setFilters((prev) => prev.filter((f) => !f.column.startsWith(`${tableName}.`)));
        setSortBy((prev) => (prev.startsWith(`${tableName}.`) ? "" : prev));
        setGroupBy((prev) => (prev.startsWith(`${tableName}.`) ? "" : prev));
      }

      setNodes((nds) => nds.filter((n) => n.id !== nodeId));
      setEdges((eds) => eds.filter((e) => e.source !== nodeId && e.target !== nodeId));
    },
    [nodes, setNodes, setEdges],
  );

  // Global listeners for table node events
  useEffect(() => {
    const handleRemove = (event: CustomEvent) => {
      if (event.detail?.id) {
        removeTable(event.detail.id);
      }
    };

    const handleToggleCol = (event: CustomEvent) => {
      if (event.detail?.column) {
        const col = event.detail.column;
        setSelectedColumns((prev) =>
          prev.includes(col) ? prev.filter((c) => c !== col) : [...prev, col],
        );
      }
    };

    window.addEventListener("querybuilder:removetable", handleRemove as EventListener);
    window.addEventListener("querybuilder:togglecolumn", handleToggleCol as EventListener);

    return () => {
      window.removeEventListener("querybuilder:removetable", handleRemove as EventListener);
      window.removeEventListener("querybuilder:togglecolumn", handleToggleCol as EventListener);
    };
  }, [removeTable]);

  // Helper to resolve join columns from handles, metadata, or naming conventions
  const resolveJoinColumns = useCallback(
    (
      sourceTable: string,
      targetTable: string,
      edgeData?: any,
    ): { sourceCol: string; targetCol: string } => {
      if (edgeData?.sourceColumn && edgeData?.targetColumn) {
        return {
          sourceCol: edgeData.sourceColumn,
          targetCol: edgeData.targetColumn,
        };
      }

      // Check foreign key constraints from schemaData
      if (schemaData?.schemas) {
        for (const schema of schemaData.schemas) {
          for (const table of schema.tables || []) {
            if (table.name === targetTable && table.foreignKeys) {
              const fk = table.foreignKeys.find((f: any) => f.target_table === sourceTable);
              if (fk) {
                return { sourceCol: fk.target_column, targetCol: fk.source_column };
              }
            }
            if (table.name === sourceTable && table.foreignKeys) {
              const fk = table.foreignKeys.find((f: any) => f.target_table === targetTable);
              if (fk) {
                return { sourceCol: fk.source_column, targetCol: fk.target_column };
              }
            }
          }
        }
      }

      // Check naming conventions
      const sourceTableObj = allTables?.find((t) => t.name === sourceTable);
      const targetTableObj = allTables?.find((t) => t.name === targetTable);
      const sourceCols: string[] = sourceTableObj?.columns?.map((c: any) => c.name) || [];
      const targetCols: string[] = targetTableObj?.columns?.map((c: any) => c.name) || [];

      const singular = (name: string) => name.replace(/s$/, "");

      // Target has <source>_id or <singularSource>_id
      const targetFk = targetCols.find(
        (c) =>
          c.toLowerCase() === `${sourceTable.toLowerCase()}_id` ||
          c.toLowerCase() === `${singular(sourceTable.toLowerCase())}_id`,
      );
      if (targetFk && (sourceCols.includes("id") || sourceCols.length > 0)) {
        return { sourceCol: sourceCols.includes("id") ? "id" : sourceCols[0], targetCol: targetFk };
      }

      // Source has <target>_id or <singularTarget>_id
      const sourceFk = sourceCols.find(
        (c) =>
          c.toLowerCase() === `${targetTable.toLowerCase()}_id` ||
          c.toLowerCase() === `${singular(targetTable.toLowerCase())}_id`,
      );
      if (sourceFk && (targetCols.includes("id") || targetCols.length > 0)) {
        return { sourceCol: sourceFk, targetCol: targetCols.includes("id") ? "id" : targetCols[0] };
      }

      const defaultTargetCol = targetCols.includes(`${singular(sourceTable)}_id`)
        ? `${singular(sourceTable)}_id`
        : targetCols.includes("id")
          ? "id"
          : targetCols[0] || "id";

      const defaultSourceCol = sourceCols.includes("id") ? "id" : sourceCols[0] || "id";

      return {
        sourceCol: defaultSourceCol,
        targetCol: defaultTargetCol,
      };
    },
    [schemaData, allTables],
  );

  const onConnect = useCallback(
    (params: Connection) => {
      if (!params.source || !params.target || params.source === params.target) return;

      const sourceNode = nodes.find((n) => n.id === params.source);
      const targetNode = nodes.find((n) => n.id === params.target);
      if (!sourceNode || !targetNode) return;

      const sourceTable = sourceNode.data.tableName;
      const targetTable = targetNode.data.tableName;

      const parseHandleCol = (handleId: string | null | undefined) => {
        if (!handleId || handleId.includes("-header-")) return null;
        const clean = handleId.replace(/-(source|target)$/, "");
        const parts = clean.split(".");
        return parts.length >= 2 ? parts.slice(1).join(".") : clean;
      };

      let sourceCol = parseHandleCol(params.sourceHandle);
      let targetCol = parseHandleCol(params.targetHandle);

      if (!sourceCol || !targetCol) {
        const resolved = resolveJoinColumns(sourceTable, targetTable);
        sourceCol = sourceCol || resolved.sourceCol;
        targetCol = targetCol || resolved.targetCol;
      }

      const joinType = "INNER";
      const label = `${joinType} (${sourceCol} = ${targetCol})`;

      setEdges((eds) => {
        const exists = eds.some(
          (e) =>
            (e.source === params.source && e.target === params.target) ||
            (e.source === params.target && e.target === params.source),
        );
        if (exists) return eds;

        return addEdge(
          {
            ...params,
            data: {
              joinType,
              sourceTable,
              targetTable,
              sourceColumn: sourceCol,
              targetColumn: targetCol,
            },
            animated: true,
            style: { stroke: "hsl(var(--primary))", strokeWidth: 2 },
            label,
            labelStyle: { fill: "hsl(var(--primary))", fontWeight: 600, fontSize: 10 },
            labelBgStyle: { fill: "hsl(var(--card))", fillOpacity: 0.9, rx: 4, ry: 4 },
            labelBgPadding: [6, 3] as [number, number],
          },
          eds,
        );
      });
    },
    [nodes, resolveJoinColumns, setEdges],
  );

  const onEdgeClick = useCallback((event: React.MouseEvent, edge: any) => {
    event.preventDefault();
    setSelectedEdge(edge);
    setMenuPosition({ x: event.clientX, y: event.clientY });
  }, []);

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
            const sCol = edge.data?.sourceColumn || "id";
            const tCol = edge.data?.targetColumn || "id";
            return {
              ...edge,
              data: { ...edge.data, joinType },
              style: { stroke: joinColors[joinType], strokeWidth: 2 },
              label: `${joinType} (${sCol} = ${tCol})`,
              labelStyle: { fill: joinColors[joinType], fontWeight: 600, fontSize: 10 },
              labelBgStyle: { fill: "hsl(var(--card))", fillOpacity: 0.9, rx: 4, ry: 4 },
              labelBgPadding: [6, 3] as [number, number],
            };
          }
          return edge;
        }),
      );

      setSelectedEdge(null);
      setMenuPosition(null);
    },
    [selectedEdge, setEdges],
  );

  const deleteEdge = useCallback(
    (edgeId: string) => {
      setEdges((eds) => eds.filter((e) => e.id !== edgeId));
      setSelectedEdge(null);
      setMenuPosition(null);
    },
    [setEdges],
  );

  const closeMenu = useCallback(() => {
    setSelectedEdge(null);
    setMenuPosition(null);
  }, []);

  const generateSQL = useCallback(() => {
    if (!nodes.length) {
      toast.error("Add at least one table");
      return;
    }

    const canvasTableNames = nodes.map((n) => n.data.tableName);

    // Build adjacency list for joins between tables
    interface JoinEdge {
      neighbor: string;
      joinType: string;
      onClause: string;
    }
    const adj = new Map<string, JoinEdge[]>();
    canvasTableNames.forEach((t) => adj.set(t, []));

    edges.forEach((e) => {
      const sNode = nodes.find((n) => n.id === e.source);
      const tNode = nodes.find((n) => n.id === e.target);
      if (!sNode || !tNode) return;

      const sTable = sNode.data.tableName;
      const tTable = tNode.data.tableName;
      const joinType = e.data?.joinType || "INNER";

      const resolved = resolveJoinColumns(sTable, tTable, e.data);
      const sCol = resolved.sourceCol;
      const tCol = resolved.targetCol;

      adj.get(sTable)?.push({
        neighbor: tTable,
        joinType,
        onClause: `${sTable}.${sCol} = ${tTable}.${tCol}`,
      });

      let revJoinType = joinType;
      if (joinType === "LEFT") revJoinType = "RIGHT";
      else if (joinType === "RIGHT") revJoinType = "LEFT";

      adj.get(tTable)?.push({
        neighbor: sTable,
        joinType: revJoinType,
        onClause: `${sTable}.${sCol} = ${tTable}.${tCol}`,
      });
    });

    // Traverse connected components to build FROM clauses
    const visited = new Set<string>();
    const componentClauses: string[] = [];

    for (const startTable of canvasTableNames) {
      if (visited.has(startTable)) continue;

      visited.add(startTable);
      const queue = [startTable];
      let componentSql = startTable;

      while (queue.length > 0) {
        const curr = queue.shift()!;
        const neighbors = adj.get(curr) || [];

        for (const edgeInfo of neighbors) {
          if (!visited.has(edgeInfo.neighbor)) {
            visited.add(edgeInfo.neighbor);
            queue.push(edgeInfo.neighbor);
            componentSql += `\n${edgeInfo.joinType} JOIN ${edgeInfo.neighbor} ON ${edgeInfo.onClause}`;
          }
        }
      }

      componentClauses.push(componentSql);
    }

    const fromClause = componentClauses.join("\nCROSS JOIN ");

    // Selected columns
    const columns = selectedColumns.length > 0 ? selectedColumns.join(", ") : "*";
    let sql = `SELECT ${columns}\nFROM ${fromClause}`;

    // Filters / WHERE formatting
    const formatFilterValue = (val: string, operator: string) => {
      if (operator === "LIKE") {
        return val.includes("%") ? `'${val}'` : `'%${val}%'`;
      }
      if (
        val.toLowerCase() === "true" ||
        val.toLowerCase() === "false" ||
        val.toLowerCase() === "null"
      ) {
        return val.toUpperCase();
      }
      if (!isNaN(Number(val)) && val.trim() !== "") {
        return val;
      }
      return `'${val}'`;
    };

    const whereConditions = filters
      .filter((f) => f.column && f.value)
      .map((f) => `${f.column} ${f.operator} ${formatFilterValue(f.value, f.operator)}`);

    if (whereConditions.length > 0) {
      sql += `\nWHERE ${whereConditions.join(" AND ")}`;
    }

    if (groupBy) {
      sql += `\nGROUP BY ${groupBy}`;
    }

    if (sortBy) {
      sql += `\nORDER BY ${sortBy} ${sortOrder}`;
    }

    if (limit > 0) {
      sql += `\nLIMIT ${limit}`;
    }

    sql += ";";

    setGeneratedSQL(sql);
    addQuery(sql, canvasTableNames);
    toast.success("SQL generated");
  }, [
    nodes,
    edges,
    filters,
    groupBy,
    sortBy,
    sortOrder,
    limit,
    selectedColumns,
    resolveJoinColumns,
    addQuery,
  ]);

  const executeQuery = useCallback(async () => {
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

      const sessionId = await sessionService.createSession();
      setQuerySessionId(sessionId);

      await queryService.runQuery({
        sessionId,
        dbId,
        sql: generatedSQL,
      });
    } catch (error) {
      toast.error("Execution failed", { description: (error as Error).message });
      setIsExecuting(false);
    }
  }, [dbId, generatedSQL, querySessionId]);

  const handleCancelQuery = useCallback(async () => {
    if (!querySessionId) return;
    try {
      await sessionService.cancelSession(querySessionId);
      toast.info("Query cancelled");
    } catch (error: any) {
      toast.error("Failed to cancel", { description: error.message });
    }
  }, [querySessionId]);

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
    return <QueryBuilderPanelLoadingState />;
  }

  return (
    <div className="h-full flex flex-col bg-transparent">
      <BuilderHeader
        databaseName={databaseName}
        isExecuting={isExecuting}
        queryProgress={queryProgress}
        canGenerate={nodes.length > 0}
        canExecute={!!generatedSQL}
        onGenerate={generateSQL}
        onExecute={executeQuery}
        onCancel={handleCancelQuery}
      />

      {/* Main Content */}
      <div className="flex-1 flex overflow-hidden p-3 gap-3">
        <BuilderSidebar
          isOpen={sidebarOpen}
          onToggle={() => setSidebarOpen(!sidebarOpen)}
          tables={allTables}
          nodes={nodes}
          history={history}
          availableColumns={availableColumns}
          availableSchemas={availableSchemas}
          selectedSchema={selectedSchema}
          onSchemaChange={setSelectedSchema}
          filters={filters}
          selectedColumns={selectedColumns}
          sortBy={sortBy}
          sortOrder={sortOrder}
          groupBy={groupBy}
          limit={limit}
          tablesExpanded={tablesExpanded}
          configExpanded={configExpanded}
          historyExpanded={historyExpanded}
          onTablesExpandedChange={setTablesExpanded}
          onConfigExpandedChange={setConfigExpanded}
          onHistoryExpandedChange={setHistoryExpanded}
          onAddTable={addTable}
          onRemoveTable={removeTable}
          onFiltersChange={setFilters}
          onSelectedColumnsChange={setSelectedColumns}
          onSortByChange={setSortBy}
          onSortOrderChange={setSortOrder}
          onGroupByChange={setGroupBy}
          onLimitChange={setLimit}
          onHistorySelect={setGeneratedSQL}
          onClearHistory={clearHistory}
        />

        {/* Main Area */}
        <div className="flex-1 flex flex-col overflow-hidden rounded-lg border border-border/50 bg-card/55 shadow-sm">
          <DiagramCanvas
            nodes={nodes}
            edges={edges}
            onNodesChange={onNodesChange}
            onEdgesChange={onEdgesChange}
            onConnect={onConnect}
            onRemoveTable={removeTable}
            selectedEdge={selectedEdge}
            menuPosition={menuPosition}
            onEdgeClick={onEdgeClick}
            onUpdateJoinType={updateEdgeJoinType}
            onCloseMenu={closeMenu}
            onDeleteEdge={deleteEdge}
          />

          <SQLResultsPanel generatedSQL={generatedSQL} tableData={tableData} rowCount={rowCount} />
        </div>
      </div>

      <BuilderStatusBar
        tableCount={nodes.length}
        joinCount={edges.length}
        filterCount={filters.length}
        limit={limit}
        isExecuting={isExecuting}
      />
    </div>
  );
};

export default QueryBuilderPanel;
