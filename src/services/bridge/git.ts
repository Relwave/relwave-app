import { GitBranchInfo, GitFileChange, GitLogEntry, GitPushPullResult, GitRemoteInfo, GitStatus } from "@/features/git/types";
import { bridgeRequest } from "./bridgeClient";

class GitService {
    /**
  * Get git repository status for a directory
  */
    async gitStatus(dir: string): Promise<GitStatus> {
        const result = await bridgeRequest("git.status", { dir });
        return result?.data;
    }

    /**
     * Initialize a new git repo in the given directory
     */
    async gitInit(dir: string, defaultBranch = "main"): Promise<GitStatus> {
        const result = await bridgeRequest("git.init", { dir, defaultBranch });
        return result?.data;
    }

    /**
     * Get list of changed files
     */
    async gitChanges(dir: string): Promise<GitFileChange[]> {
        const result = await bridgeRequest("git.changes", { dir });
        return result?.data || [];
    }

    /**
     * Stage specific files
     */
    async gitStage(dir: string, files: string[]): Promise<void> {
        await bridgeRequest("git.stage", { dir, files });
    }

    /**
     * Stage all changes
     */
    async gitStageAll(dir: string): Promise<void> {
        await bridgeRequest("git.stageAll", { dir });
    }

    /**
     * Unstage specific files
     */
    async gitUnstage(dir: string, files: string[]): Promise<void> {
        await bridgeRequest("git.unstage", { dir, files });
    }

    /**
     * Commit staged changes
     */
    async gitCommit(dir: string, message: string): Promise<{ hash: string }> {
        const result = await bridgeRequest("git.commit", { dir, message });
        return result?.data;
    }

    /**
     * Get recent commit history
     */
    async gitLog(dir: string, count = 20): Promise<GitLogEntry[]> {
        const result = await bridgeRequest("git.log", { dir, count });
        return result?.data || [];
    }

    /**
     * Get detailed commit log for graph visualization
     */
    async gitLogGraph(dir: string, count = 100): Promise<GitLogEntry[]> {
        const result = await bridgeRequest("git.logGraph", { dir, count });
        console.log(result, "gitLogGraph result");
        return result?.data || [];
    }

    /**
     * List all branches
     */
    async gitBranches(dir: string): Promise<GitBranchInfo[]> {
        const result = await bridgeRequest("git.branches", { dir });
        return result?.data || [];
    }

    /**
     * Create and checkout a new branch
     */
    async gitCreateBranch(dir: string, name: string): Promise<{ branch: string }> {
        const result = await bridgeRequest("git.createBranch", { dir, name });
        return result?.data;
    }

    /**
     * Checkout an existing branch
     */
    async gitCheckout(dir: string, name: string): Promise<{ branch: string }> {
        const result = await bridgeRequest("git.checkout", { dir, name });
        return result?.data;
    }

    /**
     * Discard unstaged changes for specific files
     */
    async gitDiscard(dir: string, files: string[]): Promise<void> {
        await bridgeRequest("git.discard", { dir, files });
    }

    /**
     * Stash all changes
     */
    async gitStash(dir: string, message?: string): Promise<void> {
        await bridgeRequest("git.stash", { dir, message });
    }

    /**
     * Pop latest stash
     */
    async gitStashPop(dir: string): Promise<void> {
        await bridgeRequest("git.stashPop", { dir });
    }

    /**
     * Get diff for a file (or all files)
     */
    async gitDiff(dir: string, file?: string, staged = false): Promise<string> {
        const result = await bridgeRequest("git.diff", { dir, file, staged });
        return result?.data?.diff || "";
    }

    /**
     * Ensure .gitignore has RelWave rules
     */
    async gitEnsureIgnore(dir: string): Promise<{ modified: boolean }> {
        const result = await bridgeRequest("git.ensureIgnore", { dir });
        return result?.data;
    }

    /** List all configured remotes */
    async gitRemoteList(dir: string): Promise<GitRemoteInfo[]> {
        const result = await bridgeRequest("git.remoteList", { dir });
        return result?.data || [];
    }

    /** Add a named remote */
    async gitRemoteAdd(dir: string, name: string, url: string): Promise<void> {
        await bridgeRequest("git.remoteAdd", { dir, name, url });
    }

    /** Remove a named remote */
    async gitRemoteRemove(dir: string, name: string): Promise<void> {
        await bridgeRequest("git.remoteRemove", { dir, name });
    }

    /** Get the URL of a remote */
    async gitRemoteGetUrl(dir: string, name = "origin"): Promise<string | null> {
        const result = await bridgeRequest("git.remoteGetUrl", { dir, name });
        return result?.data?.url || null;
    }

    /** Change the URL of an existing remote */
    async gitRemoteSetUrl(dir: string, name: string, url: string): Promise<void> {
        await bridgeRequest("git.remoteSetUrl", { dir, name, url });
    }

    // ------------------------------------
    // 14. GIT PUSH / PULL / FETCH (P3)
    // ------------------------------------

    /** Push commits to a remote */
    async gitPush(
        dir: string,
        remote = "origin",
        branch?: string,
        options?: { force?: boolean; setUpstream?: boolean }
    ): Promise<GitPushPullResult> {
        const result = await bridgeRequest("git.push", { dir, remote, branch, ...options });
        return result?.data || { output: "" };
    }

    /** Pull from a remote */
    async gitPull(
        dir: string,
        remote = "origin",
        branch?: string,
        options?: { rebase?: boolean }
    ): Promise<GitPushPullResult> {
        const result = await bridgeRequest("git.pull", { dir, remote, branch, ...options });
        return result?.data || { output: "" };
    }

    /** Fetch from a remote (or all) */
    async gitFetch(
        dir: string,
        remote?: string,
        options?: { prune?: boolean; all?: boolean }
    ): Promise<GitPushPullResult> {
        const result = await bridgeRequest("git.fetch", { dir, remote, ...options });
        return result?.data || { output: "" };
    }

    // ------------------------------------
    // 15. GIT REVERT (Rollback)
    // ------------------------------------

    /** Revert a specific commit */
    async gitRevert(dir: string, hash: string, noCommit = false): Promise<GitPushPullResult> {
        const result = await bridgeRequest("git.revert", { dir, hash, noCommit });
        return result?.data || { output: "" };
    }
}

export const gitService = new GitService();