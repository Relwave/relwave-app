/**
 * SQLite CRUD Query Builders
 *
 * Helper functions that generate parameterized queries
 * for safe data manipulation. SQLite uses ? placeholders.
 */

/**
 * Build a safe identifier (table/column name)
 */
export function sqliteQuoteIdentifier(name: string): string {
  return `"${name.replace(/"/g, '""')}"`;
}

/**
 * Build COUNT query for pagination
 */
export function sqliteBuildCountQuery(tableName: string): string {
  const safeTable = sqliteQuoteIdentifier(tableName);
  return `SELECT COUNT(*) AS total FROM ${safeTable};`;
}

/**
 * Build paginated SELECT query
 */
export function sqliteBuildSelectQuery(
  tableName: string,
  orderBy: string,
  limit: number,
  offset: number,
): string {
  const safeTable = sqliteQuoteIdentifier(tableName);
  return `
    SELECT *
    FROM ${safeTable}
    ${orderBy}
    LIMIT ${Number(limit)}
    OFFSET ${Number(offset)};
  `;
}

/**
 * Build INSERT query
 */
export function sqliteBuildInsertQuery(
  tableName: string,
  columns: string[],
): { query: string; paramCount: number } {
  const safeTable = sqliteQuoteIdentifier(tableName);
  const columnList = columns.map(sqliteQuoteIdentifier).join(", ");
  const placeholders = columns.map(() => "?").join(", ");

  return {
    query: `INSERT INTO ${safeTable} (${columnList}) VALUES (${placeholders});`,
    paramCount: columns.length,
  };
}

/**
 * Build UPDATE query
 */
export function sqliteBuildUpdateQuery(
  tableName: string,
  columns: string[],
  pkColumn: string,
): { query: string } {
  const safeTable = sqliteQuoteIdentifier(tableName);
  const setClause = columns.map((col) => `${sqliteQuoteIdentifier(col)} = ?`).join(", ");

  return {
    query: `UPDATE ${safeTable} SET ${setClause} WHERE ${sqliteQuoteIdentifier(pkColumn)} = ?;`,
  };
}

/**
 * Build DELETE query
 */
export function sqliteBuildDeleteQuery(tableName: string, pkColumn: string): string {
  const safeTable = sqliteQuoteIdentifier(tableName);
  return `DELETE FROM ${safeTable} WHERE ${sqliteQuoteIdentifier(pkColumn)} = ?;`;
}

/**
 * Build SEARCH query with LIKE (case-insensitive via COLLATE NOCASE)
 */
export function sqliteBuildSearchQuery(
  tableName: string,
  searchColumns: string[],
  limit: number,
  offset: number,
): { dataQuery: string; countQuery: string } {
  const safeTable = sqliteQuoteIdentifier(tableName);

  const whereClause = searchColumns
    .map((col) => `CAST(${sqliteQuoteIdentifier(col)} AS TEXT) LIKE ? COLLATE NOCASE`)
    .join(" OR ");

  return {
    dataQuery: `
      SELECT * FROM ${safeTable}
      WHERE ${whereClause}
      LIMIT ${Number(limit)} OFFSET ${Number(offset)};
    `,
    countQuery: `
      SELECT COUNT(*) AS total FROM ${safeTable}
      WHERE ${whereClause};
    `,
  };
}
