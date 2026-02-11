import { useState } from "react";
import {
    History,
    GitCommitHorizontal,
    Tag,
    Plus,
    Minus,
    Pencil,
    ChevronDown,
    ChevronRight,
    RefreshCw,
    BookmarkPlus,
    AlertTriangle,
    CheckCircle2,
    Loader2,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Spinner } from "@/components/ui/spinner";
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
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";
import {
    useTimeline,
    useCommitSummary,
    useAutoCommit,
    useConflictDetection,
} from "@/hooks/useGitWorkflow";
import { useSchemaDiff } from "@/hooks/useSchemaDiff";
import type { TimelineEntry, ConflictReport } from "@/types/gitWorkflow";
import { toast } from "sonner";

// ─── Helpers ─────────────────────────────────────────────────

function relativeTime(iso: string): string {
    const now = Date.now();
    const then = new Date(iso).getTime();
    const diff = now - then;
    const mins = Math.floor(diff / 60000);
    if (mins < 1) return "just now";
    if (mins < 60) return `${mins}m ago`;
    const hours = Math.floor(mins / 60);
    if (hours < 24) return `${hours}h ago`;
    const days = Math.floor(hours / 24);
    if (days < 30) return `${days}d ago`;
    return new Date(iso).toLocaleDateString();
}

function severityColor(s: string) {
    if (s === "high") return "bg-red-500/10 text-red-500 border-red-500/20";
    if (s === "medium") return "bg-amber-500/10 text-amber-500 border-amber-500/20";
    return "bg-blue-500/10 text-blue-500 border-blue-500/20";
}

// ─── Sub-components ──────────────────────────────────────────

function CommitNode({
    entry,
    projectId,
    isFirst,
}: {
    entry: TimelineEntry;
    projectId: string;
    isFirst: boolean;
}) {
    const [expanded, setExpanded] = useState(false);
    const { data: summaryData } = useCommitSummary(
        expanded ? projectId : undefined,
        expanded ? entry.fullHash : undefined,
    );
    const summary = summaryData?.summary;

    return (
        <div className="relative pl-8 pb-5 group">
            {/* Timeline line */}
            <div className="absolute left-[11px] top-5 bottom-0 w-px bg-border/40 group-last:hidden" />

            {/* Dot */}
            <div
                className={cn(
                    "absolute left-1 top-1.5 w-[14px] h-[14px] rounded-full border-2 z-10",
                    entry.isAutoCommit
                        ? "bg-primary/20 border-primary"
                        : "bg-background border-muted-foreground/40",
                    isFirst && "ring-2 ring-primary/20",
                )}
            />

            {/* Content */}
            <div
                className="cursor-pointer"
                onClick={() => setExpanded(!expanded)}
            >
                <div className="flex items-start gap-2">
                    <div className="flex-1 min-w-0">
                        <p className="text-sm font-medium truncate leading-tight">
                            {entry.subject}
                        </p>
                        <div className="flex items-center gap-2 mt-0.5 text-[11px] text-muted-foreground/70">
                            <code className="font-mono">{entry.hash}</code>
                            <span>·</span>
                            <span>{entry.author}</span>
                            <span>·</span>
                            <span>{relativeTime(entry.date)}</span>
                        </div>
                    </div>
                    {expanded ? (
                        <ChevronDown className="h-3.5 w-3.5 text-muted-foreground shrink-0 mt-1" />
                    ) : (
                        <ChevronRight className="h-3.5 w-3.5 text-muted-foreground shrink-0 mt-1" />
                    )}
                </div>

                {/* Tags */}
                {entry.tags.length > 0 && (
                    <div className="flex flex-wrap gap-1 mt-1">
                        {entry.tags.map((t) => (
                            <Badge
                                key={t}
                                variant="outline"
                                className="h-4 text-[10px] px-1.5 border-primary/30 text-primary"
                            >
                                <Tag className="h-2.5 w-2.5 mr-0.5" />
                                {t.replace("relwave/schema/", "")}
                            </Badge>
                        ))}
                    </div>
                )}
            </div>

            {/* Expanded: change summary */}
            {expanded && (
                <div className="mt-2 ml-0 p-2.5 rounded-md bg-muted/20 border border-border/20 text-xs">
                    {!summary ? (
                        <div className="flex items-center gap-2 text-muted-foreground">
                            <Loader2 className="h-3 w-3 animate-spin" />
                            Loading changes…
                        </div>
                    ) : (
                        <div className="flex flex-wrap gap-3">
                            {summary.tablesAdded > 0 && (
                                <span className="flex items-center gap-1 text-emerald-500">
                                    <Plus className="h-3 w-3" />
                                    {summary.tablesAdded} table{summary.tablesAdded > 1 ? "s" : ""}
                                </span>
                            )}
                            {summary.tablesRemoved > 0 && (
                                <span className="flex items-center gap-1 text-red-500">
                                    <Minus className="h-3 w-3" />
                                    {summary.tablesRemoved} table{summary.tablesRemoved > 1 ? "s" : ""}
                                </span>
                            )}
                            {summary.tablesModified > 0 && (
                                <span className="flex items-center gap-1 text-amber-500">
                                    <Pencil className="h-3 w-3" />
                                    {summary.tablesModified} table{summary.tablesModified > 1 ? "s" : ""}
                                </span>
                            )}
                            {summary.columnsAdded > 0 && (
                                <span className="text-muted-foreground">
                                    +{summary.columnsAdded} col{summary.columnsAdded > 1 ? "s" : ""}
                                </span>
                            )}
                            {summary.columnsRemoved > 0 && (
                                <span className="text-muted-foreground">
                                    -{summary.columnsRemoved} col{summary.columnsRemoved > 1 ? "s" : ""}
                                </span>
                            )}
                            {summary.columnsModified > 0 && (
                                <span className="text-muted-foreground">
                                    ~{summary.columnsModified} col{summary.columnsModified > 1 ? "s" : ""}
                                </span>
                            )}
                            {summary.tablesAdded === 0 &&
                                summary.tablesRemoved === 0 &&
                                summary.tablesModified === 0 && (
                                    <span className="text-muted-foreground">No structural changes</span>
                                )}
                        </div>
                    )}
                </div>
            )}
        </div>
    );
}

function ConflictBanner({
    report,
    isLoading,
}: {
    report: ConflictReport | undefined;
    isLoading: boolean;
}) {
    if (isLoading) return null;
    if (!report || report.conflictCount === 0) {
        return (
            <div className="flex items-center gap-2 px-4 py-2 bg-emerald-500/5 border-b border-emerald-500/10 text-emerald-600 text-xs">
                <CheckCircle2 className="h-3.5 w-3.5" />
                <span>No schema conflicts with <code className="font-mono">main</code></span>
            </div>
        );
    }

    return (
        <div className="px-4 py-2 bg-red-500/5 border-b border-red-500/10 text-xs">
            <div className="flex items-center gap-2 text-red-500 font-medium mb-1">
                <AlertTriangle className="h-3.5 w-3.5" />
                {report.summary}
            </div>
            <div className="flex flex-wrap gap-1.5 mt-1">
                {report.schemaConflicts.map((c, i) => (
                    <Badge
                        key={i}
                        variant="outline"
                        className={cn("h-5 text-[10px]", severityColor(c.severity))}
                    >
                        {c.schema}.{c.table}
                    </Badge>
                ))}
            </div>
        </div>
    );
}

// ─── Main Panel ──────────────────────────────────────────────

interface MigrationTimelinePanelProps {
    projectId?: string | null;
}

export default function MigrationTimelinePanel({
    projectId,
}: MigrationTimelinePanelProps) {
    const [autoCommitOpen, setAutoCommitOpen] = useState(false);
    const [commitMsg, setCommitMsg] = useState("");
    const [commitTag, setCommitTag] = useState("");

    const {
        data: timelineData,
        isLoading,
        isFetching,
        refetch,
    } = useTimeline(projectId ?? undefined);

    const { data: conflictReport, isLoading: conflictsLoading } =
        useConflictDetection(projectId ?? undefined, "main");

    const { data: diffResp } = useSchemaDiff(projectId ?? undefined);
    const hasPendingChanges = diffResp?.diff?.summary?.hasChanges ?? false;

    const autoCommitMut = useAutoCommit();

    const entries = timelineData?.entries ?? [];

    // ── Empty / loading states ──────────────────────────
    if (isLoading) {
        return (
            <div className="h-full flex items-center justify-center">
                <Spinner className="h-6 w-6" />
            </div>
        );
    }

    const handleAutoCommit = async () => {
        if (!projectId) return;
        try {
            const result = await autoCommitMut.mutateAsync({
                projectId,
                message: commitMsg || undefined,
                tag: commitTag || undefined,
            });
            toast.success(`Schema committed: ${result.hash}`);
            setAutoCommitOpen(false);
            setCommitMsg("");
            setCommitTag("");
        } catch (err: any) {
            toast.error(err.message || "Auto-commit failed");
        }
    };

    return (
        <div className="h-full flex flex-col overflow-hidden">
            {/* Header */}
            <header className="shrink-0 border-b border-border/20 bg-background/95 backdrop-blur-sm">
                <div className="px-6 py-3 flex items-center justify-between">
                    <div className="flex items-center gap-2">
                        <History className="h-4 w-4 text-primary" />
                        <h2 className="text-sm font-semibold">Migration Timeline</h2>
                        {isFetching && <Spinner className="h-3.5 w-3.5 ml-1" />}
                    </div>
                    <div className="flex items-center gap-2">
                        {hasPendingChanges && (
                            <Tooltip>
                                <TooltipTrigger asChild>
                                    <Button
                                        variant="outline"
                                        size="sm"
                                        className="h-7 text-xs gap-1"
                                        onClick={() => setAutoCommitOpen(true)}
                                    >
                                        <BookmarkPlus className="h-3.5 w-3.5" />
                                        Snapshot
                                    </Button>
                                </TooltipTrigger>
                                <TooltipContent>
                                    <p>Commit current schema as a snapshot</p>
                                </TooltipContent>
                            </Tooltip>
                        )}
                        <Button
                            variant="ghost"
                            size="icon"
                            className="h-7 w-7"
                            onClick={() => refetch()}
                        >
                            <RefreshCw className="h-3.5 w-3.5" />
                        </Button>
                    </div>
                </div>
            </header>

            {/* Conflict banner */}
            <ConflictBanner report={conflictReport} isLoading={conflictsLoading} />

            {/* Pending changes indicator */}
            {hasPendingChanges && (
                <div className="px-4 py-2 bg-amber-500/5 border-b border-amber-500/10 text-xs flex items-center gap-2 text-amber-600">
                    <Pencil className="h-3 w-3" />
                    Schema has uncommitted changes
                </div>
            )}

            {/* Timeline */}
            <ScrollArea className="flex-1">
                <div className="p-4">
                    {entries.length === 0 ? (
                        <div className="text-center text-muted-foreground py-12">
                            <GitCommitHorizontal className="h-10 w-10 mx-auto mb-3 opacity-30" />
                            <p className="text-sm">No schema commits yet</p>
                            <p className="text-xs mt-1 opacity-60">
                                Save a schema to create the first timeline entry
                            </p>
                        </div>
                    ) : (
                        entries.map((entry, i) => (
                            <CommitNode
                                key={entry.fullHash}
                                entry={entry}
                                projectId={projectId!}
                                isFirst={i === 0}
                            />
                        ))
                    )}
                </div>
            </ScrollArea>

            {/* Auto-commit dialog */}
            <Dialog open={autoCommitOpen} onOpenChange={setAutoCommitOpen}>
                <DialogContent className="max-w-sm">
                    <DialogHeader>
                        <DialogTitle className="text-sm">Snapshot Schema</DialogTitle>
                        <DialogDescription className="text-xs">
                            Commit the current schema.json as a versioned snapshot.
                        </DialogDescription>
                    </DialogHeader>
                    <div className="space-y-3 py-2">
                        <div>
                            <label className="text-xs text-muted-foreground mb-1 block">
                                Commit message (optional)
                            </label>
                            <Input
                                placeholder="Auto-generated if empty"
                                value={commitMsg}
                                onChange={(e) => setCommitMsg(e.target.value)}
                                className="h-8 text-xs"
                            />
                        </div>
                        <div>
                            <label className="text-xs text-muted-foreground mb-1 block">
                                Tag (optional)
                            </label>
                            <Input
                                placeholder="e.g. v1.2.0 or add-users"
                                value={commitTag}
                                onChange={(e) => setCommitTag(e.target.value)}
                                className="h-8 text-xs"
                            />
                        </div>
                    </div>
                    <DialogFooter>
                        <Button
                            size="sm"
                            className="h-7 text-xs"
                            onClick={handleAutoCommit}
                            disabled={autoCommitMut.isPending}
                        >
                            {autoCommitMut.isPending ? (
                                <Loader2 className="h-3.5 w-3.5 animate-spin mr-1" />
                            ) : (
                                <GitCommitHorizontal className="h-3.5 w-3.5 mr-1" />
                            )}
                            Commit Snapshot
                        </Button>
                    </DialogFooter>
                </DialogContent>
            </Dialog>
        </div>
    );
}
