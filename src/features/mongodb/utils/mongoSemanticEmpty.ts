/**
 * MongoDB Milestone 7 Phase 4 — Semantic Empty Filter & Error Utilities
 *
 * Implements:
 * - Semantic emptiness detection for top-level filter objects
 * - Update operator validation matching bridge MongoBulkEngine
 * - Prototype pollution defenses against __proto__, constructor, prototype
 * - Defensive error message sanitization (credential redaction, control char stripping, 200-char cap)
 * - Mutation errors list bounding (max 10 entries)
 */

import type { TrackedBulkMutationError } from "../types/bulk";

export interface FilterValidationResult {
  valid: boolean;
  filter?: Record<string, any>;
  isUnrestricted?: boolean;
  error?: string;
}

export interface UpdateValidationResult {
  valid: boolean;
  update?: Record<string, any>;
  error?: string;
}

/**
 * Checks whether an object or array contains prototype pollution keys.
 */
export function hasPrototypePollution(val: unknown, seen = new WeakSet<object>()): boolean {
  if (typeof val !== "object" || val === null) {
    return false;
  }
  if (seen.has(val)) {
    return false;
  }
  seen.add(val);

  if (Array.isArray(val)) {
    for (const item of val) {
      if (hasPrototypePollution(item, seen)) return true;
    }
    return false;
  }

  // Check own property names
  for (const key of Object.getOwnPropertyNames(val)) {
    if (key === "__proto__" || key === "constructor" || key === "prototype") {
      return true;
    }
    try {
      if (hasPrototypePollution((val as Record<string, unknown>)[key], seen)) {
        return true;
      }
    } catch {
      // ignore
    }
  }

  // Also check if __proto__ was set as own property even if symbol or non-enumerable
  if (Object.prototype.hasOwnProperty.call(val, "__proto__")) {
    return true;
  }
  if (Object.prototype.hasOwnProperty.call(val, "constructor")) {
    return true;
  }
  if (Object.prototype.hasOwnProperty.call(val, "prototype")) {
    return true;
  }

  return false;
}

/**
 * Returns true IF AND ONLY IF val is a non-null, non-array object with exactly zero keys.
 */
export function isTopLevelEmptyFilter(filter: unknown): boolean {
  if (typeof filter !== "object" || filter === null || Array.isArray(filter)) {
    return false;
  }
  return Object.keys(filter).length === 0;
}

/**
 * Validates raw string as a JSON filter object.
 * - Empty string or whitespace: invalid.
 * - Non-object JSON: invalid.
 * - Top-level zero keys: valid and isUnrestricted = true.
 * - Preserves nested empty objects { "profile": {} } as restricted (isUnrestricted = false).
 */
export function parseAndValidateFilter(raw: string): FilterValidationResult {
  if (typeof raw !== "string" || raw.trim().length === 0) {
    return {
      valid: false,
      error:
        "Filter query is required. Specify a filter object or enter {} to target all documents.",
    };
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch (err: any) {
    return {
      valid: false,
      error: `Invalid JSON syntax: ${err.message}`,
    };
  }

  if (typeof parsed !== "object" || parsed === null || Array.isArray(parsed)) {
    return {
      valid: false,
      error: 'Filter must be a valid JSON object (e.g. {} or {"field": "value"}).',
    };
  }

  if (hasPrototypePollution(parsed)) {
    return {
      valid: false,
      error:
        "Security violation: filter contains forbidden keys (__proto__, constructor, prototype)",
    };
  }

  const isUnrestricted = Object.keys(parsed).length === 0;

  return {
    valid: true,
    filter: parsed as Record<string, any>,
    isUnrestricted,
  };
}

/**
 * Validates raw string as a JSON update document with top-level operator keys ($set, etc.).
 * Direct document replacement and empty updates are rejected.
 */
export function parseAndValidateUpdate(raw: string): UpdateValidationResult {
  if (typeof raw !== "string" || raw.trim().length === 0) {
    return {
      valid: false,
      error: 'Update document is required. Specify an operator document (e.g. {"$set": {...}}).',
    };
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch (err: any) {
    return {
      valid: false,
      error: `Invalid JSON syntax: ${err.message}`,
    };
  }

  if (typeof parsed !== "object" || parsed === null || Array.isArray(parsed)) {
    return {
      valid: false,
      error: "Update must be a valid JSON object containing update operators.",
    };
  }

  const keys = Object.keys(parsed);
  if (keys.length === 0) {
    return {
      valid: false,
      error: "No update operators provided",
    };
  }

  for (const k of keys) {
    if (!k.startsWith("$")) {
      return {
        valid: false,
        error: `'${k}' is not an update operator; top-level operators must begin with '$'`,
      };
    }
  }

  if (hasPrototypePollution(parsed)) {
    return {
      valid: false,
      error:
        "Security violation: update document contains forbidden keys (__proto__, constructor, prototype)",
    };
  }

  return {
    valid: true,
    update: parsed as Record<string, any>,
  };
}

/**
 * Redacts credentials, strips non-printable control characters, and caps length at 200 chars.
 */
export function sanitizeErrorMessage(raw: unknown): string {
  if (typeof raw !== "string") {
    return "Unknown error";
  }
  let sanitized = raw.replace(/(mongodb(?:\+srv)?:\/\/)[^@\s]+@/gi, "$1<credentials>@");
  // eslint-disable-next-line no-control-regex
  sanitized = sanitized.replace(/[\x00-\x08\x0B\x0C\x0E-\x1F\x7F-\x9F]/g, "");
  if (sanitized.length > 200) {
    sanitized = sanitized.slice(0, 197) + "...";
  }
  return sanitized.trim();
}

/**
 * Bounds retained errors to at most maxErrors (default 10) while preserving authoritative totalErrors.
 */
export function sanitizeMutationErrors(
  errors?: Array<{ index?: number; code?: string; message?: string }>,
  maxErrors = 10,
): { sanitizedErrors: TrackedBulkMutationError[]; totalErrors: number } {
  if (!Array.isArray(errors) || errors.length === 0) {
    return { sanitizedErrors: [], totalErrors: 0 };
  }

  const totalErrors = errors.length;
  const slice = errors.slice(0, maxErrors);

  const sanitizedErrors: TrackedBulkMutationError[] = slice.map((err, idx) => ({
    index: typeof err?.index === "number" && Number.isInteger(err.index) ? err.index : idx,
    code:
      typeof err?.code === "string" && err.code.length > 0
        ? err.code.slice(0, 50)
        : "MONGO_WRITE_ERROR",
    message: sanitizeErrorMessage(err?.message || "Write error"),
  }));

  return { sanitizedErrors, totalErrors };
}
