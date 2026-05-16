import type * as React from "react";
import { useEffect, useMemo, useState } from "react";
import {
    Activity,
    CircleAlert,
    Clock3,
    DatabaseZap,
    Gauge,
    RefreshCw,
    Server,
    ShieldCheck,
    TimerReset,
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
import { Button } from "@/components/ui/button";
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
import { Spinner } from "@/components/ui/spinner";
import { MonitoringSnapshot } from "@/features/database/types";
import { useMonitoringStream } from "@/features/monitoring/hooks/useMonitoringStream";
import { cn } from "@/lib/utils";

interface MonitoringPanelProps {
    dbId: string;
    databaseName: string;
    databaseType?: string;
}

type ThroughputPoint = {
    time: string;
    qps: number;
    connections: number;
};

function isMonitoringSupported(databaseType?: string) {
    const type = databaseType?.toLowerCase();
    return type === "postgres" || type === "postgresql" || type === "mysql" || type === "mariadb";
}

function formatNumber(value: number) {
    return new Intl.NumberFormat(undefined, { maximumFractionDigits: 2 }).format(value);
}

function formatDuration(seconds: number) {
    if (seconds < 60) return `${Math.round(seconds)}s`;
    const minutes = Math.floor(seconds / 60);
    const remaining = Math.round(seconds % 60);
    return `${minutes}m ${remaining}s`;
}

function formatDbType(databaseType?: string) {
    if (!databaseType) return "Database";
    if (databaseType === "postgres" || databaseType === "postgresql") return "PostgreSQL";
    if (databaseType === "mysql") return "MySQL";
    if (databaseType === "mariadb") return "MariaDB";
    return databaseType;
}

export function MonitoringPanel({ dbId, databaseName, databaseType }: MonitoringPanelProps) {
    const supported = isMonitoringSupported(databaseType);
    const {
        snapshot: data,
        error,
        isConnecting,
        isStreaming,
        refreshOnce,
        state,
    } = useMonitoringStream(dbId, supported);
    const [history, setHistory] = useState<ThroughputPoint[]>([]);

    useEffect(() => {
        if (!data?.sampledAt) return;

        setHistory((current) => {
            const time = new Date(data.sampledAt).toLocaleTimeString([], {
                hour: "2-digit",
                minute: "2-digit",
                second: "2-digit",
            });
            const nextPoint = {
                time,
                qps: data.throughput.qps,
                connections: data.connections.active,
            };

            if (current[current.length - 1]?.time === nextPoint.time) return current;
            return [...current.slice(-29), nextPoint];
        });
    }, [data?.sampledAt]);

    const statusTone = useMemo(() => {
        if (!data?.health.ok) return "text-destructive";
        if (data.connections.usagePct >= 85) return "text-amber-500";
        return "text-emerald-500";
    }, [data]);

    if (!supported) {
        return (
            <div className="h-full min-h-0 p-4">
                <div className="h-full rounded-lg border border-border/50 bg-card/55 p-6 shadow-sm">
                    <Alert>
                        <CircleAlert className="h-4 w-4" />
                        <AlertTitle>Monitoring unavailable</AlertTitle>
                        <AlertDescription>
                            Live monitoring is available for PostgreSQL, MySQL, and MariaDB connections only.
                        </AlertDescription>
                    </Alert>
                </div>
            </div>
        );
    }

    return (
        <div className="h-full min-h-0 min-w-0 flex flex-col overflow-hidden bg-transparent">
            <header className="shrink-0 border-b border-border/30 bg-background/80 px-6 py-3 backdrop-blur-xl">
                <div className="flex min-w-0 items-center justify-between gap-4">
                    <div className="min-w-0">
                        <div className="flex items-center gap-2">
                            <Activity className="h-4 w-4 text-primary" />
                            <h1 className="truncate text-lg font-semibold tracking-tight">Monitoring</h1>
                            <Badge variant="outline" className="h-6 font-mono text-[11px]">
                                {formatDbType(databaseType)}
                            </Badge>
                        </div>
                        <p className="truncate text-xs text-muted-foreground">
                            {databaseName} live health, throughput, connections, and cache metrics over WebSocket
                        </p>
                    </div>
                    <Badge variant={isStreaming ? "secondary" : "outline"} className="hidden h-6 shrink-0 text-[11px] sm:inline-flex">
                        {isStreaming ? "WS connected" : state === "connecting" ? "Connecting" : "WS offline"}
                    </Badge>
                    <Button
                        variant="outline"
                        size="sm"
                        onClick={() => refreshOnce()}
                        disabled={isConnecting}
                        className="shrink-0 text-xs"
                    >
                        {isConnecting ? <Spinner className="h-3.5 w-3.5" /> : <RefreshCw className="h-3.5 w-3.5" />}
                        Refresh
                    </Button>
                </div>
            </header>

            <div className="flex-1 min-h-0 overflow-y-auto p-4">
                {error && (
                    <Alert variant="destructive" className="mb-4">
                        <CircleAlert className="h-4 w-4" />
                        <AlertTitle>Monitoring stream failed</AlertTitle>
                        <AlertDescription>{error}</AlertDescription>
                    </Alert>
                )}

                {isConnecting && !data ? (
                    <div className="flex h-full items-center justify-center">
                        <Spinner className="h-8 w-8" />
                    </div>
                ) : data ? (
                    <MonitoringDashboard data={data} history={history} statusTone={statusTone} />
                ) : null}
            </div>
        </div>
    );
}

function MonitoringDashboard({
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

function MetricCard({
    icon: Icon,
    label,
    value,
    detail,
    valueClassName,
    children,
}: {
    icon: typeof Activity;
    label: string;
    value: string;
    detail: string;
    valueClassName?: string;
    children?: React.ReactNode;
}) {
    return (
        <Card className="rounded-lg border-border/50 bg-card/65 shadow-sm">
            <CardHeader className="flex flex-row items-start justify-between gap-3 pb-2">
                <div className="space-y-1">
                    <CardDescription className="text-xs">{label}</CardDescription>
                    <CardTitle className={cn("text-2xl font-semibold tracking-tight", valueClassName)}>
                        {value}
                    </CardTitle>
                </div>
                <div className="rounded-md border border-border/50 bg-background/60 p-2">
                    <Icon className="h-4 w-4 text-muted-foreground" />
                </div>
            </CardHeader>
            <CardContent>
                <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
                    {label === "Throughput" ? <TimerReset className="h-3.5 w-3.5" /> : <Clock3 className="h-3.5 w-3.5" />}
                    {detail}
                </div>
                {children}
            </CardContent>
        </Card>
    );
}
