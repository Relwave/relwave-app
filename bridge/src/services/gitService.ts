// ----------------------------
// services/gitService.ts
// ----------------------------
//
// Lightweight git integration that shells out to `git` CLI.
// No npm dependency required — just needs git on PATH.

import { execFile } from "child_process";
import { promisify } from "util";
import path from "path";
import fsSync from "fs";

const execFileAsync = promisify(execFile);

export interface GitStatus {
    /** Whether the directory is inside a git repository */
    isGitRepo: boolean;

    /** Current branch name (e.g. "main", "feature/auth") */
    branch: string | null;

    /** Short commit hash of HEAD */
    headCommit: string | null;

    /** Whether there are uncommitted changes (staged or unstaged) */
    isDirty: boolean;

    /** Number of files with staged changes */
    stagedCount: number;

    /** Number of files with unstaged changes */
    unstagedCount: number;

    /** Number of untracked files */
    untrackedCount: number;

    /** Number of commits ahead of upstream (null if no upstream) */
    ahead: number | null;

    /** Number of commits behind upstream (null if no upstream) */
    behind: number | null;

    /** Remote tracking branch (e.g. "origin/main") */
    upstream: string | null;
}

export interface GitFileChange {
    /** Relative file path */
    path: string;

    /** Git status code: M=modified, A=added, D=deleted, ?=untracked, R=renamed */
    status: string;

    /** Whether this change is staged */
    staged: boolean;
}

export interface GitLogEntry {
    /** Short commit hash */
    hash: string;

    /** Full commit hash */
    fullHash: string;

    /** Parent hashes (space-separated) */
    parents: string[];

    /** Author name */
    author: string;

    /** Commit date as ISO string */
    date: string;

    /** First line of commit message */
    subject: string;

    /** Ref names (branches, tags) */
    refs: string;
}

export interface GitBranchInfo {
    /** Branch name */
    name: string;
    /** Is this the current branch? */
    current: boolean;
    /** Remote tracking branch (null for local-only branches) */
    upstream: string | null;
}

export type GitSyncResult = {
  staged: string[];
  commitHash: string;
  commitMessage: string;
  pushed: boolean;
  error?: { code: string; message: string };
};

export class GitError extends Error {
  code: string;
  constructor(code: string, message: string) {
    super(message);
    this.code = code;
    this.name = "GitError";
  }
}

export class GitService {
    /**
     * Run a git command in a specific directory.
     * Returns stdout. Throws on non-zero exit.
     */
    private async git(cwd: string, ...args: string[]): Promise<string> {
        try {
            const { stdout } = await execFileAsync("git", args, {
                cwd,
                maxBuffer: 10 * 1024 * 1024, // 10 MB
                timeout: 30_000,
                windowsHide: true,
            });
            return stdout.trimEnd();
        } catch (err: any) {
            // Git returns exit code 128 for "not a git repo" etc.
            if (err.code === "ENOENT") {
                throw new Error("Git is not installed or not on PATH");
            }
            throw err;
        }
    }

    /**
     * Check if git is available on this machine
     */
    async isGitInstalled(): Promise<boolean> {
        try {
            await execFileAsync("git", ["--version"], {
                timeout: 5000,
                windowsHide: true,
            });
            return true;
        } catch {
            return false;
        }
    }

    /**
     * Check if a directory is inside a git repository
     */
    async isRepo(dir: string): Promise<boolean> {
        try {
            await this.git(dir, "rev-parse", "--is-inside-work-tree");
            return true;
        } catch {
            return false;
        }
    }

    /**
     * Get the root directory of the git repository
     */
    async getRepoRoot(dir: string): Promise<string> {
        return this.git(dir, "rev-parse", "--show-toplevel");
    }

    /**
     * Resolve a ref (tag, branch, HEAD~1, etc.) to a full commit hash.
     * Returns null if the ref cannot be resolved.
     */
    async resolveRef(dir: string, ref: string): Promise<string | null> {
        try {
            return await this.git(dir, "rev-list", "-n1", ref);
        } catch {
            return null;
        }
    }

    /**
     * Initialize a new git repository
     */
    async init(dir: string, defaultBranch = "main"): Promise<void> {
        await this.git(dir, "init", "-b", defaultBranch);
    }

    /**
     * Get comprehensive git status for a directory
     */
    async getStatus(dir: string): Promise<GitStatus> {
        const isGitRepo = await this.isRepo(dir);

        if (!isGitRepo) {
            return {
                isGitRepo: false,
                branch: null,
                headCommit: null,
                isDirty: false,
                stagedCount: 0,
                unstagedCount: 0,
                untrackedCount: 0,
                ahead: null,
                behind: null,
                upstream: null,
            };
        }

        // Get branch + upstream + ahead/behind in one call
        let branch: string | null = null;
        let headCommit: string | null = null;
        let upstream: string | null = null;
        let ahead: number | null = null;
        let behind: number | null = null;

        try {
            // --porcelain=v2 --branch gives structured branch info
            const branchOutput = await this.git(
                dir,
                "status",
                "--porcelain=v2",
                "--branch"
            );

            for (const line of branchOutput.split("\n")) {
                if (line.startsWith("# branch.head ")) {
                    branch = line.slice("# branch.head ".length);
                } else if (line.startsWith("# branch.oid ")) {
                    headCommit = line.slice("# branch.oid ".length).slice(0, 8);
                } else if (line.startsWith("# branch.upstream ")) {
                    upstream = line.slice("# branch.upstream ".length);
                } else if (line.startsWith("# branch.ab ")) {
                    const match = line.match(/\+(\d+) -(\d+)/);
                    if (match) {
                        ahead = parseInt(match[1], 10);
                        behind = parseInt(match[2], 10);
                    }
                }
            }
        } catch {
            // HEAD might be unborn (initial commit)
            branch = "(no commits)";
        }

        // Get file-level status
        let stagedCount = 0;
        let unstagedCount = 0;
        let untrackedCount = 0;

        try {
            const statusOutput = await this.git(
                dir,
                "status",
                "--porcelain=v1",
                "-uall"
            );

            if (statusOutput) {
                for (const line of statusOutput.split("\n")) {
                    if (!line) continue;
                    const x = line[0]; // staged status
                    const y = line[1]; // working tree

                    if (x === "?" && y === "?") {
                        untrackedCount++;
                    } else {
                        if (x !== " " && x !== "?") stagedCount++;
                        if (y !== " " && y !== "?") unstagedCount++;
                    }
                }
            }
        } catch {
            // Ignore — might be empty repo
        }

        return {
            isGitRepo: true,
            branch,
            headCommit,
            isDirty: stagedCount > 0 || unstagedCount > 0 || untrackedCount > 0,
            stagedCount,
            unstagedCount,
            untrackedCount,
            ahead,
            behind,
            upstream,
        };
    }

    /**
     * Get list of changed files with their status
     */
    async getChangedFiles(dir: string): Promise<GitFileChange[]> {
        const output = await this.git(dir, "status", "--porcelain=v1", "-uall");
        if (!output) return [];

        const changes: GitFileChange[] = [];

        for (const line of output.split("\n")) {
            if (!line || line.length < 4) continue;
            const x = line[0]; // index (staged)
            const y = line[1]; // working tree
            const filePath = line.slice(3);

            // Staged change
            if (x !== " " && x !== "?") {
                changes.push({ path: filePath, status: x, staged: true });
            }
            // Unstaged change
            if (y !== " " && y !== "?") {
                changes.push({ path: filePath, status: y, staged: false });
            }
            // Untracked
            if (x === "?" && y === "?") {
                changes.push({ path: filePath, status: "?", staged: false });
            }
        }

        return changes;
    }

    /**
     * Stage files for commit
     */
    async stageFiles(dir: string, files: string[]): Promise<void> {
        if (files.length === 0) return;
        await this.git(dir, "add", "--", ...files);
    }

    /**
     * Stage all changes
     */
    async stageAll(dir: string): Promise<void> {
        await this.git(dir, "add", "-A");
    }

    /**
     * Unstage files
     */
    async unstageFiles(dir: string, files: string[]): Promise<void> {
        if (files.length === 0) return;
        await this.git(dir, "reset", "HEAD", "--", ...files);
    }

    /**
     * Commit staged changes
     */
    async commit(dir: string, message: string): Promise<string> {
        const output = await this.git(dir, "commit", "-m", message);
        // Extract short hash from output like "[main abc1234] message"
        const match = output.match(/\[[\w/.-]+ ([a-f0-9]+)\]/);
        return match?.[1] ?? "";
    }

    /**
     * Get recent commit log
     */
    async log(dir: string, count = 20): Promise<GitLogEntry[]> {
        try {
            const SEP = "<<SEP>>";
            const format = ["%h", "%H", "%p", "%an", "%aI", "%s", "%D"].join(SEP);
            const output = await this.git(
                dir,
                "log",
                `--max-count=${count}`,
                `--format=${format}`
            );

            if (!output) return [];

            return output.split("\n").filter(Boolean).map((line) => {
                const [hash, fullHash, parents, author, date, subject, refs] = line.split(SEP);
                return { 
                    hash, 
                    fullHash, 
                    parents: parents ? parents.split(" ") : [], 
                    author, 
                    date, 
                    subject, 
                    refs: refs || "" 
                };
            });
        } catch {
            return []; // No commits yet
        }
    }

    /**
     * Get detailed commit log for graph visualization
     */
    async logGraph(dir: string, count = 100): Promise<GitLogEntry[]> {
        try {
            // %h: short hash, %H: full hash, %p: abbreviated parent hashes, %an: author name, %aI: author date ISO, %s: subject, %D: ref names
            const SEP = "<<SEP>>";
            const format = ["%h", "%H", "%p", "%an", "%aI", "%s", "%D"].join(SEP);
            const output = await this.git(
                dir,
                "log",
                `--max-count=${count}`,
                `--format=${format}`,
                "--all" // Include all branches
            );

            if (!output) return [];

            return output.split("\n").filter(Boolean).map((line) => {
                const [hash, fullHash, parents, author, date, subject, refs] = line.split(SEP);
                return { 
                    hash, 
                    fullHash, 
                    parents: parents ? parents.split(" ") : [], 
                    author, 
                    date, 
                    subject, 
                    refs: refs || "" 
                };
            });
        } catch (err: any) {
            return [];
        }
    }

    /**
     * List branches
     */
    async listBranches(dir: string): Promise<GitBranchInfo[]> {
        try {
            const output = await this.git(
                dir,
                "for-each-ref",
                "--format=%(refname:short)%09%(HEAD)%09%(upstream:short)",
                "refs/heads/"
            );

            if (!output) return [];

            return output.split("\n").map((line) => {
                const [name, head, upstream] = line.split("\t");
                return {
                    name,
                    current: head === "*",
                    upstream: upstream || null,
                };
            });
        } catch {
            return [];
        }
    }

    /**
     * Create and checkout a new branch
     */
    async createBranch(dir: string, name: string): Promise<void> {
        await this.git(dir, "checkout", "-b", name);
    }

    /**
     * Checkout an existing branch
     */
    async checkoutBranch(dir: string, name: string): Promise<void> {
        await this.git(dir, "checkout", name);
    }

    /**
     * Discard unstaged changes in a file
     */
    async discardChanges(dir: string, files: string[]): Promise<void> {
        if (files.length === 0) return;
        await this.git(dir, "checkout", "--", ...files);
    }

    /**
     * Stash all changes
     */
    async stash(dir: string, message?: string): Promise<void> {
        const args = ["stash", "push", "-u"];
        if (message) args.push("-m", message);
        await this.git(dir, ...args);
    }

    /**
     * Pop the latest stash
     */
    async stashPop(dir: string): Promise<void> {
        await this.git(dir, "stash", "pop");
    }

    /**
     * Get diff for a specific file (or all files)
     */
    async diff(dir: string, file?: string, staged = false): Promise<string> {
        const args = ["diff"];
        if (staged) args.push("--staged");
        if (file) args.push("--", file);
        return this.git(dir, ...args);
    }

    /**
     * Read a file's content at a given git ref (HEAD, branch, commit hash).
     * Returns null if the file doesn't exist at that ref.
     */
    async getFileAtRef(dir: string, filePath: string, ref = "HEAD"): Promise<string | null> {
        try {
            return await this.git(dir, "show", `${ref}:${filePath}`);
        } catch {
            return null; // file doesn't exist at this ref
        }
    }

    /**
     * List commits that touched a specific file
     */
    async fileLog(dir: string, filePath: string, count = 20): Promise<GitLogEntry[]> {
        try {
            const SEP = "<<SEP>>";
            const format = ["%h", "%H", "%p", "%an", "%aI", "%s", "%D"].join(SEP);
            const output = await this.git(
                dir,
                "log",
                `--max-count=${count}`,
                `--format=${format}`,
                "--follow",
                "--",
                filePath
            );
            if (!output) return [];
            return output.split("\n").filter(Boolean).map((line) => {
                const [hash, fullHash, parents, author, date, subject, refs] = line.split(SEP);
                return { 
                    hash, 
                    fullHash, 
                    parents: parents ? parents.split(" ") : [], 
                    author, 
                    date, 
                    subject, 
                    refs: refs || "" 
                };
            });
        } catch {
            return [];
        }
    }

    /**
     * Generate a .gitignore file suitable for RelWave projects
     */
    generateGitignore(): string {
        return [
            "# RelWave - auto-generated",
            "# Connection credentials (NEVER commit these)",
            "relwave.local.json",
            ".credentials",
            "",
            "# OS files",
            ".DS_Store",
            "Thumbs.db",
            "",
            "# Editor",
            ".vscode/",
            ".idea/",
            "*.swp",
            "*.swo",
            "",
        ].join("\n");
    }

    /**
     * Write a .gitignore if it doesn't already exist in the repo
     */
    async ensureGitignore(dir: string): Promise<boolean> {
        const gi = path.join(dir, ".gitignore");
        if (fsSync.existsSync(gi)) {
            // Append our rules if the file exists but doesn't contain them
            const existing = fsSync.readFileSync(gi, "utf-8");
            if (!existing.includes("relwave.local.json")) {
                fsSync.appendFileSync(
                    gi,
                    "\n\n" + this.generateGitignore(),
                    "utf-8"
                );
                return true; // modified
            }
            return false; // already has our rules
        }
        fsSync.writeFileSync(gi, this.generateGitignore(), "utf-8");
        return true; // created
    }

    // ==========================================
    // Tags
    // ==========================================

    /**
     * Create an annotated tag at the current HEAD (or a given ref)
     */
    async createTag(dir: string, tagName: string, message?: string, ref?: string): Promise<void> {
        const args = ["tag"];
        if (message) {
            args.push("-a", tagName, "-m", message);
        } else {
            args.push(tagName);
        }
        if (ref) args.push(ref);
        await this.git(dir, ...args);
    }

    /**
     * Delete a tag
     */
    async deleteTag(dir: string, tagName: string): Promise<void> {
        await this.git(dir, "tag", "-d", tagName);
    }

    /**
     * List tags with optional pattern filter.
     * Returns tag names sorted by creation date (newest first).
     */
    async listTags(dir: string, pattern?: string): Promise<string[]> {
        try {
            const args = ["tag", "-l", "--sort=-creatordate"];
            if (pattern) args.push(pattern);
            const output = await this.git(dir, ...args);
            if (!output) return [];
            return output.split("\n").filter(Boolean);
        } catch {
            return [];
        }
    }

    /**
     * Get the message of an annotated tag
     */
    async getTagMessage(dir: string, tagName: string): Promise<string | null> {
        try {
            return await this.git(dir, "tag", "-l", "-n99", tagName);
        } catch {
            return null;
        }
    }

    // ==========================================
    // Merge / Conflict detection
    // ==========================================

    /**
     * Get the merge-base (common ancestor commit) between two refs.
     * Returns full hash, or null if no common ancestor.
     */
    async mergeBase(dir: string, refA: string, refB: string): Promise<string | null> {
        try {
            const output = await this.git(dir, "merge-base", refA, refB);
            return output || null;
        } catch {
            return null;
        }
    }

    /**
     * Check if merging `source` into the current branch would produce conflicts,
     * without actually modifying the working tree.
     * Returns list of conflicting file paths, or empty if clean.
     */
    async dryMerge(dir: string, source: string): Promise<string[]> {
        try {
            // Try to merge in-memory (index only)
            await this.git(dir, "merge-tree", "--write-tree", "--no-messages", "HEAD", source);
            return []; // clean merge
        } catch (err: any) {
            // merge-tree exits non-zero when there are conflicts and lists them
            const output: string = err.stdout ?? err.message ?? "";
            const conflicts: string[] = [];
            for (const line of output.split("\n")) {
                // merge-tree outputs "CONFLICT (content): ..." lines
                if (line.startsWith("CONFLICT")) {
                    const match = line.match(/Merge conflict in (.+)/);
                    if (match) conflicts.push(match[1].trim());
                }
            }
            return conflicts.length > 0 ? conflicts : ["(unknown conflict)"];
        }
    }

    /**
     * Stage-and-commit specific files in one go (for auto-commit workflows).
     * Returns the short commit hash.
     */
    async commitFiles(dir: string, files: string[], message: string): Promise<string> {
        await this.git(dir, "add", "--", ...files);
        return this.commit(dir, message);
    }

    // ==========================================
    // Remote Management (P3)
    // ==========================================

    /**
     * List all remotes with their fetch/push URLs.
     */
    async remoteList(dir: string): Promise<{ name: string; fetchUrl: string; pushUrl: string }[]> {
        try {
            const output = await this.git(dir, "remote", "-v");
            if (!output) return [];

            const map = new Map<string, { fetchUrl: string; pushUrl: string }>();
            for (const line of output.split("\n")) {
                const match = line.match(/^(\S+)\s+(\S+)\s+\((fetch|push)\)$/);
                if (!match) continue;
                const [, name, url, type] = match;
                if (!map.has(name)) map.set(name, { fetchUrl: "", pushUrl: "" });
                const entry = map.get(name)!;
                if (type === "fetch") entry.fetchUrl = url;
                else entry.pushUrl = url;
            }

            return Array.from(map.entries()).map(([name, urls]) => ({ name, ...urls }));
        } catch {
            return [];
        }
    }

    /**
     * Add a named remote
     */
    async remoteAdd(dir: string, name: string, url: string): Promise<void> {
        await this.git(dir, "remote", "add", name, url);
    }

    /**
     * Remove a named remote
     */
    async remoteRemove(dir: string, name: string): Promise<void> {
        await this.git(dir, "remote", "remove", name);
    }

    /**
     * Get the URL of a remote
     */
    async remoteGetUrl(dir: string, name = "origin"): Promise<string | null> {
        try {
            return await this.git(dir, "remote", "get-url", name);
        } catch {
            return null;
        }
    }

    /**
     * Change the URL of an existing remote
     */
    async remoteSetUrl(dir: string, name: string, url: string): Promise<void> {
        await this.git(dir, "remote", "set-url", name, url);
    }

    // ==========================================
    // Push / Pull / Fetch (P3)
    // ==========================================

    /**
     * Push commits to a remote.
     * Returns push output text.
     */
    async push(
        dir: string,
        remote = "origin",
        branch?: string,
        options?: { force?: boolean; setUpstream?: boolean }
    ): Promise<string> {
        const args = ["push"];
        if (options?.force) args.push("--force-with-lease");
        if (options?.setUpstream) args.push("--set-upstream");
        args.push(remote);
        if (branch) args.push(branch);
        return this.git(dir, ...args);
    }

    /**
     * Pull from a remote.
     * Returns pull output text.
     */
    async pull(
        dir: string,
        remote = "origin",
        branch?: string,
        options?: { rebase?: boolean }
    ): Promise<string> {
        const args = ["pull"];
        if (options?.rebase) args.push("--rebase");
        args.push(remote);
        if (branch) args.push(branch);
        return this.git(dir, ...args);
    }

    /**
     * Fetch from a remote (or all remotes).
     */
    async fetch(
        dir: string,
        remote?: string,
        options?: { prune?: boolean; all?: boolean }
    ): Promise<string> {
        const args = ["fetch"];
        if (options?.prune) args.push("--prune");
        if (options?.all || !remote) {
            args.push("--all");
        } else {
            args.push(remote);
        }
        return this.git(dir, ...args);
    }

    // ==========================================
    // Merge & Rebase (P3)
    // ==========================================

    /**
     * Merge a branch into the current branch.
     * Returns merge output. Throws on conflict.
     */
    async merge(
        dir: string,
        branch: string,
        options?: { noFF?: boolean; squash?: boolean; message?: string }
    ): Promise<string> {
        const args = ["merge"];
        if (options?.noFF) args.push("--no-ff");
        if (options?.squash) args.push("--squash");
        if (options?.message) args.push("-m", options.message);
        args.push(branch);
        return this.git(dir, ...args);
    }

    /**
     * Abort an in-progress merge
     */
    async abortMerge(dir: string): Promise<void> {
        await this.git(dir, "merge", "--abort");
    }

    /**
     * Rebase current branch onto target
     */
    async rebase(dir: string, onto: string): Promise<string> {
        return this.git(dir, "rebase", onto);
    }

    /**
     * Abort an in-progress rebase
     */
    async abortRebase(dir: string): Promise<void> {
        await this.git(dir, "rebase", "--abort");
    }

    /**
     * Continue a rebase after resolving conflicts
     */
    async continueRebase(dir: string): Promise<string> {
        return this.git(dir, "rebase", "--continue");
    }

    // ==========================================
    // History & Reversal (P3)
    // ==========================================

    /**
     * Revert a specific commit (creates a new commit that undoes the changes)
     */
    async revert(dir: string, commitHash: string, options?: { noCommit?: boolean }): Promise<string> {
        const args = ["revert"];
        if (options?.noCommit) args.push("--no-commit");
        args.push(commitHash);
        return this.git(dir, ...args);
    }

    /**
     * Cherry-pick a commit from another branch
     */
    async cherryPick(dir: string, commitHash: string, options?: { noCommit?: boolean }): Promise<string> {
        const args = ["cherry-pick"];
        if (options?.noCommit) args.push("--no-commit");
        args.push(commitHash);
        return this.git(dir, ...args);
    }

    /**
     * Get line-by-line blame for a file.
     * Returns array of blame entries.
     */
    async blame(dir: string, filePath: string): Promise<{
        hash: string;
        author: string;
        date: string;
        lineNumber: number;
        content: string;
    }[]> {
        try {
            const output = await this.git(
                dir,
                "blame",
                "--porcelain",
                "--",
                filePath
            );
            if (!output) return [];

            const entries: { hash: string; author: string; date: string; lineNumber: number; content: string }[] = [];
            const lines = output.split("\n");
            let i = 0;
            while (i < lines.length) {
                const header = lines[i];
                const headerMatch = header.match(/^([0-9a-f]{40})\s+\d+\s+(\d+)/);
                if (!headerMatch) { i++; continue; }
                const hash = headerMatch[1].slice(0, 8);
                const lineNumber = parseInt(headerMatch[2], 10);
                let author = "";
                let date = "";
                i++;
                // Read header fields until content line starting with \t
                while (i < lines.length && !lines[i].startsWith("\t")) {
                    if (lines[i].startsWith("author ")) author = lines[i].slice(7);
                    if (lines[i].startsWith("author-time ")) {
                        const ts = parseInt(lines[i].slice(12), 10);
                        date = new Date(ts * 1000).toISOString();
                    }
                    i++;
                }
                const content = i < lines.length ? lines[i].slice(1) : "";
                entries.push({ hash, author, date, lineNumber, content });
                i++;
            }
            return entries;
        } catch {
            return [];
        }
    }

    /**
     * Show a file at a specific ref (alias for getFileAtRef for consistency)
     */
    async show(dir: string, ref: string, filePath: string): Promise<string | null> {
        return this.getFileAtRef(dir, filePath, ref);
    }

    // ==========================================
    // Stash Management (P3)
    // ==========================================

    /**
     * List all stash entries
     */
    async stashList(dir: string): Promise<{ index: number; message: string; date: string }[]> {
        try {
            const SEP = "<<SEP>>";
            const output = await this.git(
                dir,
                "stash",
                "list",
                `--format=%gd${SEP}%s${SEP}%aI`
            );
            if (!output) return [];

            return output.split("\n").filter(Boolean).map((line) => {
                const [ref, message, date] = line.split(SEP);
                const indexMatch = ref.match(/\{(\d+)\}/);
                return {
                    index: indexMatch ? parseInt(indexMatch[1], 10) : 0,
                    message: message || ref,
                    date: date || "",
                };
            });
        } catch {
            return [];
        }
    }

    /**
     * Apply a specific stash entry (without removing it from the stash list)
     */
    async stashApply(dir: string, index = 0): Promise<void> {
        await this.git(dir, "stash", "apply", `stash@{${index}}`);
    }

    /**
     * Drop a specific stash entry
     */
    async stashDrop(dir: string, index = 0): Promise<void> {
        await this.git(dir, "stash", "drop", `stash@{${index}}`);
    }

    /**
     * Clear all stash entries
     */
    async stashClear(dir: string): Promise<void> {
        await this.git(dir, "stash", "clear");
    }

    // ==========================================
    // Clone (P3)
    // ==========================================

    /**
     * Clone a repository. Returns the path of the cloned directory.
     */
    async clone(url: string, dest: string, branch?: string): Promise<string> {
        const args = ["clone"];
        if (branch) args.push("-b", branch);
        args.push(url, dest);
        // cwd doesn't matter for clone, use dest's parent
        const parent = path.dirname(dest);
        await this.git(parent, ...args);
        return dest;
    }

    // ==========================================
    // Conflict Resolution Helpers (P3)
    // ==========================================

    /**
     * Check if there is a merge or rebase in progress
     */
    async getMergeState(dir: string): Promise<{
        mergeInProgress: boolean;
        rebaseInProgress: boolean;
        conflictedFiles: string[];
    }> {
        let mergeInProgress = false;
        let rebaseInProgress = false;

        try {
            const gitDir = await this.git(dir, "rev-parse", "--git-dir");
            const absGitDir = path.resolve(dir, gitDir);
            mergeInProgress = fsSync.existsSync(path.join(absGitDir, "MERGE_HEAD"));
            rebaseInProgress =
                fsSync.existsSync(path.join(absGitDir, "rebase-merge")) ||
                fsSync.existsSync(path.join(absGitDir, "rebase-apply"));
        } catch {
            // Not a repo or other error
        }

        // Get list of conflicted files
        const conflictedFiles: string[] = [];
        try {
            const output = await this.git(dir, "diff", "--name-only", "--diff-filter=U");
            if (output) {
                conflictedFiles.push(...output.split("\n").filter(Boolean));
            }
        } catch {
            // Ignore
        }

        return { mergeInProgress, rebaseInProgress, conflictedFiles };
    }

    /**
     * Mark conflicted files as resolved (stage them)
     */
    async markResolved(dir: string, files: string[]): Promise<void> {
        if (files.length === 0) return;
        await this.git(dir, "add", "--", ...files);
    }

    // ==========================================
    // Protection & Safety (P3)
    // ==========================================

    /**
     * Get the list of configured protected branch patterns.
     * By convention, reads from .relwave-protected-branches in the repo root.
     * Returns ["main", "production"] by default if the file doesn't exist.
     */
    getProtectedBranches(dir: string): string[] {
        try {
            const filePath = path.join(dir, ".relwave-protected-branches");
            if (fsSync.existsSync(filePath)) {
                return fsSync
                    .readFileSync(filePath, "utf-8")
                    .split("\n")
                    .map((l) => l.trim())
                    .filter(Boolean);
            }
        } catch {
            // Ignore
        }
        return ["main", "production"];
    }

    /**
     * Check if a branch name matches any protected pattern
     */
    isProtectedBranch(dir: string, branch: string): boolean {
        const patterns = this.getProtectedBranches(dir);
        return patterns.some((p) => {
            if (p.includes("*")) {
                const regex = new RegExp("^" + p.replace(/\*/g, ".*") + "$");
                return regex.test(branch);
            }
            return p === branch;
        });
    }

    /**
     * Delete a local branch (prevent deletion of the current branch)
     */
    async deleteBranch(dir: string, name: string, force = false): Promise<void> {
        const flag = force ? "-D" : "-d";
        await this.git(dir, "branch", flag, name);
    }

    /**
     * Rename the current branch
     */
    async renameBranch(dir: string, newName: string): Promise<void> {
        await this.git(dir, "branch", "-m", newName);
    }

    // ==========================================
    // Migration Sync (Task 1)
    // ==========================================

    /**
     * Stage migration files and lock file
     */
    async stageMigrationFiles(projectPath: string): Promise<string[]> {
        // Run git add on migrations/ and migration-lock.json
        // But first check if they exist or have changes
        const filesToStage = ["migrations", "migration-lock.json"];
        const stagedPaths: string[] = [];
        
        for (const file of filesToStage) {
            try {
                await this.git(projectPath, "add", file);
                stagedPaths.push(file);
            } catch (err) {
                // Ignore if path doesn't exist
            }
        }
        
        // Return actually staged files from status
        const changes = await this.getChangedFiles(projectPath);
        return changes.filter(c => c.staged).map(c => c.path);
    }

    /**
     * Commit migration files with an auto-generated or provided message
     */
    async commitMigrationFiles(projectPath: string, message?: string): Promise<string> {
        let commitMsg = message;
        
        if (!commitMsg) {
            // Auto-generate message based on staged files
            const changes = await this.getChangedFiles(projectPath);
            const stagedMigrations = changes.filter(c => c.staged && c.path.startsWith("migrations/"));
            
            if (stagedMigrations.length === 1) {
                const filename = path.basename(stagedMigrations[0].path);
                if (filename.includes("baseline")) {
                    commitMsg = "migrate: add baseline migration from schema snapshot";
                } else {
                    commitMsg = `migrate: apply ${filename}`;
                }
            } else if (stagedMigrations.length > 1) {
                // Find highest migration
                const sorted = stagedMigrations.map(m => path.basename(m.path)).sort();
                const latest = sorted[sorted.length - 1];
                commitMsg = `migrate: apply ${stagedMigrations.length} migrations up to ${latest}`;
            } else {
                commitMsg = "migrate: update schema lock";
            }
        }
        
        return this.commit(projectPath, commitMsg);
    }

    /**
     * Push current branch to remote
     */
    async pushMigrations(projectPath: string): Promise<void> {
        const remotes = await this.remoteList(projectPath);
        if (remotes.length === 0) {
            throw new GitError("NO_REMOTE", "No remote configured for this repository");
        }
        
        try {
            await this.git(projectPath, "push");
        } catch (err: any) {
            const errorMsg = err.stderr || err.message || "";
            if (errorMsg.includes("non-fast-forward") || errorMsg.includes("fetch first")) {
                throw new GitError("PUSH_REJECTED", "Push rejected due to diverged history");
            }
            throw new GitError("PUSH_FAILED", `Push failed: ${errorMsg}`);
        }
    }

    /**
     * Orchestrate staging, committing, and pushing
     */
    async syncMigrationFiles(projectPath: string, message?: string): Promise<GitSyncResult> {
        const result: GitSyncResult = {
            staged: [],
            commitHash: "",
            commitMessage: "",
            pushed: false,
        };

        try {
            result.staged = await this.stageMigrationFiles(projectPath);
            if (result.staged.length === 0) {
                return result; // Nothing to sync
            }
            
            result.commitHash = await this.commitMigrationFiles(projectPath, message);
            
            // Get actual message used if auto-generated
            if (!message && result.commitHash) {
                const log = await this.log(projectPath, 1);
                if (log.length > 0) result.commitMessage = log[0].subject;
            } else {
                result.commitMessage = message || "";
            }
            
            // Read config to see if autoPushMigrations is true
            let autoPush = false;
            try {
                const configPath = path.join(projectPath, "relwave.json");
                if (fsSync.existsSync(configPath)) {
                    const config = JSON.parse(fsSync.readFileSync(configPath, "utf-8"));
                    if (config.autoPushMigrations === true) {
                        autoPush = true;
                    }
                }
            } catch (err) {
                // Ignore config read errors
            }

            if (autoPush) {
                try {
                    await this.pushMigrations(projectPath);
                    result.pushed = true;
                } catch (pushErr: any) {
                    result.error = {
                        code: pushErr.code || "PUSH_FAILED",
                        message: pushErr.message
                    };
                }
            }

        } catch (err: any) {
            result.error = {
                code: err.code || "SYNC_FAILED",
                message: err.message
            };
        }
        
        return result;
    }

    /**
     * Stash, sync schema.json
     */
    async syncSchemaFile(projectPath: string, message?: string): Promise<GitSyncResult> {
        try {
            await this.ensureGitignore(projectPath);
            const changes = await this.getChangedFiles(projectPath);
            const schemaFile = "schema/schema.json";
            
            const schemaModified = changes.some(c => c.path === schemaFile);

            if (!schemaModified) {
                return { staged: [], commitHash: "", commitMessage: "", pushed: false };
            }

            await this.stageFiles(projectPath, [schemaFile]);
            
            const commitMessage = message || `chore: update schema.json cache`;
            const commitHash = await this.commit(projectPath, commitMessage);

            let pushed = false;
            try {
                await this.pushMigrations(projectPath);
                pushed = true;
            } catch (pushErr: any) {
                // Return result with push error but still considered successful commit
                return {
                    staged: [schemaFile],
                    commitHash,
                    commitMessage,
                    pushed: false,
                    error: {
                        code: "GIT_PUSH_FAILED",
                        message: `Committed successfully but failed to push: ${pushErr.message || String(pushErr)}`
                    }
                };
            }

            return {
                staged: [schemaFile],
                commitHash,
                commitMessage,
                pushed
            };
        } catch (error: any) {
            return {
                staged: [],
                commitHash: "",
                commitMessage: "",
                pushed: false,
                error: {
                    code: "GIT_SYNC_FAILED",
                    message: `Failed to sync schema file: ${error.message || String(error)}`
                }
            };
        }
    }
}

export const gitServiceInstance = new GitService();
