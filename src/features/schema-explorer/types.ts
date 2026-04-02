import {
    ColumnDetails as BaseColumnDetails,
    DatabaseSchemaDetails,
    SchemaGroup,
    TableSchemaDetails,
    ForeignKeyInfo,
} from "@/features/database/types";

// Extended column with FK reference
export interface Column extends BaseColumnDetails {
    foreignKeyRef?: string;
}

// Extended table schema
export interface TableSchema extends TableSchemaDetails {
    columns: Column[];
}

// Extended schema
export interface Schema extends SchemaGroup {
    tables: TableSchema[];
}

// Extended database schema
export interface DatabaseSchema extends DatabaseSchemaDetails {
    schemas: Schema[];
}

// Helper to get FK info for a column
export const getFkInfo = (
    columnName: string,
    foreignKeys?: ForeignKeyInfo[]
): ForeignKeyInfo | undefined => {
    return foreignKeys?.find((fk) => fk.source_column === columnName);
};



export interface MetaDataPanelProps {
    selectedItem: string | null;
    database: DatabaseSchema | null;
}

// Table selection info for header
export interface TableSelection {
    schema: string;
    name: string;
    columns: string[];
}
