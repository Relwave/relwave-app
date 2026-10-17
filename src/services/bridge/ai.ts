import { bridgeRequest } from "./bridgeClient";
import { analyticsService } from "../analytics";

// ── Re-export the types that the frontend needs ───────────────────────────
// (These mirror the bridge types but kept local to avoid importing from bridge)

export type AIProviderName = "anthropic" | "openai" | "gemini" | "groq" | "mistral" | "ollama";

export interface AISettings {
  defaultProvider: AIProviderName;
  anthropicApiKey?: string;
  openaiApiKey?: string;
  geminiApiKey?: string;
  groqApiKey?: string;
  mistralApiKey?: string;
  ollamaBaseUrl?: string;
  ollamaModel?: string;
  // Per-provider selected model
  anthropicModel?: string;
  openaiModel?: string;
  geminiModel?: string;
  groqModel?: string;
  mistralModel?: string;
}

export interface SchemaAnalysisInput {
  tables: Array<{
    name: string;
    schema?: string;
    columns: Array<{
      name: string;
      type: string;
      nullable?: boolean;
      isPrimaryKey?: boolean;
      isForeignKey?: boolean;
      references?: { table: string; column: string };
    }>;
    indexes?: string[];
    foreignKeys?: string[];
    constraints?: string[];
  }>;
  databaseType?: string;
}

export interface QueryExplanationInput {
  sql: string;
  schema?: SchemaAnalysisInput["tables"];
  databaseType?: string;
}

export interface ChartRecommendationInput {
  tableName: string;
  columns: Array<{
    name: string;
    type: string;
    isPrimaryKey?: boolean;
    sampleValues?: string[];
  }>;
}

export interface ChartRecommendation {
  chartType: "bar" | "line" | "area" | "pie";
  xAxis: string;
  yAxis: string;
  reasoning: string;
}

// ── Cache-aware response types ────────────────────────────────────────────

export interface AIAnalysisResult {
  markdown: string;
  cached: boolean;
  createdAt?: string;
}

export interface AIChartResult extends ChartRecommendation {
  cached: boolean;
  createdAt?: string;
}

// ── History types ─────────────────────────────────────────────────────────

export interface AIHistoryListItem {
  id: number;
  feature: string;
  datasource_id: string | null;
  table_name: string | null;
  provider: string;
  model: string;
  tokens_used: number | null;
  created_at: string;
}

export interface AIHistoryEntry {
  id: number;
  feature: string;
  datasource_id: string | null;
  table_name: string | null;
  content_hash: string | null;
  provider: string;
  model: string;
  prompt: string;
  response: string;
  tokens_used: number | null;
  created_at: string;
}

export interface AIHistoryListResult {
  items: AIHistoryListItem[];
  total: number;
}

// ── AI Settings storage (persisted to ~/.relwave/ai-settings.json via bridge) ──

const LS_MIGRATION_KEY = "relwave:ai-settings-migrated-v2";
const LS_LEGACY_KEY = "relwave:ai-settings";

const DEFAULT_SETTINGS: AISettings = { defaultProvider: "ollama" };

let cachedAISettings: AISettings | null = null;
let pendingLoadPromise: Promise<AISettings> | null = null;

/**
 * Synchronous accessor for currently in-memory cached AI settings.
 * Returns null if settings haven't been loaded yet.
 */
export function getCachedAISettings(): AISettings | null {
  return cachedAISettings;
}

/**
 * Load AI settings from memory cache or the bridge (reads ai-settings.json on disk).
 * Falls back to empty defaults if the file doesn't exist yet.
 * Also performs a one-time migration of any settings previously saved in localStorage.
 *
 * Concurrent calls are deduplicated into a single in-flight promise.
 */
export async function loadAISettings(options?: { forceRefresh?: boolean }): Promise<AISettings> {
  if (cachedAISettings && !options?.forceRefresh) {
    return cachedAISettings;
  }

  if (pendingLoadPromise && !options?.forceRefresh) {
    return pendingLoadPromise;
  }

  pendingLoadPromise = (async () => {
    try {
      const result = await bridgeRequest("ai.loadSettings", {}, 3000);
      const fromFile = (result?.data ?? {}) as Partial<AISettings>;

      // If nothing is on disk yet, check localStorage for a legacy migration
      if (!fromFile.defaultProvider) {
        const migrated = migrateFromLocalStorage();
        if (migrated) {
          cachedAISettings = migrated;
          saveAISettings(migrated).catch(() => {});
          return migrated;
        }
        cachedAISettings = { ...DEFAULT_SETTINGS };
        return cachedAISettings;
      }

      cachedAISettings = { ...DEFAULT_SETTINGS, ...fromFile };
      return cachedAISettings;
    } catch {
      // Bridge unavailable or timed out — return cached, migrated, or default settings
      if (!cachedAISettings) {
        cachedAISettings = migrateFromLocalStorage() ?? { ...DEFAULT_SETTINGS };
      }
      return cachedAISettings;
    } finally {
      pendingLoadPromise = null;
    }
  })();

  return pendingLoadPromise;
}

/**
 * Save AI settings to disk via the bridge (writes ai-settings.json).
 * Updates in-memory cache immediately (optimistic update).
 */
export async function saveAISettings(settings: AISettings): Promise<void> {
  cachedAISettings = { ...settings };
  try {
    await bridgeRequest("ai.saveSettings", { settings }, 5000);
  } catch {
    // Fallback: keep a copy in localStorage so settings aren’t totally lost
    localStorage.setItem(LS_LEGACY_KEY, JSON.stringify(settings));
  }
}

/**
 * One-time migration: if the user had settings saved in the old localStorage
 * key, return them and mark migration as done so we don’t do it again.
 */
function migrateFromLocalStorage(): AISettings | null {
  if (localStorage.getItem(LS_MIGRATION_KEY)) return null; // already done
  try {
    const raw = localStorage.getItem(LS_LEGACY_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as AISettings;
    // Mark done so this code only runs once
    localStorage.setItem(LS_MIGRATION_KEY, "1");
    localStorage.removeItem(LS_LEGACY_KEY);
    return parsed;
  } catch {
    return null;
  }
}

// ── Bridge service class ──────────────────────────────────────────────────

class AIService {
  /**
   * Test whether the configured provider is reachable.
   */
  async testConnection(settings: AISettings): Promise<{
    connected: boolean;
    warning?: string;
    code?: string;
    message?: string;
  }> {
    try {
      const result = await bridgeRequest("ai.testConnection", { settings });
      if (result?.data?.connected !== undefined) {
        return result.data;
      }
      return { connected: true };
    } catch (err: any) {
      return {
        connected: false,
        code: err?.code ?? "UNKNOWN",
        message: err?.message ?? String(err),
      };
    }
  }

  /**
   * Analyze a database schema. Returns markdown + cache metadata.
   */
  async analyzeSchema(
    settings: AISettings,
    input: SchemaAnalysisInput,
    opts?: { skipCache?: boolean; datasourceName?: string },
  ): Promise<AIAnalysisResult> {
    analyticsService.trackAiChatOpened();
    const result = await bridgeRequest("ai.analyzeSchema", {
      settings,
      input,
      skipCache: opts?.skipCache,
      datasourceName: opts?.datasourceName,
    });
    return {
      markdown: result?.data?.markdown ?? "",
      cached: result?.data?.cached ?? false,
      createdAt: result?.data?.createdAt,
    };
  }

  /**
   * Explain a SQL query. Returns markdown + cache metadata.
   */
  async explainQuery(
    settings: AISettings,
    input: QueryExplanationInput,
    opts?: { skipCache?: boolean; datasourceName?: string },
  ): Promise<AIAnalysisResult> {
    analyticsService.trackAiChatOpened();
    const result = await bridgeRequest("ai.explainQuery", {
      settings,
      input,
      skipCache: opts?.skipCache,
      datasourceName: opts?.datasourceName,
    });
    return {
      markdown: result?.data?.markdown ?? "",
      cached: result?.data?.cached ?? false,
      createdAt: result?.data?.createdAt,
    };
  }

  /**
   * Recommend a chart type and axes for the given table metadata.
   */
  async recommendChart(
    settings: AISettings,
    input: ChartRecommendationInput,
    opts?: { skipCache?: boolean; datasourceName?: string },
  ): Promise<AIChartResult> {
    const result = await bridgeRequest("ai.recommendChart", {
      settings,
      input,
      skipCache: opts?.skipCache,
      datasourceName: opts?.datasourceName,
      tableName: input.tableName,
    });
    const data = result?.data;
    return {
      chartType: data?.chartType ?? "bar",
      xAxis: data?.xAxis ?? "",
      yAxis: data?.yAxis ?? "",
      reasoning: data?.reasoning ?? "",
      cached: data?.cached ?? false,
      createdAt: data?.createdAt,
    };
  }

  // ── History methods ─────────────────────────────────────────────────────

  /**
   * List AI analysis history with optional filters and pagination.
   */
  async getHistory(params?: {
    feature?: string;
    provider?: string;
    datasource_id?: string;
    limit?: number;
    offset?: number;
  }): Promise<AIHistoryListResult> {
    const result = await bridgeRequest("ai.getHistory", params ?? {});
    return result?.data as AIHistoryListResult;
  }

  /**
   * Get a single history entry by ID (full record with prompt/response).
   */
  async getHistoryById(id: number): Promise<AIHistoryEntry> {
    const result = await bridgeRequest("ai.getHistoryById", { id });
    return result?.data as AIHistoryEntry;
  }

  /**
   * Delete a single history entry by ID.
   */
  async deleteHistory(id: number): Promise<boolean> {
    const result = await bridgeRequest("ai.deleteHistory", { id });
    return result?.data?.deleted ?? false;
  }

  /**
   * Clear all history entries.
   */
  async clearHistory(): Promise<number> {
    const result = await bridgeRequest("ai.clearHistory", {});
    return result?.data?.deletedCount ?? 0;
  }

  /**
   * Translate natural language to SQL and optionally execute it.
   */
  async naturalLanguageQuery(params: {
    question: string;
    databaseId: string;
    settings: AISettings;
    history?: Array<{ question: string; sql: string; result?: string }>;
    options?: NLSQLOptions;
  }): Promise<NLSQLResponse> {
    const result = await bridgeRequest("ai.naturalLanguageQuery", params);
    // Since bridgeRequest returns the entire response in some handlers or wraps it in `data`,
    // our aiHandlers.ts `this.rpc.sendResponse(id, response)` means it might not have `.data`.
    // Wait, typically `sendResponse` wraps the whole thing in the RPC response `result`.
    // `bridgeRequest` returns `result`. If the handler sends `response`, it is `result`.
    return result as NLSQLResponse;
  }
}

export interface NLSQLOptions {
  maskSensitive?: boolean;
  maxRows?: number;
  autoExecute?: boolean;
}

export interface NLSQLResponse {
  sql: string | null;
  intent: "read" | "write" | "destructive" | "schema" | "unclear";
  explanation: string;
  confidence: number;
  assumptions: string[];
  results?: unknown[];
  rowCount?: number;
  interpretation?: string;
  executionMs?: number;
  cached: boolean;
  error?: string;
  debug?: {
    prompt?: string;
    rawResponse?: string;
  };
}

export const aiService = new AIService();
