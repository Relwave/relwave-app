/**
 * MySQL Schema-related Queries
 */

/**
 * List all schemas (databases) excluding system schemas
 */
export const LIST_SCHEMAS = `
  SELECT
    schema_name AS name
  FROM
    information_schema.schemata
  WHERE
    schema_name NOT IN ('information_schema', 'mysql', 'performance_schema', 'sys')
  ORDER BY
    schema_name;
`;

/**
 * List tables for a specific schema
 * @param schemaName - Use ? placeholder
 */
export const LIST_TABLES_BY_SCHEMA = `
  SELECT 
    table_schema AS \`schema\`, 
    table_name AS name, 
    table_type AS type 
  FROM 
    information_schema.tables
  WHERE 
    table_schema = ?
    AND table_type IN ('BASE TABLE', 'VIEW')
  ORDER BY table_name;
`;

/**
 * List tables for current database
 */
export const LIST_TABLES_CURRENT_DB = `
  SELECT 
    table_schema AS \`schema\`, 
    table_name AS name, 
    table_type AS type 
  FROM 
    information_schema.tables
  WHERE 
    table_schema = DATABASE()
    AND table_type IN ('BASE TABLE', 'VIEW')
  ORDER BY table_name;
`;
