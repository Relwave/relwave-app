import { useParams } from "react-router-dom";
import { useState, useCallback } from "react";
import {
  Node,
  useNodesState,
  useEdgesState,
  addEdge,
  Connection,
} from "reactflow";
import "reactflow/dist/style.css";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { toast } from "sonner";
import Header from "@/components/queryBuilder/Header";
import ControlPanel from "@/components/queryBuilder/ControlPanel";
import VisualBuilder from "@/components/queryBuilder/VisualBuilder";

const mockTables = ["users", "orders", "products", "categories", "roles"];

const TableNode = ({ data }: { data: any }) => {
  return (
    <Card className="min-w-[180px] shadow-elevated">
      <CardHeader className="p-3 bg-primary/10">
        <CardTitle className="text-sm font-mono">{data.label}</CardTitle>
      </CardHeader>
      <CardContent className="p-0">
        <div className="text-xs text-muted-foreground px-3 py-2">
          Double-click edges to add conditions
        </div>
      </CardContent>
    </Card>
  );
};

const nodeTypes = {
  table: TableNode,
};

const QueryBuilder = () => {
  const { id } = useParams();
  const [nodes, setNodes, onNodesChange] = useNodesState([]);
  const [edges, setEdges, onEdgesChange] = useEdgesState([]);
  const [selectedTable, setSelectedTable] = useState("");
  const [filters, setFilters] = useState<Array<{ column: string; operator: string; value: string }>>([]);
  const [sortBy, setSortBy] = useState("");
  const [groupBy, setGroupBy] = useState("");
  const [generatedSQL, setGeneratedSQL] = useState("");
  const [queryResults, setQueryResults] = useState<any[]>([]);

  const addTable = useCallback(() => {
    if (!selectedTable) return;

    const newNode: Node = {
      id: `${selectedTable}-${Date.now()}`,
      type: "table",
      position: { x: Math.random() * 400 + 50, y: Math.random() * 300 + 50 },
      data: { label: selectedTable },
    };

    setNodes((nds) => [...nds, newNode]);
    toast.success(`Added ${selectedTable} table`);
  }, [selectedTable, setNodes]);

  const onConnect = useCallback(
    (params: Connection) => setEdges((eds) => addEdge({ ...params, animated: true, style: { stroke: "hsl(var(--primary))" } }, eds)),
    [setEdges]
  );

  const addFilter = () => {
    setFilters([...filters, { column: "", operator: "=", value: "" }]);
  };

  const removeFilter = (index: number) => {
    setFilters(filters.filter((_, i) => i !== index));
  };

  const generateSQL = () => {
    const tableNames = nodes.map((n) => n.data.label).join(", ");
    const joins = edges
      .map((e) => {
        const source = nodes.find((n) => n.id === e.source)?.data.label;
        const target = nodes.find((n) => n.id === e.target)?.data.label;
        return `  INNER JOIN ${target} ON ${source}.id = ${target}.${source}_id`;
      })
      .join("\n");

    const whereClause = filters
      .filter((f) => f.column && f.value)
      .map((f) => `${f.column} ${f.operator} '${f.value}'`)
      .join(" AND ");

    let sql = `SELECT *\nFROM ${tableNames}`;
    if (joins) sql += `\n${joins}`;
    if (whereClause) sql += `\nWHERE ${whereClause}`;
    if (groupBy) sql += `\nGROUP BY ${groupBy}`;
    if (sortBy) sql += `\nORDER BY ${sortBy}`;
    sql += ";";

    setGeneratedSQL(sql);
    toast.success("SQL query generated");
  };

  const executeQuery = () => {
    // Mock execution
    const mockData = [
      { id: 1, name: "John Doe", email: "john@example.com", role: "Admin" },
      { id: 2, name: "Jane Smith", email: "jane@example.com", role: "User" },
    ];
    setQueryResults(mockData);
    toast.success("Query executed successfully");
  };

  return (
    <div className="min-h-screen bg-background">
      <Header id={id || "database"} />

      <div className="container mx-auto px-4 py-6">
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          {/* Left Panel - Controls */}
          <ControlPanel
            selectedTable={selectedTable}
            setSelectedTable={setSelectedTable}
            addTable={addTable}
            filters={filters}
            setFilters={setFilters}
            sortBy={sortBy}
            setSortBy={setSortBy}
            groupBy={groupBy}
            setGroupBy={setGroupBy}
            mockTables={mockTables}
            addFilter={addFilter}
            removeFilter={removeFilter}
            generateSQL={generateSQL}
          />
          {/* Middle Panel - Visual Builder */}
          <VisualBuilder
            nodes={nodes}
            edges={edges}
            onNodesChange={onNodesChange}
            onEdgesChange={onEdgesChange}
            onConnect={onConnect}
            generatedSQL={generatedSQL}
            executeQuery={executeQuery}
            queryResults={queryResults}
            nodeTypes={nodeTypes}
          />
        </div>
      </div>
    </div>
  );
};

export default QueryBuilder;
