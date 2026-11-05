/**
 * MongoDB Milestone 7 Phase 4 — Bulk Operations Frontend Types
 *
 * Defines the request/response payloads, operation lifecycle states,
 * tracking records, and history models for bulk operations in RelWave.
 *
 * Matches bridge/src/types/mongoBulk.ts and docs/M7_PHASE4_SPEC.md.
 */

export type MongoBulkFormat = "json" | "ndjson" | "csv";

export type MongoBulkOperationType = "import" | "export";

export type MongoBulkOperationStatus =
  | "pending"
  | "in_progress"
  | "completed"
  | "failed"
  | "cancelled";

// ===========================================================================
// Reusable Recursive Document & Value Types
// ===========================================================================

export type MongoBulkValue =
  | string
  | number
  | boolean
  | null
  | undefined
  | MongoBulkValue[]
  | MongoBulkDocument;

export interface MongoBulkDocument {
  [key: string]: MongoBulkValue;
}

export type MongoBulkFilter = MongoBulkDocument;

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
  payload: string | MongoBulkDocument[];
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
  filter?: MongoBulkDocument;
  projection?: MongoBulkDocument;
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
  documents: MongoBulkDocument[];
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
  filter: MongoBulkDocument;
  update: MongoBulkDocument;
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
  upsertedId?: unknown;
  advisoryWarning?: string;
}

export interface MongoBulkDeleteRequest {
  dbId: string;
  collection: string;
  filter: MongoBulkDocument;
  options?: {
    allowUnrestricted?: boolean;
  };
}

export interface MongoBulkDeleteResult {
  collection: string;
  deletedCount: number;
  advisoryWarning?: string;
}

// ===========================================================================
// Frontend Tracking & Operation History Interfaces (Stage 5 Extension)
// ===========================================================================

/**
 * Asynchronous Bridge-Managed Operation History (import, export).
 */
export interface TrackedAsyncBulkOperation {
  kind: "async";
  operationId: string;
  dbId: string;
  collection: string;
  type: "import" | "export";
  status: MongoBulkOperationStatus | "stale";
  saveStatus?: "not_saved" | "saving" | "saved" | "save_failed";
  isUnreachable?: boolean;
  format?: MongoBulkFormat | string;
  processedDocuments: number;
  successfulDocuments: number;
  failedDocuments: number;
  fileSizeBytes?: number;
  destinationPath?: string;
  warning?: string;
  error?: string;
  createdAt: string;
  updatedAt: string;
  expiresAt: string;
  hasAuthoritativeExpiresAt?: boolean; // True once reconciled from bridge status RPC
}

/**
 * Synchronous Frontend-Managed Mutation History (insert, update, delete).
 */
export interface TrackedSyncBulkMutation {
  kind: "sync";
  id: string; // Client-generated UUIDv4
  dbId: string;
  collection: string;
  type: "insert" | "update" | "delete";
  status: "running" | "completed" | "failed";
  timestamp: string;
  matchedCount?: number;
  modifiedCount?: number;
  deletedCount?: number;
  insertedCount?: number;
  failedCount?: number;
  upsertedId?: unknown;
  advisoryWarning?: string;
  error?: string;
}

export type BulkHistoryEntry = TrackedAsyncBulkOperation | TrackedSyncBulkMutation;

export interface PollerControl {
  timerId: ReturnType<typeof setTimeout> | null;
  inFlight: boolean;
  consecutiveErrors: number;
  isCancelled: boolean;
}

export interface ImportExecutionControl {
  abortController: AbortController;
  cancelFn: () => Promise<void>;
  activeCancellationPromise?: Promise<void> | null;
}

export interface ImportProgress {
  documentsParsed: number;
  documentsSubmitted: number;
  documentsAcknowledged: number;
  totalInserted: number;
  totalFailed: number;
  bytesAcknowledged: number;
  cumulativeBytesSent: number;
  currentChunkIndex: number;
  totalChunksExpected?: number;
}

export interface BulkImportOptions {
  cancelOnUnmount?: boolean;
  onOperationStart?: (
    operation: TrackedAsyncBulkOperation,
    abortController: AbortController,
    cancelFn: () => Promise<void>,
  ) => void;
  onChunkAcknowledged?: (
    progress: ImportProgress,
    chunkResult: MongoBulkImportChunkResult,
  ) => void;
  onTerminalState?: (operationId: string, status: MongoBulkOperationStatus, error?: string) => void;
}

export interface MongoBulkExportOptions {
  pollingTimeoutMs?: number;
  initialIntervalMs?: number;
  maxIntervalMs?: number;
  cancelOnUnmount?: boolean;
  externalPolling?: boolean;
  onOperationStart?: (operation: TrackedAsyncBulkOperation) => void;
}

export interface MongoBulkOperationsState {
  operationsByDb: Record<string, BulkHistoryEntry[]>;
  activePollers: Map<string, PollerControl>;
  activeExecutionControls: Map<string, ImportExecutionControl>;

  // Actions
  registerAsyncOperation: (
    dbId: string,
    op: TrackedAsyncBulkOperation,
    control?: ImportExecutionControl,
  ) => void;
  updateAsyncOperation: (operationId: string, patch: Partial<TrackedAsyncBulkOperation>) => void;
  registerSyncMutation: (dbId: string, mutation: TrackedSyncBulkMutation) => void;
  updateSyncMutation: (id: string, patch: Partial<TrackedSyncBulkMutation>) => void;
  markOperationStale: (operationId: string, reason: string) => void;
  setOperationUnreachable: (operationId: string, unreachable: boolean) => void;
  retryPolling: (operationId: string) => void;
  cancelOperation: (operationId: string) => Promise<void>;
  cleanupOperation: (operationId: string) => Promise<void>;
  removeOperation: (operationId: string) => void;
  clearExpiredOperations: (dbId: string) => void;
  resetStore: () => void;
}

// ===========================================================================
// Type Discrimination Helpers
// ===========================================================================

export function isAsyncBulkOperation(
  entry: BulkHistoryEntry,
): entry is TrackedAsyncBulkOperation {
  return entry.kind === "async";
}

export function isSyncBulkMutation(
  entry: BulkHistoryEntry,
): entry is TrackedSyncBulkMutation {
  return entry.kind === "sync";
}
