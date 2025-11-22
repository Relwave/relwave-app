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
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Download, BarChart3, LineChart as LineChartIcon, PieChart as PieChartIcon, ScatterChart as ScatterChartIcon } from "lucide-react";
import { toPng, toSvg } from "html-to-image";
import { toast } from "sonner";

// Adjusted COLORS for better dark mode visibility and consistency
const COLORS = ["#4DEDF9", "#A855F7", "#10B981", "#F59E0B", "#EF4444", "#8B5CF6"];

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
    // Note: html-to-image usually requires setting a transparent background 
    // to capture the complex dark mode styles correctly, or setting the 
    // background explicitly in the final component. Keeping white for compatibility.
    const chartElement = document.getElementById("chart-container");
    if (!chartElement) return;

    try {
      const dataUrl = format === "png"
        ? await toPng(chartElement, { quality: 0.95, backgroundColor: "#111827" }) // Use a dark background for export consistency
        : await toSvg(chartElement, { backgroundColor: "#111827" });

      const link = document.createElement("a");
      link.download = `chart-${Date.now()}.${format}`;
      link.href = dataUrl;
      link.click();

      toast.success(`Chart exported as ${format.toUpperCase()}`);
    } catch (error) {
      toast.error("Failed to export chart");
    }
  };

  const renderChart = () => {
    if (!xAxis || !yAxis) {
      return (
        <div className="flex flex-col items-center justify-center h-[400px] text-gray-500">
          <BarChart3 className="h-10 w-10 mb-3" />
          <p className="text-lg font-semibold">Configure axes to generate chart</p>
          <p className="text-sm">Select both X and Y columns to plot your data.</p>
        </div>
      );
    }

    const chartData = data.map((row) => ({
      x: row[xAxis],
      y: Number(row[yAxis]) || 0,
    }));

    // Recharts styling props for dark theme
    const rechartsTheme = {
      stroke: "#E5E7EB", // light gray for axes/grid
      gridStroke: "#374151", // darker gray for grid lines
      tooltipBg: "#1F2937", // dark background for tooltip
      tooltipBorder: "#4B5563", // subtle border for tooltip
      lineStroke: COLORS[0], // primary color for lines/bars
    };


    switch (chartType) {
      case "bar":
        return (
          <ResponsiveContainer width="100%" height={400}>
            <BarChart data={chartData} margin={{ top: 20, right: 30, left: 20, bottom: 20 }}>
              <CartesianGrid strokeDasharray="3 3" stroke={rechartsTheme.gridStroke} />
              <XAxis dataKey="x" stroke={rechartsTheme.stroke} tick={{ fill: rechartsTheme.stroke }} />
              <YAxis stroke={rechartsTheme.stroke} tick={{ fill: rechartsTheme.stroke }} />
              <Tooltip
                contentStyle={{
                  backgroundColor: rechartsTheme.tooltipBg,
                  border: `1px solid ${rechartsTheme.tooltipBorder}`,
                  borderRadius: "8px",
                  color: rechartsTheme.stroke,
                }}
              />
              <Legend wrapperStyle={{ color: rechartsTheme.stroke, paddingTop: '10px' }} />
              <Bar dataKey="y" fill={rechartsTheme.lineStroke} name={yAxis}>
                {/* Individual coloring for aesthetic appeal */}
                {chartData.map((entry, index) => (
                  <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
                ))}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        );

      case "line":
        return (
          <ResponsiveContainer width="100%" height={400}>
            <LineChart data={chartData} margin={{ top: 20, right: 30, left: 20, bottom: 20 }}>
              <CartesianGrid strokeDasharray="3 3" stroke={rechartsTheme.gridStroke} />
              <XAxis dataKey="x" stroke={rechartsTheme.stroke} tick={{ fill: rechartsTheme.stroke }} />
              <YAxis stroke={rechartsTheme.stroke} tick={{ fill: rechartsTheme.stroke }} />
              <Tooltip
                contentStyle={{
                  backgroundColor: rechartsTheme.tooltipBg,
                  border: `1px solid ${rechartsTheme.tooltipBorder}`,
                  borderRadius: "8px",
                  color: rechartsTheme.stroke,
                }}
              />
              <Legend wrapperStyle={{ color: rechartsTheme.stroke, paddingTop: '10px' }} />
              <Line type="monotone" dataKey="y" stroke={rechartsTheme.lineStroke} strokeWidth={3} name={yAxis} dot={{ fill: rechartsTheme.lineStroke, r: 4 }} activeDot={{ r: 6 }} />
            </LineChart>
          </ResponsiveContainer>
        );

      case "pie":
        return (
          <ResponsiveContainer width="100%" height={400}>
            <PieChart>
              <Pie
                data={chartData}
                cx="50%"
                cy="50%"
                labelLine={false}
                label={({ x, percent = 0 }) => `${x} (${(percent * 100).toFixed(0)}%)`} // Label with percentage
                outerRadius={120}
                dataKey="y"
              >
                {chartData.map((entry, index) => (
                  <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} stroke={rechartsTheme.tooltipBg} strokeWidth={3} />
                ))}
              </Pie>
              <Tooltip
                contentStyle={{
                  backgroundColor: rechartsTheme.tooltipBg,
                  border: `1px solid ${rechartsTheme.tooltipBorder}`,
                  borderRadius: "8px",
                  color: rechartsTheme.stroke,
                }}
              />
              <Legend wrapperStyle={{ color: rechartsTheme.stroke, paddingTop: '10px' }} />
            </PieChart>
          </ResponsiveContainer>
        );

      case "scatter":
        return (
          <ResponsiveContainer width="100%" height={400}>
            <ScatterChart data={chartData} margin={{ top: 20, right: 30, left: 20, bottom: 20 }}>
              <CartesianGrid strokeDasharray="3 3" stroke={rechartsTheme.gridStroke} />
              <XAxis dataKey="x" stroke={rechartsTheme.stroke} tick={{ fill: rechartsTheme.stroke }} />
              <YAxis dataKey="y" stroke={rechartsTheme.stroke} tick={{ fill: rechartsTheme.stroke }} />
              <Tooltip
                contentStyle={{
                  backgroundColor: rechartsTheme.tooltipBg,
                  border: `1px solid ${rechartsTheme.tooltipBorder}`,
                  borderRadius: "8px",
                  color: rechartsTheme.stroke,
                }}
              />
              <Legend wrapperStyle={{ color: rechartsTheme.stroke, paddingTop: '10px' }} />
              <Scatter name={yAxis} data={chartData} fill={rechartsTheme.lineStroke} />
            </ScatterChart>
          </ResponsiveContainer>
        );

      default:
        return null;
    }
  };

  return (
    // Applied consistent dark card styling
    <Card className="bg-gray-900/50 border border-primary/10 rounded-xl shadow-2xl">
      <CardHeader className="border-b border-primary/10 pb-4">
        <div className="flex items-center justify-between flex-wrap gap-3">
          <div>
            <CardTitle className="text-xl text-white">Chart Visualization</CardTitle>
            <CardDescription className="text-gray-400">Generate charts from your query results</CardDescription>
          </div>
          {/* Export Buttons: Using subtle primary hover */}
          <div className="flex gap-2">
            <Button variant="outline" size="sm" onClick={() => handleExport("png")} className="border-gray-700  hover:bg-gray-200 transition-colors">
              <Download className="h-4 w-4 mr-2" />
              Export PNG
            </Button>
            <Button variant="outline" size="sm" onClick={() => handleExport("svg")} className="border-gray-700  hover:bg-gray-200 transition-colors">
              <Download className="h-4 w-4 mr-2" />
              Export SVG
            </Button>
          </div>
        </div>
      </CardHeader>
      <CardContent className="space-y-6 pt-6">
        {/* Configuration - Fully Responsive Grid */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">

          {/* Chart Type Select */}
          <div className="space-y-2">
            <Label className="text-gray-300">Chart Type</Label>
            <Select value={chartType} onValueChange={(val: any) => setChartType(val)}>
              <SelectTrigger className="bg-gray-800/70 border-primary/20 text-white focus:border-cyan-500">
                <SelectValue />
              </SelectTrigger>
              <SelectContent className="bg-card border-primary/20 text-white">
                <SelectItem value="bar">
                  <div className="flex items-center gap-2 text-cyan-400"> <BarChart3 className="h-4 w-4" /> Bar Chart </div>
                </SelectItem>
                <SelectItem value="line">
                  <div className="flex items-center gap-2 text-fuchsia-400"> <LineChartIcon className="h-4 w-4" /> Line Chart </div>
                </SelectItem>
                <SelectItem value="pie">
                  <div className="flex items-center gap-2 text-emerald-400"> <PieChartIcon className="h-4 w-4" /> Pie Chart </div>
                </SelectItem>
                <SelectItem value="scatter">
                  <div className="flex items-center gap-2 text-amber-400"> <ScatterChartIcon className="h-4 w-4" /> Scatter Plot </div>
                </SelectItem>
              </SelectContent>
            </Select>
          </div>

          {/* X Axis Select */}
          <div className="space-y-2">
            <Label className="text-gray-300">X Axis</Label>
            <Select value={xAxis} onValueChange={setXAxis}>
              <SelectTrigger className="bg-gray-800/70 border-primary/20 text-white focus:border-cyan-500">
                <SelectValue placeholder="Select column" />
              </SelectTrigger>
              <SelectContent className="bg-card border-primary/20 text-white">
                {columns.map((col) => (
                  <SelectItem key={col} value={col}> {col} </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {/* Y Axis Select */}
          <div className="space-y-2">
            <Label className="text-gray-300">Y Axis</Label>
            <Select value={yAxis} onValueChange={setYAxis}>
              <SelectTrigger className="bg-gray-800/70 border-primary/20 text-white focus:border-cyan-500">
                <SelectValue placeholder="Select column" />
              </SelectTrigger>
              <SelectContent className="bg-card border-primary/20 text-white">
                {columns.map((col) => (
                  <SelectItem key={col} value={col}> {col} </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {/* Chart Title Input */}
          <div className="space-y-2">
            <Label className="text-gray-300">Chart Title</Label>
            <Input
              value={chartTitle}
              onChange={(e) => setChartTitle(e.target.value)}
              placeholder="Enter title"
              className="bg-gray-800/70 border-primary/20 text-white focus:border-cyan-500"
            />
          </div>
        </div>

        {/* Chart Display Area - High contrast container */}
        <div id="chart-container" className="bg-gray-900 border border-primary/20 rounded-xl p-6 shadow-xl relative min-h-[400px]">
          <h3 className="text-lg font-semibold text-center mb-4 text-white">{chartTitle}</h3>
          {renderChart()}
          {/* Overlay to ensure chart is visible even if parent has transparency */}
          <div className="absolute inset-0 bg-gray-900/10 -z-10 rounded-xl"></div>
        </div>
      </CardContent>
    </Card>
  );
};