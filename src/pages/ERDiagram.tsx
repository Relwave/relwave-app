import React, { useCallback, useState, useEffect } from "react";
import ReactFlow, {
  Node,
  Edge,
  Controls,
  Background,
  useNodesState,
  useEdgesState,
  MarkerType,
  BackgroundVariant,
  ReactFlowProvider,
  useReactFlow,
} from "reactflow";
import "reactflow/dist/style.css";
import { ArrowLeft, Download, Database } from "lucide-react";
import { Link, useParams } from "react-router-dom";
import { toast } from "sonner";
import { toPng, toSvg } from 'html-to-image';
import { bridgeApi, DatabaseSchemaDetails, TableSchemaDetails, ColumnDetails } from "@/services/bridgeApi";
import Loader from "@/components/Loader";

interface Column extends ColumnDetails {
  fkRef?: string; // e.g., "roles.id"
}

interface TableNodeData {
  label: string;
  columns: Column[];
}

type ExportFormat = "png" | "svg" | string;

type BackendColumn = Omit<ColumnDetails, 'type'> & { type: string, foreignKeyRef?: string };

type BackendTable = Omit<TableSchemaDetails, 'columns'> & { columns: BackendColumn[] };


const TableNode: React.FC<{ data: TableNodeData }> = ({ data }) => {
  return (
    <div
      className="min-w-[200px] shadow-lg border-2 border-blue-500/20 rounded-lg bg-white dark:bg-gray-800"
    >
      <div className="bg-blue-600 text-white px-4 py-2 font-mono font-bold flex items-center gap-2 rounded-t-lg">
        <Database className="h-4 w-4" />
        {data.label}
      </div>
      <div className="divide-y divide-gray-200 dark:divide-gray-700 bg-white dark:bg-gray-900 rounded-b-lg">
        {data.columns.map((col, idx) => (
          <div key={idx} className="px-4 py-2 text-sm font-mono flex justify-between gap-4">
            <span
              className={col.isPrimaryKey
                ? "text-blue-700 dark:text-blue-400 font-semibold"
                : "text-gray-700 dark:text-gray-200"
              }
            >
              {col.name}
              {col.isPrimaryKey && " 🔑"}
            </span>
            <span className="text-gray-500 dark:text-gray-400">
              {col.type}
              {col.isForeignKey && " 🔗"}
            </span>
          </div>
        ))}
      </div>
    </div>
  );
};

const nodeTypes = {
  table: TableNode,
} as const;



interface TransformedERData {
  nodes: Node<TableNodeData>[];
  edges: Edge<any>[];
}

const transformSchemaToER = (schema: DatabaseSchemaDetails): TransformedERData => {
  const nodes: Node<TableNodeData>[] = [];
  const edges: Edge<any>[] = [];
  let nodeIndex = 0;
  const NODE_WIDTH = 250;
  const NODE_HEIGHT = 50; // Base height, dynamic adjustment ignored for simplicity
  const X_GAP = 400;
  const Y_GAP = 300;
  const MAX_COLS = 3;

  // Use a map to quickly locate the target table for FKs
  const tableCoordinates = new Map<string, { x: number, y: number }>();

  schema.schemas.forEach(schemaGroup => {
    schemaGroup.tables.forEach(table => {
      const tableName = `${schemaGroup.name}.${table.name}`;
      const x = (nodeIndex % MAX_COLS) * X_GAP;
      const y = Math.floor(nodeIndex / MAX_COLS) * Y_GAP;

      // Store location for edge calculation
      tableCoordinates.set(tableName, { x, y });

      nodes.push({
        id: tableName,
        type: 'table',
        position: { x, y },
        data: { label: table.name, columns: table.columns as Column[] },
      });
      nodeIndex++;

      // Edge creation
      table.columns.forEach(col => {
        const column = col as BackendColumn;
        // Assuming the foreignKeyRef is formatted like "target_schema.target_table"
        if (column.isForeignKey && column.foreignKeyRef) {
          const [targetTable, targetColumn] = column.foreignKeyRef.split(".");
          const targetId = targetTable; // Use table name as ID for simple FKs

          // Fallback to targetTable if the ref doesn't contain schema (e.g., from mock data)
          const targetQualifiedName = column.foreignKeyRef.includes('.') ? column.foreignKeyRef.split('.').slice(0, 2).join('.') : `${schemaGroup.name}.${targetTable}`;

          // Add edge only if the target node exists (prevent orphaned edges)
          // In a simple app, we can just use the target table name as the ID, regardless of schema
          const targetNodeId = targetTable;

          edges.push({
            id: `${tableName}-${targetNodeId}-${col.name}`,
            source: tableName,
            target: targetQualifiedName, // Use qualified name
            sourceHandle: col.name, // Can use column name as handle ID
            targetHandle: targetColumn, // Target column as handle ID
            animated: false,
            style: { stroke: "#3b82f6", strokeWidth: 2 },
            markerEnd: {
              type: MarkerType.ArrowClosed,
              color: "#3b82f6",
              width: 15,
              height: 15,
            },
            label: col.name,
            labelStyle: { fontSize: 10, fontWeight: 500, fill: '#6b7280', backgroundColor: 'rgba(255,255,255,0.7)' },
            type: 'smoothstep', // Use smoothstep for better pathing
          });
        }
      });
    });
  });

  return { nodes, edges };
};



const ERDiagramContent: React.FC = () => {
  const { id: dbId } = useParams<{ id: string }>();
  const reactFlowInstance = useReactFlow();

  const [schemaData, setSchemaData] = useState<DatabaseSchemaDetails | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Initial state derived from schemaData
  const [nodes, setNodes, onNodesChange] = useNodesState<TableNodeData>([]);
  const [edges, setEdges, onEdgesChange] = useEdgesState([]);

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
          setSchemaData(result);
          const { nodes: newNodes, edges: newEdges } = transformSchemaToER(result);

          setNodes(newNodes);
          setEdges(newEdges);

          // Set a timeout to ensure ReactFlow renders before calling fitView
          setTimeout(fitView, 50);
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
  }, [dbId, setNodes, setEdges, fitView]);



  // Inside ERDiagramContent component

  const handleExport = useCallback(async (format: ExportFormat): Promise<void> => {
    // 1. Target the specific element containing the flow
    const flowContainer = document.querySelector('.react-flow__renderer');

    if (!flowContainer) {
      toast.error("Export Failed", { description: "Could not find the diagram container." });
      return;
    }

    try {
      let dataUrl: string;
      const filename = `er-diagram-${schemaData?.name || 'export'}-${Date.now()}`;

      // Define common export options (especially important for dark backgrounds)
      const options = {
        quality: 0.95,
        backgroundColor: '#111827', // Ensure dark background is captured correctly
      };

      if (format === "png") {
        // Use toPng on the flow renderer element
        dataUrl = await toPng(flowContainer as HTMLElement, options);
      } else if (format === "svg") {
        // Use toSvg on the flow renderer element
        dataUrl = await toSvg(flowContainer as HTMLElement, options);
      } else {
        return;
      }

      // 2. Trigger the download
      const link = document.createElement("a");
      link.download = `${filename}.${format}`;
      link.href = dataUrl;
      link.click();

      toast.success(`Exported diagram as ${format.toUpperCase()}`);

    } catch (error) {
      console.error("Export Error:", error);
      toast.error("Export Failed", { description: "Error capturing image data." });
    }

  }, [schemaData]); // Re-run if schemaData changes




  if (loading) {
    return (
      <div className="h-screen flex items-center justify-center bg-gray-50 dark:bg-gray-950">
        <Loader />
      </div>
    );
  }

  if (error || !schemaData || nodes.length === 0) {
    return (
      <div className="h-screen flex items-center justify-center bg-gray-50 dark:bg-gray-950">
        <div className="text-center p-8 border border-red-500/30 rounded-xl bg-red-900/10 text-red-600 dark:text-red-400">
          <Database className="h-8 w-8 mx-auto mb-4" />
          <h2 className="text-xl font-bold mb-2">Diagram Unavailable</h2>
          <p className="text-sm text-gray-600 dark:text-gray-400">
            {error || "No tables or schemas found to render the ER diagram."}
          </p>
          <Link to={`/${dbId}`}>
            <button className="mt-4 px-4 py-2 border rounded-lg text-sm bg-blue-600 text-white hover:bg-blue-700">
              Go Back
            </button>
          </Link>
        </div>
      </div>
    );
  }


  return (
    // Main Container: Light: bg-gray-50, Dark: bg-gray-950
    <div className="h-screen bg-gray-50 dark:bg-gray-950 flex flex-col">

      {/* Header */}
      <header className="border-b border-gray-200 dark:border-gray-800 bg-white dark:bg-gray-900 shadow-sm z-10 shrink-0">
        <div className="container mx-auto px-6 py-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-4">
              <Link to={`/${dbId}`}>
                <button
                  className="p-2 text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-800 rounded-lg transition-colors"
                >
                  <ArrowLeft className="h-5 w-5" />
                </button>
              </Link>
              <div>
                <h1 className="text-2xl font-bold text-gray-900 dark:text-white">ER Diagram</h1>
                <p className="text-sm text-gray-600 dark:text-gray-400">
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
                  className="px-4 py-2 border border-gray-300 dark:border-gray-600 rounded-lg hover:bg-gray-50 dark:hover:bg-gray-700 transition-colors flex items-center gap-2 text-sm font-medium text-gray-700 dark:text-gray-200"
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
            color="#94a3b8"
            className="dark:bg-gray-950"
          />
          <Controls
            className="dark:border-gray-700 dark:bg-gray-800 dark:text-gray-200"
            showFitView={false}
          />
        </ReactFlow>
      </div>

      {/* Info Panel (Footer) */}
      <div className="border-t border-gray-200 dark:border-gray-800 bg-white dark:bg-gray-900 px-6 py-3 shrink-0">
        <div className="container mx-auto flex items-center justify-between text-sm text-gray-700 dark:text-gray-400">
          <div className="flex items-center gap-6">
            <span className="flex items-center gap-2">
              <Database className="h-4 w-4 text-gray-500 dark:text-gray-500" />
              {nodes.length} Tables
            </span>
            <span className="flex items-center gap-2">
              <span className="text-gray-500 dark:text-gray-500">🔗</span>
              {edges.length} Relations
            </span>
          </div>
          <div className="text-xs text-gray-500 dark:text-gray-500">
            Drag to pan • Scroll to zoom • Click and drag nodes to rearrange
          </div>
        </div>
      </div>
    </div>
  );
};

// Wrapper must be the default export for ReactFlow context
export default function ERDiagram() {
  return (
    <ReactFlowProvider>
      <ERDiagramContent />
    </ReactFlowProvider>
  );
}