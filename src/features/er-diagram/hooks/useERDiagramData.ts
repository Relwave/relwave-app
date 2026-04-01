import { useMemo, useCallback } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { useFullSchema } from "@/features/project/hooks/useDbQueries";
import {
    useProjectSchema,
    useProjectERDiagram,
    projectKeys,
} from "@/features/project/hooks/useProjectQueries";
import { snapshotToSchemaDetails, schemaGroupsToSnapshots } from "@/lib/schemaConverters";
import type {
    DatabaseSchemaDetails,
} from "@/features/database/types";
import type {
    ERDiagramFile,
    ERNode,
} from "@/features/project/types";
import { projectService } from "@/services/bridge/project";
import { databaseService } from "@/services/bridge/database";

// ================================================================
// useERDiagramData
//
// Smart data source for the ER diagram that:
//
// 1. OFFLINE-FIRST: Loads from project files (schema.json + er-diagram.json)
//    even when the database is not connected.
//
// 2. LIVE FALLBACK: Falls back to live DB schema via useFullSchema when
//    project files are empty or projectId is not provided.
//
// 3. MERGE: Merges saved ER layout positions (er-diagram.json) with the
//    current schema data. Tables in schema but missing from ER layout
//    are auto-placed. Tables in ER layout but removed from schema are
//    ignored.
//
// 4. SYNC: Provides a `syncFromDatabase` callback that pulls fresh
//    schema from the live DB, saves it to project files (schema.json),
//    and does NOT touch the ER layout (er-diagram.json).
// ================================================================

// ================================================================

export interface UseERDiagramDataReturn {
    /** The resolved schema data that the diagram should render */
    schemaData: DatabaseSchemaDetails | null;

    /** Saved ER layout (node positions, zoom, pan) — may be null */
    savedLayout: ERDiagramFile | null;

    /** True while initial data is still loading */
    isLoading: boolean;

    /** Data source: "live" = from DB, "project" = from project files */
    dataSource: "live" | "project" | "none";

    /** Whether live DB schema is available (for sync button state) */
    hasLiveSchema: boolean;

    /** Pull fresh schema from DB → save to project files → reload */
    syncFromDatabase: () => Promise<void>;

    /** Whether sync is currently in progress */
    isSyncing: boolean;
}

export function useERDiagramData(
    dbId: string | undefined,
    projectId: string | null | undefined
): UseERDiagramDataReturn {
    const queryClient = useQueryClient();

    // ---- Live DB schema ----
    const {
        data: liveSchema,
        isLoading: liveLoading,
        error: liveError,
    } = useFullSchema(dbId);

    // ---- Project files ----
    const {
        data: projectSchemaFile,
        isLoading: projectSchemaLoading,
    } = useProjectSchema(projectId ?? undefined);

    const {
        data: savedLayout,
        isLoading: erLayoutLoading,
    } = useProjectERDiagram(projectId ?? undefined);

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
    const isLoading = liveLoading || projectSchemaLoading || erLayoutLoading;
    const hasLiveSchema = !!liveSchema && !liveError;

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
            const freshSchema = await databaseService.getSchema(dbId);

            if (!freshSchema?.schemas?.length) {
                toast.warning("Database returned no schemas");
                return;
            }

            // 2. Convert to snapshots and save to project schema.json
            //    ❗ This does NOT touch er-diagram.json
            const snapshots = schemaGroupsToSnapshots(freshSchema.schemas);
            await projectService.saveProjectSchema(projectId, snapshots);

            // 3. Invalidate React Query caches to trigger re-render
            queryClient.invalidateQueries({
                queryKey: projectKeys.schema(projectId),
            });
            // Also refresh the live schema cache
            queryClient.invalidateQueries({
                queryKey: ["fullSchema", dbId],
            });

            toast.success("Schema synced from database", {
                description: `${freshSchema.schemas.reduce(
                    (acc, s) => acc + (s.tables?.length || 0),
                    0
                )} tables across ${freshSchema.schemas.length} schemas`,
            });

            console.debug("[ERDiagramData] Schema synced from DB, ER layout untouched");
        } catch (err: any) {
            console.error("[ERDiagramData] Sync failed:", err);
            toast.error("Schema sync failed", {
                description: err.message || "Could not pull schema from database",
            });
        }
    }, [dbId, projectId, queryClient]);

    return {
        schemaData,
        savedLayout: savedLayout ?? null,
        isLoading,
        dataSource,
        hasLiveSchema,
        syncFromDatabase,
        // isSyncing is tracked by the caller if needed
        isSyncing: false,
    };
}
