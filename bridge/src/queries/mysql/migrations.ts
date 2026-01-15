/**
 * MySQL Migration Queries
 */

/**
 * Create the schema_migrations table if not exists
 */
export const CREATE_MIGRATION_TABLE = `
  CREATE TABLE IF NOT EXISTS schema_migrations (
    version VARCHAR(14) PRIMARY KEY,
    name VARCHAR(255) NOT NULL,
    applied_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    checksum VARCHAR(64) NOT NULL
  ) ENGINE=InnoDB;
`;

/**
 * Check if any migrations exist
 */
export const CHECK_MIGRATIONS_EXIST = `SELECT 1 FROM schema_migrations LIMIT 1;`;

/**
 * Insert a migration record
 * @params version, name, checksum - Use ? placeholders
 */
export const INSERT_MIGRATION = `
  INSERT INTO schema_migrations (version, name, checksum)
  VALUES (?, ?, ?);
`;

/**
 * List all applied migrations ordered by version
 */
export const LIST_APPLIED_MIGRATIONS = `
  SELECT version, name, applied_at, checksum
  FROM schema_migrations
  ORDER BY version;
`;

/**
 * Delete a migration record by version
 * @param version - Use ? placeholder
 */
export const DELETE_MIGRATION = `
  DELETE FROM schema_migrations WHERE version = ?;
`;
