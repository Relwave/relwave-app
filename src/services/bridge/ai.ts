import { bridgeRequest } from "./bridgeClient";
import { analyticsService } from "../analytics";

// ── Re-export the types that the frontend needs ───────────────────────────
// (These mirror the bridge types but kept local to avoid importing from bridge)

export type AIProviderName =
  | "anthropic"
  | "openai"
  | "gemini"
  | "groq"
  | "mistral"
  | "ollama";

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

/**
 * Load AI settings from the bridge (reads ai-settings.json on disk).
 * Falls back to empty defaults if the file doesn't exist yet.
 * Also performs a one-time migration of any settings previously saved in localStorage.
 */
export async function loadAISettings(): Promise<AISettings> {
  try {
    const result = await bridgeRequest("ai.loadSettings", {});
    const fromFile = (result?.data ?? {}) as Partial<AISettings>;

    // If nothing is on disk yet, check localStorage for a legacy migration
    if (!fromFile.defaultProvider) {
      const migrated = migrateFromLocalStorage();
      if (migrated) {
        // Persist the migrated settings to disk right away
        await saveAISettings(migrated);
        return migrated;
      }
      return { ...DEFAULT_SETTINGS };
    }

    return { ...DEFAULT_SETTINGS, ...fromFile };
  } catch {
    // Bridge unavailable (e.g. during Vite standalone dev) — degrade gracefully
    return migrateFromLocalStorage() ?? { ...DEFAULT_SETTINGS };
  }
}

/**
 * Save AI settings to disk via the bridge (writes ai-settings.json).
 */
export async function saveAISettings(settings: AISettings): Promise<void> {
  try {
    await bridgeRequest("ai.saveSettings", { settings });
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
  async testConnection(settings: AISettings): Promise<{ connected: boolean; message?: string }> {
    try {
      await bridgeRequest("ai.testConnection", { settings });
      return { connected: true };
    } catch (err: any) {
      return { connected: false, message: err?.message ?? String(err) };
    }
  }

  /**
   * Analyze a database schema. Returns markdown + cache metadata.
   */
  async analyzeSchema(
    settings: AISettings,
    input: SchemaAnalysisInput,
    opts?: { skipCache?: boolean; datasourceName?: string }
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
    opts?: { skipCache?: boolean; datasourceName?: string }
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
    opts?: { skipCache?: boolean; datasourceName?: string }
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
}

export const aiService = new AIService();
