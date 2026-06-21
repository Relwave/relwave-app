import { Skeleton } from "@/components/ui/skeleton";
import { Card } from "@/components/ui/card";

export function SQLWorkspacePanelLoadingState() {
    return (
        <div className="h-full flex flex-col bg-transparent">
            {/* Header skeleton */}
            <div className="shrink-0 border-b border-border/30 bg-background/80 px-4 py-3 flex items-center justify-between gap-3">
                <div className="flex items-center gap-3">
                    <Skeleton className="h-4 w-4" />
                    <Skeleton className="h-4 w-36 rounded-full" />
                </div>
                <div className="flex items-center gap-2">
                    <Skeleton className="h-7 w-20" />
                    <Skeleton className="h-7 w-7" />
                </div>
            </div>
            {/* Body */}
            <div className="flex-1 flex overflow-hidden p-3 gap-3">
                {/* Sidebar skeleton */}
                <Card className="w-52 shrink-0 bg-card/50 p-3 space-y-3">
                    <Skeleton className="h-3 w-16 rounded-full" />
                    {Array.from({ length: 7 }).map((_, i) => (
                        <div key={i} className="flex items-center gap-2">
                            <Skeleton className="h-3 w-3" />
                            <Skeleton className="h-2.5 rounded-full" style={{ width: `${50 + (i * 13) % 40}%` }} />
                        </div>
                    ))}
                </Card>
                {/* Editor area skeleton */}
                <Card className="flex-1 flex flex-col bg-card/50 overflow-hidden">
                    {/* Tab bar */}
                    <div className="h-9 border-b border-border/30 bg-background/60 flex items-center gap-1 px-2">
                        <Skeleton className="h-6 w-24" />
                        <Skeleton className="h-6 w-20" />
                        <Skeleton className="ml-auto h-5 w-5" />
                    </div>
                    {/* Code area */}
                    <div className="h-[45%] border-b border-border/30 p-4 space-y-2.5">
                        {["w-1/3", "w-2/5", "w-1/2", "w-1/4", "w-2/3", "w-1/3"].map((w, i) => (
                            <Skeleton key={i} className={`h-3 ${w} rounded-full`} />
                        ))}
                    </div>
                    {/* Results area */}
                    <div className="flex-1 p-3 space-y-2">
                        <Skeleton className="h-7 w-full mb-2" />
                        {Array.from({ length: 4 }).map((_, i) => (
                            <Skeleton key={i} className="h-6 w-full" />
                        ))}
                    </div>
                </Card>
            </div>
            {/* Status bar */}
            <div className="h-7 border-t border-border/30 bg-background/70 px-4 flex items-center gap-4">
                <Skeleton className="h-2.5 w-24 rounded-full" />
                <Skeleton className="h-2.5 w-20 rounded-full" />
            </div>
        </div>
    )
}
