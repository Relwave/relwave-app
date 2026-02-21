// ==========================================
// Project Types — mirrors bridge ProjectStore types
// ==========================================

export interface ProjectMetadata {
  version: number;
  id: string;
  databaseId: string;
  name: string;
  description?: string;
  engine?: string;
  defaultSchema?: string;
  /** For imported (cloned) projects — original repo path */
  sourcePath?: string;
  createdAt: string;
  updatedAt: string;
}

export type ProjectSummary = Pick<
  ProjectMetadata,
  "id" | "name" | "description" | "engine" | "databaseId" | "sourcePath" | "createdAt" | "updatedAt"
>;

export interface SavedQuery {
  id: string;
  name: string;
  sql: string;
  description?: string;
  createdAt: string;
  updatedAt: string;
}

export interface QueriesFile {
  version: number;
  projectId: string;
  queries: SavedQuery[];
}

export interface ERNode {
  tableId: string;
  x: number;
  y: number;
  width?: number;
  height?: number;
  collapsed?: boolean;
}

export interface ERDiagramFile {
  version: number;
  projectId: string;
  nodes: ERNode[];
  zoom?: number;
  panX?: number;
  panY?: number;
  updatedAt: string;
}

export interface SchemaSnapshot {
  name: string;
  tables: TableSnapshot[];
}

export interface TableSnapshot {
  name: string;
  type: string;
  columns: ColumnSnapshot[];
}

export interface ColumnSnapshot {
  name: string;
  type: string;
  nullable: boolean;
  isPrimaryKey: boolean;
  isForeignKey: boolean;
  defaultValue: string | null;
  isUnique: boolean;
}

export interface SchemaFile {
  version: number;
  projectId: string;
  databaseId: string;
  schemas: SchemaSnapshot[];
  cachedAt: string;
}

export interface CreateProjectParams {
  databaseId: string;
  name: string;
  description?: string;
  defaultSchema?: string;
}

export interface UpdateProjectParams {
  id: string;
  name?: string;
  description?: string;
  defaultSchema?: string;
}

export interface ProjectExport {
  metadata: ProjectMetadata;
  schema: SchemaFile | null;
  erDiagram: ERDiagramFile | null;
  queries: QueriesFile | null;
}

// ==========================================
// Import Project Types
// ==========================================

/** Read-only scan result — no side effects, just metadata + .env info */
export interface ScanImportResult {
  metadata: {
    name: string;
    description?: string;
    engine?: string;
    defaultSchema?: string;
  };
  envFound: boolean;
  parsedEnv: {
    host?: string;
    port?: number;
    user?: string;
    password?: string;
    database?: string;
    type?: string;
    ssl?: boolean;
    name?: string;
  } | null;
}

export interface ImportProjectParams {
  sourcePath: string;
  databaseId: string;
}
