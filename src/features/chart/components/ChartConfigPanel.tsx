import React, { useMemo } from 'react';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Input } from "@/components/ui/input";
import { BarChart3, TrendingUp, PieChart, AreaChart } from "lucide-react";
import { ColumnDetails } from '@/features/database/types';
import { cn } from "@/lib/utils";

interface ChartConfigPanelProps {
    chartType: "bar" | "line" | "area" | "pie";
    setChartType: (type: "bar" | "line" | "area" | "pie") => void;
    xAxis: string;
    setXAxis: (axis: string) => void;
    yAxis: string;
    setYAxis: (axis: string) => void;
    chartTitle: string;
    setChartTitle: (title: string) => void;
    columns: ColumnDetails[];
}

const CHART_TYPES = [
    { value: "bar",     label: "Bar",   icon: BarChart3   },
    { value: "line",    label: "Line",  icon: TrendingUp  },
    { value: "area",    label: "Area",  icon: AreaChart   },
    { value: "pie",     label: "Pie",   icon: PieChart    },
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
    // Non-PK columns → good grouping dimensions (X axis)
    const xAxisColumns = useMemo(() => columns.filter(col => !col.isPrimaryKey), [columns]);
    // PK columns → good count targets (Y axis)
    const yAxisColumns = useMemo(() => columns.filter(col => col.isPrimaryKey), [columns]);

    return (
        <div className="space-y-4">
            {/* Chart type toggle */}
            <div
                role="tablist"
                className="inline-flex items-center gap-0.5 p-1 rounded-lg bg-muted/50 border border-border/30"
            >
                {CHART_TYPES.map(({ value, label, icon: Icon }) => (
                    <button
                        key={value}
                        role="tab"
                        aria-selected={chartType === value}
                        onClick={() => setChartType(value)}
                        className={cn(
                            "flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs font-medium transition-all duration-150 select-none",
                            chartType === value
                                ? "bg-background text-foreground shadow-sm ring-1 ring-border/40"
                                : "text-muted-foreground hover:text-foreground hover:bg-muted/60"
                        )}
                    >
                        <Icon className="h-3.5 w-3.5 shrink-0" />
                        {label}
                    </button>
                ))}
            </div>

            {/* Axis + title controls */}
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                {/* X Axis */}
                <div className="space-y-1.5">
                    <label className="text-[10px] font-semibold uppercase tracking-widest text-muted-foreground/60">
                        X — Group by
                    </label>
                    <Select value={xAxis} onValueChange={setXAxis}>
                        <SelectTrigger className="h-8 text-xs border-border/40 bg-background/60">
                            <SelectValue placeholder="Select column" />
                        </SelectTrigger>
                        <SelectContent>
                            {xAxisColumns.length > 0 ? (
                                xAxisColumns.map(col => (
                                    <SelectItem key={col.name} value={col.name} className="text-xs font-mono">
                                        {col.name}
                                        <span className="ml-2 text-muted-foreground/50 text-[10px]">{col.type}</span>
                                    </SelectItem>
                                ))
                            ) : (
                                <SelectItem value="none" disabled className="text-xs text-muted-foreground italic">
                                    No columns available
                                </SelectItem>
                            )}
                        </SelectContent>
                    </Select>
                </div>

                {/* Y Axis */}
                <div className="space-y-1.5">
                    <label className="text-[10px] font-semibold uppercase tracking-widest text-muted-foreground/60">
                        Y — Count of
                    </label>
                    <Select value={yAxis} onValueChange={setYAxis}>
                        <SelectTrigger className="h-8 text-xs border-border/40 bg-background/60">
                            <SelectValue placeholder="Select column" />
                        </SelectTrigger>
                        <SelectContent>
                            {yAxisColumns.length > 0 ? (
                                yAxisColumns.map(col => (
                                    <SelectItem key={col.name} value={col.name} className="text-xs font-mono">
                                        {col.name}
                                        <span className="ml-2 text-muted-foreground/50 text-[10px]">{col.type}</span>
                                    </SelectItem>
                                ))
                            ) : (
                                <SelectItem value="none" disabled className="text-xs text-muted-foreground italic">
                                    No columns available
                                </SelectItem>
                            )}
                        </SelectContent>
                    </Select>
                </div>

                {/* Title */}
                <div className="space-y-1.5">
                    <label className="text-[10px] font-semibold uppercase tracking-widest text-muted-foreground/60">
                        Title
                    </label>
                    <Input
                        value={chartTitle}
                        onChange={(e) => setChartTitle(e.target.value)}
                        placeholder="Chart title…"
                        className="h-8 text-xs border-border/40 bg-background/60"
                    />
                </div>
            </div>
        </div>
    );
};