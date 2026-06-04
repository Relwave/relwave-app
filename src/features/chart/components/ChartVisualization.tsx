import { Button } from "@/components/ui/button";
import {
  Loader2,
  BarChart3,
  Download,
  ChevronDown,
  Sparkles,
  AlertCircle,
  Bot,
} from "lucide-react";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Separator } from "@/components/ui/separator";
import { ChartConfigPanel } from "./ChartConfigPanel";
import ChartRenderer from "./ChartRenderer";
import { useChartVisualization } from "../hooks/useChartVisualization";
import { SelectedTable } from "@/features/database/types";
import { cn } from "@/lib/utils";
import { useState } from "react";
import { useAISettings } from "@/features/ai/hooks/useAISettings";
import { aiService } from "@/services/bridge/ai";
import { toast } from "sonner";

interface ChartVisualizationProps {
  selectedTable: SelectedTable;
  dbId?: string;
}

export const ChartVisualization = ({
  selectedTable,
  dbId,
}: ChartVisualizationProps) => {
  const aiSettings = useAISettings();
  const [aiLoading, setAiLoading] = useState(false);

  const {
    handleExport,
    chartType,
    chartTitle,
    setChartTitle,
    setChartType,
    xAxis,
    yAxis,
    setXAxis,
    setYAxis,
    columnData,
    isExecuting,
    errorMessage,
    rowData,
  } = useChartVisualization(selectedTable, dbId);

  const handleAISuggest = async () => {
    if (!columnData.length) return;
    setAiLoading(true);
    try {
      const rec = await aiService.recommendChart(aiSettings, {
        tableName: selectedTable?.name ?? "table",
        columns: columnData.map((c) => ({
          name: c.name,
          type: c.type,
          isPrimaryKey: c.isPrimaryKey,
        })),
      });
      setChartType(rec.chartType);
      setXAxis(rec.xAxis);
      setYAxis(rec.yAxis);
      toast.success("AI suggestion applied", { description: rec.reasoning });
    } catch (err: any) {
      toast.error("AI suggestion failed", { description: err?.message ?? String(err) });
    } finally {
      setAiLoading(false);
    }
  };

  const hasData = rowData.length > 0;
  const isReady = !isExecuting && !errorMessage && hasData;

  return (
    <div className="flex flex-col gap-0 h-full">
      {/* ── Header toolbar ─────────────────────────────────────────────── */}
      <div className="flex items-center justify-between px-4 py-3 border-b border-border/40 shrink-0">
        <div className="flex items-center gap-2">
          <div className="p-1.5 rounded-md bg-primary/10 ring-1 ring-primary/20">
            <BarChart3 className="h-3.5 w-3.5 text-primary" />
          </div>
          <div>
            <p className="text-xs font-semibold">Visualize</p>
            <p className="text-[10px] text-muted-foreground/60 leading-none mt-0.5">
              {selectedTable?.name ?? "Select a table"}
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2">
          {/* Row count badge */}
          {isReady && (
            <span className="text-[10px] font-mono text-muted-foreground/50 tabular-nums">
              {rowData.length} rows
            </span>
          )}

          {/* AI Suggest button */}
          <Button
            variant="outline"
            size="sm"
            className="h-7 text-xs gap-1.5 border-border/40"
            onClick={handleAISuggest}
            disabled={aiLoading || !columnData.length}
          >
            {aiLoading ? (
              <Loader2 className="h-3 w-3 animate-spin" />
            ) : (
              <Bot className="h-3 w-3" />
            )}
            AI Suggest
          </Button>

          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button
                variant="outline"
                size="sm"
                className="h-7 text-xs gap-1.5 border-border/40"
                disabled={!isReady}
              >
                <Download className="h-3 w-3" />
                Export
                <ChevronDown className="h-3 w-3 opacity-50" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="text-xs">
              <DropdownMenuItem
                onClick={() => handleExport("png")}
                className="gap-2"
              >
                Export as PNG
              </DropdownMenuItem>
              <DropdownMenuItem
                onClick={() => handleExport("svg")}
                className="gap-2"
              >
                Export as SVG
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </div>

      {/* ── Config panel ───────────────────────────────────────────────── */}
      <div className="px-4 py-3 bg-muted/20 border-b border-border/30 shrink-0">
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

      {/* ── Chart canvas ───────────────────────────────────────────────── */}
      <div
        id="chart-container"
        className="flex-1 flex flex-col min-h-0 overflow-auto px-4 py-4"
      >
        {/* Title */}
        {chartTitle && isReady && (
          <p className="text-[11px] font-medium text-center text-muted-foreground/70 mb-4 tracking-wide">
            {chartTitle}
          </p>
        )}

        {/* States */}
        {isExecuting ? (
          <EmptyState
            icon={<Loader2 className="h-5 w-5 animate-spin text-primary/60" />}
            title="Processing…"
            subtitle="Querying data"
          />
        ) : errorMessage ? (
          <EmptyState
            icon={<AlertCircle className="h-5 w-5 text-destructive/70" />}
            title="Query error"
            subtitle={errorMessage}
            variant="error"
          />
        ) : !xAxis || !yAxis ? (
          <EmptyState
            icon={<Sparkles className="h-5 w-5 text-muted-foreground/40" />}
            title="Configure axes"
            subtitle="Select X and Y columns above to render the chart"
          />
        ) : !hasData ? (
          <EmptyState
            icon={<BarChart3 className="h-5 w-5 text-muted-foreground/40" />}
            title="No data returned"
            subtitle="The query returned no rows for these axes"
          />
        ) : (
          <ChartRenderer
            chartType={chartType}
            xAxis={xAxis}
            yAxis={yAxis}
            data={rowData}
          />
        )}

        {/* Summary stats strip — shown only when data is ready */}
        {isReady && (
          <>
            <Separator className="my-4 opacity-40" />
            <div className="flex items-center justify-center gap-8">
              <Stat label="Rows" value={rowData.length} />
              <Stat
                label="Max"
                value={Math.max(...rowData.map((r) => Number(r.count ?? 0)))}
              />
              <Stat
                label="Avg"
                value={(
                  rowData.reduce((s, r) => s + Number(r.count ?? 0), 0) /
                  rowData.length
                ).toFixed(1)}
              />
              <Stat
                label="Total"
                value={rowData.reduce((s, r) => s + Number(r.count ?? 0), 0)}
              />
            </div>
          </>
        )}
      </div>
    </div>
  );
};

/* ── Small helpers ──────────────────────────────────────────────────────── */

function EmptyState({
  icon,
  title,
  subtitle,
  variant = "default",
}: {
  icon: React.ReactNode;
  title: string;
  subtitle?: string;
  variant?: "default" | "error";
}) {
  return (
    <div className="flex-1 flex flex-col items-center justify-center py-20 gap-3 select-none">
      <div
        className={cn(
          "rounded-2xl p-3.5",
          variant === "error"
            ? "bg-destructive/8 ring-1 ring-destructive/20"
            : "bg-muted/50 ring-1 ring-border/30",
        )}
      >
        {icon}
      </div>
      <p
        className={cn(
          "text-xs font-semibold",
          variant === "error" ? "text-destructive/80" : "text-foreground/70",
        )}
      >
        {title}
      </p>
      {subtitle && (
        <p className="text-[11px] text-muted-foreground/60 text-center max-w-xs leading-relaxed">
          {subtitle}
        </p>
      )}
    </div>
  );
}

function Stat({ label, value }: { label: string; value: string | number }) {
  return (
    <div className="flex flex-col items-center gap-0.5">
      <span className="text-[11px] font-mono tabular-nums font-semibold text-foreground/80">
        {typeof value === "number" && value >= 1000
          ? `${(value / 1000).toFixed(1)}k`
          : value}
      </span>
      <span className="text-[9px] uppercase tracking-widest text-muted-foreground/50 font-semibold">
        {label}
      </span>
    </div>
  );
}
