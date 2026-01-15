/**
 * MySQL Column-related Queries (Batch Operations)
 */

/**
 * Get all columns in a schema with PK/FK info (batch query)
 * @param schemaName - Use ? placeholder (appears twice)
 */
export const BATCH_GET_ALL_COLUMNS = `
  SELECT 
    c.TABLE_NAME AS table_name,
    c.COLUMN_NAME AS name,
    c.DATA_TYPE AS type,
    (c.IS_NULLABLE = 'NO') AS not_nullable,
    c.COLUMN_DEFAULT AS default_value,
    c.ORDINAL_POSITION AS ordinal_position,
    c.CHARACTER_MAXIMUM_LENGTH AS max_length,
    (c.COLUMN_KEY = 'PRI') AS is_primary_key,
    CASE WHEN fk.COLUMN_NAME IS NOT NULL THEN TRUE ELSE FALSE END AS is_foreign_key
  FROM information_schema.columns c
  LEFT JOIN (
    SELECT DISTINCT kcu.TABLE_SCHEMA, kcu.TABLE_NAME, kcu.COLUMN_NAME
    FROM information_schema.table_constraints tc
    JOIN information_schema.key_column_usage kcu 
      ON tc.CONSTRAINT_NAME = kcu.CONSTRAINT_NAME 
      AND tc.TABLE_SCHEMA = kcu.TABLE_SCHEMA
    WHERE tc.CONSTRAINT_TYPE = 'FOREIGN KEY' AND tc.TABLE_SCHEMA = ?
  ) fk ON c.TABLE_SCHEMA = fk.TABLE_SCHEMA 
    AND c.TABLE_NAME = fk.TABLE_NAME 
    AND c.COLUMN_NAME = fk.COLUMN_NAME
  WHERE c.TABLE_SCHEMA = ?
  ORDER BY c.TABLE_NAME, c.ORDINAL_POSITION;
`;

/**
 * Get all enum columns in a schema
 * @param schemaName - Use ? placeholder
 */
export const BATCH_GET_ENUM_COLUMNS = `
  SELECT
    TABLE_NAME AS table_name,
    COLUMN_NAME AS column_name,
    COLUMN_TYPE AS column_type
  FROM information_schema.columns
  WHERE TABLE_SCHEMA = ? AND DATA_TYPE = 'enum'
  ORDER BY TABLE_NAME, COLUMN_NAME;
`;

/**
 * Get all auto_increment columns in a schema
 * @param schemaName - Use ? placeholder
 */
export const BATCH_GET_AUTO_INCREMENTS = `
  SELECT
    c.TABLE_NAME AS table_name,
    c.COLUMN_NAME AS column_name,
    t.AUTO_INCREMENT AS auto_increment_value
  FROM information_schema.columns c
  JOIN information_schema.tables t 
    ON c.TABLE_SCHEMA = t.TABLE_SCHEMA AND c.TABLE_NAME = t.TABLE_NAME
  WHERE c.TABLE_SCHEMA = ? AND c.EXTRA LIKE '%auto_increment%'
  ORDER BY c.TABLE_NAME;
`;
