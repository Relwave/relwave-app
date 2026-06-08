import Anthropic from "@anthropic-ai/sdk";
import { AIProvider, classifyError } from "./types";
import {
  SchemaAnalysisInput,
  QueryExplanationInput,
  ChartRecommendationInput,
  ChartRecommendation,
} from "../../types";
import { buildSchemaAnalysisPrompt } from "../prompts/schema-analysis";
import { buildQueryExplanationPrompt } from "../prompts/query-explanation";
import { buildChartRecommendationPrompt, parseChartRecommendation } from "../prompts/chart-recommendation";

const DEFAULT_MODEL = "claude-3-5-haiku-20241022";

export class AnthropicProvider implements AIProvider {
  private client: Anthropic;

  constructor(apiKey: string) {
    this.client = new Anthropic({ apiKey });
  }

  private async complete(system: string, user: string): Promise<string> {
    try {
      const msg = await this.client.messages.create({
        model: DEFAULT_MODEL,
        max_tokens: 4096,
        system,
        messages: [{ role: "user", content: user }],
      });
      const block = msg.content[0];
      return block.type === "text" ? block.text : "";
    } catch (err) {
      throw classifyError(err, "anthropic");
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
      await this.client.messages.create({
        model: DEFAULT_MODEL,
        max_tokens: 10,
        messages: [{ role: "user", content: "ping" }],
      });
      return "";
    } catch (err) {
      throw classifyError(err, "anthropic");
    }
  }
}
