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

    /** Author name */
    author: string;

    /** Commit date as ISO string */
    date: string;

    /** First line of commit message */
    subject: string;
}

export interface GitBranchInfo {
    /** Branch name */
    name: string;

    /** Is this the current branch? */
    current: boolean;

    /** Remote tracking branch (null for local-only branches) */
    upstream: string | null;
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
                    const y = line[1]; // unstaged status

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
            const format = ["%h", "%H", "%an", "%aI", "%s"].join(SEP);
            const output = await this.git(
                dir,
                "log",
                `--max-count=${count}`,
                `--format=${format}`
            );

            if (!output) return [];

            return output.split("\n").map((line) => {
                const [hash, fullHash, author, date, subject] = line.split(SEP);
                return { hash, fullHash, author, date, subject };
            });
        } catch {
            return []; // No commits yet
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
            const format = ["%h", "%H", "%an", "%aI", "%s"].join(SEP);
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
            return output.split("\n").map((line) => {
                const [hash, fullHash, author, date, subject] = line.split(SEP);
                return { hash, fullHash, author, date, subject };
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
}

export const gitServiceInstance = new GitService();
