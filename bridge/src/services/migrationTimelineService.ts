// ============================================================
// services/migrationTimelineService.ts
// ============================================================
//
// Provides a "migration timeline" built from the git history of
// schema.json.  Each commit that touches the schema file is one
// entry in the timeline.  Entries may optionally carry a tag
// (e.g. "v1.2.0" or "relwave/migration/20260101-add-users").
//
// Auto-commit:  When the frontend saves a schema snapshot we
// can stage + commit + tag the change automatically so that
// every schema mutation is a discrete, revertable git commit.

import path from "path";
import {
    GitService,
    gitServiceInstance,
    GitLogEntry,
} from "./gitService";
import {
    SchemaDiffService,
    schemaDiffServiceInstance,
} from "./schemaDiffService";
import {
    ProjectStore,
    projectStoreInstance,
    SchemaFile,
} from "./projectStore";
import { getProjectDir } from "../utils/config";

// ─── Types ───────────────────────────────────────────────────

export interface TimelineEntry {
    /** Short commit hash */
    hash: string;
    /** Full commit hash */
    fullHash: string;
    /** Commit author */
    author: string;
    /** Commit date ISO string */
    date: string;
    /** Commit subject line */
    subject: string;
    /** Tags on this commit (may be empty) */
    tags: string[];
    /** Whether this commit was an auto-commit by RelWave */
    isAutoCommit: boolean;
    /** Quick schema change summary for this commit (optional — computed lazily) */
    summary?: TimelineChangeSummary;
}

export interface TimelineChangeSummary {
    tablesAdded: number;
    tablesRemoved: number;
    tablesModified: number;
    columnsAdded: number;
    columnsRemoved: number;
    columnsModified: number;
}

export interface AutoCommitResult {
    /** Short hash of the new commit */
    hash: string;
    /** Tag name if one was created */
    tag: string | null;
    /** Commit message used */
    message: string;
}

// Tag prefix used by RelWave auto-commits
const TAG_PREFIX = "relwave/schema/";
const AUTO_COMMIT_PREFIX = "[relwave] ";

// ─── Service ─────────────────────────────────────────────────

export class MigrationTimelineService {
    constructor(
        private git: GitService = gitServiceInstance,
        private differ: SchemaDiffService = schemaDiffServiceInstance,
        private store: ProjectStore = projectStoreInstance,
    ) { }

    /**
     * Build the full migration timeline from the git log of schema.json.
     * Each entry = one commit that changed the schema file.
     */
    async getTimeline(projectId: string, count = 50): Promise<TimelineEntry[]> {
        const dir = getProjectDir(projectId);
        if (!(await this.git.isRepo(dir))) return [];

        const repoRoot = await this.git.getRepoRoot(dir);
        const relSchemaPath = path
            .relative(repoRoot, path.join(dir, "schema", "schema.json"))
            .replace(/\\/g, "/");

        // Get commits that touched schema.json
        const commits = await this.git.fileLog(repoRoot, relSchemaPath, count);
        if (commits.length === 0) return [];

        // Get all tags in the repo (prefixed with our namespace)
        const allTags = await this.git.listTags(repoRoot, `${TAG_PREFIX}*`);

        // For each tag, resolve to a commit hash so we can associate
        const tagsByCommit = new Map<string, string[]>();
        for (const tag of allTags) {
            try {
                // rev-parse dereferences the tag to its commit
                const hash = await this.resolveTagToCommit(repoRoot, tag);
                if (hash) {
                    const existing = tagsByCommit.get(hash) ?? [];
                    existing.push(tag);
                    tagsByCommit.set(hash, existing);
                }
            } catch {
                // skip unresolvable tags
            }
        }

        return commits.map((c) => ({
            hash: c.hash,
            fullHash: c.fullHash,
            author: c.author,
            date: c.date,
            subject: c.subject,
            tags: tagsByCommit.get(c.fullHash) ?? [],
            isAutoCommit: c.subject.startsWith(AUTO_COMMIT_PREFIX),
        }));
    }

    /**
     * Get a detailed change summary for a specific commit by diffing it
     * against its parent.
     */
    async getCommitSummary(
        projectId: string,
        commitHash: string,
    ): Promise<TimelineChangeSummary | null> {
        const dir = getProjectDir(projectId);
        if (!(await this.git.isRepo(dir))) return null;

        const repoRoot = await this.git.getRepoRoot(dir);
        const relSchemaPath = path
            .relative(repoRoot, path.join(dir, "schema", "schema.json"))
            .replace(/\\/g, "/");

        // Read schema at this commit and its parent
        let afterRaw: string | null = null;
        let beforeRaw: string | null = null;

        try {
            afterRaw = await this.git.getFileAtRef(repoRoot, relSchemaPath, commitHash);
        } catch { /* file may not exist */ }

        try {
            beforeRaw = await this.git.getFileAtRef(repoRoot, relSchemaPath, `${commitHash}~1`);
        } catch { /* parent may not exist (first commit) */ }

        const before: SchemaFile | null = beforeRaw ? JSON.parse(beforeRaw) : null;
        const after: SchemaFile | null = afterRaw ? JSON.parse(afterRaw) : null;

        const diff = this.differ.diff(before, after);

        return {
            tablesAdded: diff.summary.tablesAdded,
            tablesRemoved: diff.summary.tablesRemoved,
            tablesModified: diff.summary.tablesModified,
            columnsAdded: diff.summary.columnsAdded,
            columnsRemoved: diff.summary.columnsRemoved,
            columnsModified: diff.summary.columnsModified,
        };
    }

    /**
     * Auto-commit the current schema snapshot with an optional tag.
     *
     * Flow:
     *   1. Stage schema/schema.json
     *   2. Commit with a descriptive message
     *   3. Optionally create an annotated tag
     */
    async autoCommitSchema(
        projectId: string,
        options?: {
            message?: string;
            tag?: string;
        },
    ): Promise<AutoCommitResult> {
        const dir = getProjectDir(projectId);
        if (!(await this.git.isRepo(dir))) {
            throw new Error("Project directory is not a git repository");
        }

        const repoRoot = await this.git.getRepoRoot(dir);
        const relSchemaPath = path
            .relative(repoRoot, path.join(dir, "schema", "schema.json"))
            .replace(/\\/g, "/");

        // Build a descriptive commit message
        let message = options?.message ?? "";
        if (!message) {
            // Generate from diff summary
            const summary = await this.getWorkingTreeSummary(projectId);
            message = `${AUTO_COMMIT_PREFIX}schema update`;
            if (summary) {
                const parts: string[] = [];
                if (summary.tablesAdded) parts.push(`+${summary.tablesAdded} table${summary.tablesAdded > 1 ? "s" : ""}`);
                if (summary.tablesRemoved) parts.push(`-${summary.tablesRemoved} table${summary.tablesRemoved > 1 ? "s" : ""}`);
                if (summary.tablesModified) parts.push(`~${summary.tablesModified} table${summary.tablesModified > 1 ? "s" : ""}`);
                if (parts.length) message = `${AUTO_COMMIT_PREFIX}${parts.join(", ")}`;
            }
        }

        const hash = await this.git.commitFiles(repoRoot, [relSchemaPath], message);

        // Create tag if requested
        let tagName: string | null = null;
        if (options?.tag) {
            tagName = options.tag.startsWith(TAG_PREFIX)
                ? options.tag
                : `${TAG_PREFIX}${options.tag}`;
            await this.git.createTag(repoRoot, tagName, message);
        }

        return { hash, tag: tagName, message };
    }

    /**
     * Get a change summary for the working tree vs HEAD
     */
    private async getWorkingTreeSummary(
        projectId: string,
    ): Promise<TimelineChangeSummary | null> {
        const dir = getProjectDir(projectId);
        const repoRoot = await this.git.getRepoRoot(dir);
        const relSchemaPath = path
            .relative(repoRoot, path.join(dir, "schema", "schema.json"))
            .replace(/\\/g, "/");

        let beforeRaw: string | null = null;
        try {
            beforeRaw = await this.git.getFileAtRef(repoRoot, relSchemaPath, "HEAD");
        } catch { /* no HEAD version */ }

        const before: SchemaFile | null = beforeRaw ? JSON.parse(beforeRaw) : null;
        const after = await this.store.getSchema(projectId);

        const diff = this.differ.diff(before, after);
        return {
            tablesAdded: diff.summary.tablesAdded,
            tablesRemoved: diff.summary.tablesRemoved,
            tablesModified: diff.summary.tablesModified,
            columnsAdded: diff.summary.columnsAdded,
            columnsRemoved: diff.summary.columnsRemoved,
            columnsModified: diff.summary.columnsModified,
        };
    }

    /**
     * Resolve a tag name to its commit hash
     */
    private async resolveTagToCommit(repoRoot: string, tag: string): Promise<string | null> {
        return this.git.resolveRef(repoRoot, tag);
    }
}

export const migrationTimelineServiceInstance = new MigrationTimelineService();
