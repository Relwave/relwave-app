import { Rpc } from "../types";
import { Logger } from "pino";
import { gitServiceInstance, GitService } from "../services/gitService";

/**
 * RPC handlers for git operations.
 *
 * Methods:
 *   git.status       — repo status (branch, dirty, ahead/behind)
 *   git.init         — initialize a new repo
 *   git.changes      — list changed files
 *   git.stage        — stage files
 *   git.stageAll     — stage everything
 *   git.unstage      — unstage files
 *   git.commit       — commit staged changes
 *   git.log          — recent commit history
 *   git.branches     — list branches
 *   git.createBranch — create + checkout new branch
 *   git.checkout     — switch branch
 *   git.discard      — discard file changes
 *   git.stash        — stash changes
 *   git.stashPop     — pop latest stash
 *   git.diff         — get diff output
 *   git.ensureIgnore — write/update .gitignore
 */
export class GitHandlers {
    constructor(
        private rpc: Rpc,
        private logger: Logger,
        private gitService: GitService = gitServiceInstance
    ) { }

    // ---- Helpers ----

    private requireDir(params: any, id: number | string): string | null {
        const dir = params?.dir || params?.path || params?.cwd;
        if (!dir) {
            this.rpc.sendError(id, {
                code: "BAD_REQUEST",
                message: "Missing 'dir' parameter (project directory path)",
            });
            return null;
        }
        return dir;
    }

    // ---- Handlers ----

    async handleStatus(params: any, id: number | string) {
        const dir = this.requireDir(params, id);
        if (!dir) return;
        try {
            const status = await this.gitService.getStatus(dir);
            this.rpc.sendResponse(id, { ok: true, data: status });
        } catch (e: any) {
            this.logger?.error({ e }, "git.status failed");
            this.rpc.sendError(id, { code: "GIT_ERROR", message: String(e.message || e) });
        }
    }

    async handleInit(params: any, id: number | string) {
        const dir = this.requireDir(params, id);
        if (!dir) return;
        try {
            await this.gitService.init(dir, params?.defaultBranch || "main");
            // Also set up .gitignore
            await this.gitService.ensureGitignore(dir);
            const status = await this.gitService.getStatus(dir);
            this.rpc.sendResponse(id, { ok: true, data: status });
        } catch (e: any) {
            this.logger?.error({ e }, "git.init failed");
            this.rpc.sendError(id, { code: "GIT_ERROR", message: String(e.message || e) });
        }
    }

    async handleChanges(params: any, id: number | string) {
        const dir = this.requireDir(params, id);
        if (!dir) return;
        try {
            const changes = await this.gitService.getChangedFiles(dir);
            this.rpc.sendResponse(id, { ok: true, data: changes });
        } catch (e: any) {
            this.logger?.error({ e }, "git.changes failed");
            this.rpc.sendError(id, { code: "GIT_ERROR", message: String(e.message || e) });
        }
    }

    async handleStage(params: any, id: number | string) {
        const dir = this.requireDir(params, id);
        if (!dir) return;
        try {
            const files: string[] = params?.files;
            if (!files?.length) {
                return this.rpc.sendError(id, {
                    code: "BAD_REQUEST",
                    message: "Missing 'files' array",
                });
            }
            await this.gitService.stageFiles(dir, files);
            this.rpc.sendResponse(id, { ok: true, data: null });
        } catch (e: any) {
            this.logger?.error({ e }, "git.stage failed");
            this.rpc.sendError(id, { code: "GIT_ERROR", message: String(e.message || e) });
        }
    }

    async handleStageAll(params: any, id: number | string) {
        const dir = this.requireDir(params, id);
        if (!dir) return;
        try {
            await this.gitService.stageAll(dir);
            this.rpc.sendResponse(id, { ok: true, data: null });
        } catch (e: any) {
            this.logger?.error({ e }, "git.stageAll failed");
            this.rpc.sendError(id, { code: "GIT_ERROR", message: String(e.message || e) });
        }
    }

    async handleUnstage(params: any, id: number | string) {
        const dir = this.requireDir(params, id);
        if (!dir) return;
        try {
            const files: string[] = params?.files;
            if (!files?.length) {
                return this.rpc.sendError(id, {
                    code: "BAD_REQUEST",
                    message: "Missing 'files' array",
                });
            }
            await this.gitService.unstageFiles(dir, files);
            this.rpc.sendResponse(id, { ok: true, data: null });
        } catch (e: any) {
            this.logger?.error({ e }, "git.unstage failed");
            this.rpc.sendError(id, { code: "GIT_ERROR", message: String(e.message || e) });
        }
    }

    async handleCommit(params: any, id: number | string) {
        const dir = this.requireDir(params, id);
        if (!dir) return;
        try {
            const message = params?.message;
            if (!message) {
                return this.rpc.sendError(id, {
                    code: "BAD_REQUEST",
                    message: "Missing 'message' parameter",
                });
            }
            const hash = await this.gitService.commit(dir, message);
            this.rpc.sendResponse(id, { ok: true, data: { hash } });
        } catch (e: any) {
            this.logger?.error({ e }, "git.commit failed");
            this.rpc.sendError(id, { code: "GIT_ERROR", message: String(e.message || e) });
        }
    }

    async handleLog(params: any, id: number | string) {
        const dir = this.requireDir(params, id);
        if (!dir) return;
        try {
            const count = params?.count ?? 20;
            const entries = await this.gitService.log(dir, count);
            this.rpc.sendResponse(id, { ok: true, data: entries });
        } catch (e: any) {
            this.logger?.error({ e }, "git.log failed");
            this.rpc.sendError(id, { code: "GIT_ERROR", message: String(e.message || e) });
        }
    }

    async handleLogGraph(params: any, id: number | string) {
        const dir = this.requireDir(params, id);
        if (!dir) return;
        try {
            const count = params?.count ?? 100;
            const entries = await this.gitService.logGraph(dir, count);
            this.rpc.sendResponse(id, { ok: true, data: entries });
        } catch (e: any) {
            this.logger?.error({ e }, "git.logGraph failed");
            this.rpc.sendError(id, { code: "GIT_ERROR", message: String(e.message || e) });
        }
    }

    async handleBranches(params: any, id: number | string) {
        const dir = this.requireDir(params, id);
        if (!dir) return;
        try {
            const branches = await this.gitService.listBranches(dir);
            this.rpc.sendResponse(id, { ok: true, data: branches });
        } catch (e: any) {
            this.logger?.error({ e }, "git.branches failed");
            this.rpc.sendError(id, { code: "GIT_ERROR", message: String(e.message || e) });
        }
    }

    async handleCreateBranch(params: any, id: number | string) {
        const dir = this.requireDir(params, id);
        if (!dir) return;
        try {
            const name = params?.name;
            if (!name) {
                return this.rpc.sendError(id, {
                    code: "BAD_REQUEST",
                    message: "Missing 'name' parameter",
                });
            }
            await this.gitService.createBranch(dir, name);
            this.rpc.sendResponse(id, { ok: true, data: { branch: name } });
        } catch (e: any) {
            this.logger?.error({ e }, "git.createBranch failed");
            this.rpc.sendError(id, { code: "GIT_ERROR", message: String(e.message || e) });
        }
    }

    async handleCheckout(params: any, id: number | string) {
        const dir = this.requireDir(params, id);
        if (!dir) return;
        try {
            const name = params?.name;
            if (!name) {
                return this.rpc.sendError(id, {
                    code: "BAD_REQUEST",
                    message: "Missing 'name' parameter",
                });
            }
            await this.gitService.checkoutBranch(dir, name);
            this.rpc.sendResponse(id, { ok: true, data: { branch: name } });
        } catch (e: any) {
            this.logger?.error({ e }, "git.checkout failed");
            this.rpc.sendError(id, { code: "GIT_ERROR", message: String(e.message || e) });
        }
    }

    async handleDiscard(params: any, id: number | string) {
        const dir = this.requireDir(params, id);
        if (!dir) return;
        try {
            const files: string[] = params?.files;
            if (!files?.length) {
                return this.rpc.sendError(id, {
                    code: "BAD_REQUEST",
                    message: "Missing 'files' array",
                });
            }
            await this.gitService.discardChanges(dir, files);
            this.rpc.sendResponse(id, { ok: true, data: null });
        } catch (e: any) {
            this.logger?.error({ e }, "git.discard failed");
            this.rpc.sendError(id, { code: "GIT_ERROR", message: String(e.message || e) });
        }
    }

    async handleStash(params: any, id: number | string) {
        const dir = this.requireDir(params, id);
        if (!dir) return;
        try {
            await this.gitService.stash(dir, params?.message);
            this.rpc.sendResponse(id, { ok: true, data: null });
        } catch (e: any) {
            this.logger?.error({ e }, "git.stash failed");
            this.rpc.sendError(id, { code: "GIT_ERROR", message: String(e.message || e) });
        }
    }

    async handleStashPop(params: any, id: number | string) {
        const dir = this.requireDir(params, id);
        if (!dir) return;
        try {
            await this.gitService.stashPop(dir);
            this.rpc.sendResponse(id, { ok: true, data: null });
        } catch (e: any) {
            this.logger?.error({ e }, "git.stashPop failed");
            this.rpc.sendError(id, { code: "GIT_ERROR", message: String(e.message || e) });
        }
    }

    async handleDiff(params: any, id: number | string) {
        const dir = this.requireDir(params, id);
        if (!dir) return;
        try {
            const diff = await this.gitService.diff(
                dir,
                params?.file,
                params?.staged === true
            );
            this.rpc.sendResponse(id, { ok: true, data: { diff } });
        } catch (e: any) {
            this.logger?.error({ e }, "git.diff failed");
            this.rpc.sendError(id, { code: "GIT_ERROR", message: String(e.message || e) });
        }
    }

    async handleEnsureIgnore(params: any, id: number | string) {
        const dir = this.requireDir(params, id);
        if (!dir) return;
        try {
            const modified = await this.gitService.ensureGitignore(dir);
            this.rpc.sendResponse(id, { ok: true, data: { modified } });
        } catch (e: any) {
            this.logger?.error({ e }, "git.ensureIgnore failed");
            this.rpc.sendError(id, { code: "GIT_ERROR", message: String(e.message || e) });
        }
    }
}
