import { Db, ObjectId, Document } from "mongodb";
import { DatabaseService } from "./databaseService";
import { projectStoreInstance, ProjectStore } from "./projectStore";
import { selectDb } from "../connectors/mongo";
import { DBType } from "../types";
import {
  MongoCardinality,
  MongoRelationshipEvidence,
  MongoInferredRelationship,
  MongoRelationship,
  MongoRelationshipsFile,
  MongoInferRelationshipsRequest,
  MongoInferRelationshipsResult,
  MongoListRelationshipsResult,
  MongoSetRelationshipStatusResult,
  MongoSaveRelationshipResult,
  MongoDeleteRelationshipResult,
} from "../types/mongo";

interface CandidateField {
  sourcePath: string;
  isArray: boolean;
  sampleValues: unknown[];
  targetNameCandidates: string[];
}

export class MongoRelationshipEngine {
  constructor(
    private dbService: DatabaseService = new DatabaseService(),
    private projectStore: ProjectStore = projectStoreInstance,
  ) {}

  /**
   * Acquire native MongoDB Db object via connection config
   */
  async getDb(dbId: string): Promise<Db> {
    const { conn, dbType } = await this.dbService.getDatabaseConnection(dbId);
    if (dbType !== DBType.MONGODB) {
      throw new Error(`Database ${dbId} is not a MongoDB database (type: ${dbType})`);
    }
    return selectDb(conn);
  }

  /**
   * Derive candidate collection names from a field name (e.g. userId -> [users, user])
   */
  deriveCandidateCollectionNames(fieldPath: string): string[] {
    const leaf = fieldPath.split(".").pop() || fieldPath;
    const stripped = leaf.replace(/(_ids|_id|Ids|Id)$/i, "");
    if (!stripped) return [];

    const lower = stripped.toLowerCase();
    const candidates = new Set<string>();
    candidates.add(lower);

    // Common pluralization / singularization rules
    if (lower.endsWith("y")) {
      candidates.add(`${lower.slice(0, -1)}ies`);
    } else if (
      lower.endsWith("s") ||
      lower.endsWith("sh") ||
      lower.endsWith("ch") ||
      lower.endsWith("x") ||
      lower.endsWith("z")
    ) {
      candidates.add(`${lower}es`);
      if (lower.endsWith("s") && lower.length > 2) {
        candidates.add(lower.slice(0, -1));
      }
    } else {
      candidates.add(`${lower}s`);
    }

    return Array.from(candidates);
  }

  /**
   * Test if a value looks like an ObjectId or 24-char hex string
   */
  isObjectIdOrHex(val: unknown): boolean {
    if (!val) return false;
    if (
      val instanceof ObjectId ||
      (typeof val === "object" && (val as any)._bsontype === "ObjectId")
    ) {
      return true;
    }
    if (typeof val === "object" && typeof (val as any).$oid === "string") {
      return true;
    }
    if (typeof val === "string" && /^[0-9a-fA-F]{24}$/.test(val)) {
      return true;
    }
    return false;
  }

  /**
   * Normalize an ObjectId or hex string to a string ID
   */
  normalizeIdValue(val: unknown): string | null {
    if (val === null || val === undefined) return null;
    if (val instanceof ObjectId) return val.toHexString();
    if (typeof val === "object" && (val as any)._bsontype === "ObjectId") {
      return (val as any).toHexString?.() || String(val);
    }
    if (typeof val === "object" && typeof (val as any).$oid === "string") {
      return (val as any).$oid;
    }
    if (typeof val === "string") return val;
    return String(val);
  }

  /**
   * Convert normalized string ID to BSON query value (ObjectId if hex)
   */
  toQueryId(val: string): unknown {
    if (/^[0-9a-fA-F]{24}$/.test(val)) {
      try {
        return new ObjectId(val);
      } catch {
        return val;
      }
    }
    return val;
  }

  /**
   * Extract candidate reference fields from sampled documents (LOW-02: Embedded Subdocument Arrays)
   */
  extractCandidateFields(docs: Document[]): CandidateField[] {
    const fieldMap = new Map<string, { isArray: boolean; values: unknown[] }>();

    const traverse = (obj: any, prefix = "", depth = 1, inArray = false) => {
      if (!obj || typeof obj !== "object" || depth > 3) return;

      for (const [key, value] of Object.entries(obj)) {
        if (key === "_bsontype") continue;
        const currentPath = prefix ? `${prefix}.${key}` : key;

        // Skip root document's own _id and embedded subdocument _id
        if (key === "_id" || currentPath === "_id" || currentPath.endsWith("._id")) {
          continue;
        }

        const isArray = Array.isArray(value);
        const hasFkNamePattern = /(_ids|_id|Ids|Id)$/i.test(key) || key.toLowerCase() === "id";

        if (isArray) {
          const arr = value as unknown[];
          const sampleSlice = arr.slice(0, 5);

          // Check if elements are subdocuments
          const isArrayOfObjects = sampleSlice.some(
            (el) =>
              el &&
              typeof el === "object" &&
              !(el instanceof ObjectId) &&
              !(el as any)._bsontype &&
              !(el as any).$oid &&
              !(el instanceof Date),
          );

          if (isArrayOfObjects) {
            for (const item of sampleSlice) {
              if (
                item &&
                typeof item === "object" &&
                !(item instanceof ObjectId) &&
                !(item as any)._bsontype &&
                !(item as any).$oid &&
                !(item instanceof Date)
              ) {
                traverse(item, currentPath, depth + 1, true);
              }
            }
          } else {
            const hasRefElements = sampleSlice.some(
              (el) => this.isObjectIdOrHex(el) || (hasFkNamePattern && typeof el === "string"),
            );
            if (hasRefElements || hasFkNamePattern) {
              if (!fieldMap.has(currentPath)) {
                fieldMap.set(currentPath, { isArray: true, values: [] });
              }
              const entry = fieldMap.get(currentPath)!;
              entry.isArray = true;
              for (const item of arr) {
                if (item !== null && item !== undefined) entry.values.push(item);
              }
            }
          }
        } else if (
          value &&
          typeof value === "object" &&
          !(value instanceof ObjectId) &&
          !(value as any)._bsontype &&
          !(value as any).$oid &&
          !(value instanceof Date)
        ) {
          traverse(value, currentPath, depth + 1, inArray);
        } else {
          const isRefVal = this.isObjectIdOrHex(value);
          if (isRefVal || (hasFkNamePattern && typeof value === "string")) {
            if (!fieldMap.has(currentPath)) {
              fieldMap.set(currentPath, { isArray: inArray, values: [] });
            }
            const entry = fieldMap.get(currentPath)!;
            if (inArray) entry.isArray = true;
            if (value !== null && value !== undefined) entry.values.push(value);
          }
        }
      }
    };

    for (const doc of docs) {
      traverse(doc, "", 1, false);
    }

    const candidates: CandidateField[] = [];
    for (const [path, info] of fieldMap.entries()) {
      candidates.push({
        sourcePath: path,
        isArray: info.isArray,
        sampleValues: info.values,
        targetNameCandidates: this.deriveCandidateCollectionNames(path),
      });
    }

    return candidates;
  }

  /**
   * Helper to safely extract nested dot-path value from an object,
   * supporting traversal through arrays of objects (LOW-02).
   */
  extractFieldValue(obj: any, path: string): unknown {
    if (!obj || typeof obj !== "object") return undefined;
    const parts = path.split(".");

    const resolve = (current: any, index: number): unknown => {
      if (current === null || current === undefined) return undefined;
      if (index >= parts.length) return current;

      const part = parts[index];
      if (Array.isArray(current)) {
        const remainingPath = parts.slice(index).join(".");
        const mapped = current
          .map((item) => this.extractFieldValue(item, remainingPath))
          .filter((v) => v !== undefined);
        return mapped.flat();
      }

      const nextVal = current[part];
      if (Array.isArray(nextVal) && index + 1 < parts.length) {
        const remainingPath = parts.slice(index + 1).join(".");
        const mapped = nextVal
          .map((item) => this.extractFieldValue(item, remainingPath))
          .filter((v) => v !== undefined);
        return mapped.flat();
      }

      return resolve(nextVal, index + 1);
    };

    return resolve(obj, 0);
  }

  /**
   * Infer relationships across collections in a MongoDB database
   */
  async inferRelationships(
    dbId: string,
    options?: Omit<MongoInferRelationshipsRequest, "dbId">,
  ): Promise<MongoInferRelationshipsResult> {
    const db = await this.getDb(dbId);
    const sampleSize = Math.max(10, Math.min(options?.sampleSize ?? 100, 500));
    const maxCollections = Math.max(1, Math.min(options?.maxCollections ?? 50, 200));

    // Overall deadline (HIGH-01 / LOW-01)
    const timeoutMs = Math.max(1000, Math.min(options?.timeoutMs ?? 30000, 120000));
    const deadline = Date.now() + timeoutMs;
    let timedOut = false;

    // 1. Retrieve and filter collection names
    const allCollections = await db.listCollections({}, { nameOnly: true }).toArray();
    const allCollectionNames = allCollections
      .map((c) => c.name)
      .filter((name) => !name.startsWith("system."));

    let collectionNames: string[];
    if (options?.collections) {
      collectionNames = options.collections.filter((c) => allCollectionNames.includes(c));
      if (collectionNames.length === 0) {
        return {
          relationships: [],
          insufficientEvidence: [],
          inferredAt: new Date().toISOString(),
          collectionsScanned: 0,
        };
      }
    } else {
      collectionNames = allCollectionNames.slice(0, maxCollections);
    }

    // 2. Sample each collection and collect unique indexes
    const collectionDocs = new Map<string, Document[]>();
    const collectionUniqueIndexes = new Map<string, Set<string>>();

    for (const colName of collectionNames) {
      const remainingMs = deadline - Date.now();
      if (remainingMs <= 0) {
        timedOut = true;
        break;
      }
      try {
        const queryTimeMs = Math.max(1, Math.min(5000, remainingMs));
        const docs = await db
          .collection(colName)
          .find({}, { limit: sampleSize, maxTimeMS: queryTimeMs })
          .toArray();
        collectionDocs.set(colName, docs);

        // Scan indexes for single-field unconditional uniqueness (MED-01)
        const indexes = await db
          .collection(colName)
          .indexes()
          .catch(() => []);
        const uniqueFields = new Set<string>();
        for (const idx of indexes) {
          if (idx.unique && !idx.sparse && !idx.partialFilterExpression && idx.key) {
            const keys = Object.keys(idx.key);
            if (keys.length === 1) {
              uniqueFields.add(keys[0]);
            }
          }
        }
        collectionUniqueIndexes.set(colName, uniqueFields);
      } catch {
        collectionDocs.set(colName, []);
        collectionUniqueIndexes.set(colName, new Set());
      }
    }

    // 3. Extract candidate fields per collection
    const candidateMap = new Map<string, CandidateField[]>();
    for (const colName of collectionNames) {
      const docs = collectionDocs.get(colName) || [];
      candidateMap.set(colName, this.extractCandidateFields(docs));
    }

    interface EvaluatedHit {
      sourceCol: string;
      candidate: CandidateField;
      targetCol: string;
      queryValues: unknown[];
      hitCount: number;
      hitRatio: number;
      matchedIds: Set<string>;
      sampleMatches: Array<{ sourceValue: string; targetId: string }>;
    }

    const rawHits: EvaluatedHit[] = [];

    // 4. Cross-collection reference verification
    for (const sourceCol of collectionNames) {
      if (Date.now() >= deadline) {
        timedOut = true;
        break;
      }
      const candidates = candidateMap.get(sourceCol) || [];
      const sourceDocs = collectionDocs.get(sourceCol) || [];

      for (const cand of candidates) {
        if (Date.now() >= deadline) {
          timedOut = true;
          break;
        }

        // Collect distinct source values (up to 50)
        const distinctNormalized = Array.from(
          new Set(
            cand.sampleValues
              .map((v) => this.normalizeIdValue(v))
              .filter((v): v is string => v !== null && v !== ""),
          ),
        ).slice(0, 50);

        if (distinctNormalized.length === 0) continue;

        // Bounded target discovery (HIGH-01 / LOW-REM-02)
        const MAX_TARGETS_PER_CANDIDATE = 3;
        const matchingTargets: string[] = [];
        for (const targetCand of cand.targetNameCandidates) {
          const matched = collectionNames.find((c) => c.toLowerCase() === targetCand.toLowerCase());
          if (matched && !matchingTargets.includes(matched)) {
            matchingTargets.push(matched);
          }
        }

        // Test only target collections matching derived candidate names (up to cap)
        // If no candidate name matches, do not probe arbitrary collections (LOW-REM-02)
        const targetCollectionsToTest = matchingTargets.slice(0, MAX_TARGETS_PER_CANDIDATE);

        // Test each candidate target collection
        for (const targetCol of targetCollectionsToTest) {
          const remainingMs = deadline - Date.now();
          if (remainingMs <= 0) {
            timedOut = true;
            break;
          }
          try {
            // Correctness: 24-Hex String & BSON ObjectId Normalization
            const queryValues: unknown[] = [];
            const seenOids = new Set<string>();
            const seenRaw = new Set<unknown>();

            for (const id of distinctNormalized) {
              if (/^[0-9a-fA-F]{24}$/.test(id)) {
                try {
                  if (!seenOids.has(id)) {
                    queryValues.push(new ObjectId(id));
                    seenOids.add(id);
                  }
                } catch {
                  // ignore
                }
                if (!seenRaw.has(id)) {
                  queryValues.push(id);
                  seenRaw.add(id);
                }
              } else {
                if (!seenRaw.has(id)) {
                  queryValues.push(id);
                  seenRaw.add(id);
                }
              }
            }

            const queryFilter: any = {
              _id: { $in: queryValues },
            };

            const queryTimeMs = Math.max(1, Math.min(5000, remainingMs));
            const hits = await db
              .collection(targetCol)
              .find(queryFilter, { projection: { _id: 1 }, maxTimeMS: queryTimeMs })
              .limit(50)
              .toArray();

            const matchedIds = new Set<string>(
              hits
                .map((h) => this.normalizeIdValue(h._id))
                .filter((id): id is string => id !== null),
            );
            const hitCount = matchedIds.size;
            const hitRatio = hitCount / distinctNormalized.length;

            // Reject if hitRatio < 0.50
            if (hitRatio < 0.5) continue;

            // Construct sample match pairs
            const sampleMatches: Array<{ sourceValue: string; targetId: string }> = [];
            for (const doc of sourceDocs) {
              const val = this.extractFieldValue(doc, cand.sourcePath);
              if (Array.isArray(val)) {
                for (const item of val) {
                  const norm = this.normalizeIdValue(item);
                  if (norm && matchedIds.has(norm) && sampleMatches.length < 5) {
                    sampleMatches.push({ sourceValue: norm, targetId: norm });
                  }
                }
              } else {
                const norm = this.normalizeIdValue(val);
                if (norm && matchedIds.has(norm) && sampleMatches.length < 5) {
                  sampleMatches.push({ sourceValue: norm, targetId: norm });
                }
              }
              if (sampleMatches.length >= 5) break;
            }

            rawHits.push({
              sourceCol,
              candidate: cand,
              targetCol,
              queryValues,
              hitCount,
              hitRatio,
              matchedIds,
              sampleMatches,
            });
          } catch {
            // verification query error -> skip candidate
          }
        }
      }
    }

    // 5. Compute Confidence and Cardinality with Ambiguity Penalty
    const inferredCandidates: MongoInferredRelationship[] = [];
    const insufficientCandidates: MongoInferredRelationship[] = [];

    for (const hit of rawHits) {
      const {
        sourceCol,
        candidate: cand,
        targetCol,
        hitRatio,
        hitCount,
        sampleMatches,
        matchedIds,
      } = hit;
      const sourceDocs = collectionDocs.get(sourceCol) || [];

      // Check if source candidate values also matched in other target collections
      const matchingTargetCount = rawHits.filter(
        (h) => h.sourceCol === sourceCol && h.candidate.sourcePath === cand.sourcePath,
      ).length;
      const ambiguityPenalty = matchingTargetCount > 1 ? 0.3 : 0.0;

      // NameScore calculation
      let nameScore = 0.0;
      const targetLower = targetCol.toLowerCase();
      const hasDirectNameMatch = cand.targetNameCandidates.some(
        (c) => c.toLowerCase() === targetLower,
      );
      if (hasDirectNameMatch) {
        nameScore = 1.0;
      } else if (
        /(_ids|_id|Ids|Id)$/i.test(cand.sourcePath) ||
        cand.sourcePath.toLowerCase() === "id"
      ) {
        nameScore = 0.5;
      }

      // TypeScore calculation
      let typeScore = 0.3; // generic string default
      const sampleVal = cand.sampleValues.find((v) => v !== null && v !== undefined);
      if (
        sampleVal instanceof ObjectId ||
        (sampleVal && (sampleVal as any)._bsontype === "ObjectId")
      ) {
        typeScore = 1.0;
      } else if (typeof sampleVal === "string" && /^[0-9a-fA-F]{24}$/.test(sampleVal)) {
        typeScore = 0.7;
      }

      // Final confidence formula:
      // C = 0.55 * HitRatio + 0.25 * NameScore + 0.20 * TypeScore - AmbiguityPenalty
      let confidence = 0.55 * hitRatio + 0.25 * nameScore + 0.2 * typeScore - ambiguityPenalty;
      confidence = Math.max(0.0, Math.min(1.0, Math.round(confidence * 100) / 100));

      // 6. Rigorous Cardinality Inference
      let cardinality: MongoCardinality = "unknown";

      // Check single-field unconditional unique index on source field (MED-01)
      const uniqueIndexes = collectionUniqueIndexes.get(sourceCol) || new Set();
      const hasUniqueIndexOnSource = uniqueIndexes.has(cand.sourcePath);

      // Check if multiple distinct source documents reference the SAME target ID
      const targetRefDocCounts = new Map<string, number>();
      for (const doc of sourceDocs) {
        const val = this.extractFieldValue(doc, cand.sourcePath);
        const referencedInDoc = new Set<string>();
        if (Array.isArray(val)) {
          for (const item of val) {
            const norm = this.normalizeIdValue(item);
            if (norm && matchedIds.has(norm)) referencedInDoc.add(norm);
          }
        } else {
          const norm = this.normalizeIdValue(val);
          if (norm && matchedIds.has(norm)) referencedInDoc.add(norm);
        }
        for (const tId of referencedInDoc) {
          targetRefDocCounts.set(tId, (targetRefDocCounts.get(tId) || 0) + 1);
        }
      }

      const multipleSourcesPerTarget = Array.from(targetRefDocCounts.values()).some(
        (count) => count > 1,
      );

      if (cand.isArray) {
        // DO NOT infer many-to-many from arrays alone!
        if (multipleSourcesPerTarget) {
          cardinality = "many-to-many";
        } else if (hitCount > 0) {
          cardinality = "one-to-many";
        } else {
          cardinality = "insufficient-evidence";
        }
      } else {
        // Scalar field
        if (hasUniqueIndexOnSource) {
          cardinality = "one-to-one";
        } else if (multipleSourcesPerTarget) {
          cardinality = "many-to-one";
        } else if (hitCount > 0) {
          cardinality = nameScore > 0 ? "many-to-one" : "unknown";
        } else {
          cardinality = "insufficient-evidence";
        }
      }

      const relId = `${sourceCol}.${cand.sourcePath}->${targetCol}._id`;
      const evidence: MongoRelationshipEvidence = {
        sourceCollection: sourceCol,
        sourceField: cand.sourcePath,
        targetCollection: targetCol,
        targetField: "_id",
        sampleCount: cand.sampleValues.length,
        hitCount,
        hitRatio: Math.round(hitRatio * 100) / 100,
        hasNamePatternMatch: nameScore > 0,
        isBsonTypeMatch: typeScore >= 0.7,
        multipleSourcesPerTarget,
        isArrayReference: cand.isArray,
        hasUniqueIndexOnSource,
        sampleMatches,
      };

      // Insufficient evidence cutoff (< 0.65) (MED-02)
      if (confidence < 0.65) {
        cardinality = "insufficient-evidence";
        insufficientCandidates.push({
          id: relId,
          sourceCollection: sourceCol,
          sourceField: cand.sourcePath,
          targetCollection: targetCol,
          targetField: "_id",
          cardinality,
          confidence,
          evidence,
          status: "inferred",
          inferredAt: new Date().toISOString(),
        });
      } else {
        inferredCandidates.push({
          id: relId,
          sourceCollection: sourceCol,
          sourceField: cand.sourcePath,
          targetCollection: targetCol,
          targetField: "_id",
          cardinality,
          confidence,
          evidence,
          status: "inferred",
          inferredAt: new Date().toISOString(),
        });
      }
    }

    // 7. State Retention Across Refresh
    const existingFile = await this.projectStore.getMongoRelationships(options?.projectId, dbId);
    const rejectedSet = new Set(existingFile.rejectedIds || []);
    const confirmedMap = new Map((existingFile.confirmed || []).map((r) => [r.id, r]));

    // Filter out rejected relationships and already confirmed relationships
    const prunedInferred = inferredCandidates.filter((cand) => {
      if (rejectedSet.has(cand.id)) return false;
      if (confirmedMap.has(cand.id)) return false;
      return true;
    });

    const prunedInsufficient = insufficientCandidates.filter((cand) => {
      if (rejectedSet.has(cand.id)) return false;
      if (confirmedMap.has(cand.id)) return false;
      return true;
    });

    const now = new Date().toISOString();
    const updatedFile: MongoRelationshipsFile = {
      version: 1,
      projectId: options?.projectId || existingFile.projectId,
      databaseId: dbId,
      inferred: prunedInferred,
      confirmed: existingFile.confirmed || [],
      rejectedIds: existingFile.rejectedIds || [],
      manual: existingFile.manual || [],
      insufficientEvidence: prunedInsufficient,
      updatedAt: now,
    };

    // Fix 1 (MED-REM-01): Never persist partial inference on timeout
    if (!timedOut) {
      await this.projectStore.saveMongoRelationships(updatedFile, options?.projectId, dbId);
    }

    return {
      relationships: prunedInferred,
      insufficientEvidence: prunedInsufficient,
      inferredAt: now,
      collectionsScanned: collectionNames.length,
      ...(timedOut ? { timedOut: true } : {}),
    };
  }

  /**
   * List all stored relationships
   */
  async listRelationships(dbId: string, projectId?: string): Promise<MongoListRelationshipsResult> {
    const file = await this.projectStore.getMongoRelationships(projectId, dbId);
    return {
      inferred: file.inferred || [],
      confirmed: file.confirmed || [],
      rejectedIds: file.rejectedIds || [],
      manual: file.manual || [],
      insufficientEvidence: file.insufficientEvidence || [],
    };
  }

  /**
   * Update status of an inferred relationship (confirmed | rejected)
   */
  async setRelationshipStatus(
    dbId: string,
    relationshipId: string,
    status: "confirmed" | "rejected",
    projectId?: string,
  ): Promise<MongoSetRelationshipStatusResult> {
    const file = await this.projectStore.getMongoRelationships(projectId, dbId);
    const inferred = file.inferred || [];
    const confirmed = file.confirmed || [];
    const rejectedIds = new Set(file.rejectedIds || []);
    const insufficient = file.insufficientEvidence || [];
    const now = new Date().toISOString();

    const idx = inferred.findIndex((r) => r.id === relationshipId);
    const insIdx = insufficient.findIndex((r) => r.id === relationshipId);
    const candidate = idx >= 0 ? inferred[idx] : insIdx >= 0 ? insufficient[insIdx] : null;

    if (status === "confirmed") {
      rejectedIds.delete(relationshipId);
      if (candidate) {
        if (idx >= 0) inferred.splice(idx, 1);
        if (insIdx >= 0) insufficient.splice(insIdx, 1);
        const existingConfIdx = confirmed.findIndex((r) => r.id === relationshipId);
        if (existingConfIdx >= 0) {
          confirmed[existingConfIdx].updatedAt = now;
        } else {
          confirmed.push({
            id: candidate.id,
            sourceCollection: candidate.sourceCollection,
            sourceField: candidate.sourceField,
            targetCollection: candidate.targetCollection,
            targetField: candidate.targetField,
            cardinality: candidate.cardinality,
            isManual: false,
            createdAt: now,
            updatedAt: now,
          });
        }
      }
    } else if (status === "rejected") {
      rejectedIds.add(relationshipId);
      if (candidate) {
        if (idx >= 0) inferred.splice(idx, 1);
        if (insIdx >= 0) insufficient.splice(insIdx, 1);
      }
      const confIdx = confirmed.findIndex((r) => r.id === relationshipId);
      if (confIdx >= 0) {
        confirmed.splice(confIdx, 1);
      }
    }

    const updatedFile: MongoRelationshipsFile = {
      ...file,
      inferred,
      confirmed,
      rejectedIds: Array.from(rejectedIds),
      insufficientEvidence: insufficient,
      updatedAt: now,
    };

    await this.projectStore.saveMongoRelationships(updatedFile, projectId, dbId);

    return {
      relationshipId,
      status,
    };
  }

  /**
   * Save a user-defined manual relationship
   */
  async saveRelationship(
    dbId: string,
    relationship: MongoRelationship,
    projectId?: string,
  ): Promise<MongoSaveRelationshipResult> {
    const file = await this.projectStore.getMongoRelationships(projectId, dbId);
    const manual = file.manual || [];
    const now = new Date().toISOString();

    const normalized: MongoRelationship = {
      ...relationship,
      isManual: true,
      createdAt: relationship.createdAt || now,
      updatedAt: now,
    };

    const existingIdx = manual.findIndex((r) => r.id === relationship.id);
    if (existingIdx >= 0) {
      manual[existingIdx] = normalized;
    } else {
      manual.push(normalized);
    }

    const updatedFile: MongoRelationshipsFile = {
      ...file,
      manual,
      updatedAt: now,
    };

    await this.projectStore.saveMongoRelationships(updatedFile, projectId, dbId);

    return {
      relationship: normalized,
    };
  }

  /**
   * Delete a relationship by ID
   */
  async deleteRelationship(
    dbId: string,
    relationshipId: string,
    projectId?: string,
  ): Promise<MongoDeleteRelationshipResult> {
    const file = await this.projectStore.getMongoRelationships(projectId, dbId);
    const manual = (file.manual || []).filter((r) => r.id !== relationshipId);
    const confirmed = (file.confirmed || []).filter((r) => r.id !== relationshipId);
    const inferred = (file.inferred || []).filter((r) => r.id !== relationshipId);
    const insufficient = (file.insufficientEvidence || []).filter((r) => r.id !== relationshipId);
    const rejectedIds = (file.rejectedIds || []).filter((id) => id !== relationshipId);

    const updatedFile: MongoRelationshipsFile = {
      ...file,
      manual,
      confirmed,
      inferred,
      insufficientEvidence: insufficient,
      rejectedIds,
      updatedAt: new Date().toISOString(),
    };

    await this.projectStore.saveMongoRelationships(updatedFile, projectId, dbId);

    return {
      success: true,
      relationshipId,
    };
  }
}
