/**
 * DuckDB Migration Queries
 */

/**
 * Create the schema_migrations table if not exists
 */
export const DUCKDB_CREATE_MIGRATION_TABLE = `
  CREATE TABLE IF NOT EXISTS schema_migrations (
    version VARCHAR(255) PRIMARY KEY,
    name VARCHAR(255) NOT NULL,
    applied_at TIMESTAMP NOT NULL DEFAULT current_timestamp,
    checksum VARCHAR(64) NOT NULL
  );
`;

/**
 * Check if any migrations exist
 */
export const DUCKDB_CHECK_MIGRATIONS_EXIST = `SELECT 1 FROM schema_migrations LIMIT 1;`;

/**
 * Insert a migration record
 */
export const DUCKDB_INSERT_MIGRATION = `
  INSERT INTO schema_migrations (version, name, checksum)
  VALUES (?, ?, ?);
`;

/**
 * List all applied migrations ordered by version
 */
export const DUCKDB_LIST_APPLIED_MIGRATIONS = `
  SELECT version, name, applied_at, checksum
  FROM schema_migrations
  ORDER BY version;
`;

/**
 * Delete a migration record by version
 */
export const DUCKDB_DELETE_MIGRATION = `
  DELETE FROM schema_migrations WHERE version = ?;
`;
