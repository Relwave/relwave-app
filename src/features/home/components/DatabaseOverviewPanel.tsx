import { Card, CardAction, CardContent, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";
import { Clock, Database, HardDrive, Table2, Layers, GitBranch, FileCode2 } from "lucide-react";
import { formatRelativeTime } from "../utils";
import { DatabaseConnection } from "@/features/database/types";
import { ConnectionDetails } from "./ConnectionDetails";


interface DatabaseOverviewPanelProps {
    database: DatabaseConnection;
    tables: number | string | undefined;
    size: string | number | undefined;
    // Project data props
    schemaCount?: number;
    hasERLayout?: boolean;
    queryCount?: number;
}


export function DatabaseOverviewPanel({
    database,
    size,
    tables,
    schemaCount,
    hasERLayout,
    queryCount,
}: DatabaseOverviewPanelProps) {
    return (

        <div className="flex-1 p-6">
            {/* Stats Grid */}
            <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-8">
                <Card className="@container/card">
                    <CardHeader className="flex flex-row items-center justify-between text-xs">
                        <span>Engine</span>
                        <CardAction className="flex items-center gap-2 text-muted-foreground">
                            <Database className="h-4 w-4" />
                        </CardAction>
                    </CardHeader>

                    <CardContent className="text-lg font-semibold capitalize font-mono">
                        {database.type}
                    </CardContent>
                </Card>
                <Card className="@container/card">
                    <CardHeader className="flex flex-row items-center justify-between text-xs">
                        <span>Last Accessed</span>
                        <CardAction className="flex items-center gap-2 text-muted-foreground">
                            <Clock className="h-4 w-4" />
                        </CardAction>
                    </CardHeader>
                    <CardContent className="text-lg font-semibold">
                        {formatRelativeTime(database.lastAccessedAt)}
                    </CardContent>
                </Card>
                <Card className="@container/card">
                    <CardHeader className="flex flex-row items-center justify-between text-xs">
                        <span className="text-xs">Tables</span>
                        <CardAction className="flex items-center gap-2 text-muted-foreground">
                            <Table2 className="h-4 w-4" />
                        </CardAction>
                    </CardHeader>
                    <CardContent className="text-lg font-semibold">
                        {tables}
                    </CardContent>
                </Card>
                <Card className="@container/card">
                    <CardHeader className="flex flex-row items-center justify-between text-xs">
                        <span className="text-xs">Size</span>
                        <CardAction className="flex items-center gap-2 text-muted-foreground">
                            <HardDrive className="h-4 w-4" />
                        </CardAction>
                    </CardHeader>
                    <CardContent className="text-lg font-semibold">
                        {size}
                    </CardContent>
                </Card>
            </div>

            {/* Project Data */}
            <h3 className="text-sm font-semibold mb-4">Project Data</h3>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-8">
                <Card className="@container/card">
                    <CardHeader className="flex items-center gap-3 mb-3">
                        <CardAction className="h-9 w-9 rounded-lg bg-violet-500/10 flex items-center justify-center">
                            <Layers className="h-4.5 w-4.5 text-violet-500" />
                        </CardAction>
                        <CardTitle className="text-sm font-medium">Schema Cache</CardTitle>
                    </CardHeader>
                    <CardContent className="text-2xl font-bold tabular-nums font-mono">
                        {schemaCount ?? "—"}
                    </CardContent>
                    <CardFooter className="text-xs text-muted-foreground mt-1">
                        Cached schemas
                    </CardFooter>
                </Card>

                <Card className="@container/card">
                    <CardHeader className="flex items-center gap-3 mb-3">
                        <CardAction className="h-9 w-9 rounded-lg bg-emerald-500/10 flex items-center justify-center">
                            <GitBranch className="h-4.5 w-4.5 text-emerald-500" />
                        </CardAction>
                        <CardTitle className="text-sm font-medium">ER Diagram</CardTitle>
                    </CardHeader>
                    <CardContent className="text-2xl font-bold tabular-nums font-mono">
                        {hasERLayout ? "Saved" : "—"}
                    </CardContent>
                    <CardFooter className="text-xs text-muted-foreground mt-1">
                        Diagram layout
                    </CardFooter>
                </Card>

                <Card className="@container/card">
                    <CardHeader className="flex items-center gap-3 mb-3">
                        <CardAction className="h-9 w-9 rounded-lg bg-amber-500/10 flex items-center justify-center">
                            <FileCode2 className="h-4.5 w-4.5 text-amber-500" />
                        </CardAction>
                        <CardTitle className="text-sm font-medium">Saved Queries</CardTitle>
                    </CardHeader>
                    <CardContent className="text-2xl font-bold tabular-nums font-mono">
                        {queryCount ?? "—"}
                    </CardContent>
                    <CardFooter className="text-xs text-muted-foreground mt-1">
                        Stored queries
                    </CardFooter>
                </Card>
            </div>

            {/* Connection Details */}
            <ConnectionDetails database={database} />
        </div>

    );
}