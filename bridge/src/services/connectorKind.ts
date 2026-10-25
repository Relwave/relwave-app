/**
 * Database kind discriminator.
 *
 * A single switch key for "relational vs document" behavior, replacing scattered
 * per-engine checks. M1 only defines it; later milestones consume it to gate
 * SQL-only features (migrations, relational schema, SQL editor/builder, ER
 * auto-edges, monitoring whitelists, NL-to-SQL).
 */

import { DBType } from "../types";

export type DatabaseKind = "sql" | "nosql";

const KIND: Record<DBType, DatabaseKind> = {
  [DBType.POSTGRES]: "sql",
  [DBType.MYSQL]: "sql",
  [DBType.MARIADB]: "sql",
  [DBType.SQLITE]: "sql",
  [DBType.DUCKDB]: "sql",
  [DBType.CLICKHOUSE]: "sql",
  [DBType.MONGODB]: "nosql",
};

export function connectorKind(dbType: DBType): DatabaseKind {
  return KIND[dbType];
}
