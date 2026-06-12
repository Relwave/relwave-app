import { useEffect, useRef, useCallback, useState } from "react";
import { useProjectByDatabaseId } from "@/features/project/hooks/useProjectQueries";
import { schemaGroupsToSnapshots } from "@/lib/schemaConverters";
import type { DatabaseSchemaDetails } from "@/features/database/types";
import type { ERNode } from "@/features/project/types";
import type { ImportAnalysis } from "@/features/project/types";
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
    /** Import analysis result — null while loading or if no project */
    importAnalysis: ImportAnalysis | null;
    /** Whether the import analysis is still loading */
    importAnalysisLoading: boolean;
    /** Re-fetch import analysis (e.g. after applying migrations) */
    refetchImportAnalysis: () => void;
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
    // Import analysis — check if project has pending migrations
    // -----------------------------------------
    const [importAnalysis, setImportAnalysis] = useState<ImportAnalysis | null>(null);
    const [importAnalysisLoading, setImportAnalysisLoading] = useState(false);
    const analysisCheckedRef = useRef<string | null>(null);

    const fetchImportAnalysis = useCallback(async () => {
        if (!projectId) return;
        setImportAnalysisLoading(true);
        try {
            const data = await projectService.analyzeImport(projectId);
            setImportAnalysis(data);
        } catch (err: any) {
            console.warn("[ProjectSync] Import analysis failed:", err.message);
            // On failure, allow schema sync to proceed (fail-open)
            setImportAnalysis(null);
        } finally {
            setImportAnalysisLoading(false);
        }
    }, [projectId]);

    useEffect(() => {
        if (projectId && projectId !== analysisCheckedRef.current) {
            analysisCheckedRef.current = projectId;
            fetchImportAnalysis();
        }
    }, [projectId, fetchImportAnalysis]);

    // -----------------------------------------
    // Auto-sync schema when fresh data arrives
    // -----------------------------------------
    useEffect(() => {
        if (!projectId || !schemaData?.schemas?.length) return;

        // Don't overwrite the imported schema if there are pending migrations
        // or a schema snapshot waiting to be applied to an empty database.
        // Only auto-sync when analysis confirms the project is "synced"
        // (i.e., the live DB matches the project state).
        if (importAnalysisLoading) return; // wait until analysis finishes
        if (importAnalysis && importAnalysis.driftStatus !== "synced") {
            console.debug(
                "[ProjectSync] Skipping schema auto-save — project has pending drift:",
                importAnalysis.driftStatus
            );
            return;
        }

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
    }, [projectId, schemaData, importAnalysis, importAnalysisLoading]);

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

    return { projectId, isLoading, saveERDiagram, importAnalysis, importAnalysisLoading, refetchImportAnalysis: fetchImportAnalysis };
}
