import { useMemo } from "react";
import {
    Bar,
    BarChart,
    Line,
    LineChart,
    Pie,
    PieChart,
    Area,
    AreaChart,
    XAxis,
    YAxis,
    CartesianGrid,
    Cell,
    LabelList,
} from "recharts";
import {
    ChartContainer,
    ChartTooltip,
    ChartTooltipContent,
    ChartLegend,
    ChartLegendContent,
    type ChartConfig,
} from "@/components/ui/chart";

interface DataProps {
    count: number | string;
    [key: string]: any;
}

interface ChartRendererProps {
    chartType: "bar" | "line" | "area" | "pie";
    xAxis: string;
    yAxis: string;
    data: DataProps[];
}

// A curated palette using chart tokens so it respects the active theme
const PALETTE_VARS = [
    "var(--color-chart-1)",
    "var(--color-chart-2)",
    "var(--color-chart-3)",
    "var(--color-chart-4)",
    "var(--color-chart-5)",
];

const buildChartConfig = (data: { name: string; value: number }[]): ChartConfig => {
    const cfg: ChartConfig = {
        value: { label: "Count", color: "var(--color-chart-1)" },
    };
    data.forEach((item, i) => {
        cfg[item.name] = {
            label: item.name,
            color: PALETTE_VARS[i % PALETTE_VARS.length],
        };
    });
    return cfg;
};

const formatTick = (v: string | number) => {
    if (typeof v === "number" && v >= 1000) return `${(v / 1000).toFixed(1)}k`;
    if (typeof v === "string" && v.length > 14) return v.slice(0, 13) + "…";
    return v;
};

const axisStyle = {
    fontSize: 11,
    fill: "var(--color-muted-foreground)",
    fontFamily: "var(--font-mono, ui-monospace)",
};

const ChartRendererComponent = ({
    chartType,
    xAxis,
    yAxis: _yAxis,
    data,
}: ChartRendererProps) => {
    const chartData = useMemo(() => {
        if (!data || !Array.isArray(data) || !xAxis) return [];
        return data
            .map((item) => ({
                name: item.name != null ? String(item.name) : "N/A",
                value: Number(item.count ?? item.COUNT ?? item.Count ?? 0) || 0,
            }))
            .slice(0, 40);
    }, [data, xAxis]);

    const chartConfig = useMemo(() => buildChartConfig(chartData), [chartData]);

    if (!xAxis || chartData.length === 0) return null;

    const commonProps = { accessibilityLayer: true, data: chartData };
    const commonGrid = <CartesianGrid vertical={false} strokeDasharray="3 3" stroke="var(--color-border)" strokeOpacity={0.5} />;
    const commonXAxis = (
        <XAxis
            dataKey="name"
            tickLine={false}
            axisLine={false}
            tickMargin={10}
            tick={axisStyle}
            tickFormatter={formatTick as any}
        />
    );
    const commonYAxis = (
        <YAxis
            tickLine={false}
            axisLine={false}
            tickMargin={8}
            tick={axisStyle}
            tickFormatter={formatTick as any}
            width={44}
        />
    );
    const commonTooltip = (
        <ChartTooltip
            cursor={{ fill: "var(--color-muted)", opacity: 0.3, radius: 4 }}
            content={<ChartTooltipContent hideLabel className="text-[11px]" />}
        />
    );

    // ── Bar Chart ────────────────────────────────────────────────────────────
    if (chartType === "bar") {
        return (
            <ChartContainer config={chartConfig} className="h-80 w-full">
                <BarChart {...commonProps} barCategoryGap="28%">
                    {commonGrid}
                    {commonXAxis}
                    {commonYAxis}
                    {commonTooltip}
                    <Bar
                        dataKey="value"
                        radius={[6, 6, 0, 0]}
                        maxBarSize={56}
                    >
                        {chartData.map((_, i) => (
                            <Cell
                                key={i}
                                fill={PALETTE_VARS[i % PALETTE_VARS.length]}
                                fillOpacity={0.88}
                            />
                        ))}
                    </Bar>
                </BarChart>
            </ChartContainer>
        );
    }

    // ── Line Chart ───────────────────────────────────────────────────────────
    if (chartType === "line") {
        return (
            <ChartContainer config={chartConfig} className="h-80 w-full">
                <LineChart {...commonProps}>
                    {commonGrid}
                    {commonXAxis}
                    {commonYAxis}
                    {commonTooltip}
                    <Line
                        dataKey="value"
                        type="monotone"
                        stroke="var(--color-chart-1)"
                        strokeWidth={2.5}
                        dot={{ fill: "var(--color-chart-1)", r: 3.5, strokeWidth: 0 }}
                        activeDot={{ r: 5.5, fill: "var(--color-chart-1)", strokeWidth: 0 }}
                    />
                </LineChart>
            </ChartContainer>
        );
    }

    // ── Area Chart ───────────────────────────────────────────────────────────
    if (chartType === "area") {
        return (
            <ChartContainer config={chartConfig} className="h-80 w-full">
                <AreaChart {...commonProps}>
                    <defs>
                        <linearGradient id="areaGradient" x1="0" y1="0" x2="0" y2="1">
                            <stop offset="5%"  stopColor="var(--color-chart-1)" stopOpacity={0.3} />
                            <stop offset="95%" stopColor="var(--color-chart-1)" stopOpacity={0.02} />
                        </linearGradient>
                    </defs>
                    {commonGrid}
                    {commonXAxis}
                    {commonYAxis}
                    {commonTooltip}
                    <Area
                        dataKey="value"
                        type="monotone"
                        stroke="var(--color-chart-1)"
                        strokeWidth={2.5}
                        fill="url(#areaGradient)"
                        dot={{ fill: "var(--color-chart-1)", r: 3, strokeWidth: 0 }}
                        activeDot={{ r: 5, fill: "var(--color-chart-1)", strokeWidth: 0 }}
                    />
                </AreaChart>
            </ChartContainer>
        );
    }

    // ── Pie / Donut Chart ────────────────────────────────────────────────────
    if (chartType === "pie") {
        const top = chartData.slice(0, 8);
        return (
            <ChartContainer config={chartConfig} className="h-80 w-full">
                <PieChart>
                    <ChartTooltip content={<ChartTooltipContent nameKey="name" className="text-[11px]" />} />
                    <Pie
                        data={top}
                        dataKey="value"
                        nameKey="name"
                        cx="50%"
                        cy="50%"
                        innerRadius={64}
                        outerRadius={108}
                        paddingAngle={3}
                        strokeWidth={0}
                    >
                        {top.map((_, i) => (
                            <Cell
                                key={i}
                                fill={PALETTE_VARS[i % PALETTE_VARS.length]}
                                fillOpacity={0.9}
                            />
                        ))}
                        <LabelList
                            dataKey="name"
                            position="outside"
                            offset={12}
                            style={{ fontSize: 10, fill: "var(--color-muted-foreground)", fontFamily: "var(--font-mono)" }}
                            formatter={formatTick as any}
                        />
                    </Pie>
                    <ChartLegend
                        content={<ChartLegendContent nameKey="name" className="text-[10px] flex-wrap gap-x-4 gap-y-1.5 mt-2" />}
                    />
                </PieChart>
            </ChartContainer>
        );
    }

    return null;
};

export default ChartRendererComponent;
