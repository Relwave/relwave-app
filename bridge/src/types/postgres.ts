/**
 * PostgreSQL-specific Types
 */

import type { ColumnDetail, ForeignKeyInfo, IndexInfo, UniqueConstraintInfo, CheckConstraintInfo, PrimaryKeyInfo } from "./common";

/**
 * PostgreSQL connection configuration
 */
export type PGConfig = {
    host: string;
    port?: number;
    user?: string;
    password?: string;
    database?: string;
    ssl?: boolean;
    sslmode?: string;
};

/**
 * PostgreSQL enum type information
 */
export type EnumInfo = {
    schema_name: string;
    enum_name: string;
    enum_value: string;
};

/**
 * PostgreSQL sequence information
 */
export type SequenceInfo = {
    sequence_name: string;
    sequence_schema: string;
    table_name: string | null;
    column_name: string | null;
};

/**
 * PostgreSQL schema metadata batch result
 */
export type PGSchemaMetadataBatch = {
    tables: Map<string, {
        columns: ColumnDetail[];
        primaryKeys: PrimaryKeyInfo[];
        foreignKeys: ForeignKeyInfo[];
        indexes: IndexInfo[];
        uniqueConstraints: UniqueConstraintInfo[];
        checkConstraints: CheckConstraintInfo[];
    }>;
    enums: EnumInfo[];
    sequences: SequenceInfo[];
};

/**
 * PostgreSQL-specific alter table operations
 */
export type PGAlterTableOperation =
    | { type: "ADD_COLUMN"; column: ColumnDetail }
    | { type: "DROP_COLUMN"; column_name: string }
    | { type: "RENAME_COLUMN"; from: string; to: string }
    | { type: "SET_NOT_NULL"; column_name: string }
    | { type: "DROP_NOT_NULL"; column_name: string }
    | { type: "SET_DEFAULT"; column_name: string; default_value: string }
    | { type: "DROP_DEFAULT"; column_name: string }
    | { type: "ALTER_TYPE"; column_name: string; new_type: string };

/**
 * PostgreSQL-specific drop mode
 */
export type PGDropMode =
    | "RESTRICT"      // fail if dependencies exist
    | "DETACH_FKS"    // drop dependent foreign keys first
    | "CASCADE";      // explicit nuclear option