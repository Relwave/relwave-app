import { useEffect, useMemo, useState } from "react";
import {
    Activity,
    CircleAlert,
    RefreshCw,
} from "lucide-react";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Spinner } from "@/components/ui/spinner";
import { useMonitoringStream } from "@/features/monitoring/hooks/useMonitoringStream";
import { formatDbType } from "@/lib/utils";
import { MonitoringDashboard } from "./MonitoringDashboard";
import { MonitoringLoadingState } from "./MonitoringLoadingState";

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

    const isInitialLoading = !data && !error && (isConnecting || isStreaming || state === "idle");

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

                {isInitialLoading ? (
                    <MonitoringLoadingState />
                ) : data ? (
                    <MonitoringDashboard data={data} history={history} statusTone={statusTone} />
                ) : null}
            </div>
        </div>
    );
}
