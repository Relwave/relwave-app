import {
  MqlHistoryEntry,
  MqlHistorySettings,
  StoredMqlHistory,
  MAX_HISTORY_ENTRIES,
  CURRENT_HISTORY_SCHEMA_VERSION,
  HISTORY_STORAGE_PREFIX,
  HISTORY_SETTINGS_PREFIX,
} from "./types";
import { redactQueryText, sanitizeErrorMessage } from "./redaction";

export interface StorageAdapter {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
  removeItem(key: string): void;
}

// In-memory fallback adapter for environments without window.localStorage (Node.js tests, restricted sandboxes)
const memoryStore = new Map<string, string>();
const memoryAdapter: StorageAdapter = {
  getItem: (key: string) => memoryStore.get(key) ?? null,
  setItem: (key: string, value: string) => {
    memoryStore.set(key, value);
  },
  removeItem: (key: string) => {
    memoryStore.delete(key);
  },
};

let customAdapter: StorageAdapter | null = null;

/**
 * Allows unit tests to inject a mock storage adapter (e.g., to simulate quota errors or storage unavailability).
 */
export function setStorageAdapterForTesting(adapter: StorageAdapter | null): void {
  customAdapter = adapter;
}

/**
 * Resolves the active storage adapter.
 */
function getStorage(): StorageAdapter {
  if (customAdapter) return customAdapter;
  try {
    if (typeof window !== "undefined" && window.localStorage) {
      return window.localStorage;
    }
  } catch {
    // LocalStorage blocked by security policy; fall back to memory
  }
  return memoryAdapter;
}

/**
 * Validates a connection identifier.
 */
export function validateDbId(dbId: string): boolean {
  return typeof dbId === "string" && dbId.trim().length > 0;
}

export function getHistoryStorageKey(dbId: string): string {
  return `${HISTORY_STORAGE_PREFIX}${dbId.trim()}`;
}

export function getHistorySettingsKey(dbId: string): string {
  return `${HISTORY_SETTINGS_PREFIX}${dbId.trim()}`;
}

/**
 * Generates a unique stable entry ID.
 */
function generateEntryId(): string {
  if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") {
    return crypto.randomUUID();
  }
  return `mql_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`;
}

/**
 * Validates the structure of a single persisted history entry.
 */
export function isValidHistoryEntry(entry: any): entry is MqlHistoryEntry {
  return Boolean(
    entry &&
    typeof entry === "object" &&
    typeof entry.id === "string" &&
    entry.id.length > 0 &&
    typeof entry.timestamp === "string" &&
    typeof entry.collection === "string" &&
    entry.collection.length > 0 &&
    typeof entry.operation === "string" &&
    typeof entry.redactedQueryText === "string" &&
    typeof entry.durationMs === "number" &&
    entry.durationMs >= 0 &&
    (entry.status === "success" || entry.status === "error") &&
    typeof entry.isRedacted === "boolean",
  );
}

/**
 * Retrieves the query history for a specific connection.
 * Returns entries in reverse chronological order (newest first).
 */
export function getHistory(dbId: string): MqlHistoryEntry[] {
  if (!validateDbId(dbId)) return [];

  const storage = getStorage();
  const key = getHistoryStorageKey(dbId);

  try {
    const raw = storage.getItem(key);
    if (!raw) return [];

    const parsed = JSON.parse(raw);

    // Schema Version 1 check
    let candidateEntries: any[] = [];
    if (Array.isArray(parsed)) {
      candidateEntries = parsed;
    } else if (parsed && typeof parsed === "object" && Array.isArray(parsed.entries)) {
      candidateEntries = parsed.entries;
    }

    // Filter valid entries to guard against corrupted records
    return candidateEntries.filter(isValidHistoryEntry);
  } catch {
    // Corrupted JSON or storage failure: return empty array safely
    return [];
  }
}

/**
 * Retrieves history settings for a specific connection.
 * Privacy invariant: storeRawQueries is strictly FALSE by default.
 */
export function getHistorySettings(dbId: string): MqlHistorySettings {
  const defaultSettings: MqlHistorySettings = { storeRawQueries: false };
  if (!validateDbId(dbId)) return defaultSettings;

  const storage = getStorage();
  const key = getHistorySettingsKey(dbId);

  try {
    const raw = storage.getItem(key);
    if (!raw) return defaultSettings;
    const parsed = JSON.parse(raw);
    return {
      storeRawQueries: Boolean(parsed.storeRawQueries),
    };
  } catch {
    return defaultSettings;
  }
}

/**
 * Updates history settings for a specific connection.
 */
export function updateHistorySettings(
  dbId: string,
  settings: Partial<MqlHistorySettings>,
): MqlHistorySettings {
  const current = getHistorySettings(dbId);
  const updated: MqlHistorySettings = {
    storeRawQueries:
      settings.storeRawQueries !== undefined
        ? Boolean(settings.storeRawQueries)
        : current.storeRawQueries,
  };

  if (validateDbId(dbId)) {
    try {
      const storage = getStorage();
      const key = getHistorySettingsKey(dbId);
      storage.setItem(key, JSON.stringify(updated));
    } catch {
      // Graceful quota or storage write error
    }
  }

  return updated;
}

export interface AddHistoryEntryParams {
  collection: string;
  operation: string;
  queryText: string;
  durationMs: number;
  status: "success" | "error";
  resultCount?: number;
  errorMessage?: string;
  id?: string;
  timestamp?: string;
}

/**
 * Adds an execution entry to connection history.
 * Enforces 50-item FIFO limit, default literal value redaction, and sanitization.
 */
export function addHistoryEntry(dbId: string, params: AddHistoryEntryParams): MqlHistoryEntry {
  const settings = getHistorySettings(dbId);
  const id = params.id || generateEntryId();
  const timestamp = params.timestamp || new Date().toISOString();

  // 1. Literal redaction (Mandatory by default)
  const redactedQueryText = redactQueryText(params.queryText);

  // 2. Explicit raw-query opt-in check
  let rawQueryText: string | undefined;
  let isRedacted = true;

  if (settings.storeRawQueries) {
    rawQueryText = params.queryText;
    isRedacted = false;
  }

  // 3. Sensitive error message sanitization
  const errorMessage = sanitizeErrorMessage(params.errorMessage);

  // 4. Construct privacy-hardened history entry (zero documents/results persisted)
  const newEntry: MqlHistoryEntry = {
    id,
    timestamp,
    collection: params.collection || "unknown",
    operation: params.operation || "find",
    redactedQueryText,
    rawQueryText,
    durationMs: Math.max(0, params.durationMs || 0),
    status: params.status,
    resultCount: params.resultCount,
    errorMessage,
    isRedacted,
  };

  if (!validateDbId(dbId)) {
    return newEntry;
  }

  const existing = getHistory(dbId);

  // 5. FIFO eviction: unshift new entry, keep at most MAX_HISTORY_ENTRIES (50)
  const updatedEntries = [newEntry, ...existing].slice(0, MAX_HISTORY_ENTRIES);

  const payload: StoredMqlHistory = {
    version: CURRENT_HISTORY_SCHEMA_VERSION,
    dbId,
    entries: updatedEntries,
  };

  const storage = getStorage();
  const key = getHistoryStorageKey(dbId);

  try {
    storage.setItem(key, JSON.stringify(payload));
  } catch {
    // Handle QuotaExceededError by pruning to 25 entries and retrying
    try {
      payload.entries = updatedEntries.slice(0, 25);
      storage.setItem(key, JSON.stringify(payload));
    } catch {
      // Fail gracefully without crashing
    }
  }

  return newEntry;
}

/**
 * Clears all query history for a specific connection.
 */
export function clearHistory(dbId: string): void {
  if (!validateDbId(dbId)) return;
  const storage = getStorage();
  const key = getHistoryStorageKey(dbId);
  try {
    storage.removeItem(key);
  } catch {
    // Graceful error handling
  }
}
