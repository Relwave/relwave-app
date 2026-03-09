/**
 * SQLite-specific Types
 */

import type { ColumnDetail, ForeignKeyInfo, IndexInfo, UniqueConstraintInfo, CheckConstraintInfo, PrimaryKeyInfo } from "./common";

/**
 * SQLite connection configuration (file-based, no host/port/user)
 */
export type SQLiteConfig = {
    path: string;
    readonly?: boolean;
};

/**
 * SQLite schema metadata batch result
 */
export type SQLiteSchemaMetadataBatch = {
    tables: Map<string, {
        columns: ColumnDetail[];
        primaryKeys: PrimaryKeyInfo[];
        foreignKeys: ForeignKeyInfo[];
        indexes: IndexInfo[];
        uniqueConstraints: UniqueConstraintInfo[];
        checkConstraints: CheckConstraintInfo[];
    }>;
};

/**
* SQLite has limited ALTER TABLE support:
 * - ADD COLUMN
 * - DROP COLUMN (requires SQLite 3.35.0+)
 * - RENAME COLUMN
 * - RENAME TABLE
 */
export type SQLiteAlterTableOperation =
    | { type: "ADD_COLUMN"; column: ColumnDetail }
    | { type: "DROP_COLUMN"; column_name: string }
    | { type: "RENAME_COLUMN"; from: string; to: string };

/**
 * SQLite-specific drop mode
 */
export type SQLiteDropMode =
    | "RESTRICT"
    | "CASCADE";
