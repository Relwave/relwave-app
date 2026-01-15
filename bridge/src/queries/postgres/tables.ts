/**
 * PostgreSQL Table-related Queries
 */

/**
 * Get detailed column information for a table
 * @param tableRef - Use $1 placeholder (format: 'schema.table')
 */
export const PG_GET_TABLE_DETAILS = `
  SELECT
    a.attname AS name,
    format_type(a.atttypid, a.atttypmod) AS type,
    a.attnotnull AS not_nullable,
    pg_get_expr(d.adbin, d.adrelid) AS default_value,
    (SELECT TRUE FROM pg_constraint pc 
     WHERE pc.conrelid = a.attrelid AND a.attnum = ANY(pc.conkey) AND pc.contype = 'p') AS is_primary_key,
    (SELECT TRUE FROM pg_constraint fc 
     WHERE fc.conrelid = a.attrelid AND a.attnum = ANY(fc.conkey) AND fc.contype = 'f') AS is_foreign_key
  FROM 
    pg_attribute a
  LEFT JOIN 
    pg_attrdef d ON d.adrelid = a.attrelid AND d.adnum = a.attnum
  WHERE 
    a.attrelid = $1::regclass
    AND a.attnum > 0
    AND NOT a.attisdropped
  ORDER BY a.attnum;
`;

/**
 * Get all columns in a schema (batch query)
 * @param schemaName - Use $1 placeholder
 */
export const PG_BATCH_GET_ALL_COLUMNS = `
  SELECT
    c.table_name,
    c.column_name AS name,
    c.data_type AS type,
    (c.is_nullable = 'NO') AS not_nullable,
    c.column_default AS default_value,
    c.ordinal_position,
    COALESCE(
      (SELECT TRUE FROM information_schema.table_constraints tc
       JOIN information_schema.key_column_usage kcu ON tc.constraint_name = kcu.constraint_name
       WHERE tc.constraint_type = 'PRIMARY KEY'
         AND tc.table_schema = c.table_schema
         AND tc.table_name = c.table_name
         AND kcu.column_name = c.column_name),
      FALSE
    ) AS is_primary_key,
    COALESCE(
      (SELECT TRUE FROM information_schema.table_constraints tc
       JOIN information_schema.key_column_usage kcu ON tc.constraint_name = kcu.constraint_name
       WHERE tc.constraint_type = 'FOREIGN KEY'
         AND tc.table_schema = c.table_schema
         AND tc.table_name = c.table_name
         AND kcu.column_name = c.column_name),
      FALSE
    ) AS is_foreign_key
  FROM information_schema.columns c
  WHERE c.table_schema = $1
  ORDER BY c.table_name, c.ordinal_position;
`;

/**
 * Cancel a running query by backend PID
 * @param pid - Use $1 placeholder
 */
export const PG_CANCEL_QUERY = `SELECT pg_cancel_backend($1);`;

/**
 * Get current backend process ID
 */
export const PG_GET_BACKEND_PID = `SELECT pg_backend_pid();`;
