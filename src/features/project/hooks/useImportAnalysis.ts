import { useState, useEffect, useCallback } from "react";
import { projectService } from "@/services/bridge/project";
import { ImportAnalysis } from "../types";

export function useImportAnalysis(projectId?: string, targetDatabaseId?: string) {
    const [analysis, setAnalysis] = useState<ImportAnalysis | null>(null);
    const [loading, setLoading] = useState<boolean>(false);
    const [error, setError] = useState<Error | null>(null);

    const fetchAnalysis = useCallback(async () => {
        if (!projectId) return;
        
        setLoading(true);
        setError(null);
        try {
            const data = await projectService.analyzeImport(projectId);
            setAnalysis(data);
        } catch (err: any) {
            console.error("Failed to fetch import analysis:", err);
            setError(err instanceof Error ? err : new Error(err?.message || "Unknown error"));
        } finally {
            setLoading(false);
        }
    }, [projectId]);

    useEffect(() => {
        if (projectId && targetDatabaseId) {
            fetchAnalysis();
        }
    }, [projectId, targetDatabaseId, fetchAnalysis]);

    return {
        analysis,
        loading,
        error,
        refetch: fetchAnalysis
    };
}
