import { bridgeApi, ColumnDetails, DatabaseSchemaDetails } from "@/services/bridgeApi";
import { toPng, toSvg } from "html-to-image";
import { ArrowLeft, Database, Download } from "lucide-react";
import { useCallback, useEffect, useState } from "react";
import { Link, useParams } from "react-router-dom";
import {
    Background,
    BackgroundVariant,
    Controls,
    ReactFlow,
    useEdgesState,
    useNodesState,
    useReactFlow
} from "reactflow";
import { toast } from "sonner";
import { transformSchemaToER } from "../../lib/schemaTransformer";
import { Spinner } from "../ui/spinner";
import { useBridgeQuery } from "@/hooks/useBridgeQuery";

interface Column extends ColumnDetails {
    fkRef?: string; // e.g., "roles.id"
}

interface TableNodeData {
    label: string;
    columns: Column[];
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

    const [schemaData, setSchemaData] = useState<DatabaseSchemaDetails | null>(null);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);

    const [nodes, setNodes, onNodesChange] = useNodesState<TableNodeData>([]);
    const [edges, setEdges, onEdgesChange] = useEdgesState([]);

    const { data: bridgeReady, isLoading: bridgeLoading } = useBridgeQuery();

    // --- Fetch schema after bridge is ready ---
    useEffect(() => {
        if (!bridgeReady || !dbId) return;

        const fetchSchema = async () => {
            setLoading(true);
            setError(null);

            try {
                const result = await bridgeApi.getSchema(dbId);
                if (result && result.schemas?.some(s => s.tables?.length)) {
                    setSchemaData(result);
                    const { nodes: newNodes, edges: newEdges } = transformSchemaToER(result);
                    setNodes(newNodes);
                    setEdges(newEdges);
                } else {
                    setError("Schema data found, but no tables to render.");
                }
            } catch (err: any) {
                console.error("ER Diagram fetch failed:", err);
                setError(err.message || "Failed to load schema for diagram.");
                toast.error("ER Diagram Load Failed", { description: err.message });
            } finally {
                setLoading(false);
            }
        };

        fetchSchema();
    }, [bridgeReady, dbId, setNodes, setEdges]);

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

    // --- Conditional rendering ---
    if (bridgeLoading || loading) {
        return (
            <div className="h-screen flex items-center justify-center bg-background dark:bg-[#050505]">
                <Spinner className="size-16" />
            </div>
        );
    }

    if (error || !schemaData || nodes.length === 0) {
        return (
            <div className="h-screen flex items-center justify-center bg-background dark:bg-[#050505]">
                <div className="text-center p-8 border border-destructive/30 rounded-xl bg-destructive/10 text-destructive">
                    <Database className="h-8 w-8 mx-auto mb-4" />
                    <h2 className="text-xl font-bold mb-2">Diagram Unavailable</h2>
                    <p className="text-sm text-muted-foreground">{error || "No tables or schemas found to render the ER diagram."}</p>
                    <Link to={`/${dbId}`}>
                        <button className="mt-4 px-4 py-2 rounded-lg text-sm bg-primary text-white hover:bg-primary/90 shadow-md shadow-primary/30">
                            Go Back
                        </button>
                    </Link>
                </div>
            </div>
        );
    }

    // --- Main diagram render ---
    return (
        <div className="h-screen bg-background dark:bg-[#050505] flex flex-col">
            <header className="border-b border-border/50 bg-card/50 backdrop-blur-xl shadow-sm z-10 shrink-0">
                <div className="container mx-auto px-6 py-4 flex items-center justify-between">
                    <div className="flex items-center gap-4">
                        <Link to={`/${dbId}`}>
                            <button className="p-2 text-muted-foreground hover:bg-accent rounded-lg transition-colors">
                                <ArrowLeft className="h-5 w-5" />
                            </button>
                        </Link>
                        <div>
                            <h1 className="text-2xl font-bold text-foreground">ER Diagram</h1>
                            <p className="text-sm text-muted-foreground">{schemaData.name} - Entity Relationship Diagram</p>
                        </div>
                    </div>
                    <div className="flex items-center gap-2">
                        {["png", "svg"].map((format) => (
                            <button
                                key={format}
                                onClick={() => handleExport(format as ExportFormat)}
                                className="px-4 py-2 border border-border rounded-lg hover:bg-accent transition-colors flex items-center gap-2 text-sm font-medium text-foreground"
                            >
                                <Download className="h-4 w-4" />
                                Export {format.toUpperCase()}
                            </button>
                        ))}
                    </div>
                </div>
            </header>

            <div className="flex-1 relative">
                <ReactFlow
                    nodes={nodes}
                    edges={edges}
                    onNodesChange={onNodesChange}
                    onEdgesChange={onEdgesChange}
                    nodeTypes={nodeTypes}
                    fitView
                    minZoom={0.1}
                    maxZoom={4}
                    defaultViewport={{ x: 0, y: 0, zoom: 1 }}
                >
                    <Background variant={BackgroundVariant.Dots} gap={16} size={1} color="#94a3b8" className="dark:bg-[#050505]" />
                    <Controls className="dark:border-border dark:bg-card dark:text-foreground" showFitView={true} />
                </ReactFlow>
            </div>

            <div className="border-t border-border bg-card px-6 py-3 shrink-0">
                <div className="container mx-auto flex items-center justify-between text-sm text-muted-foreground">
                    <span className="flex items-center gap-2">
                        <Database className="h-4 w-4 text-muted-foreground" />
                        {nodes.length} Tables
                    </span>
                    <span className="flex items-center gap-2">
                        <span className="text-muted-foreground">🔗</span>
                        {edges.length} Relations
                    </span>
                    <div className="text-xs text-muted-foreground">Drag to pan • Scroll to zoom • Click and drag nodes to rearrange</div>
                </div>
            </div>
        </div>
    );
};

export default ERDiagramContent;