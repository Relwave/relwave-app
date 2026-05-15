import { useEffect } from "react";
import { Radar, Plus, Container, Monitor, RefreshCw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { useDiscoveredDatabases } from "@/features/database/hooks/useDiscoveredDatabases";
import { DiscoveredDatabase } from "@/features/database/types";
import { Card, CardAction, CardContent, CardDescription, CardTitle } from "@/components/ui/card";

interface DiscoveredDatabasesCardProps {
    onAddDatabase: (db: DiscoveredDatabase) => void;
}

const DB_TYPE_COLORS = {
    postgresql: {
        bg: "bg-blue-500/10",
        text: "text-blue-500",
        border: "border-blue-500/20",
    },
    mysql: {
        bg: "bg-orange-500/10",
        text: "text-orange-500",
        border: "border-orange-500/20",
    },
    mariadb: {
        bg: "bg-teal-500/10",
        text: "text-teal-500",
        border: "border-teal-500/20",
    },
    sqlite: {
        bg: "bg-cyan-500/10",
        text: "text-cyan-500",
        border: "border-cyan-500/20",
    },
};

export function DiscoveredDatabasesCard({
    onAddDatabase,
}: DiscoveredDatabasesCardProps) {
    const { databases, isScanning, scan, lastScanned } = useDiscoveredDatabases();

    // Auto-scan on mount
    useEffect(() => {
        scan();
    }, [scan]);

    // Don't render if no databases found and not scanning
    if (!isScanning && databases.length === 0) {
        return null;
    }

    return (
        <div className="mb-6">
            <div className="flex items-center justify-between mb-3">
                <div className="flex items-center gap-2">
                    <Radar className="h-4 w-4 text-muted-foreground" />
                    <h2 className="text-sm font-medium">Detected Databases</h2>
                    {databases.length > 0 && (
                        <span className="text-xs text-muted-foreground bg-muted px-2 py-0.5 rounded-full">
                            {databases.length} found
                        </span>
                    )}
                </div>
                <Button
                    variant="ghost"
                    size="sm"
                    onClick={scan}
                    disabled={isScanning}
                    className="h-7 gap-1.5 text-xs"
                >
                    <RefreshCw className={cn("h-3 w-3", isScanning && "animate-spin")} />
                    {isScanning ? "Scanning..." : "Rescan"}
                </Button>
            </div>

            {isScanning && databases.length === 0 ? (
                <div className="rounded-lg border border-border/50 bg-card/80 p-8 flex flex-col items-center justify-center shadow-sm">
                    <div className="h-8 w-8 border-2 border-primary/30 border-t-primary rounded-full animate-spin mb-3" />
                    <p className="text-sm text-muted-foreground">
                        Scanning local ports...
                    </p>
                </div>
            ) : (
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
                    {databases.map((db, index) => {
                        const colors = DB_TYPE_COLORS[db.type] || DB_TYPE_COLORS.postgresql;
                        return (
                            <Card
                                key={`${db.host}:${db.port}-${index}`}
                                className={cn(
                                    "group relative rounded-lg border bg-card/85 p-4 premium-card",
                                    colors.border
                                )}
                            >
                                <div className="flex items-start gap-3">
                                    {/* Database Icon */}
                                    <CardAction
                                        className={cn(
                                            "h-10 w-10 rounded-lg flex items-center justify-center shrink-0",
                                            colors.bg
                                        )}
                                    >
                                        {db.source === "docker" ? (
                                            <Container className={cn("h-5 w-5", colors.text)} />
                                        ) : (
                                            <Monitor className={cn("h-5 w-5", colors.text)} />
                                        )}
                                    </CardAction>

                                    {/* Details */}
                                    <CardContent className="flex-1 min-w-0">
                                        <div className="flex items-center gap-2 mb-1">
                                            <CardTitle
                                                className={cn(
                                                    "text-xs font-medium uppercase tracking-wide",
                                                    colors.text
                                                )}
                                            >
                                                {db.type}
                                            </CardTitle>
                                            <CardDescription
                                                className={cn(
                                                    "text-[10px] px-1.5 py-0.5 rounded-full",
                                                    db.source === "docker"
                                                        ? "bg-purple-500/10 text-purple-500"
                                                        : "bg-green-500/10 text-green-500"
                                                )}
                                            >
                                                {db.source === "docker" ? "Docker" : "Local"}
                                            </CardDescription>
                                        </div>

                                        <CardDescription className="font-mono text-xs text-muted-foreground truncate">
                                            {db.host}:{db.port}
                                        </CardDescription>

                                        {db.containerName && (
                                            <CardDescription className="text-[10px] text-muted-foreground/70 truncate mt-0.5">
                                                Container: {db.containerName}
                                            </CardDescription>
                                        )}

                                        <CardDescription className="text-xs text-muted-foreground mt-1">
                                            Suggested: <span className="font-medium">{db.suggestedName}</span>
                                        </CardDescription>
                                    </CardContent>

                                    {/* Add Button */}
                                    <Button
                                        variant="ghost"
                                        size="icon"
                                        className="h-8 w-8 shrink-0 opacity-0 group-hover:opacity-100 transition-opacity"
                                        onClick={() => onAddDatabase(db)}
                                        title="Add this connection"
                                    >
                                        <Plus className="h-4 w-4" />
                                    </Button>
                                </div>
                            </Card>
                        );
                    })}
                </div>
            )}

            {lastScanned && !isScanning && (
                <CardDescription className="text-[10px] text-muted-foreground/50 mt-2 text-right">
                    Last scanned: {lastScanned.toLocaleTimeString()}
                </CardDescription>
            )}
        </div>
    );
}
