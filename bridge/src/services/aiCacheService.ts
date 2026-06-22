/**
 * AI Cache Service — orchestrates cache-first AI calls.
 *
 * Before calling an LLM provider, generates a deterministic SHA-256 hash
 * of the input and checks the local SQLite history for a cached response.
 * If found, returns immediately without an API call. Otherwise, calls the
 * provider, stores the result, and returns it.
 */

import crypto from "crypto";
import { aiHistoryStore, type AIHistoryInsert } from "./aiHistoryStore";
import { AIProvider } from "../ai/providers/types";
import {
  AISettings,
  SchemaAnalysisInput,
  QueryExplanationInput,
  ChartRecommendationInput,
} from "../types/ai";

// ── Types ─────────────────────────────────────────────────────────────────

export type AIFeature = "schema-analysis" | "query-explanation" | "chart-recommendation";

export interface CachedResult {
  response: string;
  cached: boolean;
  createdAt?: string;
}

// ── Hashing ───────────────────────────────────────────────────────────────

/**
 * Generate a deterministic SHA-256 hash for the given feature and input.
 * The same input always produces the same hash.
 */
export function generateContentHash(feature: AIFeature, data: unknown): string {
  const payload = JSON.stringify({ feature, data }, Object.keys({ feature, data }).sort());
  return crypto.createHash("sha256").update(payload, "utf-8").digest("hex");
}

/** Hash for schema analysis: uses datasource + tables, columns, indexes, relationships, constraints. */
export function hashSchemaAnalysis(input: SchemaAnalysisInput, datasourceName?: string): string {
  const normalized = {
    datasource: datasourceName ?? null,
    databaseType: input.databaseType ?? null,
    tables: (input.tables ?? []).map((t) => ({
      name: t.name,
      schema: t.schema ?? null,
      columns: (t.columns ?? []).map((c) => ({
        name: c.name,
        type: c.type,
        nullable: c.nullable ?? null,
        isPrimaryKey: c.isPrimaryKey ?? null,
        isForeignKey: c.isForeignKey ?? null,
        references: c.references ?? null,
      })),
      indexes: t.indexes ?? [],
      foreignKeys: t.foreignKeys ?? [],
      constraints: t.constraints ?? [],
    })),
  };
  return generateContentHash("schema-analysis", normalized);
}

/** Hash for query explanation: uses datasource + sql + schema. */
export function hashQueryExplanation(input: QueryExplanationInput, datasourceName?: string): string {
  const normalized = {
    datasource: datasourceName ?? null,
    sql: (input.sql ?? "").trim(),
    databaseType: input.databaseType ?? null,
    schema: (input.schema ?? []).map((t) => ({
      name: t.name,
      schema: t.schema ?? null,
      columns: (t.columns ?? []).map((c) => ({
        name: c.name,
        type: c.type,
      })),
    })),
  };
  return generateContentHash("query-explanation", normalized);
}

/** Hash for chart recommendation: uses datasource + tableName + columns. */
export function hashChartRecommendation(input: ChartRecommendationInput, datasourceName?: string): string {
  const normalized = {
    datasource: datasourceName ?? null,
    tableName: input.tableName,
    columns: (input.columns ?? []).map((c) => ({
      name: c.name,
      type: c.type,
      isPrimaryKey: c.isPrimaryKey ?? null,
    })),
  };
  return generateContentHash("chart-recommendation", normalized);
}

// ── Cache-first orchestration ─────────────────────────────────────────────

/**
 * Resolve the model name from the settings based on provider.
 */
function resolveModelName(settings: AISettings): string {
  switch (settings.defaultProvider) {
    case "anthropic":
      return settings.anthropicModel ?? "claude-3-5-haiku-20241022";
    case "openai":
      return settings.openaiModel ?? "gpt-4o-mini";
    case "gemini":
      return settings.geminiModel ?? "gemini-1.5-flash";
    case "groq":
      return settings.groqModel ?? "llama-3.3-70b-versatile";
    case "mistral":
      return settings.mistralModel ?? "mistral-small-latest";
    case "ollama":
      return settings.ollamaModel ?? "llama3.2";
    default:
      return settings.defaultProvider;
  }
}

/**
 * Check cache, and if missed, call the provider and store the result.
 *
 * @param feature  The AI feature name (schema-analysis, query-explanation, chart-recommendation)
 * @param hash     Content hash for cache lookup
 * @param settings User's AI settings (provider, keys)
 * @param prompt   The prompt text (for logging / history display)
 * @param callFn   Async function that calls the actual AI provider
 * @param meta     Optional metadata (datasource_id, table_name)
 * @param skipCache  If true, bypass cache and force a fresh call
 */
export async function getOrCall(opts: {
  feature: AIFeature;
  hash: string;
  settings: AISettings;
  prompt: string;
  callFn: () => Promise<string>;
  meta?: { datasource_id?: string; table_name?: string };
  skipCache?: boolean;
}): Promise<CachedResult> {
  const { feature, hash, settings, prompt, callFn, meta, skipCache } = opts;

  // Check cache (unless skipCache is true)
  if (!skipCache) {
    const cached = aiHistoryStore.findByHash(hash, meta?.datasource_id);
    if (cached) {
      return {
        response: cached.response,
        cached: true,
        createdAt: cached.created_at,
      };
    }
  }

  // Cache miss — call the provider
  const response = await callFn();

  // Estimate tokens: ~4 characters per token is a reasonable approximation
  // for English text across most LLM tokenizers.
  const estimatedTokens = Math.ceil((prompt.length + response.length) / 4);

  // Store in history
  const record: AIHistoryInsert = {
    feature,
    datasource_id: meta?.datasource_id ?? null,
    table_name: meta?.table_name ?? null,
    content_hash: hash,
    provider: settings.defaultProvider,
    model: resolveModelName(settings),
    prompt,
    response,
    tokens_used: estimatedTokens,
  };
  aiHistoryStore.insert(record);

  return {
    response,
    cached: false,
  };
}
