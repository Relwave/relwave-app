import { useState } from "react";
import {
  GitBranch,
  GitCommitHorizontal,
  ArrowUp,
  ArrowDown,
  Circle,
  Plus,
  Check,
  ChevronDown,
  FolderGit2,
  Globe,
  CloudUpload,
  CloudDownload,
  RefreshCw,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Spinner } from "@/components/ui/spinner";

import {
  useGitStatus,
  useGitBranches,
  useGitInit,
  useGitStageAll,
  useGitCommit,
  useGitCheckout,
  useGitCreateBranch,
} from "@/features/git/hooks/useGitQueries";
import {
  useGitPush,
  useGitPull,
  useGitFetch,
  useGitRemotes,
} from "@/features/git/hooks/useGitAdvanced";
import { toast } from "sonner";
import type { GitBranchInfo } from "@/features/git/types";
import RemoteConfigDialog from "../../../components/dev/RemoteConfigDialog";

interface GitStatusBarProps {
  projectDir: string | null | undefined;
}

export default function GitStatusBar({ projectDir }: GitStatusBarProps) {
  const { data: status, isLoading } = useGitStatus(projectDir);
  const { data: branches } = useGitBranches(status?.isGitRepo ? projectDir : undefined);

  const initMutation = useGitInit(projectDir);
  const stageAllMutation = useGitStageAll(projectDir);
  const commitMutation = useGitCommit(projectDir);
  const checkoutMutation = useGitCheckout(projectDir);
  const createBranchMutation = useGitCreateBranch(projectDir);

  const [commitDialogOpen, setCommitDialogOpen] = useState(false);
  const [commitMessage, setCommitMessage] = useState("");
  const [branchDialogOpen, setBranchDialogOpen] = useState(false);
  const [newBranchName, setNewBranchName] = useState("");
  const [remoteDialogOpen, setRemoteDialogOpen] = useState(false);

  const pushMutation = useGitPush(projectDir);
  const pullMutation = useGitPull(projectDir);
  const fetchMutation = useGitFetch(projectDir);
  const { data: remotes } = useGitRemotes(status?.isGitRepo ? projectDir : undefined);

  const hasRemote = remotes && remotes.length > 0;

  if (!projectDir) return null;

  if (isLoading) {
    return (
      <div className="flex items-center gap-1.5 px-2 py-1 text-xs text-muted-foreground">
        <Spinner className="h-3 w-3" />
      </div>
    );
  }

  if (!status?.isGitRepo) {
    return (
      <Tooltip>
        <TooltipTrigger asChild>
          <Button
            variant="ghost"
            size="sm"
            className="h-6 text-xs px-2 text-muted-foreground hover:text-foreground gap-1"
            onClick={() => {
              initMutation.mutate(undefined, {
                onSuccess: () => toast.success("Git repository initialized"),
                onError: (e) => toast.error("Git init failed: " + e.message),
              });
            }}
            disabled={initMutation.isPending}
          >
            {initMutation.isPending ? (
              <Spinner className="h-3 w-3" />
            ) : (
              <FolderGit2 className="h-3 w-3" />
            )}
            Initialize Git
          </Button>
        </TooltipTrigger>
        <TooltipContent side="top">
          <p>This project is not version-controlled. Click to init a git repo.</p>
        </TooltipContent>
      </Tooltip>
    );
  }

  const totalChanges = status.stagedCount + status.unstagedCount + status.untrackedCount;

  const handleQuickCommit = async () => {
    if (!commitMessage.trim()) return;
    try {
      await stageAllMutation.mutateAsync();
      const result = await commitMutation.mutateAsync(commitMessage.trim());
      toast.success(`Committed as ${result.hash}`);
      setCommitMessage("");
      setCommitDialogOpen(false);
    } catch (e: any) {
      toast.error("Commit failed: " + e.message);
    }
  };

  const handleCreateBranch = async () => {
    if (!newBranchName.trim()) return;
    try {
      await createBranchMutation.mutateAsync(newBranchName.trim());
      toast.success(`Switched to branch ${newBranchName.trim()}`);
      setNewBranchName("");
      setBranchDialogOpen(false);
    } catch (e: any) {
      toast.error("Create branch failed: " + e.message);
    }
  };

  const handleCheckout = async (name: string) => {
    try {
      await checkoutMutation.mutateAsync(name);
      toast.success(`Switched to ${name}`);
    } catch (e: any) {
      toast.error("Checkout failed: " + e.message);
    }
  };

  const handlePush = async () => {
    try {
      const needsUpstream = !status?.upstream;
      await pushMutation.mutateAsync({
        setUpstream: needsUpstream,
        branch: needsUpstream ? (status?.branch ?? undefined) : undefined,
      });
      toast.success("Pushed successfully");
    } catch (e: any) {
      toast.error("Push failed: " + e.message);
    }
  };

  const handlePull = async () => {
    try {
      await pullMutation.mutateAsync();
      toast.success("Pulled successfully");
    } catch (e: any) {
      toast.error("Pull failed: " + e.message);
    }
  };

  const handleFetch = async () => {
    try {
      await fetchMutation.mutateAsync({ all: true, prune: true });
      toast.success("Fetched from all remotes");
    } catch (e: any) {
      toast.error("Fetch failed: " + e.message);
    }
  };

  return (
    <>
      <div className="flex items-center gap-1 text-xs">
        {/* Branch selector */}
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button
              variant="ghost"
              size="sm"
              className="h-6 text-xs px-2 text-muted-foreground hover:text-foreground gap-1 font-mono"
            >
              <GitBranch className="h-3 w-3" />
              {status.branch || "HEAD"}
              <ChevronDown className="h-2.5 w-2.5 opacity-50" />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="start" className="min-w-50">
            {branches?.map((b: GitBranchInfo) => (
              <DropdownMenuItem
                key={b.name}
                onClick={() => {
                  if (!b.current) handleCheckout(b.name);
                }}
                className="font-mono text-xs"
              >
                <div className="flex items-center gap-2 w-full">
                  {b.current ? (
                    <Check className="h-3 w-3 text-primary shrink-0" />
                  ) : (
                    <div className="w-3" />
                  )}
                  <span className="flex-1">{b.name}</span>
                  {b.upstream && (
                    <span className="text-muted-foreground text-[10px]">{b.upstream}</span>
                  )}
                </div>
              </DropdownMenuItem>
            ))}
            <DropdownMenuSeparator />
            <DropdownMenuItem onClick={() => setBranchDialogOpen(true)}>
              <Plus className="h-3 w-3 mr-2" />
              New Branch...
            </DropdownMenuItem>
            {hasRemote && (
              <>
                <DropdownMenuSeparator />
                <DropdownMenuItem onClick={handlePush} disabled={pushMutation.isPending}>
                  <CloudUpload className="h-3 w-3 mr-2" />
                  Push
                </DropdownMenuItem>
                <DropdownMenuItem onClick={handlePull} disabled={pullMutation.isPending}>
                  <CloudDownload className="h-3 w-3 mr-2" />
                  Pull
                </DropdownMenuItem>
                <DropdownMenuItem onClick={handleFetch} disabled={fetchMutation.isPending}>
                  <RefreshCw className="h-3 w-3 mr-2" />
                  Fetch All
                </DropdownMenuItem>
              </>
            )}
            <DropdownMenuSeparator />
            <DropdownMenuItem onClick={() => setRemoteDialogOpen(true)}>
              <Globe className="h-3 w-3 mr-2" />
              Manage Remotes...
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>

        {/* Ahead indicator — click to push */}
        {hasRemote && status.ahead != null && status.ahead > 0 && (
          <Tooltip>
            <TooltipTrigger asChild>
              <Button
                variant="ghost"
                size="sm"
                className="h-6 px-1 text-[10px] text-muted-foreground hover:text-foreground gap-0.5"
                onClick={handlePush}
                disabled={pushMutation.isPending}
              >
                {pushMutation.isPending ? (
                  <Spinner className="h-2.5 w-2.5" />
                ) : (
                  <ArrowUp className="h-2.5 w-2.5" />
                )}
                {status.ahead}
              </Button>
            </TooltipTrigger>
            <TooltipContent side="top">
              <p>
                Push {status.ahead} commit{status.ahead > 1 ? "s" : ""} to {status.upstream}
              </p>
            </TooltipContent>
          </Tooltip>
        )}

        {/* Behind indicator — click to pull */}
        {hasRemote && status.behind != null && status.behind > 0 && (
          <Tooltip>
            <TooltipTrigger asChild>
              <Button
                variant="ghost"
                size="sm"
                className="h-6 px-1 text-[10px] text-muted-foreground hover:text-foreground gap-0.5"
                onClick={handlePull}
                disabled={pullMutation.isPending}
              >
                {pullMutation.isPending ? (
                  <Spinner className="h-2.5 w-2.5" />
                ) : (
                  <ArrowDown className="h-2.5 w-2.5" />
                )}
                {status.behind}
              </Button>
            </TooltipTrigger>
            <TooltipContent side="top">
              <p>
                Pull {status.behind} commit{status.behind > 1 ? "s" : ""} from {status.upstream}
              </p>
            </TooltipContent>
          </Tooltip>
        )}

        {/* Sync button when up to date */}
        {hasRemote &&
          (status.ahead === 0 || status.ahead == null) &&
          (status.behind === 0 || status.behind == null) && (
            <Tooltip>
              <TooltipTrigger asChild>
                <Button
                  variant="ghost"
                  size="sm"
                  className="h-6 px-1 text-[10px] text-muted-foreground hover:text-foreground"
                  onClick={handleFetch}
                  disabled={fetchMutation.isPending}
                >
                  {fetchMutation.isPending ? (
                    <Spinner className="h-2.5 w-2.5" />
                  ) : (
                    <RefreshCw className="h-2.5 w-2.5" />
                  )}
                </Button>
              </TooltipTrigger>
              <TooltipContent side="top">
                <p>Fetch from all remotes</p>
              </TooltipContent>
            </Tooltip>
          )}

        {/* No remote — show add remote button */}
        {!hasRemote && (
          <Tooltip>
            <TooltipTrigger asChild>
              <Button
                variant="ghost"
                size="sm"
                className="h-6 px-1 text-[10px] text-muted-foreground hover:text-foreground"
                onClick={() => setRemoteDialogOpen(true)}
              >
                <Globe className="h-2.5 w-2.5" />
              </Button>
            </TooltipTrigger>
            <TooltipContent side="top">
              <p>Add a remote to enable push/pull</p>
            </TooltipContent>
          </Tooltip>
        )}

        {/* Dirty indicator + quick commit */}
        {status.isDirty && (
          <Tooltip>
            <TooltipTrigger asChild>
              <Button
                variant="ghost"
                size="sm"
                className="h-6 text-xs px-1.5 text-amber-500 hover:text-amber-400 gap-1"
                onClick={() => setCommitDialogOpen(true)}
              >
                <Circle className="h-2 w-2 fill-current" />
                <span>
                  {totalChanges} change{totalChanges !== 1 ? "s" : ""}
                </span>
              </Button>
            </TooltipTrigger>
            <TooltipContent side="top">
              <div className="text-xs">
                {status.stagedCount > 0 && <p>{status.stagedCount} staged</p>}
                {status.unstagedCount > 0 && <p>{status.unstagedCount} modified</p>}
                {status.untrackedCount > 0 && <p>{status.untrackedCount} untracked</p>}
                <p className="text-muted-foreground mt-1">Click to commit</p>
              </div>
            </TooltipContent>
          </Tooltip>
        )}

        {/* Clean indicator */}
        {!status.isDirty && status.headCommit && (
          <Tooltip>
            <TooltipTrigger asChild>
              <span className="inline-flex items-center gap-1 text-[10px] text-muted-foreground font-mono">
                <GitCommitHorizontal className="h-2.5 w-2.5" />
                {status.headCommit}
              </span>
            </TooltipTrigger>
            <TooltipContent side="top">
              <p>Working tree clean — HEAD at {status.headCommit}</p>
            </TooltipContent>
          </Tooltip>
        )}
      </div>

      {/* Quick Commit Dialog */}
      <Dialog open={commitDialogOpen} onOpenChange={setCommitDialogOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <GitCommitHorizontal className="h-4 w-4" />
              Commit Changes
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            <div className="text-xs text-muted-foreground">
              {status.stagedCount + status.unstagedCount + status.untrackedCount} file(s) will be
              staged and committed.
            </div>
            <Input
              placeholder="Commit message..."
              value={commitMessage}
              onChange={(e) => setCommitMessage(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter" && !e.shiftKey) {
                  e.preventDefault();
                  handleQuickCommit();
                }
              }}
              autoFocus
            />
          </div>
          <DialogFooter>
            <Button variant="outline" size="sm" onClick={() => setCommitDialogOpen(false)}>
              Cancel
            </Button>
            <Button
              size="sm"
              onClick={handleQuickCommit}
              disabled={
                !commitMessage.trim() || stageAllMutation.isPending || commitMutation.isPending
              }
            >
              {commitMutation.isPending ? (
                <Spinner className="h-3.5 w-3.5 mr-1.5" />
              ) : (
                <Check className="h-3.5 w-3.5 mr-1.5" />
              )}
              Commit All
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* New Branch Dialog */}
      <Dialog open={branchDialogOpen} onOpenChange={setBranchDialogOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <GitBranch className="h-4 w-4" />
              Create Branch
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            <div className="text-xs text-muted-foreground">
              New branch will be created from current HEAD ({status.headCommit || "initial"}).
            </div>
            <Input
              placeholder="Branch name (e.g. feature/add-users)"
              value={newBranchName}
              onChange={(e) => setNewBranchName(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter" && !e.shiftKey) {
                  e.preventDefault();
                  handleCreateBranch();
                }
              }}
              autoFocus
            />
          </div>
          <DialogFooter>
            <Button variant="outline" size="sm" onClick={() => setBranchDialogOpen(false)}>
              Cancel
            </Button>
            <Button
              size="sm"
              onClick={handleCreateBranch}
              disabled={!newBranchName.trim() || createBranchMutation.isPending}
            >
              {createBranchMutation.isPending ? (
                <Spinner className="h-3.5 w-3.5 mr-1.5" />
              ) : (
                <Plus className="h-3.5 w-3.5 mr-1.5" />
              )}
              Create & Switch
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Remote Config Dialog */}
      <RemoteConfigDialog
        open={remoteDialogOpen}
        onOpenChange={setRemoteDialogOpen}
        projectDir={projectDir}
      />
    </>
  );
}
