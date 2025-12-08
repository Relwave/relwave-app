import React from 'react';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { BarChart3, LineChart as LineChartIcon, PieChart as PieChartIcon, ScatterChart as ScatterChartIcon } from "lucide-react";

interface ChartConfigPanelProps {
    chartType: "bar" | "line" | "pie" | "scatter";
    setChartType: (type: "bar" | "line" | "pie" | "scatter") => void;
    xAxis: string;
    setXAxis: (axis: string) => void;
    yAxis: string;
    setYAxis: (axis: string) => void;
    chartTitle: string;
    setChartTitle: (title: string) => void;
    columns: string[];
}

export const ChartConfigPanel: React.FC<ChartConfigPanelProps> = ({
    chartType,
    setChartType,
    xAxis,
    setXAxis,
    yAxis,
    setYAxis,
    chartTitle,
    setChartTitle,
    columns,
}) => (
    // Configuration - Fully Responsive Grid
    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">

        {/* Chart Type Select */}
        <div className="space-y-2">
            <Label className="text-muted-foreground">Chart Type</Label>
            <Select value={chartType} onValueChange={(val: any) => setChartType(val)}>
                <SelectTrigger className="bg-input border-border text-foreground focus:border-primary">
                    <SelectValue />
                </SelectTrigger>
                <SelectContent className="bg-popover border-border text-foreground">
                    <SelectItem value="bar">
                        <div className="flex items-center gap-2 text-cyan-400"> <BarChart3 className="h-4 w-4" /> Bar Chart </div>
                    </SelectItem>
                    <SelectItem value="line">
                        <div className="flex items-center gap-2 text-violet-400"> <LineChartIcon className="h-4 w-4" /> Line Chart </div>
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
            <Label className="text-muted-foreground">X Axis</Label>
            <Select value={xAxis} onValueChange={setXAxis}>
                <SelectTrigger className="bg-input border-border text-foreground focus:border-primary">
                    <SelectValue placeholder="Select column" />
                </SelectTrigger>
                <SelectContent className="bg-popover border-border text-foreground">
                    {columns.map((col) => (
                        <SelectItem key={col} value={col}> {col} </SelectItem>
                    ))}
                </SelectContent>
            </Select>
        </div>

        {/* Y Axis Select */}
        <div className="space-y-2">
            <Label className="text-muted-foreground">Y Axis</Label>
            <Select value={yAxis} onValueChange={setYAxis}>
                <SelectTrigger className="bg-input border-border text-foreground focus:border-primary">
                    <SelectValue placeholder="Select column" />
                </SelectTrigger>
                <SelectContent className="bg-popover border-border text-foreground">
                    {columns.map((col) => (
                        <SelectItem key={col} value={col}> {col} </SelectItem>
                    ))}
                </SelectContent>
            </Select>
        </div>

        {/* Chart Title Input */}
        <div className="space-y-2">
            <Label className="text-muted-foreground">Chart Title</Label>
            <Input
                value={chartTitle}
                onChange={(e) => setChartTitle(e.target.value)}
                placeholder="Enter title"
                className="bg-input border-border text-foreground focus:border-primary"
            />
        </div>
    </div>
);