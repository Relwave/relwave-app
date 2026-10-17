/**
 * ClickHouse Migration Queries
 */

export const CLICKHOUSE_CREATE_MIGRATION_TABLE = (schema: string) => `
  CREATE TABLE IF NOT EXISTS \`${schema}\`.schema_migrations (
    version String,
    name String,
    applied_at DateTime DEFAULT now()
  ) ENGINE = MergeTree() ORDER BY version;
`;

export const CLICKHOUSE_CHECK_MIGRATIONS_EXIST = (schema: string) => `
  SELECT count() AS cnt
  FROM \`${schema}\`.schema_migrations;
`;

export const CLICKHOUSE_LIST_APPLIED_MIGRATIONS = (schema: string) => `
  SELECT
    version,
    name,
    toString(applied_at) AS applied_at
  FROM \`${schema}\`.schema_migrations
  ORDER BY version ASC;
`;

export const CLICKHOUSE_DELETE_MIGRATION = (schema: string) => `
  ALTER TABLE \`${schema}\`.schema_migrations DELETE WHERE version = {version: String};
`;
