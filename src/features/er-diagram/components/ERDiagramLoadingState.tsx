

export function ERDiagramLoadingState() {
    return (
        <div className="h-full flex flex-col bg-background animate-pulse overflow-hidden">
            {/* Toolbar skeleton */}
            <div className="shrink-0 border-b border-border/30 bg-background/90 px-4 py-2.5 flex items-center justify-between gap-3">
                <div className="flex items-center gap-2">
                    <div className="h-4 w-4 rounded bg-muted/60" />
                    <div className="h-4 w-28 rounded-full bg-muted/60" />
                    <div className="h-5 w-px bg-border/40 mx-1" />
                    <div className="h-6 w-20 rounded-full bg-muted/40" />
                </div>
                <div className="flex items-center gap-2">
                    <div className="h-7 w-7 rounded-md bg-muted/40" />
                    <div className="h-7 w-7 rounded-md bg-muted/40" />
                    <div className="h-7 w-24 rounded-md bg-muted/50" />
                </div>
            </div>
            {/* Canvas with ghost table nodes */}
            <div className="flex-1 relative bg-[radial-gradient(circle,hsl(var(--border)/0.3)_1px,transparent_1px)] bg-[size:24px_24px]">
                {[
                    { top: "12%", left: "8%", cols: 5 },
                    { top: "18%", left: "38%", cols: 4 },
                    { top: "10%", left: "65%", cols: 6 },
                    { top: "52%", left: "22%", cols: 3 },
                    { top: "55%", left: "58%", cols: 5 },
                ].map((node, i) => (
                    <div
                        key={i}
                        className="absolute w-48 rounded-lg border border-border/40 bg-card/80 overflow-hidden shadow-sm"
                        style={{ top: node.top, left: node.left }}
                    >
                        <div className="h-8 border-b border-border/30 bg-muted/50 px-3 flex items-center gap-2">
                            <div className="h-2.5 w-24 rounded-full bg-muted/80" />
                        </div>
                        <div className="p-2 space-y-1.5">
                            {Array.from({ length: node.cols }).map((_, j) => (
                                <div key={j} className="flex items-center gap-2">
                                    <div className={`h-2 w-2 rounded-full ${j === 0 ? "bg-amber-500/40" : "bg-muted/50"}`} />
                                    <div className="h-2 rounded-full bg-muted/50" style={{ width: `${35 + (j * 19) % 45}%` }} />
                                    <div className="ml-auto h-2 rounded-full bg-muted/30" style={{ width: `${20 + (j * 11) % 20}%` }} />
                                </div>
                            ))}
                        </div>
                    </div>
                ))}
                {/* MiniMap ghost */}
                <div className="absolute bottom-4 right-4 w-28 h-20 rounded-lg border border-border/30 bg-card/60" />
                {/* Controls ghost */}
                <div className="absolute bottom-4 left-4 flex flex-col gap-1">
                    {Array.from({ length: 3 }).map((_, i) => (
                        <div key={i} className="h-7 w-7 rounded-md bg-card/60 border border-border/30" />
                    ))}
                </div>
            </div>
        </div>
    )
}
