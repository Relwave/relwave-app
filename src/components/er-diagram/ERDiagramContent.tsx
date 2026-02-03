import { toPng, toSvg } from "html-to-image";
import { ArrowLeft, ChevronDown, Database, Download, Filter, LayoutGrid, Layers, Search, X } from "lucide-react";
import { useCallback, useEffect, useMemo, useState } from "react";
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
import { useFullSchema } from "@/hooks/useDbQueries";
import { ColumnDetails, DatabaseSchemaDetails, ForeignKeyInfo, TableSchemaDetails } from "@/types/database";
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
}

const ERDiagramContent: React.FC<ERDiagramContentProps> = ({ nodeTypes }) => {
    const { id: dbId } = useParams<{ id: string }>();
    const reactFlowInstance = useReactFlow();

    const [nodes, setNodes, onNodesChange] = useNodesState<TableNodeData>([]);
    const [edges, setEdges, onEdgesChange] = useEdgesState([]);

    // Search and filter state
    const [searchQuery, setSearchQuery] = useState("");
    const [selectedNodeId, setSelectedNodeId] = useState<string | null>(null);
    const [hoveredEdge, setHoveredEdge] = useState<Edge | null>(null);
    const [selectedSchema, setSelectedSchema] = useState<string>("__all__");

    // Use React Query for schema data (cached!)
    const {
        data: schemaData,
        isLoading,
        error: queryError
    } = useFullSchema(dbId);


    const error = queryError ? (queryError as Error).message :
        (schemaData && !schemaData.schemas?.some(s => s.tables?.length))
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
    useEffect(() => {
        if (filteredSchemaData && filteredSchemaData.schemas?.some(s => s.tables?.length)) {
            const { nodes: newNodes, edges: newEdges } = transformSchemaToER(filteredSchemaData);
            setNodes(newNodes as typeof nodes);
            setEdges(newEdges);
            // Fit view after layout change
            setTimeout(() => reactFlowInstance?.fitView({ padding: 0.2, duration: 300 }), 100);
        } else {
            setNodes([]);
            setEdges([]);
        }
    }, [filteredSchemaData, setNodes, setEdges, reactFlowInstance]);

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

    // Re-layout with dagre
    const reLayout = useCallback(() => {
        if (filteredSchemaData) {
            const { nodes: newNodes, edges: newEdges } = transformSchemaToER(filteredSchemaData, true);
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
    const handleExport = useCallback(
        async (format: ExportFormat) => {
            const flowContainer = document.querySelector(".react-flow__renderer");
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
        [schemaData]
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
                <div className="text-center p-6 border border-border rounded-lg bg-card">
                    <Database className="h-8 w-8 mx-auto mb-3 text-muted-foreground" />
                    <h2 className="text-base font-medium mb-1">Diagram Unavailable</h2>
                    <p className="text-sm text-muted-foreground mb-4">{error || "No tables found."}</p>
                    <Link to={`/${dbId}`}>
                        <button className="px-4 py-2 rounded-md text-sm bg-primary text-primary-foreground hover:bg-primary/90">
                            Go Back
                        </button>
                    </Link>
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
                        <Tooltip>
                            <TooltipTrigger asChild>
                                <button
                                    onClick={reLayout}
                                    className="p-2 border border-border rounded-md hover:bg-muted transition-colors"
                                >
                                    <LayoutGrid className="h-4 w-4" />
                                </button>
                            </TooltipTrigger>
                            <TooltipContent>Re-layout diagram</TooltipContent>
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

            <div className="flex-1 relative">
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
                    <span>Click table to highlight • Drag to pan • Scroll to zoom</span>
                </div>
            </div>
        </TooltipProvider >
    );
};

export default ERDiagramContent;