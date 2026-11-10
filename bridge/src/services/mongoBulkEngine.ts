/**
 * MongoDB Milestone 7 Phase 3 — Bulk Operations Bridge Engine.
 *
 * Implements:
 * - BulkOperationManager: UUIDv4 validation, 1-hour TTL, safe state machine,
 *   idempotent chunk replay protection, AbortController lifecycle.
 * - Bulk Import Engine: JSON, NDJSON, CSV parsing, prototype pollution defense,
 *   system collection blocking, bounded batch writes (<= 500 docs), duplicate key handling.
 * - Bulk Export Engine: Cursor streaming (batchSize 1000) directly to temp file,
 *   dot-notation flattening, sanitization of filesystem paths, cursor/file closure.
 * - Supporting Bulk Mutations: bulk insert, bulk update, bulk delete with broad-filter guards.
 * - Read-only database enforcement.
 */

import fs from "fs";
import path from "path";
import os from "os";
import { v4 as uuidv4 } from "uuid";
import { Collection, Db, Document } from "mongodb";
import { DatabaseService } from "./databaseService";
import logger from "./logger";
import { selectDb, MongoApiError, assertCollectionName, safeMongoError, mongodbCache } from "../connectors/mongo";
import { serializeMongoEJSONDocument, mongoBSONtoEJSON, serializeMongoFilter, serializeMongoUpdateOperand } from "../connectors/mongoBson";
import { DBType } from "../types";
import {
  MongoBulkFormat,
  MongoBulkOperationType,
  MongoBulkOperationStatus,
  MongoBulkOperation,
  MongoBulkImportStartRequest,
  MongoBulkImportStartResult,
  MongoBulkImportChunkRequest,
  MongoBulkImportChunkResult,
  MongoBulkExportStartRequest,
  MongoBulkExportStartResult,
  StagingFileIdentity,
  MongoBulkExportSaveToRequest,
  MongoBulkExportSaveToResult,
  MongoBulkOperationStatusResult,
  MongoBulkCancelResult,
  MongoBulkCleanupResult,
  MongoBulkInsertRequest,
  MongoBulkInsertResult,
  MongoBulkUpdateRequest,
  MongoBulkUpdateResult,
  MongoBulkDeleteRequest,
  MongoBulkDeleteResult,
} from "../types/mongoBulk";

export const MAX_IMPORT_CHUNK_DOCS = 1_000;
export const MAX_IMPORT_CHUNK_SIZE_BYTES = 4 * 1024 * 1024; // 4 MB
export const MAX_IMPORT_TOTAL_SIZE_BYTES = 16 * 1024 * 1024; // 16 MB absolute cap
export const MAX_BULK_INSERT_DOCS = 5_000;
export const MAX_BULK_INSERT_SIZE_BYTES = 16 * 1024 * 1024; // 16 MB
export const BATCH_WRITE_SIZE = 500;
export const OPERATION_TTL_MS = 60 * 60 * 1000; // 1 hour
export const EXPORT_CURSOR_BATCH_SIZE = 1_000;

export const EXPORT_DIR = path.join(os.tmpdir(), "relwave-exports");

const UUID_V4_REGEX =
  /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export function isValidUuidV4(id: unknown): id is string {
  return typeof id === "string" && UUID_V4_REGEX.test(id);
}

export function assertValidOperationId(id: unknown): asserts id is string {
  if (typeof id !== "string" || !UUID_V4_REGEX.test(id)) {
    throw new MongoApiError(
      "MONGO_VALIDATION_ERROR",
      "Invalid operationId format: must be a valid UUIDv4 string",
    );
  }
}

export function assertValidCollectionName(collection: unknown): asserts collection is string {
  if (typeof collection !== "string" || collection.trim().length === 0) {
    throw new MongoApiError("MONGO_VALIDATION_ERROR", "collection must be a non-empty string");
  }
  if (Buffer.byteLength(collection, "utf8") > 120) {
    throw new MongoApiError("MONGO_VALIDATION_ERROR", "collection name must not exceed 120 bytes");
  }
  if (collection.includes("$") || collection.includes("\0")) {
    throw new MongoApiError("MONGO_VALIDATION_ERROR", "collection name must not contain '$' or null bytes");
  }
  if (collection.startsWith("system.")) {
    throw new MongoApiError("MONGO_FORBIDDEN", "Operations on system collections are forbidden");
  }
}

export function assertNoPrototypePollution(value: unknown): void {
  if (!value || typeof value !== "object") return;
  if (Array.isArray(value)) {
    for (const item of value) {
      assertNoPrototypePollution(item);
    }
    return;
  }
  for (const key of Object.getOwnPropertyNames(value)) {
    if (key === "__proto__" || key === "constructor" || key === "prototype") {
      throw new MongoApiError(
        "SECURITY_VIOLATION",
        `Prototype pollution attempt detected with property '${key}'`,
      );
    }
    assertNoPrototypePollution((value as Record<string, any>)[key]);
  }
}

export function assertNotReadOnly(db: any, conn: any): void {
  const isReadOnly = Boolean(
    db?.readonly ||
    db?.readOnly ||
    conn?.readonly ||
    conn?.readOnly
  );
  if (isReadOnly) {
    throw new MongoApiError("MONGO_READ_ONLY", "Database is in read-only mode");
  }
}

// ===========================================================================
// Parsing Utilities (JSON array, NDJSON, CSV)
// ===========================================================================

export function parseJsonArray(textOrObj: unknown): Record<string, any>[] {
  let parsed: any = textOrObj;
  if (typeof textOrObj === "string") {
    try {
      parsed = JSON.parse(textOrObj);
    } catch (err: any) {
      throw new MongoApiError("MONGO_VALIDATION_ERROR", `Invalid JSON payload: ${err.message}`);
    }
  }
  if (!Array.isArray(parsed)) {
    throw new MongoApiError(
      "MONGO_VALIDATION_ERROR",
      "JSON bulk import payload must be an array of documents",
    );
  }
  for (let i = 0; i < parsed.length; i++) {
    const doc = parsed[i];
    if (typeof doc !== "object" || doc === null || Array.isArray(doc)) {
      throw new MongoApiError(
        "MONGO_VALIDATION_ERROR",
        `JSON array element at index ${i} must be an object`,
      );
    }
    assertNoPrototypePollution(doc);
  }
  return parsed;
}

export function parseNdjson(text: string): Record<string, any>[] {
  const lines = text.split(/\r?\n/).filter((l) => l.trim().length > 0);
  const docs: Record<string, any>[] = [];
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    let doc: any;
    try {
      doc = JSON.parse(line);
    } catch (err: any) {
      throw new MongoApiError("MONGO_VALIDATION_ERROR", `Invalid NDJSON at line ${i + 1}: ${err.message}`);
    }
    if (typeof doc !== "object" || doc === null || Array.isArray(doc)) {
      throw new MongoApiError("MONGO_VALIDATION_ERROR", `NDJSON line ${i + 1} must be a JSON object`);
    }
    assertNoPrototypePollution(doc);
    docs.push(doc);
  }
  return docs;
}

function setDottedPath(target: Record<string, any>, pathStr: string, value: any): void {
  const parts = pathStr.split(".");
  let cur = target;
  for (let i = 0; i < parts.length - 1; i++) {
    const part = parts[i];
    if (part === "__proto__" || part === "constructor" || part === "prototype") {
      throw new MongoApiError("SECURITY_VIOLATION", `Prototype pollution attempt with key '${part}'`);
    }
    if (cur[part] === undefined || cur[part] === null || typeof cur[part] !== "object") {
      cur[part] = {};
    }
    cur = cur[part];
  }
  const last = parts[parts.length - 1];
  if (last === "__proto__" || last === "constructor" || last === "prototype") {
    throw new MongoApiError("SECURITY_VIOLATION", `Prototype pollution attempt with key '${last}'`);
  }
  cur[last] = value;
}

function coerceCsvValue(val: string): any {
  const trimmed = val.trim();
  if (trimmed === "" || trimmed.toLowerCase() === "null") {
    return null;
  }
  if (trimmed.toLowerCase() === "true") return true;
  if (trimmed.toLowerCase() === "false") return false;
  if (/^-?\d+(\.\d+)?$/.test(trimmed)) {
    const num = Number(trimmed);
    if (Number.isFinite(num)) return num;
  }
  if ((trimmed.startsWith("{") && trimmed.endsWith("}")) || (trimmed.startsWith("[") && trimmed.endsWith("]"))) {
    try {
      const parsed = JSON.parse(trimmed);
      assertNoPrototypePollution(parsed);
      return parsed;
    } catch {
      // Retain as string
    }
  }
  return val;
}

export function parseCsv(csvText: string): Record<string, any>[] {
  const rows: string[][] = [];
  let currentRow: string[] = [];
  let currentField = "";
  let insideQuotes = false;
  let i = 0;
  const len = csvText.length;

  while (i < len) {
    const char = csvText[i];
    const nextChar = i + 1 < len ? csvText[i + 1] : "";

    if (insideQuotes) {
      if (char === '"') {
        if (nextChar === '"') {
          currentField += '"';
          i += 2;
          continue;
        } else {
          insideQuotes = false;
          i++;
          continue;
        }
      } else {
        currentField += char;
        i++;
        continue;
      }
    } else {
      if (char === '"') {
        insideQuotes = true;
        i++;
        continue;
      } else if (char === ",") {
        currentRow.push(currentField);
        currentField = "";
        i++;
        continue;
      } else if (char === "\r") {
        if (nextChar === "\n") i++;
        currentRow.push(currentField);
        currentField = "";
        rows.push(currentRow);
        currentRow = [];
        i++;
        continue;
      } else if (char === "\n") {
        currentRow.push(currentField);
        currentField = "";
        rows.push(currentRow);
        currentRow = [];
        i++;
        continue;
      } else {
        currentField += char;
        i++;
        continue;
      }
    }
  }

  if (currentField.length > 0 || currentRow.length > 0) {
    currentRow.push(currentField);
    rows.push(currentRow);
  }

  const cleanRows = rows.filter((r) => r.length > 1 || (r.length === 1 && r[0].trim().length > 0));
  if (cleanRows.length === 0) {
    return [];
  }

  const rawHeaders = cleanRows[0].map((h) => h.trim());
  for (const h of rawHeaders) {
    if (!h) {
      throw new MongoApiError("MONGO_VALIDATION_ERROR", "CSV contains empty column header");
    }
    if (h.includes("__proto__") || h.includes("constructor") || h.includes("prototype")) {
      throw new MongoApiError("SECURITY_VIOLATION", `Prototype pollution attempt detected in CSV header: ${h}`);
    }
  }

  const documents: Record<string, any>[] = [];
  for (let rIdx = 1; rIdx < cleanRows.length; rIdx++) {
    const row = cleanRows[rIdx];
    const doc: Record<string, any> = {};

    for (let cIdx = 0; cIdx < rawHeaders.length; cIdx++) {
      const header = rawHeaders[cIdx];
      const rawVal = cIdx < row.length ? row[cIdx] : "";
      const val = coerceCsvValue(rawVal);
      setDottedPath(doc, header, val);
    }
    documents.push(doc);
  }

  return documents;
}

export function parseImportPayload(payload: unknown, format: MongoBulkFormat): Record<string, any>[] {
  if (payload === undefined || payload === null) {
    throw new MongoApiError("MONGO_VALIDATION_ERROR", "Payload cannot be null or undefined");
  }

  let byteSize = 0;
  if (typeof payload === "string") {
    byteSize = Buffer.byteLength(payload, "utf8");
  } else if (Buffer.isBuffer(payload)) {
    byteSize = payload.length;
  } else {
    byteSize = Buffer.byteLength(JSON.stringify(payload), "utf8");
  }

  if (byteSize > MAX_IMPORT_CHUNK_SIZE_BYTES) {
    throw new MongoApiError(
      "MONGO_LIMIT_EXCEEDED",
      `Chunk payload size ${byteSize} bytes exceeds maximum limit of ${MAX_IMPORT_CHUNK_SIZE_BYTES} bytes (4MB)`,
    );
  }

  const text = typeof payload === "string" ? payload : Buffer.isBuffer(payload) ? payload.toString("utf8") : "";

  let docs: Record<string, any>[];
  if (format === "json") {
    docs = parseJsonArray(text || payload);
  } else if (format === "ndjson") {
    if (typeof payload !== "string" && !Buffer.isBuffer(payload)) {
      throw new MongoApiError("MONGO_VALIDATION_ERROR", "NDJSON payload must be a string or buffer");
    }
    docs = parseNdjson(text);
  } else if (format === "csv") {
    if (typeof payload !== "string" && !Buffer.isBuffer(payload)) {
      throw new MongoApiError("MONGO_VALIDATION_ERROR", "CSV payload must be a string or buffer");
    }
    docs = parseCsv(text);
  } else {
    throw new MongoApiError("MONGO_VALIDATION_ERROR", `Unsupported bulk import format: ${format}`);
  }

  if (docs.length > MAX_IMPORT_CHUNK_DOCS) {
    throw new MongoApiError(
      "MONGO_LIMIT_EXCEEDED",
      `Chunk document count ${docs.length} exceeds maximum limit of ${MAX_IMPORT_CHUNK_DOCS} documents`,
    );
  }

  return docs;
}

export function flattenObject(obj: Record<string, any>, prefix = ""): Record<string, any> {
  const result: Record<string, any> = {};
  for (const [key, val] of Object.entries(obj)) {
    if (key === "__proto__" || key === "constructor" || key === "prototype") continue;
    const newKey = prefix ? `${prefix}.${key}` : key;
    if (
      val !== null &&
      typeof val === "object" &&
      !Array.isArray(val) &&
      !(val instanceof Date) &&
      !(val as any)._bsontype &&
      !(val as any).$oid &&
      !(val as any).$date
    ) {
      const nested = flattenObject(val, newKey);
      Object.assign(result, nested);
    } else {
      result[newKey] = val;
    }
  }
  return result;
}

export function escapeCsvValue(val: unknown): string {
  if (val === null || val === undefined) return "";
  let str: string;
  if (val instanceof Date) {
    str = val.toISOString();
  } else if (typeof val === "object") {
    if ((val as any)._bsontype === "ObjectId" && typeof (val as any).toHexString === "function") {
      str = (val as any).toHexString();
    } else if (typeof (val as any).$oid === "string") {
      str = (val as any).$oid;
    } else if (typeof (val as any).$date === "string") {
      str = (val as any).$date;
    } else {
      str = JSON.stringify(val);
    }
  } else {
    str = String(val);
  }
  if (str.includes(",") || str.includes('"') || str.includes("\n") || str.includes("\r")) {
    return `"${str.replace(/"/g, '""')}"`;
  }
  return str;
}

async function writeStreamDrain(stream: fs.WriteStream, chunk: string): Promise<void> {
  if (!stream.write(chunk)) {
    await new Promise<void>((resolve, reject) => {
      const onDrain = () => {
        stream.removeListener("error", onError);
        resolve();
      };
      const onError = (err: any) => {
        stream.removeListener("drain", onDrain);
        reject(err);
      };
      stream.once("drain", onDrain);
      stream.once("error", onError);
    });
  }
}

// ===========================================================================
// Operation Lifecycle Manager
// ===========================================================================

export interface InternalOperationState {
  operation: MongoBulkOperation;
  controller: AbortController;
  processedChunkIndices: Set<number>;
  cachedChunkResponses: Map<number, MongoBulkImportChunkResult>;
  totalBytesProcessed: number;
  isSaving?: boolean;
}

export class BulkOperationManager {
  private operations = new Map<string, InternalOperationState>();
  private pendingStagingCleanups = new Map<string, StagingFileIdentity>();
  private static readonly MAX_PENDING_STAGING_CLEANUPS = 100;
  private sweepTimer: NodeJS.Timeout | null = null;

  constructor(private ttlMs: number = OPERATION_TTL_MS) {
    this.sweepTimer = setInterval(() => {
      this.sweepExpired().catch(() => {});
    }, 5 * 60 * 1000);
    if (this.sweepTimer.unref) {
      this.sweepTimer.unref();
    }
  }

  recordPendingStagingCleanup(
    stagingPath: string,
    identity?: StagingFileIdentity,
  ): boolean {
    // Duplicate path registration: idempotent no-op, preserves original authoritative identity and does not consume extra capacity
    if (this.pendingStagingCleanups.has(stagingPath)) {
      return true;
    }

    // Below capacity: track for automated retry
    if (this.pendingStagingCleanups.size < BulkOperationManager.MAX_PENDING_STAGING_CLEANUPS) {
      this.pendingStagingCleanups.set(
        stagingPath,
        identity ?? {
          exactPath: stagingPath,
          dev: 0,
          ino: 0,
          size: 0,
          registeredAt: Date.now(),
          retryCount: 0,
        },
      );
      logger.info(
        { stagingPath, currentCount: this.pendingStagingCleanups.size },
        "Recorded staging file identity for bounded retry cleanup",
      );
      return true;
    }

    // Capacity overflow (queue full): honest refusal and observable orphan logging
    logger.warn(
      {
        stagingPath,
        capacity: BulkOperationManager.MAX_PENDING_STAGING_CLEANUPS,
        dropped: true,
      },
      "Pending staging cleanups queue capacity reached (100); temporary staging file abandoned as untracked orphan requiring manual administrative removal",
    );
    return false;
  }

  getPendingStagingCleanupsCount(): number {
    return this.pendingStagingCleanups.size;
  }

  getPendingStagingCleanup(stagingPath: string): StagingFileIdentity | undefined {
    return this.pendingStagingCleanups.get(stagingPath);
  }

  clearPendingStagingCleanups(): void {
    this.pendingStagingCleanups.clear();
  }

  createOperation(
    type: MongoBulkOperationType,
    dbId: string,
    collection: string,
    format: MongoBulkFormat,
  ): InternalOperationState {
    assertValidCollectionName(collection);
    const operationId = uuidv4();
    const now = new Date();
    const expiresAt = new Date(now.getTime() + this.ttlMs).toISOString();

    const operation: MongoBulkOperation = {
      operationId,
      type,
      status: "pending",
      dbId,
      collection,
      format,
      createdAt: now.toISOString(),
      updatedAt: now.toISOString(),
      expiresAt,
      processedDocuments: 0,
      successfulDocuments: 0,
      failedDocuments: 0,
    };

    const state: InternalOperationState = {
      operation,
      controller: new AbortController(),
      processedChunkIndices: new Set<number>(),
      cachedChunkResponses: new Map<number, MongoBulkImportChunkResult>(),
      totalBytesProcessed: 0,
    };

    this.operations.set(operationId, state);
    return state;
  }

  getOperation(operationId: string): InternalOperationState | null {
    assertValidOperationId(operationId);
    const state = this.operations.get(operationId);
    if (!state) return null;

    if (Date.now() > new Date(state.operation.expiresAt).getTime()) {
      if (state.isSaving === true) {
        return state;
      }
      this.cleanup(operationId);
      return null;
    }

    return state;
  }

  transition(
    operationId: string,
    newStatus: MongoBulkOperationStatus,
    error?: string,
  ): void {
    const state = this.getOperation(operationId);
    if (!state) {
      throw new MongoApiError("MONGO_NOT_FOUND", `Operation '${operationId}' not found or expired`);
    }

    const currentStatus = state.operation.status;
    if (currentStatus === "completed" || currentStatus === "failed" || currentStatus === "cancelled") {
      throw new MongoApiError(
        "MONGO_INVALID_STATE",
        `Cannot transition terminal operation '${operationId}' from '${currentStatus}' to '${newStatus}'`,
      );
    }

    if (currentStatus === "pending" && !["in_progress", "cancelled", "failed"].includes(newStatus)) {
      throw new MongoApiError(
        "MONGO_INVALID_STATE",
        `Invalid transition from '${currentStatus}' to '${newStatus}'`,
      );
    }

    if (currentStatus === "in_progress" && !["completed", "cancelled", "failed"].includes(newStatus)) {
      throw new MongoApiError(
        "MONGO_INVALID_STATE",
        `Invalid transition from '${currentStatus}' to '${newStatus}'`,
      );
    }

    state.operation.status = newStatus;
    state.operation.updatedAt = new Date().toISOString();
    if (error) {
      state.operation.error = safeMongoError(error);
    }
  }

  cancel(operationId: string): MongoBulkCancelResult {
    const state = this.getOperation(operationId);
    if (!state) {
      throw new MongoApiError("MONGO_NOT_FOUND", `Operation '${operationId}' not found or expired`);
    }

    if (state.isSaving === true) {
      throw new MongoApiError(
        "MONGO_CONCURRENT_SAVE",
        "Cannot cancel an export operation that is currently saving",
      );
    }

    if (state.operation.status === "cancelled") {
      return {
        operationId,
        status: "cancelled",
        message: "Operation was already cancelled",
      };
    }

    if (state.operation.status === "completed" || state.operation.status === "failed") {
      throw new MongoApiError(
        "MONGO_INVALID_STATE",
        `Cannot cancel an operation that has already terminated with status '${state.operation.status}'`,
      );
    }

    state.operation.status = "cancelled";
    state.operation.updatedAt = new Date().toISOString();
    state.controller.abort();

    if (state.operation.tempFilePath) {
      try {
        if (fs.existsSync(state.operation.tempFilePath)) {
          fs.unlinkSync(state.operation.tempFilePath);
        }
      } catch {
        // safe ignore
      }
    }

    return {
      operationId,
      status: "cancelled",
      message: "Operation cancelled successfully",
    };
  }

  cleanup(operationId: string): MongoBulkCleanupResult {
    assertValidOperationId(operationId);
    const state = this.operations.get(operationId);
    if (state) {
      if (state.isSaving === true) {
        throw new MongoApiError(
          "MONGO_CONCURRENT_SAVE",
          "Cannot clean up an export operation that is currently saving",
        );
      }
      state.controller.abort();
      if (state.operation.tempFilePath) {
        try {
          if (fs.existsSync(state.operation.tempFilePath)) {
            fs.unlinkSync(state.operation.tempFilePath);
          }
        } catch {
          // safe ignore
        }
      }
      this.operations.delete(operationId);
      return { operationId, success: true };
    }
    return { operationId, success: true, alreadyCleaned: true };
  }

  async sweepExpired(): Promise<void> {
    const now = Date.now();
    for (const [id, state] of Array.from(this.operations.entries())) {
      if (state.isSaving === true) {
        continue;
      }
      if (now > new Date(state.operation.expiresAt).getTime()) {
        try {
          this.cleanup(id);
        } catch {
          // safe ignore
        }
      }
    }

    for (const [stagingPath, expected] of Array.from(this.pendingStagingCleanups.entries())) {
      try {
        // Step A: Inspect path via lstat (NEVER follow symlinks)
        let currentStat: fs.Stats;
        try {
          currentStat = await fs.promises.lstat(stagingPath);
        } catch (statErr: any) {
          if (statErr?.code === "ENOENT") {
            // File already removed externally; safely evict stale entry and free capacity
            this.pendingStagingCleanups.delete(stagingPath);
            logger.info({ stagingPath }, "Staging file already absent (ENOENT); evicted from cleanup queue");
            continue;
          }
          logger.warn({ err: statErr, stagingPath }, "Failed to lstat staging path during retry verification; retaining");
          continue;
        }

        // Step B: Must be a regular file; reject symlinks, directories, FIFOs, and devices
        // Filesystem entry is left untouched on disk (never moved or isolated) and evicted from cleanup tracking
        if (!currentStat.isFile() || currentStat.isSymbolicLink()) {
          logger.error(
            { stagingPath, isSymbolicLink: currentStat.isSymbolicLink(), isDirectory: currentStat.isDirectory() },
            "SECURITY ALERT: Staging path is no longer a regular file (symlink or directory substituted); unlinking aborted, filesystem entry left untouched on disk, and entry evicted from automated cleanup tracking",
          );
          this.pendingStagingCleanups.delete(stagingPath);
          continue;
        }

        // Step C: Verify filesystem identity (dev & ino)
        const hasValidExpected = expected.dev !== 0 && expected.ino !== 0;
        const hasValidCurrent = currentStat.dev !== 0 && currentStat.ino !== 0;

        if (hasValidExpected && hasValidCurrent) {
          if (currentStat.dev !== expected.dev || currentStat.ino !== expected.ino) {
            logger.error(
              {
                stagingPath,
                expectedDev: expected.dev,
                actualDev: currentStat.dev,
                expectedIno: expected.ino,
                actualIno: currentStat.ino,
              },
              "SECURITY ALERT: Staging file identity mismatch (dev/ino substitution detected); unlinking aborted, filesystem entry left untouched on disk, and entry evicted from automated cleanup tracking",
            );
            this.pendingStagingCleanups.delete(stagingPath);
            continue;
          }
        } else {
          // Fail-Closed Fallback for unsupported or unpopulated filesystem identity
          logger.warn(
            { stagingPath, dev: currentStat.dev, ino: currentStat.ino },
            "Filesystem identity (dev/ino) unpopulated or unsupported on host volume; failing closed, refusing automated retry unlink, and evicting entry from cleanup tracking",
          );
          this.pendingStagingCleanups.delete(stagingPath);
          continue;
        }

        // Step D: Authoritative unlink of verified staging file
        await fs.promises.unlink(stagingPath);
        this.pendingStagingCleanups.delete(stagingPath);
        logger.info({ stagingPath }, "Successfully verified identity and unlinked leftover staging file on retry");
      } catch (retryErr: any) {
        if (retryErr?.code === "ENOENT") {
          this.pendingStagingCleanups.delete(stagingPath);
        } else {
          expected.retryCount = (expected.retryCount ?? 0) + 1;
          if (expected.retryCount >= 5) {
            logger.warn(
              { stagingPath, retries: expected.retryCount },
              "Staging file retry limit reached (5); abandoning as untracked orphan",
            );
            this.pendingStagingCleanups.delete(stagingPath);
          } else {
            logger.warn({ err: retryErr, stagingPath }, "Staging cleanup retry failed; retaining in retry queue");
          }
        }
      }
    }
  }

  dispose(): void {
    if (this.sweepTimer) {
      clearInterval(this.sweepTimer);
      this.sweepTimer = null;
    }
    for (const id of Array.from(this.operations.keys())) {
      try {
        const state = this.operations.get(id);
        if (state?.isSaving === true) {
          logger.warn(
            { operationId: id },
            "Operation has an active save in progress during manager disposal; active save protection preserved and source file retained",
          );
          continue;
        }
        this.cleanup(id);
      } catch {
        // safe ignore during dispose
      }
    }
    this.pendingStagingCleanups.clear();
  }
}

// ===========================================================================
// MongoBulkEngine Main Service
// ===========================================================================

export class MongoBulkEngine {
  constructor(
    private dbService: DatabaseService = new DatabaseService(),
    public readonly opManager: BulkOperationManager = new BulkOperationManager(),
  ) {
    if (!fs.existsSync(EXPORT_DIR)) {
      try {
        fs.mkdirSync(EXPORT_DIR, { recursive: true });
      } catch {
        // handled in runtime
      }
    }
  }

  async getDb(dbId: string): Promise<{ db: any; conn: any; dbType: DBType; nativeDb: Db }> {
    const { db, conn, dbType } = await this.dbService.getDatabaseConnection(dbId);
    if (dbType !== DBType.MONGODB) {
      throw new MongoApiError(
        "MONGO_INVALID_DATABASE",
        `Database ${dbId} is not a MongoDB database (type: ${dbType})`,
      );
    }
    const nativeDb = selectDb(conn);
    return { db, conn, dbType, nativeDb };
  }

  // =========================================================================
  // 1. Bulk Import Engine
  // =========================================================================

  async importStart(req: MongoBulkImportStartRequest): Promise<MongoBulkImportStartResult> {
    const { dbId, collection, format } = req;
    assertValidCollectionName(collection);

    if (!["json", "ndjson", "csv"].includes(format)) {
      throw new MongoApiError("MONGO_VALIDATION_ERROR", `Invalid bulk format '${format}'`);
    }

    const { db, conn } = await this.getDb(dbId);
    assertNotReadOnly(db, conn);

    const state = this.opManager.createOperation("import", dbId, collection, format);

    return {
      operationId: state.operation.operationId,
      status: state.operation.status,
      format: state.operation.format,
      collection: state.operation.collection,
    };
  }

  async importChunk(req: MongoBulkImportChunkRequest): Promise<MongoBulkImportChunkResult> {
    const { operationId, chunkIndex, isLastChunk, payload } = req;
    assertValidOperationId(operationId);

    if (typeof chunkIndex !== "number" || !Number.isInteger(chunkIndex) || chunkIndex < 0) {
      throw new MongoApiError("MONGO_VALIDATION_ERROR", "chunkIndex must be a non-negative integer");
    }

    const state = this.opManager.getOperation(operationId);
    if (!state) {
      throw new MongoApiError("MONGO_NOT_FOUND", `Operation '${operationId}' not found or expired`);
    }

    if (state.operation.type !== "import") {
      throw new MongoApiError("MONGO_VALIDATION_ERROR", `Operation '${operationId}' is not an import operation`);
    }

    if (state.operation.status === "cancelled") {
      throw new MongoApiError("MONGO_OPERATION_CANCELLED", "Operation has been cancelled");
    }

    if (state.operation.status === "failed") {
      throw new MongoApiError("MONGO_OPERATION_FAILED", `Operation has failed: ${state.operation.error}`);
    }

    // Replay protection: repeated chunkIndex returns cached result without double write
    if (state.processedChunkIndices.has(chunkIndex)) {
      const cached = state.cachedChunkResponses.get(chunkIndex);
      if (cached) {
        return cached;
      }
    }

    const { db, conn, nativeDb } = await this.getDb(state.operation.dbId);
    assertNotReadOnly(db, conn);

    if (state.operation.status === "pending") {
      this.opManager.transition(operationId, "in_progress");
    }

    let byteSize = 0;
    if (typeof payload === "string") {
      byteSize = Buffer.byteLength(payload, "utf8");
    } else if (Buffer.isBuffer(payload)) {
      byteSize = payload.length;
    } else {
      byteSize = Buffer.byteLength(JSON.stringify(payload), "utf8");
    }

    state.totalBytesProcessed += byteSize;
    if (state.totalBytesProcessed > MAX_IMPORT_TOTAL_SIZE_BYTES) {
      throw new MongoApiError(
        "MONGO_LIMIT_EXCEEDED",
        `Total cumulative import payload exceeds ${MAX_IMPORT_TOTAL_SIZE_BYTES} bytes (16MB)`,
      );
    }

    const docs = parseImportPayload(payload, state.operation.format);

    const coll = nativeDb.collection(state.operation.collection);
    const writeResult = await this.writeBatches(coll, docs, state.controller);

    mongodbCache.clearCollectionCache(conn, state.operation.collection);

    state.operation.processedDocuments += docs.length;
    state.operation.successfulDocuments += writeResult.insertedCount;
    state.operation.failedDocuments += writeResult.failedCount;
    state.operation.updatedAt = new Date().toISOString();

    const isComplete = Boolean(isLastChunk);
    if (isComplete) {
      this.opManager.transition(operationId, "completed");
    }

    const chunkResult: MongoBulkImportChunkResult = {
      operationId,
      chunkIndex,
      status: state.operation.status,
      insertedCount: writeResult.insertedCount,
      failedCount: writeResult.failedCount,
      errors: writeResult.errors.length > 0 ? writeResult.errors : undefined,
      isComplete,
      totalInserted: state.operation.successfulDocuments,
      totalFailed: state.operation.failedDocuments,
    };

    state.processedChunkIndices.add(chunkIndex);
    state.cachedChunkResponses.set(chunkIndex, chunkResult);

    return chunkResult;
  }

  private async writeBatches(
    coll: Collection,
    docs: Record<string, any>[],
    controller: AbortController,
  ): Promise<{ insertedCount: number; failedCount: number; errors: Array<{ index: number; code: string; message: string }> }> {
    let insertedCount = 0;
    let failedCount = 0;
    const errors: Array<{ index: number; code: string; message: string }> = [];

    for (let i = 0; i < docs.length; i += BATCH_WRITE_SIZE) {
      if (controller.signal.aborted) {
        throw new MongoApiError("MONGO_OPERATION_CANCELLED", "Operation was cancelled");
      }

      const batch = docs.slice(i, i + BATCH_WRITE_SIZE);
      const bsonDocs = batch.map((d) => serializeMongoEJSONDocument(d));

      try {
        const res = await coll.insertMany(bsonDocs, { ordered: false });
        insertedCount += res.insertedCount ?? Object.keys(res.insertedIds || {}).length;
      } catch (err: any) {
        if (err?.name === "MongoBulkWriteError" || err?.name === "BulkWriteError" || err?.writeErrors) {
          const nInserted = err.result?.nInserted ?? err.insertedCount ?? 0;
          insertedCount += nInserted;
          const writeErrors = err.writeErrors || [];
          for (const we of writeErrors) {
            const docIdx = i + (we.index ?? 0);
            const isDup = we.code === 11000 || we.code === 11001;
            errors.push({
              index: docIdx,
              code: isDup ? "MONGO_DUPLICATE_KEY" : "MONGO_WRITE_ERROR",
              message: safeMongoError(we.errmsg || we.message || "Write error"),
            });
          }
          failedCount += (batch.length - nInserted);
        } else {
          throw err;
        }
      }
    }

    return { insertedCount, failedCount, errors };
  }

  // =========================================================================
  // 2. Bulk Export Engine (Streaming directly to temporary file)
  // =========================================================================

  async exportStart(req: MongoBulkExportStartRequest): Promise<MongoBulkExportStartResult> {
    const { dbId, collection, format, filter = {}, projection, sort, limit } = req;
    assertValidCollectionName(collection);

    if (!["json", "ndjson", "csv"].includes(format)) {
      throw new MongoApiError("MONGO_VALIDATION_ERROR", `Invalid bulk export format '${format}'`);
    }

    const lease = await this.dbService.acquireConnection(dbId);
    const nativeDb = selectDb(lease.conn);

    const state = this.opManager.createOperation("export", dbId, collection, format);
    const operationId = state.operation.operationId;

    if (!fs.existsSync(EXPORT_DIR)) {
      fs.mkdirSync(EXPORT_DIR, { recursive: true });
    }
    const tempFilePath = path.join(EXPORT_DIR, `${operationId}.${format}`);
    state.operation.tempFilePath = tempFilePath;

    const bsonFilter = serializeMongoFilter(filter);
    const coll = nativeDb.collection(collection);

    // Run export stream asynchronously in background
    (async () => {
      let writeStream: fs.WriteStream | null = null;
      let cursor: any = null;
      try {
        this.opManager.transition(operationId, "in_progress");

        writeStream = fs.createWriteStream(tempFilePath, { encoding: "utf8" });
        cursor = coll.find(bsonFilter, {
          batchSize: EXPORT_CURSOR_BATCH_SIZE,
          promoteValues: false,
          promoteLongs: false,
          promoteBuffers: false,
        });

        if (sort) cursor.sort(sort);
        if (projection) cursor.project(projection);
        if (limit && limit > 0) cursor.limit(limit);

        if (format === "json") {
          await this.streamExportJson(cursor, writeStream, state);
        } else if (format === "ndjson") {
          await this.streamExportNdjson(cursor, writeStream, state);
        } else if (format === "csv") {
          await this.streamExportCsv(cursor, writeStream, state);
        }

        await new Promise<void>((resolve, reject) => {
          writeStream!.end(() => resolve());
          writeStream!.on("error", reject);
        });

        const stat = await fs.promises.stat(tempFilePath).catch(() => null);
        state.operation.fileSizeBytes = stat?.size ?? 0;
        state.operation.updatedAt = new Date().toISOString();

        this.opManager.transition(operationId, "completed");
      } catch (err: any) {
        if (state.controller.signal.aborted || err?.code === "MONGO_OPERATION_CANCELLED") {
          this.opManager.transition(operationId, "cancelled");
        } else {
          this.opManager.transition(operationId, "failed", err?.message || String(err));
        }
        await fs.promises.unlink(tempFilePath).catch(() => {});
      } finally {
        if (cursor) {
          await cursor.close().catch(() => {});
        }
        if (writeStream && !writeStream.destroyed) {
          writeStream.destroy();
        }
        lease.release();
      }
    })();

    return {
      operationId,
      status: state.operation.status,
      collection,
      format,
    };
  }

  private async streamExportJson(
    cursor: any,
    stream: fs.WriteStream,
    state: InternalOperationState,
  ): Promise<void> {
    await writeStreamDrain(stream, "[\n");
    let isFirst = true;

    for await (const doc of cursor) {
      if (state.controller.signal.aborted) {
        throw new MongoApiError("MONGO_OPERATION_CANCELLED", "Export operation was cancelled");
      }
      const serialized = JSON.stringify(mongoBSONtoEJSON(doc));
      const chunk = isFirst ? `  ${serialized}` : `,\n  ${serialized}`;
      isFirst = false;
      await writeStreamDrain(stream, chunk);
      state.operation.processedDocuments++;
      state.operation.successfulDocuments++;
    }

    await writeStreamDrain(stream, "\n]\n");
  }

  private async streamExportNdjson(
    cursor: any,
    stream: fs.WriteStream,
    state: InternalOperationState,
  ): Promise<void> {
    for await (const doc of cursor) {
      if (state.controller.signal.aborted) {
        throw new MongoApiError("MONGO_OPERATION_CANCELLED", "Export operation was cancelled");
      }
      const line = JSON.stringify(mongoBSONtoEJSON(doc)) + "\n";
      await writeStreamDrain(stream, line);
      state.operation.processedDocuments++;
      state.operation.successfulDocuments++;
    }
  }

  private async streamExportCsv(
    cursor: any,
    stream: fs.WriteStream,
    state: InternalOperationState,
  ): Promise<void> {
    const bufferedDocs: Document[] = [];
    const headerSet = new Set<string>();

    for await (const doc of cursor) {
      if (state.controller.signal.aborted) {
        throw new MongoApiError("MONGO_OPERATION_CANCELLED", "Export operation was cancelled");
      }
      bufferedDocs.push(doc);
      const flattened = flattenObject(doc);
      for (const k of Object.keys(flattened)) {
        headerSet.add(k);
      }
      if (bufferedDocs.length >= 100) {
        break;
      }
    }

    const headers = Array.from(headerSet).sort((a, b) => {
      if (a === "_id") return -1;
      if (b === "_id") return 1;
      return a.localeCompare(b);
    });

    if (headers.length > 0) {
      const headerLine = headers.map(escapeCsvValue).join(",") + "\n";
      await writeStreamDrain(stream, headerLine);
    }

    for (const doc of bufferedDocs) {
      if (state.controller.signal.aborted) {
        throw new MongoApiError("MONGO_OPERATION_CANCELLED", "Export operation was cancelled");
      }
      const flattened = flattenObject(doc);
      const row = headers.map((h) => escapeCsvValue(flattened[h])).join(",") + "\n";
      await writeStreamDrain(stream, row);
      state.operation.processedDocuments++;
      state.operation.successfulDocuments++;
    }

    for await (const doc of cursor) {
      if (state.controller.signal.aborted) {
        throw new MongoApiError("MONGO_OPERATION_CANCELLED", "Export operation was cancelled");
      }
      const flattened = flattenObject(doc);
      const row = headers.map((h) => escapeCsvValue(flattened[h])).join(",") + "\n";
      await writeStreamDrain(stream, row);
      state.operation.processedDocuments++;
      state.operation.successfulDocuments++;
    }
  }

  // =========================================================================
  // 3. Operation Lifecycle Management
  // =========================================================================

  async getOperationStatus(operationId: string): Promise<MongoBulkOperationStatusResult> {
    assertValidOperationId(operationId);
    const state = this.opManager.getOperation(operationId);
    if (!state) {
      throw new MongoApiError("MONGO_NOT_FOUND", `Operation '${operationId}' not found or expired`);
    }

    const op = state.operation;
    return {
      operationId: op.operationId,
      type: op.type,
      status: op.status,
      collection: op.collection,
      format: op.format,
      processedDocuments: op.processedDocuments,
      successfulDocuments: op.successfulDocuments,
      failedDocuments: op.failedDocuments,
      fileSizeBytes: op.fileSizeBytes,
      error: op.error,
      createdAt: op.createdAt,
      updatedAt: op.updatedAt,
      expiresAt: op.expiresAt,
    };
  }

  async cancelOperation(operationId: string): Promise<MongoBulkCancelResult> {
    assertValidOperationId(operationId);
    return this.opManager.cancel(operationId);
  }

  async cleanupOperation(operationId: string): Promise<MongoBulkCleanupResult> {
    assertValidOperationId(operationId);
    return this.opManager.cleanup(operationId);
  }

  async exportSaveTo(
    params: MongoBulkExportSaveToRequest,
  ): Promise<MongoBulkExportSaveToResult> {
    const { operationId, destinationPath, options } = params || {};
    assertValidOperationId(operationId);

    if (
      typeof destinationPath !== "string" ||
      destinationPath.trim().length === 0 ||
      !path.isAbsolute(destinationPath)
    ) {
      throw new MongoApiError(
        "MONGO_VALIDATION_ERROR",
        "destinationPath must be a non-empty absolute path",
      );
    }

    const state = this.opManager.getOperation(operationId);
    if (!state) {
      throw new MongoApiError(
        "MONGO_NOT_FOUND",
        `Operation '${operationId}' not found or expired`,
      );
    }

    if (state.operation.type !== "export") {
      throw new MongoApiError(
        "MONGO_INVALID_STATE",
        "Cannot save: operation is not an export",
      );
    }

    if (state.operation.status !== "completed") {
      throw new MongoApiError(
        "MONGO_INVALID_STATE",
        `Cannot save export file: operation status is '${state.operation.status}', expected 'completed'`,
      );
    }

    const sourceFilePath = state.operation.tempFilePath;
    if (!sourceFilePath || !fs.existsSync(sourceFilePath)) {
      throw new MongoApiError(
        "MONGO_NOT_FOUND",
        "Export source temporary file does not exist",
      );
    }

    if (state.isSaving === true) {
      throw new MongoApiError(
        "MONGO_CONCURRENT_SAVE",
        "Another save operation is already in progress for this export",
      );
    }

    // Synchronously acquire lock to eliminate race window
    state.isSaving = true;

    try {
      const normalizedDestPath = path.normalize(destinationPath);
      const parentDir = path.dirname(normalizedDestPath);

      let resolvedParent: string;
      try {
        resolvedParent = await fs.promises.realpath(parentDir);
      } catch (err: any) {
        throw new MongoApiError(
          "MONGO_SAVE_FAILED",
          `Parent directory does not exist or is not accessible: ${err?.message}`,
        );
      }

      let parentStat: fs.Stats;
      try {
        parentStat = await fs.promises.stat(resolvedParent);
      } catch (err: any) {
        throw new MongoApiError(
          "MONGO_SAVE_FAILED",
          `Failed to inspect parent directory: ${err?.message}`,
        );
      }
      if (!parentStat.isDirectory()) {
        throw new MongoApiError(
          "MONGO_SAVE_FAILED",
          "Parent path is not a directory",
        );
      }

      // Destination Type Inspection (prior to staging) with strict error discrimination
      let destStat: fs.Stats | null = null;
      try {
        destStat = await fs.promises.lstat(normalizedDestPath);
      } catch (err: any) {
        if (err?.code === "ENOENT") {
          destStat = null;
        } else {
          throw new MongoApiError(
            "MONGO_SAVE_FAILED",
            `Failed to inspect destination path (${err.code ?? "UNKNOWN"}): ${err.message}`,
          );
        }
      }

      if (destStat) {
        if (destStat.isDirectory()) {
          throw new MongoApiError(
            "MONGO_FILE_EXISTS",
            "Destination is an existing directory; cannot overwrite a directory with a file",
          );
        }
        if (
          destStat.isFIFO() ||
          destStat.isSocket() ||
          destStat.isBlockDevice() ||
          destStat.isCharacterDevice()
        ) {
          throw new MongoApiError(
            "MONGO_VALIDATION_ERROR",
            "Destination is a special device or socket; overwriting unsupported file types is forbidden",
          );
        }
        if (options?.overwrite !== true) {
          throw new MongoApiError(
            "MONGO_FILE_EXISTS",
            "Destination file already exists",
          );
        }
      }

      // Generate staging filename in same parent dir
      const stagingFileName = `${path.basename(normalizedDestPath)}.relwave-tmp-${uuidv4()}`;
      const tempDestPath = path.join(resolvedParent, stagingFileName);

      let stagingWriteStream: fs.WriteStream | null = null;
      let sourceReadStream: fs.ReadStream | null = null;

      try {
        stagingWriteStream = fs.createWriteStream(tempDestPath, {
          flags: "wx",
          mode: 0o600,
        });
        stagingWriteStream.on("error", () => {});

        sourceReadStream = fs.createReadStream(sourceFilePath);
        sourceReadStream.on("error", () => {});

        await new Promise<void>((resolve, reject) => {
          stagingWriteStream!.once("error", reject);
          sourceReadStream!.once("error", reject);
          stagingWriteStream!.once("finish", resolve);
          sourceReadStream!.pipe(stagingWriteStream!);
        });
      } catch (streamErr: any) {
        if (stagingWriteStream) {
          if (!stagingWriteStream.destroyed) {
            stagingWriteStream.destroy();
          }
          if (!stagingWriteStream.closed) {
            await new Promise<void>((res) => {
              stagingWriteStream!.once("close", () => res());
              setTimeout(res, 50);
            });
          }
        }
        if (sourceReadStream && !sourceReadStream.destroyed) {
          sourceReadStream.destroy();
        }

        // Attempt filesystem cleanup of temporary staging file
        try {
          await fs.promises.unlink(tempDestPath);
        } catch (cleanupErr: any) {
          if (cleanupErr?.code !== "ENOENT") {
            let streamFailureIdentity: StagingFileIdentity | undefined;
            try {
              const st = await fs.promises.lstat(tempDestPath);
              streamFailureIdentity = {
                exactPath: tempDestPath,
                dev: st.dev,
                ino: st.ino,
                size: st.size,
                birthtimeMs: st.birthtimeMs,
                registeredAt: Date.now(),
                retryCount: 0,
              };
            } catch {
              // Identity capture failed: streamFailureIdentity remains undefined.
              // Existing fail-closed behavior will apply during retry verification (dev: 0, ino: 0).
            }

            const isTracked = this.opManager.recordPendingStagingCleanup(
              tempDestPath,
              streamFailureIdentity,
            );
            if (!isTracked) {
              logger.warn(
                { tempDestPath, err: cleanupErr },
                "Failed to clean up staging file on streaming failure and retry queue at capacity; file abandoned as untracked orphan",
              );
            }
          }
        }

        throw new MongoApiError(
          "MONGO_SAVE_FAILED",
          `Failed to stream export data to staging file: ${streamErr?.message}`,
        );
      } finally {
        if (stagingWriteStream && !stagingWriteStream.destroyed) {
          stagingWriteStream.destroy();
        }
        if (sourceReadStream && !sourceReadStream.destroyed) {
          sourceReadStream.destroy();
        }
      }

      // Capture staging file identity for cleanup tracking
      let stagingIdentity: StagingFileIdentity | undefined;
      let stagedStat: fs.Stats | undefined;
      try {
        stagedStat = await fs.promises.lstat(tempDestPath);
        stagingIdentity = {
          exactPath: tempDestPath,
          dev: stagedStat.dev,
          ino: stagedStat.ino,
          size: stagedStat.size,
          birthtimeMs: stagedStat.birthtimeMs,
          registeredAt: Date.now(),
          retryCount: 0,
        };
      } catch {
        // Identity remains undefined if lstat fails; fail-closed rules will apply if cleanup retried
      }
      const bytesWritten = stagedStat?.size ?? 0;

      // STEP 1: Authoritative publication operation
      if (options?.overwrite === true) {
        // Atomic replacement via rename
        try {
          await fs.promises.rename(tempDestPath, normalizedDestPath);
        } catch (renameErr: any) {
          // Pre-publication failure: attempt staging cleanup
          try {
            await fs.promises.unlink(tempDestPath);
          } catch (cleanupErr: any) {
            if (cleanupErr?.code !== "ENOENT") {
              const isTracked = this.opManager.recordPendingStagingCleanup(
                tempDestPath,
                stagingIdentity,
              );
              if (!isTracked) {
                logger.warn(
                  { tempDestPath, err: cleanupErr },
                  "Failed to clean up staging file on pre-publication failure and retry queue at capacity; file abandoned as untracked orphan",
                );
              }
            }
          }

          throw new MongoApiError(
            "MONGO_SAVE_FAILED",
            `Failed to atomically replace destination file (${renameErr?.code ?? "UNKNOWN"}): ${renameErr?.message}`,
          );
        }
      } else {
        // Atomic hard-link publication for overwrite: false
        try {
          await fs.promises.link(tempDestPath, normalizedDestPath);
        } catch (linkErr: any) {
          // Pre-publication failure: attempt staging cleanup
          try {
            await fs.promises.unlink(tempDestPath);
          } catch (cleanupErr: any) {
            if (cleanupErr?.code !== "ENOENT") {
              const isTracked = this.opManager.recordPendingStagingCleanup(
                tempDestPath,
                stagingIdentity,
              );
              if (!isTracked) {
                logger.warn(
                  { tempDestPath, err: cleanupErr },
                  "Failed to clean up staging file on pre-publication failure and retry queue at capacity; file abandoned as untracked orphan",
                );
              }
            }
          }

          if (linkErr?.code === "EEXIST") {
            throw new MongoApiError(
              "MONGO_FILE_EXISTS",
              "Destination file already exists",
            );
          }

          if (
            linkErr?.code === "ENOSYS" ||
            linkErr?.code === "EOPNOTSUPP" ||
            linkErr?.code === "ENOTSUP"
          ) {
            throw new MongoApiError(
              "MONGO_UNSUPPORTED_FILESYSTEM",
              "The destination filesystem does not support atomic hard-link publication (e.g. FAT32, exFAT, or unsupported network share). " +
                "Please choose a destination on an NTFS or POSIX filesystem, or export with explicit overwrite enabled.",
            );
          }

          if (linkErr?.code === "EACCES" || linkErr?.code === "EPERM") {
            throw new MongoApiError(
              "MONGO_SAVE_FAILED",
              `Permission denied or operation not permitted during hard-link publication (${linkErr.code}): ${linkErr.message}`,
            );
          }

          if (linkErr?.code === "EXDEV") {
            throw new MongoApiError(
              "MONGO_SAVE_FAILED",
              "Cross-device link error (EXDEV): destination spans a volume, junction, or mount boundary. " +
                "Please choose a destination on a single local filesystem volume, or export with explicit overwrite enabled.",
            );
          }

          throw new MongoApiError(
            "MONGO_SAVE_FAILED",
            `Failed to publish export file (${linkErr?.code ?? "UNKNOWN"}): ${linkErr?.message}`,
          );
        }
      }

      // STEP 2: Post-publication staging cleanup & audit (Destination is COMMITTED)
      let warning: string | undefined;

      // Staging unlink is only required for hard-link publication (!options?.overwrite).
      // Atomic rename already moved/consumed tempDestPath; skipping unlink avoids an artificial ENOENT error.
      if (!options?.overwrite) {
        try {
          await fs.promises.unlink(tempDestPath);
        } catch (cleanupErr: any) {
          if (cleanupErr?.code !== "ENOENT") {
            const isTracked = this.opManager.recordPendingStagingCleanup(
              tempDestPath,
              stagingIdentity,
            );
            if (isTracked) {
              warning = `Destination file published successfully, but temporary staging file could not be removed (${cleanupErr.code ?? "UNKNOWN"}); queued for identity-verified retry cleanup.`;
            } else {
              warning = `Destination file published successfully, but temporary staging file could not be removed (${cleanupErr.code ?? "UNKNOWN"}) and cleanup queue is at capacity (100); file remains as an untracked orphan requiring manual removal: ${tempDestPath}`;
            }
          }
        }
      }

      try {
        const postStat = await fs.promises.lstat(normalizedDestPath);
        if (!postStat.isFile()) {
          const auditMsg =
            "Destination published, but post-commit audit detected unexpected file attributes";
          logger.warn({ destinationPath: normalizedDestPath }, auditMsg);
          warning = warning ? `${warning}; ${auditMsg}` : auditMsg;
        }
      } catch (auditErr: any) {
        const auditMsg = `Destination published, but post-commit verification failed (${auditErr.code ?? "UNKNOWN"}): ${auditErr.message}`;
        logger.warn({ err: auditErr, destinationPath: normalizedDestPath }, auditMsg);
        warning = warning ? `${warning}; ${auditMsg}` : auditMsg;
      }

      return {
        operationId,
        destinationPath: normalizedDestPath,
        bytesWritten,
        success: true,
        warning,
      };
    } finally {
      state.isSaving = false;
      if (Date.now() > new Date(state.operation.expiresAt).getTime()) {
        try {
          this.opManager.cleanup(operationId);
        } catch {
          // safe ignore
        }
      }
    }
  }

  // =========================================================================
  // 4. Supporting Bulk Mutations
  // =========================================================================

  async bulkInsert(req: MongoBulkInsertRequest): Promise<MongoBulkInsertResult> {
    const { dbId, collection, documents, options } = req;
    assertValidCollectionName(collection);

    if (!Array.isArray(documents) || documents.length === 0) {
      throw new MongoApiError("MONGO_VALIDATION_ERROR", "documents must be a non-empty array");
    }

    if (documents.length > MAX_BULK_INSERT_DOCS) {
      throw new MongoApiError(
        "MONGO_LIMIT_EXCEEDED",
        `documents count ${documents.length} exceeds maximum allowed of ${MAX_BULK_INSERT_DOCS}`,
      );
    }

    const byteSize = Buffer.byteLength(JSON.stringify(documents), "utf8");
    if (byteSize > MAX_BULK_INSERT_SIZE_BYTES) {
      throw new MongoApiError(
        "MONGO_LIMIT_EXCEEDED",
        `documents payload size ${byteSize} exceeds 16MB limit`,
      );
    }

    for (const doc of documents) {
      if (typeof doc !== "object" || doc === null || Array.isArray(doc)) {
        throw new MongoApiError("MONGO_VALIDATION_ERROR", "Each item in documents must be an object");
      }
      assertNoPrototypePollution(doc);
    }

    const { db, conn, nativeDb } = await this.getDb(dbId);
    assertNotReadOnly(db, conn);

    const coll = nativeDb.collection(collection);
    const ordered = options?.ordered ?? false;
    let insertedCount = 0;
    let failedCount = 0;
    const errors: Array<{ index: number; code: string; message: string }> = [];

    for (let i = 0; i < documents.length; i += BATCH_WRITE_SIZE) {
      const batch = documents.slice(i, i + BATCH_WRITE_SIZE);
      const bsonDocs = batch.map((d) => serializeMongoEJSONDocument(d));

      try {
        const res = await coll.insertMany(bsonDocs, { ordered });
        insertedCount += res.insertedCount ?? Object.keys(res.insertedIds || {}).length;
      } catch (err: any) {
        if (err?.name === "MongoBulkWriteError" || err?.name === "BulkWriteError" || err?.writeErrors) {
          const nInserted = err.result?.nInserted ?? err.insertedCount ?? 0;
          insertedCount += nInserted;
          const writeErrors = err.writeErrors || [];
          for (const we of writeErrors) {
            const isDup = we.code === 11000 || we.code === 11001;
            errors.push({
              index: i + (we.index ?? 0),
              code: isDup ? "MONGO_DUPLICATE_KEY" : "MONGO_WRITE_ERROR",
              message: safeMongoError(we.errmsg || we.message || "Write error"),
            });
          }
          failedCount += (batch.length - nInserted);
          if (ordered) {
            break;
          }
        } else {
          throw err;
        }
      }
    }

    mongodbCache.clearCollectionCache(conn, collection);

    return {
      collection,
      insertedCount,
      failedCount,
      errors: errors.length > 0 ? errors : undefined,
    };
  }

  async bulkUpdate(req: MongoBulkUpdateRequest): Promise<MongoBulkUpdateResult> {
    const { dbId, collection, filter, update, options } = req;
    assertValidCollectionName(collection);

    if (typeof filter !== "object" || filter === null || Array.isArray(filter)) {
      throw new MongoApiError("MONGO_INVALID_FILTER", "filter must be an object");
    }

    if (typeof update !== "object" || update === null || Array.isArray(update)) {
      throw new MongoApiError("MONGO_INVALID_UPDATE_OPERAND", "update must be an operator document");
    }

    const updateKeys = Object.keys(update);
    if (updateKeys.length === 0) {
      throw new MongoApiError("MONGO_INVALID_UPDATE_OPERAND", "No update operators provided");
    }
    for (const k of updateKeys) {
      if (!k.startsWith("$")) {
        throw new MongoApiError(
          "MONGO_INVALID_UPDATE_OPERAND",
          `'${k}' is not an update operator; top-level operators must begin with '$'`,
        );
      }
    }

    const isFilterEmpty = Object.keys(filter).length === 0;
    if (isFilterEmpty && options?.allowUnrestricted !== true) {
      throw new MongoApiError(
        "MONGO_BULK_OP_FORBIDDEN",
        "update requires a non-empty filter or allowUnrestricted: true to prevent accidental whole-collection operations",
      );
    }

    assertNoPrototypePollution(filter);
    assertNoPrototypePollution(update);

    const { db, conn, nativeDb } = await this.getDb(dbId);
    assertNotReadOnly(db, conn);

    const bsonFilter = serializeMongoFilter(filter);
    const bsonUpdate = serializeMongoUpdateOperand(update);
    const coll = nativeDb.collection(collection);

    const res = await coll.updateMany(bsonFilter, bsonUpdate, {
      upsert: options?.upsert ?? false,
    });

    mongodbCache.clearCollectionCache(conn, collection);

    let advisoryWarning: string | undefined;
    if (isFilterEmpty && options?.allowUnrestricted === true) {
      advisoryWarning = "Unrestricted bulk update performed across entire collection";
    }

    return {
      collection,
      matchedCount: res.matchedCount,
      modifiedCount: res.modifiedCount,
      upsertedId: res.upsertedId ? (mongoBSONtoEJSON(res.upsertedId) as any) : undefined,
      advisoryWarning,
    };
  }

  async bulkDelete(req: MongoBulkDeleteRequest): Promise<MongoBulkDeleteResult> {
    const { dbId, collection, filter, options } = req;
    assertValidCollectionName(collection);

    if (typeof filter !== "object" || filter === null || Array.isArray(filter)) {
      throw new MongoApiError("MONGO_INVALID_FILTER", "filter must be an object");
    }

    const isFilterEmpty = Object.keys(filter).length === 0;
    if (isFilterEmpty && options?.allowUnrestricted !== true) {
      throw new MongoApiError(
        "MONGO_BULK_OP_FORBIDDEN",
        "delete requires a non-empty filter or allowUnrestricted: true to prevent accidental whole-collection operations",
      );
    }

    assertNoPrototypePollution(filter);

    const { db, conn, nativeDb } = await this.getDb(dbId);
    assertNotReadOnly(db, conn);

    const bsonFilter = serializeMongoFilter(filter);
    const coll = nativeDb.collection(collection);

    const res = await coll.deleteMany(bsonFilter);

    mongodbCache.clearCollectionCache(conn, collection);

    let advisoryWarning: string | undefined;
    if (res.deletedCount > 100) {
      advisoryWarning = `Broad delete operation affected more than 100 documents (${res.deletedCount} deleted)`;
    }

    return {
      collection,
      deletedCount: res.deletedCount,
      advisoryWarning,
    };
  }
}
