import { useMemo, useCallback } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { useFullSchema } from "@/features/project/hooks/useDbQueries";
import {
    useProjectSchema,
    projectKeys,
} from "@/features/project/hooks/useProjectQueries";
import { bridgeApi } from "@/services/bridgeApi";
import { snapshotToSchemaDetails, schemaGroupsToSnapshots } from "@/lib/schemaConverters";
import type { DatabaseSchemaDetails } from "@/features/database/types";
import { projectService } from "@/services/bridge/project";

// ================================================================
// useSchemaExplorerData
//
// Smart data source for the Schema Explorer that:
//
// 1. OFFLINE-FIRST: Loads from project files (schema.json) even
//    when the database is not connected.
//
// 2. LIVE FALLBACK: Falls back to live DB schema via useFullSchema
//    when project files are empty or projectId is not provided.
//
// 3. SYNC: Provides a `syncFromDatabase` callback that pulls fresh
//    schema from the live DB and saves it to project files.
// ================================================================

export interface UseSchemaExplorerDataReturn {
    /** The resolved schema data for the explorer to render */
    schemaData: DatabaseSchemaDetails | null;

    /** True while initial data is loading */
    isLoading: boolean;

    /** Data source: "live" = from DB, "project" = from project files */
    dataSource: "live" | "project" | "none";

    /** Whether live DB schema is available (for sync button state) */
    hasLiveSchema: boolean;

    /** Pull fresh schema from DB → save to project files → reload */
    syncFromDatabase: () => Promise<void>;

    /** Refetch from existing source (not a DB sync — just re-queries) */
    refetch: () => void;
}

export function useSchemaExplorerData(
    dbId: string | undefined,
    projectId: string | null | undefined
): UseSchemaExplorerDataReturn {
    const queryClient = useQueryClient();

    // ---- Live DB schema ----
    const {
        data: liveSchema,
        isLoading: liveLoading,
        error: liveError,
        refetch: refetchLive,
    } = useFullSchema(dbId);

    // ---- Project files ----
    const {
        data: projectSchemaFile,
        isLoading: projectSchemaLoading,
        refetch: refetchProject,
    } = useProjectSchema(projectId ?? undefined);

    // ---- Determine the best schema source ----
    const { schemaData, dataSource } = useMemo(() => {
        // Prefer live DB if available (most up-to-date, has FK/index data)
        if (liveSchema && liveSchema.schemas?.some((s) => s.tables?.length)) {
            return { schemaData: liveSchema, dataSource: "live" as const };
        }

        // Fall back to project cached schema (offline mode)
        if (projectSchemaFile?.schemas?.length) {
            const converted = snapshotToSchemaDetails(
                projectSchemaFile.databaseId || "Database",
                projectSchemaFile.schemas
            );
            if (converted.schemas.some((s) => s.tables?.length)) {
                return { schemaData: converted, dataSource: "project" as const };
            }
        }

        return { schemaData: null, dataSource: "none" as const };
    }, [liveSchema, projectSchemaFile]);

    // ---- Loading state ----
    const isLoading = liveLoading || projectSchemaLoading;
    const hasLiveSchema = !!liveSchema && !liveError;

    // ---- Refetch from current source ----
    const refetch = useCallback(() => {
        if (dataSource === "live") {
            refetchLive();
        } else if (dataSource === "project") {
            refetchProject();
        } else {
            refetchLive();
            refetchProject();
        }
    }, [dataSource, refetchLive, refetchProject]);

    // ---- Sync from Database ----
    const syncFromDatabase = useCallback(async () => {
        if (!dbId) {
            toast.error("No database connected");
            return;
        }

        if (!projectId) {
            toast.error("No project linked to this database");
            return;
        }

        try {
            // 1. Fetch fresh schema from live database
            const freshSchema = await bridgeApi.getSchema(dbId);

            if (!freshSchema?.schemas?.length) {
                toast.warning("Database returned no schemas");
                return;
            }

            // 2. Convert to snapshots and save to project schema.json
            const snapshots = schemaGroupsToSnapshots(freshSchema.schemas);
            await projectService.saveProjectSchema(projectId, snapshots);

            // 3. Invalidate React Query caches to trigger re-render
            queryClient.invalidateQueries({
                queryKey: projectKeys.schema(projectId),
            });
            queryClient.invalidateQueries({
                queryKey: ["fullSchema", dbId],
            });

            toast.success("Schema synced from database", {
                description: `${freshSchema.schemas.reduce(
                    (acc, s) => acc + (s.tables?.length || 0),
                    0
                )} tables across ${freshSchema.schemas.length} schemas`,
            });
        } catch (err: any) {
            console.error("[SchemaExplorerData] Sync failed:", err);
            toast.error("Schema sync failed", {
                description: err.message || "Could not pull schema from database",
            });
        }
    }, [dbId, projectId, queryClient]);

    return {
        schemaData,
        isLoading,
        dataSource,
        hasLiveSchema,
        syncFromDatabase,
        refetch,
    };
}
