import { Ollama } from "ollama";
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

const DEFAULT_MODEL = "llama3.2";

export class OllamaProvider implements AIProvider {
  private client: Ollama;
  private model: string;

  constructor(baseUrl?: string, model?: string) {
    this.client = new Ollama({ host: baseUrl ?? "http://localhost:11434" });
    this.model = model?.trim() || DEFAULT_MODEL;
  }

  private async complete(system: string, user: string): Promise<string> {
    try {
      const res = await this.client.chat({
        model: this.model,
        messages: [
          { role: "system", content: system },
          { role: "user", content: user },
        ],
      });
      return res.message?.content ?? "";
    } catch (err) {
      throw classifyError(err, "ollama");
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
      // List models to verify Ollama is reachable and the model exists
      const list = await this.client.list();
      const available = list.models.map((m: any) => m.name);
      if (!available.some((n: string) => n.startsWith(this.model.split(":")[0]))) {
        throw new Error(`Model "${this.model}" not found. Available: ${available.join(", ") || "none"}`);
      }
      return "";
    } catch (err) {
      throw classifyError(err, "ollama");
    }
  }
}
