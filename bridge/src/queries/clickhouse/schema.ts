/**
 * ClickHouse Schema-related Queries
 */

/**
 * List all user databases/schemas (excludes internal system schemas).
 */
export const CLICKHOUSE_LIST_SCHEMAS = `
  SELECT name
  FROM system.databases
  WHERE name NOT IN ('system', 'information_schema', 'INFORMATION_SCHEMA')
  ORDER BY name;
`;

/**
 * List all tables across all non-system databases.
 */
export const CLICKHOUSE_LIST_TABLES = `
  SELECT
    database AS schema,
    name,
    if(engine LIKE '%View%', 'VIEW', 'BASE TABLE') AS type
  FROM system.tables
  WHERE database NOT IN ('system', 'information_schema', 'INFORMATION_SCHEMA')
  ORDER BY database, name;
`;

/**
 * List tables filtered by schema/database.
 */
export const CLICKHOUSE_LIST_TABLES_BY_SCHEMA = `
  SELECT
    database AS schema,
    name,
    if(engine LIKE '%View%', 'VIEW', 'BASE TABLE') AS type
  FROM system.tables
  WHERE database = {schema: String}
  ORDER BY name;
`;

/**
 * List all column details for a specific table.
 */
export const CLICKHOUSE_LIST_COLUMNS = `
  SELECT
    name,
    type,
    if(type LIKE 'Nullable(%)', 0, 1) AS not_nullable,
    default_expression AS default_value,
    is_in_primary_key,
    is_in_sorting_key,
    comment
  FROM system.columns
  WHERE database = {schema: String} AND table = {table: String}
  ORDER BY position;
`;

/**
 * Batch query column details for multiple tables.
 */
export const CLICKHOUSE_BATCH_LIST_COLUMNS = `
  SELECT
    database AS schema,
    table,
    name,
    type,
    if(type LIKE 'Nullable(%)', 0, 1) AS not_nullable,
    default_expression AS default_value,
    is_in_primary_key,
    is_in_sorting_key,
    comment
  FROM system.columns
  WHERE database = {schema: String}
  ORDER BY table, position;
`;
