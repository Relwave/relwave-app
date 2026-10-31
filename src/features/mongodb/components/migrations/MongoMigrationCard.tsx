import React from "react";
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Alert, AlertDescription } from "@/components/ui/alert";
import {
  Clock,
  RotateCcw,
  Play,
  FileText,
  AlertTriangle,
  CheckCircle2,
  XCircle,
  ShieldAlert,
  Layers,
  ArrowRight,
} from "lucide-react";
import type { MongoMigrationStatus } from "@/features/mongodb/types/migration";

export interface MigrationCardData {
  id: string;
  name: string;
  checksum: string;
  status: MongoMigrationStatus;
  stepCount?: number;
  executedSteps?: number;
  totalSteps?: number;
  isReversible?: boolean;
  startedAt?: string;
  completedAt?: string;
  durationMs?: number;
  totalDurationMs?: number;
  attemptNumber?: number;
  attemptId?: string;
  fencingToken?: number;
  error?: string | { stepIndex?: number; stepType?: string; message: string };
  appliedBy?: string;
  filename?: string;
}

export interface MongoMigrationCardProps {
  migration: MigrationCardData;
  isReadOnly?: boolean;
  onViewAuditLog?: (migrationId: string) => void;
  onApply?: (migrationId: string) => void;
  onRollback?: (migrationId: string) => void;
  isApplying?: boolean;
  isRollingBack?: boolean;
}

export function getMigrationStatusBadgeConfig(status: MongoMigrationStatus): {
  label: MongoMigrationStatus;
  variant: "default" | "secondary" | "destructive" | "outline";
  className: string;
  description: string;
} {
  switch (status) {
    case "PENDING":
      return {
        label: "PENDING",
        variant: "secondary",
        className: "bg-muted text-muted-foreground border-border",
        description: "Discovered in migration directory, not yet applied",
      };
    case "ACQUIRING_LOCK":
      return {
        label: "ACQUIRING_LOCK",
        variant: "outline",
        className: "bg-blue-500/10 text-blue-500 border-blue-500/40 animate-pulse font-medium",
        description: "Acquiring distributed lease on _relwave_migrations_lock",
      };
    case "APPLYING":
      return {
        label: "APPLYING",
        variant: "outline",
        className: "bg-amber-500/10 text-amber-500 border-amber-500/40 animate-pulse font-medium",
        description: "Forward migration steps actively executing",
      };
    case "FAILED_PARTIAL":
      return {
        label: "FAILED_PARTIAL",
        variant: "destructive",
        className: "bg-destructive text-destructive-foreground font-medium",
        description: "Forward step failed; uncompensated partial state",
      };
    case "CRASHED_UNCERTAIN":
      return {
        label: "CRASHED_UNCERTAIN",
        variant: "outline",
        className: "border-destructive text-destructive bg-destructive/10 font-semibold",
        description: "Client crashed or lost lease during step execution. Never auto-retried.",
      };
    case "ROLLING_BACK":
      return {
        label: "ROLLING_BACK",
        variant: "outline",
        className: "bg-purple-500/10 text-purple-500 border-purple-500/40 animate-pulse font-medium",
        description: "Executing reverse compensation steps",
      };
    case "ROLLED_BACK":
      return {
        label: "ROLLED_BACK",
        variant: "outline",
        className: "bg-muted/30 text-muted-foreground border-border/80",
        description: "Cleanly compensated and unwound",
      };
    case "APPLIED":
      return {
        label: "APPLIED",
        variant: "outline",
        className: "bg-emerald-500/10 text-emerald-500 border-emerald-500/40 font-medium",
        description: "All migration steps executed and committed",
      };
    case "FAILED_MANUAL_INTERVENTION_REQUIRED":
      return {
        label: "FAILED_MANUAL_INTERVENTION_REQUIRED",
        variant: "destructive",
        className: "bg-destructive text-destructive-foreground font-bold border-2 border-red-700 shadow-sm",
        description: "Unrecoverable condition. Operator inspection required.",
      };
    default:
      return {
        label: status,
        variant: "outline",
        className: "bg-muted text-muted-foreground",
        description: "Unknown state",
      };
  }
}

export function MongoMigrationCard({
  migration,
  isReadOnly = false,
  onViewAuditLog,
  onApply,
  onRollback,
  isApplying = false,
  isRollingBack = false,
}: MongoMigrationCardProps) {
  const badgeConfig = getMigrationStatusBadgeConfig(migration.status);
  const total = migration.totalSteps ?? migration.stepCount ?? 0;
  const executed = migration.executedSteps ?? (migration.status === "APPLIED" ? total : 0);

  const errorMessage =
    typeof migration.error === "string"
      ? migration.error
      : migration.error?.message
        ? `Step ${migration.error.stepIndex !== undefined ? `#${migration.error.stepIndex}` : ""}${
            migration.error.stepType ? ` (${migration.error.stepType})` : ""
          }: ${migration.error.message}`
        : null;

  return (
    <Card className="border border-border/60 bg-card hover:border-border transition-colors shadow-xs">
      <CardHeader className="p-4 pb-3">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div className="flex items-center gap-2 min-w-0">
            <span className="font-mono text-xs font-semibold text-foreground/90 shrink-0">
              {migration.id}
            </span>
            <span className="text-muted-foreground/40 text-xs">•</span>
            <CardTitle className="text-sm font-semibold truncate text-foreground">
              {migration.name}
            </CardTitle>
          </div>

          <div className="flex items-center gap-1.5 shrink-0">
            <Badge
              variant={badgeConfig.variant}
              className={`text-[11px] px-2 py-0.5 ${badgeConfig.className}`}
              title={badgeConfig.description}
            >
              {badgeConfig.label}
            </Badge>

            {migration.isReversible !== undefined && (
              <Badge
                variant="outline"
                className={`text-[10px] px-1.5 py-0 ${
                  migration.isReversible
                    ? "text-emerald-500 border-emerald-500/30 bg-emerald-500/5"
                    : "text-amber-500 border-amber-500/30 bg-amber-500/5"
                }`}
              >
                {migration.isReversible ? "Reversible" : "Irreversible"}
              </Badge>
            )}
          </div>
        </div>
      </CardHeader>

      <CardContent className="p-4 pt-0 space-y-3">
        {/* Checksum and Steps Metadata */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 text-xs text-muted-foreground pt-1 border-t border-border/30">
          <div>
            <span className="text-[10px] uppercase tracking-wider text-muted-foreground/70 block">
              Checksum
            </span>
            <span
              className="font-mono text-[11px] text-foreground/80 truncate block"
              title={migration.checksum}
            >
              {migration.checksum ? migration.checksum.slice(0, 12) : "n/a"}…
            </span>
          </div>

          <div>
            <span className="text-[10px] uppercase tracking-wider text-muted-foreground/70 block">
              Steps
            </span>
            <span className="font-mono text-[11px] text-foreground/80 flex items-center gap-1">
              <Layers className="h-3 w-3 text-muted-foreground/60" />
              {executed} / {total}
            </span>
          </div>

          <div>
            <span className="text-[10px] uppercase tracking-wider text-muted-foreground/70 block">
              Duration
            </span>
            <span className="font-mono text-[11px] text-foreground/80 flex items-center gap-1">
              <Clock className="h-3 w-3 text-muted-foreground/60" />
              {migration.durationMs !== undefined
                ? `${migration.durationMs}ms`
                : migration.totalDurationMs !== undefined
                  ? `${migration.totalDurationMs}ms`
                  : "—"}
            </span>
          </div>

          <div>
            <span className="text-[10px] uppercase tracking-wider text-muted-foreground/70 block">
              Attempt
            </span>
            <span className="font-mono text-[11px] text-foreground/80">
              {migration.attemptNumber !== undefined ? `#${migration.attemptNumber}` : "—"}
              {migration.fencingToken !== undefined && (
                <span className="text-[10px] text-muted-foreground/60 ml-1">
                  (token: {migration.fencingToken})
                </span>
              )}
            </span>
          </div>
        </div>

        {/* Timestamps if present */}
        {(migration.startedAt || migration.completedAt) && (
          <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-[11px] text-muted-foreground/80">
            {migration.startedAt && (
              <span>
                Started:{" "}
                <span className="text-foreground/80">
                  {new Date(migration.startedAt).toLocaleString()}
                </span>
              </span>
            )}
            {migration.completedAt && (
              <span>
                Completed:{" "}
                <span className="text-foreground/80">
                  {new Date(migration.completedAt).toLocaleString()}
                </span>
              </span>
            )}
          </div>
        )}

        {/* Error Callout */}
        {errorMessage && (
          <Alert variant="destructive" className="py-2 px-3 text-xs bg-destructive/10 border-destructive/30">
            <AlertTriangle className="h-4 w-4 text-destructive shrink-0" />
            <AlertDescription className="font-mono text-[11px] break-all leading-relaxed">
              {errorMessage}
            </AlertDescription>
          </Alert>
        )}

        {/* Action Buttons Toolbar */}
        <div className="flex flex-wrap items-center justify-between gap-2 pt-2 border-t border-border/30">
          <Button
            variant="ghost"
            size="sm"
            className="h-7 text-xs text-muted-foreground hover:text-foreground gap-1.5 px-2"
            onClick={() => onViewAuditLog?.(migration.id)}
          >
            <FileText className="h-3.5 w-3.5" />
            View Audit Log
          </Button>

          <div className="flex items-center gap-2">
            {migration.status === "PENDING" && (
              <Button
                variant="default"
                size="sm"
                className="h-7 text-xs gap-1.5 px-3 bg-emerald-600 hover:bg-emerald-700 text-white"
                disabled={isReadOnly || isApplying}
                onClick={() => onApply?.(migration.id)}
                title={isReadOnly ? "Database connection is read-only" : "Apply migration"}
              >
                <Play className="h-3 w-3" />
                {isApplying ? "Applying..." : "Apply"}
              </Button>
            )}

            {(migration.status === "APPLIED" ||
              migration.status === "FAILED_PARTIAL" ||
              migration.status === "FAILED_MANUAL_INTERVENTION_REQUIRED") && (
              <Button
                variant="outline"
                size="sm"
                className="h-7 text-xs gap-1.5 px-3 border-amber-500/40 text-amber-500 hover:bg-amber-500/10"
                disabled={isReadOnly || isRollingBack}
                onClick={() => onRollback?.(migration.id)}
                title={isReadOnly ? "Database connection is read-only" : "Rollback migration"}
              >
                <RotateCcw className="h-3 w-3" />
                {isRollingBack ? "Rolling back..." : "Rollback"}
              </Button>
            )}
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
