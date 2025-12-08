import { FC } from "react";
import { QueryProgress, SelectedTable } from "@/pages/DatabaseDetails";
import { TableRow } from "@/services/bridgeApi";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "../ui/tabs";
import { Card, CardDescription, CardTitle } from "../ui/card";
import { Table2, Code, BarChart } from "lucide-react";
import { ChartVisualization } from "../ChartVisualization";
import Data from "./Data";
import Editor from "./Editor";


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

const QueryContentTabs: FC<QueryContentTabsProps> = ({
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

    const accentClass = "text-primary dark:text-primary";
    const accentBorderClass = "border-primary dark:border-primary";
    const accentButtonClass = "bg-primary hover:bg-primary/90 text-white shadow-md shadow-primary/30";


    return (
        <Tabs defaultValue="data" className="w-full">
            {/* 1. SaaS-style Tabs Header (Clean, minimal accent) */}
            <header className="flex items-center justify-between mb-4">
                {/* TabsList: border-b is used for the clean underline effect */}
                <TabsList className="bg-transparent dark:bg-transparent border-b border-border rounded-none p-0 h-auto space-x-4">
                    {/* Tab Triggers: Using primary color for active state and hover */}
                    <TabsTrigger value="data" className={`p-3 data-[state=active]:shadow-none data-[state=active]:bg-transparent data-[state=active]:${accentClass} text-muted-foreground hover:${accentClass} transition-colors border-b-2 border-transparent data-[state=active]:${accentBorderClass} rounded-none font-semibold`}>
                        <Table2 className="h-4 w-4 mr-2" /> Current Table Data
                    </TabsTrigger>
                    <TabsTrigger value="editor" className={`p-3 data-[state=active]:shadow-none data-[state=active]:bg-transparent data-[state=active]:${accentClass} text-muted-foreground hover:${accentClass} transition-colors border-b-2 border-transparent data-[state=active]:${accentBorderClass} rounded-none font-semibold`}>
                        <Code className="h-4 w-4 mr-2" /> Query Editor
                    </TabsTrigger>
                    <TabsTrigger value="charts" className={`p-3 data-[state=active]:shadow-none data-[state=active]:bg-transparent data-[state=active]:${accentClass} text-muted-foreground hover:${accentClass} transition-colors border-b-2 border-transparent data-[state=active]:${accentBorderClass} rounded-none font-semibold`}>
                        <BarChart className="h-4 w-4 mr-2" /> Charts
                    </TabsTrigger>
                </TabsList>
            </header>

            <TabsContent value="data" className="space-y-4">
                <Data
                    selectedTable={selectedTable}
                    isExecuting={isExecuting}
                    tableData={tableData}
                    rowCount={rowCount}
                />
            </TabsContent>

            {/* Combined Query Editor and Results Tab */}
            <TabsContent value="editor" className="space-y-6">
                <Editor
                    isExecuting={isExecuting}
                    rowCount={rowCount}
                    query={query}
                    queryProgress={queryProgress}
                    accentButtonClass={accentButtonClass}
                    accentClass={accentClass}
                    tableData={tableData}
                    setQuery={setQuery}
                    onExecuteQuery={onExecuteQuery}
                    onCancelQuery={onCancelQuery}
                />
            </TabsContent>

            {/* Charts Tab - Card background updated */}
            <TabsContent value="charts" className="space-y-4">
                <Card className="bg-card border border-border rounded-xl shadow-elevated p-6">
                    <CardTitle className="text-xl text-foreground mb-4">Data Visualizations</CardTitle>
                    <CardDescription className="text-muted-foreground mb-6">Explore your data with interactive charts.</CardDescription>
                    <ChartVisualization data={tableData} />
                </Card>
            </TabsContent>
        </Tabs >
    );
};

export default QueryContentTabs;