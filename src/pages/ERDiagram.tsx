import { useParams, Link } from "react-router-dom";
import { useState, useCallback } from "react";
import ReactFlow, {
  Node,
  Edge,
  Controls,
  Background,
  useNodesState,
  useEdgesState,
  MarkerType,
  BackgroundVariant,
} from "reactflow";
import "reactflow/dist/style.css";
import { ArrowLeft, Download, Database, ZoomIn, ZoomOut } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { toPng, toSvg } from "html-to-image";
import { toast } from "sonner";

// Mock schema data
const mockSchema = {
  users: {
    columns: [
      { name: "id", type: "INT", pk: true, fk: undefined },
      { name: "name", type: "VARCHAR", fk: undefined },
      { name: "email", type: "VARCHAR", fk: undefined },
      { name: "role_id", type: "INT", fk: "roles.id" },
    ],
  },
  orders: {
    columns: [
      { name: "id", type: "INT", pk: true, fk: undefined },
      { name: "user_id", type: "INT", fk: "users.id" },
      { name: "product_id", type: "INT", fk: "products.id" },
      { name: "amount", type: "DECIMAL", fk: undefined },
      { name: "created_at", type: "TIMESTAMP", fk: undefined },
    ],
  },
  products: {
    columns: [
      { name: "id", type: "INT", pk: true, fk: undefined },
      { name: "name", type: "VARCHAR", fk: undefined },
      { name: "price", type: "DECIMAL", fk: undefined },
      { name: "category_id", type: "INT", fk: "categories.id" },
    ],
  },
  categories: {
    columns: [
      { name: "id", type: "INT", pk: true, fk: undefined },
      { name: "name", type: "VARCHAR", fk: undefined },
    ],
  },
  roles: {
    columns: [
      { name: "id", type: "INT", pk: true, fk: undefined },
      { name: "name", type: "VARCHAR", fk: undefined },
    ],
  },
};

const TableNode = ({ data }: { data: any }) => {
  return (
    <Card className="min-w-[200px] shadow-elevated border-primary/20">
      <div className="bg-primary text-primary-foreground px-4 py-2 font-mono font-bold flex items-center gap-2 rounded-t-lg">
        <Database className="h-4 w-4" />
        {data.label}
      </div>
      <div className="divide-y">
        {data.columns.map((col: any, idx: number) => (
          <div key={idx} className="px-4 py-2 text-sm font-mono flex justify-between gap-4">
            <span className={col.pk ? "text-primary font-semibold" : ""}>
              {col.name}
              {col.pk && " 🔑"}
            </span>
            <span className="text-muted-foreground">{col.type}</span>
          </div>
        ))}
      </div>
    </Card>
  );
};

const nodeTypes = {
  table: TableNode,
};

const ERDiagram = () => {
  const { id } = useParams();
  
  // Create nodes from schema
  const initialNodes: Node[] = Object.entries(mockSchema).map(([tableName, table], index) => ({
    id: tableName,
    type: "table",
    position: { x: (index % 3) * 300 + 50, y: Math.floor(index / 3) * 300 + 50 },
    data: { label: tableName, columns: table.columns },
  }));

  // Create edges from foreign keys
  const initialEdges: Edge[] = [];
  Object.entries(mockSchema).forEach(([tableName, table]) => {
    table.columns.forEach((col) => {
      if (col.fk) {
        const [targetTable] = col.fk.split(".");
        initialEdges.push({
          id: `${tableName}-${targetTable}-${col.name}`,
          source: tableName,
          target: targetTable,
          sourceHandle: col.name,
          animated: true,
          style: { stroke: "hsl(var(--primary))", strokeWidth: 2 },
          markerEnd: {
            type: MarkerType.ArrowClosed,
            color: "hsl(var(--primary))",
          },
          label: col.name,
          labelStyle: { fontSize: 10, fontWeight: 500 },
        });
      }
    });
  });

  const [nodes, setNodes, onNodesChange] = useNodesState(initialNodes);
  const [edges, setEdges, onEdgesChange] = useEdgesState(initialEdges);

  const handleExport = useCallback(async (format: "png" | "svg") => {
    const element = document.querySelector(".react-flow") as HTMLElement;
    if (!element) return;

    try {
      const dataUrl = format === "png" 
        ? await toPng(element, { quality: 0.95 })
        : await toSvg(element);
      
      const link = document.createElement("a");
      link.download = `er-diagram-${id}.${format}`;
      link.href = dataUrl;
      link.click();
      
      toast.success(`ER Diagram exported as ${format.toUpperCase()}`);
    } catch (error) {
      toast.error("Failed to export diagram");
    }
  }, [id]);

  return (
    <div className="min-h-screen bg-background flex flex-col">
      {/* Header */}
      <header className="border-b bg-card/50 backdrop-blur z-10">
        <div className="container mx-auto px-4 py-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-4">
              <Link to={`/${id}`}>
                <Button variant="ghost" size="icon">
                  <ArrowLeft className="h-5 w-5" />
                </Button>
              </Link>
              <div>
                <h1 className="text-2xl font-bold">ER Diagram</h1>
                <p className="text-sm text-muted-foreground">Entity Relationship Diagram for {id}</p>
              </div>
            </div>
            <div className="flex items-center gap-2">
              <Button variant="outline" size="sm" onClick={() => handleExport("png")}>
                <Download className="h-4 w-4 mr-2" />
                PNG
              </Button>
              <Button variant="outline" size="sm" onClick={() => handleExport("svg")}>
                <Download className="h-4 w-4 mr-2" />
                SVG
              </Button>
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
          className="bg-muted/20"
        >
          <Background variant={BackgroundVariant.Dots} gap={16} size={1} color="hsl(var(--muted-foreground))" />
          <Controls>
            <button className="react-flow__controls-button">
              <ZoomIn className="h-4 w-4" />
            </button>
            <button className="react-flow__controls-button">
              <ZoomOut className="h-4 w-4" />
            </button>
          </Controls>
        </ReactFlow>
      </div>
    </div>
  );
};

export default ERDiagram;
