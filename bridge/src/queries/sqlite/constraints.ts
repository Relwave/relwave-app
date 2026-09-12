/**
 * SQLite Constraint-related Queries
 *
 * SQLite uses PRAGMA commands for constraint introspection.
 * Most constraint info is retrieved via:
 * - PRAGMA table_xinfo() for primary keys and column constraints
 * - PRAGMA foreign_key_list() for foreign keys
 * - PRAGMA index_list() + PRAGMA index_info() for indexes/unique constraints
 * - sqlite_master SQL parsing for check constraints
 */

/**
 * Get check constraints by parsing CREATE TABLE SQL from sqlite_master
 * This is a best-effort approach since SQLite doesn't have a dedicated
 * check constraint introspection mechanism.
 */
export const SQLITE_GET_TABLE_SQL = `
  SELECT sql FROM sqlite_master
  WHERE type = 'table' AND name = ?;
`;
