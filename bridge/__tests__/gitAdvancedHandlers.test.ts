import { describe, expect, test, jest, beforeEach } from "@jest/globals";
import { GitAdvancedHandlers } from "../src/handlers/gitAdvancedHandlers";
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

function createMockGitService(): GitService {
    return {
        remoteList: jest.fn<any>().mockResolvedValue([]),
        remoteAdd: jest.fn<any>().mockResolvedValue(undefined),
        remoteRemove: jest.fn<any>().mockResolvedValue(undefined),
        remoteGetUrl: jest.fn<any>().mockResolvedValue("https://github.com/test/repo.git"),
        remoteSetUrl: jest.fn<any>().mockResolvedValue(undefined),
        push: jest.fn<any>().mockResolvedValue("Everything up-to-date"),
        pull: jest.fn<any>().mockResolvedValue("Already up to date."),
        fetch: jest.fn<any>().mockResolvedValue(""),
        revert: jest.fn<any>().mockResolvedValue(""),
    } as any;
}

// ─── Tests ──────────────────────────────────────────

let rpc: ReturnType<typeof createMockRpc>;
let gitService: GitService;
let handlers: GitAdvancedHandlers;

beforeEach(() => {
    rpc = createMockRpc();
    gitService = createMockGitService();
    handlers = new GitAdvancedHandlers(rpc, undefined, gitService);
});

// ==========================================
// requireDir Validation
// ==========================================

describe("GitAdvancedHandlers — requireDir validation", () => {
    const handlerMethods = [
        "handleRemoteList",
        "handleRemoteAdd",
        "handleRemoteRemove",
        "handleRemoteGetUrl",
        "handleRemoteSetUrl",
        "handlePush",
        "handlePull",
        "handleFetch",
        "handleRevert",
    ] as const;

    test("all handlers send BAD_REQUEST when dir is missing", async () => {
        for (const method of handlerMethods) {
            rpc = createMockRpc();
            gitService = createMockGitService();
            handlers = new GitAdvancedHandlers(rpc, undefined, gitService);

            await (handlers as any)[method]({}, 1);
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
            handlers = new GitAdvancedHandlers(rpc, undefined, gitService);

            await handlers.handleRemoteList({ [key]: "/repo" }, 1);
            expect(rpc.sendResponse).toHaveBeenCalled();
        }
    });
});

// ==========================================
// REMOTE MANAGEMENT
// ==========================================

describe("GitAdvancedHandlers — Remote Management", () => {
    test("handleRemoteList returns remotes", async () => {
        const mockRemotes = [
            { name: "origin", fetchUrl: "https://a.git", pushUrl: "https://a.git" },
        ];
        (gitService.remoteList as jest.Mock<any>).mockResolvedValue(mockRemotes);

        await handlers.handleRemoteList({ dir: "/repo" }, 1);
        expect(gitService.remoteList).toHaveBeenCalledWith("/repo");
        expect(rpc.sendResponse).toHaveBeenCalledWith(1, {
            ok: true,
            data: mockRemotes,
        });
    });

    test("handleRemoteAdd adds a remote", async () => {
        await handlers.handleRemoteAdd(
            { dir: "/repo", name: "upstream", url: "https://up.git" },
            1
        );
        expect(gitService.remoteAdd).toHaveBeenCalledWith("/repo", "upstream", "https://up.git");
        expect(rpc.sendResponse).toHaveBeenCalledWith(1, { ok: true, data: null });
    });

    test("handleRemoteAdd returns BAD_REQUEST when name missing", async () => {
        await handlers.handleRemoteAdd({ dir: "/repo", url: "https://up.git" }, 1);
        expect(rpc.sendError).toHaveBeenCalledWith(1, {
            code: "BAD_REQUEST",
            message: expect.stringContaining("name"),
        });
    });

    test("handleRemoteAdd returns BAD_REQUEST when url missing", async () => {
        await handlers.handleRemoteAdd({ dir: "/repo", name: "origin" }, 1);
        expect(rpc.sendError).toHaveBeenCalledWith(1, {
            code: "BAD_REQUEST",
            message: expect.stringContaining("url"),
        });
    });

    test("handleRemoteRemove removes a remote", async () => {
        await handlers.handleRemoteRemove({ dir: "/repo", name: "origin" }, 1);
        expect(gitService.remoteRemove).toHaveBeenCalledWith("/repo", "origin");
        expect(rpc.sendResponse).toHaveBeenCalledWith(1, { ok: true, data: null });
    });

    test("handleRemoteRemove returns BAD_REQUEST when name missing", async () => {
        await handlers.handleRemoteRemove({ dir: "/repo" }, 1);
        expect(rpc.sendError).toHaveBeenCalledWith(1, {
            code: "BAD_REQUEST",
            message: expect.stringContaining("name"),
        });
    });

    test("handleRemoteGetUrl returns url", async () => {
        await handlers.handleRemoteGetUrl({ dir: "/repo", name: "origin" }, 1);
        expect(gitService.remoteGetUrl).toHaveBeenCalledWith("/repo", "origin");
        expect(rpc.sendResponse).toHaveBeenCalledWith(1, {
            ok: true,
            data: { url: "https://github.com/test/repo.git" },
        });
    });

    test("handleRemoteGetUrl defaults to origin", async () => {
        await handlers.handleRemoteGetUrl({ dir: "/repo" }, 1);
        expect(gitService.remoteGetUrl).toHaveBeenCalledWith("/repo", "origin");
    });

    test("handleRemoteSetUrl sets url", async () => {
        await handlers.handleRemoteSetUrl(
            { dir: "/repo", name: "origin", url: "https://new.git" },
            1
        );
        expect(gitService.remoteSetUrl).toHaveBeenCalledWith("/repo", "origin", "https://new.git");
        expect(rpc.sendResponse).toHaveBeenCalledWith(1, { ok: true, data: null });
    });

    test("handleRemoteSetUrl returns BAD_REQUEST when params missing", async () => {
        await handlers.handleRemoteSetUrl({ dir: "/repo" }, 1);
        expect(rpc.sendError).toHaveBeenCalledWith(1, {
            code: "BAD_REQUEST",
            message: expect.stringContaining("name"),
        });
    });
});

// ==========================================
// PUSH / PULL / FETCH
// ==========================================

describe("GitAdvancedHandlers — Push / Pull / Fetch", () => {
    test("handlePush pushes to remote", async () => {
        await handlers.handlePush({ dir: "/repo" }, 1);
        expect(gitService.push).toHaveBeenCalledWith("/repo", "origin", undefined, {
            force: false,
            setUpstream: false,
        });
        expect(rpc.sendResponse).toHaveBeenCalledWith(1, {
            ok: true,
            data: { output: "Everything up-to-date" },
        });
    });

    test("handlePush passes custom remote and branch", async () => {
        await handlers.handlePush(
            { dir: "/repo", remote: "upstream", branch: "main", force: true, setUpstream: true },
            1
        );
        expect(gitService.push).toHaveBeenCalledWith("/repo", "upstream", "main", {
            force: true,
            setUpstream: true,
        });
    });

    test("handlePull pulls from remote", async () => {
        await handlers.handlePull({ dir: "/repo" }, 1);
        expect(gitService.pull).toHaveBeenCalledWith("/repo", "origin", undefined, {
            rebase: false,
        });
        expect(rpc.sendResponse).toHaveBeenCalledWith(1, {
            ok: true,
            data: { output: "Already up to date." },
        });
    });

    test("handlePull passes rebase option", async () => {
        await handlers.handlePull({ dir: "/repo", rebase: true }, 1);
        expect(gitService.pull).toHaveBeenCalledWith("/repo", "origin", undefined, {
            rebase: true,
        });
    });

    test("handleFetch fetches from remote", async () => {
        await handlers.handleFetch({ dir: "/repo" }, 1);
        expect(gitService.fetch).toHaveBeenCalledWith("/repo", undefined, {
            prune: false,
            all: false,
        });
    });

    test("handleFetch passes prune and all options", async () => {
        await handlers.handleFetch({ dir: "/repo", prune: true, all: true }, 1);
        expect(gitService.fetch).toHaveBeenCalledWith("/repo", undefined, {
            prune: true,
            all: true,
        });
    });
});

// ==========================================
// REVERT
// ==========================================

describe("GitAdvancedHandlers — Revert", () => {
    test("handleRevert reverts a commit by hash", async () => {
        await handlers.handleRevert({ dir: "/repo", hash: "abc1234" }, 1);
        expect(gitService.revert).toHaveBeenCalledWith("/repo", "abc1234", {
            noCommit: false,
        });
        expect(rpc.sendResponse).toHaveBeenCalledWith(1, {
            ok: true,
            data: { output: "" },
        });
    });

    test("handleRevert accepts commitHash alias", async () => {
        await handlers.handleRevert({ dir: "/repo", commitHash: "def5678" }, 1);
        expect(gitService.revert).toHaveBeenCalledWith("/repo", "def5678", {
            noCommit: false,
        });
    });

    test("handleRevert passes noCommit flag", async () => {
        await handlers.handleRevert({ dir: "/repo", hash: "abc", noCommit: true }, 1);
        expect(gitService.revert).toHaveBeenCalledWith("/repo", "abc", {
            noCommit: true,
        });
    });

    test("handleRevert returns BAD_REQUEST when hash missing", async () => {
        await handlers.handleRevert({ dir: "/repo" }, 1);
        expect(rpc.sendError).toHaveBeenCalledWith(1, {
            code: "BAD_REQUEST",
            message: expect.stringContaining("hash"),
        });
    });
});

// ==========================================
// Error Forwarding
// ==========================================

describe("GitAdvancedHandlers — Error Forwarding", () => {
    test("all handlers forward service errors as GIT_ERROR", async () => {
        const err = new Error("network failure");
        for (const key of Object.keys(gitService)) {
            const val = (gitService as any)[key];
            if (typeof val?.mockRejectedValue === "function") {
                val.mockRejectedValue(err);
            }
        }

        const testCases: [string, () => Promise<void>][] = [
            ["remoteList", () => handlers.handleRemoteList({ dir: "/r" }, 1)],
            [
                "remoteAdd",
                () => handlers.handleRemoteAdd({ dir: "/r", name: "o", url: "u" }, 1),
            ],
            ["remoteRemove", () => handlers.handleRemoteRemove({ dir: "/r", name: "o" }, 1)],
            ["remoteGetUrl", () => handlers.handleRemoteGetUrl({ dir: "/r" }, 1)],
            [
                "remoteSetUrl",
                () => handlers.handleRemoteSetUrl({ dir: "/r", name: "o", url: "u" }, 1),
            ],
            ["push", () => handlers.handlePush({ dir: "/r" }, 1)],
            ["pull", () => handlers.handlePull({ dir: "/r" }, 1)],
            ["fetch", () => handlers.handleFetch({ dir: "/r" }, 1)],
            ["revert", () => handlers.handleRevert({ dir: "/r", hash: "abc" }, 1)],
        ];

        for (const [name, fn] of testCases) {
            rpc = createMockRpc();
            handlers = new GitAdvancedHandlers(rpc, undefined, gitService);
            await fn();
            expect(rpc.sendError).toHaveBeenCalledWith(1, {
                code: "GIT_ERROR",
                message: "network failure",
            });
        }
    });
});
