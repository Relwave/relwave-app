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
    ArrowLeft,
    Download,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import {
    DropdownMenu,
    DropdownMenuContent,
    DropdownMenuItem,
    DropdownMenuSeparator,
    DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { cn } from "@/lib/utils";
import { DatabaseDetailProps } from "../types";
import { DatabaseOverviewPanel } from "./DatabaseOverviewPanel";
import { useProjectByDatabaseId, useProjectSchema, useProjectERDiagram, useProjectQueries } from "@/features/project/hooks/useProjectQueries";
import { projectService } from "@/services/bridge/project";
import { toast } from "sonner";

const DB_COLORS: Record<string, { bg: string; text: string }> = {
    postgresql: { bg: "bg-blue-500/10", text: "text-blue-500" },
    mysql: { bg: "bg-orange-500/10", text: "text-orange-500" },
    mariadb: { bg: "bg-teal-500/10", text: "text-teal-500" },
    sqlite: { bg: "bg-cyan-500/10", text: "text-cyan-500" },
};

function getDbColors(type: string) {
    return DB_COLORS[type] || { bg: "bg-primary/10", text: "text-primary" };
}

export function DatabaseDetail({
    database,
    isConnected,
    onTest,
    onOpen,
    onDelete,
    onBack,
    size,
    tables
}: DatabaseDetailProps) {
    // Fetch linked project and its sub-resources
    const { data: project } = useProjectByDatabaseId(database.id);
    const { data: schemaData } = useProjectSchema(project?.id);
    const { data: erData } = useProjectERDiagram(project?.id);
    const { data: queriesData } = useProjectQueries(project?.id);

    const handleExport = async () => {
        if (!project?.id) return;
        try {
            const bundle = await projectService.exportProject(project.id);
            if (!bundle) {
                toast.error("Project not found");
                return;
            }
            const blob = new Blob([JSON.stringify(bundle, null, 2)], {
                type: "application/json",
            });
            const url = URL.createObjectURL(blob);
            const a = document.createElement("a");
            a.href = url;
            a.download = `${bundle.metadata.name.replace(/\s+/g, "-").toLowerCase()}-export.json`;
            a.click();
            setTimeout(() => URL.revokeObjectURL(url), 0);
            toast.success("Project exported");
        } catch (err: any) {
            toast.error("Export failed", { description: err.message });
        }
    };

    return (
        <div className="h-full flex flex-col">
            {/* Detail Header */}
            <div className="p-6 border-b border-border/50 bg-card/45 backdrop-blur-xl">
                <div className="flex items-start justify-between">
                    <div className="flex items-center gap-4">
                        <div
                            className={cn(
                                "h-14 w-14 rounded-lg flex items-center justify-center ring-1 ring-border/50 shadow-sm",
                                getDbColors(database.type).bg
                            )}
                        >
                            <Database
                                className={cn(
                                    "h-7 w-7",
                                    getDbColors(database.type).text
                                )}
                            />
                        </div>
                        <div>
                            <div className="mb-2">
                                <Button variant="ghost" size="sm" onClick={onBack} className="h-8 px-2 text-muted-foreground -ml-2">
                                    <ArrowLeft className="h-4 w-4 mr-1.5" />
                                    Back
                                </Button>
                            </div>
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
                                {database.type === "sqlite"
                                    ? database.database
                                    : `${database.host}:${database.port}/${database.database}`}
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
                                {project && (
                                    <>
                                        <DropdownMenuItem onClick={handleExport}>
                                            <Download className="h-3.5 w-3.5 mr-2" />
                                            Export Project
                                        </DropdownMenuItem>
                                        <DropdownMenuSeparator />
                                    </>
                                )}
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
            <div>
                <DatabaseOverviewPanel
                    database={database}
                    size={size}
                    tables={tables}
                    schemaCount={schemaData?.schemas?.length}
                    hasERLayout={(erData?.nodes?.length ?? 0) > 0}
                    queryCount={queriesData?.queries?.length}
                />
            </div>
        </div >
    );
}
