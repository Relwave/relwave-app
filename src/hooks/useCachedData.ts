import { useEffect, useState, useCallback } from "react";

const CACHE_PREFIX = "relwave-cache-";
const CACHE_EXPIRY = 24 * 60 * 60 * 1000; // 24 hours

interface CacheEntry<T> {
  data: T;
  timestamp: number;
}

/**
 * Get cached data from localStorage
 */
function getCachedData<T>(key: string): T | null {
  try {
    const cached = localStorage.getItem(CACHE_PREFIX + key);
    if (!cached) return null;

    const entry: CacheEntry<T> = JSON.parse(cached);
    
    // Check if cache is expired
    if (Date.now() - entry.timestamp > CACHE_EXPIRY) {
      localStorage.removeItem(CACHE_PREFIX + key);
      return null;
    }
    
    return entry.data;
  } catch {
    return null;
  }
}

/**
 * Set cached data in localStorage
 */
function setCachedData<T>(key: string, data: T): void {
  try {
    const entry: CacheEntry<T> = {
      data,
      timestamp: Date.now(),
    };
    localStorage.setItem(CACHE_PREFIX + key, JSON.stringify(entry));
  } catch (e) {
    // localStorage might be full or disabled
    console.warn("Failed to cache data:", e);
  }
}

/**
 * Hook for caching connection status
 * Returns cached status instantly, then updates when fresh data arrives
 */
export function useCachedConnectionStatus() {
  const CACHE_KEY = "connection-status";
  
  const [cachedStatus, setCachedStatus] = useState<Map<string, string>>(() => {
    const cached = getCachedData<Record<string, string>>(CACHE_KEY);
    return cached ? new Map(Object.entries(cached)) : new Map();
  });

  const updateCache = useCallback((statusMap: Map<string, string>) => {
    setCachedStatus(statusMap);
    // Convert Map to object for JSON serialization
    const obj = Object.fromEntries(statusMap);
    setCachedData(CACHE_KEY, obj);
  }, []);

  return { cachedStatus, updateCache };
}

/**
 * Hook for caching total stats
 */
export function useCachedTotalStats() {
  const CACHE_KEY = "total-stats";
  
  interface TotalStats {
    tables: number;
    rows: number;
    sizeBytes: number;
  }

  const [cachedStats, setCachedStats] = useState<TotalStats | null>(() => {
    return getCachedData<TotalStats>(CACHE_KEY);
  });

  const updateCache = useCallback((stats: TotalStats) => {
    setCachedStats(stats);
    setCachedData(CACHE_KEY, stats);
  }, []);

  return { cachedStats, updateCache };
}

/**
 * Hook for caching individual database stats
 */
export function useCachedDbStats() {
  const CACHE_KEY = "db-stats";
  
  interface DbStats {
    tables: number;
    rows: number;
    sizeBytes: number;
  }

  const [cachedDbStats, setCachedDbStats] = useState<Map<string, DbStats>>(() => {
    const cached = getCachedData<Record<string, DbStats>>(CACHE_KEY);
    return cached ? new Map(Object.entries(cached)) : new Map();
  });

  const updateCache = useCallback((dbId: string, stats: DbStats) => {
    setCachedDbStats(prev => {
      const newMap = new Map(prev);
      newMap.set(dbId, stats);
      // Convert Map to object for JSON serialization
      const obj = Object.fromEntries(newMap);
      setCachedData(CACHE_KEY, obj);
      return newMap;
    });
  }, []);

  const getStats = useCallback((dbId: string): DbStats | undefined => {
    return cachedDbStats.get(dbId);
  }, [cachedDbStats]);

  return { cachedDbStats, updateCache, getStats };
}

/**
 * Clear all cached data
 */
export function clearAllCache(): void {
  const keys = Object.keys(localStorage).filter(key => key.startsWith(CACHE_PREFIX));
  keys.forEach(key => localStorage.removeItem(key));
}
