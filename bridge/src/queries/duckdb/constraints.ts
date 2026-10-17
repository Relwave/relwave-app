/**
 * DuckDB Constraint & Index Queries
 */

/**
 * List primary key columns for a table.
 * Uses standard information_schema — works in native DuckDB and attached SQLite.
 * @param schemaName - Use ? placeholder
 * @param tableName  - Use ? placeholder
 */
export const DUCKDB_LIST_PRIMARY_KEYS = `
  SELECT kcu.column_name
  FROM information_schema.table_constraints tc
  JOIN information_schema.key_column_usage kcu
    ON tc.constraint_name = kcu.constraint_name
    AND tc.table_schema = kcu.table_schema
    AND tc.table_name = kcu.table_name
  WHERE tc.constraint_type = 'PRIMARY KEY'
    AND tc.table_schema = ?
    AND tc.table_name = ?
  ORDER BY kcu.ordinal_position;
`;

/**
 * List foreign keys for a table using duckdb_constraints().
 * NOTE: DuckDB's FK support in information_schema is limited;
 * duckdb_constraints() is the reliable native source.
 * Falls back to empty on attached SQLite catalogs gracefully.
 * @param schemaName - Use ? placeholder
 * @param tableName  - Use ? placeholder
 */
export const DUCKDB_LIST_FOREIGN_KEYS = `
  SELECT constraint_text
  FROM duckdb_constraints()
  WHERE schema_name = ?
    AND table_name = ?
    AND constraint_type = 'FOREIGN KEY';
`;

/**
 * List indexes for a table using duckdb_indexes().
 * @param schemaName - Use ? placeholder
 * @param tableName  - Use ? placeholder
 */
export const DUCKDB_LIST_INDEXES = `
  SELECT index_name, is_unique
  FROM duckdb_indexes()
  WHERE schema_name = ?
    AND table_name = ?;
`;

/**
 * List unique constraints for a table via information_schema.
 * @param schemaName - Use ? placeholder
 * @param tableName  - Use ? placeholder
 */
export const DUCKDB_LIST_UNIQUE_CONSTRAINTS = `
  SELECT kcu.constraint_name, kcu.column_name, kcu.ordinal_position
  FROM information_schema.table_constraints tc
  JOIN information_schema.key_column_usage kcu
    ON tc.constraint_name = kcu.constraint_name
    AND tc.table_schema = kcu.table_schema
    AND tc.table_name = kcu.table_name
  WHERE tc.constraint_type = 'UNIQUE'
    AND tc.table_schema = ?
    AND tc.table_name = ?;
`;

/**
 * List check constraints for a table using duckdb_constraints().
 * @param schemaName - Use ? placeholder
 * @param tableName  - Use ? placeholder
 */
export const DUCKDB_LIST_CHECK_CONSTRAINTS = `
  SELECT constraint_text AS definition
  FROM duckdb_constraints()
  WHERE schema_name = ?
    AND table_name = ?
    AND constraint_type = 'CHECK';
`;
