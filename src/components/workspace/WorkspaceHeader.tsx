import { Play, Square, Database, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";

interface WorkspaceHeaderProps {
    databaseName: string;
    isExecuting: boolean;
    queryProgress: { rows: number; elapsed: number } | null;
    canExecute: boolean;
    onExecute: () => void;
    onCancel: () => void;
}

export function WorkspaceHeader({
    databaseName,
    isExecuting,
    queryProgress,
    canExecute,
    onExecute,
    onCancel,
}: WorkspaceHeaderProps) {
    return (
        <header className="h-12 border-b border-border/40 bg-background flex items-center justify-between px-4 shrink-0">
            <div className="flex items-center gap-3">
                <Database className="h-4 w-4 text-muted-foreground" />
                <span className="text-sm font-medium">{databaseName || 'Database'}</span>
                <span className="text-muted-foreground/50">•</span>
                <span className="text-sm font-medium text-foreground">SQL Workspace</span>
            </div>

            <div className="flex items-center gap-2">
                {/* Execution status */}
                {isExecuting && (
                    <div className="flex items-center gap-2 text-xs text-muted-foreground bg-muted/50 px-3 py-1.5 rounded-md">
                        <Loader2 className="h-3.5 w-3.5 animate-spin text-primary" />
                        <span>{queryProgress?.rows || 0} rows</span>
                        <span className="text-muted-foreground/50">•</span>
                        <span>{queryProgress?.elapsed || 0}s</span>
                    </div>
                )}

                {/* Run/Stop buttons */}
                {isExecuting ? (
                    <Button
                        size="sm"
                        variant="destructive"
                        onClick={onCancel}
                        className="h-8 gap-1.5"
                    >
                        <Square className="h-3.5 w-3.5" />
                        Stop
                    </Button>
                ) : (
                    <Button
                        size="sm"
                        onClick={onExecute}
                        disabled={!canExecute}
                        className="h-8 gap-1.5"
                    >
                        <Play className="h-3.5 w-3.5" />
                        Run Query
                    </Button>
                )}
            </div>
        </header>
    );
}
