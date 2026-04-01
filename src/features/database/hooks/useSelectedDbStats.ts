// features/database/hooks/useSelectedDbStats.ts

import { useQuery } from "@tanstack/react-query";
import { useCachedDbStats } from "./useCachedData";
import { bytesToMBString } from "@/lib/bytesToMB";
import { databaseService } from "@/services/bridge/database";
import { bridgeApi } from "@/services/bridgeApi";

export const useSelectedDbStats = (
    bridgeReady: boolean,
    selectedDb: string | null,
    isConnected: boolean
) => {
    const { getStats: getCachedDbStats, updateCache: updateDbStatsCache } = useCachedDbStats();

    const { data: selectedDbStats, isLoading: selectedDbStatsLoading } = useQuery({
        queryKey: ["dbStats", selectedDb],
        queryFn: async () => {
            const result = await databaseService.getDataBaseStats(selectedDb!);
            if (result && selectedDb) updateDbStatsCache(selectedDb, result);
            return result;
        },
        enabled: !!bridgeReady && !!selectedDb && isConnected,
        staleTime: 30 * 1000,
    });

    const cachedSelectedDbStats = selectedDb ? getCachedDbStats(selectedDb) : undefined;
    const effectiveStats = selectedDbStats || cachedSelectedDbStats;
    const isLoadingWithNoCache = selectedDbStatsLoading && !cachedSelectedDbStats;

    return {
        tables: isLoadingWithNoCache ? "—" : (effectiveStats?.tables ?? "—"),
        size: isLoadingWithNoCache ? "—" : (effectiveStats?.sizeBytes ? bytesToMBString(effectiveStats.sizeBytes) : "—"),
    };
};