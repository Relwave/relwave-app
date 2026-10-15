/**
 * ClickHouse-specific Types
 */

import type {
  ColumnDetail,
  ForeignKeyInfo,
  IndexInfo,
  UniqueConstraintInfo,
  CheckConstraintInfo,
  PrimaryKeyInfo,
} from "./common";

/**
 * ClickHouse connection configuration
 */
export type ClickHouseConfig = {
  host: string;
  port?: number;
  user?: string;
  password?: string;
  database?: string;
  ssl?: boolean;
  url?: string;
};

/**
 * ClickHouse schema metadata batch result
 */
export type ClickHouseSchemaMetadataBatch = {
  tables: Map<
    string,
    {
      columns: ColumnDetail[];
      primaryKeys: PrimaryKeyInfo[];
      foreignKeys: ForeignKeyInfo[];
      indexes: IndexInfo[];
      uniqueConstraints: UniqueConstraintInfo[];
      checkConstraints: CheckConstraintInfo[];
    }
  >;
};
