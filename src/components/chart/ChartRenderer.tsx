import { BarChart3 } from 'lucide-react';
import React from 'react';
import {
    BarChart, Bar, LineChart, Line, PieChart, Pie, ScatterChart, Scatter,
    XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer, Cell,
} from "recharts";

// Adjusted COLORS for a vibrant, yet professional palette, optimized for light/dark contrast
const COLORS = ["#06B6D4", "#A855F7", "#10B981", "#F59E0B", "#EF4444", "#52525B"]; // Cyan, Violet, Emerald, Amber, Red, Gray

interface ChartRendererProps {
    chartType: "bar" | "line" | "pie" | "scatter";
    xAxis: string;
    yAxis: string;
    data: Array<Record<string, any>>;
}

export const ChartRenderer: React.FC<ChartRendererProps> = ({
    chartType,
    xAxis,
    yAxis,
    data,
}) => {
    if (!xAxis || !yAxis) {
        return (
            <div className="flex flex-col items-center justify-center h-[400px] text-muted-foreground">
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

    // Dynamically set Recharts theme based on the presence of the 'dark' class on the body
    const isDarkMode = document.body.classList.contains('dark');

    const rechartsTheme = {
        stroke: isDarkMode ? "#E5E7EB" : "#1F2937", // Axes/Tick color
        gridStroke: isDarkMode ? "#374151" : "#E5E7EB", // Grid line color
        tooltipBg: isDarkMode ? "#1F2937" : "#FFFFFF", // Tooltip background
        tooltipBorder: isDarkMode ? "#4B5563" : "#D1D5DB", // Tooltip border
        lineStroke: COLORS[0], // Primary color for lines/bars
    };

    const tooltipStyle = {
        backgroundColor: rechartsTheme.tooltipBg,
        border: `1px solid ${rechartsTheme.tooltipBorder}`,
        borderRadius: "8px",
        color: rechartsTheme.stroke,
    };

    const axisProps = {
        stroke: rechartsTheme.stroke,
        tick: { fill: rechartsTheme.stroke },
    };

    switch (chartType) {
        case "bar":
            return (
                <ResponsiveContainer width="100%" height={400}>
                    <BarChart data={chartData} margin={{ top: 20, right: 30, left: 20, bottom: 20 }}>
                        <CartesianGrid strokeDasharray="3 3" stroke={rechartsTheme.gridStroke} />
                        <XAxis dataKey="x" {...axisProps} />
                        <YAxis {...axisProps} />
                        <Tooltip contentStyle={tooltipStyle} />
                        <Legend wrapperStyle={{ color: rechartsTheme.stroke, paddingTop: '10px' }} />
                        <Bar dataKey="y" name={yAxis}>
                            {chartData.map((_entry, index) => (
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
                        <XAxis dataKey="x" {...axisProps} />
                        <YAxis {...axisProps} />
                        <Tooltip contentStyle={tooltipStyle} />
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
                            label={({ x, percent = 0 }) => `${x} (${(percent * 100).toFixed(0)}%)`}
                            outerRadius={120}
                            dataKey="y"
                        >
                            {chartData.map((_entry, index) => (
                                <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} stroke={rechartsTheme.tooltipBg} strokeWidth={3} />
                            ))}
                        </Pie>
                        <Tooltip contentStyle={tooltipStyle} />
                        <Legend wrapperStyle={{ color: rechartsTheme.stroke, paddingTop: '10px' }} />
                    </PieChart>
                </ResponsiveContainer>
            );

        case "scatter":
            return (
                <ResponsiveContainer width="100%" height={400}>
                    <ScatterChart data={chartData} margin={{ top: 20, right: 30, left: 20, bottom: 20 }}>
                        <CartesianGrid strokeDasharray="3 3" stroke={rechartsTheme.gridStroke} />
                        <XAxis dataKey="x" {...axisProps} />
                        <YAxis dataKey="y" {...axisProps} />
                        <Tooltip contentStyle={tooltipStyle} />
                        <Legend wrapperStyle={{ color: rechartsTheme.stroke, paddingTop: '10px' }} />
                        <Scatter name={yAxis} data={chartData} fill={rechartsTheme.lineStroke} />
                    </ScatterChart>
                </ResponsiveContainer>
            );

        default:
            return null;
    }
};