import React, { useState } from "react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Copy,
  Check,
  Info,
  Shield,
  Clock,
  EyeOff,
  AlertTriangle,
  Activity,
  FileCode,
} from "lucide-react";
import { toast } from "sonner";
import { formatBytes, MongoIndexWithStats } from "../../utils/indexHelpers";
import { formatTimestamp, formatRelativeTime } from "@/lib/utils";

interface MongoIndexDetailsDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  collection: string;
  index: MongoIndexWithStats | null;
}

export function MongoIndexDetailsDialog({
  open,
  onOpenChange,
  collection,
  index,
}: MongoIndexDetailsDialogProps) {
  const [copied, setCopied] = useState(false);

  if (!index) return null;

  const handleCopyJson = async () => {
    try {
      await navigator.clipboard.writeText(JSON.stringify(index, null, 2));
      setCopied(true);
      toast.success("Index details copied to clipboard");
      setTimeout(() => setCopied(false), 2000);
    } catch {
      toast.error("Failed to copy index details");
    }
  };

  const isId = index.isIdIndex || index.name === "_id_";

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl max-h-[85vh] overflow-y-auto">
        <DialogHeader>
          <div className="flex items-center justify-between pr-4">
            <DialogTitle className="flex items-center gap-2 text-base font-mono">
              <Info className="h-4 w-4 text-emerald-500 shrink-0" />
              <span>{index.name}</span>
            </DialogTitle>
          </div>
          <DialogDescription className="text-xs">
            Detailed specification and runtime telemetry for collection{" "}
            <span className="font-mono font-medium text-foreground">{collection}</span>.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-2 text-xs">
          {/* Quick Summary Grid */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5 p-3 rounded-lg border border-border/50 bg-muted/20">
            <div>
              <span className="text-[11px] text-muted-foreground block">Collection</span>
              <span className="font-mono font-semibold text-foreground break-all">
                {collection}
              </span>
            </div>
            <div>
              <span className="text-[11px] text-muted-foreground block">Physical Size</span>
              <span className="font-mono font-semibold text-foreground">
                {formatBytes(index.sizeBytes)}
              </span>
            </div>
            <div>
              <span className="text-[11px] text-muted-foreground block">Version</span>
              <span className="font-mono font-semibold text-foreground">v{index.v ?? 2}</span>
            </div>
            <div>
              <span className="text-[11px] text-muted-foreground block">Type</span>
              <span className="font-semibold text-foreground">
                {isId ? "Primary Key" : "Secondary Index"}
              </span>
            </div>
          </div>

          {/* Badges Bar */}
          <div className="flex flex-wrap items-center gap-1.5">
            {isId && (
              <Badge
                variant="outline"
                className="text-[11px] h-5 bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border-emerald-500/20"
              >
                _id_ Primary Key
              </Badge>
            )}
            {index.unique && (
              <Badge
                variant="outline"
                className="text-[11px] h-5 bg-blue-500/10 text-blue-600 dark:text-blue-400 border-blue-500/20"
              >
                <Shield className="h-3 w-3 mr-1" />
                Unique
              </Badge>
            )}
            {index.sparse && (
              <Badge
                variant="outline"
                className="text-[11px] h-5 bg-slate-500/10 text-slate-600 dark:text-slate-400 border-slate-500/20"
              >
                Sparse
              </Badge>
            )}
            {index.expireAfterSeconds !== undefined && (
              <Badge
                variant="outline"
                className="text-[11px] h-5 bg-orange-500/10 text-orange-600 dark:text-orange-400 border-orange-500/20"
              >
                <Clock className="h-3 w-3 mr-1" />
                TTL: {index.expireAfterSeconds}s
              </Badge>
            )}
            {index.hidden && (
              <Badge
                variant="outline"
                className="text-[11px] h-5 bg-zinc-500/15 text-zinc-600 dark:text-zinc-400 border-zinc-500/25"
              >
                <EyeOff className="h-3 w-3 mr-1" />
                Hidden
              </Badge>
            )}
          </div>

          {/* Key Specification */}
          <div className="space-y-1.5">
            <span className="font-semibold text-foreground flex items-center gap-1.5">
              <FileCode className="h-3.5 w-3.5 text-muted-foreground" />
              Key Specification
            </span>
            <pre className="p-3 rounded-lg border border-border/40 bg-muted/40 font-mono text-xs overflow-x-auto text-foreground">
              {JSON.stringify(index.key, null, 2)}
            </pre>
          </div>

          {/* Redundancy Advisory Section */}
          {index.isRedundant && (
            <div className="border border-amber-500/40 bg-amber-500/10 rounded-lg p-3 text-xs space-y-1.5 text-amber-600 dark:text-amber-400">
              <div className="flex items-center gap-1.5 font-semibold text-amber-600 dark:text-amber-400">
                <AlertTriangle className="h-4 w-4 shrink-0" />
                <span>Heuristic Redundancy Advisory</span>
              </div>
              <p className="text-foreground text-xs leading-relaxed">
                {index.redundantReason ||
                  "Prefix is covered by an existing compound index. Maintaining this index adds write overhead without expanding query coverage."}
              </p>
              <p className="text-[11px] text-muted-foreground border-t border-border/30 pt-1">
                Advisory only; RelWave never drops indexes automatically.
              </p>
            </div>
          )}

          {/* Usage Statistics */}
          <div className="space-y-1.5 border border-border/40 rounded-lg p-3 bg-muted/10">
            <span className="font-semibold text-foreground flex items-center gap-1.5">
              <Activity className="h-3.5 w-3.5 text-blue-500" />
              Runtime Usage Statistics
            </span>
            {index.stats ? (
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-2.5 pt-1 text-xs">
                <div>
                  <span className="text-[11px] text-muted-foreground block">Operations:</span>
                  <span className="font-mono font-semibold text-foreground">
                    {index.stats.ops.toLocaleString()} accesses
                  </span>
                </div>
                <div>
                  <span className="text-[11px] text-muted-foreground block">Tracking Since:</span>
                  <span className="font-mono text-foreground">
                    {formatTimestamp(index.stats.since)} ({formatRelativeTime(index.stats.since)})
                  </span>
                </div>
                <div>
                  <span className="text-[11px] text-muted-foreground block">Target Node:</span>
                  <span className="font-mono text-foreground">
                    {index.stats.host || "Local / Primary"}
                  </span>
                </div>
              </div>
            ) : (
              <p className="text-muted-foreground text-xs pt-1">
                No runtime access statistics available for this index ($indexStats unavailable).
              </p>
            )}
            <p className="text-[10px] text-muted-foreground border-t border-border/30 pt-1 mt-1">
              Usage since last mongod start on this node; not lifetime counts.
            </p>
          </div>

          {/* Partial Filter Expression */}
          {index.partialFilterExpression && (
            <div className="space-y-1.5">
              <span className="font-semibold text-foreground">Partial Filter Expression</span>
              <pre className="p-3 rounded-lg border border-border/40 bg-muted/40 font-mono text-xs overflow-x-auto text-foreground">
                {JSON.stringify(index.partialFilterExpression, null, 2)}
              </pre>
            </div>
          )}

          {/* Collation Details */}
          {index.collation && (
            <div className="space-y-1.5">
              <span className="font-semibold text-foreground">Collation Settings</span>
              <pre className="p-3 rounded-lg border border-border/40 bg-muted/40 font-mono text-xs overflow-x-auto text-foreground">
                {JSON.stringify(index.collation, null, 2)}
              </pre>
            </div>
          )}

          {/* Text Index Properties */}
          {(index.weights || index.default_language) && (
            <div className="space-y-1.5 border border-border/40 rounded-lg p-3 bg-muted/10">
              <span className="font-semibold text-foreground">Text Index Options</span>
              <div className="grid grid-cols-2 gap-2 pt-1">
                {index.default_language && (
                  <div>
                    <span className="text-[11px] text-muted-foreground block">
                      Default Language
                    </span>
                    <span className="font-mono font-medium">{index.default_language}</span>
                  </div>
                )}
                {index.language_override && (
                  <div>
                    <span className="text-[11px] text-muted-foreground block">
                      Language Override
                    </span>
                    <span className="font-mono font-medium">{index.language_override}</span>
                  </div>
                )}
              </div>
              {index.weights && (
                <div className="pt-2">
                  <span className="text-[11px] text-muted-foreground block mb-1">
                    Field Weights
                  </span>
                  <pre className="p-2 rounded border border-border/30 bg-muted/30 font-mono text-xs overflow-x-auto">
                    {JSON.stringify(index.weights, null, 2)}
                  </pre>
                </div>
              )}
            </div>
          )}
        </div>

        <DialogFooter className="pt-2 flex items-center justify-between sm:justify-between">
          <Button
            type="button"
            variant="outline"
            size="sm"
            className="gap-1.5"
            onClick={handleCopyJson}
          >
            {copied ? (
              <>
                <Check className="h-3.5 w-3.5 text-emerald-500" />
                Copied JSON
              </>
            ) : (
              <>
                <Copy className="h-3.5 w-3.5" />
                Copy JSON
              </>
            )}
          </Button>

          <Button type="button" variant="default" size="sm" onClick={() => onOpenChange(false)}>
            Close
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
