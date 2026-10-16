/**
 * ClickHouse Statistics Queries
 */

/**
 * Get total tables and total rows for a database.
 */
export const CLICKHOUSE_GET_DB_STATS = `
  SELECT
    count() AS total_tables,
    coalesce(sum(total_rows), 0) AS total_rows
  FROM system.tables
  WHERE database = {database: String};
`;

/**
 * Get active data size on disk in MB for a database.
 */
export const CLICKHOUSE_GET_DB_SIZE = `
  SELECT
    coalesce(round(sum(bytes_on_disk) / (1024 * 1024), 2), 0) AS total_db_size_mb
  FROM system.parts
  WHERE database = {database: String} AND active = 1;
`;
