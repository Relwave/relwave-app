import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { bridgeApi } from "@/services/bridgeApi";
import { DatabaseConnection, TableInfo, DatabaseStats } from "@/types/database";
import { isBridgeReady } from "@/services/bridgeClient";

// ============================================
// Query Keys - Centralized for cache management
// ============================================
export const queryKeys = {
  // Database connections
  databases: ["databases"] as const,
  database: (id: string) => ["databases", id] as const,

  // Tables
  tables: (dbId: string, schema?: string) => ["tables", dbId, schema || "all"] as const,
  tableData: (dbId: string, schema: string, table: string, page: number, pageSize: number) =>
    ["tableData", dbId, schema, table, page, pageSize] as const,

  // Database metadata
  stats: (dbId: string) => ["stats", dbId] as const,
  schemas: (dbId: string) => ["schemas", dbId] as const,
  tableDetails: (dbId: string, schema: string, table: string) =>
    ["tableDetails", dbId, schema, table] as const,
  primaryKeys: (dbId: string, schema: string, table: string) =>
    ["primaryKeys", dbId, schema, table] as const,
};

// ============================================
// Stale Time Configuration (client-side cache TTL)
// ============================================
const STALE_TIMES = {
  databases: 5 * 60 * 1000,      // 5 minutes - connection list rarely changes
  tables: 60 * 1000,             // 1 minute - table list
  tableData: 30 * 1000,          // 30 seconds - actual data
  stats: 30 * 1000,              // 30 seconds - database stats
  schemas: 5 * 60 * 1000,        // 5 minutes - schemas rarely change
  tableDetails: 60 * 1000,       // 1 minute - column info
};

// ============================================
// Database Connection Hooks
// ============================================

/**
 * Fetch all database connections
 * - Cached for 5 minutes
 * - Background refetch on window focus
 */
export function useDatabases() {
  const queryClient = useQueryClient();
  const bridgeReady = queryClient.getQueryData<boolean>(["bridge-ready"]) ?? isBridgeReady();

  return useQuery({
    queryKey: queryKeys.databases,
    queryFn: () => bridgeApi.listDatabases(),
    staleTime: STALE_TIMES.databases,
    gcTime: 10 * 60 * 1000, // Keep in cache for 10 minutes
    enabled: bridgeReady, // Only fetch when bridge is ready
  });
}

/**
 * Fetch a single database connection by ID
 */
export function useDatabase(id: string | undefined) {
  return useQuery({
    queryKey: queryKeys.database(id!),
    queryFn: () => bridgeApi.getDatabase(id!),
    enabled: !!id,
    staleTime: STALE_TIMES.databases,
  });
}

/**
 * Fetch migrations data for a database
 */
export function useMigrations(dbId: string | undefined) {
  return useQuery({
    queryKey: ["migrations", dbId] as const,
    queryFn: () => bridgeApi.getMigrations(dbId!),
    enabled: !!dbId,
    staleTime: 30 * 1000, // 30 seconds
    gcTime: 5 * 60 * 1000,
  });
}

// ============================================
// Table Hooks
// ============================================

/**
 * Fetch tables for a database
 * - Returns cached data instantly if available
 * - Background refetch if stale
 */
export function useTables(dbId: string | undefined, schema?: string) {
  return useQuery({
    queryKey: queryKeys.tables(dbId!, schema),
    queryFn: async () => {
      const result = await bridgeApi.listTables(dbId!, schema);
      return result.map((item: any): TableInfo => ({
        schema: item.schema || "public",
        name: item.name || "unknown",
        type: item.type || "table",
      }));
    },
    enabled: !!dbId,
    staleTime: STALE_TIMES.tables,
    gcTime: 5 * 60 * 1000,
  });
}

/**
 * Fetch schema names for a database
 */
export function useSchemaNames(dbId: string | undefined) {
  return useQuery({
    queryKey: ["schemaNames", dbId] as const,
    queryFn: () => bridgeApi.listSchemas(dbId!),
    enabled: !!dbId,
    staleTime: STALE_TIMES.schemas,
  });
}

/**
 * Fetch paginated table data
 * - Each page is cached separately
 * - Supports prefetching next page
 */
export function useTableData(
  dbId: string | undefined,
  schema: string | undefined,
  table: string | undefined,
  page: number = 1,
  pageSize: number = 50
) {
  return useQuery({
    queryKey: queryKeys.tableData(dbId!, schema!, table!, page, pageSize),
    queryFn: () => bridgeApi.fetchTableData(dbId!, schema!, table!, pageSize, page),
    enabled: !!dbId && !!schema && !!table,
    staleTime: STALE_TIMES.tableData,
    placeholderData: (previousData) => previousData, // Keep showing old data while fetching
  });
}

// ============================================
// Database Metadata Hooks
// ============================================

/**
 * Fetch database statistics
 * - Short cache time since stats change frequently
 */
export function useDbStats(dbId: string | undefined) {
  return useQuery({
    queryKey: queryKeys.stats(dbId!),
    queryFn: () => bridgeApi.getDataBaseStats(dbId!),
    enabled: !!dbId,
    staleTime: STALE_TIMES.stats,
    refetchInterval: 60 * 1000, // Auto-refresh every minute
  });
}

/**
 * Fetch schemas for a database
 */
export function useSchemas(dbId: string | undefined) {
  return useQuery({
    queryKey: queryKeys.schemas(dbId!),
    queryFn: () => bridgeApi.getSchema(dbId!),
    enabled: !!dbId,
    staleTime: STALE_TIMES.schemas,
  });
}

/**
 * Fetch full database schema with tables and columns (for ER diagrams, Schema Explorer)
 * - Longer cache time since schema structure rarely changes
 */
export function useFullSchema(dbId: string | undefined) {
  const queryClient = useQueryClient();
  const bridgeReady = queryClient.getQueryData<boolean>(["bridge-ready"]) ?? isBridgeReady();

  return useQuery({
    queryKey: ["fullSchema", dbId] as const,
    queryFn: () => bridgeApi.getSchema(dbId!),
    enabled: !!dbId && bridgeReady,
    staleTime: STALE_TIMES.schemas, // 5 minutes - schema structure rarely changes
    gcTime: 10 * 60 * 1000, // Keep in cache for 10 minutes
  });
}

/**
 * Fetch primary keys for a table
 */
export function usePrimaryKeys(
  dbId: string | undefined,
  schema: string | undefined,
  table: string | undefined
) {
  return useQuery({
    queryKey: queryKeys.primaryKeys(dbId!, schema!, table!),
    queryFn: () => bridgeApi.getPrimaryKeys(dbId!, schema!, table!),
    enabled: !!dbId && !!schema && !!table,
    staleTime: STALE_TIMES.tableDetails,
  });
}

// ============================================
// Mutation Hooks (with cache invalidation)
// ============================================

/**
 * Add a new database connection
 * - Invalidates database list cache on success
 */
export function useAddDatabase() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: bridgeApi.addDatabase.bind(bridgeApi),
    onSuccess: () => {
      // Invalidate and refetch database list
      queryClient.invalidateQueries({ queryKey: queryKeys.databases });
    },
  });
}

/**
 * Update a database connection
 */
export function useUpdateDatabase() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (params: any) => bridgeApi.updateDatabase(params),
    onSuccess: (_, params) => {
      queryClient.invalidateQueries({ queryKey: queryKeys.databases });
      if (params.id) {
        queryClient.invalidateQueries({ queryKey: queryKeys.database(params.id) });
      }
    },
  });
}

/**
 * Delete a database connection
 */
export function useDeleteDatabase() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (id: string) => bridgeApi.deleteDatabase(id),
    onSuccess: (_, id) => {
      queryClient.invalidateQueries({ queryKey: queryKeys.databases });
      // Remove all cached data for this database
      queryClient.removeQueries({ queryKey: queryKeys.tables(id) });
      queryClient.removeQueries({ queryKey: queryKeys.stats(id) });
    },
  });
}

/**
 * Test database connection
 */
export function useTestConnection() {
  return useMutation({
    mutationFn: bridgeApi.testConnection.bind(bridgeApi),
  });
}

// ============================================
// Prefetch Utilities
// ============================================

/**
 * Hook to prefetch data for better UX
 */
export function usePrefetch() {
  const queryClient = useQueryClient();

  return {
    /**
     * Prefetch tables when hovering over a database card
     */
    prefetchTables: (dbId: string) => {
      queryClient.prefetchQuery({
        queryKey: queryKeys.tables(dbId),
        queryFn: () => bridgeApi.listTables(dbId),
        staleTime: STALE_TIMES.tables,
      });
    },

    /**
     * Prefetch next page of table data
     */
    prefetchNextPage: (
      dbId: string,
      schema: string,
      table: string,
      currentPage: number,
      pageSize: number
    ) => {
      queryClient.prefetchQuery({
        queryKey: queryKeys.tableData(dbId, schema, table, currentPage + 1, pageSize),
        queryFn: () => bridgeApi.fetchTableData(dbId, schema, table, pageSize, currentPage + 1),
        staleTime: STALE_TIMES.tableData,
      });
    },

    /**
     * Prefetch database stats
     */
    prefetchStats: (dbId: string) => {
      queryClient.prefetchQuery({
        queryKey: queryKeys.stats(dbId),
        queryFn: () => bridgeApi.getDataBaseStats(dbId),
        staleTime: STALE_TIMES.stats,
      });
    },

    /**
     * Prefetch full schema for ER diagram / Schema Explorer
     */
    prefetchSchema: (dbId: string) => {
      queryClient.prefetchQuery({
        queryKey: ["fullSchema", dbId],
        queryFn: () => bridgeApi.getSchema(dbId),
        staleTime: STALE_TIMES.schemas,
      });
    },
  };
}

// ============================================
// Cache Invalidation Utilities
// ============================================

/**
 * Hook to manually invalidate caches
 */
export function useInvalidateCache() {
  const queryClient = useQueryClient();

  return {
    /** Invalidate all caches for a database */
    invalidateDatabase: (dbId: string) => {
      queryClient.invalidateQueries({ queryKey: queryKeys.tables(dbId) });
      queryClient.invalidateQueries({ queryKey: queryKeys.stats(dbId) });
      queryClient.invalidateQueries({ queryKey: queryKeys.schemas(dbId) });
      queryClient.invalidateQueries({ queryKey: ["fullSchema", dbId] }); // Also invalidate fullSchema
    },

    /** Invalidate table-specific caches */
    invalidateTable: (dbId: string, schema: string, table: string) => {
      queryClient.invalidateQueries({
        queryKey: queryKeys.tableDetails(dbId, schema, table),
      });
      queryClient.invalidateQueries({
        queryKey: queryKeys.primaryKeys(dbId, schema, table),
      });
      // Invalidate all pages for this table
      queryClient.invalidateQueries({
        queryKey: ["tableData", dbId, schema, table],
      });
    },

    /** Force refresh all data */
    invalidateAll: () => {
      queryClient.invalidateQueries();
    },
  };
}
