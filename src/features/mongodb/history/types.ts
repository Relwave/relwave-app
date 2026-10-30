export interface MqlHistoryEntry {
  id: string;
  timestamp: string;          // ISO 8601 string
  collection: string;         // Target MongoDB collection
  operation: string;          // find, aggregate, countDocuments, estimatedDocumentCount, distinct
  redactedQueryText: string;  // Query with literal values redacted into type placeholders
  rawQueryText?: string;      // Present ONLY if user explicitly opted in to store raw queries
  durationMs: number;         // Execution time in milliseconds
  status: "success" | "error";
  resultCount?: number;       // Number of documents returned or numeric count result
  errorMessage?: string;      // Sanitized error message (credentials & sensitive paths removed)
  isRedacted: boolean;        // True if stored as a redacted template
}

export interface MqlHistorySettings {
  storeRawQueries: boolean;   // Opt-in setting to store raw query text (default: false)
}

export interface StoredMqlHistory {
  version: number;
  dbId: string;
  entries: MqlHistoryEntry[];
}

export const MAX_HISTORY_ENTRIES = 50;
export const CURRENT_HISTORY_SCHEMA_VERSION = 1;
export const HISTORY_STORAGE_PREFIX = "relwave_mql_history_";
export const HISTORY_SETTINGS_PREFIX = "relwave_mql_history_settings_";

export const REDACTED_TEMPLATE_ADVISORY =
  "Loaded query template from history with redacted placeholders. Replace <string> or <number> placeholders with actual query values before executing.";
