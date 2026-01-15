import { DatabaseConnection } from "@/types/database";

export interface ConnectionListProps {
    databases: DatabaseConnection[];
    filteredDatabases: DatabaseConnection[];
    loading: boolean;
    searchQuery: string;
    setSearchQuery: (query: string) => void;
    selectedDb: string | null;
    setSelectedDb: (id: string | null) => void;
    status: Map<string, string>;
    connectedCount: number;
    totalTables: number | string;
    statsLoading: boolean;
    onAddClick: () => void;
    onDatabaseHover: (dbId: string) => void;
    onDelete: (dbId: string, dbName: string) => void;
    onTest: (dbId: string, dbName: string) => void;
}

export interface DatabaseDetailProps {
    database: DatabaseConnection;
    isConnected: boolean;
    tables: number | string | undefined;
    size: string | number | undefined;
    onTest: () => void;
    onOpen: () => void;
    onDelete: () => void;
}

export interface WelcomeViewProps {
    databases: DatabaseConnection[];
    recentDatabases: DatabaseConnection[];
    status: Map<string, string>;
    connectedCount: number;
    totalTables: number | string;
    totalSize: string;
    statsLoading: boolean;
    onAddClick: () => void;
    onSelectDb: (id: string) => void;
    onDatabaseClick: (id: string) => void;
    onDatabaseHover: (dbId: string) => void;
}

export interface AddConnectionDialogProps {
    open: boolean;
    onOpenChange: (open: boolean) => void;
    onSubmit: (data: ConnectionFormData, useUrl: boolean, connectionUrl: string) => void;
    isLoading?: boolean;
}

export interface DeleteDialogProps {
    open: boolean;
    onOpenChange: (open: boolean) => void;
    databaseName: string | undefined;
    onConfirm: () => void;
}

export interface ConnectionFormData {
    name: string;
    type: string;
    host: string;
    port: string;
    user: string;
    password: string;
    database: string;
    sslmode: string;
    ssl: boolean;
}

export const INITIAL_FORM_DATA: ConnectionFormData = {
    name: "",
    type: "",
    host: "",
    port: "",
    user: "",
    password: "",
    database: "",
    sslmode: "",
    ssl: false
};

export const REQUIRED_FIELDS = ["name", "type", "host", "port", "user", "database"];
