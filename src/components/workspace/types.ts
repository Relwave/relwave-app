// Types for SQL Workspace
export interface QueryTab {
    id: string;
    name: string;
    query: string;
    results: Record<string, any>[];
    rowCount: number;
    error: string | null;
    executionTime: number | null;
    status: 'idle' | 'running' | 'success' | 'error';
}

export interface QueryHistoryItem {
    query: string;
    timestamp: Date;
    rowCount: number;
    success: boolean;
}

export interface TableInfo {
    name: string;
    schema: string;
}
