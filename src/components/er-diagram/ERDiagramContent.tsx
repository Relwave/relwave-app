import { toPng, toSvg } from "html-to-image";
import { ChevronDown, Cloud, Database, Download, HardDrive, LayoutGrid, Layers, MessageSquare, RefreshCw, Search, X } from "lucide-react";
import { lazy, Suspense, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Link, useParams } from "react-router-dom";
import {
    Background,
    BackgroundVariant,
    Controls,
    MiniMap,
    ReactFlow,
    useEdgesState,
    useNodesState,
    useReactFlow,
    Node,
    Edge,
    EdgeMouseHandler,
} from "reactflow";
import { toast } from "sonner";
import { transformSchemaToER } from "@/lib/schemaTransformer";
import { Spinner } from "@/components/ui/spinner";
import { useERDiagramData } from "@/hooks/useERDiagramData";
import { bridgeApi } from "@/services/bridgeApi";
import { ColumnDetails, DatabaseSchemaDetails, ForeignKeyInfo, TableSchemaDetails } from "@/types/database";
import type { ERNode } from "@/types/project";
import {
    Tooltip,
    TooltipContent,
    TooltipProvider,
    TooltipTrigger,
} from "@/components/ui/tooltip";
import {
    DropdownMenu,
    DropdownMenuContent,
    DropdownMenuItem,
    DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Button } from "@/components/ui/button";

const AnnotationLayer = lazy(() => import("@/components/er-diagram/AnnotationLayer"));

interface Column extends ColumnDetails {
    fkRef?: string; // e.g., "public.roles.id"
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

type ExportFormat = "png" | "svg";

interface ERDiagramContentProps {
    nodeTypes: {
        table: React.FC<{ data: TableNodeData }>;
    };
    projectId?: string | null;
}

const ER_SAVE_DEBOUNCE_MS = 2000;

const ERDiagramContent: React.FC<ERDiagramContentProps> = ({ nodeTypes, projectId }) => {
    const { id: dbId } = useParams<{ id: string }>();
    const reactFlowInstance = useReactFlow();

    const [nodes, setNodes, onNodesChange] = useNodesState<TableNodeData>([]);
    const [edges, setEdges, onEdgesChange] = useEdgesState([]);

    // Search and filter state
    const [searchQuery, setSearchQuery] = useState("");
    const [selectedNodeId, setSelectedNodeId] = useState<string | null>(null);
    const [hoveredEdge, setHoveredEdge] = useState<Edge | null>(null);
    const [selectedSchema, setSelectedSchema] = useState<string>("__all__");
    const [isSyncing, setIsSyncing] = useState(false);
    const [annotationMode, setAnnotationMode] = useState(false);

    // Exit annotation mode on Escape key
    useEffect(() => {
        if (!annotationMode) return;
        const handleKeyDown = (e: KeyboardEvent) => {
            if (e.key === "Escape") setAnnotationMode(false);
        };
        window.addEventListener("keydown", handleKeyDown);
        return () => window.removeEventListener("keydown", handleKeyDown);
    }, [annotationMode]);

    // Use the smart data source hook (offline-first + live fallback)
    const {
        schemaData,
        savedLayout,
        isLoading,
        dataSource,
        hasLiveSchema,
        syncFromDatabase,
    } = useERDiagramData(dbId, projectId);

    const error = !isLoading && !schemaData
        ? "No schema data available. Connect to a database or open a project."
        : (schemaData && !schemaData.schemas?.some(s => s.tables?.length))
            ? "Schema data found, but no tables to render."
            : null;

    // Get available schema names for the dropdown
    const availableSchemas = useMemo(() => {
        if (!schemaData?.schemas) return [];
        return schemaData.schemas
            .filter(s => s.tables?.length > 0)
            .map(s => s.name);
    }, [schemaData]);

    // Filter schema data based on selected schema
    const filteredSchemaData = useMemo((): DatabaseSchemaDetails | null => {
        if (!schemaData) return null;
        if (selectedSchema === "__all__") return schemaData;

        return {
            ...schemaData,
            schemas: schemaData.schemas.filter(s => s.name === selectedSchema)
        };
    }, [schemaData, selectedSchema]);

    // Transform schema to ER nodes/edges when data or filter changes
    // Merges saved layout positions with schema data:
    //   - Table in schema + in saved layout → use saved position
    //   - Table in schema but NOT in saved layout → auto-place (new table)
    //   - Table in saved layout but NOT in schema → ignored (removed table)
    useEffect(() => {
        if (filteredSchemaData && filteredSchemaData.schemas?.some(s => s.tables?.length)) {
            const layoutNodes = savedLayout?.nodes ?? null;
            const { nodes: newNodes, edges: newEdges } = transformSchemaToER(
                filteredSchemaData,
                true,
                layoutNodes
            );
            setNodes(newNodes as typeof nodes);
            setEdges(newEdges);
            // Fit view after layout change
            setTimeout(() => {
                if (savedLayout?.zoom != null && savedLayout?.panX != null && savedLayout?.panY != null) {
                    reactFlowInstance?.setViewport({
                        zoom: savedLayout.zoom,
                        x: savedLayout.panX,
                        y: savedLayout.panY,
                    });
                } else {
                    reactFlowInstance?.fitView({ padding: 0.2, duration: 300 });
                }
            }, 100);
        } else {
            setNodes([]);
            setEdges([]);
        }
    }, [filteredSchemaData, savedLayout, setNodes, setEdges, reactFlowInstance]);

    // -----------------------------------------
    // Auto-save ER node positions to project
    // Debounced: only fires ER_SAVE_DEBOUNCE_MS after last node movement
    // -----------------------------------------
    const erSaveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
    const initialLayoutDoneRef = useRef(false);

    // Mark that the initial layout just happened so we skip saving it
    useEffect(() => {
        initialLayoutDoneRef.current = false;
        const id = setTimeout(() => { initialLayoutDoneRef.current = true; }, 800);
        return () => clearTimeout(id);
    }, [filteredSchemaData, savedLayout]);

    useEffect(() => {
        // Don't save during initial layout or if no project linked
        if (!projectId || !initialLayoutDoneRef.current || nodes.length === 0) return;

        if (erSaveTimerRef.current) clearTimeout(erSaveTimerRef.current);

        erSaveTimerRef.current = setTimeout(() => {
            const viewport = reactFlowInstance?.getViewport();
            const erNodes: ERNode[] = nodes.map((n) => ({
                tableId: n.id,
                x: n.position.x,
                y: n.position.y,
                width: n.width ?? undefined,
                height: n.height ?? undefined,
            }));

            bridgeApi
                .saveProjectERDiagram(projectId, {
                    nodes: erNodes,
                    zoom: viewport?.zoom,
                    panX: viewport?.x,
                    panY: viewport?.y,
                })
                .then(() => console.debug("[ProjectSync] ER diagram saved"))
                .catch((err) => console.warn("[ProjectSync] ER diagram save failed:", err.message));
        }, ER_SAVE_DEBOUNCE_MS);

        return () => {
            if (erSaveTimerRef.current) clearTimeout(erSaveTimerRef.current);
        };
    }, [nodes, projectId, reactFlowInstance]);

    // Filter nodes based on search query
    const filteredNodes = useMemo(() => {
        if (!searchQuery.trim()) return nodes;
        const query = searchQuery.toLowerCase();
        return nodes.filter(node =>
            node.data.label.toLowerCase().includes(query) ||
            node.data.schema.toLowerCase().includes(query) ||
            node.data.columns.some(col => col.name.toLowerCase().includes(query))
        );
    }, [nodes, searchQuery]);

    // Handle node click - highlight related nodes and edges
    const handleNodeClick = useCallback((_event: React.MouseEvent, node: Node<TableNodeData>) => {
        const nodeId = node.id;

        if (selectedNodeId === nodeId) {
            // Deselect - reset all highlights
            setSelectedNodeId(null);
            setNodes(nds => nds.map(n => ({
                ...n,
                data: { ...n.data, isHighlighted: false }
            })));
            setEdges(eds => eds.map(e => ({
                ...e,
                animated: false,
                style: { ...e.style, strokeWidth: 2, opacity: 1 }
            })));
        } else {
            // Select - highlight connected nodes and edges
            setSelectedNodeId(nodeId);

            // Find connected edges
            const connectedEdges = edges.filter(e => e.source === nodeId || e.target === nodeId);
            const connectedNodeIds = new Set<string>();
            connectedNodeIds.add(nodeId);
            connectedEdges.forEach(e => {
                connectedNodeIds.add(e.source);
                connectedNodeIds.add(e.target);
            });

            // Update nodes
            setNodes(nds => nds.map(n => ({
                ...n,
                data: {
                    ...n.data,
                    isHighlighted: connectedNodeIds.has(n.id)
                },
                style: {
                    ...n.style,
                    opacity: connectedNodeIds.has(n.id) ? 1 : 0.3
                }
            })));

            // Update edges
            setEdges(eds => eds.map(e => ({
                ...e,
                animated: e.source === nodeId || e.target === nodeId,
                style: {
                    ...e.style,
                    strokeWidth: (e.source === nodeId || e.target === nodeId) ? 3 : 2,
                    opacity: (e.source === nodeId || e.target === nodeId) ? 1 : 0.2
                }
            })));
        }
    }, [selectedNodeId, edges, setNodes, setEdges]);

    // Clear selection
    const clearSelection = useCallback(() => {
        setSelectedNodeId(null);
        setSearchQuery("");
        setNodes(nds => nds.map(n => ({
            ...n,
            data: { ...n.data, isHighlighted: false },
            style: { ...n.style, opacity: 1 }
        })));
        setEdges(eds => eds.map(e => ({
            ...e,
            animated: false,
            style: { ...e.style, strokeWidth: 2, opacity: 1 }
        })));
    }, [setNodes, setEdges]);

    // Fit view to filtered nodes
    const fitToFiltered = useCallback(() => {
        if (filteredNodes.length > 0 && reactFlowInstance) {
            const nodeIds = filteredNodes.map(n => n.id);
            reactFlowInstance.fitView({
                nodes: filteredNodes,
                padding: 0.2,
                duration: 500
            });
        }
    }, [filteredNodes, reactFlowInstance]);

    // Re-layout with dagre (ignores saved layout to generate fresh positions)
    const reLayout = useCallback(() => {
        if (filteredSchemaData) {
            const { nodes: newNodes, edges: newEdges } = transformSchemaToER(filteredSchemaData, true, null);
            setNodes(newNodes as typeof nodes);
            setEdges(newEdges);
            setTimeout(() => reactFlowInstance?.fitView({ padding: 0.2, duration: 500 }), 100);
        }
    }, [filteredSchemaData, setNodes, setEdges, reactFlowInstance]);

    // Edge hover handlers for tooltip
    const onEdgeMouseEnter: EdgeMouseHandler = useCallback((_event, edge) => {
        setHoveredEdge(edge);
    }, []);

    const onEdgeMouseLeave: EdgeMouseHandler = useCallback(() => {
        setHoveredEdge(null);
    }, []);

    // --- Export logic ---
    const diagramContainerRef = useRef<HTMLDivElement>(null);

    const handleExport = useCallback(
        async (format: ExportFormat) => {
            // When annotation mode is on, capture the full container (ReactFlow + annotations)
            const flowContainer = annotationMode && diagramContainerRef.current
                ? diagramContainerRef.current
                : document.querySelector(".react-flow__renderer");
            if (!flowContainer) {
                toast.error("Export Failed", { description: "Could not find the diagram container." });
                return;
            }

            try {
                let dataUrl: string;
                const filename = `er-diagram-${schemaData?.name || "export"}-${Date.now()}`;
                const options = { quality: 0.95, backgroundColor: "#ffffff" };

                if (format === "png") dataUrl = await toPng(flowContainer as HTMLElement, options);
                else if (format === "svg") dataUrl = await toSvg(flowContainer as HTMLElement, options);
                else return;

                const link = document.createElement("a");
                link.download = `${filename}.${format}`;
                link.href = dataUrl;
                link.click();

                toast.success(`Exported diagram as ${format.toUpperCase()}`);
            } catch (err) {
                console.error("Export Error:", err);
                toast.error("Export Failed", { description: "Error capturing image data." });
            }
        },
        [schemaData, annotationMode]
    );

    // MiniMap node color based on schema
    const miniMapNodeColor = useCallback((node: Node<TableNodeData>) => {
        const schemaColors: Record<string, string> = {
            public: "#3B82F6",
            private: "#8B5CF6",
            auth: "#10B981",
            analytics: "#F59E0B",
        };
        return schemaColors[node.data.schema] || "#6B7280";
    }, []);

    // --- Conditional rendering ---
    if (isLoading) {
        return (
            <div className="h-screen flex items-center justify-center bg-background">
                <Spinner className="h-8 w-8 text-primary" />
            </div>
        );
    }

    if (error || !schemaData || nodes.length === 0) {
        return (
            <div className="h-screen flex items-center justify-center bg-background">
                <div className="text-center p-6 border border-border rounded-lg bg-card max-w-sm">
                    <Database className="h-8 w-8 mx-auto mb-3 text-muted-foreground" />
                    <h2 className="text-base font-medium mb-1">Diagram Unavailable</h2>
                    <p className="text-sm text-muted-foreground mb-4">{error || "No tables found."}</p>
                    <div className="flex gap-2 justify-center">
                        {hasLiveSchema && projectId && (
                            <Button
                                size="sm"
                                onClick={async () => {
                                    setIsSyncing(true);
                                    await syncFromDatabase();
                                    setIsSyncing(false);
                                }}
                                disabled={isSyncing}
                            >
                                {isSyncing ? (
                                    <Spinner className="h-3.5 w-3.5 mr-1.5" />
                                ) : (
                                    <RefreshCw className="h-3.5 w-3.5 mr-1.5" />
                                )}
                                Pull from Database
                            </Button>
                        )}
                        <Link to={`/${dbId}`}>
                            <Button variant="outline" size="sm">
                                Go Back
                            </Button>
                        </Link>
                    </div>
                </div>
            </div>
        );
    }

    // --- Main diagram render ---
    return (
        <TooltipProvider>
            <header className="h-12 border-b border-border/40 bg-background flex items-center justify-between px-4 shrink-0">
                <div className="container flex items-center justify-between gap-4">
                    <div className="flex items-center gap-3">
                        <Database className="h-4 w-4 text-muted-foreground" />
                        <span className="text-sm font-medium">{schemaData.name || 'Database'}</span>
                        <span className="text-muted-foreground/50">•</span>
                        <span className="text-sm font-medium text-foreground">ER Diagram</span>
                        {/* Data source badge */}
                        <Tooltip>
                            <TooltipTrigger asChild>
                                <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-medium ${dataSource === "live"
                                    ? "bg-emerald-500/10 text-emerald-600 border border-emerald-500/20"
                                    : "bg-amber-500/10 text-amber-600 border border-amber-500/20"
                                    }`}>
                                    {dataSource === "live" ? (
                                        <Cloud className="h-3 w-3" />
                                    ) : (
                                        <HardDrive className="h-3 w-3" />
                                    )}
                                    {dataSource === "live" ? "Live" : "Offline"}
                                </span>
                            </TooltipTrigger>
                            <TooltipContent side="bottom" sideOffset={8}>
                                {dataSource === "live"
                                    ? "Schema loaded from live database connection"
                                    : "Schema loaded from saved project files (offline)"}
                            </TooltipContent>
                        </Tooltip>
                    </div>

                    {/* Schema filter dropdown */}
                    {availableSchemas.length > 0 && (
                        <DropdownMenu>
                            <DropdownMenuTrigger asChild>
                                <Button variant="outline" size="sm" className="h-8 text-xs px-3 border-dashed">
                                    <Layers className="h-3.5 w-3.5 mr-1.5" />
                                    {selectedSchema === "__all__" ? "All Schemas" : selectedSchema}
                                    <ChevronDown className="h-3 w-3 ml-1.5" />
                                </Button>
                            </DropdownMenuTrigger>
                            <DropdownMenuContent align="start">
                                <DropdownMenuItem onClick={() => setSelectedSchema("__all__")}>
                                    <Layers className="h-3.5 w-3.5 mr-2" />
                                    All Schemas
                                    <span className="ml-auto text-xs text-muted-foreground">
                                        {schemaData?.schemas.reduce((acc, s) => acc + (s.tables?.length || 0), 0)} tables
                                    </span>
                                </DropdownMenuItem>
                                {availableSchemas.map(schema => (
                                    <DropdownMenuItem key={schema} onClick={() => setSelectedSchema(schema)}>
                                        {schema}
                                        <span className="ml-auto text-xs text-muted-foreground">
                                            {schemaData?.schemas.find(s => s.name === schema)?.tables?.length || 0} tables
                                        </span>
                                    </DropdownMenuItem>
                                ))}
                            </DropdownMenuContent>
                        </DropdownMenu>
                    )}

                    {/* Search bar */}
                    <div className="flex-1 max-w-md">
                        <div className="relative">
                            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                            <input
                                type="text"
                                placeholder="Search tables or columns..."
                                value={searchQuery}
                                onChange={(e) => setSearchQuery(e.target.value)}
                                className="w-full pl-9 pr-9 py-1.5 text-sm border border-border rounded-md bg-background focus:outline-none focus:ring-2 focus:ring-primary/20"
                            />
                            {searchQuery && (
                                <button
                                    onClick={() => setSearchQuery("")}
                                    className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                                >
                                    <X className="h-4 w-4" />
                                </button>
                            )}
                        </div>
                        {searchQuery && (
                            <div className="absolute mt-1 text-xs text-muted-foreground">
                                Found {filteredNodes.length} of {nodes.length} tables
                                {filteredNodes.length > 0 && (
                                    <button
                                        onClick={fitToFiltered}
                                        className="ml-2 text-primary hover:underline"
                                    >
                                        Focus
                                    </button>
                                )}
                            </div>
                        )}
                    </div>

                    <div className="flex items-center gap-2">
                        {selectedNodeId && (
                            <button
                                onClick={clearSelection}
                                className="px-3 py-1.5 text-sm text-muted-foreground hover:text-foreground hover:bg-muted rounded-md transition-colors flex items-center gap-1.5"
                            >
                                <X className="h-3.5 w-3.5" />
                                Clear
                            </button>
                        )}
                        {/* Sync from Database button */}
                        {projectId && (
                            <Tooltip>
                                <TooltipTrigger asChild>
                                    <Button
                                        variant="outline"
                                        size="sm"
                                        className="h-8 text-xs"
                                        onClick={async () => {
                                            setIsSyncing(true);
                                            await syncFromDatabase();
                                            setIsSyncing(false);
                                        }}
                                        disabled={isSyncing || !hasLiveSchema}
                                    >
                                        {isSyncing ? (
                                            <Spinner className="h-3.5 w-3.5 mr-1.5" />
                                        ) : (
                                            <RefreshCw className="h-3.5 w-3.5 mr-1.5" />
                                        )}
                                        Sync
                                    </Button>
                                </TooltipTrigger>
                                <TooltipContent side="bottom" sideOffset={8}>
                                    Pull fresh schema from database (keeps your layout)
                                </TooltipContent>
                            </Tooltip>
                        )}
                        {/* Annotation mode toggle */}
                        {projectId && (
                            <Tooltip>
                                <TooltipTrigger asChild>
                                    <button
                                        onClick={() => setAnnotationMode(prev => !prev)}
                                        className={`p-2 border rounded-md transition-colors ${
                                            annotationMode
                                                ? "border-primary bg-primary/10 text-primary"
                                                : "border-border hover:bg-muted"
                                        }`}
                                    >
                                        <MessageSquare className="h-4 w-4" />
                                    </button>
                                </TooltipTrigger>
                                <TooltipContent side="bottom" sideOffset={8}>
                                    {annotationMode ? "Exit annotation mode" : "Annotate diagram"}
                                </TooltipContent>
                            </Tooltip>
                        )}
                        <Tooltip>
                            <TooltipTrigger asChild>
                                <button
                                    onClick={reLayout}
                                    className="p-2 border border-border rounded-md hover:bg-muted transition-colors"
                                >
                                    <LayoutGrid className="h-4 w-4" />
                                </button>
                            </TooltipTrigger>
                            <TooltipContent side="bottom" sideOffset={8}>Re-layout diagram</TooltipContent>
                        </Tooltip>
                        {["png", "svg"].map((format) => (
                            <button
                                key={format}
                                onClick={() => handleExport(format as ExportFormat)}
                                className="px-3 py-1.5 border border-border rounded-md hover:bg-muted transition-colors flex items-center gap-1.5 text-sm text-foreground"
                            >
                                <Download className="h-3.5 w-3.5" />
                                {format.toUpperCase()}
                            </button>
                        ))}
                    </div>
                </div>
            </header>

            <div className="flex-1 relative" ref={diagramContainerRef}>
                {/* Annotation overlay — stays mounted to avoid re-loading; toggled via active prop */}
                {projectId && (
                    <Suspense fallback={null}>
                        <AnnotationLayer projectId={projectId} active={annotationMode} />
                    </Suspense>
                )}

                <ReactFlow
                    nodes={searchQuery ? filteredNodes : nodes}
                    edges={edges}
                    onNodesChange={onNodesChange}
                    onEdgesChange={onEdgesChange}
                    onNodeClick={handleNodeClick}
                    onEdgeMouseEnter={onEdgeMouseEnter}
                    onEdgeMouseLeave={onEdgeMouseLeave}
                    nodeTypes={nodeTypes}
                    fitView
                    minZoom={0.1}
                    maxZoom={4}
                    defaultViewport={{ x: 0, y: 0, zoom: 1 }}
                    nodesDraggable={!annotationMode}
                    nodesConnectable={!annotationMode}
                    elementsSelectable={!annotationMode}
                    panOnDrag={!annotationMode}
                    zoomOnScroll={!annotationMode}
                    zoomOnDoubleClick={!annotationMode}
                    zoomOnPinch={!annotationMode}
                >
                    <Background variant={BackgroundVariant.Dots} gap={16} size={1} className="bg-background" />
                    <Controls showFitView={true} style={{ bottom: 16, left: 16 }} />
                    <MiniMap
                        nodeColor={miniMapNodeColor}
                        maskColor="rgba(0, 0, 0, 0.1)"
                        className="bg-card border border-border rounded-md"
                        style={{ bottom: 66 }}
                        pannable
                        zoomable
                    />
                </ReactFlow>

                {/* Edge tooltip */}
                {hoveredEdge && hoveredEdge.data && (
                    <div className="absolute bottom-20 left-1/2 -translate-x-1/2 bg-popover border border-border rounded-lg shadow-lg p-3 text-xs z-50">
                        <div className="font-semibold mb-1">{hoveredEdge.data.constraintName}</div>
                        <div className="text-muted-foreground">
                            {hoveredEdge.data.sourceTable}.{hoveredEdge.data.sourceColumn} → {hoveredEdge.data.targetTable}.{hoveredEdge.data.targetColumn}
                        </div>
                        <div className="flex gap-3 mt-1 text-[10px]">
                            <span>ON DELETE: <span className="text-red-500">{hoveredEdge.data.deleteRule}</span></span>
                            <span>ON UPDATE: <span className="text-blue-500">{hoveredEdge.data.updateRule}</span></span>
                        </div>
                    </div>
                )}

                {/* Legend */}
                <div className="absolute bottom-20 left-52 bg-card/90 backdrop-blur-sm border border-border rounded-lg p-3 text-xs z-10">
                    <div className="font-semibold mb-2">Legend</div>
                    <div className="space-y-1">
                        <div className="flex items-center gap-2">
                            <div className="w-3 h-3 bg-amber-500 rounded-full"></div>
                            <span>Primary Key</span>
                        </div>
                        <div className="flex items-center gap-2">
                            <div className="w-3 h-3 bg-cyan-500 rounded-full"></div>
                            <span>Foreign Key</span>
                        </div>
                        <div className="flex items-center gap-2">
                            <div className="w-3 h-0.5 bg-cyan-500"></div>
                            <span>N:1 Relationship</span>
                        </div>
                        <div className="flex items-center gap-2">
                            <span className="text-red-500 font-bold">*</span>
                            <span>Not Nullable</span>
                        </div>
                    </div>
                </div>
            </div>

            <div className="border-t border-border bg-card px-4 py-2">
                <div className="container mx-auto flex items-center justify-between text-xs text-muted-foreground">
                    <span>
                        {nodes.length} Tables • {edges.length} Relations
                        {selectedSchema !== "__all__" && ` • Schema: ${selectedSchema}`}
                        {selectedNodeId && ` • Selected: ${selectedNodeId.split('.')[1]}`}
                    </span>
                    <span className="flex items-center gap-3">
                        {annotationMode && (
                            <span className="text-primary font-medium">Annotation Mode</span>
                        )}
                        {savedLayout && (
                            <span className="text-muted-foreground/60">Layout saved</span>
                        )}
                        <span>
                            {annotationMode
                                ? "Draw on the canvas • Press Esc or toggle button to exit"
                                : "Click table to highlight • Drag to pan • Scroll to zoom"}
                        </span>
                    </span>
                </div>
            </div>
        </TooltipProvider >
    );
};

export default ERDiagramContent;