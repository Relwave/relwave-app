import { QueryProgress, SelectedTable } from "@/pages/DatabaseDetails";
import { TableRow } from "@/services/bridgeApi";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "../ui/tabs";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "../ui/card";
import { Loader2, Play, RefreshCw, X, Table2, Code, BarChart } from "lucide-react";
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
}) => {
    // Determine the current table name for the titles
    const tableName = selectedTable
        ? `${selectedTable.schema}.${selectedTable.name}`
        : "No table selected";

    // Defining the accent color classes for consistency
    const accentClass = "text-blue-600 dark:text-blue-400";
    const accentBorderClass = "border-blue-600 dark:border-blue-400";
    // Using a single color background for the primary button
    const accentButtonClass = "bg-blue-600 hover:bg-blue-700 dark:bg-blue-500 dark:hover:bg-blue-600 text-white shadow-md shadow-blue-500/30";


    return (
        <Tabs defaultValue="data" className="w-full">
            {/* 1. SaaS-style Tabs Header (Clean, minimal accent) */}
            <div className="flex items-center justify-between mb-4">
                {/* Dark border changed from primary/10 to gray-700 for deep gray background */}
                <TabsList className="bg-transparent dark:bg-transparent border-b border-gray-200 dark:border-gray-700 rounded-none p-0 h-auto space-x-4">
                    {/* Applying clean accent styles to all tab triggers */}
                    <TabsTrigger value="data" className={`p-3 data-[state=active]:shadow-none data-[state=active]:bg-transparent data-[state=active]:${accentClass} text-gray-500 dark:text-gray-400 hover:${accentClass} transition-colors border-b-2 border-transparent data-[state=active]:${accentBorderClass} rounded-none font-semibold`}>
                        <Table2 className="h-4 w-4 mr-2" /> Current Table Data
                    </TabsTrigger>
                    <TabsTrigger value="editor" className={`p-3 data-[state=active]:shadow-none data-[state=active]:bg-transparent data-[state=active]:${accentClass} text-gray-500 dark:text-gray-400 hover:${accentClass} transition-colors border-b-2 border-transparent data-[state=active]:${accentBorderClass} rounded-none font-semibold`}>
                        <Code className="h-4 w-4 mr-2" /> Query Editor
                    </TabsTrigger>
                    <TabsTrigger value="charts" className={`p-3 data-[state=active]:shadow-none data-[state=active]:bg-transparent data-[state=active]:${accentClass} text-gray-500 dark:text-gray-400 hover:${accentClass} transition-colors border-b-2 border-transparent data-[state=active]:${accentBorderClass} rounded-none font-semibold`}>
                        <BarChart className="h-4 w-4 mr-2" /> Charts
                    </TabsTrigger>
                </TabsList>
            </div>

            <TabsContent value="data" className="space-y-4">
                {/* Data View Tab - Card background updated to dark:bg-[#1E201E] and border/shadows cleaned */}
                <Card className="bg-white dark:bg-[#1E201E] border border-gray-300 dark:border-gray-800 rounded-xl shadow-md dark:shadow-xl">
                    {/* Card Header border updated */}
                    <CardHeader className="border-b border-gray-200 dark:border-gray-800 pb-4">
                        <CardTitle className="font-mono text-xl text-gray-900 dark:text-white">
                            {tableName} Data
                        </CardTitle>
                        <CardDescription className="text-gray-500 dark:text-gray-400">
                            {isExecuting ? "Loading data..." : `Showing ${rowCount.toLocaleString()} rows`}
                        </CardDescription>
                    </CardHeader>
                    <CardContent className="pt-6">
                        {isExecuting && rowCount === 0 ? (
                            <div className="text-center py-20 text-gray-500 dark:text-gray-400">
                                <RefreshCw className="h-8 w-8 animate-spin mx-auto mb-4" />
                                Fetching initial data from **{selectedTable?.name || 'table'}**...
                            </div>
                        ) : (
                            <DataTable data={tableData} />
                        )}
                    </CardContent>
                </Card>
            </TabsContent>

            {/* Combined Query Editor and Results Tab */}
            <TabsContent value="editor" className="space-y-6">
                {/* Query Editor Section - Card background updated */}
                <Card className="bg-white dark:bg-[#1E201E] border border-gray-300 dark:border-gray-800 rounded-xl shadow-md dark:shadow-xl">
                    {/* Card Header border updated */}
                    <CardHeader className="border-b border-gray-200 dark:border-gray-800 pb-4">
                        <div className="flex items-center justify-between">
                            <CardTitle className="text-xl text-gray-900 dark:text-white">SQL Query Editor</CardTitle>
                            <div className="flex items-center space-x-3">
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
                                <Button
                                    onClick={onExecuteQuery}
                                    disabled={isExecuting || !query.trim()}
                                    className={`${accentButtonClass} transition-all disabled:opacity-50 disabled:cursor-not-allowed`}
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
                            </div>
                        </div>
                    </CardHeader>
                    <CardContent className="space-y-4 pt-6">
                        <Textarea
                            value={query}
                            onChange={(e) => setQuery(e.target.value)}
                            disabled={isExecuting}
                            className="font-mono text-sm min-h-[250px] resize-y 
                                        bg-gray-100 border-gray-300 text-gray-900 dark:bg-gray-800/70 dark:border-primary/20 dark:text-white 
                                        focus:border-blue-500 transition-colors placeholder:text-gray-400 dark:placeholder:text-gray-500 p-4
                                        disabled:opacity-80 disabled:cursor-text"
                            placeholder="Enter your SQL query (e.g., SELECT * FROM users WHERE role = 'Admin');"
                        />
                    </CardContent>
                </Card>

                {/* Query Results Section - Card background updated */}
                <Card className="bg-white dark:bg-[#1E201E] border border-gray-300 dark:border-gray-800 rounded-xl shadow-md dark:shadow-xl">
                    {/* Card Header border updated */}
                    <CardHeader className="border-b border-gray-200 dark:border-gray-800 pb-4">
                        <CardTitle className="font-mono text-xl text-gray-900 dark:text-white">Query Results</CardTitle>
                        <CardDescription className="text-gray-500 dark:text-gray-400">
                            {isExecuting
                                ? `Fetching results... (${rowCount.toLocaleString()} rows so far)`
                                : `Displaying ${rowCount.toLocaleString()} rows`
                            }
                            {queryProgress && (
                                < span className={`ml-2 text-xs font-semibold ${accentClass}`}>
                                    | Elapsed: {queryProgress.elapsed}s
                                </span>
                            )}
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

            {/* Charts Tab - Card background updated */}
            <TabsContent value="charts" className="space-y-4">
                <Card className="bg-white dark:bg-[#1E201E] border border-gray-300 dark:border-gray-800 rounded-xl shadow-md dark:shadow-xl p-6">
                    <CardTitle className="text-xl text-gray-900 dark:text-white mb-4">Data Visualizations</CardTitle>
                    <CardDescription className="text-gray-500 dark:text-gray-400 mb-6">Explore your data with interactive charts.</CardDescription>
                    <ChartVisualization data={tableData} />
                </Card>
            </TabsContent>
        </Tabs >
    );
};

export default QueryContentTabs;