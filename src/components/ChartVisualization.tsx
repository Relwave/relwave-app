import { useEffect, useState } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Download, Loader2, BarChart3, ImageIcon, FileCode } from "lucide-react";
import { toPng, toSvg } from "html-to-image";
import { toast } from "sonner";
import { ChartConfigPanel } from "./chart/ChartConfigPanel";
import { ChartRenderer } from "./chart/ChartRenderer";
import { ColumnDetails, SelectedTable } from "@/types/database";
import { bridgeApi } from "@/services/bridgeApi";



interface ChartVisualizationProps {
  selectedTable: SelectedTable;
  dbId?: string;
}

interface QueryResultRow {
  count: string;
}

interface QueryResultColumn {
  name: string
}

export interface QueryResultEventDetail {
  sessionId: string;
  batchIndex: number;
  rows: QueryResultRow[];
  columns: QueryResultColumn[];
  completed: boolean;
}

export const ChartVisualization = ({ selectedTable, dbId }: ChartVisualizationProps) => {

  const [chartType, setChartType] = useState<"bar" | "line" | "pie" | "scatter">("bar");
  const [xAxis, setXAxis] = useState("");
  const [yAxis, setYAxis] = useState("");
  const [chartTitle, setChartTitle] = useState("Query Results Visualization");
  const [columnData, setColumnData] = useState<ColumnDetails[]>([]);
  const [schemaData, setSchemaData] = useState<QueryResultEventDetail | null>(null);
  const [rowData, setRowData] = useState<QueryResultRow[]>([]);
  const [querySessionId, setQuerySessionId] = useState<string | null>(null);
  const [isExecuting, setIsExecuting] = useState(false);
  const [queryProgress, setQueryProgress] = useState<any>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);


  const handleExport = async (format: "png" | "svg") => {
    const chartElement = document.getElementById("chart-container");
    if (!chartElement) return;

    try {
      // Determine background based on current theme (simple detection based on dark class presence)
      const isDarkMode = chartElement.closest('.dark');
      const backgroundColor = isDarkMode ? "#050505" : "#FFFFFF"; // Use app background

      const dataUrl = format === "png"
        ? await toPng(chartElement, { quality: 0.95, backgroundColor })
        : await toSvg(chartElement, { backgroundColor });

      const link = document.createElement("a");
      link.download = `chart-${Date.now()}.${format}`;
      link.href = dataUrl;
      link.click();

      toast.success(`Chart exported as ${format.toUpperCase()}`);
    } catch (error) {
      toast.error("Failed to export chart");
      setErrorMessage("Failed to export chart");
    }
  };

  useEffect(() => {
    async function getTables() {
      if (dbId) {
        try {
          const result = await bridgeApi.getSchema(dbId);
          const schemas = result?.schemas

          schemas?.map((schema) => {
            if (schema.name === selectedTable.schema) {
              schema.tables.map((table) => {
                if (table.name === selectedTable.name) {
                  setColumnData(table.columns);
                }
              })
            }
          });
        } catch (error) {
          toast.error("Failed to fetch table schema");
          setErrorMessage("Failed to fetch table schema");
        }
      }
    }


    getTables();
  }, [selectedTable, dbId]);

  useEffect(() => {

    async function getData() {
      try {
        if (!dbId) return;

        const generatedQuery = `SELECT "${xAxis}", COUNT("${yAxis}") as count 
                         FROM "${selectedTable?.schema}"."${selectedTable?.name}" 
                         GROUP BY "${xAxis}" 
                         ORDER BY count DESC;`;


        if (xAxis === "" || yAxis === "") return;
        const sessionId = await bridgeApi.createSession(dbId);
        setQuerySessionId(sessionId);
        await bridgeApi.runQuery({
          sessionId: sessionId,
          sql: generatedQuery,
          batchSize: 1000,
          dbId: dbId,
        });
        setIsExecuting(true);
      } catch (error) {
        toast.error("Failed to execute query");
        setErrorMessage("Failed to execute query");
      } finally {
        setIsExecuting(false);
      }
    }

    getData();
  }, [xAxis, yAxis]);

  useEffect(() => {
    const handleResult = (event: CustomEvent) => {
      if (event.detail.sessionId !== querySessionId) return;
      setSchemaData(event.detail);
      setRowData((prev: QueryResultRow[]) => [...prev, ...event.detail.rows]);
    };

    const handleError = (event: CustomEvent) => {
      if (event.detail.sessionId !== querySessionId) return;

      setIsExecuting(false);
      setQuerySessionId(null);
      setQueryProgress(null);
      toast.error("Query failed", { description: event.detail.error?.message || "An error occurred" });
    };

    const eventListeners = [
      { name: 'bridge:query.result', handler: handleResult },
      { name: 'bridge:query.error', handler: handleError },
    ];

    eventListeners.forEach(listener => {
      window.addEventListener(listener.name, listener.handler as EventListener);
    });

    return () => {
      eventListeners.forEach(listener => {
        window.removeEventListener(listener.name, listener.handler as EventListener);
      });
    };
  }, [querySessionId]);


  return (
    <Card className="border rounded-lg bg-background">
      <CardHeader className="border-b pb-4">
        <div className="flex items-center justify-between flex-wrap gap-4">

          <div className="flex items-center gap-3">
            <BarChart3 className="h-5 w-5 text-muted-foreground" />

            <div>
              <CardTitle className="text-lg font-semibold">
                Chart Visualization
              </CardTitle>
              <CardDescription className="text-sm text-muted-foreground">
                Generate interactive charts from your data
              </CardDescription>
            </div>
          </div>

          {/* Export Buttons */}
          <div className="flex gap-2">
            <Button
              variant="outline"
              size="sm"
              onClick={() => handleExport("png")}
            >
              <ImageIcon className="h-4 w-4 mr-2" />
              Export PNG
            </Button>

            <Button
              variant="outline"
              size="sm"
              onClick={() => handleExport("svg")}
            >
              <FileCode className="h-4 w-4 mr-2" />
              Export SVG
            </Button>
          </div>
        </div>
      </CardHeader>

      <CardContent className="space-y-6 pt-5">
        {/* Config Panel */}
        <div className="p-4 border rounded-lg bg-muted/30">
          <ChartConfigPanel
            chartType={chartType}
            setChartType={setChartType}
            xAxis={xAxis}
            setXAxis={setXAxis}
            yAxis={yAxis}
            setYAxis={setYAxis}
            chartTitle={chartTitle}
            setChartTitle={setChartTitle}
            columns={columnData}
          />
        </div>

        {/* Chart Container */}
        <div
          id="chart-container"
          className="border rounded-lg p-6 bg-card min-h-[400px]"
        >
          {/* Title */}
          <h3 className="text-base font-medium text-center mb-4">
            {chartTitle}
          </h3>

          {isExecuting ? (
            <div className="flex flex-col items-center justify-center py-20">
              <Loader2 className="h-8 w-8 animate-spin text-muted-foreground mb-3" />
              <p className="text-sm text-muted-foreground">Processing your data…</p>
            </div>
          ) : (
            <ChartRenderer
              chartType={chartType}
              xAxis={xAxis}
              yAxis={yAxis}
              data={rowData}
            />
          )}
        </div>
      </CardContent>
    </Card>

  );
};