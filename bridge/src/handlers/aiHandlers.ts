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
import {
  getOrCall,
  hashSchemaAnalysis,
  hashQueryExplanation,
  hashChartRecommendation,
} from "../services/aiCacheService";
import { aiHistoryStore } from "../services/aiHistoryStore";
import { buildSchemaAnalysisPrompt } from "../ai/prompts/schema-analysis";
import { buildQueryExplanationPrompt } from "../ai/prompts/query-explanation";
import { buildChartRecommendationPrompt } from "../ai/prompts/chart-recommendation";
import { parseChartRecommendation } from "../ai/prompts/chart-recommendation";

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

  async handleAnalyzeSchema(params: AIAnalyzeSchemaParams & { skipCache?: boolean }, id: number | string) {
    try {
      if (!params?.input?.tables?.length) {
        return this.rpc.sendError(id, { code: "BAD_REQUEST", message: "No tables provided." });
      }

      const hash = hashSchemaAnalysis(params.input, params.datasourceName);
      const { system, user } = buildSchemaAnalysisPrompt(params.input);
      const prompt = `${system}\n\n${user}`;

      const result = await getOrCall({
        feature: "schema-analysis",
        hash,
        settings: params.settings,
        prompt,
        callFn: async () => {
          const provider = this.aiService.resolveProvider(params.settings);
          return provider.analyzeSchema(params.input);
        },
        meta: { datasource_id: params.datasourceName, table_name: params.tableName },
        skipCache: params.skipCache,
      });

      this.rpc.sendResponse(id, {
        ok: true,
        data: {
          markdown: result.response,
          cached: result.cached,
          createdAt: result.createdAt,
        },
      });
    } catch (err) {
      this.logger?.error({ err }, "ai.analyzeSchema failed");
      const msg = err instanceof AIError ? err.originalMessage : String(err);
      const code = err instanceof AIError ? err.code : "UNKNOWN";
      this.rpc.sendError(id, { code, message: msg });
    }
  }

  async handleExplainQuery(params: AIExplainQueryParams & { skipCache?: boolean }, id: number | string) {
    try {
      if (!params?.input?.sql?.trim()) {
        return this.rpc.sendError(id, { code: "BAD_REQUEST", message: "No SQL provided." });
      }

      const hash = hashQueryExplanation(params.input, params.datasourceName);
      const { system, user } = buildQueryExplanationPrompt(params.input);
      const prompt = `${system}\n\n${user}`;

      const result = await getOrCall({
        feature: "query-explanation",
        hash,
        settings: params.settings,
        prompt,
        callFn: async () => {
          const provider = this.aiService.resolveProvider(params.settings);
          return provider.explainQuery(params.input);
        },
        meta: { datasource_id: params.datasourceName, table_name: params.tableName },
        skipCache: params.skipCache,
      });

      this.rpc.sendResponse(id, {
        ok: true,
        data: {
          markdown: result.response,
          cached: result.cached,
          createdAt: result.createdAt,
        },
      });
    } catch (err) {
      this.logger?.error({ err }, "ai.explainQuery failed");
      const msg = err instanceof AIError ? err.originalMessage : String(err);
      const code = err instanceof AIError ? err.code : "UNKNOWN";
      this.rpc.sendError(id, { code, message: msg });
    }
  }

  async handleRecommendChart(params: AIRecommendChartParams & { skipCache?: boolean }, id: number | string) {
    try {
      if (!params?.input?.tableName || !params?.input?.columns?.length) {
        return this.rpc.sendError(id, { code: "BAD_REQUEST", message: "Missing tableName or columns." });
      }

      const hash = hashChartRecommendation(params.input, params.datasourceName);
      const { system, user } = buildChartRecommendationPrompt(params.input);
      const prompt = `${system}\n\n${user}`;

      const result = await getOrCall({
        feature: "chart-recommendation",
        hash,
        settings: params.settings,
        prompt,
        callFn: async () => {
          const provider = this.aiService.resolveProvider(params.settings);
          const rec = await provider.recommendChart(params.input);
          // Serialize the recommendation as JSON so it can be stored as a string
          return JSON.stringify(rec);
        },
        meta: {
          datasource_id: params.datasourceName,
          table_name: params.tableName ?? params.input.tableName,
        },
        skipCache: params.skipCache,
      });

      // Parse the stored JSON response back into a ChartRecommendation
      let recommendation;
      try {
        recommendation = JSON.parse(result.response);
      } catch {
        recommendation = parseChartRecommendation(result.response);
      }

      this.rpc.sendResponse(id, {
        ok: true,
        data: {
          ...recommendation,
          cached: result.cached,
          createdAt: result.createdAt,
        },
      });
    } catch (err) {
      this.logger?.error({ err }, "ai.recommendChart failed");
      const msg = err instanceof AIError ? err.originalMessage : String(err);
      const code = err instanceof AIError ? err.code : "UNKNOWN";
      this.rpc.sendError(id, { code, message: msg });
    }
  }

  // ── History CRUD handlers ─────────────────────────────────────────────

  async handleGetHistory(params: { feature?: string; provider?: string; limit?: number; offset?: number }, id: number | string) {
    try {
      const result = aiHistoryStore.list({
        feature: params?.feature,
        provider: params?.provider,
        limit: params?.limit,
        offset: params?.offset,
      });
      this.rpc.sendResponse(id, { ok: true, data: result });
    } catch (err: any) {
      this.logger?.error({ err }, "ai.getHistory failed");
      this.rpc.sendError(id, { code: "HISTORY_ERROR", message: err?.message ?? String(err) });
    }
  }

  async handleGetHistoryById(params: { id: number }, id: number | string) {
    try {
      const record = aiHistoryStore.getById(params.id);
      if (!record) {
        return this.rpc.sendError(id, { code: "NOT_FOUND", message: "History entry not found." });
      }
      this.rpc.sendResponse(id, { ok: true, data: record });
    } catch (err: any) {
      this.logger?.error({ err }, "ai.getHistoryById failed");
      this.rpc.sendError(id, { code: "HISTORY_ERROR", message: err?.message ?? String(err) });
    }
  }

  async handleDeleteHistory(params: { id: number }, id: number | string) {
    try {
      const deleted = aiHistoryStore.deleteById(params.id);
      this.rpc.sendResponse(id, { ok: true, data: { deleted } });
    } catch (err: any) {
      this.logger?.error({ err }, "ai.deleteHistory failed");
      this.rpc.sendError(id, { code: "HISTORY_ERROR", message: err?.message ?? String(err) });
    }
  }

  async handleClearHistory(_params: unknown, id: number | string) {
    try {
      const count = aiHistoryStore.clearAll();
      this.rpc.sendResponse(id, { ok: true, data: { deletedCount: count } });
    } catch (err: any) {
      this.logger?.error({ err }, "ai.clearHistory failed");
      this.rpc.sendError(id, { code: "HISTORY_ERROR", message: err?.message ?? String(err) });
    }
  }
}
