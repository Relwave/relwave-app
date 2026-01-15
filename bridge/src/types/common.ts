/**
 * Common Database Types
 * Shared type definitions used by all database connectors
 */

/**
 * Basic table information
 */
export type TableInfo = {
    schema: string;
    name: string;
    type: string;
};

/**
 * Database statistics
 */
export type DBStats = {
    total_tables: number;
    total_db_size_mb: number;
    total_rows: number;
};

/**
 * Schema information
 */
export type SchemaInfo = {
    name: string;
};

/**
 * Primary key column information
 */
export type PrimaryKeyInfo = {
    column_name: string;
};

/**
 * Column detail information
 */
export type ColumnDetail = {
    name: string;
    type: string;
    not_nullable: boolean;
    default_value: string | null;
    is_primary_key: boolean;
    is_foreign_key: boolean;
    ordinal_position?: number;
    max_length?: number | null;
};

/**
 * Foreign key relationship information
 */
export type ForeignKeyInfo = {
    constraint_name: string;
    source_schema: string;
    source_table: string;
    source_column: string;
    target_schema: string;
    target_table: string;
    target_column: string;
    update_rule: string;
    delete_rule: string;
    ordinal_position?: number;
};

/**
 * Index information
 */
export type IndexInfo = {
    table_name: string;
    index_name: string;
    column_name: string;
    is_unique: boolean;
    is_primary: boolean;
    index_type: string;
    predicate?: string | null;
    ordinal_position?: number;
    seq_in_index?: number; // MySQL-specific
};

/**
 * Unique constraint information
 */
export type UniqueConstraintInfo = {
    constraint_name: string;
    table_schema: string;
    table_name: string;
    column_name: string;
    ordinal_position: number;
};

/**
 * Check constraint information
 */
export type CheckConstraintInfo = {
    constraint_name: string;
    table_schema: string;
    table_name: string;
    definition?: string;
    check_clause?: string; // MySQL-specific
};

/**
 * Applied migration record
 */
export type AppliedMigration = {
    version: string;
    name: string;
    applied_at: Date;
    checksum: string;
};

/**
 * Alter table operation types
 */
export type AlterTableOperation =
    | { type: "ADD_COLUMN"; columnName: string; columnDef: string }
    | { type: "DROP_COLUMN"; columnName: string }
    | { type: "RENAME_COLUMN"; oldName: string; newName: string }
    | { type: "ALTER_COLUMN"; columnName: string; newDef: string }
    | { type: "ADD_CONSTRAINT"; constraintDef: string }
    | { type: "DROP_CONSTRAINT"; constraintName: string }
    | { type: "RENAME_TABLE"; newName: string };

/**
 * Drop mode for table/schema operations
 */
export type DropMode = "CASCADE" | "RESTRICT" | undefined;
