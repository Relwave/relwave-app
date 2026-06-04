// ── Shared types for the AI integration layer (moved from src/ai/ai.types.ts)

export type AIProviderName =
  | "anthropic"
  | "openai"
  | "gemini"
  | "groq"
  | "mistral"
  | "ollama";

/**
 * User-facing AI settings — stored client-side and passed on every RPC call.
 * The bridge is stateless regarding API keys.
 */
export interface AISettings {
  defaultProvider: AIProviderName;
  anthropicApiKey?: string;
  openaiApiKey?: string;
  geminiApiKey?: string;
  groqApiKey?: string;
  mistralApiKey?: string;
  ollamaBaseUrl?: string;
  ollamaModel?: string;
}

// ── Feature input/output types ────────────────────────────────────────────

export interface SchemaColumn {
  name: string;
  type: string;
  nullable?: boolean;
  isPrimaryKey?: boolean;
  isForeignKey?: boolean;
  references?: { table: string; column: string };
}

export interface SchemaTable {
  name: string;
  schema?: string;
  columns: SchemaColumn[];
  indexes?: string[];
  foreignKeys?: string[];
  constraints?: string[];
}

export interface SchemaAnalysisInput {
  tables: SchemaTable[];
  databaseType?: string;
}

export interface QueryExplanationInput {
  sql: string;
  schema?: SchemaTable[];
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

// ── RPC param shapes ─────────────────────────────────────────────────────

export interface AIRequestBase {
  settings: AISettings;
  /** Human-readable database / datasource name for history display. */
  datasourceName?: string;
  /** Table name context (e.g. for chart recommendation). */
  tableName?: string;
}

export interface AIAnalyzeSchemaParams extends AIRequestBase {
  input: SchemaAnalysisInput;
}

export interface AIExplainQueryParams extends AIRequestBase {
  input: QueryExplanationInput;
}

export interface AIRecommendChartParams extends AIRequestBase {
  input: ChartRecommendationInput;
}

export interface AITestConnectionParams extends AIRequestBase {}
