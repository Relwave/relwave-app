import { useState } from "react";
import {
  BarChart,
  Bar,
  LineChart,
  Line,
  PieChart,
  Pie,
  ScatterChart,
  Scatter,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ResponsiveContainer,
  Cell,
} from "recharts";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Download, BarChart3 } from "lucide-react";
import { toPng, toSvg } from "html-to-image";
import { toast } from "sonner";
import { ChartConfigPanel } from "./chart/ChartConfigPanel";
import { ChartRenderer } from "./chart/ChartRenderer";

// Adjusted COLORS for a vibrant, yet professional palette, optimized for light/dark contrast
const COLORS = ["#06B6D4", "#A855F7", "#10B981", "#F59E0B", "#EF4444", "#52525B"]; // Cyan, Violet, Emerald, Amber, Red, Gray

interface ChartVisualizationProps {
  data: Array<Record<string, any>>;
}

export const ChartVisualization = ({ data }: ChartVisualizationProps) => {
  const [chartType, setChartType] = useState<"bar" | "line" | "pie" | "scatter">("bar");
  const [xAxis, setXAxis] = useState("");
  const [yAxis, setYAxis] = useState("");
  const [chartTitle, setChartTitle] = useState("Query Results Visualization");

  const columns = data.length > 0 ? Object.keys(data[0]) : [];

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
      console.error(error);
    }
  };


  return (
    // Applied clean card styling: bg-card, border-border, shadow-elevated
    <Card className="bg-card border border-border rounded-xl shadow-elevated">
      <CardHeader className="border-b border-border pb-4">
        <div className="flex items-center justify-between flex-wrap gap-3">
          <div>
            <CardTitle className="text-xl text-foreground">Chart Visualization</CardTitle>
            <CardDescription className="text-muted-foreground">Generate charts from your query results</CardDescription>
          </div>
          {/* Export Buttons: Using standard outline style with theme hover */}
          <div className="flex gap-2">
            <Button variant="outline" size="sm" onClick={() => handleExport("png")} className="border-border hover:bg-accent transition-colors">
              <Download className="h-4 w-4 mr-2" />
              Export PNG
            </Button>
            <Button variant="outline" size="sm" onClick={() => handleExport("svg")} className="border-border hover:bg-accent transition-colors">
              <Download className="h-4 w-4 mr-2" />
              Export SVG
            </Button>
          </div>
        </div>
      </CardHeader>
      <CardContent className="space-y-6 pt-6">
        {/* Configuration - Fully Responsive Grid */}
        <ChartConfigPanel
          chartType={chartType}
          setChartType={setChartType}
          xAxis={xAxis}
          setXAxis={setXAxis}
          yAxis={yAxis}
          setYAxis={setYAxis}
          chartTitle={chartTitle}
          setChartTitle={setChartTitle}
          columns={columns}
        />

        {/* Chart Display Area - High contrast container */}
        {/* Ensure chart container uses theme colors for high contrast */}
        <div id="chart-container" className="bg-background border border-border rounded-xl p-6 shadow-xl relative min-h-[400px]">
          <h3 className="text-lg font-semibold text-center mb-4 text-foreground">{chartTitle}</h3>
          <ChartRenderer
            chartType={chartType}
            xAxis={xAxis}
            yAxis={yAxis}
            data={data}
          />
        </div>
      </CardContent>
    </Card>
  );
};