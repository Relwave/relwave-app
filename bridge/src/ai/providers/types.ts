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

  /** Generate raw text from a system and user prompt. Used for NL-to-SQL. */
  generateText(system: string, user: string): Promise<string>;
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
  readonly rawMessage?: string;

  constructor(code: AIErrorCode, provider: string, message: string, rawMessage?: string) {
    super(`[${provider}] ${message}`);
    this.name = "AIError";
    this.code = code;
    this.provider = provider;
    this.originalMessage = message;
    this.rawMessage = rawMessage;
  }
}

function capitalize(str: string): string {
  if (!str) return "";
  return str.charAt(0).toUpperCase() + str.slice(1);
}

function extractCleanMessage(raw: string): string {
  try {
    const jsonMatch = raw.match(/\{[\s\S]*\}/);
    if (jsonMatch) {
      const parsed = JSON.parse(jsonMatch[0]);
      if (parsed.error?.message) {
        return parsed.error.message;
      }
      if (parsed.message) {
        return parsed.message;
      }
    }
  } catch {
    // Ignore JSON parsing errors
  }

  return raw
    .replace(/^API error occurred:\s*/i, "")
    .replace(/^Status \d+\s*(Body:\s*)?/i, "")
    .replace(/^\d{3}\s+/i, "")
    .trim();
}

/**
 * Classify a raw SDK/network error into an AIErrorCode.
 */
export function classifyError(err: unknown, provider: string): AIError {
  const rawMsg = err instanceof Error ? err.message : String(err);
  const lower = rawMsg.toLowerCase();
  const cleanMsg = extractCleanMessage(rawMsg);
  const provName = capitalize(provider);

  if (
    lower.includes("api key") ||
    lower.includes("apikey") ||
    lower.includes("authentication") ||
    lower.includes("unauthorized") ||
    lower.includes("invalid x-api-key") ||
    lower.includes("401")
  ) {
    return new AIError(
      "INVALID_API_KEY",
      provider,
      `Invalid or unauthorized API key for ${provName}. Please check your credentials in the ${provName} console.`,
      rawMsg,
    );
  }

  if (
    lower.includes("rate limit") ||
    lower.includes("429") ||
    lower.includes("too many requests") ||
    lower.includes("rate_limited") ||
    lower.includes("quota")
  ) {
    let friendly = `Rate limit exceeded for ${provName}. Please wait a moment before trying again.`;
    if (provider.toLowerCase() === "mistral") {
      friendly = `Mistral rate limit exceeded (code 1300). Free tier accounts are limited to 1 request/second and monthly limits. Please wait a moment or upgrade to pay-as-you-go at console.mistral.ai.`;
    } else if (provider.toLowerCase() === "groq") {
      friendly = `Groq rate limit exceeded. Please wait a moment or check your account limits at console.groq.com.`;
    }
    return new AIError("RATE_LIMIT", provider, friendly, rawMsg);
  }

  if (lower.includes("timeout") || lower.includes("timed out")) {
    return new AIError(
      "TIMEOUT",
      provider,
      `Request to ${provName} timed out. Please check your network connection and try again.`,
      rawMsg,
    );
  }

  if (
    lower.includes("econnrefused") ||
    lower.includes("enotfound") ||
    lower.includes("fetch failed") ||
    lower.includes("network")
  ) {
    return new AIError(
      "NETWORK_FAILURE",
      provider,
      `Unable to reach ${provName} servers. Please check your internet connection or proxy settings.`,
      rawMsg,
    );
  }

  if (
    lower.includes("model") &&
    (lower.includes("not found") ||
      lower.includes("invalid") ||
      lower.includes("does not exist") ||
      lower.includes("do not have access"))
  ) {
    let friendly = `The selected model is not available for ${provName} (${cleanMsg}). Please select a different model in AI settings.`;
    if (provider.toLowerCase() === "groq") {
      friendly = `The selected model is not accessible on your Groq tier or organization (${cleanMsg}). Please switch model in settings (e.g., GPT-OSS 20B or Qwen 3.8 27B) or check console.groq.com.`;
    }
    return new AIError("INVALID_MODEL", provider, friendly, rawMsg);
  }

  if (lower.includes("unavailable") || lower.includes("503") || lower.includes("overloaded")) {
    return new AIError(
      "PROVIDER_UNAVAILABLE",
      provider,
      `${provName} service is temporarily unavailable or overloaded. Please try again shortly.`,
      rawMsg,
    );
  }

  return new AIError("UNKNOWN", provider, cleanMsg || rawMsg, rawMsg);
}
