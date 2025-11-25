import { QueryProgress, SelectedTable } from "@/pages/DatabaseDetails";
import { TableRow } from "@/services/bridgeApi";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "../ui/tabs";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "../ui/card";
import { Loader2, Play, RefreshCw, X } from "lucide-react";
import { DataTable } from "../DataTable";
import { Textarea } from "../ui/textarea";
import { Button } from "../ui/button";
import { ChartVisualization } from "../ChartVisualization";

interface QueryContentTabsProps {
    selectedTable: SelectedTable | null;
    isExecuting: boolean;
    tableData: TableRow[];
    rowCount: number;
    query: string;
    queryProgress: QueryProgress | null;
    setQuery: (q: string) => void;
    onExecuteQuery: () => void;
    onCancelQuery: () => void;
}

const QueryContentTabs: React.FC<QueryContentTabsProps> = ({
    selectedTable,
    isExecuting,
    tableData,
    rowCount,
    query,
    queryProgress,
    setQuery,
    onExecuteQuery,
    onCancelQuery,
}) => (
    <Tabs defaultValue="data" className="w-full">
        <TabsList className="grid w-full grid-cols-3 bg-white border border-gray-300 dark:bg-gray-900/50 dark:border-primary/10 rounded-xl p-1 mb-6 shadow-md dark:shadow-xl">
            <TabsTrigger value="data" className="data-[state=active]:bg-linear-to-r data-[state=active]:from-cyan-500 data-[state=active]:to-fuchsia-600 data-[state=active]:text-white data-[state=active]:shadow-lg data-[state=active]:shadow-fuchsia-500/20 text-gray-700 dark:text-gray-300 hover:text-gray-900 dark:hover:text-white transition-all rounded-lg">Data View</TabsTrigger>
            <TabsTrigger value="query" className="data-[state=active]:bg-linear-to-r data-[state=active]:from-cyan-500 data-[state=active]:to-fuchsia-600 data-[state=active]:text-white data-[state=active]:shadow-lg data-[state=active]:shadow-fuchsia-500/20 text-gray-700 dark:text-gray-300 hover:text-gray-900 dark:hover:text-white transition-all rounded-lg">Query Editor</TabsTrigger>
            <TabsTrigger value="charts" className="data-[state=active]:bg-linear-to-r data-[state=active]:from-cyan-500 data-[state=active]:to-fuchsia-600 data-[state=active]:text-white data-[state=active]:shadow-lg data-[state=active]:shadow-fuchsia-500/20 text-gray-700 dark:text-gray-300 hover:text-gray-900 dark:hover:text-white transition-all rounded-lg">Charts</TabsTrigger>
        </TabsList>

        <TabsContent value="data" className="space-y-4">
            <Card className="bg-white dark:bg-gray-900/50 border border-gray-300 dark:border-primary/10 rounded-xl shadow-md dark:shadow-2xl">
                <CardHeader className="border-b border-gray-200 dark:border-primary/10 pb-4">
                    <CardTitle className="font-mono text-xl text-gray-900 dark:text-white">
                        {selectedTable ? `${selectedTable.schema}.${selectedTable.name}` : "Select a table"} Data
                    </CardTitle>
                    <CardDescription className="text-gray-500 dark:text-gray-400">
                        {isExecuting ? "Loading data..." : `Showing ${rowCount.toLocaleString()} rows`}
                    </CardDescription>
                </CardHeader>
                <CardContent className="pt-6">
                    {isExecuting && rowCount === 0 ? (
                        <div className="text-center py-20 text-gray-500 dark:text-gray-400">
                            <RefreshCw className="h-8 w-8 animate-spin mx-auto mb-4" />
                            Fetching initial data from {selectedTable?.name || 'table'}...
                        </div>
                    ) : (
                        <DataTable data={tableData} />
                    )}
                </CardContent>
            </Card>
        </TabsContent>

        <TabsContent value="query" className="space-y-4">
            <Card className="bg-white dark:bg-gray-900/50 border border-gray-300 dark:border-primary/10 rounded-xl shadow-md dark:shadow-2xl">
                <CardHeader className="border-b border-gray-200 dark:border-primary/10 pb-4">
                    <div className="flex items-center justify-between">
                        <div>
                            <CardTitle className="text-xl text-gray-900 dark:text-white">SQL Query Editor</CardTitle>
                            <CardDescription className="text-gray-500 dark:text-gray-400">
                                {queryProgress
                                    ? `Processing: ${queryProgress.rows.toLocaleString()} rows | ${queryProgress.elapsed}s elapsed`
                                    : "Write and execute SQL queries"
                                }
                            </CardDescription>
                        </div>
                        {isExecuting && (
                            <Button
                                variant="destructive"
                                size="sm"
                                onClick={onCancelQuery}
                                className="bg-red-500 hover:bg-red-600"
                            >
                                <X className="h-4 w-4 mr-2" />
                                Cancel
                            </Button>
                        )}
                    </div>
                </CardHeader>
                <CardContent className="space-y-4 pt-6">
                    <div className="relative">
                        <Textarea
                            value={query}
                            onChange={(e) => setQuery(e.target.value)}
                            disabled={isExecuting}
                            className="font-mono text-sm min-h-[250px] resize-y 
                                        bg-gray-100 border-gray-300 text-gray-900 dark:bg-gray-800/70 dark:border-primary/20 dark:text-white 
                                        focus:border-cyan-500 transition-colors placeholder:text-gray-400 dark:placeholder:text-gray-500 p-4
                                        disabled:opacity-50 disabled:cursor-not-allowed"
                            placeholder="Enter your SQL query (e.g., SELECT * FROM users WHERE role = 'Admin');"
                        />
                    </div>
                    <Button
                        onClick={onExecuteQuery}
                        disabled={isExecuting || !query.trim()}
                        className="bg-linear-to-r from-cyan-500 to-fuchsia-600 hover:from-cyan-600 hover:to-fuchsia-700 transition-all shadow-xl shadow-fuchsia-500/20 disabled:opacity-50 disabled:cursor-not-allowed"
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

            <Card className="bg-white dark:bg-gray-900/50 border border-gray-300 dark:border-primary/10 rounded-xl shadow-md dark:shadow-2xl">
                <CardHeader className="border-b border-gray-200 dark:border-primary/10 pb-4">
                    <CardTitle className="font-mono text-xl text-gray-900 dark:text-white">Query Results</CardTitle>
                    <CardDescription className="text-gray-500 dark:text-gray-400">
                        {isExecuting
                            ? `Fetching results... (${rowCount.toLocaleString()} rows so far)`
                            : `Displaying ${rowCount.toLocaleString()} rows`
                        }
                    </CardDescription>
                </CardHeader>
                <CardContent className="pt-6">
                    {isExecuting && rowCount === 0 ? (
                        <div className="text-center py-20 text-gray-500 dark:text-gray-400">
                            <Loader2 className="h-8 w-8 animate-spin mx-auto mb-4" />
                            Awaiting first results batch...
                        </div>
                    ) : (
                        <DataTable data={tableData} />
                    )}
                </CardContent>
            </Card>
        </TabsContent>

        <TabsContent value="charts" className="space-y-4">
            <Card className="bg-white dark:bg-gray-900/50 border border-gray-300 dark:border-primary/10 rounded-xl shadow-md dark:shadow-2xl p-6">
                <CardTitle className="text-xl text-gray-900 dark:text-white mb-4">Data Visualizations</CardTitle>
                <CardDescription className="text-gray-500 dark:text-gray-400 mb-6">Explore your data with interactive charts.</CardDescription>
                <ChartVisualization data={tableData} />
            </Card>
        </TabsContent>
    </Tabs>
);

export default QueryContentTabs;