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
import { Loader2, Eye, EyeOff, ShieldAlert, Info } from "lucide-react";
import { MongoIndexDetails } from "@/services/bridge/databaseBridge";
import { useMongoIndexes } from "../../hooks/useMongoIndexes";

interface MongoHideIndexDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  dbId: string;
  collection: string;
  index: MongoIndexDetails | null;
  onToggled?: () => void;
}

export function MongoHideIndexDialog({
  open,
  onOpenChange,
  dbId,
  collection,
  index,
  onToggled,
}: MongoHideIndexDialogProps) {
  const { hideIndex, isHiding } = useMongoIndexes(dbId, collection);

  if (!index) return null;

  const isIdIndex = index.isIdIndex || index.name === "_id_";
  const targetHidden = !index.hidden;

  const handleToggle = async () => {
    if (isIdIndex) return;

    try {
      await hideIndex(index.name, targetHidden);
      onToggled?.();
      onOpenChange(false);
    } catch {
      // Toast notification is handled in useMongoIndexes
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-base">
            {targetHidden ? (
              <>
                <EyeOff className="h-4 w-4 text-amber-500" />
                Hide Index: <span className="font-mono text-sm">{index.name}</span>
              </>
            ) : (
              <>
                <Eye className="h-4 w-4 text-blue-500" />
                Unhide Index: <span className="font-mono text-sm">{index.name}</span>
              </>
            )}
          </DialogTitle>
          <DialogDescription className="text-xs">
            Toggle visibility for index on collection{" "}
            <span className="font-mono font-medium text-foreground">{collection}</span>.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-3 py-2 text-xs">
          {/* Safeguard for _id_ */}
          {isIdIndex ? (
            <div className="border border-destructive/50 bg-destructive/10 rounded-lg p-3 flex items-start gap-2.5 text-xs text-destructive">
              <ShieldAlert className="h-4 w-4 shrink-0 mt-0.5" />
              <div>
                <strong>Immutable Index Protection:</strong> The default _id_ index is required by
                MongoDB and cannot be hidden.
              </div>
            </div>
          ) : (
            <>
              {/* Explanation Box */}
              <div className="border border-border/50 bg-muted/20 rounded-lg p-3 space-y-2">
                <div className="flex items-center gap-1.5 font-semibold text-foreground">
                  <Info className="h-4 w-4 text-blue-500 shrink-0" />
                  <span>
                    {targetHidden
                      ? "Query Planner Isolation"
                      : "Restore Query Planner Visibility"}
                  </span>
                </div>
                <p className="text-muted-foreground leading-relaxed">
                  {targetHidden
                    ? "Hiding an index excludes it from the query planner while remaining maintained on writes and enforcing uniqueness constraints. This allows testing query performance impact safely."
                    : "Unhiding this index makes it immediately available to the query planner for query evaluation and execution plans."}
                </p>
              </div>

              {/* Version & Compatibility Note */}
              <div className="text-[11px] text-muted-foreground/80 px-1">
                Note: Index hiding utilizes the MongoDB <code>collMod</code> command and requires
                MongoDB 4.4 or later.
              </div>
            </>
          )}
        </div>

        <DialogFooter className="pt-2">
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={() => onOpenChange(false)}
            disabled={isHiding}
          >
            Cancel
          </Button>
          <Button
            type="button"
            size="sm"
            className={
              targetHidden
                ? "bg-amber-600 hover:bg-amber-700 text-white gap-1.5"
                : "bg-blue-600 hover:bg-blue-700 text-white gap-1.5"
            }
            disabled={isIdIndex || isHiding}
            onClick={handleToggle}
          >
            {isHiding ? (
              <>
                <Loader2 className="h-3.5 w-3.5 animate-spin" />
                Updating...
              </>
            ) : targetHidden ? (
              <>
                <EyeOff className="h-3.5 w-3.5" />
                Hide Index
              </>
            ) : (
              <>
                <Eye className="h-3.5 w-3.5" />
                Unhide Index
              </>
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
