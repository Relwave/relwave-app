import { useParams, Link } from "react-router-dom";
import { useState, useCallback } from "react";
import ReactFlow, {
  Node,
  Edge,
  Controls,
  Background,
  useNodesState,
  useEdgesState,
  addEdge,
  Connection,
  BackgroundVariant,
} from "reactflow";
import "reactflow/dist/style.css";
import { ArrowLeft, Play, Trash2, Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Input } from "@/components/ui/input";
import { DataTable } from "@/components/DataTable";
import { toast } from "sonner";

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
      <header className="border-b bg-card/50 backdrop-blur">
        <div className="container mx-auto px-4 py-4">
          <div className="flex items-center gap-4">
            <Link to={`/${id}`}>
              <Button variant="ghost" size="icon">
                <ArrowLeft className="h-5 w-5" />
              </Button>
            </Link>
            <div>
              <h1 className="text-2xl font-bold">Visual Query Builder</h1>
              <p className="text-sm text-muted-foreground">Build queries visually for {id}</p>
            </div>
          </div>
        </div>
      </header>

      <div className="container mx-auto px-4 py-6">
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          {/* Left Panel - Controls */}
          <div className="space-y-4">
            <Card className="shadow-elevated">
              <CardHeader>
                <CardTitle className="text-lg">Add Tables</CardTitle>
              </CardHeader>
              <CardContent className="space-y-3">
                <Select value={selectedTable} onValueChange={setSelectedTable}>
                  <SelectTrigger>
                    <SelectValue placeholder="Select table" />
                  </SelectTrigger>
                  <SelectContent>
                    {mockTables.map((table) => (
                      <SelectItem key={table} value={table}>
                        {table}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <Button onClick={addTable} className="w-full gradient-primary">
                  <Plus className="h-4 w-4 mr-2" />
                  Add Table
                </Button>
              </CardContent>
            </Card>

            <Card className="shadow-elevated">
              <CardHeader>
                <div className="flex items-center justify-between">
                  <CardTitle className="text-lg">Filters</CardTitle>
                  <Button size="sm" variant="outline" onClick={addFilter}>
                    <Plus className="h-4 w-4" />
                  </Button>
                </div>
              </CardHeader>
              <CardContent className="space-y-2">
                {filters.map((filter, index) => (
                  <div key={index} className="flex gap-2 items-center">
                    <Input
                      placeholder="Column"
                      value={filter.column}
                      onChange={(e) => {
                        const newFilters = [...filters];
                        newFilters[index].column = e.target.value;
                        setFilters(newFilters);
                      }}
                      className="text-sm"
                    />
                    <Select
                      value={filter.operator}
                      onValueChange={(val) => {
                        const newFilters = [...filters];
                        newFilters[index].operator = val;
                        setFilters(newFilters);
                      }}
                    >
                      <SelectTrigger className="w-20">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="=">=</SelectItem>
                        <SelectItem value="!=">!=</SelectItem>
                        <SelectItem value=">">{">"}</SelectItem>
                        <SelectItem value="<">{"<"}</SelectItem>
                        <SelectItem value="LIKE">LIKE</SelectItem>
                      </SelectContent>
                    </Select>
                    <Input
                      placeholder="Value"
                      value={filter.value}
                      onChange={(e) => {
                        const newFilters = [...filters];
                        newFilters[index].value = e.target.value;
                        setFilters(newFilters);
                      }}
                      className="text-sm"
                    />
                    <Button
                      size="icon"
                      variant="ghost"
                      onClick={() => removeFilter(index)}
                    >
                      <Trash2 className="h-4 w-4 text-destructive" />
                    </Button>
                  </div>
                ))}
                {filters.length === 0 && (
                  <p className="text-sm text-muted-foreground text-center py-2">No filters added</p>
                )}
              </CardContent>
            </Card>

            <Card className="shadow-elevated">
              <CardHeader>
                <CardTitle className="text-lg">Sort & Group</CardTitle>
              </CardHeader>
              <CardContent className="space-y-3">
                <div>
                  <label className="text-sm text-muted-foreground mb-1 block">Sort By</label>
                  <Input
                    placeholder="column_name"
                    value={sortBy}
                    onChange={(e) => setSortBy(e.target.value)}
                  />
                </div>
                <div>
                  <label className="text-sm text-muted-foreground mb-1 block">Group By</label>
                  <Input
                    placeholder="column_name"
                    value={groupBy}
                    onChange={(e) => setGroupBy(e.target.value)}
                  />
                </div>
              </CardContent>
            </Card>

            <Button onClick={generateSQL} className="w-full gradient-primary">
              Generate SQL
            </Button>
          </div>

          {/* Middle Panel - Visual Builder */}
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
          </div>
        </div>
      </div>
    </div>
  );
};

export default QueryBuilder;
