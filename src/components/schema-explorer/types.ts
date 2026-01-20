import {
    ColumnDetails as BaseColumnDetails,
    DatabaseSchemaDetails,
    SchemaGroup,
    TableSchemaDetails,
    ForeignKeyInfo,
} from "@/types/database";

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

// Props interfaces
export interface TreeViewPanelProps {
    database: DatabaseSchema;
    expandedSchemas: Set<string>;
    expandedTables: Set<string>;
    toggleSchema: (schemaName: string) => void;
    toggleTable: (tableName: string) => void;
    selectedItem: string | null;
    setSelectedItem: (itemPath: string) => void;
    handlePreviewRows: (tableName: string) => void;
    handleShowDDL: (tableName: string) => void;
    handleCopy: (name: string, type: string) => void;
    handleExport: (tableName: string) => void;
}

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
