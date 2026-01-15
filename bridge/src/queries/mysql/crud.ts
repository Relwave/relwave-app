/**
 * MySQL CRUD Query Builders
 * 
 * These are helper functions that generate parameterized queries
 * for safe data manipulation operations.
 */

/**
 * Build a safe table/schema identifier
 */
export function quoteIdentifier(name: string): string {
  return `\`${name.replace(/`/g, '``')}\``;
}

/**
 * Build COUNT query for pagination
 */
export function buildCountQuery(schemaName: string, tableName: string): string {
  const safeSchema = quoteIdentifier(schemaName);
  const safeTable = quoteIdentifier(tableName);
  return `SELECT COUNT(*) AS total FROM ${safeSchema}.${safeTable};`;
}

/**
 * Build paginated SELECT query
 */
export function buildSelectQuery(
  schemaName: string,
  tableName: string,
  orderBy: string,
  limit: number,
  offset: number
): string {
  const safeSchema = quoteIdentifier(schemaName);
  const safeTable = quoteIdentifier(tableName);
  return `
    SELECT *
    FROM ${safeSchema}.${safeTable}
    ${orderBy}
    LIMIT ${Number(limit)}
    OFFSET ${Number(offset)};
  `;
}

/**
 * Build INSERT query
 */
export function buildInsertQuery(
  schemaName: string,
  tableName: string,
  columns: string[]
): { query: string; placeholders: string } {
  const safeSchema = quoteIdentifier(schemaName);
  const safeTable = quoteIdentifier(tableName);
  const columnList = columns.map(quoteIdentifier).join(', ');
  const placeholders = columns.map(() => '?').join(', ');

  return {
    query: `INSERT INTO ${safeSchema}.${safeTable} (${columnList}) VALUES (${placeholders});`,
    placeholders
  };
}

/**
 * Build UPDATE query
 */
export function buildUpdateQuery(
  schemaName: string,
  tableName: string,
  columns: string[],
  pkColumn: string
): string {
  const safeSchema = quoteIdentifier(schemaName);
  const safeTable = quoteIdentifier(tableName);
  const setClause = columns.map(col => `${quoteIdentifier(col)} = ?`).join(', ');

  return `UPDATE ${safeSchema}.${safeTable} SET ${setClause} WHERE ${quoteIdentifier(pkColumn)} = ?;`;
}

/**
 * Build DELETE query
 */
export function buildDeleteQuery(
  schemaName: string,
  tableName: string,
  pkColumn: string
): string {
  const safeSchema = quoteIdentifier(schemaName);
  const safeTable = quoteIdentifier(tableName);

  return `DELETE FROM ${safeSchema}.${safeTable} WHERE ${quoteIdentifier(pkColumn)} = ?;`;
}

/**
 * Build SEARCH query with LIKE
 */
export function buildSearchQuery(
  schemaName: string,
  tableName: string,
  searchColumns: string[],
  limit: number,
  offset: number
): { dataQuery: string; countQuery: string } {
  const safeSchema = quoteIdentifier(schemaName);
  const safeTable = quoteIdentifier(tableName);

  const whereClause = searchColumns
    .map(col => `CAST(${quoteIdentifier(col)} AS CHAR) LIKE ?`)
    .join(' OR ');

  return {
    dataQuery: `
      SELECT * FROM ${safeSchema}.${safeTable}
      WHERE ${whereClause}
      LIMIT ${Number(limit)} OFFSET ${Number(offset)};
    `,
    countQuery: `
      SELECT COUNT(*) AS total FROM ${safeSchema}.${safeTable}
      WHERE ${whereClause};
    `
  };
}
