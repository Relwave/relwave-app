import React, { useMemo, useState, useCallback } from "react";
import { GitLogEntry } from "../types";
import { cn } from "@/lib/utils";
import { format } from "date-fns";
import {
    Tooltip,
    TooltipContent,
    TooltipProvider,
    TooltipTrigger,
} from "@/components/ui/tooltip";
import { RotateCcw, Copy, Check } from "lucide-react";

interface GitHistoryGraphProps {
    log: GitLogEntry[];
    className?: string;
    onRevert?: (hash: string, subject: string) => void;
    reverting?: boolean;
}

interface ComputedNode {
    commit: GitLogEntry;
    lane: number;
    row: number;
    color: string;
}

interface ComputedLink {
    fromRow: number;
    fromLane: number;
    toRow: number;
    toLane: number;
    color: string;
    isMerge: boolean;
}

const ROW_H = 44;
const LANE_W = 18;
const DOT_R = 5;
const GUTTER = 14;

const LANE_COLORS = [
    "#6366f1",
    "#10b981",
    "#f59e0b",
    "#ef4444",
    "#8b5cf6",
    "#06b6d4",
    "#f97316",
    "#ec4899",
    "#84cc16",
    "#14b8a6",
];

function computeGraph(log: GitLogEntry[]): {
    nodes: ComputedNode[];
    links: ComputedLink[];
    maxLane: number;
} {
    if (!log.length) return { nodes: [], links: [], maxLane: 0 };

    const activeLanes: (string | null)[] = [];
    const nodes: ComputedNode[] = [];
    const pendingLinks: Array<{
        parentHash: string;
        fromRow: number;
        fromLane: number;
        color: string;
        isMerge: boolean;
    }> = [];
    const resolvedLinks: ComputedLink[] = [];
    const hashToRow = new Map<string, number>();

    const alloc = (hash: string): number => {
        const free = activeLanes.indexOf(null);
        if (free !== -1) {
            activeLanes[free] = hash;
            return free;
        }
        activeLanes.push(hash);
        return activeLanes.length - 1;
    };

    log.forEach((commit, row) => {
        const fullHash = commit.fullHash ?? commit.hash;
        hashToRow.set(fullHash, row);

        let lane = activeLanes.indexOf(fullHash);
        if (lane === -1) lane = activeLanes.indexOf(commit.hash);
        if (lane === -1) lane = alloc(fullHash);
        else activeLanes[lane] = fullHash;

        const color = LANE_COLORS[lane % LANE_COLORS.length];
        nodes.push({ commit, lane, row, color });

        activeLanes[lane] = null;

        const parents = (commit.parents ?? []).filter(Boolean);
        parents.forEach((pHash, pIdx) => {
            const alreadyReserved =
                activeLanes.includes(pHash) || activeLanes.includes(pHash.slice(0, 7));
            if (!alreadyReserved) {
                if (pIdx === 0) {
                    activeLanes[lane] = pHash;
                } else {
                    alloc(pHash);
                }
            }

            pendingLinks.push({
                parentHash: pHash,
                fromRow: row,
                fromLane: lane,
                color,
                isMerge: pIdx > 0 || parents.length > 1,
            });
        });

        if (!parents.length) {
            resolvedLinks.push({
                fromRow: row,
                fromLane: lane,
                toRow: row + 0.5,
                toLane: lane,
                color,
                isMerge: false,
            });
        }
    });

    pendingLinks.forEach(({ parentHash, fromRow, fromLane, color, isMerge }) => {
        const toRow = hashToRow.get(parentHash) ?? hashToRow.get(parentHash.slice(0, 7));
        if (toRow !== undefined) {
            const parentNode = nodes[toRow];
            resolvedLinks.push({
                fromRow,
                fromLane,
                toRow,
                toLane: parentNode?.lane ?? fromLane,
                color,
                isMerge,
            });
        } else {
            resolvedLinks.push({
                fromRow,
                fromLane,
                toRow: log.length,
                toLane: fromLane,
                color,
                isMerge,
            });
        }
    });

    return { nodes, links: resolvedLinks, maxLane: Math.max(...nodes.map((n) => n.lane), 0) };
}

function linkPath(
    fromLane: number,
    fromRow: number,
    toLane: number,
    toRow: number,
    gutter: number,
    laneWidth: number,
    rowHeight: number
): string {
    const x1 = gutter + fromLane * laneWidth;
    const y1 = fromRow * rowHeight + rowHeight / 2;
    const x2 = gutter + toLane * laneWidth;
    const y2 = toRow * rowHeight + rowHeight / 2;

    if (x1 === x2) return `M ${x1} ${y1} L ${x2} ${y2}`;

    const dy = Math.abs(y2 - y1);
    const cpOffset = Math.min(dy * 0.6, rowHeight * 1.2);
    return `M ${x1} ${y1} C ${x1} ${y1 + cpOffset}, ${x2} ${y2 - cpOffset}, ${x2} ${y2}`;
}

function RefBadge({ label, isHead }: { label: string; isHead: boolean }) {
    if (!label) return null;
    return (
        <span
            className={cn(
                "inline-flex items-center rounded-full px-1.5 py-0.5 text-[9.5px] font-semibold tracking-[0.04em] border shrink-0 shadow-sm",
                isHead
                    ? "bg-primary/12 text-primary border-primary/20"
                    : "bg-background/90 text-muted-foreground/75 border-border/70"
            )}
            title={label}
        >
            {label}
        </span>
    );
}

function CopyHash({ hash }: { hash: string }) {
    const [copied, setCopied] = useState(false);
    const copy = useCallback(
        (e: React.MouseEvent) => {
            e.stopPropagation();
            navigator.clipboard.writeText(hash).then(() => {
                setCopied(true);
                setTimeout(() => setCopied(false), 1500);
            });
        },
        [hash]
    );

    return (
        <button
            onClick={copy}
            className="group/hash inline-flex items-center gap-1 rounded-full border border-border/0 bg-transparent px-1 py-0.5 font-mono text-[11px] text-primary/60 transition-colors hover:border-border/50 hover:bg-background/70 hover:text-primary"
            title="Copy full hash"
        >
            {hash.slice(0, 7)}
            {copied ? (
                <Check className="h-2.5 w-2.5 text-emerald-500" />
            ) : (
                <Copy className="h-2.5 w-2.5 opacity-0 transition-opacity group-hover/hash:opacity-100" />
            )}
        </button>
    );
}

export function GitHistoryGraph({
    log,
    className,
    onRevert,
    reverting = false,
}: GitHistoryGraphProps) {
    const { nodes, links, maxLane } = useMemo(() => computeGraph(log), [log]);

    const compact = log.length > 80;
    const rowHeight = compact ? 36 : ROW_H;
    const laneWidth = compact ? 16 : LANE_W;
    const dotRadius = compact ? 4 : DOT_R;
    const gutter = compact ? 12 : GUTTER;
    const graphWidth = gutter + (maxLane + 1) * laneWidth + 10;
    const svgHeight = log.length * rowHeight;

    if (!log.length) {
        return (
            <div className="flex flex-col items-center justify-center gap-2 py-20 text-muted-foreground/50">
                <svg
                    width="32"
                    height="32"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="1.5"
                    strokeLinecap="round"
                    className="opacity-40"
                >
                    <circle cx="6" cy="6" r="3" />
                    <circle cx="6" cy="18" r="3" />
                    <circle cx="18" cy="6" r="3" />
                    <path d="M6 9v6M6 9c0-1 1.5-2.5 4-2.5h1A4.5 4.5 0 0 1 15.5 11" />
                </svg>
                <span className="text-sm">No commits yet</span>
            </div>
        );
    }

    return (
        <TooltipProvider delayDuration={300}>
            <div
                className={cn(
                    "flex h-full flex-col overflow-hidden rounded-2xl border border-border/60 bg-card/80 shadow-sm backdrop-blur-sm",
                    className
                )}
            >
                <div className="flex items-center justify-between gap-3 border-b border-border/50 bg-background/45 px-4 py-3">
                    <div className="min-w-0">
                        <div className="text-sm font-semibold text-foreground">Commit history</div>
                        <div className="text-xs text-muted-foreground">
                            {log.length} commits, {maxLane + 1} lane{maxLane === 0 ? "" : "s"}
                        </div>
                    </div>
                    <div className="flex items-center gap-2 text-[11px] text-muted-foreground">
                        <span className="rounded-full border border-border/60 bg-background/70 px-2.5 py-1">
                            {compact ? "Compact view" : "Latest first"}
                        </span>
                    </div>
                </div>

                <div className="flex-1 overflow-auto">
                    <div className="relative min-w-max px-2 py-3">
                        <svg
                            width={graphWidth}
                            height={svgHeight}
                            className="pointer-events-none absolute top-3 left-2 select-none opacity-95"
                            aria-hidden
                        >
                            <defs>
                                <linearGradient id="git-history-line-fade" x1="0" y1="0" x2="0" y2="1">
                                    <stop offset="0%" stopColor="currentColor" stopOpacity="0.85" />
                                    <stop offset="100%" stopColor="currentColor" stopOpacity="0.22" />
                                </linearGradient>
                            </defs>

                            <g opacity="0.35">
                                {nodes.map((node) => (
                                    <circle
                                        key={`halo-${node.commit.hash}`}
                                        cx={gutter + node.lane * laneWidth}
                                        cy={node.row * rowHeight + rowHeight / 2}
                                        r={dotRadius + (compact ? 3 : 4)}
                                        fill={node.color}
                                        opacity="0.05"
                                    />
                                ))}
                            </g>

                            {links.map((link, i) => {
                                const x1 = gutter + link.fromLane * laneWidth;
                                const y1 = link.fromRow * rowHeight + rowHeight / 2;
                                const x2 = gutter + link.toLane * laneWidth;
                                const y2 = link.toRow * rowHeight + rowHeight / 2;
                                const path = x1 === x2
                                    ? `M ${x1} ${y1} L ${x2} ${y2}`
                                    : linkPath(link.fromLane, link.fromRow, link.toLane, link.toRow, gutter, laneWidth, rowHeight);

                                return (
                                    <path
                                        key={`l-${i}`}
                                        d={path}
                                        stroke={link.color}
                                        strokeWidth={link.isMerge ? (compact ? 1.6 : 1.75) : (compact ? 1.9 : 2.15)}
                                        strokeOpacity={link.isMerge ? 0.4 : 0.58}
                                        fill="none"
                                        strokeLinecap="round"
                                        strokeLinejoin="round"
                                    />
                                );
                            })}

                            {nodes.map((node, i) => {
                                const cx = gutter + node.lane * laneWidth;
                                const cy = node.row * rowHeight + rowHeight / 2;
                                const isLatest = node.row === 0;

                                return (
                                    <g key={`n-${i}`}>
                                        {isLatest && (
                                            <circle
                                                cx={cx}
                                                cy={cy}
                                                r={dotRadius + 3.5}
                                                fill={node.color}
                                                opacity={0.15}
                                            />
                                        )}
                                        <circle
                                            cx={cx}
                                            cy={cy}
                                            r={dotRadius}
                                            fill={isLatest ? node.color : "var(--background, #09090b)"}
                                            stroke="rgba(255,255,255,0.92)"
                                            strokeWidth={isLatest ? 0 : compact ? 1.25 : 1.5}
                                        />
                                        {isLatest && <circle cx={cx} cy={cy} r={2} fill="white" opacity={0.9} />}
                                    </g>
                                );
                            })}
                        </svg>

                        <div style={{ paddingLeft: graphWidth }} className={cn("space-y-2", compact && "space-y-1.5")}>
                            {nodes.map((node) => {
                                const refs = node.commit.refs
                                    ? node.commit.refs
                                        .split(/,\s*/)
                                        .filter(Boolean)
                                        .map((r) => {
                                            const isHead = r.includes("HEAD ->");
                                            return { label: r.replace("HEAD -> ", "").trim(), isHead };
                                        })
                                    : [];

                                const isLatest = node.row === 0;

                                return (
                                    <div
                                        key={node.commit.hash}
                                        style={{ minHeight: rowHeight }}
                                        className={cn(
                                            "group flex items-center gap-3 rounded-xl border border-transparent px-3 py-2.5 transition-all",
                                            compact && "px-2.5 py-2",
                                            "hover:border-border/60 hover:bg-accent/20 hover:shadow-[0_1px_0_rgba(255,255,255,0.04)_inset]"
                                        )}
                                    >
                                        <div className="flex-1 min-w-0 flex flex-col justify-center gap-1">
                                            <div className="flex min-w-0 items-center gap-2">
                                                <span
                                                    className={cn(
                                                        "truncate text-[13px] font-medium leading-snug tracking-[-0.01em]",
                                                        compact && "text-[12.5px]",
                                                        isLatest ? "text-foreground" : "text-foreground/80"
                                                    )}
                                                >
                                                    {node.commit.subject}
                                                </span>
                                                {refs.slice(0, compact ? 2 : 4).map(({ label, isHead }) => (
                                                    <RefBadge key={label} label={label} isHead={isHead} />
                                                ))}
                                                {refs.length > (compact ? 2 : 4) && (
                                                    <span className="inline-flex shrink-0 items-center rounded-full border border-border/60 bg-muted/60 px-1.5 py-0.5 text-[9px] font-semibold text-muted-foreground">
                                                        +{refs.length - (compact ? 2 : 4)}
                                                    </span>
                                                )}
                                            </div>

                                            <div className="flex items-center gap-2">
                                                <CopyHash hash={node.commit.fullHash ?? node.commit.hash} />
                                                <span className="select-none text-[10px] text-muted-foreground/35">·</span>
                                                <span className="truncate text-[11px] text-muted-foreground/60">{node.commit.author}</span>
                                                <span className="select-none text-[10px] text-muted-foreground/35">·</span>
                                                <span className="shrink-0 tabular-nums text-[11px] text-muted-foreground/50">
                                                    {format(new Date(node.commit.date), "MMM d, HH:mm")}
                                                </span>
                                            </div>
                                        </div>

                                        <div className="flex shrink-0 items-center gap-1 opacity-0 transition-opacity group-hover:opacity-100">
                                            {onRevert && (
                                                <Tooltip>
                                                    <TooltipTrigger asChild>
                                                        <button
                                                            onClick={() =>
                                                                onRevert(
                                                                    node.commit.fullHash ?? node.commit.hash,
                                                                    node.commit.subject
                                                                )
                                                            }
                                                            disabled={reverting}
                                                            className={cn(
                                                                "flex h-7 items-center gap-1.5 rounded-full border border-border/60 px-2.5 text-[11.5px] font-medium text-muted-foreground",
                                                                "transition-colors hover:border-destructive/40 hover:bg-destructive/5 hover:text-destructive",
                                                                "disabled:cursor-not-allowed disabled:opacity-40"
                                                            )}
                                                        >
                                                            <RotateCcw className="h-3 w-3" />
                                                            {compact ? null : "Revert"}
                                                        </button>
                                                    </TooltipTrigger>
                                                    <TooltipContent side="left" className="text-xs">
                                                        Rollback to {(node.commit.fullHash ?? node.commit.hash).slice(0, 7)}
                                                    </TooltipContent>
                                                </Tooltip>
                                            )}
                                        </div>
                                    </div>
                                );
                            })}
                        </div>
                    </div>
                </div>
            </div>
        </TooltipProvider>
    );
}
