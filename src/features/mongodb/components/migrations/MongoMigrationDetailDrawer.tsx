import React, { useMemo } from "react";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetDescription,
} from "@/components/ui/sheet";
import { Badge } from "@/components/ui/badge";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Alert, AlertDescription } from "@/components/ui/alert";
import {
  FileText,
  Clock,
  Key,
  Shield,
  AlertTriangle,
  CheckCircle2,
  XCircle,
  Hash,
  Loader2,
  Activity,
  Layers,
} from "lucide-react";
import { useMongoMigrationStatus } from "../../hooks/useMongoMigrations";
import { getMigrationStatusBadgeConfig } from "./MongoMigrationCard";
import type {
  MongoMigrationEvent,
  MongoMigrationEventType,
  MongoMigrationSummary,
} from "@/features/mongodb/types/migration";

export interface AttemptGroup {
  attemptNumber: number;
  attemptId: string;
  events: MongoMigrationEvent[];
}

/**
 * Groups events by attemptNumber and sorts strictly by sequenceNumber ascending (1, 2, 3...).
 */
export function groupAndSortMigrationEvents(events: MongoMigrationEvent[]): AttemptGroup[] {
  if (!events || events.length === 0) return [];

  const groupsMap = new Map<number, { attemptId: string; events: MongoMigrationEvent[] }>();

  for (const event of events) {
    const attemptNum = event.attemptNumber ?? 1;
    if (!groupsMap.has(attemptNum)) {
      groupsMap.set(attemptNum, { attemptId: event.attemptId || "", events: [] });
    }
    groupsMap.get(attemptNum)!.events.push(event);
  }

  const sortedAttemptNumbers = Array.from(groupsMap.keys()).sort((a, b) => a - b);

  return sortedAttemptNumbers.map((attemptNumber) => {
    const group = groupsMap.get(attemptNumber)!;
    const sortedEvents = [...group.events].sort(
      (a, b) => a.sequenceNumber - b.sequenceNumber,
    );
    return {
      attemptNumber,
      attemptId: group.attemptId || sortedEvents[0]?.attemptId || "",
      events: sortedEvents,
    };
  });
}

export function getEventTypeBadgeConfig(eventType: MongoMigrationEventType): {
  label: string;
  className: string;
} {
  switch (eventType) {
    case "VALIDATION_SUCCESS":
      return {
        label: "VALIDATION_SUCCESS",
        className: "bg-blue-500/10 text-blue-500 border-blue-500/30",
      };
    case "LOCK_ACQUIRED":
      return {
        label: "LOCK_ACQUIRED",
        className: "bg-indigo-500/10 text-indigo-500 border-indigo-500/30",
      };
    case "MIGRATION_START":
      return {
        label: "MIGRATION_START",
        className: "bg-blue-600/10 text-blue-600 border-blue-600/30 font-medium",
      };
    case "STEP_START":
      return {
        label: "STEP_START",
        className: "bg-sky-500/10 text-sky-500 border-sky-500/30",
      };
    case "STEP_COMPLETE":
      return {
        label: "STEP_COMPLETE",
        className: "bg-emerald-500/10 text-emerald-500 border-emerald-500/30",
      };
    case "STEP_FAILED":
      return {
        label: "STEP_FAILED",
        className: "bg-destructive text-destructive-foreground font-medium",
      };
    case "STEP_UNCERTAIN":
      return {
        label: "STEP_UNCERTAIN",
        className: "border-destructive text-destructive bg-destructive/10 font-medium",
      };
    case "COMPENSATION_START":
      return {
        label: "COMPENSATION_START",
        className: "bg-purple-500/10 text-purple-500 border-purple-500/30",
      };
    case "COMPENSATION_COMPLETE":
      return {
        label: "COMPENSATION_COMPLETE",
        className: "bg-purple-600/10 text-purple-600 border-purple-600/30 font-medium",
      };
    case "COMPENSATION_FAILED":
      return {
        label: "COMPENSATION_FAILED",
        className: "bg-destructive text-destructive-foreground font-bold",
      };
    case "MIGRATION_APPLIED":
      return {
        label: "MIGRATION_APPLIED",
        className: "bg-emerald-500/20 text-emerald-600 border-emerald-500/40 font-semibold",
      };
    case "MIGRATION_ROLLED_BACK":
      return {
        label: "MIGRATION_ROLLED_BACK",
        className: "bg-muted text-muted-foreground border-border font-medium",
      };
    case "LOCK_RELEASED":
      return {
        label: "LOCK_RELEASED",
        className: "bg-muted/40 text-muted-foreground border-border",
      };
    case "MANUAL_INTERVENTION_REQUIRED":
      return {
        label: "MANUAL_INTERVENTION_REQUIRED",
        className: "bg-destructive text-destructive-foreground font-bold border-2 border-red-700",
      };
    default:
      return {
        label: eventType,
        className: "bg-muted text-muted-foreground",
      };
  }
}

interface MongoMigrationDetailDrawerProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  dbId: string;
  migrationId: string | null;
  fallbackSummary?: MongoMigrationSummary | null;
}

export function MongoMigrationDetailDrawer({
  open,
  onOpenChange,
  dbId,
  migrationId,
  fallbackSummary,
}: MongoMigrationDetailDrawerProps) {
  const { data, isLoading } = useMongoMigrationStatus(
    open ? dbId : undefined,
    open ? migrationId || undefined : undefined,
  );

  const summary = data?.migration || fallbackSummary;
  const events = data?.events || [];

  const attemptGroups = useMemo(() => {
    return groupAndSortMigrationEvents(events);
  }, [events]);

  const statusBadge = summary ? getMigrationStatusBadgeConfig(summary.status) : null;

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent
        side="right"
        className="w-full sm:max-w-xl p-0 flex flex-col gap-0 bg-background text-foreground border-l border-border/80 shadow-2xl"
      >
        {/* Header */}
        <SheetHeader className="p-4 border-b border-border/60 bg-muted/20 shrink-0">
          <div className="flex items-center gap-2 text-xs font-mono text-muted-foreground">
            <FileText className="h-4 w-4 text-emerald-500 shrink-0" />
            <span>Audit Journal</span>
            <span>•</span>
            <span className="font-semibold text-foreground truncate">{migrationId}</span>
          </div>

          <SheetTitle className="text-base font-semibold truncate pt-1 text-foreground">
            {summary?.name || migrationId || "Migration Details"}
          </SheetTitle>

          <SheetDescription className="text-xs text-muted-foreground">
            Append-only chronological audit stream from <code className="font-mono text-[11px] text-foreground">_relwave_migration_events</code>.
          </SheetDescription>
        </SheetHeader>

        {/* Summary Card */}
        {summary && (
          <div className="p-4 border-b border-border/40 bg-card/60 grid grid-cols-2 sm:grid-cols-4 gap-2 text-xs shrink-0">
            <div>
              <span className="text-[10px] uppercase text-muted-foreground/70 block">Status</span>
              {statusBadge && (
                <Badge
                  variant={statusBadge.variant}
                  className={`text-[10px] px-1.5 py-0 mt-0.5 ${statusBadge.className}`}
                >
                  {statusBadge.label}
                </Badge>
              )}
            </div>

            <div>
              <span className="text-[10px] uppercase text-muted-foreground/70 block">Steps</span>
              <span className="font-mono text-[11px] text-foreground font-medium flex items-center gap-1 mt-0.5">
                <Layers className="h-3 w-3 text-muted-foreground/60" />
                {summary.executedSteps} / {summary.totalSteps}
              </span>
            </div>

            <div>
              <span className="text-[10px] uppercase text-muted-foreground/70 block">Fencing Token</span>
              <span className="font-mono text-[11px] text-foreground font-medium mt-0.5 block">
                {summary.fencingToken}
              </span>
            </div>

            <div>
              <span className="text-[10px] uppercase text-muted-foreground/70 block">Duration</span>
              <span className="font-mono text-[11px] text-foreground font-medium mt-0.5 block">
                {summary.durationMs !== undefined
                  ? `${summary.durationMs}ms`
                  : summary.totalDurationMs !== undefined
                    ? `${summary.totalDurationMs}ms`
                    : "—"}
              </span>
            </div>
          </div>
        )}

        {/* Content Stream */}
        <ScrollArea className="flex-1 min-h-0 p-4">
          {isLoading ? (
            <div className="py-12 flex flex-col items-center justify-center gap-2 text-muted-foreground text-xs">
              <Loader2 className="h-5 w-5 animate-spin" />
              <span>Loading audit stream...</span>
            </div>
          ) : attemptGroups.length === 0 ? (
            <div className="py-12 text-center text-xs text-muted-foreground">
              No audit events recorded for this migration yet.
            </div>
          ) : (
            <div className="space-y-6">
              {attemptGroups.map((group) => (
                <div key={group.attemptNumber} className="space-y-3">
                  {/* Attempt Banner */}
                  <div className="flex items-center justify-between border-b border-border/40 pb-1.5">
                    <span className="font-semibold text-xs text-foreground flex items-center gap-1.5">
                      <Activity className="h-3.5 w-3.5 text-blue-500" />
                      Attempt #{group.attemptNumber}
                    </span>
                    {group.attemptId && (
                      <span className="font-mono text-[10px] text-muted-foreground">
                        id: {group.attemptId.slice(0, 8)}…
                      </span>
                    )}
                  </div>

                  {/* Sequential Events */}
                  <div className="relative pl-4 border-l border-border/60 space-y-3 ml-2">
                    {group.events.map((ev) => {
                      const eventBadge = getEventTypeBadgeConfig(ev.eventType);
                      const hasError =
                        ev.metadata?.error ||
                        ev.eventType === "STEP_FAILED" ||
                        ev.eventType === "COMPENSATION_FAILED" ||
                        ev.eventType === "MANUAL_INTERVENTION_REQUIRED";

                      return (
                        <div key={ev._id || ev.eventId} className="relative group text-xs">
                          {/* Dot on Timeline */}
                          <div
                            className={`absolute -left-[21px] top-1.5 h-2.5 w-2.5 rounded-full border-2 border-background ${
                              hasError
                                ? "bg-destructive"
                                : ev.eventType.includes("COMPLETE") || ev.eventType.includes("APPLIED")
                                  ? "bg-emerald-500"
                                  : "bg-blue-500"
                            }`}
                          />

                          <div className="rounded-md border border-border/50 bg-card p-2.5 space-y-1.5 shadow-2xs">
                            {/* Sequence number, Event type, timestamp */}
                            <div className="flex flex-wrap items-center justify-between gap-1.5">
                              <div className="flex items-center gap-1.5">
                                <span className="font-mono text-[10px] font-semibold text-muted-foreground/80 bg-muted px-1 rounded">
                                  #{ev.sequenceNumber}
                                </span>
                                <Badge
                                  variant="outline"
                                  className={`text-[10px] px-1.5 py-0 ${eventBadge.className}`}
                                >
                                  {eventBadge.label}
                                </Badge>
                                {ev.stepType && (
                                  <span className="font-mono text-[10px] text-muted-foreground">
                                    step {ev.stepIndex !== undefined ? `#${ev.stepIndex}` : ""}: {ev.stepType}
                                  </span>
                                )}
                              </div>

                              <span className="text-[10px] text-muted-foreground font-mono">
                                {new Date(ev.timestamp).toLocaleTimeString()}
                              </span>
                            </div>

                            {/* Token, Lock Owner */}
                            <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-[10px] text-muted-foreground/80 pt-0.5">
                              <span className="flex items-center gap-1">
                                <Shield className="h-3 w-3 text-muted-foreground/50" />
                                token: <span className="font-mono text-foreground/80">{ev.fencingToken}</span>
                              </span>
                              <span className="flex items-center gap-1 truncate max-w-[200px]" title={ev.lockOwnerId}>
                                <Key className="h-3 w-3 text-muted-foreground/50" />
                                owner: <span className="font-mono text-foreground/80 truncate">{ev.lockOwnerId}</span>
                              </span>
                              {ev.metadata?.durationMs !== undefined && (
                                <span className="flex items-center gap-1">
                                  <Clock className="h-3 w-3 text-muted-foreground/50" />
                                  {ev.metadata.durationMs}ms
                                </span>
                              )}
                            </div>

                            {/* Metadata Error Details */}
                            {ev.metadata?.error && (
                              <Alert variant="destructive" className="py-1.5 px-2 text-[11px] bg-destructive/10 border-destructive/20 mt-1">
                                <AlertTriangle className="h-3.5 w-3.5 text-destructive shrink-0" />
                                <AlertDescription className="font-mono break-all text-[10px]">
                                  {typeof ev.metadata.error === "string"
                                    ? ev.metadata.error
                                    : JSON.stringify(ev.metadata.error)}
                                </AlertDescription>
                              </Alert>
                            )}

                            {/* Non-error metadata payload if present */}
                            {ev.metadata && !ev.metadata.error && Object.keys(ev.metadata).length > 0 && (
                              <div className="text-[10px] font-mono bg-muted/40 p-1.5 rounded overflow-x-auto text-muted-foreground max-h-24">
                                {JSON.stringify(ev.metadata)}
                              </div>
                            )}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              ))}
            </div>
          )}
        </ScrollArea>
      </SheetContent>
    </Sheet>
  );
}
