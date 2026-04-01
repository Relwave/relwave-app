import { useEffect, useRef, useCallback } from "react";
import { useProjectByDatabaseId } from "@/features/project/hooks/useProjectQueries";
import { schemaGroupsToSnapshots } from "@/lib/schemaConverters";
import type { DatabaseSchemaDetails } from "@/features/database/types";
import type { ERNode } from "@/features/project/types";
import { projectService } from "@/services/bridge/project";

// ==========================================
// Hook: useProjectSync
//
// Automatically syncs live database data into the linked project's
// JSON files whenever fresh data is fetched.
//
// Usage:  const { projectId } = useProjectSync(dbId, schemaData);
//
// It also exposes helpers for ER diagram and query sync.
// ==========================================

interface UseProjectSyncReturn {
    /** The linked project's ID, or null if no project is linked */
    projectId: string | null;
    /** Whether the project lookup is still loading */
    isLoading: boolean;
    /** Save ER diagram node positions (debounced externally by caller) */
    saveERDiagram: (nodes: ERNode[], zoom?: number, panX?: number, panY?: number) => void;
}

export function useProjectSync(
    dbId: string | undefined,
    schemaData: DatabaseSchemaDetails | undefined
): UseProjectSyncReturn {
    const { data: project, isLoading } = useProjectByDatabaseId(dbId);
    const projectId = project?.id ?? null;

    // Track what we last synced to avoid redundant writes
    const lastSyncedSchemaRef = useRef<string | null>(null);

    // -----------------------------------------
    // Auto-sync schema when fresh data arrives
    // -----------------------------------------
    useEffect(() => {
        if (!projectId || !schemaData?.schemas?.length) return;

        // Build a lightweight fingerprint to avoid re-saving identical data.
        // We use schema/table count as a quick check (cheap to compute).
        const fingerprint = schemaData.schemas
            .map((s) => `${s.name}:${s.tables?.length ?? 0}`)
            .join("|");

        if (fingerprint === lastSyncedSchemaRef.current) return;

        const snapshots = schemaGroupsToSnapshots(schemaData.schemas);

        // Fire-and-forget — sync in the background without blocking UI
        projectService
            .saveProjectSchema(projectId, snapshots)
            .then(() => {
                lastSyncedSchemaRef.current = fingerprint;
                console.debug("[ProjectSync] Schema synced for project", projectId);
            })
            .catch((err) => {
                console.warn("[ProjectSync] Schema sync failed:", err.message);
            });
    }, [projectId, schemaData]);

    // -----------------------------------------
    // ER Diagram save helper
    // -----------------------------------------
    const saveERDiagram = useCallback(
        (nodes: ERNode[], zoom?: number, panX?: number, panY?: number) => {
            if (!projectId) return;
            projectService
                .saveProjectERDiagram(projectId, { nodes, zoom, panX, panY })
                .then(() => {
                    console.debug("[ProjectSync] ER diagram synced for project", projectId);
                })
                .catch((err) => {
                    console.warn("[ProjectSync] ER diagram sync failed:", err.message);
                });
        },
        [projectId]
    );

    return { projectId, isLoading, saveERDiagram };
}
