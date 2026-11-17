import React from "react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Loader2, Trash2, AlertTriangle, ShieldAlert } from "lucide-react";
import { MongoIndexDetails } from "@/services/bridge/databaseBridge";
import { useMongoIndexes } from "../../hooks/useMongoIndexes";

interface MongoDropIndexDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  dbId: string;
  collection: string;
  index: MongoIndexDetails | null;
  onIndexDropped?: (name: string) => void;
}

export function MongoDropIndexDialog({
  open,
  onOpenChange,
  dbId,
  collection,
  index,
  onIndexDropped,
}: MongoDropIndexDialogProps) {
  const { dropIndex, isDropping } = useMongoIndexes(dbId, collection);

  if (!index) return null;

  const isIdIndex = index.isIdIndex || index.name === "_id_";

  const handleDrop = async () => {
    if (isIdIndex) return;

    try {
      await dropIndex(index.name);
      onIndexDropped?.(index.name);
      onOpenChange(false);
    } catch {
      // Toast notification is handled in useMongoIndexes
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-destructive">
            <AlertTriangle className="h-5 w-5" />
            Drop Index: <span className="font-mono">{index.name}</span>
          </DialogTitle>
          <DialogDescription className="text-xs">
            Confirm index removal from collection{" "}
            <span className="font-mono font-medium text-foreground">{collection}</span>.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-3 py-2 text-xs">
          {/* Index summary */}
          <div className="border border-border/50 rounded-lg p-3 space-y-2 bg-muted/20 font-mono">
            <div className="flex justify-between text-muted-foreground">
              <span>Collection:</span>
              <span className="text-foreground font-semibold">{collection}</span>
            </div>
            <div className="flex justify-between text-muted-foreground">
              <span>Index Name:</span>
              <span className="text-foreground font-semibold">{index.name}</span>
            </div>
            <div className="flex flex-col gap-1 text-muted-foreground pt-1 border-t border-border/30">
              <span>Key Specification:</span>
              <pre className="text-foreground bg-background p-1.5 rounded border border-border/40 text-[11px] overflow-x-auto">
                {JSON.stringify(index.key, null, 2)}
              </pre>
            </div>
          </div>

          {/* Warning / Safeguards */}
          {isIdIndex ? (
            <div className="border border-destructive/50 bg-destructive/10 rounded-lg p-3 flex items-start gap-2.5 text-xs text-destructive">
              <ShieldAlert className="h-4 w-4 shrink-0 mt-0.5" />
              <div>
                <strong>Immutable Index Protection:</strong> The default _id_ index is required by
                MongoDB and cannot be dropped.
              </div>
            </div>
          ) : (
            <div className="border border-amber-500/40 bg-amber-500/10 rounded-lg p-3 text-xs text-amber-600 dark:text-amber-400 space-y-1">
              <div className="flex items-center gap-1.5 font-semibold">
                <AlertTriangle className="h-4 w-4 shrink-0" />
                <span>Performance Warning</span>
              </div>
              <p className="leading-relaxed">
                Dropping this index will cause queries relying on it to perform full collection
                scans until rebuilt.
              </p>
            </div>
          )}
        </div>

        <DialogFooter className="pt-2">
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={() => onOpenChange(false)}
            disabled={isDropping}
          >
            Cancel
          </Button>
          <Button
            type="button"
            variant="destructive"
            size="sm"
            className="gap-1.5"
            disabled={isIdIndex || isDropping}
            onClick={handleDrop}
          >
            {isDropping ? (
              <>
                <Loader2 className="h-3.5 w-3.5 animate-spin" />
                Dropping...
              </>
            ) : (
              <>
                <Trash2 className="h-3.5 w-3.5" />
                Drop Index
              </>
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
