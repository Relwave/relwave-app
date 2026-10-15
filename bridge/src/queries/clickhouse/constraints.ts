/**
 * ClickHouse Constraint & Index Queries
 */

/**
 * List primary key / sorting key columns for a table.
 */
export const CLICKHOUSE_GET_PRIMARY_KEYS = `
  SELECT name AS column_name
  FROM system.columns
  WHERE database = {target_schema: String}
    AND \`table\` = {target_table: String}
    AND (is_in_primary_key = 1 OR is_in_sorting_key = 1)
  ORDER BY position;
`;

/**
 * Batch get primary keys for all tables in a schema.
 */
export const CLICKHOUSE_BATCH_GET_PRIMARY_KEYS = `
  SELECT \`table\` AS \`table\`, name AS column_name
  FROM system.columns
  WHERE database = {target_schema: String}
    AND (is_in_primary_key = 1 OR is_in_sorting_key = 1)
  ORDER BY \`table\`, position;
`;

/**
 * List secondary (data skipping) indexes for a table.
 */
export const CLICKHOUSE_GET_INDEXES = `
  SELECT
    name AS index_name,
    expr AS column_name,
    type AS index_type
  FROM system.data_skipping_indices
  WHERE database = {target_schema: String}
    AND \`table\` = {target_table: String}
  ORDER BY name;
`;

/**
 * Batch get indexes for all tables in a schema.
 */
export const CLICKHOUSE_BATCH_GET_INDEXES = `
  SELECT
    \`table\` AS \`table\`,
    name AS index_name,
    expr AS column_name,
    type AS index_type
  FROM system.data_skipping_indices
  WHERE database = {target_schema: String}
  ORDER BY \`table\`, name;
`;
