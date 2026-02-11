// ============================================================
// services/conflictDetectionService.ts
// ============================================================
//
// Detects schema conflicts between the current branch and another
// branch (typically "main" or the upstream target).
//
// Works by:
//   1. Finding the merge-base (common ancestor)
//   2. Reading schema.json at merge-base, current branch, and target branch
//   3. Computing structural diffs for both sides
//   4. Identifying tables/columns modified by BOTH sides (= conflicts)

import path from "path";
import { GitService, gitServiceInstance } from "./gitService";
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

export type ConflictSeverity = "high" | "medium" | "low";

export interface SchemaConflict {
    /** Which table has a conflict */
    table: string;
    /** Schema the table belongs to */
    schema: string;
    /** What kind of conflict */
    type: "both-modified" | "modified-deleted" | "both-added";
    /** Severity assessment */
    severity: ConflictSeverity;
    /** Human-readable description */
    description: string;
    /** Columns involved (for both-modified) */
    columns?: ConflictingColumn[];
}

export interface ConflictingColumn {
    name: string;
    /** What changed on the current branch */
    oursChange: string;
    /** What changed on the target branch */
    theirsChange: string;
}

export interface ConflictReport {
    /** Branch we're comparing FROM (current) */
    currentBranch: string | null;
    /** Branch we're comparing TO (target) */
    targetBranch: string;
    /** Common ancestor commit */
    mergeBase: string | null;
    /** File-level conflicts detected by git merge-tree */
    fileConflicts: string[];
    /** Structural schema conflicts */
    schemaConflicts: SchemaConflict[];
    /** Whether schema.json itself has a git-level conflict */
    hasSchemaFileConflict: boolean;
    /** Total number of conflicting tables */
    conflictCount: number;
    /** Quick summary */
    summary: string;
}

// ─── Service ─────────────────────────────────────────────────

export class ConflictDetectionService {
    constructor(
        private git: GitService = gitServiceInstance,
        private differ: SchemaDiffService = schemaDiffServiceInstance,
        private store: ProjectStore = projectStoreInstance,
    ) { }

    /**
     * Detect schema conflicts between the current branch and a target branch.
     */
    async detectConflicts(
        projectId: string,
        targetBranch: string,
    ): Promise<ConflictReport> {
        const dir = getProjectDir(projectId);
        if (!(await this.git.isRepo(dir))) {
            return this.emptyReport(null, targetBranch);
        }

        const repoRoot = await this.git.getRepoRoot(dir);
        const relSchemaPath = path
            .relative(repoRoot, path.join(dir, "schema", "schema.json"))
            .replace(/\\/g, "/");

        // Get current branch
        const status = await this.git.getStatus(dir);
        const currentBranch = status.branch;

        // Find merge-base
        const currentRef = currentBranch ?? "HEAD";
        const mergeBase = await this.git.mergeBase(repoRoot, currentRef, targetBranch);

        if (!mergeBase) {
            return {
                ...this.emptyReport(currentBranch, targetBranch),
                summary: "No common ancestor found between branches",
            };
        }

        // Check git-level file conflicts
        const fileConflicts = await this.git.dryMerge(repoRoot, targetBranch);
        const hasSchemaFileConflict = fileConflicts.some(
            (f) => f.endsWith("schema.json") || f === relSchemaPath,
        );

        // Read schema at three points: merge-base, ours (current), theirs (target)
        const [baseSchema, oursSchema, theirsSchema] = await Promise.all([
            this.readSchemaAt(repoRoot, relSchemaPath, mergeBase),
            this.readSchemaAt(repoRoot, relSchemaPath, currentRef),
            this.readSchemaAt(repoRoot, relSchemaPath, targetBranch),
        ]);

        // Compute diffs from merge-base to each branch
        const oursDiff = this.differ.diff(baseSchema, oursSchema);
        const theirsDiff = this.differ.diff(baseSchema, theirsSchema);

        // Find structural conflicts
        const schemaConflicts = this.findConflicts(oursDiff, theirsDiff);

        // Build summary
        const conflictCount = schemaConflicts.length;
        let summary: string;
        if (conflictCount === 0 && !hasSchemaFileConflict) {
            summary = "No schema conflicts detected — safe to merge";
        } else if (hasSchemaFileConflict && conflictCount === 0) {
            summary = "Git detects a text-level conflict in schema.json but no structural conflicts";
        } else {
            const high = schemaConflicts.filter((c) => c.severity === "high").length;
            const med = schemaConflicts.filter((c) => c.severity === "medium").length;
            summary = `${conflictCount} conflicting table${conflictCount > 1 ? "s" : ""}`;
            if (high) summary += ` (${high} high severity)`;
            else if (med) summary += ` (${med} medium severity)`;
        }

        return {
            currentBranch,
            targetBranch,
            mergeBase: mergeBase.slice(0, 8),
            fileConflicts,
            schemaConflicts,
            hasSchemaFileConflict,
            conflictCount,
            summary,
        };
    }

    // ── Private ─────────────────────────────────────────────

    private async readSchemaAt(
        repoRoot: string,
        relPath: string,
        ref: string,
    ): Promise<SchemaFile | null> {
        try {
            const raw = await this.git.getFileAtRef(repoRoot, relPath, ref);
            return raw ? JSON.parse(raw) : null;
        } catch {
            return null;
        }
    }

    /**
     * Compare two diffs (ours vs theirs, both from the same merge-base)
     * and identify tables/columns changed by BOTH sides.
     */
    private findConflicts(
        oursDiff: ReturnType<SchemaDiffService["diff"]>,
        theirsDiff: ReturnType<SchemaDiffService["diff"]>,
    ): SchemaConflict[] {
        const conflicts: SchemaConflict[] = [];

        // Build lookup: "schema.table" → status for theirs
        const theirsTableMap = new Map<string, string>();
        const theirsColMap = new Map<string, Set<string>>();

        for (const s of theirsDiff.schemas) {
            for (const t of s.tables) {
                const key = `${s.name}.${t.name}`;
                if (t.status !== "unchanged") {
                    theirsTableMap.set(key, t.status);
                }
                const changedCols = new Set<string>();
                for (const c of t.columns) {
                    if (c.status !== "unchanged") {
                        changedCols.add(c.name);
                    }
                }
                if (changedCols.size > 0) {
                    theirsColMap.set(key, changedCols);
                }
            }
        }

        // Walk ours and check for overlaps
        for (const s of oursDiff.schemas) {
            for (const t of s.tables) {
                const key = `${s.name}.${t.name}`;

                if (t.status === "unchanged") continue;

                const theirsStatus = theirsTableMap.get(key);
                if (!theirsStatus) continue; // only we changed it => no conflict

                // Both sides changed this table
                if (t.status === "removed" && theirsStatus === "modified") {
                    conflicts.push({
                        table: t.name,
                        schema: s.name,
                        type: "modified-deleted",
                        severity: "high",
                        description: `Table "${t.name}" was deleted on current branch but modified on ${key}`,
                    });
                } else if (t.status === "modified" && theirsStatus === "removed") {
                    conflicts.push({
                        table: t.name,
                        schema: s.name,
                        type: "modified-deleted",
                        severity: "high",
                        description: `Table "${t.name}" was modified on current branch but deleted on target`,
                    });
                } else if (t.status === "added" && theirsStatus === "added") {
                    conflicts.push({
                        table: t.name,
                        schema: s.name,
                        type: "both-added",
                        severity: "medium",
                        description: `Table "${t.name}" was added on both branches — definitions may differ`,
                    });
                } else if (t.status === "modified" && theirsStatus === "modified") {
                    // Check column-level overlap
                    const theirsCols = theirsColMap.get(key);
                    const conflictingColumns: ConflictingColumn[] = [];

                    for (const c of t.columns) {
                        if (c.status === "unchanged") continue;
                        if (theirsCols?.has(c.name)) {
                            conflictingColumns.push({
                                name: c.name,
                                oursChange: c.status,
                                theirsChange: "modified",
                            });
                        }
                    }

                    if (conflictingColumns.length > 0) {
                        conflicts.push({
                            table: t.name,
                            schema: s.name,
                            type: "both-modified",
                            severity: "high",
                            description: `${conflictingColumns.length} column${conflictingColumns.length > 1 ? "s" : ""} modified on both branches`,
                            columns: conflictingColumns,
                        });
                    } else {
                        // Different columns changed — lower risk
                        conflicts.push({
                            table: t.name,
                            schema: s.name,
                            type: "both-modified",
                            severity: "low",
                            description: `Table "${t.name}" modified on both branches but different columns affected`,
                        });
                    }
                }
            }
        }

        // Sort by severity (high first)
        const severityOrder: Record<ConflictSeverity, number> = {
            high: 0,
            medium: 1,
            low: 2,
        };
        conflicts.sort((a, b) => severityOrder[a.severity] - severityOrder[b.severity]);

        return conflicts;
    }

    private emptyReport(currentBranch: string | null, targetBranch: string): ConflictReport {
        return {
            currentBranch,
            targetBranch,
            mergeBase: null,
            fileConflicts: [],
            schemaConflicts: [],
            hasSchemaFileConflict: false,
            conflictCount: 0,
            summary: "Not a git repository",
        };
    }
}

export const conflictDetectionServiceInstance = new ConflictDetectionService();
