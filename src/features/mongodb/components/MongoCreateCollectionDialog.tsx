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
import { Switch } from "@/components/ui/switch";
import { Loader2, Plus, AlertCircle } from "lucide-react";
import { toast } from "sonner";
import { useCreateMongoCollection } from "../hooks/useMongoMutations";
import { validateCollectionName, validateCappedOptions } from "../utils/validation";

interface MongoCreateCollectionDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  dbId: string;
  onCollectionCreated: (name: string) => void;
}

export function MongoCreateCollectionDialog({
  open,
  onOpenChange,
  dbId,
  onCollectionCreated,
}: MongoCreateCollectionDialogProps) {
  const [collectionName, setCollectionName] = useState("");
  const [isCapped, setIsCapped] = useState(false);
  const [cappedSize, setCappedSize] = useState<string>("8192");
  const [cappedMax, setCappedMax] = useState<string>("");
  const [error, setError] = useState<string | null>(null);

  const createMutation = useCreateMongoCollection(dbId);

  useEffect(() => {
    if (open) {
      setCollectionName("");
      setIsCapped(false);
      setCappedSize("8192");
      setCappedMax("");
      setError(null);
    }
  }, [open]);

  const handleNameChange = (val: string) => {
    setCollectionName(val);
    const res = validateCollectionName(val);
    if (!res.valid) {
      setError(res.error || "Invalid collection name");
    } else {
      setError(null);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const nameCheck = validateCollectionName(collectionName);
    if (!nameCheck.valid) {
      setError(nameCheck.error || "Invalid collection name");
      return;
    }

    let options: { capped?: boolean; size?: number; max?: number } | undefined = undefined;
    if (isCapped) {
      const sizeNum = parseInt(cappedSize, 10);
      const maxNum = cappedMax.trim() ? parseInt(cappedMax, 10) : undefined;
      options = {
        capped: true,
        size: sizeNum,
        max: maxNum,
      };
      const cappedCheck = validateCappedOptions(options);
      if (!cappedCheck.valid) {
        setError(cappedCheck.error || "Invalid capped options");
        return;
      }
    }

    try {
      await createMutation.mutateAsync({
        collection: collectionName.trim(),
        options,
      });
      toast.success(`Collection "${collectionName.trim()}" created successfully`);
      onCollectionCreated(collectionName.trim());
      onOpenChange(false);
    } catch (err: any) {
      setError(err.message || "Failed to create collection");
      toast.error("Collection creation failed", { description: err.message });
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <form onSubmit={handleSubmit}>
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Plus className="h-4 w-4 text-emerald-500" />
              Create Collection
            </DialogTitle>
            <DialogDescription>
              Create a new MongoDB collection with optional capped storage parameters.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4 py-4">
            {/* Collection Name */}
            <div className="space-y-2">
              <Label htmlFor="col-name" className="text-xs font-semibold">
                Collection Name <span className="text-destructive">*</span>
              </Label>
              <Input
                id="col-name"
                value={collectionName}
                onChange={(e) => handleNameChange(e.target.value)}
                placeholder="e.g. orders, user_events"
                className="font-mono text-xs h-9"
                autoFocus
              />
              <p className="text-[11px] text-muted-foreground">
                Letters, numbers, underscores, and hyphens (max 120 chars).
              </p>
            </div>

            {/* Capped Collection Toggle */}
            <div className="flex items-center justify-between rounded-lg border border-border/50 p-3 bg-muted/20">
              <div className="space-y-0.5">
                <Label htmlFor="capped-switch" className="text-xs font-semibold cursor-pointer">
                  Capped Collection
                </Label>
                <p className="text-[11px] text-muted-foreground">
                  Fixed-size collection that automatically overwrites oldest documents.
                </p>
              </div>
              <Switch id="capped-switch" checked={isCapped} onCheckedChange={setIsCapped} />
            </div>

            {/* Capped Options */}
            {isCapped && (
              <div className="p-3 rounded-lg border border-border/50 bg-muted/10 space-y-3">
                <div className="space-y-1">
                  <Label htmlFor="capped-size" className="text-xs font-medium">
                    Maximum Size (Bytes) <span className="text-destructive">*</span>
                  </Label>
                  <Input
                    id="capped-size"
                    type="number"
                    min="4096"
                    step="1"
                    value={cappedSize}
                    onChange={(e) => setCappedSize(e.target.value)}
                    className="font-mono text-xs h-8"
                  />
                  <p className="text-[10px] text-muted-foreground">
                    Must be at least 4096 bytes (4 KB).
                  </p>
                </div>

                <div className="space-y-1">
                  <Label htmlFor="capped-max" className="text-xs font-medium">
                    Max Documents (Optional)
                  </Label>
                  <Input
                    id="capped-max"
                    type="number"
                    min="1"
                    step="1"
                    value={cappedMax}
                    onChange={(e) => setCappedMax(e.target.value)}
                    placeholder="Unlimited"
                    className="font-mono text-xs h-8"
                  />
                  <p className="text-[10px] text-muted-foreground">
                    Positive integer cap on document count.
                  </p>
                </div>
              </div>
            )}

            {error && (
              <div className="p-2.5 rounded bg-destructive/10 border border-destructive/20 text-destructive text-xs flex items-center gap-2">
                <AlertCircle className="h-4 w-4 shrink-0" />
                <span>{error}</span>
              </div>
            )}
          </div>

          <DialogFooter className="gap-2 sm:gap-0">
            <Button
              type="button"
              variant="outline"
              onClick={() => onOpenChange(false)}
              disabled={createMutation.isPending}
            >
              Cancel
            </Button>
            <Button
              type="submit"
              disabled={createMutation.isPending || !collectionName.trim() || !!error}
              className="bg-emerald-600 hover:bg-emerald-700 text-white gap-2"
            >
              {createMutation.isPending ? (
                <>
                  <Loader2 className="h-4 w-4 animate-spin" />
                  Creating...
                </>
              ) : (
                "Create Collection"
              )}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
