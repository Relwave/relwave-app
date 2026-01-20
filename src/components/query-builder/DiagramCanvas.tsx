import { Node, Edge } from "reactflow";
import ReactFlow, { Background, BackgroundVariant, Controls } from "reactflow";
import { Table2, X } from "lucide-react";
import TableNode from "@/components/er-diagram/TableNode";

const nodeTypes = {
    table: TableNode,
};

interface DiagramCanvasProps {
    nodes: Node[];
    edges: Edge[];
    onNodesChange: (changes: any) => void;
    onEdgesChange: (changes: any) => void;
    onConnect: (connection: any) => void;
    onRemoveTable: (nodeId: string) => void;
    selectedEdge: any;
    menuPosition: { x: number; y: number } | null;
    onEdgeClick: (event: React.MouseEvent, edge: any) => void;
    onUpdateJoinType: (joinType: "INNER" | "LEFT" | "RIGHT" | "FULL") => void;
    onCloseMenu: () => void;
}

export function DiagramCanvas({
    nodes,
    edges,
    onNodesChange,
    onEdgesChange,
    onConnect,
    onRemoveTable,
    selectedEdge,
    menuPosition,
    onEdgeClick,
    onUpdateJoinType,
    onCloseMenu,
}: DiagramCanvasProps) {
    return (
        <div className="flex-1 relative min-h-[300px]">
            {/* Edge Join Type Menu */}
            {menuPosition && selectedEdge && (
                <>
                    <div
                        className="fixed inset-0 z-40"
                        onClick={onCloseMenu}
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
                                onClick={() => onUpdateJoinType(type as any)}
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
                                onClick={() => onRemoveTable(node.id)}
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
    );
}
