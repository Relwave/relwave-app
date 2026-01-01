import React from 'react';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { BarChart3, LineChart as LineChartIcon, PieChart as PieChartIcon, ScatterChart as ScatterChartIcon, Sparkles, Database } from "lucide-react";
import { ColumnDetails } from '@/types/database';

interface ChartConfigPanelProps {
    chartType: "bar" | "line" | "pie" | "scatter";
    setChartType: (type: "bar" | "line" | "pie" | "scatter") => void;
    xAxis: string;
    setXAxis: (axis: string) => void;
    yAxis: string;
    setYAxis: (axis: string) => void;
    chartTitle: string;
    setChartTitle: (title: string) => void;
    columns: ColumnDetails[];
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
    <div>
        <h4 className="text-xs font-medium text-muted-foreground/70 mb-3">Configuration</h4>

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
            {/* Chart Type */}
            <div className="space-y-1.5">
                <Label className="text-xs">Chart Type</Label>
                <Select value={chartType} onValueChange={setChartType}>
                    <SelectTrigger className="h-9 text-sm">
                        <SelectValue placeholder="Choose" />
                    </SelectTrigger>
                    <SelectContent>
                        <SelectItem value="bar" className="text-sm">Bar Chart</SelectItem>
                        <SelectItem value="line" className="text-sm">Line Chart</SelectItem>
                        <SelectItem value="pie" className="text-sm">Pie Chart</SelectItem>
                        <SelectItem value="scatter" className="text-sm">Scatter Plot</SelectItem>
                    </SelectContent>
                </Select>
            </div>

            {/* Axis Selects */}
            <div className="space-y-1.5">
                <Label className="text-xs">X Axis</Label>
                <Select value={xAxis} onValueChange={setXAxis}>
                    <SelectTrigger className="h-9 text-sm"><SelectValue placeholder="Column" /></SelectTrigger>
                    <SelectContent>
                        {columns.map(col => (
                            <SelectItem key={col.name} value={col.name} className="text-sm">{col.name}</SelectItem>
                        ))}
                    </SelectContent>
                </Select>
            </div>

            <div className="space-y-1.5">
                <Label className="text-xs">Y Axis</Label>
                <Select value={yAxis} onValueChange={setYAxis}>
                    <SelectTrigger className="h-9 text-sm"><SelectValue placeholder="Column" /></SelectTrigger>
                    <SelectContent>
                        {columns.map(col => (
                            <SelectItem key={col.name} value={col.name} className="text-sm">{col.name}</SelectItem>
                        ))}
                    </SelectContent>
                </Select>
            </div>

            {/* Title */}
            <div className="space-y-1.5">
                <Label className="text-xs">Chart Title</Label>
                <Input
                    value={chartTitle}
                    onChange={(e) => setChartTitle(e.target.value)}
                    placeholder="Enter chart title"
                    className="h-9 text-sm"
                />
            </div>
        </div>
    </div>

);