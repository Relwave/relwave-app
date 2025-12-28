import { FC } from "react";
import { QueryProgress, SelectedTable, TableRow } from "@/types/database";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Card, CardDescription, CardTitle } from "@/components/ui/card";
import { Table2, Code, BarChart } from "lucide-react";
import { ChartVisualization } from "@/components/chart/ChartVisualization";
import DataTab from "./DataTab";
import EditorTab from "./EditorTab";

interface QueryContentTabsProps {
  dbId: string;
  selectedTable: SelectedTable | null;
  isExecuting: boolean;
  tableData: TableRow[];
  rowCount: number;
  totalRows: number;
  currentPage: number;
  pageSize: number;
  query: string;
  queryProgress: QueryProgress | null;
  onQueryChange: (query: string) => void;
  onExecuteQuery: () => void;
  onCancelQuery: () => void;
  onPageChange: (page: number) => void;
  onPageSizeChange: (size: number) => void;
}

const QueryContentTabs: FC<QueryContentTabsProps> = ({
  dbId,
  selectedTable,
  isExecuting,
  tableData,
  rowCount,
  totalRows,
  currentPage,
  pageSize,
  query,
  queryProgress,
  onQueryChange,
  onExecuteQuery,
  onCancelQuery,
  onPageChange,
  onPageSizeChange,
}) => {
  return (
    <div className="w-full">
      <Tabs defaultValue="data" className="w-full">
        <TabsList className="mb-4">
          <TabsTrigger value="data" className="gap-1.5">
            <Table2 className="h-4 w-4" />
            Data
          </TabsTrigger>
          <TabsTrigger value="editor" className="gap-1.5">
            <Code className="h-4 w-4" />
            Query
          </TabsTrigger>
          <TabsTrigger value="charts" className="gap-1.5">
            <BarChart className="h-4 w-4" />
            Charts
          </TabsTrigger>
        </TabsList>

        <TabsContent value="data" className="space-y-4">
          <DataTab
            selectedTable={selectedTable}
            isExecuting={isExecuting}
            tableData={tableData}
            rowCount={rowCount}
            totalRows={totalRows}
            currentPage={currentPage}
            pageSize={pageSize}
            onPageChange={onPageChange}
            onPageSizeChange={onPageSizeChange}
          />
        </TabsContent>

        <TabsContent value="editor" className="space-y-4">
          <EditorTab
            query={query}
            tableData={tableData}
            rowCount={rowCount}
            queryProgress={queryProgress}
            isExecuting={isExecuting}
            onQueryChange={onQueryChange}
            onExecuteQuery={onExecuteQuery}
            onCancelQuery={onCancelQuery}
          />
        </TabsContent>

        <TabsContent value="charts" className="space-y-4">
          <Card>
            <div className="p-4">
              <div className="flex items-center gap-2 mb-1">
                <BarChart className="h-5 w-5 text-muted-foreground" />
                <CardTitle className="text-base font-medium">Visualizations</CardTitle>
              </div>
              <CardDescription className="text-sm mb-4">
                Explore your data with charts
              </CardDescription>

              {selectedTable ? (
                <ChartVisualization selectedTable={selectedTable} dbId={dbId} />
              ) : (
                <div className="flex flex-col items-center justify-center py-12 rounded-md border border-dashed border-border bg-muted/30">
                  <BarChart className="h-8 w-8 text-muted-foreground/50 mb-2" />
                  <p className="text-sm text-muted-foreground">Select a table to visualize</p>
                </div>
              )}
            </div>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
};

export default QueryContentTabs;