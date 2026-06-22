import { Card, CardHeader, CardContent } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";

export function MigrationsPanelLoadingState() {
    return (
        <div className="h-full flex flex-col">
            <Card className="rounded-lg border-border/50 h-full flex flex-col overflow-hidden bg-card/65 shadow-sm">
                <CardHeader className="border-b border-border/50 px-4 py-4 flex flex-row items-center justify-between space-y-0">
                    <div className="flex items-center gap-2">
                        <Skeleton className="h-4 w-4" />
                        <Skeleton className="h-4 w-24 rounded-full" />
                    </div>
                    <div className="flex items-center gap-2">
                        <Skeleton className="h-5 w-20 rounded-full" />
                        <Skeleton className="h-7 w-7" />
                    </div>
                </CardHeader>
                <CardContent className="flex-1 p-4 space-y-4 overflow-hidden">
                    <div className="grid grid-cols-2 gap-3">
                        {["Applied", "Pending"].map((_, i) => (
                            <Card key={i} className="rounded-lg border-border/30 bg-muted/20 p-3 space-y-1.5 shadow-none">
                                <Skeleton className="h-2.5 w-14 rounded-full bg-muted/60" />
                                <Skeleton className="h-7 w-10 bg-muted/70" />
                            </Card>
                        ))}
                    </div>
                    <div className="space-y-2">
                        {[
                            { status: "applied", w: "w-40" },
                            { status: "applied", w: "w-52" },
                            { status: "applied", w: "w-36" },
                            { status: "pending", w: "w-48" },
                            { status: "pending", w: "w-44" },
                        ].map((row, i) => (
                            <div
                                key={i}
                                className={`rounded-lg border p-3 ${row.status === "applied" ? "border-emerald-500/20 bg-emerald-500/5" : "border-amber-500/20 bg-amber-500/5"}`}
                            >
                                <div className="flex items-center gap-2 mb-2">
                                    <Skeleton className={`h-4 w-4 rounded-full ${row.status === "applied" ? "bg-emerald-500/30" : "bg-amber-500/30"}`} />
                                    <Skeleton className="h-2.5 w-24 rounded-full bg-muted/70" />
                                    <Skeleton className={`ml-auto h-5 w-14 rounded-full ${row.status === "applied" ? "bg-emerald-500/25" : "bg-amber-500/25"}`} />
                                </div>
                                <Skeleton className={`h-2.5 ${row.w} rounded-full bg-muted/50 mb-2`} />
                                <div className="flex gap-1.5">
                                    <Skeleton className="h-6 w-14 bg-muted/40" />
                                    <Skeleton className="h-6 w-16 bg-muted/30" />
                                </div>
                            </div>
                        ))}
                    </div>
                </CardContent>
            </Card>
        </div>
    )
}
