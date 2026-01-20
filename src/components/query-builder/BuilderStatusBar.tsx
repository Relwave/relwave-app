interface BuilderStatusBarProps {
    tableCount: number;
    joinCount: number;
    filterCount: number;
    limit: number;
    isExecuting: boolean;
}

export function BuilderStatusBar({
    tableCount,
    joinCount,
    filterCount,
    limit,
    isExecuting,
}: BuilderStatusBarProps) {
    return (
        <footer className="h-6 border-t border-border/40 bg-muted/30 flex items-center justify-between px-3 text-[10px] text-muted-foreground shrink-0">
            <div className="flex items-center gap-3">
                <span>{tableCount} table{tableCount !== 1 ? "s" : ""}</span>
                <span>{joinCount} join{joinCount !== 1 ? "s" : ""}</span>
                {filterCount > 0 && <span>{filterCount} filter{filterCount !== 1 ? "s" : ""}</span>}
            </div>
            <div className="flex items-center gap-3">
                {limit > 0 && <span>Limit: {limit}</span>}
                {isExecuting && <span className="text-primary">Executing...</span>}
            </div>
        </footer>
    );
}
