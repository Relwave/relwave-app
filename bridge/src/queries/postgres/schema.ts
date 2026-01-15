/**
 * PostgreSQL Schema-related Queries
 */

/**
 * List all schemas excluding system schemas
 */
export const PG_LIST_SCHEMAS = `
  SELECT nspname AS name
  FROM pg_namespace
  WHERE nspname NOT IN ('pg_catalog', 'information_schema', 'pg_toast')
    AND nspname NOT LIKE 'pg_temp_%' 
    AND nspname NOT LIKE 'pg_toast_temp_%'
  ORDER BY nspname;
`;

/**
 * List all base tables (optionally filtered by schema)
 * @param schemaName - Use $1 placeholder (optional)
 */
export const PG_LIST_TABLES = `
  SELECT table_schema AS schema, table_name AS name, table_type AS type
  FROM information_schema.tables
  WHERE table_schema NOT IN ('pg_catalog', 'information_schema', 'pg_toast')
    AND table_type = 'BASE TABLE'
  ORDER BY table_schema, table_name;
`;

/**
 * List tables filtered by schema
 * @param schemaName - Use $1 placeholder
 */
export const PG_LIST_TABLES_BY_SCHEMA = `
  SELECT table_schema AS schema, table_name AS name, table_type AS type
  FROM information_schema.tables
  WHERE table_schema NOT IN ('pg_catalog', 'information_schema', 'pg_toast')
    AND table_type = 'BASE TABLE'
    AND table_schema = $1
  ORDER BY table_schema, table_name;
`;

/**
 * List all enum types in a schema
 * @param schemaName - Use $1 placeholder
 */
export const PG_LIST_ENUMS = `
  SELECT
    n.nspname AS schema_name,
    t.typname AS enum_name,
    e.enumlabel AS enum_value
  FROM pg_type t
  JOIN pg_enum e ON t.oid = e.enumtypid
  JOIN pg_namespace n ON n.oid = t.typnamespace
  WHERE n.nspname = $1
  ORDER BY enum_name, e.enumsortorder;
`;

/**
 * List all sequences in a schema
 * @param schemaName - Use $1 placeholder
 */
export const PG_LIST_SEQUENCES = `
  SELECT
    seq.relname AS sequence_name,
    ns.nspname AS sequence_schema,
    tab.relname AS table_name,
    col.attname AS column_name
  FROM pg_class seq
  JOIN pg_namespace ns ON ns.oid = seq.relnamespace
  LEFT JOIN pg_depend dep ON dep.objid = seq.oid AND dep.deptype = 'a'
  LEFT JOIN pg_class tab ON tab.oid = dep.refobjid
  LEFT JOIN pg_attribute col ON col.attrelid = tab.oid AND col.attnum = dep.refobjsubid
  WHERE seq.relkind = 'S' AND ns.nspname = $1;
`;
