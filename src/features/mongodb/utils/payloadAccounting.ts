/**
 * MongoDB Milestone 7 Phase 4 — Import Sizing & Payload Accounting
 *
 * Implements authoritative chunk and total payload size tracking,
 * physical file size heuristic screening, and serialization guards.
 *
 * Adheres to docs/M7_PHASE4_SPEC.md §4.1.
 */

import type { MongoBulkDocument } from "../types/bulk";

export const MAX_IMPORT_CHUNK_DOCS = 1000;
export const TARGET_IMPORT_CHUNK_BYTES = 2 * 1024 * 1024; // 2 MB (2,097,152 bytes)
export const MAX_IMPORT_CHUNK_BYTES = 4 * 1024 * 1024; // 4 MB (4,194,304 bytes)
export const MAX_IMPORT_TOTAL_SIZE_BYTES = 16 * 1024 * 1024; // 16 MB (16,777,216 bytes)
export const MAX_FILE_SIZE_BYTES = 32 * 1024 * 1024; // 32 MB (33,554,432 bytes)
export const ADVISORY_FILE_SIZE_BYTES = 16 * 1024 * 1024; // 16 MB (16,777,216 bytes)

export class ImportLimitExceededError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ImportLimitExceededError";
  }
}

export class ImportSerializationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ImportSerializationError";
  }
}

export class ZeroDocumentImportError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ZeroDocumentImportError";
  }
}

/**
 * Calculates authoritative UTF-8 byte length of a string or document array payload.
 */
export function getPayloadByteLength(payload: string | MongoBulkDocument[]): number {
  if (typeof payload === "string") {
    return new TextEncoder().encode(payload).length;
  }
  try {
    return new TextEncoder().encode(JSON.stringify(payload)).length;
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);
    throw new ImportSerializationError(`Failed to serialize chunk documents: ${message}`);
  }
}

/**
 * Validates on-disk file size against pre-screening thresholds.
 * - <= 0 bytes: invalid (empty)
 * - > 32 MB: invalid (hard limit)
 * - 16 MB < size <= 32 MB: valid with advisory warning
 * - <= 16 MB: valid
 */
export function validateFileSize(fileSize: number): {
  valid: boolean;
  advisory?: string;
  error?: string;
} {
  if (fileSize <= 0) {
    return {
      valid: false,
      error: "Selected file is empty (0 bytes). Import requires at least one document.",
    };
  }
  if (fileSize > MAX_FILE_SIZE_BYTES) {
    return {
      valid: false,
      error: "File exceeds maximum allowable size (32 MB).",
    };
  }
  if (fileSize > ADVISORY_FILE_SIZE_BYTES) {
    return {
      valid: true,
      advisory:
        "File is larger than 16 MB on disk. If serialized documents exceed 16 MB of payload bytes, import will halt when the 16 MB session limit is reached.",
    };
  }
  return { valid: true };
}
