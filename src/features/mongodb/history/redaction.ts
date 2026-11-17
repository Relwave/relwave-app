import { tokenize } from "../parser/tokenizer";
import { Token } from "../parser/types";

/**
 * Checks whether a query string contains redacted placeholders (<string>, <number>, etc.).
 */
export function isRedactedQuery(query: string): boolean {
  if (!query || typeof query !== "string") return false;
  return /<string>|<number>|<date>|<boolean>/i.test(query);
}

/**
 * Sanitizes error messages by stripping connection URIs, credentials, and access tokens.
 */
export function sanitizeErrorMessage(message?: string): string | undefined {
  if (!message || typeof message !== "string") return undefined;

  // Redact MongoDB connection URIs: mongodb://user:pass@host...
  let sanitized = message.replace(
    /(mongodb(?:\+srv)?:\/\/[^:]+:)[^@]+(@[^\s"'`]+)/gi,
    "$1<redacted-password>$2",
  );

  // Redact generic protocol connection URIs: proto://user:pass@host...
  sanitized = sanitized.replace(
    /([a-zA-Z0-9_-]+:\/\/[^:]+:)[^@]+(@[^\s"'`]+)/gi,
    "$1<redacted-password>$2",
  );

  // Redact credentials in query string or key-value format (password=..., secret=...)
  sanitized = sanitized.replace(/(password|pwd|secret|auth|token)=([^&\s"'`]+)/gi, "$1=<redacted>");

  // Cap message length to 500 characters
  if (sanitized.length > 500) {
    sanitized = sanitized.substring(0, 497) + "...";
  }

  return sanitized;
}

/**
 * Determines whether a specific token in the token stream is a literal value that must be redacted.
 * Returns the placeholder string if it should be redacted, or null if it must be preserved.
 */
function getReplacementForToken(token: Token, index: number, tokens: Token[]): string | null {
  if (token.type === "EOF") return null;

  // 1. Structural check: Object property keys are NEVER redacted.
  // In JSON and JavaScript object literals ({ key: val, "key": val }), the key is followed by ':'.
  const nextToken = tokens[index + 1];
  if (nextToken && nextToken.value === ":") {
    return null;
  }

  // 2. Collection name arguments in db.getCollection("name") or db.collection("name")
  if (index >= 2) {
    const prev1 = tokens[index - 1];
    const prev2 = tokens[index - 2];
    if (prev1.value === "(" && (prev2.value === "getCollection" || prev2.value === "collection")) {
      return null;
    }
    // 3. Field name argument in distinct("fieldName")
    if (prev1.value === "(" && prev2.value === "distinct") {
      return null;
    }
  }

  // 4. BSON Date constructors: ISODate("...") or new Date("...")
  if (index >= 2) {
    const prev1 = tokens[index - 1];
    const prev2 = tokens[index - 2];
    if (prev1.value === "(" && (prev2.value === "ISODate" || prev2.value === "Date")) {
      return '"<date>"';
    }
  }

  // 5. EJSON v2 Date value: { "$date": "..." }
  if (index >= 2) {
    const prev1 = tokens[index - 1];
    const prev2 = tokens[index - 2];
    if (
      prev1.value === ":" &&
      (prev2.value === '"$date"' || prev2.value === "$date" || prev2.value === "'$date'")
    ) {
      return '"<date>"';
    }
  }

  // 6. BSON number constructors: NumberLong("..."), NumberDecimal("...")
  if (index >= 2) {
    const prev1 = tokens[index - 1];
    const prev2 = tokens[index - 2];
    if (
      prev1.value === "(" &&
      (prev2.value === "NumberLong" || prev2.value === "NumberDecimal" || prev2.value === "Int32")
    ) {
      return '"<number>"';
    }
  }

  // 7. EJSON v2 numeric wrappers: { "$numberLong": "..." }, { "$numberDecimal": "..." }
  if (index >= 2) {
    const prev1 = tokens[index - 1];
    const prev2 = tokens[index - 2];
    if (
      prev1.value === ":" &&
      (prev2.value === '"$numberLong"' ||
        prev2.value === "$numberLong" ||
        prev2.value === '"$numberDecimal"' ||
        prev2.value === "$numberDecimal" ||
        prev2.value === '"$numberInt"' ||
        prev2.value === "$numberInt" ||
        prev2.value === '"$numberDouble"' ||
        prev2.value === "$numberDouble")
    ) {
      return '"<number>"';
    }
  }

  // 8. BSON ObjectId and UUID constructors: ObjectId("..."), UUID("...")
  if (index >= 2) {
    const prev1 = tokens[index - 1];
    const prev2 = tokens[index - 2];
    if (prev1.value === "(" && (prev2.value === "ObjectId" || prev2.value === "UUID")) {
      return '"<string>"';
    }
  }

  // 9. EJSON v2 ObjectId: { "$oid": "..." }
  if (index >= 2) {
    const prev1 = tokens[index - 1];
    const prev2 = tokens[index - 2];
    if (prev1.value === ":" && (prev2.value === '"$oid"' || prev2.value === "$oid")) {
      return '"<string>"';
    }
  }

  // 10. General literal value redaction:
  if (token.type === "String") {
    return '"<string>"';
  }

  if (token.type === "Number") {
    return "<number>";
  }

  if (token.type === "Boolean") {
    return "<boolean>";
  }

  return null;
}

/**
 * Fallback redaction for syntax that fails strict tokenization.
 * Ensures sensitive literals are never leaked even if the user typed unclosed syntax.
 */
function fallbackRedact(source: string): string {
  let text = source;
  // Replace string literals
  text = text.replace(/(["'])(?:(?=(\\?))\2.)*?\1/g, '"<string>"');
  // Replace numbers
  text = text.replace(/\b\d+(\.\d+)?([eE][+-]?\d+)?\b/g, "<number>");
  // Replace booleans
  text = text.replace(/\b(true|false)\b/g, "<boolean>");
  return text;
}

/**
 * Deterministic token-aware literal value redaction for MongoDB MQL queries and JSON.
 * Preserves collection names, method names, field names, and structural operators while
 * replacing user data literals with type placeholders (<string>, <number>, <date>, <boolean>).
 */
export function redactQueryText(source: string): string {
  if (!source || typeof source !== "string") return "";
  const trimmed = source.trim();
  if (!trimmed) return source;

  try {
    const tokens = tokenize(source);
    let result = "";
    let lastIndex = 0;

    for (let i = 0; i < tokens.length; i++) {
      const token = tokens[i];
      if (token.type === "EOF") break;

      const replacement = getReplacementForToken(token, i, tokens);
      if (replacement !== null) {
        // Append preserved whitespace/punctuation before this token
        result += source.substring(lastIndex, token.offset);
        result += replacement;
        lastIndex = token.offset + token.raw.length;
      }
    }

    result += source.substring(lastIndex);
    return result;
  } catch {
    // Graceful fallback: Never leak raw query text when tokenization encounters syntax errors
    return fallbackRedact(source);
  }
}
