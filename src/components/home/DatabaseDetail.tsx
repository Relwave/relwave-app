import {
    Database,
    Clock,
    Table2,
    HardDrive,
    Zap,
    ExternalLink,
    MoreHorizontal,
    Trash2,
    CircleDot,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import {
    DropdownMenu,
    DropdownMenuContent,
    DropdownMenuItem,
    DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { cn } from "@/lib/utils";
import { DatabaseDetailProps } from "./types";
import { formatRelativeTime } from "./utils";

export function DatabaseDetail({
    database,
    isConnected,
    onTest,
    onOpen,
    onDelete,
    size,
    tables
}: DatabaseDetailProps) {
    return (
        <div className="h-full flex flex-col">
            {/* Detail Header */}
            <div className="p-6 border-b border-border/50">
                <div className="flex items-start justify-between">
                    <div className="flex items-center gap-4">
                        <div
                            className={cn(
                                "h-14 w-14 rounded-xl flex items-center justify-center",
                                database.type === "postgresql"
                                    ? "bg-blue-500/10"
                                    : "bg-orange-500/10"
                            )}
                        >
                            <Database
                                className={cn(
                                    "h-7 w-7",
                                    database.type === "postgresql"
                                        ? "text-blue-500"
                                        : "text-orange-500"
                                )}
                            />
                        </div>
                        <div>
                            <div className="flex items-center gap-2">
                                <h2 className="text-xl font-semibold">{database.name}</h2>
                                <span
                                    className={cn(
                                        "inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-medium",
                                        isConnected
                                            ? "bg-emerald-500/10 text-emerald-600 dark:text-emerald-400"
                                            : "bg-muted text-muted-foreground"
                                    )}
                                >
                                    <CircleDot className="h-2.5 w-2.5" />
                                    {isConnected ? "Connected" : "Offline"}
                                </span>
                            </div>
                            <p className="text-sm text-muted-foreground font-mono mt-0.5">
                                {database.host}:{database.port}/{database.database}
                            </p>
                        </div>
                    </div>
                    <div className="flex items-center gap-2">
                        <Button
                            variant="outline"
                            size="sm"
                            onClick={onTest}
                            className="h-8 text-xs"
                        >
                            <Zap className="h-3.5 w-3.5 mr-1.5" />
                            Test
                        </Button>
                        <Button
                            size="sm"
                            onClick={onOpen}
                            disabled={!isConnected}
                            className="h-8 text-xs"
                        >
                            <ExternalLink className="h-3.5 w-3.5 mr-1.5" />
                            Open
                        </Button>
                        <DropdownMenu>
                            <DropdownMenuTrigger asChild>
                                <Button variant="ghost" size="icon" className="h-8 w-8">
                                    <MoreHorizontal className="h-4 w-4" />
                                </Button>
                            </DropdownMenuTrigger>
                            <DropdownMenuContent align="end">
                                <DropdownMenuItem
                                    onClick={onDelete}
                                    className="text-destructive focus:text-destructive"
                                >
                                    <Trash2 className="h-3.5 w-3.5 mr-2" />
                                    Delete
                                </DropdownMenuItem>
                            </DropdownMenuContent>
                        </DropdownMenu>
                    </div>
                </div>
            </div>

            {/* Detail Content */}
            <div className="flex-1 p-6">
                {/* Stats Grid */}
                <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-8">
                    <div className="p-4 rounded-xl border border-border/50 bg-card">
                        <div className="flex items-center gap-2 text-muted-foreground mb-2">
                            <Database className="h-4 w-4" />
                            <span className="text-xs">Engine</span>
                        </div>
                        <p className="text-lg font-semibold capitalize font-mono">{database.type}</p>
                    </div>
                    <div className="p-4 rounded-xl border border-border/50 bg-card">
                        <div className="flex items-center gap-2 text-muted-foreground mb-2">
                            <Clock className="h-4 w-4" />
                            <span className="text-xs">Last Accessed</span>
                        </div>
                        <p className="text-lg font-semibold">
                            {formatRelativeTime(database.lastAccessedAt)}
                        </p>
                    </div>
                    <div className="p-4 rounded-xl border border-border/50 bg-card">
                        <div className="flex items-center gap-2 text-muted-foreground mb-2">
                            <Table2 className="h-4 w-4" />
                            <span className="text-xs">Tables</span>
                        </div>
                        <p className="text-lg font-semibold tabular-nums font-mono">{tables}</p>
                    </div>
                    <div className="p-4 rounded-xl border border-border/50 bg-card">
                        <div className="flex items-center gap-2 text-muted-foreground mb-2">
                            <HardDrive className="h-4 w-4" />
                            <span className="text-xs">Size</span>
                        </div>
                        <p className="text-lg font-semibold tabular-nums font-mono">{size}</p>
                    </div>
                </div>

                {/* Connection Details */}
                <div className="rounded-xl border border-border/50 bg-card overflow-hidden">
                    <div className="px-4 py-3 border-b border-border/50 bg-muted/30">
                        <h3 className="text-sm font-medium">Connection Details</h3>
                    </div>
                    <div className="p-4 space-y-3">
                        <div className="flex items-center justify-between py-2 border-b border-border/30">
                            <span className="text-sm text-muted-foreground">Host</span>
                            <span className="text-sm font-mono">{database.host}</span>
                        </div>
                        <div className="flex items-center justify-between py-2 border-b border-border/30">
                            <span className="text-sm text-muted-foreground">Port</span>
                            <span className="text-sm font-mono">{database.port}</span>
                        </div>
                        <div className="flex items-center justify-between py-2 border-b border-border/30">
                            <span className="text-sm text-muted-foreground">Database</span>
                            <span className="text-sm font-mono">{database.database}</span>
                        </div>
                        <div className="flex items-center justify-between py-2 border-b border-border/30">
                            <span className="text-sm text-muted-foreground">User</span>
                            <span className="text-sm font-mono">{database.user}</span>
                        </div>
                        <div className="flex items-center justify-between py-2">
                            <span className="text-sm text-muted-foreground">Created</span>
                            <span className="text-sm">
                                {new Date(database.createdAt).toLocaleDateString()}
                            </span>
                        </div>
                    </div>
                </div>
            </div>
        </div>
    );
}
