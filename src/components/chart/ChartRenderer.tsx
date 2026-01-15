import { useMemo } from "react";
import {
    Bar,
    BarChart,
    Line,
    LineChart,
    Pie,
    PieChart,
    Scatter,
    ScatterChart,
    XAxis,
    YAxis,
    CartesianGrid,
    Cell,
} from "recharts";
import {
    ChartContainer,
    ChartTooltip,
    ChartTooltipContent,
    type ChartConfig,
} from "@/components/ui/chart";

interface DataProps {
    count: number | string;
    [key: string]: any;
}

interface ChartRendererProps {
    chartType: "bar" | "line" | "pie" | "scatter";
    xAxis: string;
    yAxis: string;
    data: DataProps[];
}

// Single theme-aware color using CSS variable
const CHART_COLOR = "var(--primary)";

// Chart config using theme color
const chartConfig: ChartConfig = {
    value: {
        label: "Count",
        color: "hsl(var(--primary))",
    },
};

const ChartRendererComponent = ({
    chartType,
    xAxis,
    yAxis: _yAxis,
    data,
}: ChartRendererProps) => {
    const chartData = useMemo(() => {
        if (!data || !Array.isArray(data) || !xAxis) return [];
        return data.map((item) => ({
            name: item.name != null ? String(item.name) : "N/A",
            value: Number(item.count ?? item.COUNT ?? item.Count ?? 0) || 0,
        }));
    }, [data, xAxis]);

    if (!xAxis || chartData.length === 0) {
        return (
            <div className="flex flex-col items-center justify-center h-[300px] text-muted-foreground">
                <div className="rounded-full bg-muted/50 p-3 mb-3">
                    <svg className="h-5 w-5 opacity-50" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" />
                    </svg>
                </div>
                <p className="text-xs font-medium">Configure axes to visualize</p>
            </div>
        );
    }

    // Bar Chart
    if (chartType === "bar") {
        return (
            <ChartContainer config={chartConfig} className="h-[300px] w-full">
                <BarChart accessibilityLayer data={chartData}>
                    <CartesianGrid vertical={false} />
                    <XAxis
                        dataKey="name"
                        tickLine={false}
                        tickMargin={10}
                        axisLine={false}
                        tickFormatter={(value) =>
                            value.length > 12 ? value.slice(0, 12) + "…" : value
                        }
                    />
                    <YAxis
                        tickLine={false}
                        axisLine={false}
                        tickFormatter={(value) =>
                            value >= 1000 ? `${(value / 1000).toFixed(1)}k` : value
                        }
                    />
                    <ChartTooltip
                        cursor={false}
                        content={<ChartTooltipContent hideLabel />}
                    />
                    <Bar
                        dataKey="value"
                        fill={CHART_COLOR}
                        radius={6}
                    />
                </BarChart>
            </ChartContainer>
        );
    }

    // Line Chart
    if (chartType === "line") {
        return (
            <ChartContainer config={chartConfig} className="h-[300px] w-full">
                <LineChart accessibilityLayer data={chartData}>
                    <CartesianGrid vertical={false} />
                    <XAxis
                        dataKey="name"
                        tickLine={false}
                        tickMargin={10}
                        axisLine={false}
                        tickFormatter={(value) =>
                            value.length > 12 ? value.slice(0, 12) + "…" : value
                        }
                    />
                    <YAxis
                        tickLine={false}
                        axisLine={false}
                        tickFormatter={(value) =>
                            value >= 1000 ? `${(value / 1000).toFixed(1)}k` : value
                        }
                    />
                    <ChartTooltip
                        cursor={false}
                        content={<ChartTooltipContent hideLabel />}
                    />
                    <Line
                        dataKey="value"
                        type="monotone"
                        stroke={CHART_COLOR}
                        strokeWidth={2}
                        dot={{ fill: CHART_COLOR, r: 4 }}
                        activeDot={{ r: 6 }}
                    />
                </LineChart>
            </ChartContainer>
        );
    }

    // Pie Chart
    if (chartType === "pie") {
        return (
            <ChartContainer config={chartConfig} className="h-[300px] w-full">
                <PieChart>
                    <ChartTooltip
                        content={<ChartTooltipContent nameKey="name" hideLabel />}
                    />
                    <Pie
                        data={chartData}
                        dataKey="value"
                        nameKey="name"
                        cx="50%"
                        cy="50%"
                        innerRadius={50}
                        outerRadius={100}
                        fill={CHART_COLOR}
                        label={({ percent }: { percent?: number }) => `${((percent ?? 0) * 100).toFixed(0)}%`}
                        labelLine={false}
                    />
                </PieChart>
            </ChartContainer>
        );
    }

    // Scatter Chart
    if (chartType === "scatter") {
        return (
            <ChartContainer config={chartConfig} className="h-[300px] w-full">
                <ScatterChart accessibilityLayer>
                    <CartesianGrid />
                    <XAxis
                        dataKey="name"
                        tickLine={false}
                        tickMargin={10}
                        axisLine={false}
                    />
                    <YAxis
                        dataKey="value"
                        tickLine={false}
                        axisLine={false}
                        tickFormatter={(value) =>
                            value >= 1000 ? `${(value / 1000).toFixed(1)}k` : value
                        }
                    />
                    <ChartTooltip
                        cursor={false}
                        content={<ChartTooltipContent hideLabel />}
                    />
                    <Scatter
                        data={chartData}
                        fill={CHART_COLOR}
                    />
                </ScatterChart>
            </ChartContainer>
        );
    }

    return null;
};

export default ChartRendererComponent;
