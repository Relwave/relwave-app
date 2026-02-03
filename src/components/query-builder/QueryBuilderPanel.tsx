import { useState, useCallback, useEffect, useMemo } from "react";
import {
    Node,
    useNodesState,
    useEdgesState,
    addEdge,
    Connection,
} from "reactflow";
import "reactflow/dist/style.css";
import { toast } from "sonner";
import { useFullSchema } from "@/hooks/useDbQueries";
import { useQueryHistory } from "@/hooks/useQueryHistory";
import { useDatabase } from "@/hooks/useDbQueries";
import { Spinner } from "@/components/ui/spinner";
import { useBridgeQuery } from "@/hooks/useBridgeQuery";
import { TableRow } from "@/types/database";
import { bridgeApi } from "@/services/bridgeApi";

// Sub-components
import { BuilderHeader } from "./BuilderHeader";
import { BuilderSidebar } from "./BuilderSidebar";
import { DiagramCanvas } from "./DiagramCanvas";
import { SQLResultsPanel } from "./SQLResultsPanel";
import { BuilderStatusBar } from "./BuilderStatusBar";

// Types
import { QueryFilter, ColumnOption } from "./types";

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
    const [queryProgress, setQueryProgress] = useState<{ rows: number; elapsed: number } | null>(null);
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
        return schemaData.schemas
            .filter(s => s.tables?.length > 0)
            .map(s => s.name);
    }, [schemaData]);

    // Get tables filtered by selected schema
    const allTables = useMemo(() => {
        if (!schemaData) return [];
        if (selectedSchema === "__all__") {
            return schemaData.schemas.flatMap((schema) => schema.tables);
        }
        const schema = schemaData.schemas.find(s => s.name === selectedSchema);
        return schema?.tables || [];
    }, [schemaData, selectedSchema]);

    // Get available columns from added nodes
    const availableColumns: ColumnOption[] = useMemo(() => {
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

    const closeMenu = useCallback(() => {
        setSelectedEdge(null);
        setMenuPosition(null);
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
    }, [dbId, generatedSQL, querySessionId]);

    const handleCancelQuery = useCallback(async () => {
        if (!querySessionId) return;
        try {
            await bridgeApi.cancelSession(querySessionId);
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
        return (
            <div className="h-full flex items-center justify-center">
                <Spinner className="h-8 w-8" />
            </div>
        );
    }

    return (
        <div className="h-full flex flex-col bg-background">
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
            <div className="flex-1 flex overflow-hidden">
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
                <div className="flex-1 flex flex-col overflow-hidden">
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
                    />

                    <SQLResultsPanel
                        generatedSQL={generatedSQL}
                        tableData={tableData}
                        rowCount={rowCount}
                    />
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
