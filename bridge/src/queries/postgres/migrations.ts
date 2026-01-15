/**
 * PostgreSQL Migration Queries
 */

/**
 * Create the schema_migrations table if not exists
 */
export const PG_CREATE_MIGRATION_TABLE = `
  CREATE TABLE IF NOT EXISTS schema_migrations (
    version VARCHAR(14) PRIMARY KEY,
    name VARCHAR(255) NOT NULL,
    applied_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    checksum VARCHAR(64) NOT NULL
  );
`;

/**
 * Check if any migrations exist
 */
export const PG_CHECK_MIGRATIONS_EXIST = `SELECT 1 FROM schema_migrations LIMIT 1;`;

/**
 * Insert a migration record
 * @params version, name, checksum - Use $1, $2, $3 placeholders
 */
export const PG_INSERT_MIGRATION = `
  INSERT INTO schema_migrations (version, name, checksum)
  VALUES ($1, $2, $3);
`;

/**
 * List all applied migrations ordered by version
 */
export const PG_LIST_APPLIED_MIGRATIONS = `
  SELECT version, name, applied_at, checksum
  FROM schema_migrations
  ORDER BY version;
`;

/**
 * Delete a migration record by version
 * @param version - Use $1 placeholder
 */
export const PG_DELETE_MIGRATION = `
  DELETE FROM schema_migrations WHERE version = $1;
`;
