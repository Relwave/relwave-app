import { SchemaFile } from "../../services/projectStore";

export interface SchemaContextOptions {
  excludeTables?: string[];
  targetSchema?: string;
  maskSensitiveColumns?: boolean;
}

const SENSITIVE_PATTERN =
  /password|password_hash|secret|api_key|token|private_key|credit_card|ssn|cvv/i;
const ALWAYS_EXCLUDED_TABLES = ["schema_migrations", "relwave_migrations", "ai_history"];

export function buildSchemaContext(schema: SchemaFile, options: SchemaContextOptions = {}): string {
  const { excludeTables = [], targetSchema, maskSensitiveColumns = true } = options;
  const excludedSet = new Set([...ALWAYS_EXCLUDED_TABLES, ...excludeTables]);

  let output = `Database: ${schema.dialect} | Schema captured: ${schema.cachedAt}\n\n`;

  let schemasToProcess = schema.schemas;
  if (targetSchema) {
    schemasToProcess = schemasToProcess.filter((s) => s.name === targetSchema);
  }

  // PostgreSQL Enums
  if (schema.dialect === "postgresql") {
    let hasEnums = false;
    for (const s of schemasToProcess) {
      if (s.enums && s.enums.length > 0) {
        if (!hasEnums) {
          output += "ENUM TYPES:\n";
          hasEnums = true;
        }
        for (const e of s.enums) {
          output += `  ${s.name}.${e.name} = [${e.values.join(", ")}]\n`;
        }
      }
    }
    if (hasEnums) output += "\n";
  }

  const relationships: string[] = [];

  for (const s of schemasToProcess) {
    for (const t of s.tables) {
      if (excludedSet.has(t.name) || excludedSet.has(`${s.name}.${t.name}`)) {
        continue;
      }

      output += `TABLE ${s.name}.${t.name}\n`;

      const sortedColumns = [...t.columns].sort((a, b) => a.ordinalPosition - b.ordinalPosition);

      for (const col of sortedColumns) {
        if (maskSensitiveColumns && SENSITIVE_PATTERN.test(col.name)) {
          output += `  ${col.name}: [REDACTED]\n`;
          continue;
        }

        const flags: string[] = [];
        if (col.isPrimaryKey) flags.push("PK");
        if (col.isForeignKey && col.foreignKey) {
          flags.push(
            `FK→${col.foreignKey.schema}.${col.foreignKey.table}.${col.foreignKey.column}`,
          );
        } else if (col.isForeignKey) {
          // Fallback if foreignKey details are missing but flag is true
          flags.push("FK");
        }
        if (!col.nullable) flags.push("NOT NULL");
        if (col.isUnique) flags.push("UNIQUE");
        if (col.defaultValue !== null && col.defaultValue !== undefined) {
          flags.push(`DEFAULT ${col.defaultValue}`);
        }

        const flagsStr = flags.length > 0 ? ` [${flags.join(", ")}]` : "";
        output += `  ${col.name} ${col.type}${flagsStr}\n`;
      }

      if (t.indexes && t.indexes.length > 0) {
        for (const idx of t.indexes) {
          const type = idx.unique ? "UNIQUE INDEX" : "INDEX";
          output += `  ${type} (${idx.columns.join(", ")})\n`;
        }
      }

      output += "\n";

      if (t.foreignKeys && t.foreignKeys.length > 0) {
        for (const fk of t.foreignKeys) {
          // e.g. RELATIONSHIP public.users.id → public.orders.user_id
          // Actually, fk.columns are the local columns.
          relationships.push(
            `RELATIONSHIP ${s.name}.${t.name}.${fk.columns.join(",")} → ${fk.referencedSchema}.${fk.referencedTable}.${fk.referencedColumns.join(",")}`,
          );
        }
      }
    }
  }

  if (relationships.length > 0) {
    output += "RELATIONSHIPS:\n";
    for (const rel of relationships) {
      output += `${rel}\n`;
    }
  }

  return output.trim();
}
