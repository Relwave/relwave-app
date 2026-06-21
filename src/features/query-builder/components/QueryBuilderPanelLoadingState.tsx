import { Skeleton } from "@/components/ui/skeleton";

export function QueryBuilderPanelLoadingState() {
    return (
        <div className="h-full flex flex-col bg-transparent">
            {/* Header */}
            <div className="shrink-0 border-b border-border/30 bg-background/80 px-4 py-3 flex items-center justify-between gap-3">
                <div className="flex items-center gap-3">
                    <Skeleton className="h-4 w-4" />
                    <Skeleton className="h-4 w-32 rounded-full" />
                </div>
                <div className="flex items-center gap-2">
                    <Skeleton className="h-7 w-24" />
                    <Skeleton className="h-7 w-20" />
                </div>
            </div>
            {/* Body */}
            <div className="flex-1 flex overflow-hidden p-3 gap-3">
                {/* Sidebar skeleton */}
                <div className="w-56 shrink-0 rounded-lg border border-border/40 bg-card/50 p-3 space-y-4">
                    <div className="space-y-2">
                        <Skeleton className="h-3 w-14 rounded-full" />
                        {Array.from({ length: 5 }).map((_, i) => (
                            <div key={i} className="flex items-center gap-2">
                                <Skeleton className="h-3 w-3" />
                                <Skeleton className="h-2.5 rounded-full" style={{ width: `${45 + (i * 17) % 40}%` }} />
                            </div>
                        ))}
                    </div>
                    <div className="border-t border-border/30 pt-3 space-y-2">
                        <Skeleton className="h-3 w-20 rounded-full" />
                        {Array.from({ length: 3 }).map((_, i) => (
                            <Skeleton key={i} className="h-6 w-full" />
                        ))}
                    </div>
                </div>
                {/* Main canvas + results */}
                <div className="flex-1 flex flex-col rounded-lg border border-border/40 bg-card/50 overflow-hidden">
                    {/* Canvas area (diagram) */}
                    <div className="flex-1 relative p-4">
                        {/* Fake node cards */}
                        {[{ top: "20%", left: "15%" }, { top: "25%", left: "55%" }, { top: "60%", left: "35%" }].map((pos, i) => (
                            <div
                                key={i}
                                className="absolute w-44 rounded-lg border border-border/40 bg-background/70 overflow-hidden"
                                style={pos}
                            >
                                <div className="h-7 border-b border-border/30 bg-muted/40 px-3 flex items-center gap-2">
                                    <Skeleton className="h-2.5 w-20 rounded-full bg-muted/70" />
                                </div>
                                <div className="p-2 space-y-1.5">
                                    {Array.from({ length: 3 }).map((_, j) => (
                                        <div key={j} className="flex items-center gap-2">
                                            <Skeleton className="h-2 w-2 rounded-full" />
                                            <Skeleton className="h-2 rounded-full" style={{ width: `${40 + (j * 15) % 30}%` }} />
                                        </div>
                                    ))}
                                </div>
                            </div>
                        ))}
                    </div>
                    {/* SQL results pane */}
                    <div className="h-36 border-t border-border/30 p-3 space-y-2">
                        <Skeleton className="h-6 w-full" />
                        {Array.from({ length: 3 }).map((_, i) => (
                            <Skeleton key={i} className="h-5 w-full" />
                        ))}
                    </div>
                </div>
            </div>
            {/* Status bar */}
            <div className="h-7 border-t border-border/30 bg-background/70 px-4 flex items-center gap-4">
                <Skeleton className="h-2.5 w-28 rounded-full" />
                <Skeleton className="h-2.5 w-20 rounded-full" />
            </div>
        </div>
    )
}
