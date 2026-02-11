import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { bridgeApi } from "@/services/bridgeApi";
import type {
    TimelineEntry,
    TimelineChangeSummary,
    AutoCommitResult,
    EnvironmentConfig,
    EnvironmentMapping,
    ResolvedEnvironment,
    ConflictReport,
} from "@/types/gitWorkflow";
import { gitKeys } from "./useGitQueries";
import { schemaDiffKeys } from "./useSchemaDiff";

// ─── Query Keys ──────────────────────────────────────────────

export const timelineKeys = {
    all: ["timeline"] as const,
    list: (projectId: string) => [...timelineKeys.all, "list", projectId] as const,
    commitSummary: (projectId: string, hash: string) =>
        [...timelineKeys.all, "summary", projectId, hash] as const,
};

export const envKeys = {
    all: ["env"] as const,
    config: (projectId: string) => [...envKeys.all, "config", projectId] as const,
    resolved: (projectId: string) => [...envKeys.all, "resolved", projectId] as const,
};

export const conflictKeys = {
    all: ["conflict"] as const,
    detect: (projectId: string, targetBranch: string) =>
        [...conflictKeys.all, "detect", projectId, targetBranch] as const,
};

// ─── Timeline Hooks ──────────────────────────────────────────

/**
 * Fetch the migration timeline — commits that changed schema.json
 */
export function useTimeline(projectId: string | undefined, count = 50) {
    return useQuery<{ entries: TimelineEntry[] }>({
        queryKey: timelineKeys.list(projectId ?? ""),
        queryFn: () => bridgeApi.timelineList(projectId!, count),
        enabled: !!projectId,
        staleTime: 30_000,
    });
}

/**
 * Fetch the change summary for a specific commit in the timeline
 */
export function useCommitSummary(
    projectId: string | undefined,
    commitHash: string | undefined,
) {
    return useQuery<{ summary: TimelineChangeSummary | null }>({
        queryKey: timelineKeys.commitSummary(projectId ?? "", commitHash ?? ""),
        queryFn: () => bridgeApi.timelineCommitSummary(projectId!, commitHash!),
        enabled: !!projectId && !!commitHash,
        staleTime: Infinity, // commit summaries never change
    });
}

/**
 * Auto-commit the current schema snapshot (mutation)
 */
export function useAutoCommit() {
    const qc = useQueryClient();
    return useMutation<
        AutoCommitResult,
        Error,
        { projectId: string; message?: string; tag?: string }
    >({
        mutationFn: ({ projectId, message, tag }) =>
            bridgeApi.timelineAutoCommit(projectId, { message, tag }),
        onSuccess: (_data, vars) => {
            qc.invalidateQueries({ queryKey: timelineKeys.list(vars.projectId) });
            qc.invalidateQueries({ queryKey: schemaDiffKeys.all });
            qc.invalidateQueries({ queryKey: gitKeys.all });
        },
    });
}

// ─── Environment Hooks ───────────────────────────────────────

/**
 * Fetch the environment config (branch → environment mappings)
 */
export function useEnvConfig(projectId: string | undefined) {
    return useQuery<EnvironmentConfig>({
        queryKey: envKeys.config(projectId ?? ""),
        queryFn: () => bridgeApi.envGetConfig(projectId!),
        enabled: !!projectId,
        staleTime: 60_000,
    });
}

/**
 * Resolve the current environment based on git branch
 */
export function useResolvedEnv(projectId: string | undefined) {
    return useQuery<ResolvedEnvironment>({
        queryKey: envKeys.resolved(projectId ?? ""),
        queryFn: () => bridgeApi.envResolve(projectId!),
        enabled: !!projectId,
        staleTime: 15_000,
        refetchInterval: 30_000, // auto-re-resolve as branch may change
    });
}

/**
 * Save the full environment config (mutation)
 */
export function useSaveEnvConfig() {
    const qc = useQueryClient();
    return useMutation<
        EnvironmentConfig,
        Error,
        { projectId: string; config: EnvironmentConfig }
    >({
        mutationFn: ({ projectId, config }) =>
            bridgeApi.envSaveConfig(projectId, config),
        onSuccess: (_data, vars) => {
            qc.invalidateQueries({ queryKey: envKeys.config(vars.projectId) });
            qc.invalidateQueries({ queryKey: envKeys.resolved(vars.projectId) });
        },
    });
}

/**
 * Add or update a single environment mapping (mutation)
 */
export function useSetEnvMapping() {
    const qc = useQueryClient();
    return useMutation<
        EnvironmentConfig,
        Error,
        { projectId: string; mapping: EnvironmentMapping }
    >({
        mutationFn: ({ projectId, mapping }) =>
            bridgeApi.envSetMapping(projectId, mapping),
        onSuccess: (_data, vars) => {
            qc.invalidateQueries({ queryKey: envKeys.config(vars.projectId) });
            qc.invalidateQueries({ queryKey: envKeys.resolved(vars.projectId) });
        },
    });
}

/**
 * Remove a branch mapping (mutation)
 */
export function useRemoveEnvMapping() {
    const qc = useQueryClient();
    return useMutation<
        EnvironmentConfig,
        Error,
        { projectId: string; branch: string }
    >({
        mutationFn: ({ projectId, branch }) =>
            bridgeApi.envRemoveMapping(projectId, branch),
        onSuccess: (_data, vars) => {
            qc.invalidateQueries({ queryKey: envKeys.config(vars.projectId) });
            qc.invalidateQueries({ queryKey: envKeys.resolved(vars.projectId) });
        },
    });
}

// ─── Conflict Detection Hooks ────────────────────────────────

/**
 * Detect schema conflicts between current branch and target
 */
export function useConflictDetection(
    projectId: string | undefined,
    targetBranch = "main",
    enabled = true,
) {
    return useQuery<ConflictReport>({
        queryKey: conflictKeys.detect(projectId ?? "", targetBranch),
        queryFn: () => bridgeApi.conflictDetect(projectId!, targetBranch),
        enabled: !!projectId && enabled,
        staleTime: 60_000,
    });
}
