import React, { useState, useEffect } from "react";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetDescription,
} from "@/components/ui/sheet";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Check, X, Info, CheckCircle2, XCircle, HelpCircle, Link2 } from "lucide-react";
import type { MongoInferredRelationship, MongoRelationship } from "../../types/relationship";
import { formatMongoCardinality } from "../../adapters/mongoErAdapter";

export interface MongoRelationshipDetailDrawerProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  relationship: (MongoInferredRelationship | MongoRelationship) | null;
  onConfirm?: (id: string) => void;
  onReject?: (id: string) => void;
  isConfirmPending?: boolean;
  isRejectPending?: boolean;
}

export function MongoRelationshipDetailDrawer({
  open,
  onOpenChange,
  relationship,
  onConfirm,
  onReject,
  isConfirmPending = false,
  isRejectPending = false,
}: MongoRelationshipDetailDrawerProps) {
  const [overrideAcknowledged, setOverrideAcknowledged] = useState(false);

  useEffect(() => {
    setOverrideAcknowledged(false);
  }, [open, relationship?.id]);

  if (!relationship) return null;

  const isInferred = "confidence" in relationship && "evidence" in relationship;
  const inferredRel = isInferred ? (relationship as MongoInferredRelationship) : null;
  const confidencePct = inferredRel ? Math.round(inferredRel.confidence * 100) : 100;
  const hitRatioPct = inferredRel ? Math.round(inferredRel.evidence.hitRatio * 100) : null;
  const isInsufficient =
    relationship.cardinality === "insufficient-evidence" ||
    Boolean(inferredRel && inferredRel.confidence < 0.65);

  const getConfidenceColor = (pct: number) => {
    if (pct >= 85) return "text-emerald-500";
    if (pct >= 65) return "text-amber-500";
    return "text-muted-foreground";
  };

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent
        side="right"
        className="w-full sm:max-w-xl p-0 flex flex-col gap-0 bg-background text-foreground border-l border-border/80 shadow-2xl"
      >
        <SheetHeader className="p-4 border-b border-border/60 bg-muted/20 shrink-0 pr-12">
          <div className="flex items-center gap-2 text-xs font-mono text-muted-foreground mb-1">
            <Link2 className="h-4 w-4 text-primary shrink-0" />
            <span>Relationship Details</span>
            <span>•</span>
            <span className="font-semibold text-foreground">
              {isInferred ? "Inferred Reference" : "Manual Relationship"}
            </span>
          </div>
          <SheetTitle className="text-base font-mono font-semibold truncate text-foreground pr-6">
            {relationship.sourceCollection}.{relationship.sourceField} →{" "}
            {relationship.targetCollection}.{relationship.targetField}
          </SheetTitle>
          <SheetDescription className="text-xs text-muted-foreground mt-0.5">
            Relationship metadata and heuristic evidence breakdown.
          </SheetDescription>
        </SheetHeader>

        <div className="flex-1 overflow-y-auto p-4 space-y-6">
          {/* Status & Origin Badges */}
          <div className="flex flex-wrap items-center gap-2">
            <Badge variant="outline" className="font-mono text-xs">
              Cardinality: {formatMongoCardinality(relationship.cardinality)}
            </Badge>

            {isInferred ? (
              <Badge
                variant="secondary"
                className="bg-cyan-500/10 text-cyan-500 border-cyan-500/20"
              >
                Inferred Discovery
              </Badge>
            ) : (
              <Badge
                variant="secondary"
                className="bg-purple-500/10 text-purple-500 border-purple-500/20"
              >
                User Defined Manual
              </Badge>
            )}

            {inferredRel && (
              <Badge
                variant="outline"
                className={
                  inferredRel.status === "confirmed"
                    ? "border-emerald-500/40 text-emerald-500"
                    : inferredRel.status === "rejected"
                      ? "border-destructive/40 text-destructive"
                      : "border-cyan-500/40 text-cyan-500"
                }
              >
                Status: {inferredRel.status}
              </Badge>
            )}
          </div>

          {/* Heuristic Notice */}
          {isInferred && (
            <div className="rounded-md border border-cyan-500/30 bg-cyan-500/10 p-3 text-xs text-cyan-700 dark:text-cyan-300">
              <div className="font-semibold flex items-center gap-1.5 mb-1">
                <Info className="h-4 w-4 shrink-0" />
                Heuristic Discovery Notice
              </div>
              Inferred relationships are discoveries derived from data sampling and pattern
              matching, not database-enforced foreign key constraints. Verify relationships before
              relying on them in applications.
            </div>
          )}

          {/* Insufficient Evidence Notice & Acknowledgment */}
          {isInsufficient && inferredRel && (
            <div className="rounded-md border border-amber-500/30 bg-amber-500/10 p-3 space-y-3 text-xs text-amber-700 dark:text-amber-300">
              <div>
                <div className="font-semibold flex items-center gap-1.5 mb-1 text-amber-800 dark:text-amber-200">
                  <HelpCircle className="h-4 w-4 shrink-0 text-amber-600 dark:text-amber-400" />
                  Low Confidence Diagnostic Candidate
                </div>
                Confidence ({confidencePct}%) is below the actionable 0.65 threshold (or hit ratio
                is below 0.50). This relationship did not meet heuristic verification standards and
                cannot be confirmed without explicit acknowledgment.
              </div>
              <div className="flex items-center space-x-2 pt-1 border-t border-amber-500/20">
                <Checkbox
                  id="ack-low-confidence"
                  checked={overrideAcknowledged}
                  onCheckedChange={(checked) => setOverrideAcknowledged(Boolean(checked))}
                />
                <label
                  htmlFor="ack-low-confidence"
                  className="text-xs font-medium text-amber-900 dark:text-amber-100 cursor-pointer select-none"
                >
                  Acknowledge low statistical evidence (&lt; 0.65 confidence)
                </label>
              </div>
            </div>
          )}

          {/* Confidence Meter */}
          {isInferred && (
            <div className="space-y-1.5 rounded-lg border p-3">
              <div className="flex justify-between text-xs">
                <span className="font-medium text-muted-foreground">Confidence Score</span>
                <span className={`font-mono font-bold ${getConfidenceColor(confidencePct)}`}>
                  {confidencePct}%
                </span>
              </div>
              <Progress value={confidencePct} className="h-2" />
            </div>
          )}

          {/* Key Reference Details */}
          <div className="grid grid-cols-2 gap-4 text-xs">
            <div className="space-y-1 p-3 rounded-lg border bg-muted/20">
              <span className="text-muted-foreground block">Source Reference</span>
              <div className="font-mono font-semibold">{relationship.sourceCollection}</div>
              <div className="font-mono text-muted-foreground">
                Field: {relationship.sourceField}
              </div>
            </div>
            <div className="space-y-1 p-3 rounded-lg border bg-muted/20">
              <span className="text-muted-foreground block">Target Reference</span>
              <div className="font-mono font-semibold">{relationship.targetCollection}</div>
              <div className="font-mono text-muted-foreground">
                Field: {relationship.targetField}
              </div>
            </div>
          </div>

          {/* Evidence Metrics Table */}
          {inferredRel && (
            <div className="space-y-2">
              <h4 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                Evidence Metrics
              </h4>
              <div className="rounded-lg border overflow-hidden">
                <Table className="text-xs">
                  <TableHeader>
                    <TableRow>
                      <TableHead>Metric</TableHead>
                      <TableHead className="text-right">Observed Value</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    <TableRow>
                      <TableCell className="font-medium">Hit Ratio</TableCell>
                      <TableCell className="text-right font-mono">
                        {hitRatioPct}% ({inferredRel.evidence.hitCount} /{" "}
                        {inferredRel.evidence.sampleCount} matches)
                      </TableCell>
                    </TableRow>
                    <TableRow>
                      <TableCell className="font-medium">Name Pattern Match</TableCell>
                      <TableCell className="text-right">
                        {inferredRel.evidence.hasNamePatternMatch ? (
                          <span className="inline-flex items-center gap-1 text-emerald-500">
                            <CheckCircle2 className="h-3.5 w-3.5" /> Yes
                          </span>
                        ) : (
                          <span className="inline-flex items-center gap-1 text-muted-foreground">
                            <XCircle className="h-3.5 w-3.5" /> No
                          </span>
                        )}
                      </TableCell>
                    </TableRow>
                    <TableRow>
                      <TableCell className="font-medium">BSON Type Compatibility</TableCell>
                      <TableCell className="text-right">
                        {inferredRel.evidence.isBsonTypeMatch ? (
                          <span className="inline-flex items-center gap-1 text-emerald-500">
                            <CheckCircle2 className="h-3.5 w-3.5" /> Compatible
                          </span>
                        ) : (
                          <span className="inline-flex items-center gap-1 text-destructive">
                            <XCircle className="h-3.5 w-3.5" /> Incompatible
                          </span>
                        )}
                      </TableCell>
                    </TableRow>
                    <TableRow>
                      <TableCell className="font-medium">Array Reference</TableCell>
                      <TableCell className="text-right font-mono">
                        {inferredRel.evidence.isArrayReference ? "Yes" : "No"}
                      </TableCell>
                    </TableRow>
                    <TableRow>
                      <TableCell className="font-medium">Multiple Sources Per Target</TableCell>
                      <TableCell className="text-right font-mono">
                        {inferredRel.evidence.multipleSourcesPerTarget ? "Yes" : "No"}
                      </TableCell>
                    </TableRow>
                    <TableRow>
                      <TableCell className="font-medium">Unique Index on Source</TableCell>
                      <TableCell className="text-right font-mono">
                        {inferredRel.evidence.hasUniqueIndexOnSource ? "Yes" : "No"}
                      </TableCell>
                    </TableRow>
                  </TableBody>
                </Table>
              </div>
            </div>
          )}

          {/* Sample Match Pairs Preview */}
          {inferredRel && inferredRel.evidence.sampleMatches?.length > 0 && (
            <div className="space-y-2">
              <h4 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                Sample Matches Preview ({inferredRel.evidence.sampleMatches.length})
              </h4>
              <div className="rounded-lg border max-h-48 overflow-y-auto">
                <Table className="text-xs font-mono">
                  <TableHeader>
                    <TableRow>
                      <TableHead>Source Value</TableHead>
                      <TableHead>Target ID</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {inferredRel.evidence.sampleMatches.map((m, i) => (
                      <TableRow key={i}>
                        <TableCell className="truncate max-w-[200px]">{m.sourceValue}</TableCell>
                        <TableCell className="truncate max-w-[200px]">{m.targetId}</TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            </div>
          )}

          {/* Description for manual relationships */}
          {!isInferred && (relationship as MongoRelationship).description && (
            <div className="space-y-1 rounded-lg border p-3">
              <span className="text-xs font-medium text-muted-foreground block">Description</span>
              <p className="text-xs font-sans text-foreground">
                {(relationship as MongoRelationship).description}
              </p>
            </div>
          )}

          {/* Action Buttons for Inferred Candidates */}
          {inferredRel && (
            <div className="flex items-center justify-end gap-3 pt-4 border-t border-border">
              <Button
                variant="outline"
                size="sm"
                onClick={() => {
                  onReject?.(inferredRel.id);
                  onOpenChange(false);
                }}
                disabled={isRejectPending || inferredRel.status === "rejected"}
                className="gap-1.5 text-destructive hover:bg-destructive/10"
              >
                <X className="h-4 w-4" />
                Reject
              </Button>

              {isInsufficient ? (
                overrideAcknowledged && (
                  <Button
                    variant="default"
                    size="sm"
                    onClick={() => {
                      onConfirm?.(inferredRel.id);
                      onOpenChange(false);
                    }}
                    disabled={isConfirmPending || inferredRel.status === "confirmed"}
                    className="gap-1.5 bg-amber-600 hover:bg-amber-700 text-white border-amber-700"
                  >
                    <Check className="h-4 w-4" />
                    Override & Confirm (Low Confidence)
                  </Button>
                )
              ) : (
                <Button
                  variant="default"
                  size="sm"
                  onClick={() => {
                    onConfirm?.(inferredRel.id);
                    onOpenChange(false);
                  }}
                  disabled={isConfirmPending || inferredRel.status === "confirmed"}
                  className="gap-1.5 bg-emerald-600 hover:bg-emerald-700 text-white"
                >
                  <Check className="h-4 w-4" />
                  Confirm Relationship
                </Button>
              )}
            </div>
          )}
        </div>
      </SheetContent>
    </Sheet>
  );
}
