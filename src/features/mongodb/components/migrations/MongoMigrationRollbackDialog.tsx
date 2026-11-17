import React, { useState, useEffect } from "react";
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
import { RotateCcw, Loader2, ShieldAlert, Info } from "lucide-react";
import { useRollbackMongoMigration } from "../../hooks/useMongoMigrations";

export const IRREVERSIBLE_ROLLBACK_ACKNOWLEDGMENT =
  "I acknowledge that data destroyed by dropCollection cannot be restored and attempt partial compensation of other steps.";

interface MongoMigrationRollbackDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  dbId: string;
  migrationId: string;
  migrationName?: string;
  isReversible?: boolean;
  onSuccess?: () => void;
}

export function MongoMigrationRollbackDialog({
  open,
  onOpenChange,
  dbId,
  migrationId,
  migrationName,
  isReversible = true,
  onSuccess,
}: MongoMigrationRollbackDialogProps) {
  const [acknowledged, setAcknowledged] = useState(false);
  const rollbackMutation = useRollbackMongoMigration(dbId);

  // Reset acknowledgment when dialog opens
  useEffect(() => {
    if (open) {
      setAcknowledged(false);
    }
  }, [open]);

  const isIrreversible = isReversible === false;
  const isPending = rollbackMutation.isPending;
  const canSubmit = (!isIrreversible || acknowledged) && !isPending;

  const handleRollback = async () => {
    try {
      const res = await rollbackMutation.mutateAsync({
        version: migrationId,
        force: isIrreversible ? true : acknowledged,
      });
      if (res.success) {
        onSuccess?.();
        onOpenChange(false);
      }
    } catch {
      // toast is dispatched inside useRollbackMongoMigration onError
    }
  };

  return (
    <Dialog open={open} onOpenChange={(val) => !isPending && onOpenChange(val)}>
      <DialogContent className="max-w-lg p-5 gap-4">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-base font-semibold text-amber-500">
            <RotateCcw className="h-5 w-5" />
            Rollback Migration: {migrationId}
          </DialogTitle>
          <DialogDescription className="text-xs text-muted-foreground">
            Inverse compensation will execute steps in reverse order to unwind state.
            {migrationName && ` Target: ${migrationName}.`}
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-3.5 py-1 text-xs">
          {/* Explanation of Compensation */}
          <Alert className="py-2.5 bg-muted/40 border-border/60">
            <Info className="h-4 w-4 text-blue-500 shrink-0" />
            <AlertDescription className="text-xs text-muted-foreground leading-relaxed">
              Rollback acquires a lock, checks that all steps can be safely compensated, and writes
              compensation audit events. If inverse steps fail or non-empty collections are
              encountered on createCollection compensation, execution halts with{" "}
              <code className="font-mono text-destructive">
                FAILED_MANUAL_INTERVENTION_REQUIRED
              </code>
              .
            </AlertDescription>
          </Alert>

          {/* Irreversibility Warning & Checkbox */}
          {isIrreversible ? (
            <Alert
              variant="destructive"
              className="py-3 bg-destructive/10 border-destructive/30 space-y-2.5"
            >
              <div className="flex items-start gap-2">
                <ShieldAlert className="h-4 w-4 text-destructive shrink-0 mt-0.5" />
                <div>
                  <AlertTitle className="text-xs font-semibold text-destructive">
                    Irreversible Steps Detected
                  </AlertTitle>
                  <AlertDescription className="text-[11px] text-destructive/90 leading-relaxed mt-0.5">
                    This migration contains operations (such as{" "}
                    <code className="font-mono font-semibold">dropCollection</code>) that cannot be
                    automatically reversed. Any collections and indexes dropped during forward
                    execution cannot have their historical data restored by rolling back.
                  </AlertDescription>
                </div>
              </div>

              <div className="pt-2 border-t border-destructive/20 flex items-start gap-2.5">
                <Checkbox
                  id="irreversible-ack-checkbox"
                  checked={acknowledged}
                  onCheckedChange={(checked) => setAcknowledged(Boolean(checked))}
                  disabled={isPending}
                  className="mt-0.5 border-destructive data-[state=checked]:bg-destructive"
                />
                <label
                  htmlFor="irreversible-ack-checkbox"
                  className="text-[11px] font-medium leading-tight text-destructive cursor-pointer select-none"
                >
                  {IRREVERSIBLE_ROLLBACK_ACKNOWLEDGMENT}
                </label>
              </div>
            </Alert>
          ) : (
            <div className="rounded-lg border border-border/60 p-3 bg-muted/10 flex items-start gap-2.5">
              <Checkbox
                id="reversible-confirm-checkbox"
                checked={acknowledged}
                onCheckedChange={(checked) => setAcknowledged(Boolean(checked))}
                disabled={isPending}
                className="mt-0.5"
              />
              <label
                htmlFor="reversible-confirm-checkbox"
                className="text-xs text-foreground cursor-pointer select-none"
              >
                I confirm I want to execute inverse compensation on live collections.
              </label>
            </div>
          )}
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
            onClick={handleRollback}
            disabled={!canSubmit}
            className="gap-2 bg-destructive hover:bg-destructive/90 text-destructive-foreground font-medium"
          >
            {isPending ? (
              <>
                <Loader2 className="h-3.5 w-3.5 animate-spin" />
                Rolling back...
              </>
            ) : (
              "Confirm Rollback"
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
