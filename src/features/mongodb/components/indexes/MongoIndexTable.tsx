import React from "react";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Tooltip, TooltipTrigger, TooltipContent } from "@/components/ui/tooltip";
import {
  Info,
  Eye,
  EyeOff,
  Trash2,
  AlertTriangle,
  Key,
  Shield,
  Clock,
  Layers,
} from "lucide-react";
import { formatBytes, formatDirection, MongoIndexWithStats } from "../../utils/indexHelpers";
import { formatTimestamp, formatRelativeTime } from "@/lib/utils";

interface MongoIndexTableProps {
  indexes: MongoIndexWithStats[];
  isLoading?: boolean;
  onViewDetails: (index: MongoIndexWithStats) => void;
  onToggleHide: (index: MongoIndexWithStats) => void;
  onDrop: (index: MongoIndexWithStats) => void;
}

export function MongoIndexTable({
  indexes,
  isLoading,
  onViewDetails,
  onToggleHide,
  onDrop,
}: MongoIndexTableProps) {
  if (isLoading) {
    return (
      <div className="flex-1 flex items-center justify-center p-12 text-muted-foreground text-xs gap-2">
        <div className="h-4 w-4 rounded-full border-2 border-emerald-500 border-t-transparent animate-spin" />
        <span>Loading collection indexes...</span>
      </div>
    );
  }

  if (indexes.length === 0) {
    return (
      <div className="flex-1 flex flex-col items-center justify-center p-12 text-center text-muted-foreground">
        <Layers className="h-10 w-10 text-muted-foreground/30 mb-3" />
        <p className="text-sm font-medium">No indexes found</p>
        <p className="text-xs text-muted-foreground/70 mt-1 max-w-sm">
          No secondary indexes exist on this collection. Create one using the button above.
        </p>
      </div>
    );
  }

  return (
    <div className="border border-border/40 rounded-md overflow-hidden bg-background">
      <Table>
        <TableHeader className="bg-muted/40">
          <TableRow className="hover:bg-transparent">
            <TableHead className="w-[200px] text-xs font-semibold">Name</TableHead>
            <TableHead className="text-xs font-semibold">Keys & Direction</TableHead>
            <TableHead className="text-xs font-semibold">Attributes</TableHead>
            <TableHead className="text-xs font-semibold text-right w-[100px]">Size</TableHead>
            <TableHead className="text-xs font-semibold w-[150px]">Usage Stats</TableHead>
            <TableHead className="text-xs font-semibold w-[140px]">Advisory</TableHead>
            <TableHead className="text-xs font-semibold text-right w-[110px]">Actions</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {indexes.map((idx) => {
            const isId = idx.isIdIndex || idx.name === "_id_";
            const keyEntries = Object.entries(idx.key || {});

            return (
              <TableRow key={idx.name} className="hover:bg-muted/30">
                {/* 1. Name */}
                <TableCell className="align-middle py-3">
                  <div className="flex flex-col gap-1 items-start">
                    <span className="font-mono text-xs font-medium text-foreground break-all">
                      {idx.name}
                    </span>
                    {isId && (
                      <Badge
                        variant="outline"
                        className="text-[10px] h-4 px-1.5 font-mono bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border-emerald-500/20"
                      >
                        _id_ Primary Key
                      </Badge>
                    )}
                  </div>
                </TableCell>

                {/* 2. Keys & Direction */}
                <TableCell className="align-middle py-3">
                  <div className="flex flex-wrap items-center gap-1.5">
                    {keyEntries.map(([field, dir]) => {
                      let dirBadgeClass = "bg-muted text-muted-foreground";
                      let dirLabel = String(dir);

                      if (dir === 1) {
                        dirBadgeClass =
                          "bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border-emerald-500/20";
                        dirLabel = "▲ 1";
                      } else if (dir === -1) {
                        dirBadgeClass =
                          "bg-blue-500/10 text-blue-600 dark:text-blue-400 border-blue-500/20";
                        dirLabel = "▼ -1";
                      } else if (dir === "text") {
                        dirBadgeClass =
                          "bg-purple-500/10 text-purple-600 dark:text-purple-400 border-purple-500/20";
                        dirLabel = "Text";
                      } else if (dir === "2dsphere") {
                        dirBadgeClass =
                          "bg-cyan-500/10 text-cyan-600 dark:text-cyan-400 border-cyan-500/20";
                        dirLabel = "Geo";
                      } else if (dir === "hashed") {
                        dirBadgeClass =
                          "bg-amber-500/10 text-amber-600 dark:text-amber-400 border-amber-500/20";
                        dirLabel = "Hashed";
                      }

                      return (
                        <div
                          key={field}
                          className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded border border-border/50 bg-background/80 text-[11px] font-mono"
                        >
                          <span className="text-foreground">{field}</span>
                          <span
                            className={`text-[9px] px-1 py-0.2 rounded font-semibold ${dirBadgeClass}`}
                            title={formatDirection(dir)}
                          >
                            {dirLabel}
                          </span>
                        </div>
                      );
                    })}
                  </div>
                </TableCell>

                {/* 3. Attributes */}
                <TableCell className="align-middle py-3">
                  <div className="flex flex-wrap items-center gap-1">
                    {idx.unique && (
                      <Badge
                        variant="outline"
                        className="text-[10px] h-4.5 px-1.5 bg-blue-500/10 text-blue-600 dark:text-blue-400 border-blue-500/20 font-medium"
                      >
                        <Shield className="h-2.5 w-2.5 mr-1" />
                        Unique
                      </Badge>
                    )}
                    {idx.sparse && (
                      <Badge
                        variant="outline"
                        className="text-[10px] h-4.5 px-1.5 bg-slate-500/10 text-slate-600 dark:text-slate-400 border-slate-500/20 font-medium"
                      >
                        Sparse
                      </Badge>
                    )}
                    {idx.expireAfterSeconds !== undefined && (
                      <Badge
                        variant="outline"
                        className="text-[10px] h-4.5 px-1.5 bg-orange-500/10 text-orange-600 dark:text-orange-400 border-orange-500/20 font-medium"
                      >
                        <Clock className="h-2.5 w-2.5 mr-1" />
                        TTL: {idx.expireAfterSeconds}s
                      </Badge>
                    )}
                    {idx.partialFilterExpression && (
                      <Tooltip>
                        <TooltipTrigger asChild>
                          <span className="cursor-help">
                            <Badge
                              variant="outline"
                              className="text-[10px] h-4.5 px-1.5 bg-violet-500/10 text-violet-600 dark:text-violet-400 border-violet-500/20 font-medium"
                            >
                              Partial
                            </Badge>
                          </span>
                        </TooltipTrigger>
                        <TooltipContent className="max-w-xs font-mono text-[11px] p-2">
                          <pre>{JSON.stringify(idx.partialFilterExpression, null, 2)}</pre>
                        </TooltipContent>
                      </Tooltip>
                    )}
                    {idx.collation && (
                      <Tooltip>
                        <TooltipTrigger asChild>
                          <span className="cursor-help">
                            <Badge
                              variant="outline"
                              className="text-[10px] h-4.5 px-1.5 bg-teal-500/10 text-teal-600 dark:text-teal-400 border-teal-500/20 font-medium"
                            >
                              Collation: {idx.collation.locale}
                            </Badge>
                          </span>
                        </TooltipTrigger>
                        <TooltipContent className="max-w-xs font-mono text-[11px] p-2">
                          <pre>{JSON.stringify(idx.collation, null, 2)}</pre>
                        </TooltipContent>
                      </Tooltip>
                    )}
                    {idx.hidden && (
                      <Badge
                        variant="outline"
                        className="text-[10px] h-4.5 px-1.5 bg-zinc-500/15 text-zinc-600 dark:text-zinc-400 border-zinc-500/25 font-medium"
                      >
                        <EyeOff className="h-2.5 w-2.5 mr-1" />
                        Hidden
                      </Badge>
                    )}
                    {!idx.unique &&
                      !idx.sparse &&
                      idx.expireAfterSeconds === undefined &&
                      !idx.partialFilterExpression &&
                      !idx.collation &&
                      !idx.hidden && (
                        <span className="text-[11px] text-muted-foreground/50">Standard</span>
                      )}
                  </div>
                </TableCell>

                {/* 4. Size */}
                <TableCell className="align-middle py-3 text-right font-mono text-xs text-muted-foreground">
                  {formatBytes(idx.sizeBytes)}
                </TableCell>

                {/* 5. Usage Stats */}
                <TableCell className="align-middle py-3">
                  {idx.stats ? (
                    <Tooltip>
                      <TooltipTrigger asChild>
                        <div className="cursor-help flex flex-col text-xs font-mono">
                          <span className="font-semibold text-foreground">
                            {idx.stats.ops.toLocaleString()} ops
                          </span>
                          <span className="text-[10px] text-muted-foreground">
                            {formatRelativeTime(idx.stats.since)}
                          </span>
                        </div>
                      </TooltipTrigger>
                      <TooltipContent className="max-w-xs text-xs space-y-1 p-2.5">
                        <p className="font-semibold text-foreground">
                          Runtime Operations: {idx.stats.ops.toLocaleString()}
                        </p>
                        <p className="text-muted-foreground text-[11px]">
                          Tracking since: {formatTimestamp(idx.stats.since)}
                        </p>
                        {idx.stats.host && (
                          <p className="text-muted-foreground text-[11px]">Node: {idx.stats.host}</p>
                        )}
                        <p className="text-[10px] text-amber-500/90 font-medium border-t border-border/40 pt-1 mt-1">
                          Usage since last mongod start on this node; not lifetime counts.
                        </p>
                      </TooltipContent>
                    </Tooltip>
                  ) : (
                    <span className="text-muted-foreground/50 text-xs">—</span>
                  )}
                </TableCell>

                {/* 6. Redundancy Advisory */}
                <TableCell className="align-middle py-3">
                  {idx.isRedundant ? (
                    <Tooltip>
                      <TooltipTrigger asChild>
                        <div className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-medium bg-amber-500/15 text-amber-600 dark:text-amber-400 border border-amber-500/30 cursor-help">
                          <AlertTriangle className="h-3 w-3 shrink-0" />
                          <span>Redundant</span>
                        </div>
                      </TooltipTrigger>
                      <TooltipContent className="max-w-sm text-xs space-y-1.5 p-3">
                        <div className="flex items-center gap-1.5 font-semibold text-amber-500">
                          <AlertTriangle className="h-3.5 w-3.5" />
                          <span>Heuristic Advisory</span>
                        </div>
                        <p className="text-foreground text-[11px] leading-relaxed">
                          {idx.redundantReason ||
                            "This index prefix is fully covered by an existing compound index."}
                        </p>
                        <p className="text-[10px] text-muted-foreground border-t border-border/40 pt-1">
                          Advisory only; RelWave never drops indexes automatically.
                        </p>
                      </TooltipContent>
                    </Tooltip>
                  ) : (
                    <span className="text-xs text-muted-foreground/40">—</span>
                  )}
                </TableCell>

                {/* 7. Actions */}
                <TableCell className="align-middle py-3 text-right">
                  <div className="flex items-center justify-end gap-1">
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-7 w-7 text-muted-foreground hover:text-foreground"
                      onClick={() => onViewDetails(idx)}
                      title="View details"
                    >
                      <Info className="h-3.5 w-3.5" />
                    </Button>
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-7 w-7 text-muted-foreground hover:text-foreground disabled:opacity-30"
                      disabled={isId}
                      onClick={() => onToggleHide(idx)}
                      title={
                        isId
                          ? "Primary key cannot be hidden"
                          : idx.hidden
                          ? "Unhide index"
                          : "Hide index"
                      }
                    >
                      {idx.hidden ? (
                        <Eye className="h-3.5 w-3.5 text-blue-500" />
                      ) : (
                        <EyeOff className="h-3.5 w-3.5" />
                      )}
                    </Button>
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-7 w-7 text-muted-foreground hover:text-destructive disabled:opacity-30"
                      disabled={isId}
                      onClick={() => onDrop(idx)}
                      title={isId ? "Primary key cannot be dropped" : "Drop index"}
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </Button>
                  </div>
                </TableCell>
              </TableRow>
            );
          })}
        </TableBody>
      </Table>
    </div>
  );
}
