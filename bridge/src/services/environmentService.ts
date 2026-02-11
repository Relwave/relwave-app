// ============================================================
// services/environmentService.ts
// ============================================================
//
// Maps git branches → database environments (dev / staging / prod).
//
// Persisted in the project's `relwave.json` under an `environments`
// key so the mapping is committed with the project and shared
// across team members.
//
// Per-developer connection overrides live in `relwave.local.json`
// (git-ignored) so credentials never leak.

import {
    ProjectStore,
    projectStoreInstance,
    ProjectMetadata,
    LocalConfig,
} from "./projectStore";
import { GitService, gitServiceInstance } from "./gitService";
import { getProjectDir } from "../utils/config";
import path from "path";
import fs from "fs/promises";
import fsSync from "fs";

// ─── Types ───────────────────────────────────────────────────

/** One entry in the branch → environment mapping */
export interface EnvironmentMapping {
    /** Git branch name (exact match, e.g. "main", "develop") */
    branch: string;
    /** Labelled environment name */
    environment: string;
    /** Optional connection URL for this environment (shared) */
    connectionUrl?: string;
    /** Is this the production environment? (extra protection) */
    isProduction?: boolean;
}

/** Full environment configuration stored in relwave.json (committed) */
export interface EnvironmentConfig {
    /** Ordered list of branch → environment mappings */
    mappings: EnvironmentMapping[];
    /** Default environment label when branch doesn't match any mapping */
    defaultEnvironment?: string;
}

/** Runtime-resolved environment for the current branch */
export interface ResolvedEnvironment {
    /** Current git branch */
    branch: string | null;
    /** Resolved environment label */
    environment: string;
    /** Whether this branch is mapped to production */
    isProduction: boolean;
    /** Best connection URL (local override > mapping > default) */
    connectionUrl: string | null;
    /** Source of the connection URL */
    connectionSource: "local" | "mapping" | "database" | "none";
}

// ─── Service ─────────────────────────────────────────────────

export class EnvironmentService {
    constructor(
        private store: ProjectStore = projectStoreInstance,
        private git: GitService = gitServiceInstance,
    ) { }

    // ── Read / Write environment config ───────────────────────

    /**
     * Get the environment config from relwave.json
     */
    async getConfig(projectId: string): Promise<EnvironmentConfig> {
        const meta = await this.readMetadataRaw(projectId);
        return (meta as any)?.environments ?? { mappings: [] };
    }

    /**
     * Save environment config back to relwave.json
     */
    async saveConfig(
        projectId: string,
        config: EnvironmentConfig,
    ): Promise<EnvironmentConfig> {
        const meta = await this.readMetadataRaw(projectId);
        if (!meta) throw new Error(`Project ${projectId} not found`);

        (meta as any).environments = config;
        meta.updatedAt = new Date().toISOString();

        await this.writeMetadataRaw(projectId, meta);
        return config;
    }

    // ── Single-mapping CRUD ───────────────────────────────────

    /**
     * Add or update a branch → environment mapping
     */
    async setMapping(
        projectId: string,
        mapping: EnvironmentMapping,
    ): Promise<EnvironmentConfig> {
        const config = await this.getConfig(projectId);
        const idx = config.mappings.findIndex((m) => m.branch === mapping.branch);
        if (idx >= 0) {
            config.mappings[idx] = mapping;
        } else {
            config.mappings.push(mapping);
        }
        return this.saveConfig(projectId, config);
    }

    /**
     * Remove a branch mapping
     */
    async removeMapping(
        projectId: string,
        branch: string,
    ): Promise<EnvironmentConfig> {
        const config = await this.getConfig(projectId);
        config.mappings = config.mappings.filter((m) => m.branch !== branch);
        return this.saveConfig(projectId, config);
    }

    // ── Resolution ────────────────────────────────────────────

    /**
     * Resolve the current environment based on the active git branch.
     * Priority for connection URL: local override > mapping > database default.
     */
    async resolve(projectId: string): Promise<ResolvedEnvironment> {
        const dir = getProjectDir(projectId);
        const isRepo = await this.git.isRepo(dir);

        // Get current branch
        let branch: string | null = null;
        if (isRepo) {
            const status = await this.git.getStatus(dir);
            branch = status.branch;
        }

        const config = await this.getConfig(projectId);
        const localConfig = await this.store.getLocalConfig(projectId);

        // Find matching mapping
        const mapping = branch
            ? config.mappings.find((m) => m.branch === branch)
            : undefined;

        const environment =
            mapping?.environment ??
            config.defaultEnvironment ??
            "development";

        const isProduction = mapping?.isProduction ?? false;

        // Resolve connection URL with priority chain
        let connectionUrl: string | null = null;
        let connectionSource: ResolvedEnvironment["connectionSource"] = "none";

        if (localConfig?.connectionUrl) {
            connectionUrl = localConfig.connectionUrl;
            connectionSource = "local";
        } else if (mapping?.connectionUrl) {
            connectionUrl = mapping.connectionUrl;
            connectionSource = "mapping";
        }

        return {
            branch,
            environment,
            isProduction,
            connectionUrl,
            connectionSource,
        };
    }

    // ── Private helpers ───────────────────────────────────────

    /**
     * Read relwave.json as raw object (to preserve extra fields like `environments`)
     */
    private async readMetadataRaw(projectId: string): Promise<(ProjectMetadata & { environments?: EnvironmentConfig }) | null> {
        const filePath = path.join(getProjectDir(projectId), "relwave.json");
        try {
            if (!fsSync.existsSync(filePath)) return null;
            const raw = await fs.readFile(filePath, "utf-8");
            return JSON.parse(raw);
        } catch {
            return null;
        }
    }

    /**
     * Write relwave.json preserving all fields
     */
    private async writeMetadataRaw(projectId: string, data: any): Promise<void> {
        const filePath = path.join(getProjectDir(projectId), "relwave.json");
        await fs.writeFile(filePath, JSON.stringify(data, null, 2), "utf-8");
    }
}

export const environmentServiceInstance = new EnvironmentService();
