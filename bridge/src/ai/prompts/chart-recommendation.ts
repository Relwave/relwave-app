import { ChartRecommendationInput, ChartRecommendation } from "../../types/";
import { SYSTEM_CONTEXT } from "./shared";
import { AIError } from "../providers/types";

export function buildChartRecommendationPrompt(input: ChartRecommendationInput): {
  system: string;
  user: string;
} {
  const columnList = input.columns
    .map((c) => {
      const flags: string[] = [c.type];
      if (c.isPrimaryKey) flags.push("PK");
      if (c.sampleValues?.length) flags.push(`samples: ${c.sampleValues.slice(0, 3).join(", ")}`);
      return `- ${c.name} (${flags.join(", ")})`;
    })
    .join("\n");

  const user = `Given the table "${input.tableName}" with the following columns, recommend the best chart visualization:

## Columns
${columnList}

## Instructions
Respond ONLY with a valid JSON object — no markdown fences, no explanation text.
The JSON must match exactly this shape:
{
  "chartType": "bar" | "line" | "area" | "pie",
  "xAxis": "<column name>",
  "yAxis": "<column name>",
  "reasoning": "<one sentence explanation>"
}

Choose the most insightful combination. Prefer grouping a categorical/text column on X and counting a numeric/PK column on Y.`;

  return { system: SYSTEM_CONTEXT, user };
}

/**
 * Parse the raw LLM text response into a ChartRecommendation.
 * The model is instructed to return bare JSON, but defensively strip
 * any markdown fences if the model adds them anyway.
 */
export function parseChartRecommendation(raw: string): ChartRecommendation {
  // Strip markdown code fences if present
  const cleaned = raw
    .replace(/```json\s*/gi, "")
    .replace(/```\s*/g, "")
    .trim();

  let parsed: any;
  try {
    parsed = JSON.parse(cleaned);
  } catch {
    throw new AIError("PARSE_ERROR", "chart-recommendation", `Failed to parse chart recommendation JSON: ${raw.slice(0, 200)}`);
  }

  const validTypes = ["bar", "line", "area", "pie"];
  const chartType = validTypes.includes(parsed.chartType) ? parsed.chartType : "bar";

  return {
    chartType: chartType as ChartRecommendation["chartType"],
    xAxis: String(parsed.xAxis ?? ""),
    yAxis: String(parsed.yAxis ?? ""),
    reasoning: String(parsed.reasoning ?? ""),
  };
}
