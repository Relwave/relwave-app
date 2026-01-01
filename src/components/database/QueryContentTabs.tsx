import { FC } from "react";
import { QueryProgress, SelectedTable, TableRow } from "@/types/database";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
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
  queryError: string | null;
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
  queryError,
  onQueryChange,
  onExecuteQuery,
  onCancelQuery,
  onPageChange,
  onPageSizeChange,
}) => {
  return (
    <div className="w-full">
      <Tabs defaultValue="data" className="w-full">
        <TabsList className="mb-3">
          <TabsTrigger value="data" className="gap-1.5 text-xs">
            <Table2 className="h-3.5 w-3.5" />
            Data
          </TabsTrigger>
          <TabsTrigger value="editor" className="gap-1.5 text-xs">
            <Code className="h-3.5 w-3.5" />
            Query
          </TabsTrigger>
          <TabsTrigger value="charts" className="gap-1.5 text-xs">
            <BarChart className="h-3.5 w-3.5" />
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
            queryError={queryError}
            isExecuting={isExecuting}
            onQueryChange={onQueryChange}
            onExecuteQuery={onExecuteQuery}
            onCancelQuery={onCancelQuery}
          />
        </TabsContent>

        <TabsContent value="charts" className="space-y-4">
          <div className="border border-border/20 rounded-lg overflow-hidden">
            <div className="p-6">
              {selectedTable ? (
                <ChartVisualization selectedTable={selectedTable} dbId={dbId} />
              ) : (
                <div className="flex flex-col items-center justify-center py-12 rounded-md border border-dashed border-border/20 bg-muted/10">
                  <BarChart className="h-6 w-6 text-muted-foreground/40 mb-2" />
                  <p className="text-sm text-muted-foreground/70">Select a table to visualize</p>
                </div>
              )}
            </div>
          </div>
        </TabsContent>
      </Tabs>
    </div>
  );
};

export default QueryContentTabs;