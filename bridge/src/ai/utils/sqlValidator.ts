import { SchemaFile } from "../../services/projectStore";

export type ValidationResult = {
  valid: boolean;
  reason?: string;
  intent?: "read" | "write" | "destructive" | "schema";
};

const BLOCKED_OPERATIONS = [
  "DROP TABLE",
  "DROP DATABASE",
  "DROP SCHEMA",
  "TRUNCATE",
  "DELETE FROM",
  "ALTER TABLE",
  "CREATE TABLE",
  "INSERT INTO",
  "UPDATE ",
];

export function validateGeneratedSQL(sql: string, schema: SchemaFile): ValidationResult {
  const normalizedSql = sql.trim().toUpperCase();
  const normalizedSqlSingleSpace = normalizedSql.replace(/\s+/g, " ");

  // 1. Block operations
  for (const op of BLOCKED_OPERATIONS) {
    if (normalizedSqlSingleSpace.includes(op)) {
      let intent: ValidationResult["intent"] = "write";
      if (op.includes("DROP") || op.includes("DELETE") || op.includes("TRUNCATE")) {
        intent = "destructive";
      } else if (op.includes("CREATE") || op.includes("ALTER")) {
        intent = "schema";
      }
      return { valid: false, reason: `Blocked operation detected: ${op}`, intent };
    }
  }

  // 2. Must start with SELECT (for auto-execution, if it doesn't, we mark it invalid but with intent unclear/schema/write based on other rules if missed)
  if (!normalizedSql.startsWith("SELECT")) {
    return { valid: false, reason: "Query must start with SELECT", intent: "write" }; // default non-select to write intent if not destructive
  }

  // 3. Stacked statements and comments
  // A semicolon anywhere except at the very end is considered stacked
  const semiIndex = sql.indexOf(";");
  if (semiIndex !== -1 && semiIndex !== sql.trim().length - 1) {
    return {
      valid: false,
      reason: "Stacked statements (multiple queries) are not allowed",
      intent: "read",
    };
  }

  if (sql.includes("--") || sql.includes("/*")) {
    return { valid: false, reason: "SQL comments are not allowed", intent: "read" };
  }

  // 4. Extract and verify tables
  // Simple regex for FROM or JOIN followed by table name
  // This looks for FROM/JOIN, then optional spaces, then an identifier that might be quoted
  const tableRegex = /(?:FROM|JOIN)\s+([a-zA-Z0-9_."`]+)/gi;
  let match;

  const validTables = new Set<string>();
  for (const s of schema.schemas) {
    for (const t of s.tables) {
      validTables.add(t.name.toLowerCase());
      validTables.add(`${s.name}.${t.name}`.toLowerCase());
    }
  }

  while ((match = tableRegex.exec(sql)) !== null) {
    let tableName = match[1];
    // Strip quotes
    tableName = tableName.replace(/["`]/g, "").toLowerCase();

    // Sometimes aliases are captured if not careful, but the regex only grabs the first word.
    // If it's a subquery like FROM (SELECT...), it will grab "(" which we ignore
    if (tableName === "(") continue;

    if (!validTables.has(tableName)) {
      return { valid: false, reason: `Table not found in schema: ${tableName}`, intent: "read" };
    }
  }

  return { valid: true, intent: "read" };
}
