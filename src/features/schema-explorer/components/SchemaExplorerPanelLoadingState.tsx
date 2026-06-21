import { Skeleton } from "@/components/ui/skeleton";

export function SchemaExplorerPanelLoadingState() {
    return (
        <div className="h-full flex flex-col bg-background text-foreground overflow-hidden animate-pulse">
            {/* ── Header (breadcrumb + actions) ── */}
            <div className="shrink-0 border-b border-border/40 bg-background/90 px-4 py-2 flex items-center justify-between gap-3">
                <div className="flex items-center gap-2">
                    <Skeleton className="h-3.5 w-20 rounded-full bg-muted/60" />
                    <Skeleton className="h-3 w-1 rounded-full bg-muted/40" />
                    <Skeleton className="h-3.5 w-28 rounded-full bg-muted/70" />
                </div>
                <div className="flex items-center gap-2">
                    <Skeleton className="h-7 w-32 rounded-md bg-muted/50" />
                    <Skeleton className="h-7 w-28 rounded-md bg-primary/20" />
                </div>
            </div>

            {/* ── Body: left tree + right metadata ── */}
            <div className="flex-1 flex overflow-hidden">

                {/* Left tree panel */}
                <div className="w-72 shrink-0 border-r border-border/40 bg-card/20 overflow-y-auto p-2 space-y-0.5">

                    {/* Database root node */}
                    <div className="flex items-center gap-1.5 px-2 py-1.5 rounded-md">
                        <Skeleton className="h-3 w-3 rounded bg-primary/40" />
                        <Skeleton className="h-3 w-24 rounded-full bg-muted/70" />
                        <Skeleton className="ml-auto h-4 w-16 rounded-full bg-muted/40" />
                    </div>

                    {/* Schema node (expanded) */}
                    <div className="flex items-center gap-1.5 px-2 py-1.5 pl-4 rounded-md">
                        <Skeleton className="h-2.5 w-2.5 rounded bg-muted/50" />
                        <Skeleton className="h-3 w-3 rounded bg-primary/30" />
                        <Skeleton className="h-3 w-20 rounded-full bg-muted/65" />
                        <Skeleton className="ml-auto h-4 w-6 rounded-full bg-muted/40" />
                    </div>

                    {/* Table rows under schema */}
                    {[
                        "w-20", "w-16", "w-14", "w-12",
                        "w-16", "w-20", "w-24", "w-28",
                        "w-22", "w-26", "w-32", "w-18", "w-16",
                    ].map((w, i) => (
                        <div key={i} className="flex items-center gap-1.5 px-2 py-1 pl-8 rounded-md">
                            <Skeleton className="h-2.5 w-2.5 rounded bg-muted/40 shrink-0" />
                            <Skeleton className="h-2.5 w-3.5 rounded bg-primary/25 shrink-0" />
                            <Skeleton className={`h-2.5 ${w} rounded-full bg-muted/55`} />
                            {/* Occasional FK badge */}
                            {i === 7 && (
                                <Skeleton className="ml-auto h-3.5 w-7 rounded-full bg-primary/20 text-[9px]" />
                            )}
                        </div>
                    ))}
                </div>

                {/* Right metadata panel — DB overview (no table selected) */}
                <div className="flex-1 flex flex-col overflow-hidden p-6 space-y-6">

                    {/* DB title row */}
                    <div className="flex items-center gap-3">
                        <Skeleton className="h-8 w-8 rounded-full bg-primary/20 shrink-0" />
                        <div className="space-y-1.5">
                            <Skeleton className="h-5 w-32 rounded-full bg-muted/70" />
                            <Skeleton className="h-3 w-16 rounded-full bg-muted/40" />
                        </div>
                    </div>
                    {/* 2 × 3 stat cards grid */}
                    <div className="grid grid-cols-3 gap-3">
                        {[
                            { w: "w-6", label: "w-14" },
                            { w: "w-8", label: "w-12" },
                            { w: "w-10", label: "w-16" },
                            { w: "w-4", label: "w-20" },
                            { w: "w-8", label: "w-14" },
                            { w: "w-4", label: "w-10" },
                        ].map((card, i) => (
                            <div
                                key={i}
                                className="rounded-lg border border-border/30 bg-card/50 p-4 space-y-2"
                            >
                                {/* Big number */}
                                <Skeleton className={`h-7 ${card.w} rounded-md bg-muted/70`} />
                                {/* Label */}
                                <Skeleton className={`h-2.5 ${card.label} rounded-full bg-muted/40`} />
                            </div>
                        ))}
                    </div>
                </div>
            </div>

            {/* ── Footer ── */}
            <div className="shrink-0 border-t border-border/40 bg-card/50 px-4 py-1.5 flex items-center justify-between">
                <div className="flex items-center gap-3">
                    <Skeleton className="h-3 w-36 rounded-full bg-muted/50" />
                    <div className="h-4 w-10 rounded-full bg-emerald-500/25" />
                </div>
                <Skeleton className="h-3 w-64 rounded-full bg-muted/30" />
            </div>
        </div>
    )
}
