/**
 * MongoDB Milestone 6 — Declarative Migration Engine.
 *
 * Implements:
 * - Filesystem discovery and security sandbox
 * - Static manifest preflight validation
 * - Distributed locking integration with fencing token verification
 * - Step runner with immutable event journaling (_relwave_migration_events)
 * - Materialized summary projection (_relwave_migrations) and rebuild algorithm
 * - Reverse compensation state machine with count-guarded collection rollback
 * - Rollback execution and crash reconciliation
 */

import fs from "fs";
import path from "path";
import crypto from "crypto";
import { v4 as uuidv4 } from "uuid";
import { Db } from "mongodb";
import { MongoApiError, assertSafeExpressions } from "../connectors/mongo";
import {
  acquireLock,
  renewLockHeartbeat,
  releaseLock,
  checkLockStatus,
  verifyLock,
  DEFAULT_HEARTBEAT_MS,
} from "./mongoMigrationLock";
import {
  MongoMigrationStep,
  MongoMigrationManifest,
  MongoMigrationEvent,
  MongoMigrationEventType,
  MongoMigrationSummary,
  MongoMigrationStatus,
  MongoMigrationListResult,
  MongoMigrationValidateResult,
  MongoMigrationApplyResult,
  MongoMigrationRollbackResult,
  MongoMigrationGetStatusResult,
} from "../types/mongoMigration";

export const MAX_MANIFEST_SIZE_BYTES = 1_048_576; // 1 MB
export const MANIFEST_FILENAME_REGEX = /^\d{14}_[a-zA-Z0-9_-]+\.mql\.json$/;
export const EVENTS_COLLECTION = "_relwave_migration_events";
export const MIGRATIONS_COLLECTION = "_relwave_migrations";

/**
 * Normalizes CRLF to LF and computes SHA-256 checksum.
 */
export function computeManifestChecksum(content: string | Buffer): string {
  const text = typeof content === "string" ? content : content.toString("utf8");
  const normalized = text.replace(/\r\n/g, "\n");
  return crypto.createHash("sha256").update(normalized, "utf8").digest("hex");
}

/**
 * Validates canonical file path to prevent directory traversal or external symlink escape.
 */
export function validateSafeFilePath(filePath: string, allowedDir: string): void {
  if (filePath.includes("\0") || filePath.includes("..")) {
    throw new MongoApiError("SECURITY_VIOLATION", "Path traversal or null byte detected");
  }

  const canonicalDir = fs.existsSync(allowedDir)
    ? fs.realpathSync(allowedDir)
    : path.resolve(allowedDir);
  const resolvedPath = path.resolve(filePath);

  if (!fs.existsSync(resolvedPath)) {
    const dirOfFile = path.dirname(resolvedPath);
    const canonicalDirOfFile = fs.existsSync(dirOfFile)
      ? fs.realpathSync(dirOfFile)
      : path.resolve(dirOfFile);

    if (
      !canonicalDirOfFile.startsWith(canonicalDir + path.sep) &&
      canonicalDirOfFile !== canonicalDir
    ) {
      throw new MongoApiError(
        "SECURITY_VIOLATION",
        "File path escapes allowed migration directory",
      );
    }
    return;
  }

  const canonicalFilePath = fs.realpathSync(resolvedPath);
  if (
    !canonicalFilePath.startsWith(canonicalDir + path.sep) &&
    canonicalFilePath !== canonicalDir
  ) {
    throw new MongoApiError(
      "SECURITY_VIOLATION",
      "Symlink or path traversal outside allowed migration directory",
    );
  }
}

/**
 * Resolves the mongo migration directory for a given project root.
 */
export function resolveMongoMigrationsDir(projectRoot: string): string {
  return path.resolve(projectRoot, "migrations", "mongo");
}

/**
 * Generates an index name from a key specification if name is not explicitly provided.
 */
export function getIndexNameFromKey(key: Record<string, any>): string {
  return Object.entries(key)
    .map(([k, v]) => `${k}_${v}`)
    .join("_");
}

/**
 * Validates a migration manifest against schema and security policies.
 */
export function validateManifest(manifest: any): MongoMigrationValidateResult {
  const errors: string[] = [];
  const warnings: string[] = [];
  let ddlCount = 0;
  let dataTransformCount = 0;
  let reversibleCount = 0;
  let irreversibleCount = 0;

  if (!manifest || typeof manifest !== "object") {
    return {
      valid: false,
      errors: ["Manifest must be a non-null object"],
      warnings,
      stepsBreakdown: { ddlCount, dataTransformCount, reversibleCount, irreversibleCount },
    };
  }

  if (!manifest.id || typeof manifest.id !== "string") {
    errors.push("Manifest requires a non-empty string 'id'");
  }
  if (!manifest.name || typeof manifest.name !== "string") {
    errors.push("Manifest requires a non-empty string 'name'");
  }
  if (!manifest.version || typeof manifest.version !== "string") {
    errors.push("Manifest requires a non-empty string 'version'");
  }
  if (!Array.isArray(manifest.up)) {
    errors.push("Manifest requires an array of 'up' steps");
  } else if (manifest.up.length === 0) {
    errors.push("Manifest 'up' array must not be empty");
  }

  const upSteps: any[] = Array.isArray(manifest.up) ? manifest.up : [];
  const downSteps: any[] = Array.isArray(manifest.down) ? manifest.down : [];

  for (let idx = 0; idx < upSteps.length; idx++) {
    const step = upSteps[idx];
    if (!step || typeof step !== "object") {
      errors.push(`Step at index ${idx} must be a non-null object`);
      continue;
    }

    if (step.type === "deleteMany") {
      errors.push(
        `Step at index ${idx}: deleteMany is permanently excluded from migration manifests to prevent unrecoverable data loss`,
      );
      continue;
    }

    const ALLOWED_TYPES = [
      "createCollection",
      "dropCollection",
      "createIndex",
      "dropIndex",
      "setValidator",
      "updateMany",
    ];
    if (!ALLOWED_TYPES.includes(step.type)) {
      errors.push(`Step at index ${idx}: unsupported step type '${step.type}'`);
      continue;
    }

    switch (step.type) {
      case "createCollection": {
        ddlCount++;
        reversibleCount++;
        if (!step.collection || typeof step.collection !== "string") {
          errors.push(`Step at index ${idx} (createCollection): requires non-empty collection name`);
        } else if (
          step.collection.includes("$") ||
          step.collection.includes("\0") ||
          step.collection.startsWith("system.")
        ) {
          errors.push(`Step at index ${idx} (createCollection): invalid collection name '${step.collection}'`);
        }
        if (step.options?.capped) {
          if (typeof step.options.size !== "number" || step.options.size < 4096) {
            errors.push(`Step at index ${idx} (createCollection): capped collection requires size >= 4096`);
          }
        }
        break;
      }
      case "dropCollection": {
        ddlCount++;
        irreversibleCount++;
        if (!step.collection || typeof step.collection !== "string") {
          errors.push(`Step at index ${idx} (dropCollection): requires non-empty collection name`);
        } else if (step.collection.startsWith("system.")) {
          errors.push(`Step at index ${idx} (dropCollection): cannot drop system collection`);
        }
        if (!manifest.allowIrreversible) {
          errors.push(
            `Step at index ${idx} (dropCollection): requires allowIrreversible: true in manifest`,
          );
        }
        break;
      }
      case "createIndex": {
        ddlCount++;
        reversibleCount++;
        if (!step.collection || typeof step.collection !== "string") {
          errors.push(`Step at index ${idx} (createIndex): requires non-empty collection name`);
        }
        if (!step.key || typeof step.key !== "object" || Object.keys(step.key).length === 0) {
          errors.push(`Step at index ${idx} (createIndex): requires non-empty key specification`);
        } else {
          for (const [k, dir] of Object.entries(step.key)) {
            if (![1, -1, "text", "2dsphere", "hashed"].includes(dir as any)) {
              errors.push(
                `Step at index ${idx} (createIndex): invalid direction '${dir}' for key '${k}'`,
              );
            }
          }
        }
        if (step.options?.partialFilterExpression) {
          try {
            assertSafeExpressions(step.options.partialFilterExpression);
          } catch (err: any) {
            errors.push(
              `Step at index ${idx} (createIndex): forbidden expression in partialFilterExpression: ${err.message}`,
            );
          }
        }
        break;
      }
      case "dropIndex": {
        ddlCount++;
        reversibleCount++;
        if (!step.collection || typeof step.collection !== "string") {
          errors.push(`Step at index ${idx} (dropIndex): requires non-empty collection name`);
        }
        if (!step.indexName || typeof step.indexName !== "string") {
          errors.push(`Step at index ${idx} (dropIndex): requires non-empty indexName`);
        } else if (step.indexName === "_id_") {
          errors.push(`Step at index ${idx} (dropIndex): cannot drop default _id_ index`);
        }
        break;
      }
      case "setValidator": {
        ddlCount++;
        reversibleCount++;
        if (!step.collection || typeof step.collection !== "string") {
          errors.push(`Step at index ${idx} (setValidator): requires non-empty collection name`);
        }
        if (!step.validator || typeof step.validator !== "object") {
          errors.push(`Step at index ${idx} (setValidator): requires validator object`);
        } else {
          try {
            assertSafeExpressions(step.validator);
          } catch (err: any) {
            errors.push(
              `Step at index ${idx} (setValidator): forbidden expression in validator: ${err.message}`,
            );
          }
        }
        break;
      }
      case "updateMany": {
        dataTransformCount++;
        if (!step.collection || typeof step.collection !== "string") {
          errors.push(`Step at index ${idx} (updateMany): requires non-empty collection name`);
        }
        if (!step.filter || typeof step.filter !== "object") {
          errors.push(`Step at index ${idx} (updateMany): requires filter object`);
        }
        if (!step.update || typeof step.update !== "object") {
          errors.push(`Step at index ${idx} (updateMany): requires update operator document`);
        }

        // Validate operator keys and AST safety
        if (step.filter) {
          try {
            assertSafeExpressions(step.filter);
          } catch (err: any) {
            errors.push(
              `Step at index ${idx} (updateMany): forbidden expression in filter: ${err.message}`,
            );
          }
        }
        if (step.update) {
          try {
            assertSafeExpressions(step.update);
          } catch (err: any) {
            errors.push(
              `Step at index ${idx} (updateMany): forbidden expression in update: ${err.message}`,
            );
          }
          const hasOpKeys = Object.keys(step.update).some((k) => k.startsWith("$"));
          if (!hasOpKeys) {
            errors.push(
              `Step at index ${idx} (updateMany): update operand must contain atomic operators ($set, $unset, etc.)`,
            );
          }
        }

        // Enforce author-provided down step
        const hasDown = downSteps.some(
          (d) => d && d.type === "updateMany" && d.collection === step.collection,
        );
        if (!hasDown) {
          errors.push(
            `Step at index ${idx} (updateMany): updateMany requires an author-provided down step for collection '${step.collection}'`,
          );
          irreversibleCount++;
        } else {
          reversibleCount++;
        }
        break;
      }
    }
  }

  return {
    valid: errors.length === 0,
    errors,
    warnings,
    stepsBreakdown: {
      ddlCount,
      dataTransformCount,
      reversibleCount,
      irreversibleCount,
    },
  };
}

/**
 * Asserts that a manifest is valid, throwing an appropriate MongoApiError if not.
 */
export function assertValidManifest(manifest: any): void {
  const result = validateManifest(manifest);
  if (!result.valid) {
    const forbiddenErr = result.errors.find(
      (e) =>
        e.includes("forbidden") ||
        e.includes("$where") ||
        e.includes("$function") ||
        e.includes("$accumulator"),
    );
    if (forbiddenErr) {
      throw new MongoApiError("MONGO_FORBIDDEN_OPERATOR", forbiddenErr);
    }
    if (result.errors.some((e) => e.includes("deleteMany"))) {
      throw new MongoApiError(
        "FORBIDDEN_STEP_TYPE",
        "deleteMany is permanently excluded from migration manifests",
      );
    }
    if (result.errors.some((e) => e.includes("allowIrreversible"))) {
      throw new MongoApiError(
        "IRREVERSIBLE_MIGRATION",
        "dropCollection requires allowIrreversible: true in manifest",
      );
    }
    throw new MongoApiError("INVALID_MANIFEST", result.errors.join("; "));
  }
}

/**
 * Compensates a single step during rollback or forward-failure unwind.
 */
export async function compensateStep(
  db: Db,
  step: MongoMigrationStep,
  preState: any,
  manifestDown?: MongoMigrationStep[],
): Promise<void> {
  switch (step.type) {
    case "createIndex": {
      const indexName = step.options?.name || getIndexNameFromKey(step.key);
      try {
        await db.collection(step.collection).dropIndex(indexName);
      } catch (err: any) {
        if (err.code !== 27 && err.codeName !== "IndexNotFound") {
          throw err;
        }
      }
      break;
    }
    case "dropIndex": {
      if (preState && preState.key) {
        const { key, name, v, ns, ...restOptions } = preState;
        await db
          .collection(step.collection)
          .createIndex(key, { ...restOptions, name: step.indexName });
      } else {
        const downStep = manifestDown?.find(
          (d) =>
            d.type === "createIndex" &&
            d.collection === step.collection &&
            (d.options?.name === step.indexName ||
              (!d.options?.name && getIndexNameFromKey(d.key) === step.indexName)),
        );
        if (downStep && downStep.type === "createIndex") {
          await db
            .collection(downStep.collection)
            .createIndex(downStep.key as any, downStep.options as any);
        } else {
          throw new MongoApiError(
            "COMPENSATION_FAILED",
            `Cannot compensate dropIndex for '${step.indexName}' on '${step.collection}': pre-state missing and no matching createIndex found in down steps`,
          );
        }
      }
      break;
    }
    case "createCollection": {
      // COUNT-GUARD: check existence and verify collection has not received external data
      const collections = await db.listCollections({ name: step.collection }).toArray();
      if (collections.length > 0) {
        const count = await db.collection(step.collection).countDocuments({});
        if (count > 0) {
          throw new MongoApiError(
            "COMPENSATION_FAILED",
            `Compensation aborted: Collection '${step.collection}' contains ${count} documents added after creation. Manual intervention required to prevent unintended data loss.`,
          );
        }
        await db.collection(step.collection).drop();
      }
      break;
    }
    case "dropCollection": {
      throw new MongoApiError(
        "IRREVERSIBLE_STEP",
        `Cannot compensate dropCollection for '${step.collection}'. Data was destroyed.`,
      );
    }
    case "setValidator": {
      const previousValidator = preState?.validator || {};
      const command: Record<string, any> = {
        collMod: step.collection,
        validator: previousValidator,
      };
      if (preState?.validationLevel !== undefined) {
        command.validationLevel = preState.validationLevel;
      }
      if (preState?.validationAction !== undefined) {
        command.validationAction = preState.validationAction;
      }
      await db.command(command);
      break;
    }
    case "updateMany": {
      const downStep = manifestDown?.find(
        (d) => d.type === "updateMany" && d.collection === step.collection,
      );
      if (!downStep || downStep.type !== "updateMany") {
        throw new MongoApiError(
          "COMPENSATION_FAILED",
          `Missing author-provided down step for updateMany on collection '${step.collection}'`,
        );
      }
      await db
        .collection(downStep.collection)
        .updateMany(downStep.filter, downStep.update, downStep.options as any);
      break;
    }
  }
}

/**
 * Executes a single migration manifest through the checkpointed state machine.
 */
async function applySingleManifest(
  db: Db,
  manifest: MongoMigrationManifest,
  checksum: string,
  options?: {
    dryRun?: boolean;
    ownerId?: string;
  },
): Promise<{
  id: string;
  name: string;
  executionTimeMs: number;
  status: MongoMigrationStatus;
  executedSteps: number;
  error?: string;
}> {
  assertValidManifest(manifest);

  const existing = await db
    .collection<MongoMigrationSummary>(MIGRATIONS_COLLECTION)
    .findOne({ _id: manifest.id });

  if (existing && existing.status === "APPLIED") {
    if (existing.checksum && existing.checksum !== checksum) {
      throw new MongoApiError(
        "CHECKSUM_MISMATCH",
        `Migration '${manifest.id}' was previously applied with checksum '${existing.checksum}', but manifest has checksum '${checksum}'`,
      );
    }
    throw new MongoApiError(
      "MIGRATION_ALREADY_APPLIED",
      `Migration '${manifest.id}' has already been applied`,
    );
  }

  if (options?.dryRun) {
    return {
      id: manifest.id,
      name: manifest.name,
      executionTimeMs: 0,
      status: "PENDING",
      executedSteps: 0,
    };
  }

  const ownerId = options?.ownerId || uuidv4();
  const { fencingToken } = await acquireLock(db, ownerId, manifest.id);

  let heartbeatInFlight = false;
  let lockLost = false;
  let heartbeatTimer: NodeJS.Timeout | null = setInterval(async () => {
    if (heartbeatInFlight || lockLost) return;
    heartbeatInFlight = true;
    try {
      const renewed = await renewLockHeartbeat(db, ownerId, fencingToken);
      if (!renewed) {
        lockLost = true;
        if (heartbeatTimer) clearInterval(heartbeatTimer);
      }
    } catch {
      // transient network error; verifyLock guards pre-step
    } finally {
      heartbeatInFlight = false;
    }
  }, DEFAULT_HEARTBEAT_MS);
  if (heartbeatTimer.unref) heartbeatTimer.unref();

  const attemptId = uuidv4();
  const prevEvents = await db
    .collection<MongoMigrationEvent>(EVENTS_COLLECTION)
    .find({ migrationId: manifest.id })
    .sort({ attemptNumber: -1 })
    .limit(1)
    .toArray();
  const attemptNumber = (prevEvents[0]?.attemptNumber || 0) + 1;
  let sequenceNumber = 0;

  const recordEvent = async (
    eventType: MongoMigrationEventType,
    stepIndex?: number,
    stepType?: string,
    metadata?: Record<string, any>,
  ) => {
    sequenceNumber++;
    const eventDoc: MongoMigrationEvent = {
      _id: `${manifest.id}_a${attemptNumber}_s${sequenceNumber}`,
      eventId: uuidv4(),
      migrationId: manifest.id,
      attemptId,
      attemptNumber,
      sequenceNumber,
      stepIndex,
      stepType,
      eventType,
      timestamp: new Date().toISOString(),
      lockOwnerId: ownerId,
      fencingToken,
      metadata,
    };
    await db.collection<MongoMigrationEvent>(EVENTS_COLLECTION).insertOne(eventDoc as any);
    return eventDoc;
  };

  await recordEvent("VALIDATION_SUCCESS");
  await recordEvent("LOCK_ACQUIRED");
  await recordEvent("MIGRATION_START");

  await db.collection<MongoMigrationSummary>(MIGRATIONS_COLLECTION).updateOne(
    { _id: manifest.id },
    {
      $set: {
        name: manifest.name,
        checksum,
        status: "APPLYING",
        startedAt: new Date().toISOString(),
        executedSteps: 0,
        totalSteps: manifest.up.length,
        fencingToken,
        attemptNumber,
        attemptId,
        appliedBy: ownerId,
        isReversible: manifest.up.every((s) => s.type !== "dropCollection"),
      },
    },
    { upsert: true },
  );

  const executedPreStates: Array<{ step: MongoMigrationStep; preState: any }> = [];
  const startTime = Date.now();
  let executedSteps = 0;

  try {
    for (let i = 0; i < manifest.up.length; i++) {
      const step = manifest.up[i];

      // Pre-step fencing check!
      if (lockLost || !(await verifyLock(db, ownerId, fencingToken))) {
        await recordEvent("STEP_UNCERTAIN", i, step.type, {
          reason: "Pre-step fencing check failed; lock lease expired or stolen",
        });
        await recordEvent("MANUAL_INTERVENTION_REQUIRED", i, step.type, {
          reason: "Fencing token violation mid-migration",
        });
        await db.collection<MongoMigrationSummary>(MIGRATIONS_COLLECTION).updateOne(
          { _id: manifest.id },
          {
            $set: {
              status: "CRASHED_UNCERTAIN",
              lastExecutedStepIndex: i,
              error: "LOCK_LOST_FENCING_VIOLATION: Lock lease expired or stolen by another client",
            },
          },
        );
        throw new MongoApiError(
          "LOCK_LOST_FENCING_VIOLATION",
          `Migration lock lease lost before executing step ${i}`,
        );
      }

      // Pre-state capture before mutation
      let preState: any = null;
      if (step.type === "dropIndex") {
        try {
          const coll = db.collection(step.collection);
          const indexes = await coll.indexes();
          const targetIdx = indexes.find((idx) => idx.name === step.indexName);
          if (targetIdx) {
            const { v, ns, ...rest } = targetIdx;
            preState = rest;
          }
        } catch {
          // ignore if collection doesn't exist
        }
      } else if (step.type === "setValidator") {
        try {
          const collInfos = await db.listCollections({ name: step.collection }).toArray();
          const firstColl = collInfos[0] as any;
          if (firstColl && firstColl.options) {
            preState = {
              validator: firstColl.options.validator || {},
              validationLevel: firstColl.options.validationLevel,
              validationAction: firstColl.options.validationAction,
            };
          } else {
            preState = {
              validator: {},
              validationLevel: undefined,
              validationAction: undefined,
            };
          }
        } catch {
          preState = {
            validator: {},
            validationLevel: undefined,
            validationAction: undefined,
          };
        }
      }

      await recordEvent("STEP_START", i, step.type, { preState });
      const stepStart = Date.now();

      try {
        switch (step.type) {
          case "createCollection": {
            await db.createCollection(step.collection, step.options as any);
            break;
          }
          case "dropCollection": {
            await db.collection(step.collection).drop();
            break;
          }
          case "createIndex": {
            await db
              .collection(step.collection)
              .createIndex(step.key as any, step.options as any);
            break;
          }
          case "dropIndex": {
            await db.collection(step.collection).dropIndex(step.indexName);
            break;
          }
          case "setValidator": {
            const command: Record<string, any> = {
              collMod: step.collection,
              validator: step.validator,
            };
            if (step.validationLevel) command.validationLevel = step.validationLevel;
            if (step.validationAction) command.validationAction = step.validationAction;
            await db.command(command);
            break;
          }
          case "updateMany": {
            await db
              .collection(step.collection)
              .updateMany(step.filter, step.update, step.options as any);
            break;
          }
        }

        const stepDuration = Date.now() - stepStart;
        await recordEvent("STEP_COMPLETE", i, step.type, { durationMs: stepDuration });
        executedPreStates.push({ step, preState });
        executedSteps++;

        await db.collection<MongoMigrationSummary>(MIGRATIONS_COLLECTION).updateOne(
          { _id: manifest.id },
          {
            $set: {
              executedSteps,
              lastExecutedStepIndex: i,
            },
          },
        );
      } catch (stepErr: any) {
        await recordEvent("STEP_FAILED", i, step.type, {
          error: { message: stepErr.message, stack: stepErr.stack },
        });

        await db.collection<MongoMigrationSummary>(MIGRATIONS_COLLECTION).updateOne(
          { _id: manifest.id },
          {
            $set: {
              status: "FAILED_PARTIAL",
              lastExecutedStepIndex: i,
              error: {
                stepIndex: i,
                stepType: step.type,
                message: stepErr.message,
              },
            },
          },
        );

        // Reverse compensation
        await recordEvent("COMPENSATION_START", i, step.type);
        await db.collection<MongoMigrationSummary>(MIGRATIONS_COLLECTION).updateOne(
          { _id: manifest.id },
          { $set: { status: "ROLLING_BACK" } },
        );

        let compensationFailed = false;
        let compError: any = null;

        for (let j = executedPreStates.length - 1; j >= 0; j--) {
          const { step: completedStep, preState: savedPreState } = executedPreStates[j];
          if (lockLost || !(await verifyLock(db, ownerId, fencingToken))) {
            compensationFailed = true;
            compError = new MongoApiError(
              "LOCK_LOST_FENCING_VIOLATION",
              "Lock lease lost during reverse compensation",
            );
            break;
          }
          try {
            await compensateStep(db, completedStep, savedPreState, manifest.down);
          } catch (cErr: any) {
            compensationFailed = true;
            compError = cErr;
            break;
          }
        }

        if (compensationFailed) {
          await recordEvent("COMPENSATION_FAILED", i, step.type, {
            error: { message: compError?.message },
          });
          await recordEvent("MANUAL_INTERVENTION_REQUIRED", i, step.type, {
            reason: compError?.message || "Reverse compensation failed",
          });
          await db.collection<MongoMigrationSummary>(MIGRATIONS_COLLECTION).updateOne(
            { _id: manifest.id },
            {
              $set: {
                status: "FAILED_MANUAL_INTERVENTION_REQUIRED",
                error: {
                  stepIndex: i,
                  stepType: step.type,
                  message: `Step failed: ${stepErr.message}. Compensation failed: ${compError?.message}`,
                },
              },
            },
          );
        } else {
          await recordEvent("COMPENSATION_COMPLETE", i, step.type);
          await recordEvent("MIGRATION_ROLLED_BACK", i, step.type);
          await db.collection<MongoMigrationSummary>(MIGRATIONS_COLLECTION).updateOne(
            { _id: manifest.id },
            {
              $set: {
                status: "ROLLED_BACK",
              },
            },
          );
        }

        throw stepErr;
      }
    }

    const totalDuration = Date.now() - startTime;
    await recordEvent("MIGRATION_APPLIED", undefined, undefined, {
      durationMs: totalDuration,
    });

    await db.collection<MongoMigrationSummary>(MIGRATIONS_COLLECTION).updateOne(
      { _id: manifest.id },
      {
        $set: {
          status: "APPLIED",
          completedAt: new Date().toISOString(),
          durationMs: totalDuration,
          totalDurationMs: totalDuration,
          executedSteps: manifest.up.length,
          lastExecutedStepIndex: manifest.up.length - 1,
          attemptNumber,
          attemptId,
        },
      },
    );

    return {
      id: manifest.id,
      name: manifest.name,
      executionTimeMs: totalDuration,
      status: "APPLIED",
      executedSteps: manifest.up.length,
    };
  } finally {
    if (heartbeatTimer) clearInterval(heartbeatTimer);
    await releaseLock(db, ownerId, fencingToken);
    await recordEvent("LOCK_RELEASED");
  }
}

/**
 * List applied and pending migrations for a MongoDB database.
 * Computes deterministic drift classification for applied migrations
 * strictly adhering to 5-precedence order without mutating database state.
 */
export async function listMigrations(
  db: Db,
  projectRoot: string,
): Promise<MongoMigrationListResult> {
  const lockStatus = await checkLockStatus(db);
  const migrationsDir = resolveMongoMigrationsDir(projectRoot);

  const appliedSummaries = await db
    .collection<MongoMigrationSummary>(MIGRATIONS_COLLECTION)
    .find({})
    .sort({ _id: 1 })
    .toArray();

  const appliedMap = new Map<string, MongoMigrationSummary>();
  for (const s of appliedSummaries) {
    appliedMap.set(s._id, s);
  }

  const pendingMigrations: MongoMigrationListResult["pendingMigrations"] = [];

  // If migrationsDir does not exist, all applied migrations become UNVERIFIABLE (MANIFEST_MISSING)
  if (!fs.existsSync(migrationsDir)) {
    for (const applied of appliedSummaries) {
      applied.driftStatus = "UNVERIFIABLE";
      applied.drifted = false;
      applied.driftDetails = {
        status: "UNVERIFIABLE",
        reason: "MANIFEST_MISSING",
        expectedChecksum: applied.checksum || undefined,
        message: "Manifest file not found in migrations directory",
      };
    }

    return {
      appliedMigrations: appliedSummaries,
      pendingMigrations,
      isLocked: lockStatus.isLocked,
      lockDetails: lockStatus.isLocked
        ? {
            ownerId: lockStatus.ownerId,
            fencingToken: lockStatus.fencingToken,
            expiresAt: lockStatus.expiresAt,
            migrationId: lockStatus.migrationId,
          }
        : undefined,
    };
  }

  const rawFiles = fs.readdirSync(migrationsDir);
  const candidateFiles = rawFiles.filter((f) => MANIFEST_FILENAME_REGEX.test(f));
  // Deterministically pre-sort filenames alphabetically
  candidateFiles.sort((a, b) => a.localeCompare(b));

  // Group candidate files by filename-derived ID (split on first '_')
  const idToFilesMap = new Map<string, string[]>();
  for (const file of candidateFiles) {
    const filenameId = file.split("_")[0];
    const list = idToFilesMap.get(filenameId) || [];
    list.push(file);
    idToFilesMap.set(filenameId, list);
  }

  const duplicateIds = new Set<string>();
  for (const [id, fileList] of idToFilesMap.entries()) {
    if (fileList.length > 1) {
      duplicateIds.add(id);
      const applied = appliedMap.get(id);
      if (applied) {
        applied.driftStatus = "UNVERIFIABLE";
        applied.drifted = false;
        applied.driftDetails = {
          status: "UNVERIFIABLE",
          reason: "MANIFEST_PARSE_ERROR",
          expectedChecksum: applied.checksum || undefined,
          message: `Multiple manifest files on disk resolve to migration ID '${id}': [${fileList.join(", ")}]`,
        };
      }
    }
  }

  // Map to store valid parsed manifests on disk for applied drift verification
  const validDiskFiles = new Map<
    string,
    { checksum: string; manifest: MongoMigrationManifest; file: string }
  >();

  for (const file of candidateFiles) {
    const filenameId = file.split("_")[0];
    if (duplicateIds.has(filenameId)) {
      // Duplicate collisions are flagged on applied migration (if any)
      // and skipped from valid pending migrations.
      continue;
    }

    const fullPath = path.join(migrationsDir, file);
    validateSafeFilePath(fullPath, migrationsDir);

    let fd: number;
    try {
      fd = fs.openSync(fullPath, "r");
    } catch (err: any) {
      const applied = appliedMap.get(filenameId);
      if (applied && !applied.driftStatus) {
        applied.driftStatus = "UNVERIFIABLE";
        applied.drifted = false;
        applied.driftDetails = {
          status: "UNVERIFIABLE",
          reason: "MANIFEST_PARSE_ERROR",
          expectedChecksum: applied.checksum || undefined,
          message: `Failed to open manifest file '${file}': ${err.message}`,
        };
      }
      continue;
    }

    let stat: fs.Stats;
    try {
      stat = fs.fstatSync(fd);
    } catch (err: any) {
      fs.closeSync(fd);
      const applied = appliedMap.get(filenameId);
      if (applied && !applied.driftStatus) {
        applied.driftStatus = "UNVERIFIABLE";
        applied.drifted = false;
        applied.driftDetails = {
          status: "UNVERIFIABLE",
          reason: "MANIFEST_PARSE_ERROR",
          expectedChecksum: applied.checksum || undefined,
          message: `Failed to stat manifest file '${file}': ${err.message}`,
        };
      }
      continue;
    }

    // Size Safety & TOCTOU Prevention:
    // If stat.size > MAX_MANIFEST_SIZE_BYTES (1MB), close fd immediately and bypass buffer read.
    if (stat.size > MAX_MANIFEST_SIZE_BYTES) {
      fs.closeSync(fd);
      const applied = appliedMap.get(filenameId);
      if (applied && !applied.driftStatus) {
        applied.driftStatus = "UNVERIFIABLE";
        applied.drifted = false;
        applied.driftDetails = {
          status: "UNVERIFIABLE",
          reason: "MANIFEST_PARSE_ERROR",
          expectedChecksum: applied.checksum || undefined,
          message: `Manifest file '${file}' exceeds 1MB limit (${stat.size} bytes)`,
        };
      }
      continue;
    }

    const buf = Buffer.alloc(stat.size);
    try {
      fs.readSync(fd, buf, 0, stat.size, 0);
    } finally {
      fs.closeSync(fd);
    }

    const rawContent = buf.toString("utf8");
    const checksum = computeManifestChecksum(rawContent);

    let manifest: MongoMigrationManifest;
    try {
      manifest = JSON.parse(rawContent);
    } catch (err: any) {
      const applied = appliedMap.get(filenameId);
      if (applied && !applied.driftStatus) {
        applied.driftStatus = "UNVERIFIABLE";
        applied.drifted = false;
        applied.driftDetails = {
          status: "UNVERIFIABLE",
          reason: "MANIFEST_PARSE_ERROR",
          expectedChecksum: applied.checksum || undefined,
          message: `Failed to parse manifest JSON in '${file}': ${err.message}`,
        };
      }
      continue;
    }

    const id = manifest.id || filenameId;
    validDiskFiles.set(id, { checksum, manifest, file });
    if (id !== filenameId) {
      validDiskFiles.set(filenameId, { checksum, manifest, file });
    }

    const applied = appliedMap.get(id) || appliedMap.get(filenameId);
    if (!applied) {
      pendingMigrations.push({
        id,
        name: manifest.name || file,
        filename: file,
        checksum,
        stepCount: manifest.up?.length || 0,
        isReversible: manifest.up?.every((s) => s.type !== "dropCollection") ?? false,
      });
    }
  }

  // Evaluate applied migrations according to strict deterministic precedence:
  for (const applied of appliedSummaries) {
    // If already marked UNVERIFIABLE via Precedence 2 (duplicate collision, oversized, or parse error), preserve it.
    if (applied.driftStatus) {
      continue;
    }

    const filesForId = idToFilesMap.get(applied._id);

    // Precedence 1: MANIFEST_MISSING
    if (!filesForId || filesForId.length === 0) {
      applied.driftStatus = "UNVERIFIABLE";
      applied.drifted = false;
      applied.driftDetails = {
        status: "UNVERIFIABLE",
        reason: "MANIFEST_MISSING",
        expectedChecksum: applied.checksum || undefined,
        message: "Manifest file not found in migrations directory",
      };
      continue;
    }

    const diskInfo = validDiskFiles.get(applied._id);
    if (!diskInfo) {
      applied.driftStatus = "UNVERIFIABLE";
      applied.drifted = false;
      applied.driftDetails = {
        status: "UNVERIFIABLE",
        reason: "MANIFEST_PARSE_ERROR",
        expectedChecksum: applied.checksum || undefined,
        message: `Failed to validate manifest file for migration ID '${applied._id}'`,
      };
      continue;
    }

    // Precedence 3: RECORDED_CHECKSUM_MISSING
    if (!applied.checksum) {
      applied.driftStatus = "UNVERIFIABLE";
      applied.drifted = false;
      applied.driftDetails = {
        status: "UNVERIFIABLE",
        reason: "RECORDED_CHECKSUM_MISSING",
        actualChecksum: diskInfo.checksum,
        message: "Recorded migration summary contains no baseline checksum",
      };
    } else if (applied.checksum === diskInfo.checksum) {
      // Precedence 4: CHECKSUM_MATCH
      applied.driftStatus = "VERIFIED";
      applied.drifted = false;
      applied.driftDetails = {
        status: "VERIFIED",
        reason: "CHECKSUM_MATCH",
        expectedChecksum: applied.checksum,
        actualChecksum: diskInfo.checksum,
      };
    } else {
      // Precedence 5: CHECKSUM_MISMATCH
      applied.driftStatus = "DRIFTED";
      applied.drifted = true;
      applied.driftDetails = {
        status: "DRIFTED",
        reason: "CHECKSUM_MISMATCH",
        expectedChecksum: applied.checksum,
        actualChecksum: diskInfo.checksum,
        message: "On-disk manifest content has been altered since application",
      };
    }
  }

  pendingMigrations.sort((a, b) => a.id.localeCompare(b.id));

  return {
    appliedMigrations: appliedSummaries,
    pendingMigrations,
    isLocked: lockStatus.isLocked,
    lockDetails: lockStatus.isLocked
      ? {
          ownerId: lockStatus.ownerId,
          fencingToken: lockStatus.fencingToken,
          expiresAt: lockStatus.expiresAt,
          migrationId: lockStatus.migrationId,
        }
      : undefined,
  };
}

/**
 * Applies a specific migration or all pending migrations in order.
 */
export async function applyMigration(
  db: Db,
  projectRoot: string,
  version?: string,
  options?: {
    dryRun?: boolean;
    readOnly?: boolean;
    ownerId?: string;
  },
): Promise<MongoMigrationApplyResult> {
  if (options?.readOnly) {
    throw new MongoApiError("MONGO_READ_ONLY", "Database is in read-only mode");
  }

  const migrationsDir = resolveMongoMigrationsDir(projectRoot);
  const results: MongoMigrationApplyResult["results"] = [];

  if (version) {
    if (!fs.existsSync(migrationsDir)) {
      throw new MongoApiError(
        "MIGRATION_NOT_FOUND",
        `Migration directory not found: ${migrationsDir}`,
      );
    }

    const files = fs.readdirSync(migrationsDir);
    const targetFile = files.find(
      (f) => (f.startsWith(version + "_") || f.startsWith(version + ".")) && MANIFEST_FILENAME_REGEX.test(f),
    );

    if (!targetFile) {
      throw new MongoApiError(
        "MIGRATION_NOT_FOUND",
        `Migration file not found for version '${version}'`,
      );
    }

    const fullPath = path.join(migrationsDir, targetFile);
    validateSafeFilePath(fullPath, migrationsDir);

    const stats = fs.statSync(fullPath);
    if (stats.size > MAX_MANIFEST_SIZE_BYTES) {
      throw new MongoApiError(
        "MANIFEST_SIZE_EXCEEDED",
        `Manifest exceeds 1MB limit (${stats.size} bytes)`,
      );
    }

    const rawContent = fs.readFileSync(fullPath, "utf8");
    const checksum = computeManifestChecksum(rawContent);

    let manifest: MongoMigrationManifest;
    try {
      manifest = JSON.parse(rawContent);
    } catch (err: any) {
      throw new MongoApiError("INVALID_MANIFEST", `Invalid JSON in manifest '${targetFile}': ${err.message}`);
    }

    const singleResult = await applySingleManifest(db, manifest, checksum, options);
    results.push(singleResult);
  } else {
    // Apply all pending migrations in chronological order
    const list = await listMigrations(db, projectRoot);
    for (const pending of list.pendingMigrations) {
      const fullPath = path.join(migrationsDir, pending.filename);
      validateSafeFilePath(fullPath, migrationsDir);

      const rawContent = fs.readFileSync(fullPath, "utf8");
      const checksum = computeManifestChecksum(rawContent);
      const manifest: MongoMigrationManifest = JSON.parse(rawContent);

      const singleResult = await applySingleManifest(db, manifest, checksum, options);
      results.push(singleResult);
    }
  }

  return {
    success: results.every((r) => r.status === "APPLIED" || r.status === "PENDING"),
    appliedCount: results.filter((r) => r.status === "APPLIED").length,
    results,
  };
}

/**
 * Rolls back an applied or partially failed migration.
 */
export async function rollbackMigration(
  db: Db,
  migrationId: string,
  projectRoot?: string,
  options?: {
    readOnly?: boolean;
    force?: boolean;
    ownerId?: string;
  },
): Promise<MongoMigrationRollbackResult> {
  if (options?.readOnly) {
    throw new MongoApiError("MONGO_READ_ONLY", "Database is in read-only mode");
  }

  const summary = await db
    .collection<MongoMigrationSummary>(MIGRATIONS_COLLECTION)
    .findOne({ _id: migrationId });

  if (!summary) {
    throw new MongoApiError("MIGRATION_NOT_FOUND", `Migration '${migrationId}' not found in database records`);
  }
  if (summary.status === "ROLLED_BACK") {
    throw new MongoApiError("ALREADY_ROLLED_BACK", `Migration '${migrationId}' has already been rolled back`);
  }

  // Load manifest if projectRoot provided
  let manifest: MongoMigrationManifest | undefined;
  if (projectRoot) {
    const migrationsDir = resolveMongoMigrationsDir(projectRoot);
    if (fs.existsSync(migrationsDir)) {
      const files = fs.readdirSync(migrationsDir);
      const file = files.find(
        (f) => (f.startsWith(migrationId + "_") || f.startsWith(migrationId + ".")) && MANIFEST_FILENAME_REGEX.test(f),
      );
      if (file) {
        const fullPath = path.join(migrationsDir, file);
        validateSafeFilePath(fullPath, migrationsDir);
        manifest = JSON.parse(fs.readFileSync(fullPath, "utf8"));
      }
    }
  }

  if (summary.isReversible === false && !options?.force) {
    throw new MongoApiError(
      "IRREVERSIBLE_MIGRATION",
      `Migration '${migrationId}' contains irreversible steps and cannot be rolled back without force flag`,
    );
  }

  const ownerId = options?.ownerId || uuidv4();
  const { fencingToken } = await acquireLock(db, ownerId, migrationId);

  let heartbeatInFlight = false;
  let lockLost = false;
  let heartbeatTimer: NodeJS.Timeout | null = setInterval(async () => {
    if (heartbeatInFlight || lockLost) return;
    heartbeatInFlight = true;
    try {
      const renewed = await renewLockHeartbeat(db, ownerId, fencingToken);
      if (!renewed) {
        lockLost = true;
        if (heartbeatTimer) clearInterval(heartbeatTimer);
      }
    } catch {
      // transient network error; verifyLock guards pre-step
    } finally {
      heartbeatInFlight = false;
    }
  }, DEFAULT_HEARTBEAT_MS);
  if (heartbeatTimer.unref) heartbeatTimer.unref();

  const attemptId = uuidv4();
  const prevEvents = await db
    .collection<MongoMigrationEvent>(EVENTS_COLLECTION)
    .find({ migrationId })
    .sort({ attemptNumber: -1 })
    .limit(1)
    .toArray();
  const attemptNumber = (prevEvents[0]?.attemptNumber || 0) + 1;
  let sequenceNumber = 0;

  const recordEvent = async (
    eventType: MongoMigrationEventType,
    stepIndex?: number,
    stepType?: string,
    metadata?: Record<string, any>,
  ) => {
    sequenceNumber++;
    const eventDoc: MongoMigrationEvent = {
      _id: `${migrationId}_a${attemptNumber}_s${sequenceNumber}`,
      eventId: uuidv4(),
      migrationId,
      attemptId,
      attemptNumber,
      sequenceNumber,
      stepIndex,
      stepType,
      eventType,
      timestamp: new Date().toISOString(),
      lockOwnerId: ownerId,
      fencingToken,
      metadata,
    };
    await db.collection<MongoMigrationEvent>(EVENTS_COLLECTION).insertOne(eventDoc as any);
    return eventDoc;
  };

  const startTime = Date.now();
  let stepsCompensated = 0;

  try {
    await recordEvent("COMPENSATION_START");
    await db.collection<MongoMigrationSummary>(MIGRATIONS_COLLECTION).updateOne(
      { _id: migrationId },
      { $set: { status: "ROLLING_BACK" } },
    );

    // Retrieve events to find completed steps and pre-states
    const events = await db
      .collection<MongoMigrationEvent>(EVENTS_COLLECTION)
      .find({ migrationId })
      .sort({ attemptNumber: 1, sequenceNumber: 1 } as any)
      .toArray();

    const completedSteps: Array<{ index: number; type: string; preState: any; step?: MongoMigrationStep }> = [];
    const completedStepIndices = new Set<number>();

    for (const ev of events) {
      if (ev.eventType === "STEP_COMPLETE" && ev.stepIndex !== undefined) {
        completedStepIndices.add(ev.stepIndex);
      }
    }

    for (const ev of events) {
      if (
        ev.eventType === "STEP_START" &&
        ev.stepIndex !== undefined &&
        completedStepIndices.has(ev.stepIndex)
      ) {
        const stepDef = manifest?.up[ev.stepIndex];
        completedSteps.push({
          index: ev.stepIndex,
          type: ev.stepType || stepDef?.type || "unknown",
          preState: ev.metadata?.preState,
          step: stepDef,
        });
      }
    }

    // Rollback completed steps in reverse order
    for (let i = completedSteps.length - 1; i >= 0; i--) {
      const stepInfo = completedSteps[i];

      // Pre-step fencing check
      if (lockLost || !(await verifyLock(db, ownerId, fencingToken))) {
        await recordEvent("STEP_UNCERTAIN", stepInfo.index, stepInfo.type, {
          reason: "Pre-step fencing check failed during rollback; lock lease expired or stolen",
        });
        await recordEvent("MANUAL_INTERVENTION_REQUIRED", stepInfo.index, stepInfo.type, {
          reason: "Lock lost during rollback",
        });
        await db.collection<MongoMigrationSummary>(MIGRATIONS_COLLECTION).updateOne(
          { _id: migrationId },
          {
            $set: {
              status: "CRASHED_UNCERTAIN",
              lastExecutedStepIndex: stepInfo.index,
              error: `LOCK_LOST_FENCING_VIOLATION: Lock lease lost during rollback of step ${stepInfo.index}`,
            },
          },
        );
        throw new MongoApiError(
          "LOCK_LOST_FENCING_VIOLATION",
          `Migration lock lease lost during rollback of step ${stepInfo.index}`,
        );
      }

      if (stepInfo.step) {
        await compensateStep(db, stepInfo.step, stepInfo.preState, manifest?.down);
      } else {
        // Fallback compensation using captured preState
        if (stepInfo.type === "createIndex" && stepInfo.preState?.name) {
          await db.collection(stepInfo.preState.collection).dropIndex(stepInfo.preState.name);
        } else if (stepInfo.type === "setValidator" && stepInfo.preState) {
          await db.command({
            collMod: stepInfo.preState.collection,
            validator: stepInfo.preState.validator || {},
          });
        }
      }
      stepsCompensated++;
    }

    await recordEvent("COMPENSATION_COMPLETE");
    await recordEvent("MIGRATION_ROLLED_BACK");

    const duration = Date.now() - startTime;
    await db.collection<MongoMigrationSummary>(MIGRATIONS_COLLECTION).updateOne(
      { _id: migrationId },
      {
        $set: {
          status: "ROLLED_BACK",
          completedAt: new Date().toISOString(),
          durationMs: duration,
        },
      },
    );

    return {
      success: true,
      version: migrationId,
      status: "ROLLED_BACK",
      executionTimeMs: duration,
      stepsCompensated,
    };
  } catch (err: any) {
    await recordEvent("COMPENSATION_FAILED", undefined, undefined, { error: err.message });
    await recordEvent("MANUAL_INTERVENTION_REQUIRED", undefined, undefined, { reason: err.message });

    await db.collection<MongoMigrationSummary>(MIGRATIONS_COLLECTION).updateOne(
      { _id: migrationId },
      {
        $set: {
          status: "FAILED_MANUAL_INTERVENTION_REQUIRED",
          error: {
            stepIndex: stepsCompensated,
            stepType: "compensation",
            message: err.message,
          },
        },
      },
    );

    throw err;
  } finally {
    if (heartbeatTimer) clearInterval(heartbeatTimer);
    await releaseLock(db, ownerId, fencingToken);
    await recordEvent("LOCK_RELEASED");
  }
}

/**
 * Deterministically rebuilds the summary projection in `_relwave_migrations`
 * by replaying the chronological event stream from `_relwave_migration_events`.
 */
export async function rebuildMigrationSummary(
  db: Db,
  migrationId: string,
  manifest?: MongoMigrationManifest,
): Promise<MongoMigrationSummary> {
  const events = await db
    .collection<MongoMigrationEvent>(EVENTS_COLLECTION)
    .find({ migrationId })
    .sort({ attemptNumber: 1, sequenceNumber: 1 } as any)
    .toArray();

  if (events.length === 0) {
    throw new MongoApiError("EVENT_STREAM_EMPTY", `No events found for migration '${migrationId}'`);
  }

  let status: MongoMigrationStatus = "PENDING";
  let lastExecutedStepIndex = -1;
  let executedSteps = 0;
  let startedAt = events[0].timestamp;
  let completedAt: string | undefined;
  let durationMs = 0;
  let error: string | undefined;
  let fencingToken = events[0].fencingToken || 0;
  let currentAttemptNumber = events[0].attemptNumber ?? 1;
  let currentAttemptId = events[0].attemptId;
  let inFlightStep = false;

  for (const event of events) {
    fencingToken = Math.max(fencingToken, event.fencingToken || 0);

    if (event.attemptNumber !== undefined && event.attemptNumber > currentAttemptNumber) {
      currentAttemptNumber = event.attemptNumber;
      currentAttemptId = event.attemptId;
      executedSteps = 0;
      lastExecutedStepIndex = -1;
      startedAt = event.timestamp;
      completedAt = undefined;
      durationMs = 0;
      error = undefined;
      status = "PENDING";
      inFlightStep = false;
    }

    switch (event.eventType) {
      case "MIGRATION_START":
        status = "APPLYING";
        inFlightStep = false;
        break;
      case "STEP_START":
        lastExecutedStepIndex = event.stepIndex ?? lastExecutedStepIndex;
        inFlightStep = true;
        break;
      case "STEP_COMPLETE":
        executedSteps++;
        inFlightStep = false;
        if (event.metadata?.durationMs) {
          durationMs += event.metadata.durationMs;
        }
        break;
      case "STEP_FAILED":
        status = "FAILED_PARTIAL";
        inFlightStep = false;
        error = event.metadata?.error?.message || "Step execution failed";
        break;
      case "STEP_UNCERTAIN":
        status = "CRASHED_UNCERTAIN";
        inFlightStep = false;
        error = event.metadata?.reason || "Step outcome uncertain";
        break;
      case "COMPENSATION_START":
        status = "ROLLING_BACK";
        break;
      case "COMPENSATION_COMPLETE":
        status = "ROLLED_BACK";
        break;
      case "COMPENSATION_FAILED":
        status = "FAILED_MANUAL_INTERVENTION_REQUIRED";
        error = event.metadata?.error?.message || "Compensation step failed";
        break;
      case "MIGRATION_APPLIED":
        status = "APPLIED";
        completedAt = event.timestamp;
        inFlightStep = false;
        break;
      case "MIGRATION_ROLLED_BACK":
        status = "ROLLED_BACK";
        completedAt = event.timestamp;
        inFlightStep = false;
        break;
      case "MANUAL_INTERVENTION_REQUIRED":
        status = "FAILED_MANUAL_INTERVENTION_REQUIRED";
        error = event.metadata?.reason || "Manual intervention required";
        break;
    }
  }

  // Detect dangling STEP_START within the latest attempt
  if (inFlightStep) {
    status = "CRASHED_UNCERTAIN";
  }

  const lastEvent = events[events.length - 1];
  const summary: MongoMigrationSummary = {
    _id: migrationId,
    name: manifest?.name || (events[0].metadata?.name as string) || "rebuilt_migration",
    checksum: manifest ? computeManifestChecksum(JSON.stringify(manifest)) : "reconstructed",
    status,
    startedAt,
    completedAt,
    durationMs,
    totalDurationMs: durationMs,
    executedSteps,
    totalSteps: manifest?.up.length || Math.max(executedSteps, 1),
    lastExecutedStepIndex,
    fencingToken,
    attemptNumber: currentAttemptNumber,
    attemptId: currentAttemptId,
    error,
    isReversible: manifest?.up.every((s) => s.type !== "dropCollection") ?? false,
    appliedBy: lastEvent.lockOwnerId || events[0].lockOwnerId,
  };

  await db
    .collection<MongoMigrationSummary>(MIGRATIONS_COLLECTION)
    .replaceOne({ _id: migrationId }, summary, { upsert: true });

  return summary;
}

/**
 * Retrieves the migration status, recent events, and distributed lock status.
 */
export async function getMigrationStatus(
  db: Db,
  migrationId?: string,
): Promise<MongoMigrationGetStatusResult> {
  const lockStatus = await checkLockStatus(db);

  let migration: MongoMigrationSummary | undefined;
  let events: MongoMigrationEvent[] | undefined;

  if (migrationId) {
    migration = (await db
      .collection<MongoMigrationSummary>(MIGRATIONS_COLLECTION)
      .findOne({ _id: migrationId })) || undefined;

    events = await db
      .collection<MongoMigrationEvent>(EVENTS_COLLECTION)
      .find({ migrationId })
      .sort({ attemptNumber: 1, sequenceNumber: 1 } as any)
      .toArray();
  }

  const lastAppliedDocs = await db
    .collection<MongoMigrationSummary>(MIGRATIONS_COLLECTION)
    .find({ status: "APPLIED" })
    .sort({ _id: -1 })
    .limit(1)
    .toArray();

  const lastApplied = lastAppliedDocs[0];

  const pendingDocs = await db
    .collection<MongoMigrationSummary>(MIGRATIONS_COLLECTION)
    .countDocuments({ status: { $ne: "APPLIED" } });

  return {
    migration,
    events,
    lockStatus,
    lastAppliedVersion: lastApplied?._id,
    lastAppliedAt: lastApplied?.completedAt || lastApplied?.startedAt,
    pendingCount: pendingDocs,
  };
}

export const mongoMigrationEngine = {
  validateManifest,
  assertValidManifest,
  computeManifestChecksum,
  validateSafeFilePath,
  resolveMongoMigrationsDir,
  listMigrations,
  applyMigration,
  rollbackMigration,
  rebuildMigrationSummary,
  getMigrationStatus,
  compensateStep,
};
