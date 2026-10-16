import Groq from "groq-sdk";
import { AIProvider, classifyError } from "./types";
import {
  SchemaAnalysisInput,
  QueryExplanationInput,
  ChartRecommendationInput,
  ChartRecommendation,
} from "../../types/";
import { buildSchemaAnalysisPrompt } from "../prompts/schema-analysis";
import { buildQueryExplanationPrompt } from "../prompts/query-explanation";
import {
  buildChartRecommendationPrompt,
  parseChartRecommendation,
} from "../prompts/chart-recommendation";

const DEFAULT_MODEL = "openai/gpt-oss-20b";
const FALLBACK_MODELS = [
  "openai/gpt-oss-20b",
  "qwen/qwen3.8-27b",
  "openai/gpt-oss-120b",
  "llama-3.1-8b-instant",
  "llama-3.3-70b-versatile",
];

export class GroqProvider implements AIProvider {
  private client: Groq;
  private model: string;

  constructor(apiKey: string, model?: string) {
    this.client = new Groq({ apiKey });
    this.model = model?.trim() || DEFAULT_MODEL;
  }

  private async complete(system: string, user: string): Promise<string> {
    try {
      const res = await this.client.chat.completions.create({
        model: this.model,
        messages: [
          { role: "system", content: system },
          { role: "user", content: user },
        ],
        max_tokens: 4096,
      });
      return res.choices[0]?.message?.content ?? "";
    } catch (err) {
      const classified = classifyError(err, "groq");
      if (classified.code === "INVALID_MODEL") {
        // Attempt fallback to a supported chat model so ongoing requests don't fail
        for (const fallback of FALLBACK_MODELS) {
          if (fallback === this.model) continue;
          try {
            const res = await this.client.chat.completions.create({
              model: fallback,
              messages: [
                { role: "system", content: system },
                { role: "user", content: user },
              ],
              max_tokens: 4096,
            });
            return res.choices[0]?.message?.content ?? "";
          } catch {
            // Continue to next fallback
          }
        }
      }
      throw classified;
    }
  }

  async analyzeSchema(input: SchemaAnalysisInput): Promise<string> {
    const { system, user } = buildSchemaAnalysisPrompt(input);
    return this.complete(system, user);
  }

  async explainQuery(input: QueryExplanationInput): Promise<string> {
    const { system, user } = buildQueryExplanationPrompt(input);
    return this.complete(system, user);
  }

  async recommendChart(input: ChartRecommendationInput): Promise<ChartRecommendation> {
    const { system, user } = buildChartRecommendationPrompt(input);
    const raw = await this.complete(system, user);
    return parseChartRecommendation(raw);
  }

  async testConnection(): Promise<string> {
    let availableChatModels: string[] = [];
    try {
      const modelsRes = await this.client.models.list();
      const nonChatKeywords = [
        "whisper",
        "prompt-guard",
        "orpheus",
        "safeguard",
        "vision",
        "embed",
      ];
      availableChatModels = (modelsRes.data ?? [])
        .map((m) => m.id)
        .filter((id) => !nonChatKeywords.some((kw) => id.toLowerCase().includes(kw)));
    } catch (err) {
      // If models.list fails with invalid key or network issue, classify and throw
      throw classifyError(err, "groq");
    }

    try {
      await this.client.chat.completions.create({
        model: this.model,
        messages: [{ role: "user", content: "ping" }],
        max_tokens: 5,
      });
      return "";
    } catch (err) {
      const classified = classifyError(err, "groq");
      if (classified.code === "INVALID_MODEL") {
        const sample = availableChatModels.slice(0, 3).join(", ");
        return `Connected to Groq (API key verified)! However, model '${this.model}' is not accessible on your account. Available models include: ${sample || "openai/gpt-oss-20b, qwen/qwen3.8-27b"}. Please select one in settings.`;
      }
      throw classified;
    }
  }

  async generateText(system: string, user: string): Promise<string> {
    return this.complete(system, user);
  }
}
