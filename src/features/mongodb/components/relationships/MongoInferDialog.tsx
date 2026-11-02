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
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Sparkles, Loader2, Info } from "lucide-react";

export interface MongoInferDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  collections: string[];
  onInfer: (options: {
    collections?: string[];
    sampleSize: number;
    timeoutMs: number;
  }) => Promise<any> | void;
  isLoading?: boolean;
}

export function MongoInferDialog({
  open,
  onOpenChange,
  collections,
  onInfer,
  isLoading = false,
}: MongoInferDialogProps) {
  const [scopeMode, setScopeMode] = useState<"all" | "selected">("all");
  const [selectedCollections, setSelectedCollections] = useState<string[]>([]);
  const [sampleSize, setSampleSize] = useState(50);
  const [timeoutSeconds, setTimeoutSeconds] = useState(30);

  const toggleCollection = (name: string) => {
    setSelectedCollections((prev) =>
      prev.includes(name) ? prev.filter((c) => c !== name) : [...prev, name],
    );
  };

  const handleStartInference = async () => {
    await onInfer({
      collections: scopeMode === "selected" ? selectedCollections : undefined,
      sampleSize: Math.max(10, Math.min(500, sampleSize)),
      timeoutMs: Math.max(5000, timeoutSeconds * 1000),
    });
    onOpenChange(false);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <div className="flex items-center gap-2">
            <Sparkles className="h-5 w-5 text-primary" />
            <DialogTitle>Infer Relationships</DialogTitle>
          </div>
          <DialogDescription>
            Heuristically discover references between collections using BSON type matching, field naming patterns, and data sampling.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-2 text-xs">
          <div className="space-y-1.5">
            <Label className="text-xs">Collection Scope</Label>
            <div className="flex gap-2">
              <Button
                type="button"
                variant={scopeMode === "all" ? "default" : "outline"}
                size="sm"
                onClick={() => setScopeMode("all")}
                disabled={isLoading}
                className="flex-1 text-xs"
              >
                All Collections ({collections.length})
              </Button>
              <Button
                type="button"
                variant={scopeMode === "selected" ? "default" : "outline"}
                size="sm"
                onClick={() => setScopeMode("selected")}
                disabled={isLoading}
                className="flex-1 text-xs"
              >
                Selected Scope ({selectedCollections.length})
              </Button>
            </div>
          </div>

          {scopeMode === "selected" && (
            <div className="rounded-md border p-2 max-h-36 overflow-y-auto space-y-1">
              {collections.map((col) => {
                const checked = selectedCollections.includes(col);
                return (
                  <label
                    key={col}
                    className="flex items-center gap-2 px-2 py-1 hover:bg-muted/50 rounded cursor-pointer font-mono"
                  >
                    <input
                      type="checkbox"
                      checked={checked}
                      onChange={() => toggleCollection(col)}
                      disabled={isLoading}
                    />
                    <span>{col}</span>
                  </label>
                );
              })}
            </div>
          )}

          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label className="text-xs">Sample Size per Collection</Label>
              <Input
                type="number"
                min={10}
                max={500}
                value={sampleSize}
                onChange={(e) => setSampleSize(parseInt(e.target.value, 10) || 50)}
                disabled={isLoading}
                className="h-8 text-xs font-mono"
              />
              <span className="text-[10px] text-muted-foreground block">Default: 50 docs</span>
            </div>

            <div className="space-y-1.5">
              <Label className="text-xs">Timeout (Seconds)</Label>
              <Input
                type="number"
                min={5}
                max={120}
                value={timeoutSeconds}
                onChange={(e) => setTimeoutSeconds(parseInt(e.target.value, 10) || 30)}
                disabled={isLoading}
                className="h-8 text-xs font-mono"
              />
              <span className="text-[10px] text-muted-foreground block">Default: 30s</span>
            </div>
          </div>

          <div className="rounded-md border border-cyan-500/20 bg-cyan-500/5 p-2.5 text-[11px] text-muted-foreground flex gap-2">
            <Info className="h-4 w-4 text-cyan-500 shrink-0 mt-0.5" />
            <span>
              Inference runs non-blocking sample queries against collections. Existing saved relationships and manual definitions are preserved.
            </span>
          </div>
        </div>

        <DialogFooter className="flex justify-end gap-2 pt-2">
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={() => onOpenChange(false)}
            disabled={isLoading}
          >
            Cancel
          </Button>
          <Button
            type="button"
            size="sm"
            onClick={handleStartInference}
            disabled={isLoading || (scopeMode === "selected" && selectedCollections.length === 0)}
            className="gap-1.5"
          >
            {isLoading ? (
              <>
                <Loader2 className="h-3.5 w-3.5 animate-spin" />
                Discovering...
              </>
            ) : (
              <>
                <Sparkles className="h-3.5 w-3.5" />
                Run Discovery
              </>
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
