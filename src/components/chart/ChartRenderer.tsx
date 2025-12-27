

// Enhanced color palette with vibrant gradients


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
import { memo, useMemo } from "react";
import {
    ResponsiveContainer,
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
    Tooltip,
    CartesianGrid,
    Legend,
    Cell,
} from "recharts";

const COLORS = [
    "#06B6D4",
    "#A855F7",
    "#10B981",
    "#F59E0B",
    "#EF4444",
    "#3B82F6",
    "#EC4899",
    "#8B5CF6"
];

// ====================
// OPTIMIZED RENDERER
// ====================
const ChartRendererComponent = ({
    chartType,
    xAxis,
    yAxis,
    data,
}: ChartRendererProps) => {

    // ---- memoize heavy transforms ----
    const chartData = useMemo(() => {
        if (!data || !Array.isArray(data) || !xAxis) return [];

        return data.map((item) => ({
            name: item[xAxis] != null ? String(item[xAxis]) : "N/A",
            value: Number(item.count ?? item.COUNT ?? item.Count ?? 0) || 0,
        }));
    }, [data, xAxis]);


    // ---- shared axis + tooltip styles ----
    const isDark = typeof document !== "undefined" && document.body.classList.contains("dark");

    const axisProps = useMemo(
        () => ({
            stroke: isDark ? "#e5e7eb" : "#111827",
            tick: { fill: isDark ? "#e5e7eb" : "#111827", fontSize: 12 },
        }),
        [isDark]
    );

    const tooltipStyle = useMemo(
        () => ({
            backgroundColor: isDark ? "#1F2937" : "#FFFFFF",
            borderRadius: 8,
            border: `1px solid ${COLORS[0]}`,
            padding: "8px 10px",
            color: isDark ? "#ffffff" : "#111827",
        }),
        [isDark]
    );

    if (!xAxis || chartData.length === 0) {
        return (
            <div className="flex items-center justify-center h-[350px] text-muted-foreground">
                Select X & Y axes to generate chart
            </div>
        );
    }

    // =====================
    // BAR CHART
    // =====================
    if (chartType === "bar") {
        return (
            <ResponsiveContainer width="100%" height={380}>
                <BarChart data={chartData}>
                    <CartesianGrid strokeDasharray="3 3" opacity={0.3} />
                    <XAxis dataKey="name" {...axisProps} />
                    <YAxis {...axisProps} />
                    <Tooltip contentStyle={tooltipStyle} />
                    <Legend />
                    <Bar dataKey="value" radius={[6, 6, 0, 0]}>
                        {chartData.map((_, i) => (
                            <Cell key={i} fill={COLORS[i % COLORS.length]} />
                        ))}
                    </Bar>
                </BarChart>
            </ResponsiveContainer>
        );
    }

    // =====================
    // LINE CHART
    // =====================
    if (chartType === "line") {
        return (
            <ResponsiveContainer width="100%" height={380}>
                <LineChart data={chartData}>
                    <CartesianGrid strokeDasharray="3 3" opacity={0.3} />
                    <XAxis dataKey="name" {...axisProps} />
                    <YAxis {...axisProps} />
                    <Tooltip contentStyle={tooltipStyle} />
                    <Legend />
                    <Line
                        dataKey="value"
                        stroke={COLORS[0]}
                        strokeWidth={2.5}
                        dot={{ r: 4 }}
                        activeDot={{ r: 6 }}
                        type="monotone"
                    />
                </LineChart>
            </ResponsiveContainer>
        );
    }

    // =====================
    // PIE CHART
    // =====================
    if (chartType === "pie") {
        return (
            <ResponsiveContainer width="100%" height={380}>
                <PieChart>
                    <Pie
                        data={chartData}
                        dataKey="value"
                        cx="50%"
                        cy="50%"
                        outerRadius={140}
                        innerRadius={50}
                        label={({ name, percent }) =>
                            `${name} (${((percent ?? 0) * 100).toFixed(0)}%)`
                        }
                    >
                        {chartData.map((_, i) => (
                            <Cell key={i} fill={COLORS[i % COLORS.length]} />
                        ))}
                    </Pie>
                    <Tooltip contentStyle={tooltipStyle} />
                    <Legend />
                </PieChart>
            </ResponsiveContainer>
        );
    }

    // =====================
    // SCATTER CHART
    // =====================
    if (chartType === "scatter") {
        return (
            <ResponsiveContainer width="100%" height={380}>
                <ScatterChart>
                    <CartesianGrid strokeDasharray="3 3" opacity={0.3} />
                    <XAxis dataKey="name" {...axisProps} />
                    <YAxis dataKey="value" {...axisProps} />
                    <Tooltip contentStyle={tooltipStyle} />
                    <Legend />
                    <Scatter data={chartData} fill={COLORS[0]} />
                </ScatterChart>
            </ResponsiveContainer>
        );
    }

    return null;
};

export const ChartRenderer = memo(ChartRendererComponent);
