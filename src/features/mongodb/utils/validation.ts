import { MongoCreateCollectionOptions } from "../types";

export const COLLECTION_NAME_REGEX = /^[a-zA-Z_][a-zA-Z0-9_-]*$/;

export function validateCollectionName(name: string): { valid: boolean; error?: string } {
  if (!name || typeof name !== "string") {
    return { valid: false, error: "Collection name is required" };
  }
  const trimmed = name.trim();
  if (trimmed.length === 0) {
    return { valid: false, error: "Collection name cannot be empty" };
  }
  if (trimmed.length > 120) {
    return { valid: false, error: "Collection name must not exceed 120 characters" };
  }
  if (trimmed.includes("$") || trimmed.includes("\0")) {
    return { valid: false, error: "Collection name must not contain '$' or null bytes" };
  }
  if (trimmed.startsWith("system.")) {
    return { valid: false, error: "Collection name must not start with 'system.'" };
  }
  if (!COLLECTION_NAME_REGEX.test(trimmed)) {
    return {
      valid: false,
      error: "Must start with a letter or underscore and contain only alphanumeric, underscores, or hyphens",
    };
  }
  return { valid: true };
}

export function validateCappedOptions(
  options?: MongoCreateCollectionOptions,
): { valid: boolean; error?: string } {
  if (!options?.capped) {
    return { valid: true };
  }
  const { size, max } = options;
  if (size === undefined || typeof size !== "number" || !Number.isInteger(size) || size < 4096) {
    return {
      valid: false,
      error: "Capped collection size must be an integer greater than or equal to 4096 bytes",
    };
  }
  if (max !== undefined) {
    if (typeof max !== "number" || !Number.isInteger(max) || max <= 0) {
      return {
        valid: false,
        error: "Capped collection max documents must be a positive integer",
      };
    }
  }
  return { valid: true };
}

export function validateJsonDocument(raw: string): {
  valid: boolean;
  doc?: Record<string, any>;
  error?: string;
} {
  if (!raw || raw.trim().length === 0) {
    return { valid: false, error: "Document cannot be empty" };
  }
  try {
    const parsed = JSON.parse(raw);
    if (typeof parsed !== "object" || parsed === null || Array.isArray(parsed)) {
      return { valid: false, error: "Document must be a JSON object" };
    }
    return { valid: true, doc: parsed };
  } catch (err: any) {
    return { valid: false, error: err.message || "Invalid JSON syntax" };
  }
}
