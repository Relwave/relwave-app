import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { databaseService } from "@/services/bridge/database";
import type {
  MongoMigrationManifest,
  MongoMigrationListResult,
  MongoMigrationValidateResult,
  MongoMigrationApplyResult,
  MongoMigrationRollbackResult,
  MongoMigrationGetStatusResult,
} from "@/features/mongodb/types/migration";

/**
 * Fetch list of applied and pending MongoDB migrations along with lock details.
 */
export function useMongoMigrations(dbId?: string, projectRoot?: string) {
  return useQuery<MongoMigrationListResult>({
    queryKey: ["mongoMigrations", dbId, projectRoot] as const,
    queryFn: async () => {
      if (!dbId) throw new Error("Database ID is required");
      return databaseService.listMongoMigrations(dbId, projectRoot);
    },
    enabled: Boolean(dbId),
    staleTime: 15 * 1000,
  });
}

/**
 * Fetch detailed migration status, active lock lease, and audit event journal.
 */
export function useMongoMigrationStatus(dbId?: string, migrationId?: string) {
  return useQuery<MongoMigrationGetStatusResult>({
    queryKey: ["mongoMigrationStatus", dbId, migrationId] as const,
    queryFn: async () => {
      if (!dbId) throw new Error("Database ID is required");
      return databaseService.getMongoMigrationStatus(dbId, migrationId);
    },
    enabled: Boolean(dbId),
    staleTime: 5 * 1000,
  });
}

/**
 * Pure static validation mutation for a MongoDB migration manifest.
 * Does not acquire locks or execute any database operations.
 */
export function useValidateMongoMigration(dbId?: string) {
  return useMutation<MongoMigrationValidateResult, Error, MongoMigrationManifest>({
    mutationFn: async (manifest: MongoMigrationManifest) => {
      return databaseService.validateMongoMigration(manifest, dbId);
    },
    onError: (error: any) => {
      toast.error("Manifest validation failed", {
        description: error.message || String(error),
      });
    },
  });
}

/**
 * Apply pending MongoDB migration(s) forward.
 * Invalidates migrations list and status queries; notifies via sonner.
 */
export function useApplyMongoMigration(dbId?: string) {
  const queryClient = useQueryClient();

  return useMutation<
    MongoMigrationApplyResult,
    Error,
    { version?: string; dryRun?: boolean; projectRoot?: string; ownerId?: string } | undefined
  >({
    mutationFn: async (options) => {
      if (!dbId) throw new Error("Database ID is required");
      return databaseService.applyMongoMigration(dbId, options);
    },
    onSuccess: (data, variables) => {
      queryClient.invalidateQueries({ queryKey: ["mongoMigrations", dbId] });
      queryClient.invalidateQueries({ queryKey: ["mongoMigrationStatus", dbId] });

      const isDryRun = variables?.dryRun;
      if (data.success) {
        if (isDryRun) {
          toast.success("Static Preflight validation passed successfully");
        } else {
          toast.success(
            data.appliedCount === 1
              ? `Applied 1 migration successfully`
              : `Applied ${data.appliedCount} migrations successfully`,
          );
        }
      } else {
        const firstError = data.results.find((r) => r.error)?.error;
        toast.error(isDryRun ? "Static Preflight failed" : "Migration application failed", {
          description: firstError || "Check migration audit log for details.",
        });
      }
    },
    onError: (error: any) => {
      queryClient.invalidateQueries({ queryKey: ["mongoMigrations", dbId] });
      queryClient.invalidateQueries({ queryKey: ["mongoMigrationStatus", dbId] });
      toast.error("Migration execution failed", {
        description: error.message || String(error),
      });
    },
  });
}

/**
 * Roll back an applied MongoDB migration via inverse compensation.
 * Invalidates migrations list and status queries; notifies via sonner.
 */
export function useRollbackMongoMigration(dbId?: string) {
  const queryClient = useQueryClient();

  return useMutation<
    MongoMigrationRollbackResult,
    Error,
    { version: string; force?: boolean; projectRoot?: string; ownerId?: string }
  >({
    mutationFn: async ({ version, force, projectRoot, ownerId }) => {
      if (!dbId) throw new Error("Database ID is required");
      return databaseService.rollbackMongoMigration(dbId, version, { force, projectRoot, ownerId });
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ["mongoMigrations", dbId] });
      queryClient.invalidateQueries({ queryKey: ["mongoMigrationStatus", dbId] });

      if (data.success) {
        toast.success(`Migration ${data.version} rolled back successfully`, {
          description: `Compensated ${data.stepsCompensated} step(s) in ${data.executionTimeMs}ms`,
        });
      } else {
        toast.error(`Rollback for ${data.version} failed: ${data.status}`, {
          description: data.error || "Manual intervention may be required.",
        });
      }
    },
    onError: (error: any) => {
      queryClient.invalidateQueries({ queryKey: ["mongoMigrations", dbId] });
      queryClient.invalidateQueries({ queryKey: ["mongoMigrationStatus", dbId] });
      toast.error("Rollback execution failed", {
        description: error.message || String(error),
      });
    },
  });
}
