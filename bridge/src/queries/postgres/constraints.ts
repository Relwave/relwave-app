/**
 * PostgreSQL Constraint-related Queries
 */

/**
 * Get primary keys for a table
 * @params tableName - Use $1 placeholder
 */
export const PG_GET_PRIMARY_KEYS = `
  SELECT 
    tc.table_schema,
    tc.table_name,
    kcu.column_name,
    kcu.ordinal_position
  FROM 
    information_schema.table_constraints tc
  JOIN 
    information_schema.key_column_usage kcu
    ON tc.constraint_name = kcu.constraint_name
  WHERE 
    tc.constraint_type = 'PRIMARY KEY'
    AND tc.table_name = $1
  ORDER BY 
    kcu.ordinal_position;
`;

/**
 * Get all primary keys in a schema (batch)
 * @param schemaName - Use $1 placeholder
 */
export const PG_BATCH_GET_PRIMARY_KEYS = `
  SELECT
    tc.table_name,
    kcu.column_name,
    kcu.ordinal_position
  FROM information_schema.table_constraints tc
  JOIN information_schema.key_column_usage kcu 
    ON tc.constraint_name = kcu.constraint_name 
    AND tc.table_schema = kcu.table_schema
  WHERE tc.constraint_type = 'PRIMARY KEY' AND tc.table_schema = $1
  ORDER BY tc.table_name, kcu.ordinal_position;
`;

/**
 * Get foreign keys for a table
 * @params tableName, schemaName - Use $1, $2 placeholders
 */
export const PG_GET_FOREIGN_KEYS = `
  SELECT
    tc.constraint_name,
    tc.table_schema AS source_schema,
    tc.table_name AS source_table,
    kcu.column_name AS source_column,
    ccu.table_schema AS target_schema,
    ccu.table_name AS target_table,
    ccu.column_name AS target_column,
    rc.update_rule,
    rc.delete_rule,
    kcu.ordinal_position
  FROM information_schema.table_constraints tc
  JOIN information_schema.key_column_usage kcu
    ON tc.constraint_name = kcu.constraint_name
    AND tc.table_schema = kcu.table_schema
  JOIN information_schema.constraint_column_usage ccu
    ON ccu.constraint_name = tc.constraint_name
  JOIN information_schema.referential_constraints rc
    ON rc.constraint_name = tc.constraint_name
  WHERE 
    tc.constraint_type = 'FOREIGN KEY'
    AND tc.table_schema = $2
    AND tc.table_name = $1
  ORDER BY 
    tc.constraint_name,
    kcu.ordinal_position;
`;

/**
 * Get all foreign keys in a schema (batch)
 * @param schemaName - Use $1 placeholder
 */
export const PG_BATCH_GET_FOREIGN_KEYS = `
  SELECT
    tc.constraint_name,
    tc.table_schema AS source_schema,
    tc.table_name AS source_table,
    kcu.column_name AS source_column,
    ccu.table_schema AS target_schema,
    ccu.table_name AS target_table,
    ccu.column_name AS target_column,
    rc.update_rule,
    rc.delete_rule,
    kcu.ordinal_position
  FROM information_schema.table_constraints tc
  JOIN information_schema.key_column_usage kcu
    ON tc.constraint_name = kcu.constraint_name
    AND tc.table_schema = kcu.table_schema
  JOIN information_schema.constraint_column_usage ccu
    ON ccu.constraint_name = tc.constraint_name
  JOIN information_schema.referential_constraints rc
    ON rc.constraint_name = tc.constraint_name
  WHERE tc.constraint_type = 'FOREIGN KEY' AND tc.table_schema = $1
  ORDER BY tc.table_name, tc.constraint_name, kcu.ordinal_position;
`;

/**
 * Get indexes for a table
 * @params tableName, schemaName - Use $1, $2 placeholders
 */
export const PG_GET_INDEXES = `
  SELECT
    t.relname AS table_name,
    i.relname AS index_name,
    a.attname AS column_name,
    ix.indisunique AS is_unique,
    ix.indisprimary AS is_primary,
    am.amname AS index_type,
    pg_get_expr(ix.indpred, ix.indrelid) AS predicate,
    array_position(ix.indkey, a.attnum) AS ordinal_position
  FROM pg_class t
  JOIN pg_index ix ON t.oid = ix.indrelid
  JOIN pg_class i ON i.oid = ix.indexrelid
  JOIN pg_am am ON am.oid = i.relam
  JOIN pg_attribute a ON a.attrelid = t.oid AND a.attnum = ANY(ix.indkey)
  JOIN pg_namespace n ON n.oid = t.relnamespace
  WHERE
    n.nspname = $2
    AND t.relname = $1
  ORDER BY index_name, ordinal_position;
`;

/**
 * Get all indexes in a schema (batch)
 * @param schemaName - Use $1 placeholder
 */
export const PG_BATCH_GET_INDEXES = `
  SELECT
    t.relname AS table_name,
    i.relname AS index_name,
    a.attname AS column_name,
    ix.indisunique AS is_unique,
    ix.indisprimary AS is_primary,
    am.amname AS index_type,
    pg_get_expr(ix.indpred, ix.indrelid) AS predicate,
    array_position(ix.indkey, a.attnum) AS ordinal_position
  FROM pg_class t
  JOIN pg_index ix ON t.oid = ix.indrelid
  JOIN pg_class i ON i.oid = ix.indexrelid
  JOIN pg_am am ON am.oid = i.relam
  JOIN pg_attribute a ON a.attrelid = t.oid AND a.attnum = ANY(ix.indkey)
  JOIN pg_namespace n ON n.oid = t.relnamespace
  WHERE n.nspname = $1
  ORDER BY t.relname, i.relname, ordinal_position;
`;

/**
 * Get unique constraints for a table
 * @params tableName, schemaName - Use $1, $2 placeholders
 */
export const PG_GET_UNIQUE_CONSTRAINTS = `
  SELECT
    tc.constraint_name,
    tc.table_schema,
    tc.table_name,
    kcu.column_name,
    kcu.ordinal_position
  FROM information_schema.table_constraints tc
  JOIN information_schema.key_column_usage kcu
    ON tc.constraint_name = kcu.constraint_name
    AND tc.table_schema = kcu.table_schema
  WHERE
    tc.constraint_type = 'UNIQUE'
    AND tc.table_schema = $2
    AND tc.table_name = $1
  ORDER BY
    tc.constraint_name,
    kcu.ordinal_position;
`;

/**
 * Get all unique constraints in a schema (batch)
 * @param schemaName - Use $1 placeholder
 */
export const PG_BATCH_GET_UNIQUE_CONSTRAINTS = `
  SELECT
    tc.constraint_name,
    tc.table_schema,
    tc.table_name,
    kcu.column_name,
    kcu.ordinal_position
  FROM information_schema.table_constraints tc
  JOIN information_schema.key_column_usage kcu
    ON tc.constraint_name = kcu.constraint_name 
    AND tc.table_schema = kcu.table_schema
  WHERE tc.constraint_type = 'UNIQUE' AND tc.table_schema = $1
  ORDER BY tc.table_name, tc.constraint_name, kcu.ordinal_position;
`;

/**
 * Get check constraints for a table
 * @params tableName, schemaName - Use $1, $2 placeholders
 */
export const PG_GET_CHECK_CONSTRAINTS = `
  SELECT
    c.conname AS constraint_name,
    n.nspname AS table_schema,
    t.relname AS table_name,
    pg_get_constraintdef(c.oid) AS definition
  FROM pg_constraint c
  JOIN pg_class t ON c.conrelid = t.oid
  JOIN pg_namespace n ON n.oid = t.relnamespace
  WHERE
    c.contype = 'c'
    AND n.nspname = $2
    AND t.relname = $1;
`;

/**
 * Get all check constraints in a schema (batch)
 * @param schemaName - Use $1 placeholder
 */
export const PG_BATCH_GET_CHECK_CONSTRAINTS = `
  SELECT
    c.conname AS constraint_name,
    n.nspname AS table_schema,
    t.relname AS table_name,
    pg_get_constraintdef(c.oid) AS check_clause
  FROM pg_constraint c
  JOIN pg_class t ON c.conrelid = t.oid
  JOIN pg_namespace n ON n.oid = t.relnamespace
  WHERE c.contype = 'c' AND n.nspname = $1;
`;
