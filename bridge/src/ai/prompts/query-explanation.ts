import { QueryExplanationInput } from "../../types/";
import { SYSTEM_CONTEXT, MARKDOWN_INSTRUCTION } from "./shared";

export function buildQueryExplanationPrompt(input: QueryExplanationInput): {
  system: string;
  user: string;
} {
  const schemaContext =
    input.schema && input.schema.length > 0
      ? input.schema
        .map((t) => {
          const cols = t.columns
            .map((c) => `${c.name} ${c.type}${c.isPrimaryKey ? " PK" : ""}${c.isForeignKey ? " FK" : ""}`)
            .join(", ");
          return `- ${t.name}(${cols})`;
        })
        .join("\n")
      : "Schema not provided.";

  const dbType = input.databaseType ? ` (${input.databaseType})` : "";

  const user = `Explain the following SQL query${dbType}:

\`\`\`sql
${input.sql}
\`\`\`

## Relevant Schema
${schemaContext}

## What to cover
1. **Query Purpose** — What does this query do in plain English?
2. **Joins** — Explain any joins and the relationships they traverse
3. **Filters** — What data is being filtered and why
4. **Aggregations** — Any GROUP BY, COUNT, SUM, etc., and what they compute
5. **Performance Concerns** — Potential bottlenecks, missing indexes, full table scans
6. **Suggested Improvements** — Rewritten or optimized version if applicable

${MARKDOWN_INSTRUCTION}`;

  return { system: SYSTEM_CONTEXT, user };
}
