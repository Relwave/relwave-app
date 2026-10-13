/**
 * DuckDB Schema-related Queries
 */

/**
 * List all user schemas (excludes internal DuckDB system schemas).
 */
export const DUCKDB_LIST_SCHEMAS = `
  SELECT DISTINCT schema_name AS name
  FROM information_schema.schemata
  WHERE schema_name NOT IN ('information_schema', 'pg_catalog', 'system')
  ORDER BY schema_name;
`;

/**
 * List all base tables across all non-system schemas.
 * DuckDB uses 'BASE TABLE' as table_type.
 */
export const DUCKDB_LIST_TABLES = `
  SELECT table_schema AS schema, table_name AS name, table_type AS type
  FROM information_schema.tables
  WHERE table_schema NOT IN ('information_schema', 'pg_catalog', 'system')
    AND table_type = 'BASE TABLE'
  ORDER BY table_schema, table_name;
`;

/**
 * List tables filtered by schema.
 * @param schemaName - Use ? placeholder
 */
export const DUCKDB_LIST_TABLES_BY_SCHEMA = `
  SELECT table_schema AS schema, table_name AS name, table_type AS type
  FROM information_schema.tables
  WHERE table_schema NOT IN ('information_schema', 'pg_catalog', 'system')
    AND table_type = 'BASE TABLE'
    AND table_schema = ?
  ORDER BY table_schema, table_name;
`;

/**
 * List all column details for a specific table.
 * NOTE: In DuckDB, is_nullable is a VARCHAR ('YES'/'NO'), not a boolean.
 * We cast it explicitly so the result is a proper boolean.
 * @param schemaName - Use ? placeholder
 * @param tableName  - Use ? placeholder
 */
export const DUCKDB_LIST_COLUMNS = `
  SELECT
    column_name AS name,
    data_type AS type,
    CASE WHEN is_nullable = 'NO' THEN TRUE ELSE FALSE END AS not_nullable,
    column_default AS default_value
  FROM information_schema.columns
  WHERE table_schema = ? AND table_name = ?
  ORDER BY ordinal_position;
`;
