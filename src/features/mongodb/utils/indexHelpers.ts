import {
  MongoIndexDirection,
  MongoIndexOptions,
  MongoIndexDetails,
  MongoIndexStatsItem,
} from "@/services/bridge/databaseBridge";

export interface MongoIndexWithStats extends MongoIndexDetails {
  stats?: MongoIndexStatsItem;
}

export interface IndexKeyField {
  field: string;
  direction: MongoIndexDirection;
}

/**
 * Formats a byte size into human-readable representation (e.g. "0 B", "4.0 KB", "1.2 MB").
 */
export function formatBytes(bytes?: number): string {
  if (bytes === undefined || bytes === null || isNaN(bytes) || bytes <= 0) {
    return "0 B";
  }

  const units = ["B", "KB", "MB", "GB", "TB", "PB"];
  const i = Math.floor(Math.log(bytes) / Math.log(1024));
  const clampedIndex = Math.min(i, units.length - 1);

  if (clampedIndex === 0) {
    return `${Math.round(bytes)} B`;
  }

  const val = bytes / Math.pow(1024, clampedIndex);
  return `${val.toFixed(1)} ${units[clampedIndex]}`;
}

/**
 * Returns a human-friendly label for a MongoDB index direction.
 */
export function formatDirection(dir: MongoIndexDirection): string {
  switch (dir) {
    case 1:
      return "Ascending (1)";
    case -1:
      return "Descending (-1)";
    case "text":
      return "Text";
    case "2dsphere":
      return "2dsphere (Geo)";
    case "hashed":
      return "Hashed";
    default:
      return String(dir);
  }
}

/**
 * Auto-generates a canonical index name from a list of key field definitions.
 * e.g. [{ field: "username", direction: 1 }, { field: "createdAt", direction: -1 }] -> "username_1_createdAt_-1"
 */
export function generateIndexName(fields: { field: string; direction: MongoIndexDirection }[]): string {
  if (!fields || !Array.isArray(fields)) return "";
  const validFields = fields.filter((f) => f && f.field && f.field.trim().length > 0);
  if (validFields.length === 0) return "";
  return validFields.map((f) => `${f.field.trim()}_${f.direction}`).join("_");
}

/**
 * Validates an index specification before submission to MongoDB.
 * Checks for:
 * - At least 1 field.
 * - All field names non-empty and trimmed.
 * - No duplicate field paths in compound keys.
 * - Hashed index constraints (cannot be unique, sparse, or combined with other hashed/geo/text).
 * - 2dsphere constraint (cannot be unique).
 * - TTL expireAfterSeconds must be non-negative integer.
 * - Partial filter expression must be a valid object if provided.
 */
export function validateIndexSpec(
  fields: { field: string; direction: MongoIndexDirection }[],
  options?: MongoIndexOptions,
): { valid: boolean; error?: string } {
  if (!fields || !Array.isArray(fields) || fields.length === 0) {
    return { valid: false, error: "At least one key field is required" };
  }

  for (let i = 0; i < fields.length; i++) {
    const f = fields[i];
    if (!f || typeof f.field !== "string" || !f.field.trim()) {
      return { valid: false, error: "All field names must be non-empty" };
    }
  }

  const seenFields = new Set<string>();
  for (const f of fields) {
    const trimmed = f.field.trim();
    if (seenFields.has(trimmed)) {
      return { valid: false, error: `Duplicate field path: "${trimmed}"` };
    }
    seenFields.add(trimmed);
  }

  const hasHashed = fields.some((f) => f.direction === "hashed");
  if (hasHashed) {
    if (options?.unique) {
      return { valid: false, error: "Hashed indexes do not support unique constraints" };
    }
    if (options?.sparse) {
      return { valid: false, error: "Hashed indexes do not support sparse option" };
    }
    const hashedCount = fields.filter((f) => f.direction === "hashed").length;
    const textCount = fields.filter((f) => f.direction === "text").length;
    const geoCount = fields.filter((f) => f.direction === "2dsphere").length;
    if (hashedCount > 1 || textCount > 0 || geoCount > 0) {
      return {
        valid: false,
        error: "Hashed index field cannot be combined with other hashed, text, or geospatial fields",
      };
    }
  }

  const hasGeo = fields.some((f) => f.direction === "2dsphere");
  if (hasGeo && options?.unique) {
    return { valid: false, error: "2dsphere indexes do not support unique constraints" };
  }

  if (options?.expireAfterSeconds !== undefined && options?.expireAfterSeconds !== null) {
    if (
      typeof options.expireAfterSeconds !== "number" ||
      !Number.isInteger(options.expireAfterSeconds) ||
      options.expireAfterSeconds < 0
    ) {
      return { valid: false, error: "expireAfterSeconds must be a non-negative integer" };
    }
  }

  if (options?.partialFilterExpression !== undefined && options?.partialFilterExpression !== null) {
    if (
      typeof options.partialFilterExpression !== "object" ||
      Array.isArray(options.partialFilterExpression)
    ) {
      return { valid: false, error: "Partial filter expression must be a valid JSON object" };
    }
  }

  if (options?.collation) {
    if (!options.collation.locale || !options.collation.locale.trim()) {
      return { valid: false, error: "Collation locale is required if collation is specified" };
    }
  }

  return { valid: true };
}
