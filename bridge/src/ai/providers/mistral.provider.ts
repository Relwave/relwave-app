import { Mistral } from "@mistralai/mistralai";
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

const DEFAULT_MODEL = "mistral-small-latest";

export class MistralProvider implements AIProvider {
  private client: Mistral;

  constructor(apiKey: string) {
    this.client = new Mistral({ apiKey });
  }

  private async complete(system: string, user: string): Promise<string> {
    try {
      const res = await this.client.chat.complete({
        model: DEFAULT_MODEL,
        messages: [
          { role: "system", content: system },
          { role: "user", content: user },
        ],
        maxTokens: 2048,
      });
      const choice = res.choices?.[0];
      const content = choice?.message?.content;
      if (typeof content === "string") return content;
      if (Array.isArray(content)) {
        return content.map((c: any) => c.text ?? "").join("");
      }
      return "";
    } catch (err) {
      throw classifyError(err, "mistral");
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
      await this.client.chat.complete({
        model: DEFAULT_MODEL,
        messages: [{ role: "user", content: "ping" }],
        maxTokens: 5,
      });
      return "";
    } catch (err) {
      throw classifyError(err, "mistral");
    }
  }
}
