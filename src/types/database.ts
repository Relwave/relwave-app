
export type DatabaseType = "postgresql" | "mysql";

export interface DatabaseConnection {
    id: string;
    name: string;
    type: string;
    host: string;
    port: number;
    user: string;
    database: string;
    tags?: string[];
    notes?: string;
    createdAt: string;
    updatedAt: string;
    credentialId?: string;
}

export interface AddDatabaseParams {
    name: string;
    type: string;
    host: string;
    port: number;
    user: string;
    database: string;
    password?: string;
    notes?: string;
    tags?: string[];
    ssl?: boolean;
    sslmode?: string;
}

export interface UpdateDatabaseParams {
    id: string;
    name?: string;
    host?: string;
    port?: number;
    user?: string;
    database?: string;
    password?: string;
    notes?: string;
    tags?: string[];
}

export interface ConnectionTestResult {
    ok: boolean;
    status: 'connected' | 'disconnected';
    message?: string;
}

// --- NEW INTERFACES FOR QUERY/SESSION HANDLING ---

export interface TableRow extends Record<string, any> { }

export interface TableColumn {
    name: string;
    // Add other metadata fields as needed (e.g., dataType, nullable)
}

// Interface for initiating a query
export interface RunQueryParams {
    sessionId: string;
    dbId: string;
    sql: string;
    batchSize?: number;
}

// --- NEW INTERFACES FOR SCHEMA EXPLORER ---

export interface ColumnDetails {
    name: string;
    type: string;
    nullable: boolean;
    isPrimaryKey: boolean;
    isForeignKey: boolean;
    isUnique: boolean;
    defaultValue: string | null;
    ordinalPosition?: number;
    maxLength?: number | null;
}

export interface PrimaryKeyInfo {
    table_schema: string;
    table_name: string;
    column_name: string;
    ordinal_position: number;
}

export interface ForeignKeyInfo {
    constraint_name: string;
    source_schema: string;
    source_table: string;
    source_column: string;
    target_schema: string;
    target_table: string;
    target_column: string;
    update_rule: string;
    delete_rule: string;
    ordinal_position: number;
}

export interface IndexInfo {
    table_name: string;
    index_name: string;
    column_name: string;
    is_unique: boolean;
    is_primary: boolean;
    index_type: string;
    predicate: string | null;
    ordinal_position: number;
}

export interface UniqueConstraintInfo {
    constraint_name: string;
    table_schema: string;
    table_name: string;
    column_name: string;
    ordinal_position: number;
}

export interface CheckConstraintInfo {
    constraint_name: string;
    table_schema: string;
    table_name: string;
    definition?: string;
    check_clause?: string;
}

export interface EnumTypeInfo {
    schema_name: string;
    enum_name: string;
    enum_value: string;
}

export interface SequenceInfo {
    sequence_name: string;
    sequence_schema: string;
    table_name: string | null;
    column_name: string | null;
}

export interface TableSchemaDetails {
    name: string;
    type: "BASE TABLE" | "VIEW" | string;
    columns: ColumnDetails[];
    primaryKeys?: PrimaryKeyInfo[];
    foreignKeys?: ForeignKeyInfo[];
    indexes?: IndexInfo[];
    uniqueConstraints?: UniqueConstraintInfo[];
    checkConstraints?: CheckConstraintInfo[];
}

export interface SchemaGroup {
    name: string;
    tables: TableSchemaDetails[];
    enumTypes?: EnumTypeInfo[];
    sequences?: SequenceInfo[];
}

export interface DatabaseSchemaDetails {
    name: string;
    schemas: SchemaGroup[];
}

export interface DatabaseStats {
    rows: number;
    sizeBytes: number;
    tables: number;
}

export interface TableInfo {
    schema: string;
    name: string;
    type: string;
}

export interface SelectedTable {
    schema: string;
    name: string;
}

export interface QueryProgress {
    rows: number;
    elapsed: number;
}

export interface CreateTableColumn {
    name: string;
    type: string;
    not_nullable: boolean;
    is_primary_key: boolean;
    default_value?: string;
}

export interface CreateTableParams {
    dbId: string;
    schemaName: string;
    tableName: string;
    columns: CreateTableColumn[];
}

export interface ForeignKeyConstraint {
    constraint_name: string;
    source_schema: string;
    source_table: string;
    source_column: string;
    target_schema: string;
    target_table: string;
    target_column: string;
    update_rule?: string;
    delete_rule?: string;
}

export interface CreateIndexDefinition {
    table_name: string;
    index_name: string;
    column_name: string;
    is_unique: boolean;
    is_primary: boolean;
    index_type?: string;
    seq_in_index?: number;
    predicate?: string;
}

export type AlterTableOperation =
    | { type: "ADD_COLUMN"; column: CreateTableColumn }
    | { type: "DROP_COLUMN"; column_name: string }
    | { type: "RENAME_COLUMN"; from: string; to: string }
    | { type: "SET_NOT_NULL"; column_name: string; new_type?: string }
    | { type: "DROP_NOT_NULL"; column_name: string; new_type?: string }
    | { type: "SET_DEFAULT"; column_name: string; default_value: string }
    | { type: "DROP_DEFAULT"; column_name: string }
    | { type: "ALTER_TYPE"; column_name: string; new_type: string };

export type DropMode = "RESTRICT" | "DETACH_FKS" | "CASCADE";
