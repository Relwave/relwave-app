/**
 * PostgreSQL CRUD Query Builders
 * 
 * These are helper functions that generate parameterized queries
 * for safe data manipulation operations.
 */

/**
 * Build a safe identifier (table/column name)
 */
export function pgQuoteIdentifier(name: string): string {
  return `"${name.replace(/"/g, '""')}"`;
}

/**
 * Build COUNT query for pagination
 */
export function pgBuildCountQuery(schemaName: string, tableName: string): string {
  const safeSchema = pgQuoteIdentifier(schemaName);
  const safeTable = pgQuoteIdentifier(tableName);
  return `SELECT COUNT(*) AS total FROM ${safeSchema}.${safeTable};`;
}

/**
 * Build paginated SELECT query
 */
export function pgBuildSelectQuery(
  schemaName: string,
  tableName: string,
  orderBy: string,
  limit: number,
  offset: number
): string {
  const safeSchema = pgQuoteIdentifier(schemaName);
  const safeTable = pgQuoteIdentifier(tableName);
  return `
    SELECT *
    FROM ${safeSchema}.${safeTable}
    ${orderBy}
    LIMIT ${Number(limit)}
    OFFSET ${Number(offset)};
  `;
}

/**
 * Build INSERT query with RETURNING clause
 */
export function pgBuildInsertQuery(
  schemaName: string,
  tableName: string,
  columns: string[]
): { query: string; paramCount: number } {
  const safeSchema = pgQuoteIdentifier(schemaName);
  const safeTable = pgQuoteIdentifier(tableName);
  const columnList = columns.map(pgQuoteIdentifier).join(', ');
  const placeholders = columns.map((_, i) => `$${i + 1}`).join(', ');

  return {
    query: `INSERT INTO ${safeSchema}.${safeTable} (${columnList}) VALUES (${placeholders}) RETURNING *;`,
    paramCount: columns.length
  };
}

/**
 * Build UPDATE query with RETURNING clause
 */
export function pgBuildUpdateQuery(
  schemaName: string,
  tableName: string,
  columns: string[],
  pkColumn: string
): { query: string; pkParamIndex: number } {
  const safeSchema = pgQuoteIdentifier(schemaName);
  const safeTable = pgQuoteIdentifier(tableName);
  const setClause = columns.map((col, i) => `${pgQuoteIdentifier(col)} = $${i + 1}`).join(', ');
  const pkParamIndex = columns.length + 1;

  return {
    query: `UPDATE ${safeSchema}.${safeTable} SET ${setClause} WHERE ${pgQuoteIdentifier(pkColumn)} = $${pkParamIndex} RETURNING *;`,
    pkParamIndex
  };
}

/**
 * Build DELETE query
 */
export function pgBuildDeleteQuery(
  schemaName: string,
  tableName: string,
  pkColumn: string
): string {
  const safeSchema = pgQuoteIdentifier(schemaName);
  const safeTable = pgQuoteIdentifier(tableName);

  return `DELETE FROM ${safeSchema}.${safeTable} WHERE ${pgQuoteIdentifier(pkColumn)} = $1;`;
}

/**
 * Build SEARCH query with ILIKE (case-insensitive)
 */
export function pgBuildSearchQuery(
  schemaName: string,
  tableName: string,
  searchColumns: string[],
  limit: number,
  offset: number
): { dataQuery: string; countQuery: string; paramStartIndex: number } {
  const safeSchema = pgQuoteIdentifier(schemaName);
  const safeTable = pgQuoteIdentifier(tableName);

  // Each column gets its own parameter for the search term
  const whereClause = searchColumns
    .map((col, i) => `CAST(${pgQuoteIdentifier(col)} AS TEXT) ILIKE $${i + 1}`)
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
    `,
    paramStartIndex: 1
  };
}
