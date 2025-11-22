import { useParams, Link } from "react-router-dom";
import { useEffect, useState } from "react";
import { Database, Table2, Play, Download, ArrowLeft, RefreshCw, GitBranch, BarChart3 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Textarea } from "@/components/ui/textarea";
import { DataTable } from "@/components/DataTable";
import { ChartVisualization } from "@/components/ChartVisualization";
import { toast } from "sonner";
import { bridgeApi } from "@/services/bridgeApi";

const mockUserData = [
  { id: 1, name: "John Doe", email: "john@example.com", role: "Admin", created_at: "2024-01-15" },
  { id: 2, name: "Jane Smith", email: "jane@example.com", role: "User", created_at: "2024-02-20" },
  { id: 3, name: "Bob Johnson", email: "bob@example.com", role: "User", created_at: "2024-03-10" },
  { id: 4, name: "Alice Williams", email: "alice@example.com", role: "Editor", created_at: "2024-03-25" },
];

interface TableInfo {
  schema: string;
  name: string;
  type: string;
}

const DatabaseDetail = () => {
  const { id } = useParams();
  const [selectedTable, setSelectedTable] = useState<string>("");
  const [query, setQuery] = useState("SELECT * FROM users LIMIT 100;");
  const [isExecuting, setIsExecuting] = useState(false);
  const [tables, setTables] = useState<TableInfo[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const fetchDatabaseDetails = async () => {
      if (!id) return;

      try {
        setLoading(true);
        const data = await bridgeApi.listTables(id);
        console.log("Raw table data:", data);

        // Parse the complex nested structure from bridge
        const parsedTables: TableInfo[] = data.map((item: any) => {
          // Handle nested structure: item.name.name is the actual table info
          if (item?.name?.name && typeof item.name.name === 'object') {
            return {
              schema: item.name.name.schema || 'public',
              name: item.name.name.name || 'unknown',
              type: item.name.name.type || 'table'
            };
          }
          // Fallback for simpler structure
          else if (typeof item === 'string') {
            return {
              schema: 'public',
              name: item,
              type: 'table'
            };
          }
          // Another fallback
          else if (item?.name && typeof item.name === 'string') {
            return {
              schema: item.schema || 'public',
              name: item.name,
              type: item.type || 'table'
            };
          }

          return {
            schema: 'public',
            name: 'unknown',
            type: 'table'
          };
        });

        setTables(parsedTables);

        // Set first table as selected if available
        if (parsedTables.length > 0 && !selectedTable) {
          setSelectedTable(parsedTables[0].name);
          setQuery(`SELECT * FROM ${parsedTables[0].schema}.${parsedTables[0].name} LIMIT 100;`);
        }
      } catch (error: any) {
        console.error("Failed to fetch tables:", error);
        setError(error.message || "Database connect ECONNREFUSED ::1:5432");
        toast.error("Failed to load tables", {
          description: error.message
        });
      } finally {
        setLoading(false);
      }
    };

    fetchDatabaseDetails();
  }, [id]);

  const handleTableSelect = (tableName: string, schema: string) => {
    setSelectedTable(tableName);
    setQuery(`SELECT * FROM ${schema}.${tableName} LIMIT 100;`);
  };

  const handleExecuteQuery = () => {
    setIsExecuting(true);
    setTimeout(() => {
      setIsExecuting(false);
      toast.success("Query executed successfully", {
        description: "Data for " + selectedTable + " has been retrieved.",
      });
    }, 1000);
  };

  const handleBackup = () => {
    toast.info("Initiating database backup...", {
      description: "This might take a moment depending on the database size.",
      duration: 3000,
    });
    setTimeout(() => {
      toast.success("Backup created successfully", {
        description: "Your database backup is ready for download.",
      });
    }, 2000);
  };


  if (error) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-[#050505] text-white">
        <Card className="bg-gray-900/50 border border-primary/10 rounded-xl shadow-2xl p-6">
          <CardHeader>
            <CardTitle className="text-2xl text-white mb-4">Error Loading Database</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-gray-400">An error occurred while connecting to the database:</p>
            <pre className="bg-gray-800/70 border border-primary/20 text-red-400 p-4 rounded-lg mt-4 whitespace-pre-wrap">
              {error}
            </pre>
            <div className="mt-6 flex gap-3">
              <Button
                className="mt-4"
                variant="outline"
                onClick={() => window.location.reload()}
              >
                Retry
              </Button>
              <Link to={'/'}>
                <Button
                  className="mt-4"
                  variant={'outline'}
                >
                  Go Back
                </Button>
              </Link>
            </div>
          </CardContent>
        </Card>
      </div>
    );
  }



  return (
    <div className="min-h-screen bg-[#050505] text-white">
      {/* Header */}
      <header className="border-b border-primary/10 bg-black/30 backdrop-blur-xl sticky top-0 z-50 shadow-lg">
        <div className="container mx-auto px-4 py-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-4">
              <Link to="/">
                <Button variant="ghost" size="icon" className="text-gray-400 hover:bg-gray-800 hover:text-white transition-colors">
                  <ArrowLeft className="h-5 w-5" />
                </Button>
              </Link>
              <div className="flex items-center gap-3">
                <div className="p-3 bg-linear-to-br from-cyan-500 to-violet-600 rounded-xl shadow-lg">
                  <Database className="h-6 w-6 text-white" />
                </div>
                <div>
                  <h1 className="text-2xl font-bold bg-clip-text text-transparent bg-linear-to-r from-cyan-400 to-fuchsia-600">
                    Database: {id}
                  </h1>
                  <p className="text-sm text-gray-400">PostgreSQL | Connected</p>
                </div>
              </div>
            </div>
            <div className="flex items-center gap-2 flex-wrap justify-end">
              <Link to={`/${id}/query-builder`}>
                <Button variant="outline" size="sm" className="border-gray-700 text-gray-300 hover:bg-gray-800 hover:text-white transition-colors">
                  <GitBranch className="h-4 w-4 mr-2" />
                  Builder
                </Button>
              </Link>
              <Link to={`/${id}/er-diagram`}>
                <Button variant="outline" size="sm" className="border-gray-700 text-gray-300 hover:bg-gray-800 hover:text-white transition-colors">
                  <BarChart3 className="h-4 w-4 mr-2" />
                  ER Diagram
                </Button>
              </Link>
              <Button variant="outline" size="sm" onClick={handleBackup} className="border-gray-700 text-gray-300 hover:bg-gray-800 hover:text-white transition-colors">
                <Download className="h-4 w-4 mr-2" />
                Backup
              </Button>
              <Button variant="outline" size="sm" className="border-gray-700 text-gray-300 hover:bg-gray-800 hover:text-white transition-colors">
                <RefreshCw className="h-4 w-4 mr-2" />
                Refresh
              </Button>
            </div>
          </div>
        </div>
      </header>

      <div className="container mx-auto px-4 py-8">
        <div className="grid grid-cols-1 lg:grid-cols-4 gap-6">
          {/* Sidebar - Tables List */}
          <div className="lg:col-span-1">
            <Card className="bg-gray-900/50 border border-primary/10 rounded-xl shadow-2xl">
              <CardHeader className="border-b border-primary/10 pb-4">
                <CardTitle className="text-xl flex items-center gap-3 text-white">
                  <Table2 className="h-6 w-6 text-cyan-400" />
                  Schemas & Tables
                </CardTitle>
                <CardDescription className="text-gray-400">
                  {loading ? "Loading..." : `Total: ${tables.length}`}
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-2 pt-4">
                {loading ? (
                  <div className="text-center py-8 text-gray-400">
                    <RefreshCw className="h-6 w-6 animate-spin mx-auto mb-2" />
                    Loading tables...
                  </div>
                ) : tables.length === 0 ? (
                  <div className="text-center py-8 text-gray-400">
                    No tables found
                  </div>
                ) : (
                  tables.map((table) => (
                    <button
                      key={`${table.schema}.${table.name}`}
                      onClick={() => handleTableSelect(table.name, table.schema)}
                      className={`w-full text-left p-4 rounded-lg transition-all duration-200 flex flex-col hover:bg-gray-800 ${selectedTable === table.name
                        ? "bg-linear-to-r from-cyan-600/30 to-fuchsia-700/30 border border-cyan-500/50 shadow-lg text-white"
                        : "bg-gray-800/60 border border-transparent text-gray-300"
                        }`}
                    >
                      <div className="font-mono font-semibold text-base">{table.name}</div>
                      <div className="text-xs text-gray-400 mt-1 flex justify-between">
                        <span>{table.schema}</span>
                        <span className="text-gray-500">{table.type}</span>
                      </div>
                    </button>
                  ))
                )}
              </CardContent>
            </Card>
          </div>

          {/* Main Content */}
          <div className="lg:col-span-3 space-y-6">
            <Tabs defaultValue="data" className="w-full">
              <TabsList className="grid w-full grid-cols-3 bg-gray-900/50 border border-primary/10 rounded-xl p-1 mb-6 shadow-xl">
                <TabsTrigger
                  value="data"
                  className="data-[state=active]:bg-linear-to-r data-[state=active]:from-cyan-500 data-[state=active]:to-fuchsia-600 data-[state=active]:text-white data-[state=active]:shadow-lg data-[state=active]:shadow-fuchsia-500/20 text-gray-300 hover:text-white transition-all rounded-lg"
                >
                  Data View
                </TabsTrigger>
                <TabsTrigger
                  value="query"
                  className="data-[state=active]:bg-linear-to-r data-[state=active]:from-cyan-500 data-[state=active]:to-fuchsia-600 data-[state=active]:text-white data-[state=active]:shadow-lg data-[state=active]:shadow-fuchsia-500/20 text-gray-300 hover:text-white transition-all rounded-lg"
                >
                  Query Editor
                </TabsTrigger>
                <TabsTrigger
                  value="charts"
                  className="data-[state=active]:bg-linear-to-r data-[state=active]:from-cyan-500 data-[state=active]:to-fuchsia-600 data-[state=active]:text-white data-[state=active]:shadow-lg data-[state=active]:shadow-fuchsia-500/20 text-gray-300 hover:text-white transition-all rounded-lg"
                >
                  Charts
                </TabsTrigger>
              </TabsList>

              <TabsContent value="data" className="space-y-4">
                <Card className="bg-gray-900/50 border border-primary/10 rounded-xl shadow-2xl">
                  <CardHeader className="border-b border-primary/10 pb-4">
                    <CardTitle className="font-mono text-xl text-white">
                      {selectedTable || "Select a table"} Data
                    </CardTitle>
                    <CardDescription className="text-gray-400">
                      Showing {mockUserData.length} of {mockUserData.length} rows
                    </CardDescription>
                  </CardHeader>
                  <CardContent className="pt-6">
                    <DataTable data={mockUserData} />
                  </CardContent>
                </Card>
              </TabsContent>

              <TabsContent value="query" className="space-y-4">
                <Card className="bg-gray-900/50 border border-primary/10 rounded-xl shadow-2xl">
                  <CardHeader className="border-b border-primary/10 pb-4">
                    <CardTitle className="text-xl text-white">SQL Query Editor</CardTitle>
                    <CardDescription className="text-gray-400">Write and execute SQL queries</CardDescription>
                  </CardHeader>
                  <CardContent className="space-y-4 pt-6">
                    <div className="relative">
                      <Textarea
                        value={query}
                        onChange={(e) => setQuery(e.target.value)}
                        className="font-mono text-sm min-h-[250px] resize-y bg-gray-800/70 border-primary/20 text-white focus:border-cyan-500 transition-colors placeholder:text-gray-500 p-4"
                        placeholder="Enter your SQL query (e.g., SELECT * FROM users WHERE role = 'Admin');"
                      />
                    </div>
                    <Button
                      onClick={handleExecuteQuery}
                      disabled={isExecuting}
                      className="bg-linear-to-r from-cyan-500 to-fuchsia-600 hover:from-cyan-600 hover:to-fuchsia-700 transition-all shadow-xl shadow-fuchsia-500/20"
                    >
                      {isExecuting ? (
                        <>
                          <RefreshCw className="h-4 w-4 mr-2 animate-spin" />
                          Executing...
                        </>
                      ) : (
                        <>
                          <Play className="h-4 w-4 mr-2" />
                          Execute Query
                        </>
                      )}
                    </Button>
                  </CardContent>
                </Card>

                <Card className="bg-gray-900/50 border border-primary/10 rounded-xl shadow-2xl">
                  <CardHeader className="border-b border-primary/10 pb-4">
                    <CardTitle className="font-mono text-xl text-white">Query Results</CardTitle>
                    <CardDescription className="text-gray-400">Displaying the output of your SQL query</CardDescription>
                  </CardHeader>
                  <CardContent className="pt-6">
                    <DataTable data={mockUserData} />
                  </CardContent>
                </Card>
              </TabsContent>

              <TabsContent value="charts" className="space-y-4">
                <Card className="bg-gray-900/50 border border-primary/10 rounded-xl shadow-2xl p-6">
                  <CardTitle className="text-xl text-white mb-4">Data Visualizations</CardTitle>
                  <CardDescription className="text-gray-400 mb-6">Explore your data with interactive charts.</CardDescription>
                  <ChartVisualization data={mockUserData} />
                </Card>
              </TabsContent>
            </Tabs>
          </div>
        </div>
      </div>
    </div>
  );
};

export default DatabaseDetail;