import React, { useMemo } from 'react';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Input } from "@/components/ui/input";
import { BarChart3, TrendingUp, PieChart, ScatterChart } from "lucide-react";
import { ColumnDetails } from '@/types/database';
import { cn } from "@/lib/utils";

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

const CHART_TYPES = [
    { value: "bar", label: "Bar", icon: BarChart3 },
    { value: "line", label: "Line", icon: TrendingUp },
    { value: "pie", label: "Pie", icon: PieChart },
    { value: "scatter", label: "Scatter", icon: ScatterChart },
] as const;

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
}) => {
    const xAxisColumns = useMemo(() =>
        columns.filter(col => !col.isPrimaryKey),
        [columns]
    );

    const yAxisColumns = useMemo(() =>
        columns.filter(col => col.isPrimaryKey),
        [columns]
    );

    return (
        <div className="space-y-4">
            {/* Chart Type Selector - Icon buttons */}
            <div className="flex items-center gap-1 p-1 bg-muted/40 rounded-lg w-fit">
                {CHART_TYPES.map(({ value, label, icon: Icon }) => (
                    <button
                        key={value}
                        onClick={() => setChartType(value)}
                        className={cn(
                            "flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs font-medium transition-all",
                            chartType === value
                                ? "bg-background text-foreground shadow-sm"
                                : "text-muted-foreground hover:text-foreground"
                        )}
                    >
                        <Icon className="h-3.5 w-3.5" />
                        {label}
                    </button>
                ))}
            </div>

            {/* Axis Configuration */}
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                <div className="space-y-1.5">
                    <label className="text-[11px] font-medium text-muted-foreground uppercase tracking-wider">
                        X-Axis
                    </label>
                    <Select value={xAxis} onValueChange={setXAxis}>
                        <SelectTrigger className="h-8 text-xs border-border/50">
                            <SelectValue placeholder="Select column" />
                        </SelectTrigger>
                        <SelectContent>
                            {xAxisColumns.length > 0 ? (
                                xAxisColumns.map(col => (
                                    <SelectItem key={col.name} value={col.name} className="text-xs">
                                        {col.name}
                                    </SelectItem>
                                ))
                            ) : (
                                <SelectItem value="none" disabled className="text-xs text-muted-foreground">
                                    No columns available
                                </SelectItem>
                            )}
                        </SelectContent>
                    </Select>
                </div>

                <div className="space-y-1.5">
                    <label className="text-[11px] font-medium text-muted-foreground uppercase tracking-wider">
                        Y-Axis
                    </label>
                    <Select value={yAxis} onValueChange={setYAxis}>
                        <SelectTrigger className="h-8 text-xs border-border/50">
                            <SelectValue placeholder="Select column" />
                        </SelectTrigger>
                        <SelectContent>
                            {yAxisColumns.length > 0 ? (
                                yAxisColumns.map(col => (
                                    <SelectItem key={col.name} value={col.name} className="text-xs">
                                        {col.name}
                                    </SelectItem>
                                ))
                            ) : (
                                <SelectItem value="none" disabled className="text-xs text-muted-foreground">
                                    No columns available
                                </SelectItem>
                            )}
                        </SelectContent>
                    </Select>
                </div>

                <div className="space-y-1.5">
                    <label className="text-[11px] font-medium text-muted-foreground uppercase tracking-wider">
                        Title
                    </label>
                    <Input
                        value={chartTitle}
                        onChange={(e) => setChartTitle(e.target.value)}
                        placeholder="Chart title"
                        className="h-8 text-xs border-border/50"
                    />
                </div>
            </div>
        </div>
    );
};