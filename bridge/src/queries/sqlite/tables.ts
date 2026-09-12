/**
 * SQLite Table-related Queries (PRAGMA-based)
 *
 * Note: SQLite uses PRAGMA table_info() and PRAGMA table_xinfo()
 * for column introspection. These are executed programmatically
 * in the connector since they require table name interpolation.
 */

/**
 * Get column information for a table via PRAGMA
 * Usage: PRAGMA table_xinfo('tableName')
 * Returns: cid, name, type, notnull, dflt_value, pk
 */
export const SQLITE_TABLE_INFO_PRAGMA = "table_xinfo";

/**
 * Get foreign key information for a table via PRAGMA
 * Usage: PRAGMA foreign_key_list('tableName')
 * Returns: id, seq, table, from, to, on_update, on_delete, match
 */
export const SQLITE_FOREIGN_KEY_PRAGMA = "foreign_key_list";

/**
 * Get index list for a table via PRAGMA
 * Usage: PRAGMA index_list('tableName')
 * Returns: seq, name, unique, origin, partial
 */
export const SQLITE_INDEX_LIST_PRAGMA = "index_list";

/**
 * Get columns in an index via PRAGMA
 * Usage: PRAGMA index_info('indexName')
 * Returns: seqno, cid, name
 */
export const SQLITE_INDEX_INFO_PRAGMA = "index_info";
