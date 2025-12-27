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
    <div className="p-4 rounded-xl border bg-background/80">
        <h3 className="text-sm font-semibold mb-3">Chart Configuration</h3>

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
            {/* Chart Type */}
            <div className="space-y-1">
                <Label>Chart Type</Label>
                <Select value={chartType} onValueChange={setChartType}>
                    <SelectTrigger>
                        <SelectValue placeholder="Choose" />
                    </SelectTrigger>
                    <SelectContent>
                        <SelectItem value="bar">Bar Chart</SelectItem>
                        <SelectItem value="line">Line Chart</SelectItem>
                        <SelectItem value="pie">Pie Chart</SelectItem>
                        <SelectItem value="scatter">Scatter Plot</SelectItem>
                    </SelectContent>
                </Select>
            </div>

            {/* Axis Selects */}
            <div className="space-y-1">
                <Label>X Axis</Label>
                <Select value={xAxis} onValueChange={setXAxis}>
                    <SelectTrigger><SelectValue placeholder="Column" /></SelectTrigger>
                    <SelectContent>
                        {columns.map(col => (
                            <SelectItem key={col.name} value={col.name}>{col.name}</SelectItem>
                        ))}
                    </SelectContent>
                </Select>
            </div>

            <div className="space-y-1">
                <Label>Y Axis</Label>
                <Select value={yAxis} onValueChange={setYAxis}>
                    <SelectTrigger><SelectValue placeholder="Column" /></SelectTrigger>
                    <SelectContent>
                        {columns.map(col => (
                            <SelectItem key={col.name} value={col.name}>{col.name}</SelectItem>
                        ))}
                    </SelectContent>
                </Select>
            </div>

            {/* Title */}
            <div className="space-y-1">
                <Label>Chart Title</Label>
                <Input
                    value={chartTitle}
                    onChange={(e) => setChartTitle(e.target.value)}
                    placeholder="Enter chart title"
                />
            </div>
        </div>
    </div>

);