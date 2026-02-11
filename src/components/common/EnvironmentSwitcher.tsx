import { useState } from "react";
import {
    Globe,
    Shield,
    ShieldAlert,
    Plus,
    Trash2,
    Settings2,
    Check,
    Loader2,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import {
    Tooltip,
    TooltipContent,
    TooltipTrigger,
} from "@/components/ui/tooltip";
import {
    Dialog,
    DialogContent,
    DialogHeader,
    DialogTitle,
    DialogDescription,
    DialogFooter,
} from "@/components/ui/dialog";
import {
    DropdownMenu,
    DropdownMenuContent,
    DropdownMenuItem,
    DropdownMenuSeparator,
    DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Switch } from "@/components/ui/switch";
import { cn } from "@/lib/utils";
import {
    useResolvedEnv,
    useEnvConfig,
    useSetEnvMapping,
    useRemoveEnvMapping,
} from "@/hooks/useGitWorkflow";
import type { EnvironmentMapping } from "@/types/gitWorkflow";
import { toast } from "sonner";

// ─── Helpers ─────────────────────────────────────────────────

const envBadgeColor: Record<string, string> = {
    production: "bg-red-500/15 text-red-500 border-red-500/30",
    staging: "bg-amber-500/15 text-amber-500 border-amber-500/30",
    development: "bg-emerald-500/15 text-emerald-500 border-emerald-500/30",
    testing: "bg-blue-500/15 text-blue-500 border-blue-500/30",
};

function getEnvColor(env: string): string {
    const lower = env.toLowerCase();
    return envBadgeColor[lower] ?? "bg-muted text-muted-foreground border-border/30";
}

// ─── Status Bar Pill ─────────────────────────────────────────

interface EnvironmentSwitcherProps {
    projectId?: string | null;
}

/**
 * Compact environment indicator for the bottom status bar.
 * Shows the resolved environment; clicking opens configuration.
 */
export default function EnvironmentSwitcher({ projectId }: EnvironmentSwitcherProps) {
    const [configOpen, setConfigOpen] = useState(false);

    const { data: resolved } = useResolvedEnv(projectId ?? undefined);

    if (!projectId || !resolved) return null;

    const envLabel = resolved.environment;
    const isProd = resolved.isProduction;

    return (
        <>
            <Tooltip>
                <TooltipTrigger asChild>
                    <button
                        onClick={() => setConfigOpen(true)}
                        className={cn(
                            "flex items-center gap-1 h-5 px-1.5 rounded text-[10px] font-medium border cursor-pointer transition-colors",
                            getEnvColor(envLabel),
                        )}
                    >
                        {isProd ? (
                            <ShieldAlert className="h-2.5 w-2.5" />
                        ) : (
                            <Globe className="h-2.5 w-2.5" />
                        )}
                        {envLabel}
                    </button>
                </TooltipTrigger>
                <TooltipContent>
                    <p className="text-xs">
                        Environment: <strong>{envLabel}</strong>
                        {resolved.branch && (
                            <>
                                {" "}
                                (branch: <code>{resolved.branch}</code>)
                            </>
                        )}
                    </p>
                    <p className="text-xs text-muted-foreground">Click to configure</p>
                </TooltipContent>
            </Tooltip>

            <EnvironmentConfigDialog
                projectId={projectId}
                open={configOpen}
                onOpenChange={setConfigOpen}
            />
        </>
    );
}

// ─── Configuration Dialog ────────────────────────────────────

function EnvironmentConfigDialog({
    projectId,
    open,
    onOpenChange,
}: {
    projectId: string;
    open: boolean;
    onOpenChange: (v: boolean) => void;
}) {
    const { data: config } = useEnvConfig(projectId);
    const setMappingMut = useSetEnvMapping();
    const removeMappingMut = useRemoveEnvMapping();

    const [newBranch, setNewBranch] = useState("");
    const [newEnv, setNewEnv] = useState("");
    const [newIsProd, setNewIsProd] = useState(false);

    const mappings = config?.mappings ?? [];

    const handleAdd = async () => {
        if (!newBranch.trim() || !newEnv.trim()) return;
        try {
            await setMappingMut.mutateAsync({
                projectId,
                mapping: {
                    branch: newBranch.trim(),
                    environment: newEnv.trim(),
                    isProduction: newIsProd,
                },
            });
            toast.success(`Mapped ${newBranch} → ${newEnv}`);
            setNewBranch("");
            setNewEnv("");
            setNewIsProd(false);
        } catch (err: any) {
            toast.error(err.message || "Failed to save mapping");
        }
    };

    const handleRemove = async (branch: string) => {
        try {
            await removeMappingMut.mutateAsync({ projectId, branch });
            toast.success(`Removed mapping for ${branch}`);
        } catch (err: any) {
            toast.error(err.message || "Failed to remove mapping");
        }
    };

    return (
        <Dialog open={open} onOpenChange={onOpenChange}>
            <DialogContent className="max-w-md">
                <DialogHeader>
                    <DialogTitle className="text-sm flex items-center gap-2">
                        <Settings2 className="h-4 w-4" />
                        Environment Mappings
                    </DialogTitle>
                    <DialogDescription className="text-xs">
                        Map git branches to database environments. When you switch branches,
                        the environment label and connection automatically update.
                    </DialogDescription>
                </DialogHeader>

                {/* Existing mappings */}
                <div className="space-y-2 max-h-48 overflow-y-auto">
                    {mappings.length === 0 ? (
                        <p className="text-xs text-muted-foreground py-4 text-center">
                            No mappings configured yet
                        </p>
                    ) : (
                        mappings.map((m) => (
                            <div
                                key={m.branch}
                                className="flex items-center gap-2 p-2 rounded-md bg-muted/20 border border-border/20"
                            >
                                <code className="text-xs font-mono flex-1 truncate">
                                    {m.branch}
                                </code>
                                <span className="text-[10px] text-muted-foreground">→</span>
                                <Badge
                                    variant="outline"
                                    className={cn(
                                        "h-5 text-[10px]",
                                        getEnvColor(m.environment),
                                    )}
                                >
                                    {m.isProduction && <Shield className="h-2.5 w-2.5 mr-0.5" />}
                                    {m.environment}
                                </Badge>
                                <Button
                                    variant="ghost"
                                    size="icon"
                                    className="h-6 w-6 shrink-0"
                                    onClick={() => handleRemove(m.branch)}
                                    disabled={removeMappingMut.isPending}
                                >
                                    <Trash2 className="h-3 w-3 text-muted-foreground" />
                                </Button>
                            </div>
                        ))
                    )}
                </div>

                {/* Add new mapping */}
                <div className="border-t border-border/20 pt-3 space-y-2">
                    <p className="text-xs font-medium">Add mapping</p>
                    <div className="flex items-center gap-2">
                        <Input
                            placeholder="Branch (e.g. main)"
                            value={newBranch}
                            onChange={(e) => setNewBranch(e.target.value)}
                            className="h-7 text-xs flex-1"
                        />
                        <span className="text-[10px] text-muted-foreground">→</span>
                        <Input
                            placeholder="Environment"
                            value={newEnv}
                            onChange={(e) => setNewEnv(e.target.value)}
                            className="h-7 text-xs flex-1"
                        />
                    </div>
                    <div className="flex items-center justify-between">
                        <label className="flex items-center gap-2 text-xs text-muted-foreground">
                            <Switch
                                checked={newIsProd}
                                onCheckedChange={setNewIsProd}
                                className="scale-75"
                            />
                            Production (extra protection)
                        </label>
                        <Button
                            size="sm"
                            className="h-7 text-xs gap-1"
                            onClick={handleAdd}
                            disabled={
                                !newBranch.trim() ||
                                !newEnv.trim() ||
                                setMappingMut.isPending
                            }
                        >
                            {setMappingMut.isPending ? (
                                <Loader2 className="h-3 w-3 animate-spin" />
                            ) : (
                                <Plus className="h-3 w-3" />
                            )}
                            Add
                        </Button>
                    </div>
                </div>
            </DialogContent>
        </Dialog>
    );
}
