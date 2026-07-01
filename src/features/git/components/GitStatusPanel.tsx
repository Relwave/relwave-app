import { useState } from "react";
import {
    GitBranch,
    GitCommitHorizontal,
    FileEdit,
    FilePlus2,
    FileX2,
    FileQuestion,
    FileDiff,
    Clock,
    ArrowUp,
    ArrowDown,
    ChevronRight,
    Eye,
    RotateCcw,
    User,
    RefreshCw,
    UploadCloud,
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
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
} from "@/components/ui/dialog";
import {
    useGitStatus,
    useGitChanges,
    useGitLogGraph,
    useGitBranches,
} from "@/features/git/hooks/useGitQueries";
import { useGitRevert } from "@/features/git/hooks/useGitAdvanced";
import { Spinner } from "@/components/ui/spinner";
import { toast } from "sonner";
import type { GitFileChange, GitLogEntry } from "@/features/git/types";
import { gitService } from "@/services/bridge/git";
import { projectService } from "@/services/bridge/project";
import { GitHistoryGraph } from "./GitHistoryGraph";
import { GitStatusPanelLoadingState } from "./GitStatusPanelLoadingState";

// ─── Helpers ──────────────────────────────────────────

function statusIcon(status: string, staged: boolean) {
    const color = staged ? "text-green-500" : "text-yellow-500";
    switch (status) {
        case "M":
            return <FileEdit className={`h-4 w-4 ${color}`} />;
        case "A":
            return <FilePlus2 className={`h-4 w-4 ${color}`} />;
        case "D":
            return <FileX2 className="h-4 w-4 text-red-500" />;
        case "R":
            return <FileDiff className={`h-4 w-4 ${color}`} />;
        case "?":
            return <FileQuestion className="h-4 w-4 text-muted-foreground" />;
        default:
            return <FileEdit className={`h-4 w-4 ${color}`} />;
    }
}

function statusLabel(status: string) {
    switch (status) {
        case "M":
            return "Modified";
        case "A":
            return "Added";
        case "D":
            return "Deleted";
        case "R":
            return "Renamed";
        case "?":
            return "Untracked";
        case "C":
            return "Copied";
        case "U":
            return "Unmerged";
        default:
            return status;
    }
}

function timeAgo(dateStr: string): string {
    const diff = Date.now() - new Date(dateStr).getTime();
    const mins = Math.floor(diff / 60000);
    if (mins < 1) return "just now";
    if (mins < 60) return `${mins}m ago`;
    const hrs = Math.floor(mins / 60);
    if (hrs < 24) return `${hrs}h ago`;
    const days = Math.floor(hrs / 24);
    if (days < 30) return `${days}d ago`;
    return new Date(dateStr).toLocaleDateString();
}

// ─── Component ────────────────────────────────────────

interface GitStatusPanelProps {
    projectDir: string | null | undefined;
    projectId?: string;
}

export default function GitStatusPanel({ projectDir, projectId }: GitStatusPanelProps) {
    const { data: status, isLoading: statusLoading, refetch: refetchStatus } = useGitStatus(projectDir);
    const { data: changes, refetch: refetchChanges } = useGitChanges(
        status?.isGitRepo ? projectDir : undefined
    );
    const { data: logGraph } = useGitLogGraph(
        status?.isGitRepo ? projectDir : undefined,
        100
    );
    const { data: branches } = useGitBranches(
        status?.isGitRepo ? projectDir : undefined
    );
    const revertMutation = useGitRevert(projectDir);

    const [diffDialogOpen, setDiffDialogOpen] = useState(false);
    const [diffContent, setDiffContent] = useState("");
    const [diffFile, setDiffFile] = useState("");
    const [diffLoading, setDiffLoading] = useState(false);

    const [syncing, setSyncing] = useState(false);
    const [pushing, setPushing] = useState(false);

    if (!projectDir) {
        return (
            <div className="flex-1 flex items-center justify-center text-muted-foreground text-sm">
                No project directory available.
            </div>
        );
    }

    if (statusLoading && projectDir) {
        return (
            <GitStatusPanelLoadingState/>
        );
    }

    if (!status?.isGitRepo) {
        return (
            <div className="flex-1 flex items-center justify-center text-muted-foreground text-sm">
                <GitBranch className="h-5 w-5 mr-2 opacity-50" />
                Not a git repository. Initialize git from the status bar below.
            </div>
        );
    }

    // Split changes into staged / unstaged
    const staged = (changes ?? []).filter((c) => c.staged);
    const unstaged = (changes ?? []).filter((c) => !c.staged);

    const viewDiff = async (file: string, isStaged: boolean) => {
        setDiffFile(file);
        setDiffLoading(true);
        setDiffDialogOpen(true);
        try {
            const diff = await gitService.gitDiff(projectDir!, file, isStaged);
            setDiffContent(diff || "(no diff available)");
        } catch {
            setDiffContent("Failed to load diff.");
        } finally {
            setDiffLoading(false);
        }
    };

    const handleRevert = (hash: string, subject: string) => {
        revertMutation.mutate(
            { hash },
            {
                onSuccess: () => toast.success(`Reverted: ${subject}`),
                onError: (err: any) =>
                    toast.error(`Revert failed: ${err?.message ?? "Unknown error"}`),
            }
        );
    };

    const handleSync = async () => {
        if (!projectId) return;
        setSyncing(true);
        try {
            await projectService.syncMigrations(projectId);
            toast.success("Migrations synced to git");
            refetchStatus();
            refetchChanges();
        } catch (err: any) {
            toast.error(`Failed to sync migrations: ${err.message}`);
        } finally {
            setSyncing(false);
        }
    };

    const handleRevertLatest = () => {
        if (!logGraph || logGraph.length === 0) {
            toast.error("No commit to revert");
            return;
        }
        const latest = logGraph[0];
        handleRevert(latest.fullHash ?? latest.hash, latest.subject);
    };

    return (
        <div className="flex flex-col h-full">
            {/* Header */}
            <header className="shrink-0 border-b border-border/20 bg-background/95 backdrop-blur-sm">
                <div className="px-6 py-3 flex items-center justify-between border-b border-border/20">
                    <div className="flex items-center gap-3">
                        <GitBranch className="h-5 w-5 text-primary" />
                        <h2 className="text-sm font-semibold">Git Status</h2>
                        <Badge variant="outline" className="font-mono text-xs">
                            {status.branch ?? "HEAD"}
                        </Badge>
                        {status.headCommit && (
                            <span className="text-xs text-muted-foreground font-mono">
                                {status.headCommit}
                            </span>
                        )}
                    </div>
                    <div className="flex items-center gap-2 text-xs text-muted-foreground">
                        {status.ahead != null && status.ahead > 0 && (
                            <span className="flex items-center gap-0.5">
                                <ArrowUp className="h-3 w-3" />
                                {status.ahead}
                            </span>
                        )}
                        {status.behind != null && status.behind > 0 && (
                            <span className="flex items-center gap-0.5">
                                <ArrowDown className="h-3 w-3" />
                                {status.behind}
                            </span>
                        )}
                        {status.upstream && (
                            <span className="font-mono">{status.upstream}</span>
                        )}
                    </div>
                </div>
                {projectId && (
                    <div className="px-6 py-2 bg-muted/20 flex items-center justify-between">
                        <span className="text-xs text-muted-foreground flex items-center gap-2">
                            <ArrowUp className="h-3.5 w-3.5" /> Migration Sync
                        </span>
                        <div className="flex gap-2">
                            <Button size="sm" variant="outline" onClick={handleSync} disabled={syncing} className="h-7 text-xs">
                                {syncing ? <Spinner className="h-3 w-3 mr-1" /> : <RefreshCw className="h-3 w-3 mr-1" />}
                                Sync to Git
                            </Button>
                            <Button size="sm" onClick={handleRevertLatest} disabled={revertMutation.isPending} variant="destructive" className="h-7 text-xs">
                                {revertMutation.isPending ? <Spinner className="h-3 w-3 mr-1" /> : <RotateCcw className="h-3 w-3 mr-1" />}
                                Revert Last
                            </Button>
                        </div>
                    </div>
                )}
            </header>

            {/* Tabs */}
            <Tabs defaultValue="changes" className="flex-1 flex flex-col min-h-0">
                <TabsList className="shrink-0 mx-4 mt-3 w-auto justify-start bg-muted/30">
                    <TabsTrigger value="changes" className="text-xs gap-1.5">
                        <FileDiff className="h-3.5 w-3.5" />
                        Changes
                        {(changes?.length ?? 0) > 0 && (
                            <Badge
                                variant="secondary"
                                className="h-4 min-w-4 px-1 text-[10px] ml-1"
                            >
                                {changes!.length}
                            </Badge>
                        )}
                    </TabsTrigger>
                    <TabsTrigger value="history" className="text-xs gap-1.5">
                        <Clock className="h-3.5 w-3.5" />
                        History
                    </TabsTrigger>
                    <TabsTrigger value="branches" className="text-xs gap-1.5">
                        <GitBranch className="h-3.5 w-3.5" />
                        Branches
                        {branches && (
                            <Badge
                                variant="secondary"
                                className="h-4 min-w-4 px-1 text-[10px] ml-1"
                            >
                                {branches.length}
                            </Badge>
                        )}
                    </TabsTrigger>
                </TabsList>

                {/* ── Changes Tab ─────────────────────────── */}
                <TabsContent value="changes" className="flex-1 min-h-0 mt-0 px-2">
                    <ScrollArea className="h-full">
                        {(!changes || changes.length === 0) ? (
                            <div className="flex flex-col items-center justify-center py-16 text-muted-foreground text-sm gap-2">
                                <GitCommitHorizontal className="h-8 w-8 opacity-30" />
                                <span>Working tree clean</span>
                            </div>
                        ) : (
                            <div className="py-2 space-y-4">
                                {/* Staged */}
                                {staged.length > 0 && (
                                    <section>
                                        <h3 className="text-xs font-semibold text-green-500 uppercase tracking-wider px-3 mb-1.5 flex items-center gap-1.5">
                                            Staged Changes
                                            <Badge variant="secondary" className="h-4 min-w-4 px-1 text-[10px]">
                                                {staged.length}
                                            </Badge>
                                        </h3>
                                        <div className="space-y-0.5">
                                            {staged.map((f) => (
                                                <FileRow
                                                    key={`s-${f.path}`}
                                                    file={f}
                                                    onViewDiff={() => viewDiff(f.path, true)}
                                                />
                                            ))}
                                        </div>
                                    </section>
                                )}

                                {/* Unstaged */}
                                {unstaged.length > 0 && (
                                    <section>
                                        <h3 className="text-xs font-semibold text-yellow-500 uppercase tracking-wider px-3 mb-1.5 flex items-center gap-1.5">
                                            Unstaged Changes
                                            <Badge variant="secondary" className="h-4 min-w-4 px-1 text-[10px]">
                                                {unstaged.length}
                                            </Badge>
                                        </h3>
                                        <div className="space-y-0.5">
                                            {unstaged.map((f) => (
                                                <FileRow
                                                    key={`u-${f.path}`}
                                                    file={f}
                                                    onViewDiff={() => viewDiff(f.path, false)}
                                                />
                                            ))}
                                        </div>
                                    </section>
                                )}
                            </div>
                        )}
                    </ScrollArea>
                </TabsContent>

                {/* ── History Tab ─────────────────────────── */}
                <TabsContent value="history" className="flex-1 min-h-0 mt-0">
                    {(!logGraph || logGraph.length === 0) ? (
                        <div className="flex flex-col items-center justify-center py-16 text-muted-foreground text-sm gap-2">
                            <Clock className="h-8 w-8 opacity-30" />
                            <span>No commits yet</span>
                        </div>
                    ) : (
                        <GitHistoryGraph log={logGraph} className="border-t border-border/5" onRevert={handleRevert} reverting={revertMutation.isPending} />
                    )}
                </TabsContent>

                {/* ── Branches Tab ────────────────────────── */}
                <TabsContent value="branches" className="flex-1 min-h-0 mt-0 px-2">
                    <ScrollArea className="h-full">
                        {(!branches || branches.length === 0) ? (
                            <div className="flex flex-col items-center justify-center py-16 text-muted-foreground text-sm gap-2">
                                <GitBranch className="h-8 w-8 opacity-30" />
                                <span>No branches</span>
                            </div>
                        ) : (
                            <div className="py-2 space-y-0.5">
                                {branches.map((b) => (
                                    <div
                                        key={b.name}
                                        className={`flex items-center gap-3 px-3 py-2 rounded-md text-sm ${b.current
                                            ? "bg-primary/10 text-primary font-medium"
                                            : "text-foreground hover:bg-muted/50"
                                            }`}
                                    >
                                        <GitBranch className={`h-4 w-4 shrink-0 ${b.current ? "text-primary" : "text-muted-foreground"}`} />
                                        <span className="font-mono text-xs truncate flex-1">{b.name}</span>
                                        {b.current && (
                                            <Badge variant="default" className="text-[10px] h-4 px-1.5">
                                                current
                                            </Badge>
                                        )}
                                        {b.upstream && (
                                            <span className="text-[10px] text-muted-foreground font-mono truncate max-w-[150px]">
                                                → {b.upstream}
                                            </span>
                                        )}
                                    </div>
                                ))}
                            </div>
                        )}
                    </ScrollArea>
                </TabsContent>
            </Tabs>

            {/* Diff Dialog */}
            <Dialog open={diffDialogOpen} onOpenChange={setDiffDialogOpen}>
                <DialogContent className="max-w-4xl h-[80vh] flex flex-col overflow-hidden">
                    <DialogHeader>
                        <DialogTitle className="font-mono text-sm flex items-center gap-2">
                            <FileDiff className="h-4 w-4" />
                            {diffFile}
                        </DialogTitle>
                    </DialogHeader>
                    <div className="flex-1 min-h-0">
                        {diffLoading ? (
                            <div className="flex items-center justify-center h-full">
                                <Spinner className="h-5 w-5" />
                            </div>
                        ) : (
                            <ScrollArea className="h-full w-full rounded-md border">
                                <pre className="text-xs font-mono p-4 leading-relaxed whitespace-pre">
                                    {diffContent.split("\n").map((line, i) => {
                                        let color = "text-foreground/80";

                                        if (line.startsWith("+") && !line.startsWith("+++"))
                                            color = "text-green-500";
                                        else if (line.startsWith("-") && !line.startsWith("---"))
                                            color = "text-red-500";
                                        else if (line.startsWith("@@"))
                                            color = "text-blue-400";

                                        return (
                                            <div key={i} className={color}>
                                                {line}
                                            </div>
                                        );
                                    })}
                                </pre>
                            </ScrollArea>
                        )}
                    </div>
                </DialogContent>
            </Dialog>
        </div>
    );
}

// ─── File Row Sub-Component ───────────────────────────

function FileRow({
    file,
    onViewDiff,
}: {
    file: GitFileChange;
    onViewDiff: () => void;
}) {
    // Extract filename from path
    const parts = file.path.split("/");
    const fileName = parts.pop() ?? file.path;
    const dir = parts.length > 0 ? parts.join("/") + "/" : "";

    return (
        <div className="group flex items-center gap-2 px-3 py-1.5 rounded-md hover:bg-muted/50 transition-colors">
            {statusIcon(file.status, file.staged)}
            <div className="flex-1 min-w-0 flex items-center gap-1.5">
                <span className="text-sm font-mono truncate">{fileName}</span>
                {dir && (
                    <span className="text-[10px] text-muted-foreground font-mono truncate">
                        {dir}
                    </span>
                )}
            </div>
            <Badge
                variant="outline"
                className={`text-[10px] h-4 px-1.5 shrink-0 ${file.staged ? "border-green-500/30 text-green-500" : "border-yellow-500/30 text-yellow-500"
                    }`}
            >
                {statusLabel(file.status)}
            </Badge>
            <Tooltip>
                <TooltipTrigger asChild>
                    <Button
                        variant="ghost"
                        size="icon"
                        className="h-6 w-6 opacity-0 group-hover:opacity-100 transition-opacity"
                        onClick={onViewDiff}
                    >
                        <Eye className="h-3.5 w-3.5" />
                    </Button>
                </TooltipTrigger>
                <TooltipContent side="left">View Diff</TooltipContent>
            </Tooltip>
        </div>
    );
}

// ─── Commit Row Sub-Component ─────────────────────────

function CommitRow({
    entry,
    isLatest,
    onRevert,
    reverting,
}: {
    entry: GitLogEntry;
    isLatest: boolean;
    onRevert: () => void;
    reverting: boolean;
}) {
    return (
        <div className="group flex items-start gap-3 px-3 py-2.5 rounded-md hover:bg-muted/50 transition-colors">
            {/* Timeline dot */}
            <div className="flex flex-col items-center pt-1">
                <div
                    className={`h-2.5 w-2.5 rounded-full shrink-0 ${isLatest ? "bg-primary" : "bg-muted-foreground/40"
                        }`}
                />
            </div>

            <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2">
                    <span className="text-sm font-medium truncate flex-1">
                        {entry.subject}
                    </span>
                    <Tooltip>
                        <TooltipTrigger asChild>
                            <Button
                                variant="ghost"
                                size="icon"
                                className="h-6 w-6 opacity-0 group-hover:opacity-100 transition-opacity shrink-0"
                                onClick={onRevert}
                                disabled={reverting}
                            >
                                <RotateCcw className="h-3.5 w-3.5" />
                            </Button>
                        </TooltipTrigger>
                        <TooltipContent side="left">
                            Rollback to this commit
                        </TooltipContent>
                    </Tooltip>
                </div>
                <div className="flex items-center gap-3 mt-0.5 text-[11px] text-muted-foreground">
                    <span className="font-mono">{entry.hash}</span>
                    <span className="flex items-center gap-1">
                        <User className="h-3 w-3" />
                        {entry.author}
                    </span>
                    <span className="flex items-center gap-1">
                        <Clock className="h-3 w-3" />
                        {timeAgo(entry.date)}
                    </span>
                </div>
            </div>
        </div>
    );
}
