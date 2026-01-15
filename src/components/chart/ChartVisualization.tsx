import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { Loader2, BarChart3, Download, ChevronDown } from "lucide-react";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { toPng, toSvg } from "html-to-image";
import { toast } from "sonner";
import { ChartConfigPanel } from "./ChartConfigPanel";
import ChartRenderer from "./ChartRenderer";
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

  // Execute query when x or y axis changes
  useEffect(() => {
    if (!xAxis || !yAxis) return;

    const executeQuery = async () => {
      // Clear old data immediately when config changes
      setRowData([]);
      setIsExecuting(true);
      setErrorMessage(null);

      try {
        const sessionId = `chart-${Date.now()}`;
        setQuerySessionId(sessionId);

        // X-axis: grouping dimension (non-primary keys like address, name)
        // Y-axis: what we're counting (primary keys like id)
        const sql = `
                    SELECT "${xAxis}" as name, COUNT("${yAxis}") as count 
                    FROM "${selectedTable.schema}"."${selectedTable.name}" 
                    GROUP BY "${xAxis}"
                    ORDER BY count DESC
                    LIMIT 50
                `;

        await bridgeApi.runQuery({
          sessionId,
          dbId: dbId || "",
          sql: sql.trim(),
          batchSize: 50,
        });

        // Query execution started successfully
      } catch (err: any) {
        console.error("Query execution error:", err);
        setErrorMessage(err.message || "Failed to execute query");
        setIsExecuting(false);
        setRowData([]); // Clear data on error
      }
    };

    executeQuery();
  }, [xAxis, yAxis, selectedTable, dbId]);

  useEffect(() => {
    const handleResult = (event: CustomEvent) => {
      if (event.detail.sessionId !== querySessionId) return;
      setSchemaData(event.detail);
      // Replace data instead of appending to prevent accumulation
      setRowData(event.detail.rows);
      setIsExecuting(false);
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
    <div className="space-y-4">
      {/* Config Panel */}
      <div className="rounded-lg border border-border/50 bg-muted/20 p-4">
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-2">
            <div className="p-1.5 rounded-md bg-primary/10">
              <BarChart3 className="h-3.5 w-3.5 text-primary" />
            </div>
            <span className="text-xs font-medium text-foreground">Configure Chart</span>
          </div>
          
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="outline" size="sm" className="h-7 text-xs gap-1">
                <Download className="h-3 w-3" />
                Export
                <ChevronDown className="h-3 w-3 opacity-50" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              <DropdownMenuItem onClick={() => handleExport("png")} className="text-xs">
                Export as PNG
              </DropdownMenuItem>
              <DropdownMenuItem onClick={() => handleExport("svg")} className="text-xs">
                Export as SVG
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
        
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
        className="rounded-lg border border-border/50 bg-background p-5"
      >
        {chartTitle && (
          <h3 className="text-xs font-medium text-center text-muted-foreground mb-4">
            {chartTitle}
          </h3>
        )}

        {isExecuting ? (
          <div className="flex flex-col items-center justify-center py-16">
            <Loader2 className="h-6 w-6 animate-spin text-primary/60 mb-3" />
            <p className="text-xs text-muted-foreground">Processing data...</p>
          </div>
        ) : errorMessage ? (
          <div className="flex flex-col items-center justify-center py-16">
            <div className="rounded-full bg-destructive/10 p-3 mb-3">
              <BarChart3 className="h-5 w-5 text-destructive/70" />
            </div>
            <p className="text-xs text-destructive/80 font-medium">{errorMessage}</p>
          </div>
        ) : !rowData.length ? (
          <div className="flex flex-col items-center justify-center py-16">
            <div className="rounded-full bg-muted/50 p-3 mb-3">
              <BarChart3 className="h-5 w-5 text-muted-foreground/60" />
            </div>
            <p className="text-xs text-muted-foreground">Select axes to visualize data</p>
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
    </div>
  );
};