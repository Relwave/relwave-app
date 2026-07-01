import { Skeleton } from "@/components/ui/skeleton";

export function GitStatusPanelLoadingState() {
    return (
        <div className="h-full flex flex-col bg-transparent overflow-hidden">
            {/* Header */}
            <div className="shrink-0 border-b border-border/30 bg-background/80 px-4 py-3 flex items-center justify-between gap-3">
                <div className="flex items-center gap-2">
                    <Skeleton className="h-4 w-4" />
                    <Skeleton className="h-4 w-24 rounded-full" />
                    <Skeleton className="h-5 w-16 rounded-full" />
                </div>
                <div className="flex items-center gap-2">
                    <Skeleton className="h-7 w-7" />
                    <Skeleton className="h-7 w-20" />
                </div>
            </div>
            {/* Tab bar */}
            <div className="shrink-0 border-b border-border/30 bg-background/60 flex gap-1 px-3 pt-2">
                {["w-16", "w-20", "w-14"].map((w, i) => (
                    <Skeleton key={i} className={`h-7 ${w} rounded-b-none rounded-t-md opacity-${i === 0 ? "100" : "50"}`} />
                ))}
            </div>
            {/* Content */}
            <div className="flex-1 overflow-hidden p-4 space-y-4">
                {/* Branch badge */}
                <div className="flex items-center gap-2">
                    <Skeleton className="h-3 w-3 rounded-full" />
                    <Skeleton className="h-3 w-28 rounded-full" />
                    <Skeleton className="ml-auto h-5 w-14 rounded-full" />
                </div>
                {/* Staged section */}
                <div className="space-y-2">
                    <div className="flex items-center gap-2 mb-1">
                        <Skeleton className="h-3 w-3 rounded bg-emerald-500/30" />
                        <Skeleton className="h-3 w-20 rounded-full" />
                        <Skeleton className="h-4 w-6 rounded-full ml-1" />
                    </div>
                    {Array.from({ length: 3 }).map((_, i) => (
                        <div key={i} className="flex items-center gap-2 pl-2 py-1.5 rounded-md bg-emerald-500/5 border border-emerald-500/10">
                            <Skeleton className="h-3.5 w-3.5 bg-emerald-500/20" />
                            <Skeleton className="h-2.5 rounded-full" style={{ width: `${40 + (i * 23) % 35}%` }} />
                            <Skeleton className="ml-auto h-4 w-14 rounded-full" />
                        </div>
                    ))}
                </div>
                {/* Unstaged section */}
                <div className="space-y-2">
                    <div className="flex items-center gap-2 mb-1">
                        <Skeleton className="h-3 w-3 rounded bg-amber-500/30" />
                        <Skeleton className="h-3 w-24 rounded-full" />
                        <Skeleton className="h-4 w-6 rounded-full ml-1" />
                    </div>
                    {Array.from({ length: 4 }).map((_, i) => (
                        <div key={i} className="flex items-center gap-2 pl-2 py-1.5 rounded-md bg-amber-500/5 border border-amber-500/10">
                            <Skeleton className="h-3.5 w-3.5 bg-amber-500/20" />
                            <Skeleton className="h-2.5 rounded-full" style={{ width: `${35 + (i * 19) % 40}%` }} />
                            <Skeleton className="ml-auto h-4 w-14 rounded-full" />
                        </div>
                    ))}
                </div>
            </div>
            {/* Commit area */}
            <div className="shrink-0 border-t border-border/30 p-3 space-y-2">
                <Skeleton className="h-8 w-full" />
                <Skeleton className="h-7 w-full" />
            </div>
        </div>
    )
}