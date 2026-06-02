import { Logger } from "pino";
import { Rpc } from "../types";
import { AIService } from "../services/aiService";
import { AIError } from "../ai/providers/types";
import {
  AIAnalyzeSchemaParams,
  AIExplainQueryParams,
  AIRecommendChartParams,
  AITestConnectionParams,
} from "../types/ai";

export class AIHandlers {
  private aiService: AIService;

  constructor(private rpc: Rpc, private logger: Logger) {
    this.aiService = new AIService();
  }

  async handleTestConnection(params: AITestConnectionParams, id: number | string) {
    try {
      const provider = this.aiService.resolveProvider(params.settings);
      await provider.testConnection();
      this.rpc.sendResponse(id, { ok: true, data: { connected: true } });
    } catch (err) {
      this.logger?.warn({ err }, "ai.testConnection failed");
      const msg = err instanceof AIError ? err.originalMessage : String(err);
      const code = err instanceof AIError ? err.code : "UNKNOWN";
      this.rpc.sendError(id, { code, message: msg });
    }
  }

  async handleAnalyzeSchema(params: AIAnalyzeSchemaParams, id: number | string) {
    try {
      if (!params?.input?.tables?.length) {
        return this.rpc.sendError(id, { code: "BAD_REQUEST", message: "No tables provided." });
      }
      const provider = this.aiService.resolveProvider(params.settings);
      const markdown = await provider.analyzeSchema(params.input);
      this.rpc.sendResponse(id, { ok: true, data: { markdown } });
    } catch (err) {
      this.logger?.error({ err }, "ai.analyzeSchema failed");
      const msg = err instanceof AIError ? err.originalMessage : String(err);
      const code = err instanceof AIError ? err.code : "UNKNOWN";
      this.rpc.sendError(id, { code, message: msg });
    }
  }

  async handleExplainQuery(params: AIExplainQueryParams, id: number | string) {
    try {
      if (!params?.input?.sql?.trim()) {
        return this.rpc.sendError(id, { code: "BAD_REQUEST", message: "No SQL provided." });
      }
      const provider = this.aiService.resolveProvider(params.settings);
      const markdown = await provider.explainQuery(params.input);
      this.rpc.sendResponse(id, { ok: true, data: { markdown } });
    } catch (err) {
      this.logger?.error({ err }, "ai.explainQuery failed");
      const msg = err instanceof AIError ? err.originalMessage : String(err);
      const code = err instanceof AIError ? err.code : "UNKNOWN";
      this.rpc.sendError(id, { code, message: msg });
    }
  }

  async handleRecommendChart(params: AIRecommendChartParams, id: number | string) {
    try {
      if (!params?.input?.tableName || !params?.input?.columns?.length) {
        return this.rpc.sendError(id, { code: "BAD_REQUEST", message: "Missing tableName or columns." });
      }
      const provider = this.aiService.resolveProvider(params.settings);
      const recommendation = await provider.recommendChart(params.input);
      this.rpc.sendResponse(id, { ok: true, data: recommendation });
    } catch (err) {
      this.logger?.error({ err }, "ai.recommendChart failed");
      const msg = err instanceof AIError ? err.originalMessage : String(err);
      const code = err instanceof AIError ? err.code : "UNKNOWN";
      this.rpc.sendError(id, { code, message: msg });
    }
  }
}
