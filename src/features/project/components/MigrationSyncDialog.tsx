import { useEffect, useState } from "react";
import { ImportAnalysis } from "../types";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Badge } from "@/components/ui/badge";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { AlertTriangle, ShieldAlert, FileJson, Loader2, Database, ShieldX, Play } from "lucide-react";
import { projectService } from "@/services/bridge/project";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import SQLPreviewSheet from "@/components/ui/SQLPreviewSheet";

interface MigrationSyncDialogProps {
  projectId: string;
  analysis: ImportAnalysis | null;
  onClose: () => void;
  onApplied: () => void;
}

export function MigrationSyncDialog({
  projectId,
  analysis,
  onClose,
  onApplied,
}: MigrationSyncDialogProps) {
  const [open, setOpen] = useState(false);
  const [isApplying, setIsApplying] = useState(false);
  const [previewSql, setPreviewSql] = useState<string | null>(null);

  useEffect(() => {
    if (analysis) {
      if (analysis.driftStatus === "synced") {
        toast.success("Project is synced", {
          description: "Schema matches exactly — nothing to apply.",
          duration: 3000,
        });
        onClose();
        return;
      }
      setOpen(true);
    } else {
      setOpen(false);
    }
  }, [analysis, onClose]);

  const handleApplyMigrations = async () => {
    try {
      setIsApplying(true);
      await projectService.applyMigrations(projectId);
      toast.success("Migrations applied successfully");
      onApplied();
      setOpen(false);
    } catch (error: any) {
      toast.error("Failed to apply migrations", {
        description: error.message,
      });
    } finally {
      setIsApplying(false);
    }
  };

  const handleApplySnapshot = async () => {
    try {
      setIsApplying(true);
      await projectService.applySnapshot(projectId);
      toast.success("Snapshot applied successfully");
      onApplied();
      setOpen(false);
    } catch (error: any) {
      toast.error("Failed to apply snapshot", {
        description: error.message,
      });
    } finally {
      setIsApplying(false);
    }
  };

  const handlePreviewSQL = async () => {
    try {
      const sql = await projectService.generateSQL(projectId);
      setPreviewSql(sql);
    } catch (error: any) {
      toast.error("Failed to generate SQL", {
        description: error.message,
      });
    }
  };

  if (!analysis) return null;

  // STATE 4: No migrations, no schema.json
  if (!analysis.hasMigrations && !analysis.hasSchemaSnapshot) {
    return (
      <Dialog open={open} onOpenChange={() => { }}>
        <DialogContent className="sm:max-w-md" onInteractOutside={(e) => e.preventDefault()} onEscapeKeyDown={(e) => e.preventDefault()}>
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-destructive">
              <AlertTriangle className="h-5 w-5" />
              Incomplete Project
            </DialogTitle>
            <DialogDescription>
              We could not find any migration files or a schema snapshot in this repository.
              RelWave cannot reconstruct the database from an empty state.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button onClick={() => { setOpen(false); onClose(); }}>
              Open Anyway
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    );
  }

  // STATE 2: Migrations exist, schema differs
  if (analysis.hasMigrations && analysis.driftStatus !== "synced") {
    const hasDestructive = analysis.pendingMigrations.some(m => m.isDestructive);
    const tampered = analysis.lockFileStatus === "tampered";

    return (
      <Dialog open={open} onOpenChange={(val) => { if (!val) { setOpen(false); onClose(); } }}>
        <DialogContent className="sm:max-w-2xl">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Database className="h-5 w-5" />
              Pending Migrations
            </DialogTitle>
            <DialogDescription>
              This project has new migrations that have not been applied to the live database.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4 my-2">
            <ScrollArea className="h-[250px] border rounded-md">
              <div className="p-4 space-y-2">
                {analysis.pendingMigrations.map((m) => (
                  <div key={m.file} className="flex flex-col p-3 border rounded bg-muted/30">
                    <div className="flex items-center justify-between">
                      <span className="font-mono text-sm">{m.file}</span>
                      {m.isDestructive && (
                        <Badge variant="destructive" className="ml-2">DESTRUCTIVE</Badge>
                      )}
                    </div>
                    {m.isDestructive && m.destructiveOps.length > 0 && (
                      <div className="mt-2 text-xs text-destructive bg-destructive/10 p-2 rounded">
                        <ul className="list-disc pl-4">
                          {m.destructiveOps.map((op, i) => <li key={i}>{op}</li>)}
                        </ul>
                      </div>
                    )}
                  </div>
                ))}
              </div>
            </ScrollArea>

            {hasDestructive && (
              <Alert variant="destructive">
                <ShieldAlert className="h-4 w-4" />
                <AlertTitle>Warning: Destructive Operations</AlertTitle>
                <AlertDescription>
                  1 or more migrations contain destructive operations that could lead to data loss.
                </AlertDescription>
              </Alert>
            )}

            {!analysis.targetDatabaseEmpty && (
              <Alert variant="destructive" className="border-orange-500/50 text-orange-600 bg-orange-500/10">
                <AlertTriangle className="h-4 w-4 text-orange-600" />
                <AlertTitle>Target database is not empty</AlertTitle>
                <AlertDescription className="text-orange-600/80">
                  Applying migrations to a non-empty database may cause conflicts.
                </AlertDescription>
              </Alert>
            )}

            {tampered && (
              <Alert variant="destructive">
                <ShieldX className="h-4 w-4" />
                <AlertTitle>Lock File Mismatch</AlertTitle>
                <AlertDescription>
                  The following migration files may have been modified after being applied:
                  <ul className="list-disc pl-4 mt-2">
                    {analysis.tamperedFiles.map(f => <li key={f}>{f}</li>)}
                  </ul>
                  Proceeding is not recommended.
                </AlertDescription>
              </Alert>
            )}
          </div>

          <DialogFooter className="sm:justify-between items-center mt-2">
            {isApplying ? (
              <div className="flex items-center text-sm text-muted-foreground w-full justify-center">
                <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                Applying migrations...
              </div>
            ) : (
              <>
                <Button variant="outline" onClick={() => { setOpen(false); onClose(); }}>
                  Skip for now
                </Button>
                <Button
                  onClick={handleApplyMigrations}
                  disabled={tampered}
                  className={cn(hasDestructive && "bg-destructive text-destructive-foreground hover:bg-destructive/90")}
                >
                  <Play className="h-4 w-4 mr-2" />
                  Apply Migrations
                </Button>
              </>
            )}
          </DialogFooter>
        </DialogContent>
      </Dialog>
    );
  }

  // STATE 3: No migrations, schema.json exists
  if (!analysis.hasMigrations && analysis.hasSchemaSnapshot && analysis.driftStatus !== "synced") {
    return (
      <Dialog open={open} onOpenChange={(val) => { if (!val) { setOpen(false); onClose(); } }}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <FileJson className="h-5 w-5" />
              Apply Schema Snapshot
            </DialogTitle>
            <DialogDescription>
              No migration history found, but a schema snapshot is available.
              We can generate a baseline migration to reconstruct the schema.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4 my-2">
            {!analysis.targetDatabaseEmpty && (
              <Alert variant='destructive' className="border-orange-500/50 text-orange-600 bg-orange-500/10">
                <AlertTriangle className="h-4 w-4 text-orange-600" />
                <AlertTitle>Target database is not empty</AlertTitle>
                <AlertDescription className="text-orange-600/80">
                  Applying baseline to a non-empty database may cause conflicts.
                </AlertDescription>
              </Alert>
            )}
          </div>

          <DialogFooter className="flex-col sm:flex-row gap-2 sm:gap-0 mt-4">
            {isApplying ? (
              <div className="flex items-center text-sm text-muted-foreground w-full justify-center py-2">
                <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                Applying snapshot...
              </div>
            ) : (
              <>
                <div className="flex-1">
                  <Button variant="outline" onClick={() => { setOpen(false); onClose(); }}>
                    Skip
                  </Button>
                </div>
                <Button variant="secondary" onClick={handlePreviewSQL}>
                  Preview SQL
                </Button>
                <Button onClick={handleApplySnapshot}>
                  Generate & Apply
                </Button>
              </>
            )}
          </DialogFooter>
        </DialogContent>

        <SQLPreviewSheet
          open={!!previewSql}
          onOpenChange={(val) => { if (!val) setPreviewSql(null); }}
          sql={previewSql || ""}
          title="Baseline SQL Preview"
        />
      </Dialog>
    );
  }

  return null;
}
