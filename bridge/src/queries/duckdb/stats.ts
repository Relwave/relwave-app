/**
 * DuckDB Stats Queries
 */

/**
 * Count base tables, excluding system schemas.
 * Uses information_schema which is always available in DuckDB.
 */
export const DUCKDB_COUNT_TABLES = `
  SELECT COUNT(*) AS total_tables
  FROM information_schema.tables
  WHERE table_type = 'BASE TABLE'
    AND table_schema NOT IN ('information_schema', 'pg_catalog', 'system');
`;

/**
 * Estimate database size using duckdb_memory_usage().
 * Returns memory_usage_bytes as a single row.
 * NOTE: PRAGMA database_size is NOT supported in DuckDB.
 */
export const DUCKDB_DATABASE_SIZE = `
  SELECT memory_usage AS memory_usage
  FROM duckdb_memory_usage()
  LIMIT 1;
`;
