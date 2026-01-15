/**
 * MySQL Table-related Queries
 */

/**
 * Get detailed column information for a table
 * @params schemaName, tableName - Use ? placeholders
 */
export const GET_TABLE_DETAILS = `
  SELECT
    c.COLUMN_NAME AS name,
    c.DATA_TYPE AS type,
    (c.IS_NULLABLE = 'NO') AS not_nullable,
    c.COLUMN_DEFAULT AS default_value,
    (c.COLUMN_KEY = 'PRI') AS is_primary_key,
    EXISTS (
      SELECT 1
      FROM information_schema.key_column_usage kcu
      JOIN information_schema.table_constraints tc 
        ON tc.CONSTRAINT_NAME = kcu.CONSTRAINT_NAME
        AND tc.TABLE_SCHEMA = kcu.TABLE_SCHEMA
        AND tc.TABLE_NAME = kcu.TABLE_NAME
      WHERE
        tc.CONSTRAINT_TYPE = 'FOREIGN KEY'
        AND kcu.TABLE_SCHEMA = c.TABLE_SCHEMA
        AND kcu.TABLE_NAME = c.TABLE_NAME
        AND kcu.COLUMN_NAME = c.COLUMN_NAME
    ) AS is_foreign_key
  FROM
    information_schema.columns c
  WHERE
    c.TABLE_SCHEMA = ? AND c.TABLE_NAME = ?
  ORDER BY
    c.ORDINAL_POSITION;
`;

/**
 * Get basic column info (name and data type)
 * @params schemaName, tableName - Use ? placeholders
 */
export const LIST_COLUMNS = `
  SELECT 
    column_name, 
    data_type 
  FROM 
    information_schema.columns 
  WHERE 
    table_schema = ? AND table_name = ?
  ORDER BY 
    ordinal_position;
`;

/**
 * Kill a running query by connection ID
 * @param connectionId - Use ? placeholder
 */
export const KILL_QUERY = `KILL QUERY ?`;

/**
 * Get current connection ID
 */
export const GET_CONNECTION_ID = `SELECT CONNECTION_ID() AS pid`;
