/**
 * MySQL Constraint-related Queries
 */

/**
 * Get primary key columns for a table
 * @params schemaName, tableName - Use ? placeholders
 */
export const GET_PRIMARY_KEYS = `
  SELECT COLUMN_NAME
  FROM information_schema.COLUMNS
  WHERE TABLE_SCHEMA = ?
    AND TABLE_NAME = ?
    AND COLUMN_KEY = 'PRI';
`;

/**
 * Get all primary keys in a schema (batch)
 * @param schemaName - Use ? placeholder
 */
export const BATCH_GET_PRIMARY_KEYS = `
  SELECT 
    tc.TABLE_NAME AS table_name,
    kcu.COLUMN_NAME AS column_name,
    kcu.ORDINAL_POSITION AS ordinal_position
  FROM information_schema.table_constraints tc
  JOIN information_schema.key_column_usage kcu
    ON tc.CONSTRAINT_NAME = kcu.CONSTRAINT_NAME 
    AND tc.TABLE_SCHEMA = kcu.TABLE_SCHEMA
    AND tc.TABLE_NAME = kcu.TABLE_NAME
  WHERE tc.CONSTRAINT_TYPE = 'PRIMARY KEY' AND tc.TABLE_SCHEMA = ?
  ORDER BY tc.TABLE_NAME, kcu.ORDINAL_POSITION;
`;

/**
 * Get all foreign keys in a schema (batch)
 * @param schemaName - Use ? placeholder
 */
export const BATCH_GET_FOREIGN_KEYS = `
  SELECT
    tc.CONSTRAINT_NAME AS constraint_name,
    kcu.TABLE_SCHEMA AS source_schema,
    kcu.TABLE_NAME AS source_table,
    kcu.COLUMN_NAME AS source_column,
    kcu.REFERENCED_TABLE_SCHEMA AS target_schema,
    kcu.REFERENCED_TABLE_NAME AS target_table,
    kcu.REFERENCED_COLUMN_NAME AS target_column,
    rc.UPDATE_RULE AS update_rule,
    rc.DELETE_RULE AS delete_rule,
    kcu.ORDINAL_POSITION AS ordinal_position
  FROM information_schema.table_constraints tc
  JOIN information_schema.key_column_usage kcu
    ON tc.CONSTRAINT_NAME = kcu.CONSTRAINT_NAME 
    AND tc.TABLE_SCHEMA = kcu.TABLE_SCHEMA
    AND tc.TABLE_NAME = kcu.TABLE_NAME
  JOIN information_schema.referential_constraints rc
    ON rc.CONSTRAINT_NAME = tc.CONSTRAINT_NAME
    AND rc.CONSTRAINT_SCHEMA = tc.TABLE_SCHEMA
  WHERE tc.CONSTRAINT_TYPE = 'FOREIGN KEY' AND tc.TABLE_SCHEMA = ?
  ORDER BY kcu.TABLE_NAME, tc.CONSTRAINT_NAME, kcu.ORDINAL_POSITION;
`;

/**
 * Get all indexes in a schema (batch)
 * @param schemaName - Use ? placeholder
 */
export const BATCH_GET_INDEXES = `
  SELECT
    s.TABLE_NAME AS table_name,
    s.INDEX_NAME AS index_name,
    s.COLUMN_NAME AS column_name,
    (s.NON_UNIQUE = 0) AS is_unique,
    (s.INDEX_NAME = 'PRIMARY') AS is_primary,
    s.INDEX_TYPE AS index_type,
    s.SEQ_IN_INDEX AS seq_in_index
  FROM information_schema.statistics s
  WHERE s.TABLE_SCHEMA = ?
  ORDER BY s.TABLE_NAME, s.INDEX_NAME, s.SEQ_IN_INDEX;
`;

/**
 * Get all unique constraints in a schema (batch)
 * @param schemaName - Use ? placeholder
 */
export const BATCH_GET_UNIQUE_CONSTRAINTS = `
  SELECT
    tc.CONSTRAINT_NAME AS constraint_name,
    tc.TABLE_SCHEMA AS table_schema,
    tc.TABLE_NAME AS table_name,
    kcu.COLUMN_NAME AS column_name,
    kcu.ORDINAL_POSITION AS ordinal_position
  FROM information_schema.table_constraints tc
  JOIN information_schema.key_column_usage kcu
    ON tc.CONSTRAINT_NAME = kcu.CONSTRAINT_NAME 
    AND tc.TABLE_SCHEMA = kcu.TABLE_SCHEMA
    AND tc.TABLE_NAME = kcu.TABLE_NAME
  WHERE tc.CONSTRAINT_TYPE = 'UNIQUE' AND tc.TABLE_SCHEMA = ?
  ORDER BY tc.TABLE_NAME, tc.CONSTRAINT_NAME, kcu.ORDINAL_POSITION;
`;

/**
 * Get all check constraints in a schema (MySQL 8.0.16+)
 * @param schemaName - Use ? placeholder
 */
export const BATCH_GET_CHECK_CONSTRAINTS = `
  SELECT
    cc.CONSTRAINT_NAME AS constraint_name,
    tc.TABLE_SCHEMA AS table_schema,
    tc.TABLE_NAME AS table_name,
    cc.CHECK_CLAUSE AS check_clause
  FROM information_schema.check_constraints cc
  JOIN information_schema.table_constraints tc
    ON cc.CONSTRAINT_NAME = tc.CONSTRAINT_NAME
    AND cc.CONSTRAINT_SCHEMA = tc.TABLE_SCHEMA
  WHERE tc.TABLE_SCHEMA = ? AND tc.CONSTRAINT_TYPE = 'CHECK';
`;
