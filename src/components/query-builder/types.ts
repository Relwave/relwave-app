import { Node, Edge } from "reactflow";

// Filter configuration
export interface QueryFilter {
    column: string;
    operator: string;
    value: string;
}

// Column option for select dropdowns
export interface ColumnOption {
    value: string;
    label: string;
    table: string;
}

// Query history item from useQueryHistory hook
export interface QueryHistoryItem {
    sql: string;
    timestamp: number;
    tables: string[];
}

// Table schema info
export interface TableSchema {
    name: string;
    columns: Array<{ name: string; type: string }>;
}

// Query execution progress
export interface QueryProgress {
    rows: number;
    elapsed: number;
}

// Props for sub-components
export interface BuilderHeaderProps {
    databaseName: string;
    isExecuting: boolean;
    queryProgress: QueryProgress | null;
    canGenerate: boolean;
    canExecute: boolean;
    onGenerate: () => void;
    onExecute: () => void;
    onCancel: () => void;
}

export interface BuilderSidebarProps {
    isOpen: boolean;
    onToggle: () => void;
    tables: TableSchema[];
    nodes: Node[];
    history: QueryHistoryItem[];
    availableColumns: ColumnOption[];
    filters: QueryFilter[];
    selectedColumns: string[];
    sortBy: string;
    sortOrder: "ASC" | "DESC";
    groupBy: string;
    limit: number;
    tablesExpanded: boolean;
    configExpanded: boolean;
    historyExpanded: boolean;
    onTablesExpandedChange: (value: boolean) => void;
    onConfigExpandedChange: (value: boolean) => void;
    onHistoryExpandedChange: (value: boolean) => void;
    onAddTable: (tableName: string) => void;
    onRemoveTable: (nodeId: string) => void;
    onFiltersChange: (filters: QueryFilter[]) => void;
    onSelectedColumnsChange: (columns: string[]) => void;
    onSortByChange: (value: string) => void;
    onSortOrderChange: (value: "ASC" | "DESC") => void;
    onGroupByChange: (value: string) => void;
    onLimitChange: (value: number) => void;
    onHistorySelect: (sql: string) => void;
    onClearHistory: () => void;
}

export interface DiagramCanvasProps {
    nodes: Node[];
    edges: Edge[];
    onNodesChange: (changes: any) => void;
    onEdgesChange: (changes: any) => void;
    onConnect: (connection: any) => void;
    onRemoveTable: (nodeId: string) => void;
    selectedEdge: any;
    menuPosition: { x: number; y: number } | null;
    onEdgeClick: (event: React.MouseEvent, edge: any) => void;
    onUpdateJoinType: (joinType: "INNER" | "LEFT" | "RIGHT" | "FULL") => void;
    onCloseMenu: () => void;
}

export interface SQLResultsPanelProps {
    generatedSQL: string;
    tableData: Record<string, any>[];
    rowCount: number;
}

export interface BuilderStatusBarProps {
    tableCount: number;
    joinCount: number;
    filterCount: number;
    limit: number;
    isExecuting: boolean;
}
