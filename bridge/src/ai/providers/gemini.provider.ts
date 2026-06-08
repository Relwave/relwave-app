import { GoogleGenerativeAI } from "@google/generative-ai";
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

const DEFAULT_MODEL = "gemini-1.5-flash";

export class GeminiProvider implements AIProvider {
  private genAI: GoogleGenerativeAI;

  constructor(apiKey: string) {
    this.genAI = new GoogleGenerativeAI(apiKey);
  }

  private async complete(system: string, user: string): Promise<string> {
    try {
      const model = this.genAI.getGenerativeModel({
        model: DEFAULT_MODEL,
        systemInstruction: system,
        generationConfig: { maxOutputTokens: 4096 },
      });
      const result = await model.generateContent(user);
      return result.response.text();
    } catch (err) {
      throw classifyError(err, "gemini");
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
      const model = this.genAI.getGenerativeModel({ model: DEFAULT_MODEL });
      await model.generateContent("ping");
      return "";
    } catch (err) {
      throw classifyError(err, "gemini");
    }
  }
}
