import React from "react";
import ReactFlow, { Background, BackgroundVariant, Controls } from "reactflow"
import { Card, CardTitle, CardContent, CardHeader } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Play } from "lucide-react"
import { Badge } from "@/components/ui/badge"
import { DataTable } from "@/components/common/DataTable"
import { TableRow } from "@/types/database"


interface VisualBuilderProps {
    nodes: any[];
    edges: any[];
    onNodesChange: any;
    onEdgesChange: any;
    onConnect: any;
    updateEdgeJoinType: (edgeId: string, joinType: "INNER" | "LEFT" | "RIGHT" | "FULL") => void;
    generatedSQL: string;
    executeQuery: () => void;
    queryResults: TableRow[];
    nodeTypes: any;
    isExecuting?: boolean;
    rowCount?: number;
    queryProgress?: number;
}



const VisualBuilder = (props: VisualBuilderProps) => {
    const { nodes, edges, onNodesChange, onEdgesChange, onConnect, updateEdgeJoinType, generatedSQL, executeQuery, queryResults, nodeTypes, isExecuting, rowCount, queryProgress } = props;

    const [selectedEdge, setSelectedEdge] = React.useState<any>(null);
    const [menuPosition, setMenuPosition] = React.useState<{ x: number; y: number } | null>(null);

    const onEdgeClick = (event: React.MouseEvent, edge: any) => {
        event.preventDefault();
        setSelectedEdge(edge);
        setMenuPosition({ x: event.clientX, y: event.clientY });
    };

    const handleJoinTypeChange = (joinType: "INNER" | "LEFT" | "RIGHT" | "FULL") => {
        if (selectedEdge) {
            updateEdgeJoinType(selectedEdge.id, joinType);
        }
        setSelectedEdge(null);
        setMenuPosition(null);
    };

    return (
        <div className="lg:col-span-2 space-y-4">
            {/* JOIN Type Context Menu */}
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
                        className="fixed z-50 bg-popover border rounded-lg shadow-lg p-2 min-w-[120px]"
                        style={{ left: menuPosition.x, top: menuPosition.y }}
                    >
                        <div className="text-xs font-medium text-muted-foreground mb-2 px-2">Join Type</div>
                        {[
                            { type: 'INNER', color: 'hsl(var(--primary))' },
                            { type: 'LEFT', color: '#10B981' },
                            { type: 'RIGHT', color: '#F59E0B' },
                            { type: 'FULL', color: '#8B5CF6' }
                        ].map(({ type, color }) => (
                            <button
                                key={type}
                                onClick={() => handleJoinTypeChange(type as any)}
                                className="w-full text-left px-2 py-1.5 text-sm hover:bg-accent rounded flex items-center gap-2"
                            >
                                <span className="w-3 h-3 rounded-full" style={{ backgroundColor: color }} />
                                {type}
                            </button>
                        ))}
                    </div>
                </>
            )}

            <Card className="shadow-elevated h-[400px]">
                <CardHeader>
                    <CardTitle className="text-lg">Visual Diagram</CardTitle>
                    <p className="text-xs text-muted-foreground">
                        Drag tables to arrange • Connect tables to create joins
                    </p>
                    {isExecuting && (
                        <div className="mt-2">
                            <div className="text-xs text-muted-foreground mb-1">
                                Executing... {queryProgress}%
                            </div>
                            <div className="w-full bg-muted rounded-full h-2">
                                <div
                                    className="bg-primary h-2 rounded-full transition-all"
                                    style={{ width: `${queryProgress || 0}%` }}
                                />
                            </div>
                        </div>
                    )}
                </CardHeader>
                <CardContent className="h-80 p-0">
                    <ReactFlow
                        nodes={nodes}
                        edges={edges}
                        onNodesChange={onNodesChange}
                        onEdgesChange={onEdgesChange}
                        onConnect={onConnect}
                        onEdgeClick={onEdgeClick}
                        nodeTypes={nodeTypes}
                        fitView
                    >
                        <Background variant={BackgroundVariant.Dots} gap={12} size={1} />
                        <Controls />
                    </ReactFlow>
                </CardContent>
            </Card>

            {generatedSQL && (
                <Card className="shadow-elevated">
                    <CardHeader>
                        <div className="flex items-center justify-between">
                            <CardTitle className="text-lg">Generated SQL</CardTitle>
                            <Button size="sm" onClick={executeQuery} disabled={isExecuting}>
                                <Play className="h-4 w-4 mr-2" />
                                Execute
                            </Button>
                        </div>
                    </CardHeader>
                    <CardContent>
                        <pre className="bg-muted p-4 rounded-lg text-sm font-mono overflow-x-auto">
                            {generatedSQL}
                        </pre>
                    </CardContent>
                </Card>
            )}

            {queryResults.length > 0 && (
                <Card className="shadow-elevated">
                    <CardHeader>
                        <CardTitle className="text-lg">Results</CardTitle>
                        <Badge>{queryResults.length} rows</Badge>
                    </CardHeader>
                    <CardContent>
                        <DataTable data={queryResults} />
                    </CardContent>
                </Card>
            )}
        </div>)
}

export default VisualBuilder