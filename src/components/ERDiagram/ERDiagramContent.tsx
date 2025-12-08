import { bridgeApi, ColumnDetails, DatabaseSchemaDetails, TableSchemaDetails } from "@/services/bridgeApi";
import { toPng, toSvg } from "html-to-image";
import { ArrowLeft, Database, Download, Loader } from "lucide-react";
import { useCallback, useEffect, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { Background, BackgroundVariant, Controls, Edge, MarkerType, Node, ReactFlow, useEdgesState, useNodesState, useReactFlow } from "reactflow";
import { toast } from "sonner";
import { transformSchemaToER } from "../../lib/schemaTransformer";

interface Column extends ColumnDetails {
    fkRef?: string; // e.g., "roles.id"
}

interface TableNodeData {
    label: string;
    columns: Column[];
}



type ExportFormat = "png" | "svg" | string;








interface ERDiagramContentProps {
    nodeTypes: {
        table: React.FC<{ data: TableNodeData }>;
    }
}



const ERDiagramContent: React.FC<ERDiagramContentProps> = ({ nodeTypes }) => {
    const { id: dbId } = useParams<{ id: string }>();
    const reactFlowInstance = useReactFlow();

    const [schemaData, setSchemaData] = useState<DatabaseSchemaDetails | null>(null);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);

    // Initial state derived from schemaData
    const [nodes, setNodes, onNodesChange] = useNodesState<TableNodeData>([]);
    const [edges, setEdges, onEdgesChange] = useEdgesState([]);

    // Fit view function (for manual control, though fitView prop handles initial fit)
    const fitView = useCallback(() => {
        if (reactFlowInstance) {
            reactFlowInstance.fitView({ padding: 0.2 });
        }
    }, [reactFlowInstance]);

    // --- Data Fetching Effect ---
    useEffect(() => {
        const fetchSchemaAndSetupDiagram = async () => {
            if (!dbId) return;

            setLoading(true);
            setError(null);

            try {
                const result = await bridgeApi.getSchema(dbId);

                if (result) {
                    if (result.schemas && result.schemas.some(s => s.tables && s.tables.length > 0)) {
                        setSchemaData(result);
                        const { nodes: newNodes, edges: newEdges } = transformSchemaToER(result);

                        setNodes(newNodes);
                        setEdges(newEdges);

                    } else {
                        setError("Schema data found, but no tables to render.");
                    }
                } else {
                    setError(`No schema data found for database ID: ${dbId}`);
                }
            } catch (err: any) {
                console.error("ER Diagram fetch failed:", err);
                setError(err.message || "Failed to load schema for diagram.");
                toast.error("ER Diagram Load Failed", { description: err.message });
            } finally {
                setLoading(false);
            }
        };

        fetchSchemaAndSetupDiagram();
    }, [dbId, setNodes, setEdges]);


    // --- Export Logic ---

    const handleExport = useCallback(async (format: ExportFormat): Promise<void> => {
        const flowContainer = document.querySelector('.react-flow__renderer');

        if (!flowContainer) {
            toast.error("Export Failed", { description: "Could not find the diagram container." });
            return;
        }

        try {
            let dataUrl: string;
            const filename = `er-diagram-${schemaData?.name || 'export'}-${Date.now()}`;

            const options = {
                quality: 0.95,
                backgroundColor: '#ffffff', // Use a white background for better visibility in exports
            };

            if (format === "png") {
                dataUrl = await toPng(flowContainer as HTMLElement, options);
            } else if (format === "svg") {
                dataUrl = await toSvg(flowContainer as HTMLElement, options);
            } else {
                return;
            }

            const link = document.createElement("a");
            link.download = `${filename}.${format}`;
            link.href = dataUrl;
            link.click();

            toast.success(`Exported diagram as ${format.toUpperCase()}`);

        } catch (error) {
            console.error("Export Error:", error);
            toast.error("Export Failed", { description: "Error capturing image data." });
        }

    }, [schemaData]);


    // --- Render Conditional States ---

    if (loading) {
        return (
            <div className="h-screen flex items-center justify-center bg-background dark:bg-[#050505]">
                <Loader />
            </div>
        );
    }

    if (error || !schemaData || nodes.length === 0) {
        return (
            <div className="h-screen flex items-center justify-center bg-background dark:bg-[#050505]">
                {/* Error Box: Use destructive/error colors and clean styling */}
                <div className="text-center p-8 border border-destructive/30 rounded-xl bg-destructive/10 text-destructive">
                    <Database className="h-8 w-8 mx-auto mb-4" />
                    <h2 className="text-xl font-bold mb-2">Diagram Unavailable</h2>
                    <p className="text-sm text-muted-foreground">
                        {error || "No tables or schemas found to render the ER diagram."}
                    </p>
                    <Link to={`/${dbId}`}>
                        <button
                            // Solid primary button (cyan accent)
                            className="mt-4 px-4 py-2 rounded-lg text-sm bg-primary text-white hover:bg-primary/90 shadow-md shadow-primary/30"
                        >
                            Go Back
                        </button>
                    </Link>
                </div>
            </div>
        );
    }

    // --- Main Diagram Render ---

    return (
        <div className="h-screen bg-background dark:bg-[#050505] flex flex-col">

            {/* Header: Use card/backdrop styling */}
            <header className="border-b border-border/50 bg-card/50 backdrop-blur-xl shadow-sm z-10 shrink-0">
                <div className="container mx-auto px-6 py-4">
                    <div className="flex items-center justify-between">
                        <div className="flex items-center gap-4">
                            <Link to={`/${dbId}`}>
                                <button
                                    // Use ghost style with theme hover
                                    className="p-2 text-muted-foreground hover:bg-accent rounded-lg transition-colors"
                                >
                                    <ArrowLeft className="h-5 w-5" />
                                </button>
                            </Link>
                            <div>
                                <h1 className="text-2xl font-bold text-foreground">ER Diagram</h1>
                                <p className="text-sm text-muted-foreground">
                                    {schemaData.name} - Entity Relationship Diagram
                                </p>
                            </div>
                        </div>
                        <div className="flex items-center gap-2">
                            {[
                                { label: "PNG", format: "png" },
                                { label: "SVG", format: "svg" },
                            ].map((btn) => (
                                <button
                                    key={btn.format}
                                    onClick={() => handleExport(btn.format)}
                                    // Use outline button style with theme colors
                                    className="px-4 py-2 border border-border rounded-lg hover:bg-accent transition-colors flex items-center gap-2 text-sm font-medium text-foreground"
                                >
                                    <Download className="h-4 w-4" />
                                    Export {btn.label}
                                </button>
                            ))}
                        </div>
                    </div>
                </div>
            </header>

            {/* Diagram Area */}
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
                    <Background
                        variant={BackgroundVariant.Dots}
                        gap={16}
                        size={1}
                        // Use a subtle gray background color for the dots
                        color="#94a3b8"
                        className="dark:bg-[#050505]"
                    />
                    <Controls
                        // Style controls using theme tokens
                        className="dark:border-border dark:bg-card dark:text-foreground"
                        showFitView={true}
                    />
                </ReactFlow>
            </div>

            {/* Info Panel (Footer) */}
            <div className="border-t border-border bg-card px-6 py-3 shrink-0">
                <div className="container mx-auto flex items-center justify-between text-sm text-muted-foreground">
                    <div className="flex items-center gap-6">
                        <span className="flex items-center gap-2">
                            <Database className="h-4 w-4 text-muted-foreground" />
                            {nodes.length} Tables
                        </span>
                        <span className="flex items-center gap-2">
                            <span className="text-muted-foreground">🔗</span>
                            {edges.length} Relations
                        </span>
                    </div>
                    <div className="text-xs text-muted-foreground">
                        Drag to pan • Scroll to zoom • Click and drag nodes to rearrange
                    </div>
                </div>
            </div>
        </div>
    );
};

export default ERDiagramContent;