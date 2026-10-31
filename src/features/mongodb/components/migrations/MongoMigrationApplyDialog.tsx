import React, { useState } from "react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Play, Loader2, Info, AlertTriangle, ShieldCheck } from "lucide-react";
import { useApplyMongoMigration } from "../../hooks/useMongoMigrations";

export const STATIC_PREFLIGHT_ADVISORY =
  "Validates manifest structure, expression safety, and syntax; does not test runtime constraint satisfaction on live data.";

interface MongoMigrationApplyDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  dbId: string;
  migrationId?: string;
  migrationName?: string;
  onSuccess?: () => void;
}

export function MongoMigrationApplyDialog({
  open,
  onOpenChange,
  dbId,
  migrationId,
  migrationName,
  onSuccess,
}: MongoMigrationApplyDialogProps) {
  const [dryRun, setDryRun] = useState(false);
  const applyMutation = useApplyMongoMigration(dbId);

  const handleApply = async () => {
    try {
      const res = await applyMutation.mutateAsync({
        version: migrationId,
        dryRun,
      });
      if (res.success) {
        onSuccess?.();
        onOpenChange(false);
      }
    } catch {
      // toast is dispatched inside useApplyMongoMigration onError
    }
  };

  const isPending = applyMutation.isPending;

  return (
    <Dialog open={open} onOpenChange={(val) => !isPending && onOpenChange(val)}>
      <DialogContent className="max-w-lg p-5 gap-4">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-base font-semibold">
            <Play className="h-4 w-4 text-emerald-500 fill-emerald-500" />
            {migrationId ? "Apply Migration" : "Apply All Pending Migrations"}
          </DialogTitle>
          <DialogDescription className="text-xs text-muted-foreground">
            {migrationId ? (
              <span>
                You are about to apply migration <strong className="text-foreground">{migrationId}</strong>
                {migrationName && ` (${migrationName})`}.
              </span>
            ) : (
              <span>You are about to apply all discovered pending migrations forward in sequence.</span>
            )}
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-3.5 py-1 text-xs">
          <Alert className="py-2.5 bg-muted/40 border-border/60">
            <Info className="h-4 w-4 text-blue-500 shrink-0" />
            <AlertDescription className="text-xs text-muted-foreground leading-relaxed">
              Applying acquires a fencing lease on <code className="font-mono text-foreground font-semibold">_relwave_migrations_lock</code>,
              appends forward audit journal entries, and commits state sequentially.
            </AlertDescription>
          </Alert>

          {/* Dry Run Toggle Option */}
          <div className="rounded-lg border border-border/80 p-3 bg-muted/20 space-y-2">
            <div className="flex items-start gap-2.5">
              <Checkbox
                id="dry-run-checkbox"
                checked={dryRun}
                onCheckedChange={(checked) => setDryRun(Boolean(checked))}
                disabled={isPending}
                className="mt-0.5"
              />
              <div className="grid gap-1">
                <label
                  htmlFor="dry-run-checkbox"
                  className="text-xs font-semibold leading-none cursor-pointer text-foreground"
                >
                  Dry Run — Static Preflight
                </label>
                <p className="text-[11px] text-muted-foreground leading-normal">
                  {STATIC_PREFLIGHT_ADVISORY}
                </p>
              </div>
            </div>

            {dryRun && (
              <div className="mt-2 pt-2 border-t border-border/40 flex items-center gap-1.5 text-[11px] text-blue-500 font-medium">
                <ShieldCheck className="h-3.5 w-3.5" />
                Locks will NOT be acquired; live cluster collections will NOT be modified.
              </div>
            )}
          </div>
        </div>

        <DialogFooter className="flex items-center justify-between sm:justify-between gap-2 pt-2 border-t border-border/40">
          <Button
            variant="outline"
            size="sm"
            onClick={() => onOpenChange(false)}
            disabled={isPending}
          >
            Cancel
          </Button>

          <Button
            size="sm"
            onClick={handleApply}
            disabled={isPending}
            className={`gap-2 text-white ${
              dryRun
                ? "bg-blue-600 hover:bg-blue-700"
                : "bg-emerald-600 hover:bg-emerald-700"
            }`}
          >
            {isPending ? (
              <>
                <Loader2 className="h-3.5 w-3.5 animate-spin" />
                {dryRun ? "Running Preflight..." : "Applying..."}
              </>
            ) : dryRun ? (
              "Run Static Preflight"
            ) : (
              "Confirm & Apply"
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
