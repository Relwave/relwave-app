interface StatusBarProps {
    databaseName: string;
    tableCount: number;
    lineCount: number;
}

export function StatusBar({
    databaseName,
    tableCount,
    lineCount,
}: StatusBarProps) {
    return (
        <footer className="h-6 border-t border-border/40 bg-muted/20 px-4 flex items-center justify-between text-[10px] text-muted-foreground shrink-0">
            <div className="flex items-center gap-4">
                <span className="flex items-center gap-1">
                    <span className="w-2 h-2 rounded-full bg-emerald-500"></span>
                    Connected
                </span>
                <span>{databaseName}</span>
                <span>{tableCount} tables</span>
            </div>
            <div className="flex items-center gap-4">
                <span>PostgreSQL</span>
                <span>Ln {lineCount}</span>
            </div>
        </footer>
    );
}
