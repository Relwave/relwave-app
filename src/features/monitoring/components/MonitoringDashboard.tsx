import {
    CircleAlert,
    DatabaseZap,
    Gauge,
    Server,
    ShieldCheck,
} from "lucide-react";
import {
    CartesianGrid,
    Line,
    LineChart,
    ResponsiveContainer,
    Tooltip,
    XAxis,
    YAxis,
} from "recharts";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import { ScrollArea } from "@/components/ui/scroll-area";
import {
    Table,
    TableBody,
    TableCell,
    TableHead,
    TableHeader,
    TableRow,
} from "@/components/ui/table";
import { MonitoringSnapshot } from "@/features/database/types";
import { MetricCard } from "./MetricCard";
import { formatNumber } from "@/lib/formatNumber";
import { formatDuration } from "@/lib/formatDuration";


type ThroughputPoint = {
    time: string;
    qps: number;
    connections: number;
};

export function MonitoringDashboard({
    data,
    history,
    statusTone,
}: {
    data: MonitoringSnapshot;
    history: ThroughputPoint[];
    statusTone: string;
}) {
    return (
        <div className="space-y-4">
            {!data.health.ok && (
                <Alert variant="destructive">
                    <CircleAlert className="h-4 w-4" />
                    <AlertTitle>Database ping failed</AlertTitle>
                    <AlertDescription>{data.health.message || "The database did not respond to SELECT 1."}</AlertDescription>
                </Alert>
            )}

            <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
                <MetricCard
                    icon={ShieldCheck}
                    label="Health"
                    value={data.health.ok ? "Online" : "Offline"}
                    detail={data.health.latencyMs === null ? "No ping" : `${data.health.latencyMs} ms ping`}
                    valueClassName={statusTone}
                />
                <MetricCard
                    icon={Server}
                    label="Connections"
                    value={`${data.connections.active}/${data.connections.max || "-"}`}
                    detail={`${data.connections.usagePct}% of configured limit`}
                >
                    <Progress value={Math.min(data.connections.usagePct, 100)} className="mt-3 h-1.5" />
                </MetricCard>
                <MetricCard
                    icon={Gauge}
                    label="Throughput"
                    value={`${formatNumber(data.throughput.qps)} qps`}
                    detail={`${formatNumber(data.throughput.totalQueries)} total requests`}
                />
                <MetricCard
                    icon={DatabaseZap}
                    label={data.databaseType === "postgres" ? "Cache Hit" : "Buffer Hit"}
                    value={data.cacheHitRatio === null ? "N/A" : `${formatNumber(data.cacheHitRatio)}%`}
                    detail="Read efficiency"
                />
            </div>

            <div className="grid gap-4 xl:grid-cols-[minmax(0,1.4fr)_minmax(360px,0.8fr)]">
                <Card className="overflow-hidden rounded-lg border-border/50 bg-card/65 shadow-sm">
                    <CardHeader className="border-b border-border/30 pb-3">
                        <div className="flex items-center justify-between">
                            <div>
                                <CardTitle className="text-sm font-semibold">Throughput Timeline</CardTitle>
                                <CardDescription className="text-xs">Queries per second and active connections</CardDescription>
                            </div>
                            <Badge variant="secondary" className="font-mono text-[11px]">
                                {history.length} samples
                            </Badge>
                        </div>
                    </CardHeader>
                    <CardContent className="h-72 p-4">
                        <ResponsiveContainer width="100%" height="100%">
                            <LineChart data={history} margin={{ left: 0, right: 10, top: 10, bottom: 0 }}>
                                <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" opacity={0.35} />
                                <XAxis dataKey="time" tick={{ fontSize: 11 }} tickLine={false} axisLine={false} />
                                <YAxis tick={{ fontSize: 11 }} tickLine={false} axisLine={false} width={36} />
                                <Tooltip
                                    contentStyle={{
                                        background: "var(--popover)",
                                        border: "1px solid var(--border)",
                                        borderRadius: 8,
                                    }}
                                />
                                <Line type="monotone" dataKey="qps" stroke="var(--primary)" strokeWidth={2} dot={false} />
                                <Line type="monotone" dataKey="connections" stroke="#22c55e" strokeWidth={2} dot={false} />
                            </LineChart>
                        </ResponsiveContainer>
                    </CardContent>
                </Card>

                <Card className="overflow-hidden rounded-lg border-border/50 bg-card/65 shadow-sm">
                    <CardHeader className="border-b border-border/30 pb-3">
                        <CardTitle className="text-sm font-semibold">Active Queries</CardTitle>
                        <CardDescription className="text-xs">Non-idle requests currently reported by the database</CardDescription>
                    </CardHeader>
                    <CardContent className="p-0">
                        <ScrollArea className="h-72">
                            <Table>
                                <TableHeader>
                                    <TableRow className="bg-muted/35 hover:bg-muted/35">
                                        <TableHead className="w-18">Time</TableHead>
                                        <TableHead>User</TableHead>
                                        <TableHead>State</TableHead>
                                        <TableHead>Query</TableHead>
                                    </TableRow>
                                </TableHeader>
                                <TableBody>
                                    {data.activeQueries.length === 0 ? (
                                        <TableRow>
                                            <TableCell colSpan={4} className="h-36 text-center text-xs text-muted-foreground">
                                                No active database requests
                                            </TableCell>
                                        </TableRow>
                                    ) : (
                                        data.activeQueries.map((query) => (
                                            <TableRow key={`${query.id}-${query.durationSeconds}`}>
                                                <TableCell className="text-xs font-mono">
                                                    {formatDuration(query.durationSeconds)}
                                                </TableCell>
                                                <TableCell className="max-w-24 truncate text-xs">{query.user || "-"}</TableCell>
                                                <TableCell>
                                                    <Badge variant="outline" className="text-[10px]">
                                                        {query.state || "active"}
                                                    </Badge>
                                                </TableCell>
                                                <TableCell className="max-w-80 truncate font-mono text-xs" title={query.query}>
                                                    {query.query || "-"}
                                                </TableCell>
                                            </TableRow>
                                        ))
                                    )}
                                </TableBody>
                            </Table>
                        </ScrollArea>
                    </CardContent>
                </Card>
            </div>
        </div>
    );
}
