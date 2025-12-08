import ReactFlow, { Background, BackgroundVariant, Controls } from "reactflow"
import { Card, CardTitle, CardContent, CardHeader } from "../ui/card"
import { Button } from "../ui/button"
import { Play } from "lucide-react"
import { Badge } from "../ui/badge"
import { DataTable } from "../DataTable"


interface VisualBuilderProps {
    nodes: any[];
    edges: any[];
    onNodesChange: any;
    onEdgesChange: any;
    onConnect: any;
    generatedSQL: string;
    executeQuery: () => void;
    queryResults: any[];
    nodeTypes: any;
}



const VisualBuilder = (props: VisualBuilderProps) => {
    const { nodes, edges, onNodesChange, onEdgesChange, onConnect, generatedSQL, executeQuery, queryResults, nodeTypes } = props;

    return (
        <div className="lg:col-span-2 space-y-4">
            <Card className="shadow-elevated h-[400px]">
                <CardHeader>
                    <CardTitle className="text-lg">Visual Diagram</CardTitle>
                    <p className="text-xs text-muted-foreground">
                        Drag tables to arrange • Connect tables to create joins
                    </p>
                </CardHeader>
                <CardContent className="h-[320px] p-0">
                    <ReactFlow
                        nodes={nodes}
                        edges={edges}
                        onNodesChange={onNodesChange}
                        onEdgesChange={onEdgesChange}
                        onConnect={onConnect}
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
                            <Button size="sm" onClick={executeQuery}>
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