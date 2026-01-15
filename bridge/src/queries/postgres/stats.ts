/**
 * PostgreSQL Statistics Queries
 */

/**
 * Get database statistics (table count, size, row count)
 */
export const PG_GET_DB_STATS = `
  SELECT
    (SELECT COUNT(*) 
     FROM information_schema.tables
     WHERE table_schema = current_schema() AND table_type = 'BASE TABLE') AS total_tables,
    (SELECT COALESCE(SUM(n_live_tup), 0)
     FROM pg_stat_user_tables 
     WHERE schemaname = current_schema()) AS total_rows,
    (pg_database_size(current_database()) / (1024.0 * 1024.0)) AS total_db_size_mb;
`;

/**
 * Get detailed table statistics
 * @param schemaName - Use $1 placeholder
 */
export const PG_GET_TABLE_STATS = `
  SELECT
    schemaname,
    relname AS table_name,
    n_live_tup AS row_count,
    n_dead_tup AS dead_rows,
    last_vacuum,
    last_autovacuum,
    last_analyze,
    last_autoanalyze
  FROM pg_stat_user_tables
  WHERE schemaname = $1
  ORDER BY relname;
`;

/**
 * Get table size information
 * @param schemaName - Use $1 placeholder
 */
export const PG_GET_TABLE_SIZES = `
  SELECT
    schemaname,
    tablename,
    pg_size_pretty(pg_total_relation_size(schemaname || '.' || tablename)) AS total_size,
    pg_size_pretty(pg_relation_size(schemaname || '.' || tablename)) AS table_size,
    pg_size_pretty(pg_indexes_size(schemaname || '.' || tablename)) AS indexes_size
  FROM pg_tables
  WHERE schemaname = $1
  ORDER BY pg_total_relation_size(schemaname || '.' || tablename) DESC;
`;
