// ----------------------------
// handlers/gitAdvancedHandlers.ts
// ----------------------------
//
// RPC handlers for: Remote management, push/pull/fetch, revert.

import { Rpc } from "../types";
import { GitService, gitServiceInstance } from "../services/gitService";
import { Logger } from "pino";

export class GitAdvancedHandlers {
  constructor(
    private rpc: Rpc,
    private logger?: Logger,
    private gitService: GitService = gitServiceInstance,
  ) {}

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

  // ==========================================
  // REMOTE MANAGEMENT
  // ==========================================

  async handleRemoteList(params: any, id: number | string) {
    const dir = this.requireDir(params, id);
    if (!dir) return;
    try {
      const remotes = await this.gitService.remoteList(dir);
      this.rpc.sendResponse(id, { ok: true, data: remotes });
    } catch (e: any) {
      this.logger?.error({ e }, "git.remoteList failed");
      this.rpc.sendError(id, { code: "GIT_ERROR", message: String(e.message || e) });
    }
  }

  async handleRemoteAdd(params: any, id: number | string) {
    const dir = this.requireDir(params, id);
    if (!dir) return;
    try {
      const name = params?.name;
      const url = params?.url;
      if (!name || !url) {
        return this.rpc.sendError(id, {
          code: "BAD_REQUEST",
          message: "Missing 'name' and/or 'url' parameters",
        });
      }
      await this.gitService.remoteAdd(dir, name, url);
      this.rpc.sendResponse(id, { ok: true, data: null });
    } catch (e: any) {
      this.logger?.error({ e }, "git.remoteAdd failed");
      this.rpc.sendError(id, { code: "GIT_ERROR", message: String(e.message || e) });
    }
  }

  async handleRemoteRemove(params: any, id: number | string) {
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
      await this.gitService.remoteRemove(dir, name);
      this.rpc.sendResponse(id, { ok: true, data: null });
    } catch (e: any) {
      this.logger?.error({ e }, "git.remoteRemove failed");
      this.rpc.sendError(id, { code: "GIT_ERROR", message: String(e.message || e) });
    }
  }

  async handleRemoteGetUrl(params: any, id: number | string) {
    const dir = this.requireDir(params, id);
    if (!dir) return;
    try {
      const url = await this.gitService.remoteGetUrl(dir, params?.name || "origin");
      this.rpc.sendResponse(id, { ok: true, data: { url } });
    } catch (e: any) {
      this.logger?.error({ e }, "git.remoteGetUrl failed");
      this.rpc.sendError(id, { code: "GIT_ERROR", message: String(e.message || e) });
    }
  }

  async handleRemoteSetUrl(params: any, id: number | string) {
    const dir = this.requireDir(params, id);
    if (!dir) return;
    try {
      const name = params?.name;
      const url = params?.url;
      if (!name || !url) {
        return this.rpc.sendError(id, {
          code: "BAD_REQUEST",
          message: "Missing 'name' and/or 'url' parameters",
        });
      }
      await this.gitService.remoteSetUrl(dir, name, url);
      this.rpc.sendResponse(id, { ok: true, data: null });
    } catch (e: any) {
      this.logger?.error({ e }, "git.remoteSetUrl failed");
      this.rpc.sendError(id, { code: "GIT_ERROR", message: String(e.message || e) });
    }
  }

  // ==========================================
  // PUSH / PULL / FETCH
  // ==========================================

  async handlePush(params: any, id: number | string) {
    const dir = this.requireDir(params, id);
    if (!dir) return;
    try {
      const output = await this.gitService.push(dir, params?.remote || "origin", params?.branch, {
        force: params?.force === true,
        setUpstream: params?.setUpstream === true,
      });
      this.rpc.sendResponse(id, { ok: true, data: { output } });
    } catch (e: any) {
      this.logger?.error({ e }, "git.push failed");
      this.rpc.sendError(id, { code: "GIT_ERROR", message: String(e.message || e) });
    }
  }

  async handlePull(params: any, id: number | string) {
    const dir = this.requireDir(params, id);
    if (!dir) return;
    try {
      const output = await this.gitService.pull(dir, params?.remote || "origin", params?.branch, {
        rebase: params?.rebase === true,
      });
      this.rpc.sendResponse(id, { ok: true, data: { output } });
    } catch (e: any) {
      this.logger?.error({ e }, "git.pull failed");
      this.rpc.sendError(id, { code: "GIT_ERROR", message: String(e.message || e) });
    }
  }

  async handleFetch(params: any, id: number | string) {
    const dir = this.requireDir(params, id);
    if (!dir) return;
    try {
      const output = await this.gitService.fetch(dir, params?.remote, {
        prune: params?.prune === true,
        all: params?.all === true,
      });
      this.rpc.sendResponse(id, { ok: true, data: { output } });
    } catch (e: any) {
      this.logger?.error({ e }, "git.fetch failed");
      this.rpc.sendError(id, { code: "GIT_ERROR", message: String(e.message || e) });
    }
  }

  // ==========================================
  // REVERT (Rollback to Previous Commit)
  // ==========================================

  async handleRevert(params: any, id: number | string) {
    const dir = this.requireDir(params, id);
    if (!dir) return;
    try {
      const hash = params?.hash || params?.commitHash;
      if (!hash) {
        return this.rpc.sendError(id, {
          code: "BAD_REQUEST",
          message: "Missing 'hash' parameter",
        });
      }
      const output = await this.gitService.revert(dir, hash, {
        noCommit: params?.noCommit === true,
      });
      this.rpc.sendResponse(id, { ok: true, data: { output } });
    } catch (e: any) {
      this.logger?.error({ e }, "git.revert failed");
      this.rpc.sendError(id, { code: "GIT_ERROR", message: String(e.message || e) });
    }
  }
}
