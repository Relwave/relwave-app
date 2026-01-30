import { useState } from "react";
import { CheckCircle2, Clock, AlertCircle, Database, Play, Undo2, Trash2, Eye, RefreshCw } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { ScrollArea } from "@/components/ui/scroll-area";
import { LocalMigration, AppliedMigration, MigrationsData } from "@/types/database";
import { cn } from "@/lib/utils";
import { useQueryClient } from "@tanstack/react-query";
import { bridgeApi } from "@/services/bridgeApi";
import { toast } from "sonner";

interface MigrationsPanelProps {
    migrations: MigrationsData;
    baselined: boolean;
    dbId: string;
}

export default function MigrationsPanel({ migrations, baselined, dbId }: MigrationsPanelProps) {
    const { local, applied } = migrations;
    const queryClient = useQueryClient();
    const [selectedMigration, setSelectedMigration] = useState<{ version: string; name: string } | null>(null);
    const [showSQLDialog, setShowSQLDialog] = useState(false);
    const [sqlContent, setSqlContent] = useState<{ up: string; down: string } | null>(null);
    const [isRefreshing, setIsRefreshing] = useState(false);

    const handleRefresh = async () => {
        setIsRefreshing(true);
        try {
            await Promise.all([
                queryClient.invalidateQueries({ queryKey: ["migrations", dbId] }),
                queryClient.invalidateQueries({ queryKey: ["tables", dbId] }),
                queryClient.invalidateQueries({ queryKey: ["schema", dbId] }),
                queryClient.invalidateQueries({ queryKey: ["schemaNames", dbId] }),
            ]);
            toast.success("Refreshed successfully");
        } finally {
            setIsRefreshing(false);
        }
    };

    // Merge and sort migrations
    const appliedVersions = new Set(applied.map((m) => m.version));

    const allMigrations = [
        ...applied.map((m) => ({
            version: m.version,
            name: m.name,
            status: "applied" as const,
            appliedAt: m.applied_at,
            checksum: m.checksum,
        })),
        ...local
            .filter((m) => !appliedVersions.has(m.version))
            .map((m) => ({
                version: m.version,
                name: m.name,
                status: "pending" as const,
            })),
    ].sort((a, b) => a.version.localeCompare(b.version));

    const handleApply = async (version: string, name: string) => {
        try {
            await bridgeApi.applyMigration(dbId, version);
            toast.success("Migration applied successfully", {
                description: `Applied migration: ${name}`,
            });
            // Invalidate migrations query to refresh
            queryClient.invalidateQueries({ queryKey: ["migrations", dbId] });
            queryClient.invalidateQueries({ queryKey: ["tables", dbId] });
            queryClient.invalidateQueries({ queryKey: ["schema", dbId] });
        } catch (error: any) {
            toast.error("Failed to apply migration", {
                description: error.message,
            });
        }
    };

    const handleRollback = async (version: string, name: string) => {
        try {
            await bridgeApi.rollbackMigration(dbId, version);
            toast.success("Migration rolled back successfully", {
                description: `Rolled back migration: ${name}`,
            });
            queryClient.invalidateQueries({ queryKey: ["migrations", dbId] });
            queryClient.invalidateQueries({ queryKey: ["tables", dbId] });
            queryClient.invalidateQueries({ queryKey: ["schema", dbId] });
        } catch (error: any) {
            toast.error("Failed to rollback migration", {
                description: error.message,
            });
        }
    };

    const handleDelete = async (version: string, name: string) => {
        try {
            await bridgeApi.deleteMigration(dbId, version);
            toast.success("Migration deleted successfully", {
                description: `Deleted migration: ${name}`,
            });
            queryClient.invalidateQueries({ queryKey: ["migrations", dbId] });
        } catch (error: any) {
            toast.error("Failed to delete migration", {
                description: error.message,
            });
        }
    };

    const handleViewSQL = async (version: string, name: string) => {
        try {
            const sql = await bridgeApi.getMigrationSQL(dbId, version);
            setSqlContent(sql);
            setSelectedMigration({ version, name });
            setShowSQLDialog(true);
        } catch (error: any) {
            toast.error("Failed to load migration SQL", {
                description: error.message,
            });
        }
    };

    return (
        <>
            <Card className="h-full flex flex-col border-border/50">
                <CardHeader className="border-b border-border/50 pb-4">
                    <div className="flex items-center justify-between">
                        <CardTitle className="text-base font-semibold flex items-center gap-2">
                            <Database className="h-4 w-4" />
                            Migrations
                        </CardTitle>
                        <Badge variant={baselined ? "default" : "secondary"} className="text-xs">
                            {baselined ? "Baselined" : "Not Baselined"}
                        </Badge>
                        <Button
                            variant="ghost"
                            size="icon"
                            className="h-7 w-7"
                            onClick={handleRefresh}
                            disabled={isRefreshing}
                        >
                            <RefreshCw className={cn("h-3.5 w-3.5", isRefreshing && "animate-spin")} />
                        </Button>
                    </div>
                    <p className="text-xs text-muted-foreground mt-1">
                        Schema version control and migration status
                    </p>
                </CardHeader>

                <CardContent className="flex-1 p-0 overflow-hidden">
                    <ScrollArea className="h-full">
                        <div className="p-4 space-y-3">
                            {/* Summary Stats */}
                            <div className="grid grid-cols-2 gap-3 mb-4">
                                <div className="bg-muted/30 rounded-lg p-3 border border-border/30">
                                    <div className="text-xs text-muted-foreground mb-1">Applied</div>
                                    <div className="text-2xl font-bold text-foreground">
                                        {applied.length}
                                    </div>
                                </div>
                                <div className="bg-muted/30 rounded-lg p-3 border border-border/30">
                                    <div className="text-xs text-muted-foreground mb-1">Pending</div>
                                    <div className="text-2xl font-bold text-foreground">
                                        {local.length - applied.length}
                                    </div>
                                </div>
                            </div>

                            {/* Migrations List */}
                            {allMigrations.length === 0 ? (
                                <div className="text-center py-12">
                                    <Database className="h-12 w-12 mx-auto mb-3 text-muted-foreground/30" />
                                    <p className="text-sm text-muted-foreground">No migrations found</p>
                                    <p className="text-xs text-muted-foreground/70 mt-1">
                                        {baselined ? "Database has been baselined" : "Create your first migration"}
                                    </p>
                                </div>
                            ) : (
                                <div className="space-y-2">
                                    {allMigrations.map((migration) => (
                                        <MigrationItem
                                            key={migration.version}
                                            migration={migration}
                                            onApply={handleApply}
                                            onRollback={handleRollback}
                                            onDelete={handleDelete}
                                            onViewSQL={handleViewSQL}
                                        />
                                    ))}
                                </div>
                            )}
                        </div>
                    </ScrollArea>
                </CardContent>
            </Card>

            {/* SQL View Dialog - Simple for now */}
            {showSQLDialog && sqlContent && selectedMigration && (
                <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50" onClick={() => setShowSQLDialog(false)}>
                    <div className="bg-background border border-border rounded-lg p-6 max-w-3xl w-full mx-4 max-h-[80vh] overflow-auto" onClick={(e) => e.stopPropagation()}>
                        <h3 className="text-lg font-semibold mb-4">Migration SQL: {selectedMigration.name}</h3>
                        <div className="space-y-4">
                            <div>
                                <h4 className="text-sm font-medium mb-2 text-green-600">↑ UP (Apply)</h4>
                                <pre className="bg-muted p-3 rounded text-xs overflow-auto">{sqlContent.up}</pre>
                            </div>
                            <div>
                                <h4 className="text-sm font-medium mb-2 text-orange-600">↓ DOWN (Rollback)</h4>
                                <pre className="bg-muted p-3 rounded text-xs overflow-auto">{sqlContent.down}</pre>
                            </div>
                        </div>
                        <Button className="mt-4" onClick={() => setShowSQLDialog(false)}>Close</Button>
                    </div>
                </div>
            )}
        </>
    );
}

// Migration Item Component
interface MigrationItemProps {
    migration: {
        version: string;
        name: string;
        status: "applied" | "pending";
        appliedAt?: string;
        checksum?: string;
    };
    onApply: (version: string, name: string) => void;
    onRollback: (version: string, name: string) => void;
    onDelete: (version: string, name: string) => void;
    onViewSQL: (version: string, name: string) => void;
}

function MigrationItem({ migration, onApply, onRollback, onDelete, onViewSQL }: MigrationItemProps) {
    const isBaseline = migration.name?.includes("baseline");

    return (
        <div
            className={cn(
                "border rounded-lg p-3 transition-colors",
                migration.status === "applied"
                    ? "border-green-500/30 bg-green-500/5"
                    : "border-orange-500/30 bg-orange-500/5"
            )}
        >
            <div className="flex items-start justify-between gap-3 mb-2">
                <div className="flex items-start gap-2 flex-1 min-w-0">
                    {/* Status Icon */}
                    <div className="mt-0.5 shrink-0">
                        {migration.status === "applied" ? (
                            <CheckCircle2 className="h-4 w-4 text-green-600 dark:text-green-400" />
                        ) : (
                            <Clock className="h-4 w-4 text-orange-600 dark:text-orange-400" />
                        )}
                    </div>

                    {/* Migration Info */}
                    <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 mb-1">
                            <span className="font-mono text-xs font-semibold text-foreground">
                                {migration.version}
                            </span>
                            {isBaseline && (
                                <Badge variant="outline" className="text-xs px-1.5 py-0">
                                    <AlertCircle className="h-3 w-3 mr-1" />
                                    Baseline
                                </Badge>
                            )}
                        </div>
                        <p className="text-xs text-muted-foreground truncate">
                            {migration.name}
                        </p>
                        {migration.appliedAt && (
                            <p className="text-xs text-muted-foreground/70 mt-1">
                                Applied: {new Date(migration.appliedAt).toLocaleString('en-IN', {
                                    year: 'numeric',
                                    month: 'short',
                                    day: 'numeric',
                                    hour: '2-digit',
                                    minute: '2-digit',
                                    hour12: true,
                                    timeZone: 'Asia/Kolkata'
                                })}
                            </p>
                        )}
                    </div>
                </div>

                {/* Status Badge */}
                <Badge
                    variant={migration.status === "applied" ? "default" : "secondary"}
                    className={cn(
                        "text-xs shrink-0",
                        migration.status === "applied"
                            ? "bg-green-600 dark:bg-green-700"
                            : "bg-orange-600 dark:bg-orange-700 text-white"
                    )}
                >
                    {migration.status === "applied" ? "Applied" : "Pending"}
                </Badge>
            </div>

            {/* Action Buttons */}
            <div className="flex gap-2 mt-2">
                {migration.status === "pending" ? (
                    <>
                        <Button
                            size="sm"
                            variant="default"
                            className="h-7 text-xs gap-1 bg-green-600 hover:bg-green-700"
                            onClick={() => onApply(migration.version, migration.name)}
                        >
                            <Play className="h-3 w-3" />
                            Apply
                        </Button>
                        <Button
                            size="sm"
                            variant="outline"
                            className="h-7 text-xs gap-1"
                            onClick={() => onViewSQL(migration.version, migration.name)}
                        >
                            <Eye className="h-3 w-3" />
                            View SQL
                        </Button>
                        <Button
                            size="sm"
                            variant="destructive"
                            className="h-7 text-xs gap-1"
                            onClick={() => onDelete(migration.version, migration.name)}
                        >
                            <Trash2 className="h-3 w-3" />
                            Delete
                        </Button>
                    </>
                ) : (
                    <>
                        <Button
                            size="sm"
                            variant="outline"
                            className="h-7 text-xs gap-1"
                            onClick={() => onViewSQL(migration.version, migration.name)}
                        >
                            <Eye className="h-3 w-3" />
                            View SQL
                        </Button>
                        {!isBaseline && (
                            <Button
                                size="sm"
                                variant="outline"
                                className="h-7 text-xs gap-1 text-orange-600 hover:bg-orange-50 dark:hover:bg-orange-950"
                                onClick={() => onRollback(migration.version, migration.name)}
                            >
                                <Undo2 className="h-3 w-3" />
                                Rollback
                            </Button>
                        )}
                    </>
                )}
            </div>
        </div>
    );
}
