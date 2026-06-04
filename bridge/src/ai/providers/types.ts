import {
  SchemaAnalysisInput,
  QueryExplanationInput,
  ChartRecommendationInput,
  ChartRecommendation,
} from "../../types/ai";

// ── Provider interface ────────────────────────────────────────────────────

/**
 * All AI providers must implement this interface.
 * Frontend code never knows which concrete provider is active.
 */
export interface AIProvider {
  /** Analyze a database schema and return a markdown report. */
  analyzeSchema(input: SchemaAnalysisInput): Promise<string>;

  /** Explain a SQL query in plain language, returning markdown. */
  explainQuery(input: QueryExplanationInput): Promise<string>;

  /** Recommend a chart type + axes for the given table. */
  recommendChart(input: ChartRecommendationInput): Promise<ChartRecommendation>;

  /**
   * Verify that the provider is reachable with the supplied credentials.
   * Resolves with an empty string on success, a user-facing message on failure.
   */
  testConnection(): Promise<string>;
}

// ── Standardized error type ───────────────────────────────────────────────

export type AIErrorCode =
  | "MISSING_API_KEY"
  | "INVALID_API_KEY"
  | "PROVIDER_UNAVAILABLE"
  | "INVALID_MODEL"
  | "NETWORK_FAILURE"
  | "TIMEOUT"
  | "RATE_LIMIT"
  | "PARSE_ERROR"
  | "UNKNOWN";

export class AIError extends Error {
  readonly code: AIErrorCode;
  readonly provider: string;
  readonly originalMessage: string;

  constructor(code: AIErrorCode, provider: string, message: string) {
    super(`[${provider}] ${message}`);
    this.name = "AIError";
    this.code = code;
    this.provider = provider;
    this.originalMessage = message;
  }
}

/**
 * Classify a raw SDK/network error into an AIErrorCode.
 */
export function classifyError(err: unknown, provider: string): AIError {
  const msg = err instanceof Error ? err.message : String(err);
  const lower = msg.toLowerCase();

  if (lower.includes("api key") || lower.includes("apikey") || lower.includes("authentication") || lower.includes("unauthorized") || lower.includes("401")) {
    return new AIError("INVALID_API_KEY", provider, msg);
  }
  if (lower.includes("rate limit") || lower.includes("429") || lower.includes("too many requests")) {
    return new AIError("RATE_LIMIT", provider, msg);
  }
  if (lower.includes("timeout") || lower.includes("timed out")) {
    return new AIError("TIMEOUT", provider, msg);
  }
  if (lower.includes("econnrefused") || lower.includes("enotfound") || lower.includes("fetch failed") || lower.includes("network")) {
    return new AIError("NETWORK_FAILURE", provider, msg);
  }
  if (lower.includes("model") && (lower.includes("not found") || lower.includes("invalid"))) {
    return new AIError("INVALID_MODEL", provider, msg);
  }
  if (lower.includes("unavailable") || lower.includes("503") || lower.includes("overloaded")) {
    return new AIError("PROVIDER_UNAVAILABLE", provider, msg);
  }

  return new AIError("UNKNOWN", provider, msg);
}
