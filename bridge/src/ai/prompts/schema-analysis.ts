import { SchemaAnalysisInput } from "../../types/";
import { SYSTEM_CONTEXT, MARKDOWN_INSTRUCTION } from "./shared";

export function buildSchemaAnalysisPrompt(input: SchemaAnalysisInput): {
  system: string;
  user: string;
} {
  const tableDescriptions = input.tables
    .map((t) => {
      const columns = t.columns
        .map((c) => {
          const flags: string[] = [];
          if (c.isPrimaryKey) flags.push("PK");
          if (c.isForeignKey) flags.push("FK");
          if (!c.nullable) flags.push("NOT NULL");
          if (c.references) flags.push(`→ ${c.references.table}.${c.references.column}`);
          return `  - ${c.name} (${c.type})${flags.length ? " [" + flags.join(", ") + "]" : ""}`;
        })
        .join("\n");

      const extras: string[] = [];
      if (t.indexes?.length) extras.push(`Indexes: ${t.indexes.join(", ")}`);
      if (t.foreignKeys?.length) extras.push(`Foreign keys: ${t.foreignKeys.join(", ")}`);
      if (t.constraints?.length) extras.push(`Constraints: ${t.constraints.join(", ")}`);

      return [
        `### Table: ${t.schema ? `${t.schema}.` : ""}${t.name}`,
        columns,
        extras.length ? extras.map((e) => `  * ${e}`).join("\n") : "",
      ]
        .filter(Boolean)
        .join("\n");
    })
    .join("\n\n");

  const dbType = input.databaseType ? ` (${input.databaseType})` : "";

  const user = `Analyze the following database schema${dbType} and provide:

## What to cover
1. **Purpose** — What does this database appear to be for?
2. **Architecture** — Key design decisions and table relationships
3. **Missing Indexes** — Columns that should be indexed but aren't
4. **Schema Smells** — Anti-patterns, naming issues, or poor design choices
5. **Normalization Concerns** — Over/under-normalization issues
6. **Scalability Concerns** — Issues that may cause problems at scale
7. **Suggested Improvements** — Concrete, actionable recommendations

## Schema
${tableDescriptions || "No tables provided."}

${MARKDOWN_INSTRUCTION}`;

  return { system: SYSTEM_CONTEXT, user };
}
