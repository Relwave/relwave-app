/**
 * MySQL Statistics Queries
 */

/**
 * Get database statistics (table count, size, row count)
 */
export const GET_DB_STATS = `
  SELECT
    COUNT(*) AS total_tables,
    SUM(table_rows) AS total_rows,
    COALESCE(
      ROUND(SUM(data_length + index_length) / (1024 * 1024), 2),
      0
    ) AS total_db_size_mb
  FROM 
    information_schema.tables
  WHERE 
    table_schema = DATABASE() 
    AND table_type = 'BASE TABLE';
`;
