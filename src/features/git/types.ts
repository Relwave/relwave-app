export interface GitStatus {
    /** Whether the directory is inside a git repository */
    isGitRepo: boolean;

    /** Current branch name (e.g. "main", "feature/auth") */
    branch: string | null;

    /** Short commit hash of HEAD */
    headCommit: string | null;

    /** Whether there are uncommitted changes */
    isDirty: boolean;

    /** Number of staged files */
    stagedCount: number;

    /** Number of unstaged modified files */
    unstagedCount: number;

    /** Number of untracked files */
    untrackedCount: number;

    /** Commits ahead of upstream (null = no upstream) */
    ahead: number | null;

    /** Commits behind upstream (null = no upstream) */
    behind: number | null;

    /** Remote tracking branch (e.g. "origin/main") */
    upstream: string | null;
}

export interface GitFileChange {
    /** Relative file path */
    path: string;

    /** Git status code: M=modified, A=added, D=deleted, ?=untracked, R=renamed */
    status: string;

    /** Whether this change is staged */
    staged: boolean;
}

export interface GitLogEntry {
    /** Short commit hash */
    hash: string;

    /** Full commit hash */
    fullHash: string;

    /** Parent hashes */
    parents: string[];

    /** Author name */
    author: string;

    /** Commit date as ISO string */
    date: string;

    /** First line of commit message */
    subject: string;

    /** Ref names (branches, tags) */
    refs: string;
}

export interface GitBranchInfo {
    /** Branch name */
    name: string;

    /** Is this the current branch? */
    current: boolean;

    /** Remote tracking branch */
    upstream: string | null;
}

// ==========================================
// P3 — Remote, Push/Pull
// ==========================================

export interface GitRemoteInfo {
    /** Remote name (e.g. "origin") */
    name: string;
    /** Fetch URL */
    fetchUrl: string;
    /** Push URL */
    pushUrl: string;
}

export interface GitPushPullResult {
    /** Command output text */
    output: string;
}
