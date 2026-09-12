import { Play, Square, Database, Loader2, Sparkles } from "lucide-react";
import { Button } from "@/components/ui/button";
import { ExplainQueryButton } from "./ExplainQueryButton";

interface WorkspaceHeaderProps {
  dbId: string;
  databaseName: string;
  isExecuting: boolean;
  queryProgress: { rows: number; elapsed: number } | null;
  canExecute: boolean;
  activeQuery?: string;
  onExecute: () => void;
  onCancel: () => void;
  onNLQueryClick: () => void;
}

export function WorkspaceHeader({
  dbId,
  databaseName,
  isExecuting,
  queryProgress,
  canExecute,
  activeQuery,
  onExecute,
  onCancel,
  onNLQueryClick,
}: WorkspaceHeaderProps) {
  return (
    <header className="h-12 border-b border-border/40 bg-background/80 backdrop-blur-xl flex items-center justify-between px-4 shrink-0">
      <div className="flex items-center gap-3">
        <Database className="h-4 w-4 text-muted-foreground" />
        <span className="text-sm font-medium">{databaseName || "Database"}</span>
        <span className="text-muted-foreground/50">•</span>
        <span className="text-sm font-medium text-foreground">SQL Workspace</span>
      </div>

      <div className="flex items-center gap-2">
        {/* Execution status */}
        {isExecuting && (
          <div className="flex items-center gap-2 text-xs text-muted-foreground bg-muted/65 px-3 py-1.5 rounded-md border border-border/50">
            <Loader2 className="h-3.5 w-3.5 animate-spin text-primary" />
            <span>{queryProgress?.rows || 0} rows</span>
            <span className="text-muted-foreground/50">•</span>
            <span>{queryProgress?.elapsed || 0}s</span>
          </div>
        )}

        {/* AI Explain Query */}
        <ExplainQueryButton
          sql={activeQuery ?? ""}
          disabled={isExecuting || !activeQuery?.trim()}
          dbId={dbId}
        />

        {/* NL to SQL Query */}
        <Button
          size="sm"
          variant="outline"
          onClick={onNLQueryClick}
          disabled={isExecuting}
          className="h-8 gap-1.5 border-primary/20 hover:border-primary/50 text-primary hover:text-primary"
        >
          <Sparkles className="h-3.5 w-3.5" />
          AI Query
        </Button>

        {/* Run/Stop buttons */}
        {isExecuting ? (
          <Button size="sm" variant="destructive" onClick={onCancel} className="h-8 gap-1.5">
            <Square className="h-3.5 w-3.5" />
            Stop
          </Button>
        ) : (
          <Button size="sm" onClick={onExecute} disabled={!canExecute} className="h-8 gap-1.5">
            <Play className="h-3.5 w-3.5" />
            Run Query
          </Button>
        )}
      </div>
    </header>
  );
}
