import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { Spinner } from "@/components/ui/spinner";

export function MonitoringLoadingState() {
    return (
        <div className="min-h-120 space-y-4">
            <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
                {Array.from({ length: 4 }).map((_, index) => (
                    <Card key={index} className="rounded-lg border-border/50 bg-card/65 shadow-sm">
                        <CardHeader className="flex flex-row items-start justify-between gap-3 pb-2">
                            <div className="space-y-2">
                                <Skeleton className="h-3 w-16 rounded-full bg-muted/70" />
                                <Skeleton className="h-8 w-24 rounded-lg bg-muted/70" />
                            </div>
                            <div className="h-9 w-9 rounded-md border border-border/50 bg-background/60 p-2">
                                <Skeleton className="h-full w-full rounded-sm bg-muted/70" />
                            </div>
                        </CardHeader>
                        <CardContent>
                            <Skeleton className="h-3 w-28 rounded-full bg-muted/70" />
                            {index === 1 ? <Skeleton className="mt-3 h-1.5 w-full rounded-full bg-muted/70" /> : null}
                        </CardContent>
                    </Card>
                ))}
            </div>

            <div className="grid gap-4 xl:grid-cols-[minmax(0,1.4fr)_minmax(360px,0.8fr)]">
                <Card className="overflow-hidden rounded-lg border-border/50 bg-card/65 shadow-sm">
                    <CardHeader className="border-b border-border/30 pb-3">
                        <div className="flex items-center justify-between gap-4">
                            <div className="space-y-2">
                                <Skeleton className="h-4 w-36 rounded-full bg-muted/70" />
                                <Skeleton className="h-3 w-52 rounded-full bg-muted/70" />
                            </div>
                            <Skeleton className="h-6 w-20 rounded-full bg-muted/70" />
                        </div>
                    </CardHeader>
                    <CardContent className="flex h-72 items-center justify-center p-4">
                        <div className="flex flex-col items-center gap-3 text-muted-foreground">
                            <Spinner className="h-8 w-8" />
                            <p className="text-xs">Connecting to live monitoring stream</p>
                        </div>
                    </CardContent>
                </Card>

                <Card className="overflow-hidden rounded-lg border-border/50 bg-card/65 shadow-sm">
                    <CardHeader className="border-b border-border/30 pb-3">
                        <div className="space-y-2">
                            <Skeleton className="h-4 w-28 rounded-full bg-muted/70" />
                            <Skeleton className="h-3 w-56 rounded-full bg-muted/70" />
                        </div>
                    </CardHeader>
                    <CardContent className="space-y-3 p-4">
                        {Array.from({ length: 5 }).map((_, index) => (
                            <div key={index} className="flex items-center gap-3 rounded-md border border-border/30 bg-background/40 px-3 py-3">
                                <Skeleton className="h-3 w-14 rounded-full bg-muted/70" />
                                <Skeleton className="h-3 w-16 rounded-full bg-muted/70" />
                                <Skeleton className="h-5 w-16 rounded-full bg-muted/70" />
                                <Skeleton className="h-3 flex-1 rounded-full bg-muted/70" />
                            </div>
                        ))}
                    </CardContent>
                </Card>
            </div>
        </div>
    );
}
