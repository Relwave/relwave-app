/**
 * MongoDB Milestone 7 — Relationship Types & Bridge RPC Contracts.
 *
 * Matches bridge/src/types/mongo.ts.
 */

export type MongoCardinality =
  | "one-to-one"
  | "one-to-many"
  | "many-to-one"
  | "many-to-many"
  | "unknown"
  | "insufficient-evidence";

export interface MongoRelationshipEvidence {
  sourceCollection: string;
  sourceField: string;
  targetCollection: string;
  targetField: string;
  sampleCount: number;
  hitCount: number;
  hitRatio: number; // 0.0 - 1.0 (must be >= 0.50 to consider)
  hasNamePatternMatch: boolean;
  isBsonTypeMatch: boolean;
  multipleSourcesPerTarget: boolean; // required for many-to-one or many-to-many
  isArrayReference: boolean;
  hasUniqueIndexOnSource: boolean;
  sampleMatches: Array<{ sourceValue: string; targetId: string }>;
}

export interface MongoInferredRelationship {
  id: string; // e.g. "orders.user_id->users._id"
  sourceCollection: string;
  sourceField: string;
  targetCollection: string;
  targetField: string; // usually "_id"
  cardinality: MongoCardinality;
  confidence: number; // 0.0 - 1.0 (>= 0.65 to display)
  evidence: MongoRelationshipEvidence;
  status: "inferred" | "confirmed" | "rejected";
  inferredAt: string;
}

export interface MongoRelationship {
  id: string;
  sourceCollection: string;
  sourceField: string;
  targetCollection: string;
  targetField: string;
  cardinality: MongoCardinality;
  isManual?: boolean;
  description?: string;
  createdAt: string;
  updatedAt: string;
}

export interface MongoRelationshipsFile {
  version: number;
  projectId?: string;
  databaseId: string;
  inferred: MongoInferredRelationship[];
  confirmed: MongoRelationship[];
  rejectedIds: string[];
  manual: MongoRelationship[];
  insufficientEvidence?: MongoInferredRelationship[];
  updatedAt: string;
}

// --- RPC Request / Response Interfaces ---

export interface MongoInferRelationshipsRequest {
  dbId: string;
  projectId?: string;
  collections?: string[];
  sampleSize?: number;
  maxCollections?: number;
  timeoutMs?: number;
}

export interface MongoInferRelationshipsResult {
  relationships: MongoInferredRelationship[]; // actionable (confidence >= 0.65)
  insufficientEvidence: MongoInferredRelationship[]; // diagnostic (confidence < 0.65)
  inferredAt: string;
  collectionsScanned: number;
  timedOut?: boolean;
}

export interface MongoListRelationshipsRequest {
  dbId: string;
  projectId?: string;
}

export interface MongoListRelationshipsResult {
  inferred: MongoInferredRelationship[];
  confirmed: MongoRelationship[];
  rejectedIds: string[];
  manual: MongoRelationship[];
  insufficientEvidence?: MongoInferredRelationship[];
}

export interface MongoSetRelationshipStatusRequest {
  dbId: string;
  projectId?: string;
  relationshipId: string;
  status: "confirmed" | "rejected";
}

export interface MongoSetRelationshipStatusResult {
  relationshipId: string;
  status: "confirmed" | "rejected";
}

export interface MongoSaveRelationshipRequest {
  dbId: string;
  projectId?: string;
  relationship: MongoRelationship;
}

export interface MongoSaveRelationshipResult {
  relationship: MongoRelationship;
}

export interface MongoDeleteRelationshipRequest {
  dbId: string;
  projectId?: string;
  relationshipId: string;
}

export interface MongoDeleteRelationshipResult {
  success: boolean;
  relationshipId: string;
}
