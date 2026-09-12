// ==========================================
// hooks/useGitAdvanced.ts — Remote, Push/Pull/Fetch, Revert hooks
// ==========================================

import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { isBridgeReady } from "@/services/bridge/bridgeClient";
import { gitKeys } from "@/features/git/hooks/useGitQueries";
import type { GitRemoteInfo, GitPushPullResult } from "@/features/git/types";
import { gitService } from "@/services/bridge/git";

// ─── Query keys ──────────────────────────────────────────────

export const gitAdvancedKeys = {
  remotes: (dir: string) => ["git", "remotes", dir] as const,
};

const STALE = {
  remotes: 120_000, // 2 min — rarely changes
};

// ─── Helpers ─────────────────────────────────────────────────

function useBridgeEnabled() {
  const qc = useQueryClient();
  return qc.getQueryData<boolean>(["bridge-ready"]) ?? isBridgeReady();
}

function useInvalidateAll(dir: string | null | undefined) {
  const queryClient = useQueryClient();
  return () => {
    if (!dir) return;
    queryClient.invalidateQueries({ queryKey: gitKeys.all });
    queryClient.invalidateQueries({ queryKey: gitAdvancedKeys.remotes(dir) });
  };
}

// ==========================================
// REMOTE QUERIES & MUTATIONS
// ==========================================

export function useGitRemotes(dir: string | null | undefined) {
  const ready = useBridgeEnabled();
  return useQuery<GitRemoteInfo[]>({
    queryKey: gitAdvancedKeys.remotes(dir ?? ""),
    queryFn: () => gitService.gitRemoteList(dir!),
    enabled: !!dir && ready,
    staleTime: STALE.remotes,
  });
}

export function useGitRemoteAdd(dir: string | null | undefined) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ name, url }: { name: string; url: string }) =>
      gitService.gitRemoteAdd(dir!, name, url),
    onSuccess: () => {
      if (dir) qc.invalidateQueries({ queryKey: gitAdvancedKeys.remotes(dir) });
    },
  });
}

export function useGitRemoteRemove(dir: string | null | undefined) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (name: string) => gitService.gitRemoteRemove(dir!, name),
    onSuccess: () => {
      if (dir) qc.invalidateQueries({ queryKey: gitAdvancedKeys.remotes(dir) });
    },
  });
}

export function useGitRemoteSetUrl(dir: string | null | undefined) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ name, url }: { name: string; url: string }) =>
      gitService.gitRemoteSetUrl(dir!, name, url),
    onSuccess: () => {
      if (dir) qc.invalidateQueries({ queryKey: gitAdvancedKeys.remotes(dir) });
    },
  });
}

// ==========================================
// PUSH / PULL / FETCH
// ==========================================

export function useGitPush(dir: string | null | undefined) {
  const invalidate = useInvalidateAll(dir);
  return useMutation<
    GitPushPullResult,
    Error,
    {
      remote?: string;
      branch?: string;
      force?: boolean;
      setUpstream?: boolean;
    } | void
  >({
    mutationFn: (opts) =>
      gitService.gitPush(dir!, opts?.remote, opts?.branch, {
        force: opts?.force,
        setUpstream: opts?.setUpstream,
      }),
    onSuccess: invalidate,
  });
}

export function useGitPull(dir: string | null | undefined) {
  const invalidate = useInvalidateAll(dir);
  return useMutation<
    GitPushPullResult,
    Error,
    {
      remote?: string;
      branch?: string;
      rebase?: boolean;
    } | void
  >({
    mutationFn: (opts) =>
      gitService.gitPull(dir!, opts?.remote, opts?.branch, { rebase: opts?.rebase }),
    onSuccess: invalidate,
  });
}

export function useGitFetch(dir: string | null | undefined) {
  const invalidate = useInvalidateAll(dir);
  return useMutation<
    GitPushPullResult,
    Error,
    {
      remote?: string;
      prune?: boolean;
      all?: boolean;
    } | void
  >({
    mutationFn: (opts) =>
      gitService.gitFetch(dir!, opts?.remote, { prune: opts?.prune, all: opts?.all }),
    onSuccess: invalidate,
  });
}

// ==========================================
// REVERT (Rollback to Previous Commit)
// ==========================================

export function useGitRevert(dir: string | null | undefined) {
  const invalidate = useInvalidateAll(dir);
  return useMutation<GitPushPullResult, Error, { hash: string; noCommit?: boolean }>({
    mutationFn: (opts) => gitService.gitRevert(dir!, opts.hash, opts.noCommit),
    onSuccess: invalidate,
  });
}
