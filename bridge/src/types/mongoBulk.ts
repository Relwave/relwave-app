/**
 * MongoDB Milestone 7 Phase 3 — Bulk Operations Types
 *
 * Defines the request/response payloads, operation lifecycle states,
 * and chunked import/export contracts for MongoDB bulk operations.
 */

export type MongoBulkFormat = "json" | "ndjson" | "csv";

export type MongoBulkOperationType = "import" | "export";

export type MongoBulkOperationStatus =
  | "pending"
  | "in_progress"
  | "completed"
  | "failed"
  | "cancelled";

export interface MongoBulkOperation {
  operationId: string;
  type: MongoBulkOperationType;
  status: MongoBulkOperationStatus;
  dbId: string;
  collection: string;
  format: MongoBulkFormat;
  createdAt: string;
  updatedAt: string;
  expiresAt: string;
  totalDocuments?: number;
  processedDocuments: number;
  successfulDocuments: number;
  failedDocuments: number;
  fileSizeBytes?: number;
  error?: string;
  tempFilePath?: string;
}

// ===========================================================================
// Import RPC Interfaces
// ===========================================================================

export interface MongoBulkImportStartRequest {
  dbId: string;
  collection: string;
  format: MongoBulkFormat;
  options?: {
    totalChunksExpected?: number;
  };
}

export interface MongoBulkImportStartResult {
  operationId: string;
  status: MongoBulkOperationStatus;
  format: MongoBulkFormat;
  collection: string;
}

export interface MongoBulkImportChunkRequest {
  operationId: string;
  chunkIndex: number;
  isLastChunk?: boolean;
  payload: string | Record<string, any>[] | any;
}

export interface MongoBulkImportChunkResult {
  operationId: string;
  chunkIndex: number;
  status: MongoBulkOperationStatus;
  insertedCount: number;
  failedCount: number;
  errors?: Array<{ index: number; code: string; message: string }>;
  isComplete: boolean;
  totalInserted: number;
  totalFailed: number;
}

// ===========================================================================
// Export RPC Interfaces
// ===========================================================================

export interface MongoBulkExportStartRequest {
  dbId: string;
  collection: string;
  format: MongoBulkFormat;
  filter?: Record<string, any>;
  projection?: Record<string, any>;
  sort?: Record<string, 1 | -1>;
  limit?: number;
}

export interface MongoBulkExportStartResult {
  operationId: string;
  status: MongoBulkOperationStatus;
  collection: string;
  format: MongoBulkFormat;
}

// ===========================================================================
// Export Save-To RPC Interfaces (Phase 4 Extension)
// ===========================================================================

export interface StagingFileIdentity {
  exactPath: string;
  dev: number;
  ino: number;
  size: number;
  birthtimeMs?: number;
  registeredAt: number;
  retryCount: number;
}

export interface MongoBulkExportSaveToRequest {
  operationId: string;
  destinationPath: string;
  options?: {
    overwrite?: boolean;
  };
}

export interface MongoBulkExportSaveToResult {
  operationId: string;
  destinationPath: string;
  bytesWritten: number;
  success: boolean;
  warning?: string;
}

// ===========================================================================
// Lifecycle & Management RPC Interfaces
// ===========================================================================

export interface MongoBulkGetOperationStatusRequest {
  operationId: string;
}

export interface MongoBulkOperationStatusResult {
  operationId: string;
  type: MongoBulkOperationType;
  status: MongoBulkOperationStatus;
  collection: string;
  format: MongoBulkFormat;
  processedDocuments: number;
  successfulDocuments: number;
  failedDocuments: number;
  fileSizeBytes?: number;
  error?: string;
  createdAt: string;
  updatedAt: string;
  expiresAt: string;
}

export interface MongoBulkCancelRequest {
  operationId: string;
}

export interface MongoBulkCancelResult {
  operationId: string;
  status: "cancelled";
  message: string;
}

export interface MongoBulkCleanupRequest {
  operationId: string;
}

export interface MongoBulkCleanupResult {
  operationId: string;
  success: boolean;
  alreadyCleaned?: boolean;
}

// ===========================================================================
// Supporting Bulk Mutation RPC Interfaces
// ===========================================================================

export interface MongoBulkInsertRequest {
  dbId: string;
  collection: string;
  documents: Record<string, any>[];
  options?: {
    ordered?: boolean;
  };
}

export interface MongoBulkInsertResult {
  collection: string;
  insertedCount: number;
  failedCount: number;
  errors?: Array<{ index: number; code: string; message: string }>;
}

export interface MongoBulkUpdateRequest {
  dbId: string;
  collection: string;
  filter: Record<string, any>;
  update: Record<string, any>;
  options?: {
    multi?: boolean;
    upsert?: boolean;
    allowUnrestricted?: boolean;
  };
}

export interface MongoBulkUpdateResult {
  collection: string;
  matchedCount: number;
  modifiedCount: number;
  upsertedId?: any;
  advisoryWarning?: string;
}

export interface MongoBulkDeleteRequest {
  dbId: string;
  collection: string;
  filter: Record<string, any>;
  options?: {
    allowUnrestricted?: boolean;
  };
}

export interface MongoBulkDeleteResult {
  collection: string;
  deletedCount: number;
  advisoryWarning?: string;
}
