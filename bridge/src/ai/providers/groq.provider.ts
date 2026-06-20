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
import { buildChartRecommendationPrompt, parseChartRecommendation } from "../prompts/chart-recommendation";

const DEFAULT_MODEL = "llama-3.3-70b-versatile";

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
      throw classifyError(err, "groq");
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
    try {
      await this.client.chat.completions.create({
        model: this.model,
        messages: [{ role: "user", content: "ping" }],
        max_tokens: 5,
      });
      return "";
    } catch (err) {
      throw classifyError(err, "groq");
    }
  }
}
