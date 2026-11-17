import React, { useState, useEffect } from "react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Loader2, Trash2, AlertTriangle, ShieldAlert } from "lucide-react";
import { toast } from "sonner";
import { useDropMongoCollection } from "../hooks/useMongoMutations";

interface MongoDropCollectionDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  dbId: string;
  collection: string;
  onCollectionDropped: (name: string) => void;
}

export function MongoDropCollectionDialog({
  open,
  onOpenChange,
  dbId,
  collection,
  onCollectionDropped,
}: MongoDropCollectionDialogProps) {
  const [confirmText, setConfirmText] = useState("");
  const dropMutation = useDropMongoCollection(dbId);

  useEffect(() => {
    if (open) {
      setConfirmText("");
    }
  }, [open, collection]);

  const isSystemCollection = collection.startsWith("system.");
  const isConfirmed = confirmText === collection && !isSystemCollection;

  const handleDrop = async () => {
    if (!isConfirmed) return;
    try {
      await dropMutation.mutateAsync({ collection });
      toast.success(`Collection "${collection}" dropped successfully`);
      onCollectionDropped(collection);
      onOpenChange(false);
    } catch (err: any) {
      toast.error("Drop collection failed", { description: err.message });
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-destructive">
            <AlertTriangle className="h-5 w-5" />
            Drop Collection: <span className="font-mono">{collection}</span>
          </DialogTitle>
          <DialogDescription>
            This action cannot be undone. All documents, indexes, and metadata in{" "}
            <span className="font-mono font-medium text-foreground">{collection}</span> will be
            permanently destroyed.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-2">
          {isSystemCollection ? (
            <div className="border border-destructive/50 bg-destructive/10 rounded-lg p-3 flex items-start gap-2.5 text-xs text-destructive">
              <ShieldAlert className="h-4 w-4 shrink-0 mt-0.5" />
              <div>
                <strong>Protected System Collection:</strong> Collections starting with{" "}
                <code>system.</code> cannot be dropped.
              </div>
            </div>
          ) : (
            <>
              {/* Type to confirm */}
              <div className="space-y-2">
                <Label htmlFor="confirm-drop" className="text-xs font-semibold">
                  Type <span className="font-mono text-destructive font-bold">{collection}</span> to
                  confirm:
                </Label>
                <Input
                  id="confirm-drop"
                  placeholder={collection}
                  value={confirmText}
                  onChange={(e) => setConfirmText(e.target.value)}
                  className="font-mono text-xs h-9"
                  autoFocus
                />
              </div>

              {/* Warning box */}
              <div className="border border-destructive/40 bg-destructive/5 rounded-lg p-3 text-xs text-destructive">
                <strong>⚠️ Warning:</strong> This operation drops the collection immediately on the
                MongoDB server.
              </div>
            </>
          )}
        </div>

        <DialogFooter className="gap-2 sm:gap-0">
          <Button
            type="button"
            variant="outline"
            onClick={() => onOpenChange(false)}
            disabled={dropMutation.isPending}
          >
            Cancel
          </Button>
          <Button
            type="button"
            variant="destructive"
            onClick={handleDrop}
            disabled={dropMutation.isPending || !isConfirmed}
            className="gap-2"
          >
            {dropMutation.isPending ? (
              <>
                <Loader2 className="h-4 w-4 animate-spin" />
                Dropping...
              </>
            ) : (
              <>
                <Trash2 className="h-4 w-4" />
                Drop Collection
              </>
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
