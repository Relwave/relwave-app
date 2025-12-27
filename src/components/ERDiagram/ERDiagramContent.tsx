import { bridgeApi, } from "@/services/bridgeApi";
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
import { ColumnDetails, DatabaseSchemaDetails } from "@/types/database";

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
                    setNodes(newNodes as typeof nodes);
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
        <div className="h-screen bg-background flex flex-col">
            <header className="border-b border-border bg-background/95 backdrop-blur-sm sticky top-0 z-10">
                <div className="container mx-auto px-4 py-3 flex items-center justify-between">
                    <div className="flex items-center gap-3">
                        <Link to={`/${dbId}`}>
                            <button className="p-2 text-muted-foreground hover:bg-muted rounded-md transition-colors">
                                <ArrowLeft className="h-4 w-4" />
                            </button>
                        </Link>
                        <div>
                            <h1 className="text-base font-medium text-foreground">ER Diagram</h1>
                            <p className="text-xs text-muted-foreground">{schemaData.name}</p>
                        </div>
                    </div>
                    <div className="flex items-center gap-2">
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
                    <Background variant={BackgroundVariant.Dots} gap={16} size={1} className="bg-background" />
                    <Controls showFitView={true} />
                </ReactFlow>
            </div>

            <div className="border-t border-border bg-card px-4 py-2">
                <div className="container mx-auto flex items-center justify-between text-xs text-muted-foreground">
                    <span>{nodes.length} Tables • {edges.length} Relations</span>
                    <span>Drag to pan • Scroll to zoom</span>
                </div>
            </div>
        </div>
    );
};

export default ERDiagramContent;