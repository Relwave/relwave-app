/**
 * DuckDB-specific Types
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
 * DuckDB connection configuration
 */
export type DuckDBConfig = {
  path: string;
  readonly?: boolean;
};

/**
 * DuckDB schema metadata batch result
 */
export type DuckDBSchemaMetadataBatch = {
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
