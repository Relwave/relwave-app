// ==========================================
// Git Workflow Types — Frontend (P2)
// ==========================================
// Migration timeline, environment mapping, conflict detection

// ─── Timeline ────────────────────────────────────────────────

export interface TimelineEntry {
    hash: string;
    fullHash: string;
    author: string;
    date: string;
    subject: string;
    tags: string[];
    isAutoCommit: boolean;
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
    hash: string;
    tag: string | null;
    message: string;
}

// ─── Environment ─────────────────────────────────────────────

export interface EnvironmentMapping {
    branch: string;
    environment: string;
    connectionUrl?: string;
    isProduction?: boolean;
}

export interface EnvironmentConfig {
    mappings: EnvironmentMapping[];
    defaultEnvironment?: string;
}

export interface ResolvedEnvironment {
    branch: string | null;
    environment: string;
    isProduction: boolean;
    connectionUrl: string | null;
    connectionSource: "local" | "mapping" | "database" | "none";
}

// ─── Conflict Detection ──────────────────────────────────────

export type ConflictSeverity = "high" | "medium" | "low";

export interface SchemaConflict {
    table: string;
    schema: string;
    type: "both-modified" | "modified-deleted" | "both-added";
    severity: ConflictSeverity;
    description: string;
    columns?: ConflictingColumn[];
}

export interface ConflictingColumn {
    name: string;
    oursChange: string;
    theirsChange: string;
}

export interface ConflictReport {
    currentBranch: string | null;
    targetBranch: string;
    mergeBase: string | null;
    fileConflicts: string[];
    schemaConflicts: SchemaConflict[];
    hasSchemaFileConflict: boolean;
    conflictCount: number;
    summary: string;
}
