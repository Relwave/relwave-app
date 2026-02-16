import { describe, expect, test, jest, beforeEach } from "@jest/globals";
import { GitHandlers } from "../src/handlers/gitHandlers";
import type { GitService } from "../src/services/gitService";
import type { Rpc } from "../src/types";

// ─── Mock Factory ──────────────────────────────────

function createMockRpc(): Rpc & {
    _responses: any[];
    _errors: any[];
} {
    const responses: any[] = [];
    const errors: any[] = [];
    return {
        sendResponse: jest.fn((id: number | string, payload: any) => {
            responses.push({ id, payload });
        }),
        sendError: jest.fn((id: number | string, err: any) => {
            errors.push({ id, err });
        }),
        _responses: responses,
        _errors: errors,
    };
}

function createMockLogger(): any {
    return {
        info: jest.fn(),
        warn: jest.fn(),
        error: jest.fn(),
        debug: jest.fn(),
        child: jest.fn().mockReturnThis(),
    };
}

function createMockGitService(): GitService {
    return {
        isGitInstalled: jest.fn<any>().mockResolvedValue(true),
        isRepo: jest.fn<any>().mockResolvedValue(true),
        init: jest.fn<any>().mockResolvedValue(undefined),
        getRepoRoot: jest.fn<any>().mockResolvedValue("/repo"),
        getStatus: jest.fn<any>().mockResolvedValue({
            isGitRepo: true,
            branch: "main",
            isDirty: false,
            stagedCount: 0,
            unstagedCount: 0,
            untrackedCount: 0,
            headCommit: "abc12345",
            aheadBehind: { ahead: 0, behind: 0 },
        }),
        getChangedFiles: jest.fn<any>().mockResolvedValue([]),
        stageFiles: jest.fn<any>().mockResolvedValue(undefined),
        stageAll: jest.fn<any>().mockResolvedValue(undefined),
        unstageFiles: jest.fn<any>().mockResolvedValue(undefined),
        commit: jest.fn<any>().mockResolvedValue("abc1234"),
        commitFiles: jest.fn<any>().mockResolvedValue("abc1234"),
        log: jest.fn<any>().mockResolvedValue([]),
        fileLog: jest.fn<any>().mockResolvedValue([]),
        listBranches: jest.fn<any>().mockResolvedValue([]),
        createBranch: jest.fn<any>().mockResolvedValue(undefined),
        checkoutBranch: jest.fn<any>().mockResolvedValue(undefined),
        discardChanges: jest.fn<any>().mockResolvedValue(undefined),
        stash: jest.fn<any>().mockResolvedValue(undefined),
        stashPop: jest.fn<any>().mockResolvedValue(undefined),
        diff: jest.fn<any>().mockResolvedValue("diff output"),
        ensureGitignore: jest.fn<any>().mockResolvedValue(true),
        generateGitignore: jest.fn<any>().mockReturnValue("# gitignore"),
        // Advanced methods (present on GitService but not used by GitHandlers)
        resolveRef: jest.fn<any>(),
        getFileAtRef: jest.fn<any>(),
        show: jest.fn<any>(),
        push: jest.fn<any>(),
        pull: jest.fn<any>(),
        fetch: jest.fn<any>(),
        revert: jest.fn<any>(),
        remoteList: jest.fn<any>(),
        remoteAdd: jest.fn<any>(),
        remoteRemove: jest.fn<any>(),
        remoteGetUrl: jest.fn<any>(),
        remoteSetUrl: jest.fn<any>(),
        createTag: jest.fn<any>(),
        deleteTag: jest.fn<any>(),
        listTags: jest.fn<any>(),
        merge: jest.fn<any>(),
        abortMerge: jest.fn<any>(),
        rebase: jest.fn<any>(),
        cherryPick: jest.fn<any>(),
        blame: jest.fn<any>(),
        stashList: jest.fn<any>(),
        stashApply: jest.fn<any>(),
        stashDrop: jest.fn<any>(),
        stashClear: jest.fn<any>(),
        clone: jest.fn<any>(),
        dryMerge: jest.fn<any>(),
        getMergeState: jest.fn<any>(),
        markResolved: jest.fn<any>(),
        getProtectedBranches: jest.fn<any>(),
        isProtectedBranch: jest.fn<any>(),
        deleteBranch: jest.fn<any>(),
        renameBranch: jest.fn<any>(),
    } as any;
}

// ─── Tests ──────────────────────────────────────────

let rpc: ReturnType<typeof createMockRpc>;
let logger: any;
let gitService: GitService;
let handlers: GitHandlers;

beforeEach(() => {
    rpc = createMockRpc();
    logger = createMockLogger();
    gitService = createMockGitService();
    handlers = new GitHandlers(rpc, logger, gitService);
});

// ==========================================
// requireDir Validation
// ==========================================

describe("GitHandlers — requireDir validation", () => {
    const handlerNames: [string, (p: any, id: number) => Promise<void>][] = [];

    beforeEach(() => {
        handlerNames.length = 0;
        handlerNames.push(
            ["handleStatus", (p, id) => handlers.handleStatus(p, id)],
            ["handleInit", (p, id) => handlers.handleInit(p, id)],
            ["handleChanges", (p, id) => handlers.handleChanges(p, id)],
            ["handleStageAll", (p, id) => handlers.handleStageAll(p, id)],
            ["handleLog", (p, id) => handlers.handleLog(p, id)],
            ["handleBranches", (p, id) => handlers.handleBranches(p, id)],
            ["handleDiff", (p, id) => handlers.handleDiff(p, id)],
            ["handleEnsureIgnore", (p, id) => handlers.handleEnsureIgnore(p, id)],
            ["handleStash", (p, id) => handlers.handleStash(p, id)],
            ["handleStashPop", (p, id) => handlers.handleStashPop(p, id)]
        );
    });

    test("sends BAD_REQUEST when dir is missing", async () => {
        for (const [name, fn] of handlerNames) {
            rpc = createMockRpc();
            gitService = createMockGitService();
            handlers = new GitHandlers(rpc, logger, gitService);

            await fn({}, 1);
            expect(rpc.sendError).toHaveBeenCalledWith(1, {
                code: "BAD_REQUEST",
                message: expect.stringContaining("dir"),
            });
        }
    });

    test("accepts dir, path, or cwd as directory param", async () => {
        for (const key of ["dir", "path", "cwd"]) {
            rpc = createMockRpc();
            gitService = createMockGitService();
            handlers = new GitHandlers(rpc, logger, gitService);

            await handlers.handleStatus({ [key]: "/repo" }, 1);
            expect(rpc.sendResponse).toHaveBeenCalled();
        }
    });
});

// ==========================================
// handleStatus
// ==========================================

describe("GitHandlers — handleStatus", () => {
    test("returns status data on success", async () => {
        await handlers.handleStatus({ dir: "/repo" }, 1);
        expect(gitService.getStatus).toHaveBeenCalledWith("/repo");
        expect(rpc.sendResponse).toHaveBeenCalledWith(1, {
            ok: true,
            data: expect.objectContaining({ isGitRepo: true, branch: "main" }),
        });
    });

    test("returns GIT_ERROR on failure", async () => {
        (gitService.getStatus as jest.Mock<any>).mockRejectedValue(new Error("git error"));
        await handlers.handleStatus({ dir: "/repo" }, 1);
        expect(rpc.sendError).toHaveBeenCalledWith(1, {
            code: "GIT_ERROR",
            message: "git error",
        });
    });
});

// ==========================================
// handleInit
// ==========================================

describe("GitHandlers — handleInit", () => {
    test("initializes repo, sets up gitignore, returns status", async () => {
        await handlers.handleInit({ dir: "/repo" }, 1);
        expect(gitService.init).toHaveBeenCalledWith("/repo", "main");
        expect(gitService.ensureGitignore).toHaveBeenCalledWith("/repo");
        expect(gitService.getStatus).toHaveBeenCalledWith("/repo");
        expect(rpc.sendResponse).toHaveBeenCalled();
    });

    test("uses custom default branch", async () => {
        await handlers.handleInit({ dir: "/repo", defaultBranch: "develop" }, 1);
        expect(gitService.init).toHaveBeenCalledWith("/repo", "develop");
    });
});

// ==========================================
// handleChanges
// ==========================================

describe("GitHandlers — handleChanges", () => {
    test("returns changed files array", async () => {
        const mockChanges = [{ path: "file.txt", status: "M", staged: false }];
        (gitService.getChangedFiles as jest.Mock<any>).mockResolvedValue(mockChanges);

        await handlers.handleChanges({ dir: "/repo" }, 1);
        expect(rpc.sendResponse).toHaveBeenCalledWith(1, {
            ok: true,
            data: mockChanges,
        });
    });
});

// ==========================================
// handleStage
// ==========================================

describe("GitHandlers — handleStage", () => {
    test("stages specified files", async () => {
        await handlers.handleStage({ dir: "/repo", files: ["a.txt", "b.txt"] }, 1);
        expect(gitService.stageFiles).toHaveBeenCalledWith("/repo", ["a.txt", "b.txt"]);
        expect(rpc.sendResponse).toHaveBeenCalledWith(1, { ok: true, data: null });
    });

    test("returns BAD_REQUEST for missing files", async () => {
        await handlers.handleStage({ dir: "/repo" }, 1);
        expect(rpc.sendError).toHaveBeenCalledWith(1, {
            code: "BAD_REQUEST",
            message: expect.stringContaining("files"),
        });
    });

    test("returns BAD_REQUEST for empty files array", async () => {
        await handlers.handleStage({ dir: "/repo", files: [] }, 1);
        expect(rpc.sendError).toHaveBeenCalledWith(1, {
            code: "BAD_REQUEST",
            message: expect.stringContaining("files"),
        });
    });
});

// ==========================================
// handleStageAll
// ==========================================

describe("GitHandlers — handleStageAll", () => {
    test("stages all files", async () => {
        await handlers.handleStageAll({ dir: "/repo" }, 1);
        expect(gitService.stageAll).toHaveBeenCalledWith("/repo");
        expect(rpc.sendResponse).toHaveBeenCalledWith(1, { ok: true, data: null });
    });
});

// ==========================================
// handleUnstage
// ==========================================

describe("GitHandlers — handleUnstage", () => {
    test("unstages specified files", async () => {
        await handlers.handleUnstage({ dir: "/repo", files: ["a.txt"] }, 1);
        expect(gitService.unstageFiles).toHaveBeenCalledWith("/repo", ["a.txt"]);
        expect(rpc.sendResponse).toHaveBeenCalledWith(1, { ok: true, data: null });
    });

    test("returns BAD_REQUEST for missing files", async () => {
        await handlers.handleUnstage({ dir: "/repo" }, 1);
        expect(rpc.sendError).toHaveBeenCalledWith(1, {
            code: "BAD_REQUEST",
            message: expect.stringContaining("files"),
        });
    });
});

// ==========================================
// handleCommit
// ==========================================

describe("GitHandlers — handleCommit", () => {
    test("commits with message and returns hash", async () => {
        await handlers.handleCommit({ dir: "/repo", message: "feat: add X" }, 1);
        expect(gitService.commit).toHaveBeenCalledWith("/repo", "feat: add X");
        expect(rpc.sendResponse).toHaveBeenCalledWith(1, {
            ok: true,
            data: { hash: "abc1234" },
        });
    });

    test("returns BAD_REQUEST for missing message", async () => {
        await handlers.handleCommit({ dir: "/repo" }, 1);
        expect(rpc.sendError).toHaveBeenCalledWith(1, {
            code: "BAD_REQUEST",
            message: expect.stringContaining("message"),
        });
    });
});

// ==========================================
// handleLog
// ==========================================

describe("GitHandlers — handleLog", () => {
    test("returns log entries with default count", async () => {
        const entries = [{ hash: "abc", subject: "test" }];
        (gitService.log as jest.Mock<any>).mockResolvedValue(entries);

        await handlers.handleLog({ dir: "/repo" }, 1);
        expect(gitService.log).toHaveBeenCalledWith("/repo", 20);
        expect(rpc.sendResponse).toHaveBeenCalledWith(1, { ok: true, data: entries });
    });

    test("respects custom count", async () => {
        await handlers.handleLog({ dir: "/repo", count: 5 }, 1);
        expect(gitService.log).toHaveBeenCalledWith("/repo", 5);
    });
});

// ==========================================
// handleBranches
// ==========================================

describe("GitHandlers — handleBranches", () => {
    test("returns branch list", async () => {
        const branches = [{ name: "main", current: true }];
        (gitService.listBranches as jest.Mock<any>).mockResolvedValue(branches);

        await handlers.handleBranches({ dir: "/repo" }, 1);
        expect(rpc.sendResponse).toHaveBeenCalledWith(1, { ok: true, data: branches });
    });
});

// ==========================================
// handleCreateBranch
// ==========================================

describe("GitHandlers — handleCreateBranch", () => {
    test("creates branch and returns name", async () => {
        await handlers.handleCreateBranch({ dir: "/repo", name: "feature" }, 1);
        expect(gitService.createBranch).toHaveBeenCalledWith("/repo", "feature");
        expect(rpc.sendResponse).toHaveBeenCalledWith(1, {
            ok: true,
            data: { branch: "feature" },
        });
    });

    test("returns BAD_REQUEST for missing name", async () => {
        await handlers.handleCreateBranch({ dir: "/repo" }, 1);
        expect(rpc.sendError).toHaveBeenCalledWith(1, {
            code: "BAD_REQUEST",
            message: expect.stringContaining("name"),
        });
    });
});

// ==========================================
// handleCheckout
// ==========================================

describe("GitHandlers — handleCheckout", () => {
    test("checks out branch", async () => {
        await handlers.handleCheckout({ dir: "/repo", name: "develop" }, 1);
        expect(gitService.checkoutBranch).toHaveBeenCalledWith("/repo", "develop");
        expect(rpc.sendResponse).toHaveBeenCalledWith(1, {
            ok: true,
            data: { branch: "develop" },
        });
    });

    test("returns BAD_REQUEST for missing name", async () => {
        await handlers.handleCheckout({ dir: "/repo" }, 1);
        expect(rpc.sendError).toHaveBeenCalledWith(1, {
            code: "BAD_REQUEST",
            message: expect.stringContaining("name"),
        });
    });
});

// ==========================================
// handleDiscard
// ==========================================

describe("GitHandlers — handleDiscard", () => {
    test("discards changes to specified files", async () => {
        await handlers.handleDiscard({ dir: "/repo", files: ["f.txt"] }, 1);
        expect(gitService.discardChanges).toHaveBeenCalledWith("/repo", ["f.txt"]);
        expect(rpc.sendResponse).toHaveBeenCalledWith(1, { ok: true, data: null });
    });

    test("returns BAD_REQUEST for missing files", async () => {
        await handlers.handleDiscard({ dir: "/repo" }, 1);
        expect(rpc.sendError).toHaveBeenCalledWith(1, {
            code: "BAD_REQUEST",
            message: expect.stringContaining("files"),
        });
    });
});

// ==========================================
// handleStash / handleStashPop
// ==========================================

describe("GitHandlers — handleStash / handleStashPop", () => {
    test("stash saves changes", async () => {
        await handlers.handleStash({ dir: "/repo", message: "wip" }, 1);
        expect(gitService.stash).toHaveBeenCalledWith("/repo", "wip");
        expect(rpc.sendResponse).toHaveBeenCalledWith(1, { ok: true, data: null });
    });

    test("stashPop restores stash", async () => {
        await handlers.handleStashPop({ dir: "/repo" }, 1);
        expect(gitService.stashPop).toHaveBeenCalledWith("/repo");
        expect(rpc.sendResponse).toHaveBeenCalledWith(1, { ok: true, data: null });
    });
});

// ==========================================
// handleDiff
// ==========================================

describe("GitHandlers — handleDiff", () => {
    test("returns diff output", async () => {
        await handlers.handleDiff({ dir: "/repo", file: "readme.md" }, 1);
        expect(gitService.diff).toHaveBeenCalledWith("/repo", "readme.md", false);
        expect(rpc.sendResponse).toHaveBeenCalledWith(1, {
            ok: true,
            data: { diff: "diff output" },
        });
    });

    test("passes staged flag", async () => {
        await handlers.handleDiff({ dir: "/repo", file: "a.ts", staged: true }, 1);
        expect(gitService.diff).toHaveBeenCalledWith("/repo", "a.ts", true);
    });

    test("works without file (repo-wide diff)", async () => {
        await handlers.handleDiff({ dir: "/repo" }, 1);
        expect(gitService.diff).toHaveBeenCalledWith("/repo", undefined, false);
    });
});

// ==========================================
// handleEnsureIgnore
// ==========================================

describe("GitHandlers — handleEnsureIgnore", () => {
    test("returns modified flag", async () => {
        await handlers.handleEnsureIgnore({ dir: "/repo" }, 1);
        expect(gitService.ensureGitignore).toHaveBeenCalledWith("/repo");
        expect(rpc.sendResponse).toHaveBeenCalledWith(1, {
            ok: true,
            data: { modified: true },
        });
    });
});

// ==========================================
// Error Forwarding
// ==========================================

describe("GitHandlers — Error Forwarding", () => {
    test("all handlers forward errors as GIT_ERROR", async () => {
        const errorMsg = "unexpected git failure";
        // Mock all service methods to reject
        for (const key of Object.keys(gitService)) {
            const val = (gitService as any)[key];
            if (typeof val?.mockRejectedValue === "function") {
                val.mockRejectedValue(new Error(errorMsg));
            }
        }

        const testCases: [string, () => Promise<void>][] = [
            ["status", () => handlers.handleStatus({ dir: "/r" }, 1)],
            ["changes", () => handlers.handleChanges({ dir: "/r" }, 1)],
            ["stageAll", () => handlers.handleStageAll({ dir: "/r" }, 1)],
            ["log", () => handlers.handleLog({ dir: "/r" }, 1)],
            ["branches", () => handlers.handleBranches({ dir: "/r" }, 1)],
            ["stashPop", () => handlers.handleStashPop({ dir: "/r" }, 1)],
            ["ensureIgnore", () => handlers.handleEnsureIgnore({ dir: "/r" }, 1)],
        ];

        for (const [name, fn] of testCases) {
            rpc = createMockRpc();
            handlers = new GitHandlers(rpc, logger, gitService);
            await fn();
            expect(rpc.sendError).toHaveBeenCalledWith(1, {
                code: "GIT_ERROR",
                message: errorMsg,
            });
        }
    });
});
