// ----------------------------
// File Structure:
// ----------------------------
// handlers/
//   ├── sessionHandlers.ts
//   ├── queryHandlers.ts
//   ├── databaseHandlers.ts
//   └── statsHandlers.ts
// services/
//   ├── queryExecutor.ts
//   ├── connectionBuilder.ts
//   └── databaseService.ts
// utils/
//   └── dbTypeDetector.ts
// types/
//   └── index.ts
// jsonRpcHandlers.ts (orchestrator)

// ----------------------------
// types/index.ts
// ----------------------------
export enum DBType {
  POSTGRES = "postgres",
  MYSQL = "mysql",
}

export type Rpc = {
  sendResponse: (id: number | string, payload: any) => void;
  sendError: (
    id: number | string,
    err: { code?: string; message: string }
  ) => void;
  sendNotification?: (method: string, params?: any) => void;
};

export interface DatabaseConfig {
  host: string;
  port: number;
  user: string;
  password?: string;
  ssl?: boolean;
  database: string;
}

export interface QueryParams {
  sessionId: string;
  dbId: string;
  sql: string;
  batchSize?: number;
}
