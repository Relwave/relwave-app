/**
 * Cache Types and Configuration
 * Shared caching infrastructure for all database connectors
 */

// Cache configuration constants
export const CACHE_TTL = 60000; // 1 minute default TTL
export const STATS_CACHE_TTL = 30000; // 30 seconds for stats (changes more frequently)
export const SCHEMA_CACHE_TTL = 300000; // 5 minutes for schemas (rarely change)

/**
 * Generic cache entry with TTL support
 */
export type CacheEntry<T> = {
    data: T;
    timestamp: number;
    ttl: number;
};
