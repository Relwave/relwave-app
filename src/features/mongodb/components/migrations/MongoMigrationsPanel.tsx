import React, { useState, useMemo } from "react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import {
  RefreshCw,
  FileCheck,
  Play,
  Lock,
  Unlock,
  ShieldAlert,
  AlertTriangle,
  Clock,
  History,
  CheckCircle2,
} from "lucide-react";
import { useDatabase } from "@/features/project/hooks/useDbQueries";
import { useMongoMigrations } from "../../hooks/useMongoMigrations";
import { MongoMigrationCard, MigrationCardData } from "./MongoMigrationCard";
import { MongoMigrationValidateDialog } from "./MongoMigrationValidateDialog";
import { MongoMigrationApplyDialog } from "./MongoMigrationApplyDialog";
import { MongoMigrationRollbackDialog } from "./MongoMigrationRollbackDialog";
import { MongoMigrationDetailDrawer } from "./MongoMigrationDetailDrawer";

export interface MongoMigrationsPanelProps {
  dbId: string;
  databaseName?: string;
  isReadOnly?: boolean;
}

export function MongoMigrationsPanel({
  dbId,
  databaseName,
  isReadOnly: isReadOnlyProp,
}: MongoMigrationsPanelProps) {
  // Query database connection to check read-only mode if not explicitly passed
  const { data: dbConn } = useDatabase(dbId);
  const isReadOnly =
    isReadOnlyProp ?? Boolean((dbConn as any)?.readOnly || (dbConn as any)?.readonly);

  const { data: migrationsData, isLoading, isFetching, refetch } = useMongoMigrations(dbId);

  // Dialog and drawer state
  const [validateOpen, setValidateOpen] = useState(false);
  const [applyTarget, setApplyTarget] = useState<{ id?: string; name?: string } | null>(null);
  const [rollbackTarget, setRollbackTarget] = useState<{
    id: string;
    name?: string;
    isReversible?: boolean;
  } | null>(null);
  const [auditTarget, setAuditTarget] = useState<string | null>(null);

  const appliedMigrations = useMemo(
    () => migrationsData?.appliedMigrations || [],
    [migrationsData?.appliedMigrations],
  );
  const pendingMigrations = useMemo(
    () => migrationsData?.pendingMigrations || [],
    [migrationsData?.pendingMigrations],
  );

  const isLocked = Boolean(migrationsData?.isLocked);
  const lockDetails = migrationsData?.lockDetails;

  const hasUncertainOrManualIntervention = useMemo(
    () =>
      appliedMigrations.some(
        (m) =>
          m.status === "CRASHED_UNCERTAIN" || m.status === "FAILED_MANUAL_INTERVENTION_REQUIRED",
      ),
    [appliedMigrations],
  );

  const totalCount = appliedMigrations.length + pendingMigrations.length;

  const handleApplySingle = (migrationId: string) => {
    const item = pendingMigrations.find((p) => p.id === migrationId);
    setApplyTarget({ id: migrationId, name: item?.name });
  };

  const handleApplyAll = () => {
    setApplyTarget({});
  };

  const handleRollback = (migrationId: string) => {
    const item = appliedMigrations.find((a) => a._id === migrationId);
    setRollbackTarget({
      id: migrationId,
      name: item?.name,
      isReversible: item?.isReversible ?? true,
    });
  };

  const handleViewAuditLog = (migrationId: string) => {
    setAuditTarget(migrationId);
  };

  const selectedSummary = useMemo(() => {
    if (!auditTarget) return null;
    return appliedMigrations.find((a) => a._id === auditTarget) || null;
  }, [auditTarget, appliedMigrations]);

  return (
    <div className="flex-1 flex flex-col h-full overflow-hidden bg-background text-foreground">
      {/* Active Lock Banner (if cluster is currently leased) */}
      {isLocked && (
        <div className="bg-amber-500/15 border-b border-amber-500/30 px-4 py-2.5 flex items-center justify-between text-xs text-amber-600 dark:text-amber-400 shrink-0">
          <div className="flex items-center gap-2">
            <Lock className="h-4 w-4 text-amber-500 shrink-0 animate-pulse" />
            <span className="font-semibold">Active Distributed Lease:</span>
            <span>
              Migration engine is currently locked by{" "}
              <strong className="font-mono text-foreground font-semibold">
                {lockDetails?.ownerId || "Unknown Owner"}
              </strong>
            </span>
            {lockDetails?.fencingToken !== undefined && (
              <Badge
                variant="outline"
                className="font-mono text-[10px] border-amber-500/40 text-amber-500"
              >
                token: {lockDetails.fencingToken}
              </Badge>
            )}
            {lockDetails?.migrationId && (
              <span className="text-[11px] text-muted-foreground font-mono">
                (target: {lockDetails.migrationId})
              </span>
            )}
          </div>

          {lockDetails?.expiresAt && (
            <div className="flex items-center gap-1 font-mono text-[11px]">
              <Clock className="h-3 w-3" />
              Expires: {new Date(lockDetails.expiresAt).toLocaleTimeString()}
            </div>
          )}
        </div>
      )}

      {/* Read-Only Notice Banner */}
      {isReadOnly && (
        <div className="bg-blue-500/10 border-b border-blue-500/20 px-4 py-2 flex items-center justify-between text-xs text-blue-600 dark:text-blue-400 shrink-0">
          <div className="flex items-center gap-2">
            <ShieldAlert className="h-4 w-4 text-blue-500 shrink-0" />
            <span className="font-medium">
              Read-Only Connection: Mutation actions (Apply, Rollback) are safely disabled for this
              connection.
            </span>
          </div>
          <Badge
            variant="outline"
            className="text-[10px] border-blue-500/30 text-blue-500 font-mono"
          >
            READ_ONLY
          </Badge>
        </div>
      )}

      {/* Manual Intervention / Uncertain Alert Banner */}
      {hasUncertainOrManualIntervention && (
        <div className="bg-destructive/10 border-b border-destructive/20 px-4 py-2 flex items-center justify-between text-xs text-destructive shrink-0">
          <div className="flex items-center gap-2">
            <AlertTriangle className="h-4 w-4 text-destructive shrink-0" />
            <span className="font-medium">
              Action Required: One or more migrations are in an uncertain or manual intervention
              state. Automated forward execution is paused.
            </span>
          </div>
          <Badge variant="destructive" className="text-[10px] font-mono">
            MANUAL_INTERVENTION_REQUIRED
          </Badge>
        </div>
      )}

      {/* Main Header & Toolbar */}
      <div className="p-4 border-b border-border/40 flex flex-wrap items-center justify-between gap-3 bg-sidebar/20 shrink-0">
        <div className="flex items-center gap-3">
          <div className="flex items-center gap-2">
            <History className="h-4 w-4 text-emerald-500" />
            <span className="font-semibold text-xs text-foreground">MongoDB Migrations</span>
          </div>

          {databaseName && (
            <Badge variant="outline" className="font-mono text-[11px] bg-muted/60 text-foreground">
              {databaseName}
            </Badge>
          )}

          {/* Metric Pills */}
          <div className="flex items-center gap-1.5">
            <Badge
              variant="outline"
              className="text-[10px] bg-muted/40 font-mono text-muted-foreground"
            >
              Total: {totalCount}
            </Badge>

            <Badge
              variant="outline"
              className="text-[10px] bg-emerald-500/10 border-emerald-500/30 text-emerald-500 font-mono"
            >
              Applied: {appliedMigrations.length}
            </Badge>

            <Badge
              variant="outline"
              className="text-[10px] bg-blue-500/10 border-blue-500/30 text-blue-500 font-mono"
            >
              Pending: {pendingMigrations.length}
            </Badge>

            <Badge
              variant="outline"
              className={`text-[10px] font-mono flex items-center gap-1 ${
                isLocked
                  ? "bg-amber-500/10 text-amber-500 border-amber-500/30"
                  : "bg-muted/40 text-muted-foreground"
              }`}
            >
              {isLocked ? (
                <>
                  <Lock className="h-2.5 w-2.5" /> Locked
                </>
              ) : (
                <>
                  <Unlock className="h-2.5 w-2.5" /> Unlocked
                </>
              )}
            </Badge>
          </div>
        </div>

        {/* Toolbar Buttons */}
        <div className="flex items-center gap-2">
          <Button
            variant="outline"
            size="sm"
            className="h-8 text-xs gap-1.5"
            onClick={() => refetch()}
            disabled={isLoading || isFetching}
            title="Refresh migration list and lock status"
          >
            <RefreshCw className={`h-3.5 w-3.5 ${isFetching ? "animate-spin" : ""}`} />
            Refresh
          </Button>

          <Button
            variant="outline"
            size="sm"
            className="h-8 text-xs gap-1.5"
            onClick={() => setValidateOpen(true)}
            title="Statically validate a manifest file"
          >
            <FileCheck className="h-3.5 w-3.5 text-emerald-500" />
            Validate Manifest
          </Button>

          <Button
            size="sm"
            className="h-8 text-xs gap-1.5 bg-emerald-600 hover:bg-emerald-700 text-white"
            onClick={handleApplyAll}
            disabled={
              isReadOnly || pendingMigrations.length === 0 || hasUncertainOrManualIntervention
            }
            title={
              isReadOnly
                ? "Database connection is read-only"
                : hasUncertainOrManualIntervention
                  ? "Cannot apply pending migrations while an uncertain or manual intervention state is unresolved"
                  : pendingMigrations.length === 0
                    ? "No pending migrations to apply"
                    : "Apply all pending migrations"
            }
          >
            <Play className="h-3 w-3" />
            Apply All Pending
          </Button>
        </div>
      </div>

      {/* Content Tabs */}
      <Tabs defaultValue="pending" className="flex-1 flex flex-col min-h-0">
        <div className="px-4 border-b border-border/40 bg-sidebar/10 shrink-0">
          <TabsList className="bg-transparent h-9 p-0 gap-4">
            <TabsTrigger
              value="pending"
              className="data-[state=active]:bg-transparent data-[state=active]:border-b-2 data-[state=active]:border-emerald-500 rounded-none px-2 text-xs font-medium"
            >
              Pending Migrations ({pendingMigrations.length})
            </TabsTrigger>
            <TabsTrigger
              value="applied"
              className="data-[state=active]:bg-transparent data-[state=active]:border-b-2 data-[state=active]:border-emerald-500 rounded-none px-2 text-xs font-medium"
            >
              Applied Migrations ({appliedMigrations.length})
            </TabsTrigger>
          </TabsList>
        </div>

        {/* Pending Migrations Tab */}
        <TabsContent value="pending" className="flex-1 min-h-0 overflow-y-auto p-4 m-0">
          {pendingMigrations.length === 0 ? (
            <div className="h-full flex flex-col items-center justify-center text-center p-8 text-muted-foreground text-xs space-y-2">
              <CheckCircle2 className="h-8 w-8 text-emerald-500/70" />
              <div className="font-semibold text-foreground text-sm">
                All migrations are up to date
              </div>
              <p className="max-w-xs text-muted-foreground">
                No unapplied migration manifests found in{" "}
                <code className="font-mono">migrations/mongo/</code>.
              </p>
            </div>
          ) : (
            <div className="grid grid-cols-1 gap-3 max-w-4xl">
              {pendingMigrations.map((m) => {
                const existing = appliedMigrations.find((a) => a._id === m.id);
                const cardData: MigrationCardData = {
                  id: m.id,
                  name: m.name,
                  checksum: m.checksum,
                  status: existing ? existing.status : "PENDING",
                  stepCount: m.stepCount,
                  totalSteps: m.stepCount,
                  executedSteps: existing ? existing.executedSteps : 0,
                  isReversible: m.isReversible,
                  filename: m.filename,
                  error: existing?.error,
                  attemptNumber: existing?.attemptNumber,
                  fencingToken: existing?.fencingToken,
                  driftStatus: existing?.driftStatus,
                  drifted: existing?.drifted,
                  driftDetails: existing?.driftDetails,
                };
                return (
                  <MongoMigrationCard
                    key={m.id}
                    migration={cardData}
                    isReadOnly={isReadOnly}
                    onApply={handleApplySingle}
                    onRollback={handleRollback}
                    onViewAuditLog={handleViewAuditLog}
                  />
                );
              })}
            </div>
          )}
        </TabsContent>

        {/* Applied Migrations Tab */}
        <TabsContent value="applied" className="flex-1 min-h-0 overflow-y-auto p-4 m-0">
          {appliedMigrations.length === 0 ? (
            <div className="h-full flex flex-col items-center justify-center text-center p-8 text-muted-foreground text-xs space-y-2">
              <History className="h-8 w-8 text-muted-foreground/40" />
              <div className="font-semibold text-foreground text-sm">
                No applied migrations recorded
              </div>
              <p className="max-w-xs text-muted-foreground">
                Migrations applied forward will be journaled in{" "}
                <code className="font-mono">_relwave_migrations</code>.
              </p>
            </div>
          ) : (
            <div className="grid grid-cols-1 gap-3 max-w-4xl">
              {appliedMigrations.map((m) => {
                const cardData: MigrationCardData = {
                  id: m._id,
                  name: m.name,
                  checksum: m.checksum,
                  status: m.status,
                  executedSteps: m.executedSteps,
                  totalSteps: m.totalSteps,
                  isReversible: m.isReversible,
                  startedAt: m.startedAt,
                  completedAt: m.completedAt,
                  durationMs: m.durationMs,
                  totalDurationMs: m.totalDurationMs,
                  attemptNumber: m.attemptNumber,
                  attemptId: m.attemptId,
                  fencingToken: m.fencingToken,
                  error: m.error,
                  appliedBy: m.appliedBy,
                  driftStatus: m.driftStatus,
                  drifted: m.drifted,
                  driftDetails: m.driftDetails,
                };
                return (
                  <MongoMigrationCard
                    key={m._id}
                    migration={cardData}
                    isReadOnly={isReadOnly}
                    onRollback={handleRollback}
                    onViewAuditLog={handleViewAuditLog}
                  />
                );
              })}
            </div>
          )}
        </TabsContent>
      </Tabs>

      {/* Dialogs & Drawers */}
      <MongoMigrationValidateDialog
        open={validateOpen}
        onOpenChange={setValidateOpen}
        dbId={dbId}
      />

      <MongoMigrationApplyDialog
        open={applyTarget !== null}
        onOpenChange={(open) => !open && setApplyTarget(null)}
        dbId={dbId}
        migrationId={applyTarget?.id}
        migrationName={applyTarget?.name}
        onSuccess={() => refetch()}
      />

      {rollbackTarget && (
        <MongoMigrationRollbackDialog
          open={rollbackTarget !== null}
          onOpenChange={(open) => !open && setRollbackTarget(null)}
          dbId={dbId}
          migrationId={rollbackTarget.id}
          migrationName={rollbackTarget.name}
          isReversible={rollbackTarget.isReversible}
          onSuccess={() => refetch()}
        />
      )}

      <MongoMigrationDetailDrawer
        open={auditTarget !== null}
        onOpenChange={(open) => !open && setAuditTarget(null)}
        dbId={dbId}
        migrationId={auditTarget}
        fallbackSummary={selectedSummary}
      />
    </div>
  );
}
