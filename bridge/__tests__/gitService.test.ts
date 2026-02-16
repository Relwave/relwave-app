import { afterAll, beforeEach,beforeAll, describe, expect, test } from "@jest/globals";
import { GitService } from "../src/services/gitService";
import fs from "fs/promises";
import fsSync from "fs";
import path from "path";
import os from "os";
import { execFile } from "child_process";
import { promisify } from "util";

const execFileAsync = promisify(execFile);

// ─── Test Setup ──────────────────────────────────────

const TEST_ROOT = path.join(os.tmpdir(), "git-service-test-" + Date.now());
let repoDir: string;
let git: GitService;
let testCounter = 0;

/**
 * Helper: run raw git commands in a directory
 */
async function rawGit(cwd: string, ...args: string[]): Promise<string> {
    const { stdout } = await execFileAsync("git", args, { cwd, windowsHide: true });
    return stdout.trimEnd();
}

/**
 * Helper: create a fresh temp repo for each test
 */
async function createTempRepo(): Promise<string> {
    testCounter++;
    const dir = path.join(TEST_ROOT, `repo-${testCounter}`);
    await fs.mkdir(dir, { recursive: true });
    await rawGit(dir, "init", "-b", "main");
    await rawGit(dir, "config", "user.email", "test@relwave.dev");
    await rawGit(dir, "config", "user.name", "Test User");
    return dir;
}

/**
 * Helper: create a file and commit it
 */
async function commitFile(dir: string, filename: string, content: string, message: string) {
    await fs.writeFile(path.join(dir, filename), content, "utf-8");
    await rawGit(dir, "add", filename);
    await rawGit(dir, "commit", "-m", message);
}

beforeAll(async () => {
    await fs.mkdir(TEST_ROOT, { recursive: true });
});

afterAll(async () => {
    if (fsSync.existsSync(TEST_ROOT)) {
        await fs.rm(TEST_ROOT, { recursive: true, force: true });
    }
});

beforeEach(async () => {
    git = new GitService();
    repoDir = await createTempRepo();
});

// ==========================================
// Basic Repo Operations
// ==========================================

describe("GitService — Basic Operations", () => {
    test("isGitInstalled returns true", async () => {
        const installed = await git.isGitInstalled();
        expect(installed).toBe(true);
    });

    test("isRepo returns true for initialized repo", async () => {
        expect(await git.isRepo(repoDir)).toBe(true);
    });

    test("isRepo returns false for non-repo directory", async () => {
        const plain = path.join(TEST_ROOT, "plain-" + Date.now());
        await fs.mkdir(plain, { recursive: true });
        expect(await git.isRepo(plain)).toBe(false);
    });

    test("init creates a new repository", async () => {
        const dir = path.join(TEST_ROOT, "new-init-" + Date.now());
        await fs.mkdir(dir, { recursive: true });
        await git.init(dir, "main");
        expect(await git.isRepo(dir)).toBe(true);
    });

    test("getRepoRoot returns the repository root", async () => {
        const root = await git.getRepoRoot(repoDir);
        // Normalize path separators for cross-platform comparison
        expect(path.normalize(root)).toBe(path.normalize(repoDir));
    });
});

// ==========================================
// Status
// ==========================================

describe("GitService — Status", () => {
    test("returns clean status for empty repo", async () => {
        const status = await git.getStatus(repoDir);
        expect(status.isGitRepo).toBe(true);
        expect(status.isDirty).toBe(false);
        expect(status.stagedCount).toBe(0);
        expect(status.unstagedCount).toBe(0);
        expect(status.untrackedCount).toBe(0);
    });

    test("returns not-a-repo status for plain directory", async () => {
        const dir = path.join(TEST_ROOT, "not-a-repo-" + Date.now());
        await fs.mkdir(dir, { recursive: true });

        const status = await git.getStatus(dir);
        expect(status.isGitRepo).toBe(false);
        expect(status.branch).toBeNull();
    });

    test("detects untracked files", async () => {
        await fs.writeFile(path.join(repoDir, "newfile.txt"), "hello", "utf-8");
        const status = await git.getStatus(repoDir);
        expect(status.isDirty).toBe(true);
        expect(status.untrackedCount).toBe(1);
    });

    test("detects staged files", async () => {
        await fs.writeFile(path.join(repoDir, "staged.txt"), "staged", "utf-8");
        await rawGit(repoDir, "add", "staged.txt");

        const status = await git.getStatus(repoDir);
        expect(status.stagedCount).toBe(1);
        expect(status.isDirty).toBe(true);
    });

    test("detects unstaged modifications", async () => {
        await commitFile(repoDir, "file.txt", "original", "initial");
        await fs.writeFile(path.join(repoDir, "file.txt"), "modified", "utf-8");

        const status = await git.getStatus(repoDir);
        expect(status.unstagedCount).toBe(1);
        expect(status.isDirty).toBe(true);
    });

    test("returns branch name", async () => {
        await commitFile(repoDir, "file.txt", "content", "first commit");
        const status = await git.getStatus(repoDir);
        expect(status.branch).toBe("main");
    });

    test("returns headCommit hash", async () => {
        await commitFile(repoDir, "file.txt", "content", "first commit");
        const status = await git.getStatus(repoDir);
        expect(status.headCommit).toBeDefined();
        expect(status.headCommit!.length).toBe(8);
    });
});

// ==========================================
// Changed Files
// ==========================================

describe("GitService — Changed Files", () => {
    test("returns empty for clean repo", async () => {
        await commitFile(repoDir, "file.txt", "content", "initial");
        const changes = await git.getChangedFiles(repoDir);
        expect(changes).toEqual([]);
    });

    test("detects untracked files", async () => {
        await fs.writeFile(path.join(repoDir, "new.txt"), "new", "utf-8");
        const changes = await git.getChangedFiles(repoDir);
        expect(changes).toHaveLength(1);
        expect(changes[0].status).toBe("?");
        expect(changes[0].staged).toBe(false);
        expect(changes[0].path).toBe("new.txt");
    });

    test("detects staged modifications", async () => {
        await commitFile(repoDir, "file.txt", "original", "init");
        await fs.writeFile(path.join(repoDir, "file.txt"), "changed", "utf-8");
        await rawGit(repoDir, "add", "file.txt");

        const changes = await git.getChangedFiles(repoDir);
        const staged = changes.filter((c) => c.staged);
        expect(staged.length).toBeGreaterThanOrEqual(1);
        expect(staged[0].status).toBe("M");
    });

    test("detects deleted files", async () => {
        await commitFile(repoDir, "file.txt", "content", "init");
        await fs.unlink(path.join(repoDir, "file.txt"));

        const changes = await git.getChangedFiles(repoDir);
        const deleted = changes.filter((c) => c.status === "D");
        expect(deleted.length).toBe(1);
    });
});

// ==========================================
// Staging & Committing
// ==========================================

describe("GitService — Stage & Commit", () => {
    test("stageFiles stages specific files", async () => {
        await fs.writeFile(path.join(repoDir, "a.txt"), "a", "utf-8");
        await fs.writeFile(path.join(repoDir, "b.txt"), "b", "utf-8");

        await git.stageFiles(repoDir, ["a.txt"]);

        const status = await git.getStatus(repoDir);
        expect(status.stagedCount).toBe(1);
        expect(status.untrackedCount).toBe(1);
    });

    test("stageFiles is no-op for empty array", async () => {
        // Should not throw
        await expect(git.stageFiles(repoDir, [])).resolves.not.toThrow();
    });

    test("stageAll stages everything", async () => {
        await fs.writeFile(path.join(repoDir, "a.txt"), "a", "utf-8");
        await fs.writeFile(path.join(repoDir, "b.txt"), "b", "utf-8");

        await git.stageAll(repoDir);

        const status = await git.getStatus(repoDir);
        expect(status.stagedCount).toBe(2);
        expect(status.untrackedCount).toBe(0);
    });

    test("commit returns a string (may be hash or empty)", async () => {
        await fs.writeFile(path.join(repoDir, "file.txt"), "data", "utf-8");
        await git.stageAll(repoDir);

        const hash = await git.commit(repoDir, "test commit");
        expect(typeof hash).toBe("string");

        // Verify the commit actually happened
        const log = await git.log(repoDir, 1);
        expect(log).toHaveLength(1);
        expect(log[0].subject).toBe("test commit");
    });

    test("unstageFiles removes files from staging", async () => {
        await fs.writeFile(path.join(repoDir, "file.txt"), "data", "utf-8");
        await git.stageAll(repoDir);
        expect((await git.getStatus(repoDir)).stagedCount).toBe(1);

        await git.unstageFiles(repoDir, ["file.txt"]);
        // After unstaging a new file, it goes back to untracked
        const status = await git.getStatus(repoDir);
        expect(status.stagedCount).toBe(0);
    });

    test("commitFiles stages and commits in one call", async () => {
        await commitFile(repoDir, "base.txt", "base", "initial"); // Need a first commit
        await fs.writeFile(path.join(repoDir, "auto.txt"), "auto", "utf-8");

        const hash = await git.commitFiles(repoDir, ["auto.txt"], "auto commit");
        expect(hash).toBeDefined();

        const status = await git.getStatus(repoDir);
        expect(status.isDirty).toBe(false);
    });
});

// ==========================================
// Log & History
// ==========================================

describe("GitService — Log", () => {
    test("returns empty log for fresh repo", async () => {
        const entries = await git.log(repoDir);
        expect(entries).toEqual([]);
    });

    test("returns commit entries", async () => {
        await commitFile(repoDir, "a.txt", "a", "first commit");
        await commitFile(repoDir, "b.txt", "b", "second commit");

        const entries = await git.log(repoDir);
        expect(entries).toHaveLength(2);
        expect(entries[0].subject).toBe("second commit");
        expect(entries[1].subject).toBe("first commit");
    });

    test("entries have correct fields", async () => {
        await commitFile(repoDir, "file.txt", "data", "test message");

        const [entry] = await git.log(repoDir, 1);
        expect(entry.hash).toBeDefined();
        expect(entry.fullHash).toBeDefined();
        expect(entry.author).toBe("Test User");
        expect(entry.date).toBeDefined();
        expect(entry.subject).toBe("test message");
    });

    test("respects count limit", async () => {
        for (let i = 0; i < 5; i++) {
            await commitFile(repoDir, `f${i}.txt`, `${i}`, `commit ${i}`);
        }

        const limited = await git.log(repoDir, 3);
        expect(limited).toHaveLength(3);
    });

    test("fileLog returns commits for specific file", async () => {
        await commitFile(repoDir, "a.txt", "v1", "commit a");
        await commitFile(repoDir, "b.txt", "v1", "commit b");
        await commitFile(repoDir, "a.txt", "v2", "update a");

        const aLog = await git.fileLog(repoDir, "a.txt");
        expect(aLog).toHaveLength(2);
        expect(aLog.map((e) => e.subject)).toEqual(["update a", "commit a"]);
    });
});

// ==========================================
// Branches
// ==========================================

describe("GitService — Branches", () => {
    beforeEach(async () => {
        await commitFile(repoDir, "init.txt", "init", "initial commit");
    });

    test("lists branches with current indicator", async () => {
        const branches = await git.listBranches(repoDir);
        expect(branches).toHaveLength(1);
        expect(branches[0].name).toBe("main");
        expect(branches[0].current).toBe(true);
    });

    test("creates and lists new branches", async () => {
        await git.createBranch(repoDir, "feature");

        const branches = await git.listBranches(repoDir);
        expect(branches).toHaveLength(2);

        const feature = branches.find((b) => b.name === "feature");
        expect(feature).toBeDefined();
        expect(feature!.current).toBe(true); // createBranch does checkout -b
    });

    test("checkout switches branches", async () => {
        await git.createBranch(repoDir, "feature");
        await git.checkoutBranch(repoDir, "main");

        const branches = await git.listBranches(repoDir);
        const main = branches.find((b) => b.name === "main");
        expect(main!.current).toBe(true);
    });

    test("resolveRef returns commit hash", async () => {
        const hash = await git.resolveRef(repoDir, "HEAD");
        expect(hash).toBeDefined();
        expect(hash!.length).toBe(40);
    });

    test("resolveRef returns null for invalid ref", async () => {
        const hash = await git.resolveRef(repoDir, "nonexistent");
        expect(hash).toBeNull();
    });
});

// ==========================================
// Discard & Stash
// ==========================================

describe("GitService — Discard & Stash", () => {
    beforeEach(async () => {
        await commitFile(repoDir, "file.txt", "original", "initial");
    });

    test("discardChanges restores file content", async () => {
        await fs.writeFile(path.join(repoDir, "file.txt"), "modified", "utf-8");
        await git.discardChanges(repoDir, ["file.txt"]);

        const content = await fs.readFile(path.join(repoDir, "file.txt"), "utf-8");
        expect(content).toBe("original");
    });

    test("stash saves and restores changes", async () => {
        await fs.writeFile(path.join(repoDir, "file.txt"), "modified", "utf-8");
        await git.stash(repoDir, "wip changes");

        // Working tree should be clean after stash
        const status = await git.getStatus(repoDir);
        expect(status.isDirty).toBe(false);

        // Pop restores
        await git.stashPop(repoDir);
        const content = await fs.readFile(path.join(repoDir, "file.txt"), "utf-8");
        expect(content).toBe("modified");
    });
});

// ==========================================
// Diff
// ==========================================

describe("GitService — Diff", () => {
    beforeEach(async () => {
        await commitFile(repoDir, "file.txt", "line1\nline2\n", "initial");
    });

    test("diff shows unstaged changes", async () => {
        await fs.writeFile(path.join(repoDir, "file.txt"), "line1\nline2\nline3\n", "utf-8");

        const diff = await git.diff(repoDir, "file.txt");
        expect(diff).toContain("+line3");
    });

    test("diff shows staged changes with --staged", async () => {
        await fs.writeFile(path.join(repoDir, "file.txt"), "changed\n", "utf-8");
        await rawGit(repoDir, "add", "file.txt");

        const diff = await git.diff(repoDir, "file.txt", true);
        expect(diff).toContain("-line1");
        expect(diff).toContain("+changed");
    });

    test("diff returns empty for no changes", async () => {
        const diff = await git.diff(repoDir);
        expect(diff).toBe("");
    });
});

// ==========================================
// Gitignore
// ==========================================

describe("GitService — Gitignore", () => {
    test("generateGitignore returns rules containing relwave.local.json", () => {
        const content = git.generateGitignore();
        expect(content).toContain("relwave.local.json");
        expect(content).toContain(".credentials");
        expect(content).toContain(".DS_Store");
    });

    test("ensureGitignore creates new file", async () => {
        const modified = await git.ensureGitignore(repoDir);
        expect(modified).toBe(true);

        const content = await fs.readFile(path.join(repoDir, ".gitignore"), "utf-8");
        expect(content).toContain("relwave.local.json");
    });

    test("ensureGitignore is idempotent", async () => {
        await git.ensureGitignore(repoDir);
        const secondCall = await git.ensureGitignore(repoDir);
        expect(secondCall).toBe(false);
    });

    test("ensureGitignore appends to existing file", async () => {
        await fs.writeFile(path.join(repoDir, ".gitignore"), "node_modules/\n", "utf-8");
        const modified = await git.ensureGitignore(repoDir);
        expect(modified).toBe(true);

        const content = await fs.readFile(path.join(repoDir, ".gitignore"), "utf-8");
        expect(content).toContain("node_modules/");
        expect(content).toContain("relwave.local.json");
    });
});

// ==========================================
// Remote Management
// ==========================================

describe("GitService — Remote Management", () => {
    beforeEach(async () => {
        await commitFile(repoDir, "init.txt", "init", "initial");
    });

    test("remoteList returns empty for no remotes", async () => {
        const remotes = await git.remoteList(repoDir);
        expect(remotes).toEqual([]);
    });

    test("remoteAdd and remoteList", async () => {
        await git.remoteAdd(repoDir, "origin", "https://github.com/test/repo.git");

        const remotes = await git.remoteList(repoDir);
        expect(remotes).toHaveLength(1);
        expect(remotes[0].name).toBe("origin");
        expect(remotes[0].fetchUrl).toBe("https://github.com/test/repo.git");
        expect(remotes[0].pushUrl).toBe("https://github.com/test/repo.git");
    });

    test("remoteRemove removes a remote", async () => {
        await git.remoteAdd(repoDir, "origin", "https://github.com/test/repo.git");
        await git.remoteRemove(repoDir, "origin");

        const remotes = await git.remoteList(repoDir);
        expect(remotes).toEqual([]);
    });

    test("remoteGetUrl returns URL", async () => {
        await git.remoteAdd(repoDir, "origin", "https://github.com/test/repo.git");
        const url = await git.remoteGetUrl(repoDir, "origin");
        expect(url).toBe("https://github.com/test/repo.git");
    });

    test("remoteGetUrl returns null for non-existent remote", async () => {
        const url = await git.remoteGetUrl(repoDir, "nonexistent");
        expect(url).toBeNull();
    });

    test("remoteSetUrl changes URL", async () => {
        await git.remoteAdd(repoDir, "origin", "https://old.url/repo.git");
        await git.remoteSetUrl(repoDir, "origin", "https://new.url/repo.git");

        const url = await git.remoteGetUrl(repoDir, "origin");
        expect(url).toBe("https://new.url/repo.git");
    });

    test("multiple remotes", async () => {
        await git.remoteAdd(repoDir, "origin", "https://github.com/main.git");
        await git.remoteAdd(repoDir, "upstream", "https://github.com/upstream.git");

        const remotes = await git.remoteList(repoDir);
        expect(remotes).toHaveLength(2);
        expect(remotes.map((r) => r.name).sort()).toEqual(["origin", "upstream"]);
    });
});

// ==========================================
// Tags
// ==========================================

describe("GitService — Tags", () => {
    beforeEach(async () => {
        await commitFile(repoDir, "init.txt", "init", "initial commit");
    });

    test("createTag creates a lightweight tag", async () => {
        await git.createTag(repoDir, "v1.0.0");
        const tags = await git.listTags(repoDir);
        expect(tags).toContain("v1.0.0");
    });

    test("createTag creates an annotated tag", async () => {
        await git.createTag(repoDir, "v2.0.0", "Release 2.0");
        const tags = await git.listTags(repoDir);
        expect(tags).toContain("v2.0.0");
    });

    test("deleteTag removes a tag", async () => {
        await git.createTag(repoDir, "v1.0.0");
        await git.deleteTag(repoDir, "v1.0.0");
        const tags = await git.listTags(repoDir);
        expect(tags).not.toContain("v1.0.0");
    });

    test("listTags returns all tags", async () => {
        await git.createTag(repoDir, "v1.0.0");
        await commitFile(repoDir, "b.txt", "b", "second");
        await git.createTag(repoDir, "v2.0.0");

        const tags = await git.listTags(repoDir);
        expect(tags).toHaveLength(2);
        expect(tags).toContain("v1.0.0");
        expect(tags).toContain("v2.0.0");
    });
});

// ==========================================
// Revert
// ==========================================

describe("GitService — Revert", () => {
    test("revert creates a revert commit", async () => {
        await commitFile(repoDir, "file.txt", "version1", "commit 1");
        await commitFile(repoDir, "file.txt", "version2", "commit 2");

        const log = await git.log(repoDir, 1);
        await git.revert(repoDir, log[0].hash);

        const afterLog = await git.log(repoDir);
        expect(afterLog[0].subject).toContain("Revert");
    });
});

// ==========================================
// File at Ref
// ==========================================

describe("GitService — File at Ref", () => {
    test("getFileAtRef returns file content at HEAD", async () => {
        await commitFile(repoDir, "file.txt", "hello world", "add file");
        const content = await git.getFileAtRef(repoDir, "file.txt", "HEAD");
        expect(content).toBe("hello world");
    });

    test("getFileAtRef returns null for missing file", async () => {
        await commitFile(repoDir, "file.txt", "data", "init");
        const content = await git.getFileAtRef(repoDir, "nonexistent.txt", "HEAD");
        expect(content).toBeNull();
    });

    test("show is alias for getFileAtRef", async () => {
        await commitFile(repoDir, "file.txt", "show me", "add");
        const content = await git.show(repoDir, "HEAD", "file.txt");
        expect(content).toBe("show me");
    });
});
