/**
 * MongoDB Milestone 6 — Declarative Migration Engine Types.
 *
 * Defines the AST, schema, lock models, event log documents,
 * and RPC interfaces for MongoDB migrations.
 */

export type MongoMigrationStepType =
  | "createCollection"
  | "dropCollection"
  | "createIndex"
  | "dropIndex"
  | "setValidator"
  | "updateMany";

export interface MongoCreateCollectionStep {
  type: "createCollection";
  collection: string;
  options?: {
    capped?: boolean;
    size?: number;
    max?: number;
    validator?: Record<string, any>;
    validationLevel?: "off" | "strict" | "moderate";
    validationAction?: "error" | "warn";
    collation?: Record<string, any>;
  };
}

export interface MongoDropCollectionStep {
  type: "dropCollection";
  collection: string;
}

export interface MongoCreateIndexStep {
  type: "createIndex";
  collection: string;
  key: Record<string, 1 | -1 | "text" | "2dsphere" | "hashed">;
  options?: {
    name?: string;
    unique?: boolean;
    sparse?: boolean;
    expireAfterSeconds?: number;
    partialFilterExpression?: Record<string, any>;
    collation?: Record<string, any>;
    hidden?: boolean;
    background?: boolean;
  };
}

export interface MongoDropIndexStep {
  type: "dropIndex";
  collection: string;
  indexName: string;
}

export interface MongoSetValidatorStep {
  type: "setValidator";
  collection: string;
  validator: Record<string, any>;
  validationLevel?: "off" | "strict" | "moderate";
  validationAction?: "error" | "warn";
}

export interface MongoUpdateManyStep {
  type: "updateMany";
  collection: string;
  filter: Record<string, any>;
  update: Record<string, any>;
  options?: {
    upsert?: boolean;
    arrayFilters?: Record<string, any>[];
    collation?: Record<string, any>;
  };
}

/**
 * Discriminated union of all supported migration steps.
 * Note: `deleteMany` is permanently excluded.
 */
export type MongoMigrationStep =
  | MongoCreateCollectionStep
  | MongoDropCollectionStep
  | MongoCreateIndexStep
  | MongoDropIndexStep
  | MongoSetValidatorStep
  | MongoUpdateManyStep;

export interface MongoMigrationManifest {
  version: string;
  id: string;
  name: string;
  description?: string;
  author?: string;
  allowIrreversible?: boolean;
  up: MongoMigrationStep[];
  down?: MongoMigrationStep[];
}

export type MongoMigrationEventType =
  | "VALIDATION_SUCCESS"
  | "LOCK_ACQUIRED"
  | "MIGRATION_START"
  | "STEP_START"
  | "STEP_COMPLETE"
  | "STEP_FAILED"
  | "STEP_UNCERTAIN"
  | "COMPENSATION_START"
  | "COMPENSATION_COMPLETE"
  | "COMPENSATION_FAILED"
  | "MIGRATION_APPLIED"
  | "MIGRATION_ROLLED_BACK"
  | "LOCK_RELEASED"
  | "MANUAL_INTERVENTION_REQUIRED";

export interface MongoMigrationEvent {
  _id: string;
  eventId: string;
  migrationId: string;
  attemptId: string;
  attemptNumber: number;
  sequenceNumber: number;
  stepIndex?: number;
  stepType?: string;
  eventType: MongoMigrationEventType;
  timestamp: string;
  lockOwnerId: string;
  fencingToken: number;
  metadata?: Record<string, any>;
}

export type MongoMigrationStatus =
  | "PENDING"
  | "ACQUIRING_LOCK"
  | "APPLYING"
  | "FAILED_PARTIAL"
  | "CRASHED_UNCERTAIN"
  | "ROLLING_BACK"
  | "ROLLED_BACK"
  | "APPLIED"
  | "FAILED_MANUAL_INTERVENTION_REQUIRED";

export type MongoMigrationStepStatus =
  "STEP_PENDING" | "STEP_RUNNING" | "STEP_COMPLETED" | "STEP_FAILED" | "STEP_UNCERTAIN";

export type MongoMigrationDriftStatus = "VERIFIED" | "DRIFTED" | "UNVERIFIABLE";

export type MongoMigrationDriftReason =
  | "CHECKSUM_MATCH"
  | "CHECKSUM_MISMATCH"
  | "MANIFEST_MISSING"
  | "RECORDED_CHECKSUM_MISSING"
  | "MANIFEST_PARSE_ERROR";

export interface MongoMigrationDriftDetails {
  status: MongoMigrationDriftStatus;
  reason: MongoMigrationDriftReason;
  expectedChecksum?: string;
  actualChecksum?: string;
  message?: string;
}

export interface MongoMigrationSummary {
  _id: string; // Matches manifest ID
  name: string;
  checksum: string;
  status: MongoMigrationStatus;
  startedAt: string;
  completedAt?: string;
  durationMs?: number;
  totalDurationMs?: number;
  executedSteps: number;
  totalSteps: number;
  lastExecutedStepIndex?: number;
  fencingToken: number;
  attemptNumber?: number;
  attemptId?: string;
  error?: string | { stepIndex?: number; stepType?: string; message: string };
  isReversible?: boolean;
  appliedBy?: string;
  // AUD-05 Additions:
  driftStatus?: MongoMigrationDriftStatus;
  drifted?: boolean;
  driftDetails?: MongoMigrationDriftDetails;
}

export interface MongoMigrationLockDoc {
  _id: "migration_lock";
  ownerId: string | null;
  fencingToken: number;
  acquiredAt?: Date | string | null;
  heartbeatAt?: Date | string | null;
  expiresAt?: Date | string | null;
  releasedAt?: Date | string | null;
  migrationId?: string | null;
}

export interface MongoMigrationLockStatus {
  isLocked: boolean;
  ownerId?: string;
  fencingToken?: number;
  expiresAt?: string;
  isExpired: boolean;
  migrationId?: string;
}

// ==========================================
// RPC Request & Result Types
// ==========================================

export interface MongoMigrationListRequest {
  dbId: string;
  projectRoot?: string;
}

export interface MongoMigrationListResult {
  appliedMigrations: MongoMigrationSummary[];
  pendingMigrations: {
    id: string;
    name: string;
    filename: string;
    checksum: string;
    stepCount: number;
    isReversible: boolean;
  }[];
  isLocked: boolean;
  lockDetails?: {
    ownerId?: string;
    fencingToken?: number;
    acquiredAt?: string;
    expiresAt?: string;
    migrationId?: string;
  };
}

export interface MongoMigrationValidateRequest {
  dbId?: string;
  manifest: MongoMigrationManifest;
}

export interface MongoMigrationValidateResult {
  valid: boolean;
  errors: string[];
  warnings: string[];
  stepsBreakdown: {
    ddlCount: number;
    dataTransformCount: number;
    reversibleCount: number;
    irreversibleCount: number;
  };
}

export interface MongoMigrationApplyRequest {
  dbId: string;
  version?: string;
  dryRun?: boolean;
  projectRoot?: string;
  ownerId?: string;
}

export interface MongoMigrationApplyResult {
  success: boolean;
  appliedCount: number;
  results: {
    id: string;
    name: string;
    executionTimeMs: number;
    status: MongoMigrationStatus;
    executedSteps: number;
    error?: string;
  }[];
}

export interface MongoMigrationRollbackRequest {
  dbId: string;
  version: string;
  force?: boolean;
  projectRoot?: string;
  ownerId?: string;
}

export interface MongoMigrationRollbackResult {
  success: boolean;
  version: string;
  status: MongoMigrationStatus;
  executionTimeMs: number;
  stepsCompensated: number;
  error?: string;
}

export interface MongoMigrationGetStatusRequest {
  dbId: string;
  migrationId?: string;
}

export interface MongoMigrationGetStatusResult {
  migration?: MongoMigrationSummary;
  events?: MongoMigrationEvent[];
  lockStatus: MongoMigrationLockStatus;
  lastAppliedVersion?: string;
  lastAppliedAt?: string;
  pendingCount?: number;
}
