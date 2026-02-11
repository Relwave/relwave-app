import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { bridgeApi } from "@/services/bridgeApi";
import { isBridgeReady } from "@/services/bridgeClient";
import type { GitStatus, GitFileChange, GitLogEntry, GitBranchInfo } from "@/types/git";

export const gitKeys = {
    all: ["git"] as const,
    status: (dir: string) => ["git", "status", dir] as const,
    changes: (dir: string) => ["git", "changes", dir] as const,
    log: (dir: string) => ["git", "log", dir] as const,
    branches: (dir: string) => ["git", "branches", dir] as const,
};

const STALE = {
    status: 10_000,    // 10s — polled frequently
    changes: 15_000,   // 15s
    log: 60_000,       // 1 min
    branches: 60_000,  // 1 min
};

export function useGitStatus(dir: string | null | undefined) {
    const queryClient = useQueryClient();
    const bridgeReady =
        queryClient.getQueryData<boolean>(["bridge-ready"]) ?? isBridgeReady();

    return useQuery<GitStatus>({
        queryKey: gitKeys.status(dir ?? ""),
        queryFn: () => bridgeApi.gitStatus(dir!),
        enabled: !!dir && bridgeReady,
        staleTime: STALE.status,
        refetchInterval: 15_000,  // poll every 15s for live status
        refetchIntervalInBackground: false,
    });
}

export function useGitChanges(dir: string | null | undefined) {
    const queryClient = useQueryClient();
    const bridgeReady =
        queryClient.getQueryData<boolean>(["bridge-ready"]) ?? isBridgeReady();

    return useQuery<GitFileChange[]>({
        queryKey: gitKeys.changes(dir ?? ""),
        queryFn: () => bridgeApi.gitChanges(dir!),
        enabled: !!dir && bridgeReady,
        staleTime: STALE.changes,
    });
}

export function useGitLog(dir: string | null | undefined, count = 20) {
    const queryClient = useQueryClient();
    const bridgeReady =
        queryClient.getQueryData<boolean>(["bridge-ready"]) ?? isBridgeReady();

    return useQuery<GitLogEntry[]>({
        queryKey: gitKeys.log(dir ?? ""),
        queryFn: () => bridgeApi.gitLog(dir!, count),
        enabled: !!dir && bridgeReady,
        staleTime: STALE.log,
    });
}

export function useGitBranches(dir: string | null | undefined) {
    const queryClient = useQueryClient();
    const bridgeReady =
        queryClient.getQueryData<boolean>(["bridge-ready"]) ?? isBridgeReady();

    return useQuery<GitBranchInfo[]>({
        queryKey: gitKeys.branches(dir ?? ""),
        queryFn: () => bridgeApi.gitBranches(dir!),
        enabled: !!dir && bridgeReady,
        staleTime: STALE.branches,
    });
}

function useInvalidateGit(dir: string | null | undefined) {
    const queryClient = useQueryClient();
    return () => {
        if (!dir) return;
        queryClient.invalidateQueries({ queryKey: gitKeys.status(dir) });
        queryClient.invalidateQueries({ queryKey: gitKeys.changes(dir) });
        queryClient.invalidateQueries({ queryKey: gitKeys.log(dir) });
        queryClient.invalidateQueries({ queryKey: gitKeys.branches(dir) });
    };
}

export function useGitInit(dir: string | null | undefined) {
    const invalidate = useInvalidateGit(dir);
    return useMutation({
        mutationFn: () => bridgeApi.gitInit(dir!),
        onSuccess: invalidate,
    });
}

export function useGitStageAll(dir: string | null | undefined) {
    const invalidate = useInvalidateGit(dir);
    return useMutation({
        mutationFn: () => bridgeApi.gitStageAll(dir!),
        onSuccess: invalidate,
    });
}

export function useGitCommit(dir: string | null | undefined) {
    const invalidate = useInvalidateGit(dir);
    return useMutation({
        mutationFn: (message: string) => bridgeApi.gitCommit(dir!, message),
        onSuccess: invalidate,
    });
}

export function useGitCheckout(dir: string | null | undefined) {
    const invalidate = useInvalidateGit(dir);
    return useMutation({
        mutationFn: (branchName: string) => bridgeApi.gitCheckout(dir!, branchName),
        onSuccess: invalidate,
    });
}

export function useGitCreateBranch(dir: string | null | undefined) {
    const invalidate = useInvalidateGit(dir);
    return useMutation({
        mutationFn: (name: string) => bridgeApi.gitCreateBranch(dir!, name),
        onSuccess: invalidate,
    });
}

export function useGitStash(dir: string | null | undefined) {
    const invalidate = useInvalidateGit(dir);
    return useMutation({
        mutationFn: (message?: string) => bridgeApi.gitStash(dir!, message),
        onSuccess: invalidate,
    });
}

export function useGitStashPop(dir: string | null | undefined) {
    const invalidate = useInvalidateGit(dir);
    return useMutation({
        mutationFn: () => bridgeApi.gitStashPop(dir!),
        onSuccess: invalidate,
    });
}
