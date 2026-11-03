import { bridgeRequest } from "./bridgeClient";
import type {
  MongoMigrationManifest,
  MongoMigrationListResult,
  MongoMigrationValidateResult,
  MongoMigrationApplyResult,
  MongoMigrationRollbackResult,
  MongoMigrationGetStatusResult,
} from "@/features/mongodb/types/migration";
import type {
  MongoInferRelationshipsRequest,
  MongoInferRelationshipsResult,
  MongoListRelationshipsRequest,
  MongoListRelationshipsResult,
  MongoSetRelationshipStatusRequest,
  MongoSetRelationshipStatusResult,
  MongoSaveRelationshipRequest,
  MongoSaveRelationshipResult,
  MongoDeleteRelationshipRequest,
  MongoDeleteRelationshipResult,
} from "@/features/mongodb/types/relationship";
import type {
  MongoBulkImportStartRequest,
  MongoBulkImportStartResult,
  MongoBulkImportChunkRequest,
  MongoBulkImportChunkResult,
  MongoBulkExportStartRequest,
  MongoBulkExportStartResult,
  MongoBulkGetOperationStatusRequest,
  MongoBulkOperationStatusResult,
  MongoBulkCancelRequest,
  MongoBulkCancelResult,
  MongoBulkCleanupRequest,
  MongoBulkCleanupResult,
  MongoBulkInsertRequest,
  MongoBulkInsertResult,
  MongoBulkUpdateRequest,
  MongoBulkUpdateResult,
  MongoBulkDeleteRequest,
  MongoBulkDeleteResult,
  MongoBulkExportSaveToRequest,
  MongoBulkExportSaveToResult,
} from "@/features/mongodb/types/bulk";

export type MongoIndexDirection = 1 | -1 | "text" | "2dsphere" | "hashed";

export interface MongoIndexCollation {
  locale: string;
  caseLevel?: boolean;
  caseFirst?: "upper" | "lower" | "off";
  strength?: 1 | 2 | 3 | 4 | 5;
  numericOrdering?: boolean;
  alternate?: "non-ignorable" | "shifted";
  maxVariable?: "punct" | "space";
  backwards?: boolean;
}

export interface MongoIndexOptions {
  name?: string;
  unique?: boolean;
  sparse?: boolean;
  expireAfterSeconds?: number;
  partialFilterExpression?: Record<string, any>;
  collation?: MongoIndexCollation;
  hidden?: boolean;
  background?: boolean;
}

export interface MongoIndexDetails {
  name: string;
  key: Record<string, MongoIndexDirection>;
  sizeBytes: number;
  unique: boolean;
  sparse: boolean;
  isIdIndex: boolean;
  expireAfterSeconds?: number;
  partialFilterExpression?: Record<string, any>;
  collation?: MongoIndexCollation;
  hidden?: boolean;
  v?: number;
  textIndexVersion?: number;
  weights?: Record<string, number>;
  default_language?: string;
  language_override?: string;
  isRedundant?: boolean;
  redundantReason?: string;
}

export interface MongoIndexListRequest {
  dbId: string;
  collection: string;
}

export interface MongoIndexListResult {
  collection: string;
  indexes: MongoIndexDetails[];
  totalSizeBytes: number;
}

export interface MongoIndexCreateRequest {
  dbId: string;
  collection: string;
  key: Record<string, MongoIndexDirection>;
  options?: MongoIndexOptions;
}

export interface MongoIndexCreateResult {
  success: boolean;
  indexName: string;
  executionTimeMs: number;
}

export interface MongoIndexDropRequest {
  dbId: string;
  collection: string;
  indexName: string;
}

export interface MongoIndexDropResult {
  success: boolean;
  droppedIndexName: string;
  executionTimeMs: number;
}

export interface MongoIndexStatsItem {
  name: string;
  key: Record<string, MongoIndexDirection>;
  ops: number;
  since: string;
  host?: string;
}

export interface MongoIndexStatsRequest {
  dbId: string;
  collection: string;
}

export interface MongoIndexStatsResult {
  collection: string;
  stats: Record<string, MongoIndexStatsItem>;
}

export interface MongoIndexHideRequest {
  dbId: string;
  collection: string;
  indexName: string;
  hidden: boolean;
}

export interface MongoIndexHideResult {
  success: boolean;
  indexName: string;
  hidden: boolean;
}

export class DatabaseBridge {
  private bridgeFn: typeof bridgeRequest;

  constructor(bridgeFn: typeof bridgeRequest = bridgeRequest) {
    this.bridgeFn = bridgeFn;
  }

  async listIndexes(dbId: string, collection: string): Promise<MongoIndexListResult> {
    const res = await bridgeRequest("index.list", { dbId, collection });
    return res?.data;
  }

  async createIndex(
    dbId: string,
    collection: string,
    key: Record<string, MongoIndexDirection>,
    options?: MongoIndexOptions,
  ): Promise<MongoIndexCreateResult> {
    const res = await bridgeRequest("index.create", { dbId, collection, key, options });
    return res?.data;
  }

  async dropIndex(
    dbId: string,
    collection: string,
    indexName: string,
  ): Promise<MongoIndexDropResult> {
    const res = await bridgeRequest("index.drop", { dbId, collection, indexName });
    return res?.data;
  }

  async getIndexStats(dbId: string, collection: string): Promise<MongoIndexStatsResult> {
    const res = await bridgeRequest("index.getStats", { dbId, collection });
    return res?.data;
  }

  async hideIndex(
    dbId: string,
    collection: string,
    indexName: string,
    hidden: boolean,
  ): Promise<MongoIndexHideResult> {
    const res = await bridgeRequest("index.hide", { dbId, collection, indexName, hidden });
    return res?.data;
  }

  // ==========================================
  // MongoDB Migration Engine RPC Methods
  // ==========================================

  async listMongoMigrations(
    dbId: string,
    projectRoot?: string,
  ): Promise<MongoMigrationListResult> {
    const res = await bridgeRequest("migration.list", { dbId, projectRoot });
    return res?.data;
  }

  async validateMongoMigration(
    manifest: MongoMigrationManifest,
    dbId?: string,
  ): Promise<MongoMigrationValidateResult> {
    const res = await bridgeRequest("migration.validate", { dbId, manifest });
    return res?.data;
  }

  async applyMongoMigration(
    dbId: string,
    options?: { version?: string; dryRun?: boolean; projectRoot?: string; ownerId?: string },
  ): Promise<MongoMigrationApplyResult> {
    const res = await bridgeRequest("migration.apply", { dbId, ...options });
    return res?.data;
  }

  async rollbackMongoMigration(
    dbId: string,
    version: string,
    options?: { force?: boolean; projectRoot?: string; ownerId?: string },
  ): Promise<MongoMigrationRollbackResult> {
    const res = await bridgeRequest("migration.rollback", { dbId, version, ...options });
    return res?.data;
  }

  async getMongoMigrationStatus(
    dbId: string,
    migrationId?: string,
  ): Promise<MongoMigrationGetStatusResult> {
    const res = await bridgeRequest("migration.getStatus", { dbId, migrationId });
    return res?.data;
  }

  // ==========================================
  // MongoDB Relationship Engine RPC Methods
  // ==========================================

  async inferMongoRelationships(
    request: MongoInferRelationshipsRequest,
  ): Promise<MongoInferRelationshipsResult> {
    const res = await bridgeRequest("mongo.relationship.infer", request);
    return res?.data;
  }

  async listMongoRelationships(
    request: MongoListRelationshipsRequest,
  ): Promise<MongoListRelationshipsResult> {
    const res = await bridgeRequest("mongo.relationship.list", request);
    return res?.data;
  }

  async setMongoRelationshipStatus(
    request: MongoSetRelationshipStatusRequest,
  ): Promise<MongoSetRelationshipStatusResult> {
    const res = await bridgeRequest("mongo.relationship.setStatus", request);
    return res?.data;
  }

  async saveMongoRelationship(
    request: MongoSaveRelationshipRequest,
  ): Promise<MongoSaveRelationshipResult> {
    const res = await bridgeRequest("mongo.relationship.save", request);
    return res?.data;
  }

  async deleteMongoRelationship(
    request: MongoDeleteRelationshipRequest,
  ): Promise<MongoDeleteRelationshipResult> {
    const res = await bridgeRequest("mongo.relationship.delete", request);
    return res?.data;
  }

  // ==========================================
  // MongoDB Bulk Operations Engine RPC Methods
  // ==========================================

  async startMongoBulkImport(
    request: MongoBulkImportStartRequest,
  ): Promise<MongoBulkImportStartResult> {
    const res = await this.bridgeFn("mongo.bulk.importStart", request);
    return res?.data;
  }

  async importMongoBulkChunk(
    request: MongoBulkImportChunkRequest,
  ): Promise<MongoBulkImportChunkResult> {
    const res = await this.bridgeFn("mongo.bulk.importChunk", request);
    return res?.data;
  }

  async startMongoBulkExport(
    request: MongoBulkExportStartRequest,
  ): Promise<MongoBulkExportStartResult> {
    const res = await this.bridgeFn("mongo.bulk.exportStart", request);
    return res?.data;
  }

  async getMongoBulkOperationStatus(
    request: MongoBulkGetOperationStatusRequest,
  ): Promise<MongoBulkOperationStatusResult> {
    const res = await this.bridgeFn("mongo.bulk.getOperationStatus", request);
    return res?.data;
  }

  async cancelMongoBulkOperation(
    request: MongoBulkCancelRequest,
  ): Promise<MongoBulkCancelResult> {
    const res = await this.bridgeFn("mongo.bulk.cancelOperation", request);
    return res?.data;
  }

  async cleanupMongoBulkOperation(
    request: MongoBulkCleanupRequest,
  ): Promise<MongoBulkCleanupResult> {
    const res = await this.bridgeFn("mongo.bulk.cleanupOperation", request);
    return res?.data;
  }

  async bulkInsertMongoDocuments(
    request: MongoBulkInsertRequest,
  ): Promise<MongoBulkInsertResult> {
    const res = await this.bridgeFn("mongo.bulk.insert", request);
    return res?.data;
  }

  async bulkUpdateMongoDocuments(
    request: MongoBulkUpdateRequest,
  ): Promise<MongoBulkUpdateResult> {
    const res = await this.bridgeFn("mongo.bulk.update", request);
    return res?.data;
  }

  async bulkDeleteMongoDocuments(
    request: MongoBulkDeleteRequest,
  ): Promise<MongoBulkDeleteResult> {
    const res = await this.bridgeFn("mongo.bulk.delete", request);
    return res?.data;
  }

  async saveMongoBulkExportTo(
    request: MongoBulkExportSaveToRequest,
  ): Promise<MongoBulkExportSaveToResult> {
    const res = await this.bridgeFn("mongo.bulk.exportSaveTo", request);
    return res?.data;
  }
}

export const databaseBridge = new DatabaseBridge();

export * from "@/features/mongodb/types/bulk";
