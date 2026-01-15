/**
 * MySQL-specific Types
 */

import type { ColumnDetail, ForeignKeyInfo, IndexInfo, UniqueConstraintInfo, CheckConstraintInfo, PrimaryKeyInfo } from "./common";

/**
 * MySQL connection configuration
 */
export type MySQLConfig = {
    host: string;
    port?: number;
    user?: string;
    password?: string;
    database?: string;
};

/**
 * MySQL enum column information
 */
export type EnumColumnInfo = {
    table_name: string;
    column_name: string;
    column_type?: string;
    enum_values?: string[];
};

/**
 * MySQL auto-increment column information
 */
export type AutoIncrementInfo = {
    table_name: string;
    column_name: string;
    auto_increment_value: number | null;
};

/**
 * MySQL schema metadata batch result
 */
export type SchemaMetadataBatch = {
    tables: Map<string, {
        columns: ColumnDetail[];
        primaryKeys: PrimaryKeyInfo[];
        foreignKeys: ForeignKeyInfo[];
        indexes: IndexInfo[];
        uniqueConstraints: UniqueConstraintInfo[];
        checkConstraints: CheckConstraintInfo[];
    }>;
    enumColumns: EnumColumnInfo[];
    autoIncrements: AutoIncrementInfo[];
};

/**
 * MySQL-specific alter table operations
 */
export type MySQLAlterTableOperation =
    | { type: "ADD_COLUMN"; column: ColumnDetail }
    | { type: "DROP_COLUMN"; column_name: string }
    | { type: "RENAME_COLUMN"; from: string; to: string }
    | { type: "SET_NOT_NULL"; column_name: string; new_type: string }
    | { type: "DROP_NOT_NULL"; column_name: string; new_type: string }
    | { type: "SET_DEFAULT"; column_name: string; default_value: string }
    | { type: "DROP_DEFAULT"; column_name: string }
    | { type: "ALTER_TYPE"; column_name: string; new_type: string };

/**
 * MySQL-specific drop mode
 */
export type MySQLDropMode =
    | "RESTRICT"      // fail if dependencies exist
    | "DETACH_FKS"    // drop dependent foreign keys first
    | "CASCADE";      // explicit nuclear option
