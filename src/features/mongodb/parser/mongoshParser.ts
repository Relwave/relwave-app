import { Token, MongoshParseResult } from "./types";
import { MongoParserError } from "./errors";
import { tokenize } from "./tokenizer";
import {
  parseObjectId,
  parseISODate,
  parseNumberLong,
  parseNumberDecimal,
  parseUUID,
} from "./bson";
import type {
  MongoMqlOperation,
  MongoFindOpPayload,
  MongoAggregateOpPayload,
  MongoCountOpPayload,
} from "../types";

const FORBIDDEN_JS_KEYWORDS = new Set([
  "var",
  "let",
  "const",
  "function",
  "for",
  "while",
  "do",
  "if",
  "else",
  "switch",
  "case",
  "default",
  "break",
  "continue",
  "return",
  "try",
  "catch",
  "finally",
  "throw",
  "class",
  "extends",
  "import",
  "export",
  "debugger",
  "yield",
  "async",
  "await",
  "delete",
  "typeof",
  "void",
  "with",
]);

const SUPPORTED_ROOT_OPERATIONS = new Set([
  "find",
  "aggregate",
  "countDocuments",
  "estimatedDocumentCount",
  "distinct",
]);

const SUPPORTED_MODIFIERS = new Set(["sort", "skip", "limit", "project", "allowDiskUse"]);

const PROTOTYPE_PROPERTIES = new Set(["__proto__", "constructor", "prototype"]);

const MAX_NESTING_DEPTH = 15;
const MAX_SORT_FIELDS = 32;
const MAX_PROJECTION_FIELDS = 128;

export function parseMongoshQuery(source: string): MongoshParseResult {
  const trimmed = source.trim();
  if (!trimmed) {
    throw new MongoParserError("Query string is empty.", "INVALID_SYNTAX", 1, 1, 0);
  }

  const tokens = tokenize(trimmed);

  // Security Gate 1: Check for unquoted compound semicolons
  for (const t of tokens) {
    if (t.type === "Punctuator" && t.value === ";") {
      throw new MongoParserError(
        "Compound statements are not supported. Enter a single query.",
        "COMPOUND_STATEMENT",
        t.line,
        t.column,
        t.offset,
      );
    }
  }

  // Security Gate 2: Check for forbidden JavaScript keywords in token stream
  for (const t of tokens) {
    if (t.type === "Identifier" && FORBIDDEN_JS_KEYWORDS.has(t.value)) {
      throw new MongoParserError(
        "Arbitrary JavaScript execution is not supported. Use standard query syntax: db.<collection>.find({ ... }).",
        "SECURITY_VIOLATION",
        t.line,
        t.column,
        t.offset,
      );
    }
  }

  let pos = 0;

  function current(): Token {
    return (
      tokens[pos] ?? {
        type: "EOF",
        value: "",
        raw: "",
        line: 1,
        column: 1,
        offset: 0,
      }
    );
  }

  function peek(offset = 1): Token {
    return (
      tokens[pos + offset] ?? {
        type: "EOF",
        value: "",
        raw: "",
        line: 1,
        column: 1,
        offset: 0,
      }
    );
  }

  function advance(): Token {
    const t = current();
    pos++;
    return t;
  }

  function expect(type: Token["type"], value?: string): Token {
    const t = current();
    if (t.type !== type || (value !== undefined && t.value !== value)) {
      const expected = value ? `'${value}'` : type;
      throw new MongoParserError(
        `Expected ${expected} but found '${t.value || t.type}'.`,
        "INVALID_SYNTAX",
        t.line,
        t.column,
        t.offset,
      );
    }
    return advance();
  }

  // 1. Must start with `db`
  const dbToken = current();
  if (dbToken.type !== "Identifier" || dbToken.value !== "db") {
    throw new MongoParserError(
      "Query must begin with 'db.<collection>' or 'db.getCollection(...)'.",
      "INVALID_SYNTAX",
      dbToken.line,
      dbToken.column,
      dbToken.offset,
    );
  }
  advance(); // consume `db`

  // 2. Parse collection reference
  let collectionName = "";
  const sepToken = current();

  if (sepToken.type === "Punctuator" && sepToken.value === ".") {
    advance(); // consume '.'
    const collToken = current();

    if (collToken.type !== "Identifier") {
      throw new MongoParserError(
        "Expected collection name after 'db.'.",
        "INVALID_SYNTAX",
        collToken.line,
        collToken.column,
        collToken.offset,
      );
    }

    if (collToken.value === "getCollection" || collToken.value === "collection") {
      advance(); // consume method name
      expect("Punctuator", "(");
      const nameToken = current();
      if (nameToken.type !== "String") {
        throw new MongoParserError(
          `${collToken.value}() requires a string argument for collection name.`,
          "INVALID_SYNTAX",
          nameToken.line,
          nameToken.column,
          nameToken.offset,
        );
      }
      collectionName = nameToken.value;
      advance();
      expect("Punctuator", ")");
    } else {
      // Standard identifier e.g. `db.users`
      collectionName = collToken.value;
      advance();

      // Check if user wrote unbracketed dotted namespace e.g. `db.audit.events.find()`
      if (
        current().type === "Punctuator" &&
        current().value === "." &&
        peek().type === "Identifier" &&
        !SUPPORTED_ROOT_OPERATIONS.has(peek().value) &&
        !SUPPORTED_MODIFIERS.has(peek().value)
      ) {
        throw new MongoParserError(
          "Dotted collection names must use explicit collection API (e.g. db.getCollection('audit.events')) or bracket notation (e.g. db['audit.events']). Nested namespace 'db." +
            collectionName +
            "." +
            peek().value +
            "' is not supported.",
          "INVALID_COLLECTION_NAME",
          peek().line,
          peek().column,
          peek().offset,
        );
      }
    }
  } else if (sepToken.type === "Punctuator" && sepToken.value === "[") {
    advance(); // consume '['
    const nameToken = current();
    if (nameToken.type !== "String") {
      throw new MongoParserError(
        "Bracket notation expects a string collection name e.g. db['collectionName'].",
        "INVALID_SYNTAX",
        nameToken.line,
        nameToken.column,
        nameToken.offset,
      );
    }
    collectionName = nameToken.value;
    advance();
    expect("Punctuator", "]");
  } else {
    throw new MongoParserError(
      "Expected '.' or '[' after 'db'.",
      "INVALID_SYNTAX",
      sepToken.line,
      sepToken.column,
      sepToken.offset,
    );
  }

  // Validate collection name
  validateCollectionName(collectionName, sepToken.line, sepToken.column, sepToken.offset);

  // 3. Parse Operation
  expect("Punctuator", ".");
  const opToken = current();

  if (PROTOTYPE_PROPERTIES.has(opToken.value)) {
    throw new MongoParserError(
      `Access to prototype property '${opToken.value}' is forbidden.`,
      "SECURITY_VIOLATION",
      opToken.line,
      opToken.column,
      opToken.offset,
    );
  }

  if (!SUPPORTED_ROOT_OPERATIONS.has(opToken.value)) {
    throw new MongoParserError(
      `Unsupported method '${opToken.value}'. Supported operations are: find, aggregate, countDocuments, estimatedDocumentCount, distinct.`,
      "UNSUPPORTED_METHOD",
      opToken.line,
      opToken.column,
      opToken.offset,
    );
  }

  const rootOp = advance().value;
  expect("Punctuator", "(");

  // Operation specific argument parsing
  let opResult: MongoMqlOperation;

  if (rootOp === "find") {
    opResult = parseFindArgs();
  } else if (rootOp === "aggregate") {
    opResult = parseAggregateArgs();
  } else if (rootOp === "countDocuments") {
    opResult = parseCountArgs();
  } else if (rootOp === "estimatedDocumentCount") {
    opResult = parseEstimatedCountArgs();
  } else if (rootOp === "distinct") {
    opResult = parseDistinctArgs();
  } else {
    throw new MongoParserError(
      `Unsupported operation '${rootOp}'.`,
      "UNSUPPORTED_OPERATION",
      opToken.line,
      opToken.column,
      opToken.offset,
    );
  }

  // 4. Parse Chained Modifiers
  const seenModifiers = new Set<string>();

  while (current().type === "Punctuator" && current().value === ".") {
    advance(); // consume '.'
    const modToken = current();

    if (PROTOTYPE_PROPERTIES.has(modToken.value)) {
      throw new MongoParserError(
        `Access to prototype property '${modToken.value}' is forbidden.`,
        "SECURITY_VIOLATION",
        modToken.line,
        modToken.column,
        modToken.offset,
      );
    }

    if (!SUPPORTED_MODIFIERS.has(modToken.value)) {
      throw new MongoParserError(
        `Unsupported chained modifier '.${modToken.value}()'.`,
        "UNSUPPORTED_METHOD",
        modToken.line,
        modToken.column,
        modToken.offset,
      );
    }

    const modName = advance().value;

    if (seenModifiers.has(modName)) {
      throw new MongoParserError(
        `Duplicate modifier '.${modName}()' is not allowed.`,
        "INVALID_SYNTAX",
        modToken.line,
        modToken.column,
        modToken.offset,
      );
    }
    seenModifiers.add(modName);

    expect("Punctuator", "(");
    applyModifier(modName, modToken, opResult);
    expect("Punctuator", ")");
  }

  // 5. Ensure no trailing tokens
  if (current().type !== "EOF") {
    const trailing = current();
    throw new MongoParserError(
      `Unexpected token '${trailing.value || trailing.type}' after query expression.`,
      "INVALID_SYNTAX",
      trailing.line,
      trailing.column,
      trailing.offset,
    );
  }

  return {
    collection: collectionName,
    op: opResult,
  };

  // ---- Helper parsing functions ----

  function parseFindArgs(): MongoMqlOperation {
    let filter: any = {};
    let projection: Record<string, 0 | 1> | undefined;

    if (current().type !== "Punctuator" || current().value !== ")") {
      const fToken = current();
      if (fToken.type !== "Punctuator" || fToken.value !== "{") {
        throw new MongoParserError(
          "find() filter must be an object literal.",
          "INVALID_SYNTAX",
          fToken.line,
          fToken.column,
          fToken.offset,
        );
      }
      filter = parseObjectLiteral(0);

      if (current().type === "Punctuator" && current().value === ",") {
        advance(); // consume ','
        const pToken = current();
        if (pToken.type !== "Punctuator" || pToken.value !== "{") {
          throw new MongoParserError(
            "find() projection must be an object literal.",
            "INVALID_SYNTAX",
            pToken.line,
            pToken.column,
            pToken.offset,
          );
        }
        const parsedProj = parseObjectLiteral(0);
        projection = validateProjectionObject(parsedProj, pToken);
      }
    }

    expect("Punctuator", ")");
    return {
      operation: "find",
      payload: {
        filter,
        projection,
      },
    };
  }

  function parseAggregateArgs(): MongoMqlOperation {
    let pipeline: any[] = [];
    let allowDiskUse: boolean | undefined;

    if (current().type !== "Punctuator" || current().value !== ")") {
      const pipeToken = current();
      if (pipeToken.type !== "Punctuator" || pipeToken.value !== "[") {
        throw new MongoParserError(
          "aggregate() pipeline must be an array literal.",
          "INVALID_SYNTAX",
          pipeToken.line,
          pipeToken.column,
          pipeToken.offset,
        );
      }
      pipeline = parseArrayLiteral(0);

      // Validate stages
      for (const stage of pipeline) {
        if (!stage || typeof stage !== "object" || Array.isArray(stage)) {
          throw new MongoParserError(
            "Each aggregation pipeline stage must be a non-null object.",
            "INVALID_SYNTAX",
            pipeToken.line,
            pipeToken.column,
            pipeToken.offset,
          );
        }
        const keys = Object.keys(stage);
        if (keys.length !== 1 || !keys[0].startsWith("$")) {
          throw new MongoParserError(
            "Each pipeline stage must have exactly one operator key beginning with '$'.",
            "INVALID_SYNTAX",
            pipeToken.line,
            pipeToken.column,
            pipeToken.offset,
          );
        }
      }

      if (current().type === "Punctuator" && current().value === ",") {
        advance(); // consume ','
        const optsToken = current();
        if (optsToken.type !== "Punctuator" || optsToken.value !== "{") {
          throw new MongoParserError(
            "aggregate() options must be an object literal.",
            "INVALID_SYNTAX",
            optsToken.line,
            optsToken.column,
            optsToken.offset,
          );
        }
        const opts = parseObjectLiteral(0);
        if (typeof opts.allowDiskUse === "boolean") {
          allowDiskUse = opts.allowDiskUse;
        }
      }
    }

    expect("Punctuator", ")");
    return {
      operation: "aggregate",
      payload: {
        pipeline,
        allowDiskUse,
      },
    };
  }

  function parseCountArgs(): MongoMqlOperation {
    let filter: any = {};
    let skip: number | undefined;
    let limit: number | undefined;

    if (current().type !== "Punctuator" || current().value !== ")") {
      const fToken = current();
      if (fToken.type !== "Punctuator" || fToken.value !== "{") {
        throw new MongoParserError(
          "countDocuments() filter must be an object literal.",
          "INVALID_SYNTAX",
          fToken.line,
          fToken.column,
          fToken.offset,
        );
      }
      filter = parseObjectLiteral(0);

      if (current().type === "Punctuator" && current().value === ",") {
        advance(); // consume ','
        const optsToken = current();
        if (optsToken.type !== "Punctuator" || optsToken.value !== "{") {
          throw new MongoParserError(
            "countDocuments() options must be an object literal.",
            "INVALID_SYNTAX",
            optsToken.line,
            optsToken.column,
            optsToken.offset,
          );
        }
        const opts = parseObjectLiteral(0);
        if (typeof opts.skip === "number") skip = opts.skip;
        if (typeof opts.limit === "number") limit = opts.limit;
      }
    }

    expect("Punctuator", ")");
    return {
      operation: "countDocuments",
      payload: {
        filter,
        skip,
        limit,
      },
    };
  }

  function parseEstimatedCountArgs(): MongoMqlOperation {
    if (current().type !== "Punctuator" || current().value !== ")") {
      const fToken = current();
      if (fToken.type !== "Punctuator" || fToken.value !== "{") {
        throw new MongoParserError(
          "estimatedDocumentCount does not accept a filter; payload must be empty or undefined. Use countDocuments for filtered counts.",
          "INVALID_SYNTAX",
          fToken.line,
          fToken.column,
          fToken.offset,
        );
      }
      const obj = parseObjectLiteral(0);
      if (Object.keys(obj).length > 0) {
        throw new MongoParserError(
          "estimatedDocumentCount does not accept a filter; payload must be empty or undefined. Use countDocuments for filtered counts.",
          "INVALID_SYNTAX",
          fToken.line,
          fToken.column,
          fToken.offset,
        );
      }
    }

    expect("Punctuator", ")");
    return {
      operation: "estimatedDocumentCount",
      payload: undefined,
    };
  }

  function parseDistinctArgs(): MongoMqlOperation {
    const fToken = current();
    if (fToken.type !== "String") {
      throw new MongoParserError(
        "distinct() requires a string field name as the first argument.",
        "INVALID_SYNTAX",
        fToken.line,
        fToken.column,
        fToken.offset,
      );
    }
    const field = fToken.value;
    if (!field.trim()) {
      throw new MongoParserError(
        "distinct() field name cannot be empty.",
        "INVALID_SYNTAX",
        fToken.line,
        fToken.column,
        fToken.offset,
      );
    }
    advance();

    let filter: any;
    if (current().type === "Punctuator" && current().value === ",") {
      advance(); // consume ','
      const filterToken = current();
      if (filterToken.type !== "Punctuator" || filterToken.value !== "{") {
        throw new MongoParserError(
          "distinct() filter must be an object literal.",
          "INVALID_SYNTAX",
          filterToken.line,
          filterToken.column,
          filterToken.offset,
        );
      }
      filter = parseObjectLiteral(0);
    }

    expect("Punctuator", ")");
    return {
      operation: "distinct",
      payload: {
        field,
        filter,
      },
    };
  }

  function applyModifier(modName: string, modToken: Token, op: MongoMqlOperation): void {
    if (op.operation === "aggregate") {
      if (modName !== "allowDiskUse") {
        throw new MongoParserError(
          `Modifier '.${modName}()' is not supported on aggregate(). Use aggregation pipeline stages ($sort, $limit, $skip, $project).`,
          "UNSUPPORTED_METHOD",
          modToken.line,
          modToken.column,
          modToken.offset,
        );
      }
      const bToken = current();
      if (bToken.type !== "Boolean") {
        throw new MongoParserError(
          "allowDiskUse() requires a boolean argument (true or false).",
          "INVALID_SYNTAX",
          bToken.line,
          bToken.column,
          bToken.offset,
        );
      }
      (op.payload as MongoAggregateOpPayload).allowDiskUse = bToken.value === "true";
      advance();
      return;
    }

    if (op.operation === "countDocuments") {
      if (modName !== "skip" && modName !== "limit") {
        throw new MongoParserError(
          `Modifier '.${modName}()' is not supported on countDocuments().`,
          "UNSUPPORTED_METHOD",
          modToken.line,
          modToken.column,
          modToken.offset,
        );
      }
      const nToken = current();
      const val = parseIntegerLiteral(nToken, modName);
      if (modName === "skip") {
        (op.payload as MongoCountOpPayload).skip = val;
      } else {
        (op.payload as MongoCountOpPayload).limit = val;
      }
      return;
    }

    if (op.operation !== "find") {
      throw new MongoParserError(
        `Modifier '.${modName}()' is not supported on ${op.operation}().`,
        "UNSUPPORTED_METHOD",
        modToken.line,
        modToken.column,
        modToken.offset,
      );
    }

    const payload = op.payload as MongoFindOpPayload;

    if (modName === "sort") {
      const sToken = current();
      if (sToken.type !== "Punctuator" || sToken.value !== "{") {
        throw new MongoParserError(
          "sort() argument must be an object literal e.g. { createdAt: -1 }.",
          "INVALID_SYNTAX",
          sToken.line,
          sToken.column,
          sToken.offset,
        );
      }
      const sortObj = parseObjectLiteral(0);
      payload.sort = validateSortObject(sortObj, sToken);
    } else if (modName === "skip") {
      const nToken = current();
      payload.skip = parseIntegerLiteral(nToken, "skip", 0);
    } else if (modName === "limit") {
      const nToken = current();
      payload.limit = parseIntegerLiteral(nToken, "limit", 1);
    } else if (modName === "project") {
      if (payload.projection !== undefined) {
        throw new MongoParserError(
          "Duplicate projection specified via both find() argument and .project() modifier.",
          "INVALID_SYNTAX",
          modToken.line,
          modToken.column,
          modToken.offset,
        );
      }
      const pToken = current();
      if (pToken.type !== "Punctuator" || pToken.value !== "{") {
        throw new MongoParserError(
          "project() argument must be an object literal e.g. { name: 1 }.",
          "INVALID_SYNTAX",
          pToken.line,
          pToken.column,
          pToken.offset,
        );
      }
      const projObj = parseObjectLiteral(0);
      payload.projection = validateProjectionObject(projObj, pToken);
    } else {
      throw new MongoParserError(
        `Modifier '.${modName}()' is not supported on find().`,
        "UNSUPPORTED_METHOD",
        modToken.line,
        modToken.column,
        modToken.offset,
      );
    }
  }

  function parseIntegerLiteral(token: Token, name: string, min = 0): number {
    if (token.type !== "Number" || !/^[+-]?\d+$/.test(token.value)) {
      throw new MongoParserError(
        `${name}() argument must be an integer (received '${token.value}').`,
        "INVALID_SYNTAX",
        token.line,
        token.column,
        token.offset,
      );
    }
    const val = parseInt(token.value, 10);
    if (isNaN(val) || val < min) {
      throw new MongoParserError(
        `${name}() argument must be >= ${min} (received ${val}).`,
        "INVALID_SYNTAX",
        token.line,
        token.column,
        token.offset,
      );
    }
    advance();
    return val;
  }

  function validateSortObject(obj: Record<string, any>, token: Token): Record<string, 1 | -1> {
    const keys = Object.keys(obj);
    if (keys.length === 0) {
      throw new MongoParserError(
        "sort() object must contain at least one field.",
        "INVALID_SYNTAX",
        token.line,
        token.column,
        token.offset,
      );
    }
    if (keys.length > MAX_SORT_FIELDS) {
      throw new MongoParserError(
        `sort() exceeds maximum allowed sort fields of ${MAX_SORT_FIELDS}.`,
        "INVALID_SYNTAX",
        token.line,
        token.column,
        token.offset,
      );
    }
    const res: Record<string, 1 | -1> = {};
    for (const [k, v] of Object.entries(obj)) {
      if (v === 1 || v === "asc" || v === "ascending") {
        res[k] = 1;
      } else if (v === -1 || v === "desc" || v === "descending") {
        res[k] = -1;
      } else {
        throw new MongoParserError(
          `Invalid sort direction for field '${k}': must be 1 or -1.`,
          "INVALID_SYNTAX",
          token.line,
          token.column,
          token.offset,
        );
      }
    }
    return res;
  }

  function validateProjectionObject(obj: Record<string, any>, token: Token): Record<string, 0 | 1> {
    const keys = Object.keys(obj);
    if (keys.length > MAX_PROJECTION_FIELDS) {
      throw new MongoParserError(
        `projection exceeds maximum allowed fields of ${MAX_PROJECTION_FIELDS}.`,
        "INVALID_SYNTAX",
        token.line,
        token.column,
        token.offset,
      );
    }
    const res: Record<string, 0 | 1> = {};
    for (const [k, v] of Object.entries(obj)) {
      if (v === 1 || v === true) {
        res[k] = 1;
      } else if (v === 0 || v === false) {
        res[k] = 0;
      } else {
        throw new MongoParserError(
          `Invalid projection value for field '${k}': must be 1 (include) or 0 (exclude).`,
          "INVALID_SYNTAX",
          token.line,
          token.column,
          token.offset,
        );
      }
    }
    return res;
  }

  function parseObjectLiteral(depth: number): Record<string, any> {
    if (depth > MAX_NESTING_DEPTH) {
      const t = current();
      throw new MongoParserError(
        `Maximum nesting depth of ${MAX_NESTING_DEPTH} exceeded.`,
        "DEPTH_LIMIT_EXCEEDED",
        t.line,
        t.column,
        t.offset,
      );
    }

    expect("Punctuator", "{");
    const result: Record<string, any> = {};

    while (current().type !== "Punctuator" || current().value !== "}") {
      const keyToken = current();
      let key = "";

      if (keyToken.type === "Identifier" || keyToken.type === "String") {
        key = keyToken.value;
        advance();
      } else {
        throw new MongoParserError(
          `Expected property key in object literal but found '${keyToken.value || keyToken.type}'.`,
          "INVALID_SYNTAX",
          keyToken.line,
          keyToken.column,
          keyToken.offset,
        );
      }

      // Security check: reject prototype-related keys
      if (PROTOTYPE_PROPERTIES.has(key)) {
        throw new MongoParserError(
          `Property key '${key}' is forbidden for security.`,
          "SECURITY_VIOLATION",
          keyToken.line,
          keyToken.column,
          keyToken.offset,
        );
      }

      expect("Punctuator", ":");
      result[key] = parseValue(depth + 1);

      if (current().type === "Punctuator" && current().value === ",") {
        advance(); // consume ','
      } else {
        break;
      }
    }

    expect("Punctuator", "}");
    return result;
  }

  function parseArrayLiteral(depth: number): any[] {
    if (depth > MAX_NESTING_DEPTH) {
      const t = current();
      throw new MongoParserError(
        `Maximum nesting depth of ${MAX_NESTING_DEPTH} exceeded.`,
        "DEPTH_LIMIT_EXCEEDED",
        t.line,
        t.column,
        t.offset,
      );
    }

    expect("Punctuator", "[");
    const list: any[] = [];

    while (current().type !== "Punctuator" || current().value !== "]") {
      list.push(parseValue(depth + 1));

      if (current().type === "Punctuator" && current().value === ",") {
        advance(); // consume ','
      } else {
        break;
      }
    }

    expect("Punctuator", "]");
    return list;
  }

  function parseValue(depth: number): any {
    if (depth > MAX_NESTING_DEPTH) {
      const t = current();
      throw new MongoParserError(
        `Maximum nesting depth of ${MAX_NESTING_DEPTH} exceeded.`,
        "DEPTH_LIMIT_EXCEEDED",
        t.line,
        t.column,
        t.offset,
      );
    }

    const t = current();

    if (t.type === "Punctuator" && t.value === "{") {
      return parseObjectLiteral(depth);
    }

    if (t.type === "Punctuator" && t.value === "[") {
      return parseArrayLiteral(depth);
    }

    if (t.type === "String") {
      return advance().value;
    }

    if (t.type === "Boolean") {
      return advance().value === "true";
    }

    if (t.type === "Null") {
      advance();
      return null;
    }

    if (t.type === "Number") {
      const numTok = advance();
      return numTok.value.includes(".") || numTok.value.toLowerCase().includes("e")
        ? parseFloat(numTok.value)
        : parseInt(numTok.value, 10);
    }

    // Identifiers: BSON Constructors or Date
    if (t.type === "Identifier") {
      const ident = advance().value;

      if (ident === "ObjectId") {
        expect("Punctuator", "(");
        const arg = current();
        if (arg.type !== "String") {
          throw new MongoParserError(
            "ObjectId constructor requires a string argument.",
            "INVALID_BSON_CONSTRUCTOR",
            arg.line,
            arg.column,
            arg.offset,
          );
        }
        const parsed = parseObjectId(arg.value, arg.line, arg.column, arg.offset);
        advance();
        expect("Punctuator", ")");
        return parsed;
      }

      if (ident === "ISODate") {
        expect("Punctuator", "(");
        const arg = current();
        if (arg.type !== "String") {
          throw new MongoParserError(
            "ISODate constructor requires a string argument.",
            "INVALID_BSON_CONSTRUCTOR",
            arg.line,
            arg.column,
            arg.offset,
          );
        }
        const parsed = parseISODate(arg.value, arg.line, arg.column, arg.offset);
        advance();
        expect("Punctuator", ")");
        return parsed;
      }

      if (ident === "NumberLong") {
        expect("Punctuator", "(");
        const arg = current();
        if (arg.type !== "String" && arg.type !== "Number") {
          throw new MongoParserError(
            "NumberLong constructor requires a string or integer argument.",
            "INVALID_BSON_CONSTRUCTOR",
            arg.line,
            arg.column,
            arg.offset,
          );
        }
        const rawStr = arg.type === "String" ? arg.value : arg.raw || arg.value;
        const parsed = parseNumberLong(rawStr, arg.line, arg.column, arg.offset);
        advance();
        expect("Punctuator", ")");
        return parsed;
      }

      if (ident === "NumberDecimal") {
        expect("Punctuator", "(");
        const arg = current();
        if (arg.type !== "String" && arg.type !== "Number") {
          throw new MongoParserError(
            "NumberDecimal constructor requires a string or number argument.",
            "INVALID_BSON_CONSTRUCTOR",
            arg.line,
            arg.column,
            arg.offset,
          );
        }
        const rawStr = arg.type === "String" ? arg.value : arg.raw || arg.value;
        const parsed = parseNumberDecimal(rawStr, arg.line, arg.column, arg.offset);
        advance();
        expect("Punctuator", ")");
        return parsed;
      }

      if (ident === "UUID") {
        expect("Punctuator", "(");
        const arg = current();
        if (arg.type !== "String") {
          throw new MongoParserError(
            "UUID constructor requires a 36-character hyphenated UUID string.",
            "INVALID_BSON_CONSTRUCTOR",
            arg.line,
            arg.column,
            arg.offset,
          );
        }
        const parsed = parseUUID(arg.value, arg.line, arg.column, arg.offset);
        advance();
        expect("Punctuator", ")");
        return parsed;
      }

      if (ident === "new") {
        const nextId = current();
        if (nextId.type !== "Identifier" || nextId.value !== "Date") {
          throw new MongoParserError(
            `Unsupported 'new ${nextId.value}' expression. Only 'new Date(...)' is supported.`,
            "SECURITY_VIOLATION",
            nextId.line,
            nextId.column,
            nextId.offset,
          );
        }
        advance(); // consume 'Date'
        expect("Punctuator", "(");
        let dateVal = "";
        if (current().type === "String") {
          dateVal = advance().value;
        } else if (current().type === "Punctuator" && current().value === ")") {
          dateVal = new Date().toISOString();
        } else {
          const badArg = current();
          throw new MongoParserError(
            "new Date() expects a string timestamp or no arguments.",
            "INVALID_BSON_CONSTRUCTOR",
            badArg.line,
            badArg.column,
            badArg.offset,
          );
        }
        const parsed = parseISODate(dateVal, t.line, t.column, t.offset);
        expect("Punctuator", ")");
        return parsed;
      }

      if (ident === "Function" || ident === "eval") {
        throw new MongoParserError(
          `Execution of '${ident}' is forbidden.`,
          "SECURITY_VIOLATION",
          t.line,
          t.column,
          t.offset,
        );
      }

      throw new MongoParserError(
        `Unsupported identifier or constructor '${ident}'.`,
        "UNSUPPORTED_METHOD",
        t.line,
        t.column,
        t.offset,
      );
    }

    throw new MongoParserError(
      `Unexpected token '${t.value || t.type}'.`,
      "INVALID_SYNTAX",
      t.line,
      t.column,
      t.offset,
    );
  }

  function validateCollectionName(name: string, line: number, col: number, off: number): void {
    if (!name || name.trim().length === 0) {
      throw new MongoParserError(
        "Collection name cannot be empty.",
        "INVALID_COLLECTION_NAME",
        line,
        col,
        off,
      );
    }

    const utf8Length = new TextEncoder().encode(name).length;
    if (utf8Length > 120) {
      throw new MongoParserError(
        `Collection name exceeds maximum of 120 UTF-8 bytes (length: ${utf8Length}).`,
        "INVALID_COLLECTION_NAME",
        line,
        col,
        off,
      );
    }

    if (name.includes("\0")) {
      throw new MongoParserError(
        "Collection name cannot contain null bytes.",
        "INVALID_COLLECTION_NAME",
        line,
        col,
        off,
      );
    }

    if (name.includes("$")) {
      throw new MongoParserError(
        "Collection name cannot contain '$'.",
        "INVALID_COLLECTION_NAME",
        line,
        col,
        off,
      );
    }

    if (name.startsWith("system.")) {
      throw new MongoParserError(
        "Access to 'system.' internal collections is forbidden.",
        "INVALID_COLLECTION_NAME",
        line,
        col,
        off,
      );
    }
  }
}
