// features/database/hooks/useDatabaseStats.ts

import { useQuery } from "@tanstack/react-query";
import { useCachedConnectionStatus, useCachedTotalStats, useCachedDbStats } from "./useCachedData";
import { bytesToMBString } from "@/lib/bytesToMB";
import { databaseService } from "@/services/bridge/database";

export const useDatabaseStats = (bridgeReady: boolean, hasDatabases: boolean) => {
    const { cachedStats, updateCache: updateStatsCache } = useCachedTotalStats();
    const { cachedStatus, updateCache: updateStatusCache } = useCachedConnectionStatus();

    const { data: stats, isLoading: statsLoading } = useQuery({
        queryKey: ["totalStats"],
        queryFn: async () => {
            const result = await databaseService.getTotalDatabaseStats();
            if (result) updateStatsCache(result);
            return result;
        },
        enabled: !!bridgeReady && hasDatabases,
        staleTime: 30 * 1000,
    });

    const { data: statusData, isLoading: statusLoading, refetch: refetchStatus } = useQuery({
        queryKey: ["connectionStatus"],
        queryFn: async () => {
            const res = await databaseService.testAllConnections();
            const statusMap = new Map<string, string>();
            res.forEach((r) => statusMap.set(r.id, r.result.status));
            updateStatusCache(statusMap);
            return statusMap;
        },
        enabled: !!bridgeReady,
        staleTime: 60 * 1000,
    });

    // Fresh data with cache fallback
    const status = statusData || cachedStatus;
    const effectiveStats = stats || cachedStats;

    // Derived values — computed here, not in the page
    const totalSize = effectiveStats?.sizeBytes ? bytesToMBString(effectiveStats.sizeBytes) : "—";
    const totalTables = effectiveStats?.tables ?? "—";
    const connectedCount = [...status.values()].filter((s) => s === "connected").length;

    // Show loading only when no cache exists
    const showStatsLoading = statsLoading && !cachedStats;
    const showStatusLoading = statusLoading && cachedStatus.size === 0;

    return {
        status,
        totalSize,
        totalTables,
        connectedCount,
        showStatsLoading,
        showStatusLoading,
        refetchStatus,
    };
};