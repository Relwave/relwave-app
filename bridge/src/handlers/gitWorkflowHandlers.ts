import { Rpc } from "../types";
import { Logger } from "pino";
import {
    MigrationTimelineService,
    migrationTimelineServiceInstance,
} from "../services/migrationTimelineService";
import {
    EnvironmentService,
    environmentServiceInstance,
} from "../services/environmentService";
import {
    ConflictDetectionService,
    conflictDetectionServiceInstance,
} from "../services/conflictDetectionService";

/**
 * P2 RPC handlers for migration timeline, environment management,
 * and schema conflict detection.
 *
 * Methods:
 *   timeline.list            — migration timeline from git history
 *   timeline.commitSummary   — change summary for a single commit
 *   timeline.autoCommit      — auto-commit schema snapshot
 *
 *   env.getConfig            — read branch-environment mappings
 *   env.saveConfig           — replace full environment config
 *   env.setMapping           — upsert a single branch mapping
 *   env.removeMapping        — delete a branch mapping
 *   env.resolve              — resolve current environment for project
 *
 *   conflict.detect          — detect schema conflicts with target branch
 */
export class GitWorkflowHandlers {
    constructor(
        private rpc: Rpc,
        private logger: Logger,
        private timeline: MigrationTimelineService = migrationTimelineServiceInstance,
        private env: EnvironmentService = environmentServiceInstance,
        private conflicts: ConflictDetectionService = conflictDetectionServiceInstance,
    ) { }

    // ==========================================
    // TIMELINE
    // ==========================================

    async handleTimelineList(params: any, id: number | string) {
        try {
            const { projectId, count = 50 } = params || {};
            if (!projectId) {
                return this.rpc.sendError(id, { code: "BAD_REQUEST", message: "Missing projectId" });
            }

            const entries = await this.timeline.getTimeline(projectId, count);
            this.rpc.sendResponse(id, { ok: true, data: { entries } });
        } catch (e: any) {
            this.logger?.error({ e }, "timeline.list failed");
            this.rpc.sendError(id, { code: "TIMELINE_ERROR", message: String(e.message || e) });
        }
    }

    async handleCommitSummary(params: any, id: number | string) {
        try {
            const { projectId, commitHash } = params || {};
            if (!projectId || !commitHash) {
                return this.rpc.sendError(id, { code: "BAD_REQUEST", message: "Missing projectId or commitHash" });
            }

            const summary = await this.timeline.getCommitSummary(projectId, commitHash);
            this.rpc.sendResponse(id, { ok: true, data: { summary } });
        } catch (e: any) {
            this.logger?.error({ e }, "timeline.commitSummary failed");
            this.rpc.sendError(id, { code: "TIMELINE_ERROR", message: String(e.message || e) });
        }
    }

    async handleAutoCommit(params: any, id: number | string) {
        try {
            const { projectId, message, tag } = params || {};
            if (!projectId) {
                return this.rpc.sendError(id, { code: "BAD_REQUEST", message: "Missing projectId" });
            }

            const result = await this.timeline.autoCommitSchema(projectId, {
                message,
                tag,
            });
            this.rpc.sendResponse(id, { ok: true, data: result });
        } catch (e: any) {
            this.logger?.error({ e }, "timeline.autoCommit failed");
            this.rpc.sendError(id, { code: "COMMIT_ERROR", message: String(e.message || e) });
        }
    }

    // ==========================================
    // ENVIRONMENT
    // ==========================================

    async handleEnvGetConfig(params: any, id: number | string) {
        try {
            const { projectId } = params || {};
            if (!projectId) {
                return this.rpc.sendError(id, { code: "BAD_REQUEST", message: "Missing projectId" });
            }

            const config = await this.env.getConfig(projectId);
            this.rpc.sendResponse(id, { ok: true, data: config });
        } catch (e: any) {
            this.logger?.error({ e }, "env.getConfig failed");
            this.rpc.sendError(id, { code: "ENV_ERROR", message: String(e.message || e) });
        }
    }

    async handleEnvSaveConfig(params: any, id: number | string) {
        try {
            const { projectId, config } = params || {};
            if (!projectId || !config) {
                return this.rpc.sendError(id, { code: "BAD_REQUEST", message: "Missing projectId or config" });
            }

            const saved = await this.env.saveConfig(projectId, config);
            this.rpc.sendResponse(id, { ok: true, data: saved });
        } catch (e: any) {
            this.logger?.error({ e }, "env.saveConfig failed");
            this.rpc.sendError(id, { code: "ENV_ERROR", message: String(e.message || e) });
        }
    }

    async handleEnvSetMapping(params: any, id: number | string) {
        try {
            const { projectId, mapping } = params || {};
            if (!projectId || !mapping) {
                return this.rpc.sendError(id, { code: "BAD_REQUEST", message: "Missing projectId or mapping" });
            }

            const config = await this.env.setMapping(projectId, mapping);
            this.rpc.sendResponse(id, { ok: true, data: config });
        } catch (e: any) {
            this.logger?.error({ e }, "env.setMapping failed");
            this.rpc.sendError(id, { code: "ENV_ERROR", message: String(e.message || e) });
        }
    }

    async handleEnvRemoveMapping(params: any, id: number | string) {
        try {
            const { projectId, branch } = params || {};
            if (!projectId || !branch) {
                return this.rpc.sendError(id, { code: "BAD_REQUEST", message: "Missing projectId or branch" });
            }

            const config = await this.env.removeMapping(projectId, branch);
            this.rpc.sendResponse(id, { ok: true, data: config });
        } catch (e: any) {
            this.logger?.error({ e }, "env.removeMapping failed");
            this.rpc.sendError(id, { code: "ENV_ERROR", message: String(e.message || e) });
        }
    }

    async handleEnvResolve(params: any, id: number | string) {
        try {
            const { projectId } = params || {};
            if (!projectId) {
                return this.rpc.sendError(id, { code: "BAD_REQUEST", message: "Missing projectId" });
            }

            const resolved = await this.env.resolve(projectId);
            this.rpc.sendResponse(id, { ok: true, data: resolved });
        } catch (e: any) {
            this.logger?.error({ e }, "env.resolve failed");
            this.rpc.sendError(id, { code: "ENV_ERROR", message: String(e.message || e) });
        }
    }

    // ==========================================
    // CONFLICT DETECTION
    // ==========================================

    async handleConflictDetect(params: any, id: number | string) {
        try {
            const { projectId, targetBranch = "main" } = params || {};
            if (!projectId) {
                return this.rpc.sendError(id, { code: "BAD_REQUEST", message: "Missing projectId" });
            }

            const report = await this.conflicts.detectConflicts(projectId, targetBranch);
            this.rpc.sendResponse(id, { ok: true, data: report });
        } catch (e: any) {
            this.logger?.error({ e }, "conflict.detect failed");
            this.rpc.sendError(id, { code: "CONFLICT_ERROR", message: String(e.message || e) });
        }
    }
}
