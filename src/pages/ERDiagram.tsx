import React, { useCallback } from "react";
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
} from "reactflow";
import "reactflow/dist/style.css";
import { ArrowLeft, Download, Database } from "lucide-react";
import { Link } from "react-router-dom";


interface Column {
  name: string;
  type: string;
  pk?: boolean;
  fk?: string | undefined;
}

interface TableSchema {
  columns: Column[];
}

interface Schema {
  [tableName: string]: TableSchema;
}

interface TableNodeData {
  label: string;
  columns: Column[];
}

type ExportFormat = "png" | "svg" | string;

/**
 * Mock schema data
 */
const mockSchema: Schema = {
  users: {
    columns: [
      { name: "id", type: "INT", pk: true },
      { name: "name", type: "VARCHAR" },
      { name: "email", type: "VARCHAR" },
      { name: "role_id", type: "INT", fk: "roles.id" },
    ],
  },
  orders: {
    columns: [
      { name: "id", type: "INT", pk: true },
      { name: "user_id", type: "INT", fk: "users.id" },
      { name: "product_id", type: "INT", fk: "products.id" },
      { name: "amount", type: "DECIMAL" },
      { name: "created_at", type: "TIMESTAMP" },
    ],
  },
  products: {
    columns: [
      { name: "id", type: "INT", pk: true },
      { name: "name", type: "VARCHAR" },
      { name: "price", type: "DECIMAL" },
      { name: "category_id", type: "INT", fk: "categories.id" },
    ],
  },
  categories: {
    columns: [
      { name: "id", type: "INT", pk: true },
      { name: "name", type: "VARCHAR" },
    ],
  },
  roles: {
    columns: [
      { name: "id", type: "INT", pk: true },
      { name: "name", type: "VARCHAR" },
    ],
  },
};

/**
 * Node component - Fully Dark/Light Mode Responsive
 */
const TableNode: React.FC<{ data: TableNodeData }> = ({ data }) => {
  return (
    <div
      // Container: Light: bg-white, Dark: bg-gray-800
      className="min-w-[200px] shadow-lg border-2 border-blue-500/20 rounded-lg bg-white dark:bg-gray-800"
    >
      {/* Header: Fixed blue accent */}
      <div className="bg-blue-600 text-white px-4 py-2 font-mono font-bold flex items-center gap-2 rounded-t-lg">
        <Database className="h-4 w-4" />
        {data.label}
      </div>
      {/* Body: Light: bg-white divide-gray-200, Dark: bg-gray-900 divide-gray-700 */}
      <div className="divide-y divide-gray-200 dark:divide-gray-700 bg-white dark:bg-gray-900 rounded-b-lg">
        {data.columns.map((col, idx) => (
          <div key={idx} className="px-4 py-2 text-sm font-mono flex justify-between gap-4">
            {/* PK Text: Light: text-blue-700, Dark: text-blue-400 */}
            {/* Standard Text: Light: text-gray-700, Dark: text-gray-200 */}
            <span
              className={col.pk
                ? "text-blue-700 dark:text-blue-400 font-semibold"
                : "text-gray-700 dark:text-gray-200"
              }
            >
              {col.name}
              {col.pk && " 🔑"}
            </span>
            {/* Type Text: Light: text-gray-500, Dark: text-gray-400 */}
            <span className="text-gray-500 dark:text-gray-400">{col.type}</span>
          </div>
        ))}
      </div>
    </div>
  );
};

const nodeTypes = {
  table: TableNode,
} as const;

/**
 * Main content component - Fully Dark/Light Mode Responsive
 */
const ERDiagramContent: React.FC = () => {
  // Create nodes and edges (logic remains unchanged)
  const initialNodes: Node<TableNodeData>[] = Object.entries(mockSchema).map(
    ([tableName, table], index) => ({
      id: tableName,
      type: "table",
      position: { x: (index % 3) * 300 + 50, y: Math.floor(index / 3) * 300 + 50 },
      data: { label: tableName, columns: table.columns },
    })
  );

  const initialEdges: Edge<any>[] = [];
  Object.entries(mockSchema).forEach(([tableName, table]) => {
    table.columns.forEach((col) => {
      if (col.fk) {
        const [targetTable] = col.fk.split(".");
        initialEdges.push({
          id: `${tableName}-${targetTable}-${col.name}`,
          source: tableName,
          target: targetTable,
          animated: true,
          // Fixed edge color for contrast
          style: { stroke: "#3b82f6", strokeWidth: 2 },
          markerEnd: {
            type: MarkerType.ArrowClosed,
            color: "#3b82f6",
          },
          label: col.name,
          labelStyle: { fontSize: 10, fontWeight: 500, fill: '#6b7280' }, // Label color neutral
        });
      }
    });
  });

  const [nodes, , onNodesChange] = useNodesState<TableNodeData>(initialNodes);
  const [edges, , onEdgesChange] = useEdgesState(initialEdges);

  const handleExport = useCallback((format: ExportFormat): void => {
    // Note: real export would require a library like html-to-image or similar
    // The alert is replaced with console.log to avoid iframe issues
    console.log(`Export as ${format.toUpperCase()} - Feature would require html-to-image library`);
  }, []);

  return (
    // Main Container: Light: bg-gray-50, Dark: bg-gray-950
    <div className="h-screen bg-gray-50 dark:bg-gray-950 flex flex-col">

      {/* Header: Light: bg-white border-gray-200, Dark: bg-gray-900 border-gray-800 */}
      <header className="border-b border-gray-200 dark:border-gray-800 bg-white dark:bg-gray-900 shadow-sm z-10 shrink-0">
        <div className="container mx-auto px-6 py-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-4">
              <Link to={"/"}>
                <button
                  // Back Button: Light: hover:bg-gray-100, Dark: hover:bg-gray-800
                  className="p-2 text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-800 rounded-lg transition-colors"
                >
                  <ArrowLeft className="h-5 w-5" />
                </button>
              </Link>
              <div>
                {/* Title: Light: text-gray-900, Dark: text-white */}
                <h1 className="text-2xl font-bold text-gray-900 dark:text-white">ER Diagram</h1>
                {/* Subtitle: Light: text-gray-600, Dark: text-gray-400 */}
                <p className="text-sm text-gray-600 dark:text-gray-400">Entity Relationship Diagram - Database Schema</p>
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
                  // Export Buttons: Light: border-gray-300 hover:bg-gray-50, Dark: border-gray-600 hover:bg-gray-700
                  className="px-4 py-2 border border-gray-300 dark:border-gray-600 rounded-lg hover:bg-gray-50 dark:hover:bg-gray-700 transition-colors flex items-center gap-2 text-sm font-medium text-gray-700 dark:text-gray-200"
                >
                  <Download className="h-4 w-4" />
                  {btn.label}
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
          {/* Background: Light: #94a3b8 (slate-400), Dark: #4b5563 (gray-600) for subtle contrast */}
          <Background
            variant={BackgroundVariant.Dots}
            gap={16}
            size={1}
            color="#94a3b8"
            className="dark:bg-gray-950" // Ensures background fill is correct
          />
          {/* Controls: ReactFlow controls automatically adjust in ReactFlowProvider environment */}
          <Controls
            className="dark:border-gray-700 dark:bg-gray-800 dark:text-gray-200"
            showFitView={false} // Adjusting controls to not interfere with theme styles
          />
        </ReactFlow>
      </div>

      {/* Info Panel (Footer): Light: bg-white border-gray-200, Dark: bg-gray-900 border-gray-800 */}
      <div className="border-t border-gray-200 dark:border-gray-800 bg-white dark:bg-gray-900 px-6 py-3 shrink-0">
        <div className="container mx-auto flex items-center justify-between text-sm text-gray-700 dark:text-gray-400">
          <div className="flex items-center gap-6">
            <span className="flex items-center gap-2">
              <Database className="h-4 w-4 text-gray-500 dark:text-gray-500" />
              {Object.keys(mockSchema).length} Tables
            </span>
            <span className="flex items-center gap-2">
              <span className="text-gray-500 dark:text-gray-500">🔗</span>
              {initialEdges.length} Relations
            </span>
          </div>
          {/* Hints: Light/Dark: text-gray-500 (subtle) */}
          <div className="text-xs text-gray-500 dark:text-gray-500">Drag to pan • Scroll to zoom • Click and drag nodes to rearrange</div>
        </div>
      </div>
    </div>
  );
};

export default function ERDiagram() {
  return (
    <ReactFlowProvider>
      <ERDiagramContent />
    </ReactFlowProvider>
  );
}