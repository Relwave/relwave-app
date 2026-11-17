/**
 * MongoDB Milestone 7 Phase 4 — Streaming Incremental Chunked Import Reader
 *
 * Implements bounded slice reading via TextDecoder({ stream: true }),
 * UTF-8 byte offset tracking, independent document parsing, prototype pollution defense,
 * zero-document detection, and Option A chunk generation (up to 1,000 docs / 2 MB target / 4 MB limit).
 *
 * Adheres to docs/M7_PHASE4_SPEC.md §4.1, §4.2, and §4.3.
 */

import type { MongoBulkDocument, MongoBulkFormat, MongoBulkValue } from "../types/bulk";
import {
  MAX_IMPORT_CHUNK_DOCS,
  TARGET_IMPORT_CHUNK_BYTES,
  MAX_IMPORT_CHUNK_BYTES,
  MAX_IMPORT_TOTAL_SIZE_BYTES,
  ImportLimitExceededError,
  ImportSerializationError,
  ZeroDocumentImportError,
} from "./payloadAccounting";

export interface ImportChunk {
  chunkIndex: number;
  isLastChunk: boolean;
  payload: string;
  documents: MongoBulkDocument[];
  byteLength: number;
  documentCount: number;
}

export interface ChunkReaderOptions {
  sliceSize?: number; // Default: 256 KB (262,144 bytes)
  signal?: AbortSignal;
}

export interface ParserPosition {
  utf8ByteOffset: number;
  lineNumber: number;
  columnNumber: number;
}

/**
 * Validates that an object or any nested property does not contain prototype pollution keys.
 */
export function assertNoPrototypePollution(value: unknown): void {
  if (value === null || typeof value !== "object") {
    return;
  }
  if (Array.isArray(value)) {
    for (let i = 0; i < value.length; i++) {
      assertNoPrototypePollution(value[i]);
    }
    return;
  }
  const obj = value as Record<string, unknown>;
  for (const key of Object.getOwnPropertyNames(obj)) {
    if (key === "__proto__" || key === "constructor" || key === "prototype") {
      throw new Error(
        `SECURITY_VIOLATION: Prototype pollution attempt detected with property '${key}'`,
      );
    }
    assertNoPrototypePollution(obj[key]);
  }
}

/**
 * Format helper for syntax errors with diagnostic coordinates.
 */
function formatSyntaxError(message: string, pos: ParserPosition): Error {
  return new Error(
    `${message} at line ${pos.lineNumber}, col ${pos.columnNumber} (UTF-8 byte offset ${pos.utf8ByteOffset})`,
  );
}

// ===========================================================================
// JSON Array Incremental Streaming Parser
// ===========================================================================

export async function* parseJsonArrayStream(
  file: File,
  options?: ChunkReaderOptions,
): AsyncGenerator<MongoBulkDocument, void, unknown> {
  const sliceSize = options?.sliceSize ?? 256 * 1024;
  const signal = options?.signal;
  const decoder = new TextDecoder("utf-8");
  const encoder = new TextEncoder();

  let fileOffset = 0;
  const fileSize = file.size;

  if (fileSize === 0) {
    throw new ZeroDocumentImportError(
      "Selected file is empty (0 bytes). Import requires at least one document.",
    );
  }

  type ParserState =
    | "BEFORE_ROOT_ARRAY"
    | "INSIDE_ROOT_ARRAY"
    | "INSIDE_DOCUMENT"
    | "AFTER_DOCUMENT"
    | "AFTER_COMMA"
    | "AFTER_ROOT_ARRAY";

  let state: ParserState = "BEFORE_ROOT_ARRAY";
  let braceDepth = 0;
  let inString = false;
  let escapeNext = false;
  let currentDocStr = "";
  let docCount = 0;

  let lineNumber = 1;
  let columnNumber = 1;
  let utf8ByteOffset = 0;
  let lastWasCr = false;

  const currentPos = (): ParserPosition => ({
    utf8ByteOffset,
    lineNumber,
    columnNumber,
  });

  while (fileOffset < fileSize) {
    if (signal?.aborted) {
      throw new DOMException("The operation was aborted", "AbortError");
    }

    const nextEnd = Math.min(fileOffset + sliceSize, fileSize);
    const sliceBlob = file.slice(fileOffset, nextEnd);
    fileOffset = nextEnd;

    const arrayBuffer = await sliceBlob.arrayBuffer();
    const chunkText = decoder.decode(new Uint8Array(arrayBuffer), {
      stream: fileOffset < fileSize,
    });

    for (let i = 0; i < chunkText.length; i++) {
      const char = chunkText[i];
      const charBytes = encoder.encode(char).length;

      // Newline tracking (handling CRLF without double-counting)
      if (char === "\r") {
        lastWasCr = true;
        lineNumber++;
        columnNumber = 1;
      } else if (char === "\n") {
        if (!lastWasCr) {
          lineNumber++;
          columnNumber = 1;
        }
        lastWasCr = false;
      } else {
        lastWasCr = false;
        columnNumber++;
      }

      const isWhitespace = char === " " || char === "\t" || char === "\n" || char === "\r";

      switch (state) {
        case "BEFORE_ROOT_ARRAY": {
          if (isWhitespace) break;
          if (char === "[") {
            state = "INSIDE_ROOT_ARRAY";
          } else {
            throw formatSyntaxError("Invalid JSON array: Expected '['", currentPos());
          }
          break;
        }

        case "INSIDE_ROOT_ARRAY": {
          if (isWhitespace) break;
          if (char === "]") {
            if (docCount === 0) {
              throw new ZeroDocumentImportError(
                "JSON array contains no documents ([]). Import requires at least one document.",
              );
            }
            state = "AFTER_ROOT_ARRAY";
          } else if (char === "{") {
            state = "INSIDE_DOCUMENT";
            braceDepth = 1;
            inString = false;
            escapeNext = false;
            currentDocStr = "{";
          } else {
            throw formatSyntaxError(
              "Root array must contain only JSON objects; encountered primitive or array",
              currentPos(),
            );
          }
          break;
        }

        case "INSIDE_DOCUMENT": {
          currentDocStr += char;

          if (inString) {
            if (escapeNext) {
              escapeNext = false;
            } else if (char === "\\") {
              escapeNext = true;
            } else if (char === '"') {
              inString = false;
            }
          } else {
            if (char === '"') {
              inString = true;
            } else if (char === "{") {
              braceDepth++;
            } else if (char === "}") {
              braceDepth--;
              if (braceDepth === 0) {
                // Document complete
                let parsedDoc: unknown;
                try {
                  parsedDoc = JSON.parse(currentDocStr);
                } catch (err: unknown) {
                  const msg = err instanceof Error ? err.message : String(err);
                  throw formatSyntaxError(`Invalid JSON document syntax: ${msg}`, currentPos());
                }

                if (
                  typeof parsedDoc !== "object" ||
                  parsedDoc === null ||
                  Array.isArray(parsedDoc)
                ) {
                  throw formatSyntaxError(
                    "Root array must contain only JSON objects; encountered primitive or array",
                    currentPos(),
                  );
                }

                assertNoPrototypePollution(parsedDoc);
                docCount++;
                yield parsedDoc as MongoBulkDocument;
                currentDocStr = "";
                state = "AFTER_DOCUMENT";
              }
            }
          }
          break;
        }

        case "AFTER_DOCUMENT": {
          if (isWhitespace) break;
          if (char === ",") {
            state = "AFTER_COMMA";
          } else if (char === "]") {
            state = "AFTER_ROOT_ARRAY";
          } else {
            throw formatSyntaxError(
              "Syntax error: Missing comma separator between array elements",
              currentPos(),
            );
          }
          break;
        }

        case "AFTER_COMMA": {
          if (isWhitespace) break;
          if (char === "]") {
            throw formatSyntaxError(
              "Syntax error: Trailing comma before ']' is not permitted in standard JSON",
              currentPos(),
            );
          } else if (char === "{") {
            state = "INSIDE_DOCUMENT";
            braceDepth = 1;
            inString = false;
            escapeNext = false;
            currentDocStr = "{";
          } else {
            throw formatSyntaxError(
              "Root array must contain only JSON objects; encountered primitive or array",
              currentPos(),
            );
          }
          break;
        }

        case "AFTER_ROOT_ARRAY": {
          if (isWhitespace) break;
          throw formatSyntaxError(
            "Syntax error: Unexpected non-whitespace content after root array closure",
            currentPos(),
          );
        }
      }

      utf8ByteOffset += charBytes;
    }
  }

  // Flush decoder at EOF
  const trailingText = decoder.decode();
  if (trailingText.trim().length > 0 && state === "AFTER_ROOT_ARRAY") {
    throw formatSyntaxError(
      "Syntax error: Unexpected non-whitespace content after root array closure",
      currentPos(),
    );
  }

  if (state !== "AFTER_ROOT_ARRAY") {
    throw formatSyntaxError("Unexpected end of input", currentPos());
  }
}

// ===========================================================================
// NDJSON Streaming Parser
// ===========================================================================

export async function* parseNdjsonStream(
  file: File,
  options?: ChunkReaderOptions,
): AsyncGenerator<MongoBulkDocument, void, unknown> {
  const sliceSize = options?.sliceSize ?? 256 * 1024;
  const signal = options?.signal;
  const decoder = new TextDecoder("utf-8");

  let fileOffset = 0;
  const fileSize = file.size;

  if (fileSize === 0) {
    throw new ZeroDocumentImportError(
      "Selected file is empty (0 bytes). Import requires at least one document.",
    );
  }

  let lineRemainder = "";
  let lineNumber = 0;
  let docCount = 0;

  while (fileOffset < fileSize) {
    if (signal?.aborted) {
      throw new DOMException("The operation was aborted", "AbortError");
    }

    const nextEnd = Math.min(fileOffset + sliceSize, fileSize);
    const sliceBlob = file.slice(fileOffset, nextEnd);
    fileOffset = nextEnd;

    const arrayBuffer = await sliceBlob.arrayBuffer();
    const chunkText = decoder.decode(new Uint8Array(arrayBuffer), {
      stream: fileOffset < fileSize,
    });

    const combined = lineRemainder + chunkText;
    const lines = combined.split(/\r?\n/);
    lineRemainder = lines.pop() ?? "";

    for (const rawLine of lines) {
      lineNumber++;
      const trimmed = rawLine.trim();
      if (trimmed.length === 0) continue;

      let doc: unknown;
      try {
        doc = JSON.parse(trimmed);
      } catch (err: unknown) {
        const msg = err instanceof Error ? err.message : String(err);
        throw new Error(`Invalid NDJSON at line ${lineNumber}: ${msg}`);
      }

      if (typeof doc !== "object" || doc === null || Array.isArray(doc)) {
        throw new Error(`NDJSON line ${lineNumber} must be a JSON object`);
      }

      assertNoPrototypePollution(doc);
      docCount++;
      yield doc as MongoBulkDocument;
    }
  }

  // Process trailing line remainder at EOF
  if (lineRemainder.trim().length > 0) {
    lineNumber++;
    let doc: unknown;
    try {
      doc = JSON.parse(lineRemainder.trim());
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      throw new Error(`Invalid NDJSON at line ${lineNumber}: ${msg}`);
    }

    if (typeof doc !== "object" || doc === null || Array.isArray(doc)) {
      throw new Error(`NDJSON line ${lineNumber} must be a JSON object`);
    }

    assertNoPrototypePollution(doc);
    docCount++;
    yield doc as MongoBulkDocument;
  }

  if (docCount === 0) {
    throw new ZeroDocumentImportError("NDJSON file contains no valid document lines.");
  }
}

// ===========================================================================
// CSV Streaming Parser (RFC 4180 with Dotted Key Un-flattening & Coercion)
// ===========================================================================

export function coerceCsvValue(raw: string): MongoBulkValue {
  const trimmed = raw.trim();
  if (trimmed === "") {
    return "";
  }
  if (trimmed.toLowerCase() === "null") {
    return null;
  }
  if (trimmed.toLowerCase() === "true") {
    return true;
  }
  if (trimmed.toLowerCase() === "false") {
    return false;
  }
  if (/^-?\d+(\.\d+)?$/.test(trimmed)) {
    const num = Number(trimmed);
    if (Number.isFinite(num)) {
      return num;
    }
  }
  if (
    (trimmed.startsWith("{") && trimmed.endsWith("}")) ||
    (trimmed.startsWith("[") && trimmed.endsWith("]"))
  ) {
    try {
      const parsed: unknown = JSON.parse(trimmed);
      assertNoPrototypePollution(parsed);
      return parsed as MongoBulkValue;
    } catch {
      // Retain as raw string on syntax failure
    }
  }
  return raw;
}

export function setDottedPath(
  target: MongoBulkDocument,
  pathStr: string,
  value: MongoBulkValue,
): void {
  const parts = pathStr.split(".");
  let cur: MongoBulkDocument = target;

  for (let i = 0; i < parts.length - 1; i++) {
    const part = parts[i];
    if (part === "__proto__" || part === "constructor" || part === "prototype") {
      throw new Error(`SECURITY_VIOLATION: Prototype pollution attempt with key '${part}'`);
    }
    const existing = cur[part];
    if (
      existing === undefined ||
      existing === null ||
      typeof existing !== "object" ||
      Array.isArray(existing)
    ) {
      if (existing !== undefined && existing !== null && typeof existing !== "object") {
        throw new Error(
          `Path collision in CSV headers: cannot nest into scalar at path '${parts.slice(0, i + 1).join(".")}'`,
        );
      }
      const newChild: MongoBulkDocument = {};
      cur[part] = newChild;
      cur = newChild;
    } else {
      cur = existing as MongoBulkDocument;
    }
  }

  const last = parts[parts.length - 1];
  if (last === "__proto__" || last === "constructor" || last === "prototype") {
    throw new Error(`SECURITY_VIOLATION: Prototype pollution attempt with key '${last}'`);
  }
  if (cur[last] !== undefined && typeof cur[last] === "object" && cur[last] !== null) {
    throw new Error(
      `Path collision in CSV headers: cannot overwrite object with value at path '${pathStr}'`,
    );
  }
  cur[last] = value;
}

function escapeCsvField(val: string): string {
  if (val.includes(",") || val.includes('"') || val.includes("\n") || val.includes("\r")) {
    return `"${val.replace(/"/g, '""')}"`;
  }
  return val;
}

export async function* parseCsvStream(
  file: File,
  options?: ChunkReaderOptions,
): AsyncGenerator<{ doc: MongoBulkDocument; rawRow: string; headers: string[] }, void, unknown> {
  const sliceSize = options?.sliceSize ?? 256 * 1024;
  const signal = options?.signal;
  const decoder = new TextDecoder("utf-8");

  let fileOffset = 0;
  const fileSize = file.size;

  if (fileSize === 0) {
    throw new ZeroDocumentImportError(
      "Selected file is empty (0 bytes). Import requires at least one document.",
    );
  }

  let textBuffer = "";
  let fieldState: "start" | "unquoted" | "quoted" | "closed" = "start";
  let currentField = "";
  let currentRow: string[] = [];
  let headers: string[] | null = null;
  let dataRowCount = 0;
  let currentLine = 1;
  let currentCol = 0;

  while (fileOffset < fileSize || textBuffer.length > 0) {
    if (signal?.aborted) {
      throw new DOMException("The operation was aborted", "AbortError");
    }

    if (fileOffset < fileSize) {
      const nextEnd = Math.min(fileOffset + sliceSize, fileSize);
      const sliceBlob = file.slice(fileOffset, nextEnd);
      fileOffset = nextEnd;

      const arrayBuffer = await sliceBlob.arrayBuffer();
      const chunkText = decoder.decode(new Uint8Array(arrayBuffer), {
        stream: fileOffset < fileSize,
      });
      textBuffer += chunkText;
    }

    const isEof = fileOffset >= fileSize;
    let i = 0;
    let shouldReadMore = false;

    while (i < textBuffer.length) {
      const char = textBuffer[i];
      const nextChar = i + 1 < textBuffer.length ? textBuffer[i + 1] : "";

      // Cross-slice lookahead checks when more slices exist:
      if (!isEof) {
        // 1. CRLF split across slice: buffer ends with '\r'
        if (char === "\r" && i + 1 >= textBuffer.length) {
          shouldReadMore = true;
          break;
        }
        // 2. Quote inside quoted field at end of buffer (might be escaped "" or closing ")
        if (fieldState === "quoted" && char === '"' && i + 1 >= textBuffer.length) {
          shouldReadMore = true;
          break;
        }
      }

      currentCol++;

      if (fieldState === "start") {
        if (char === '"') {
          fieldState = "quoted";
          i++;
        } else if (char === ",") {
          currentRow.push("");
          currentField = "";
          fieldState = "start";
          i++;
        } else if (char === "\r") {
          if (nextChar === "\n") {
            i++;
          }
          currentRow.push("");
          currentField = "";
          fieldState = "start";
          currentLine++;
          currentCol = 0;
          i++;
          const rowToEmit = currentRow;
          currentRow = [];
          if (!headers) {
            headers = processCsvHeaders(rowToEmit);
          } else {
            dataRowCount++;
            if (rowToEmit.length !== headers.length) {
              throw new Error(
                `CSV syntax error: Row ${dataRowCount} has ${rowToEmit.length} fields, expected ${headers.length}`,
              );
            }
            const doc = rowToDocument(headers, rowToEmit);
            const rawRow = rowToEmit.map(escapeCsvField).join(",");
            yield { doc, rawRow, headers };
          }
        } else if (char === "\n") {
          currentRow.push("");
          currentField = "";
          fieldState = "start";
          currentLine++;
          currentCol = 0;
          i++;
          const rowToEmit = currentRow;
          currentRow = [];
          if (!headers) {
            headers = processCsvHeaders(rowToEmit);
          } else {
            dataRowCount++;
            if (rowToEmit.length !== headers.length) {
              throw new Error(
                `CSV syntax error: Row ${dataRowCount} has ${rowToEmit.length} fields, expected ${headers.length}`,
              );
            }
            const doc = rowToDocument(headers, rowToEmit);
            const rawRow = rowToEmit.map(escapeCsvField).join(",");
            yield { doc, rawRow, headers };
          }
        } else {
          fieldState = "unquoted";
          currentField += char;
          i++;
        }
      } else if (fieldState === "unquoted") {
        if (char === '"') {
          throw new Error(
            `CSV syntax error: Unexpected quote at line ${currentLine}, column ${currentCol}. Quotes inside unquoted fields are forbidden by RFC 4180.`,
          );
        } else if (char === ",") {
          currentRow.push(currentField);
          currentField = "";
          fieldState = "start";
          i++;
        } else if (char === "\r") {
          if (nextChar === "\n") {
            i++;
          }
          currentRow.push(currentField);
          currentField = "";
          fieldState = "start";
          currentLine++;
          currentCol = 0;
          i++;
          const rowToEmit = currentRow;
          currentRow = [];
          if (!headers) {
            headers = processCsvHeaders(rowToEmit);
          } else {
            dataRowCount++;
            if (rowToEmit.length !== headers.length) {
              throw new Error(
                `CSV syntax error: Row ${dataRowCount} has ${rowToEmit.length} fields, expected ${headers.length}`,
              );
            }
            const doc = rowToDocument(headers, rowToEmit);
            const rawRow = rowToEmit.map(escapeCsvField).join(",");
            yield { doc, rawRow, headers };
          }
        } else if (char === "\n") {
          currentRow.push(currentField);
          currentField = "";
          fieldState = "start";
          currentLine++;
          currentCol = 0;
          i++;
          const rowToEmit = currentRow;
          currentRow = [];
          if (!headers) {
            headers = processCsvHeaders(rowToEmit);
          } else {
            dataRowCount++;
            if (rowToEmit.length !== headers.length) {
              throw new Error(
                `CSV syntax error: Row ${dataRowCount} has ${rowToEmit.length} fields, expected ${headers.length}`,
              );
            }
            const doc = rowToDocument(headers, rowToEmit);
            const rawRow = rowToEmit.map(escapeCsvField).join(",");
            yield { doc, rawRow, headers };
          }
        } else {
          currentField += char;
          i++;
        }
      } else if (fieldState === "quoted") {
        if (char === '"') {
          if (nextChar === '"') {
            currentField += '"';
            i += 2;
            currentCol++;
          } else {
            fieldState = "closed";
            i++;
          }
        } else if (char === "\r") {
          if (nextChar === "\n") {
            i++;
          }
          currentField += "\n";
          currentLine++;
          currentCol = 0;
          i++;
        } else if (char === "\n") {
          currentField += "\n";
          currentLine++;
          currentCol = 0;
          i++;
        } else {
          currentField += char;
          i++;
        }
      } else if (fieldState === "closed") {
        if (char === " " || char === "\t") {
          // optional whitespace after closing quote
          i++;
        } else if (char === ",") {
          currentRow.push(currentField);
          currentField = "";
          fieldState = "start";
          i++;
        } else if (char === "\r") {
          if (nextChar === "\n") {
            i++;
          }
          currentRow.push(currentField);
          currentField = "";
          fieldState = "start";
          currentLine++;
          currentCol = 0;
          i++;
          const rowToEmit = currentRow;
          currentRow = [];
          if (!headers) {
            headers = processCsvHeaders(rowToEmit);
          } else {
            dataRowCount++;
            if (rowToEmit.length !== headers.length) {
              throw new Error(
                `CSV syntax error: Row ${dataRowCount} has ${rowToEmit.length} fields, expected ${headers.length}`,
              );
            }
            const doc = rowToDocument(headers, rowToEmit);
            const rawRow = rowToEmit.map(escapeCsvField).join(",");
            yield { doc, rawRow, headers };
          }
        } else if (char === "\n") {
          currentRow.push(currentField);
          currentField = "";
          fieldState = "start";
          currentLine++;
          currentCol = 0;
          i++;
          const rowToEmit = currentRow;
          currentRow = [];
          if (!headers) {
            headers = processCsvHeaders(rowToEmit);
          } else {
            dataRowCount++;
            if (rowToEmit.length !== headers.length) {
              throw new Error(
                `CSV syntax error: Row ${dataRowCount} has ${rowToEmit.length} fields, expected ${headers.length}`,
              );
            }
            const doc = rowToDocument(headers, rowToEmit);
            const rawRow = rowToEmit.map(escapeCsvField).join(",");
            yield { doc, rawRow, headers };
          }
        } else {
          throw new Error(
            `CSV syntax error: Unexpected character '${char}' after closing quote at line ${currentLine}, column ${currentCol}`,
          );
        }
      }
    }

    if (shouldReadMore) {
      textBuffer = textBuffer.slice(i);
    } else {
      textBuffer = "";
    }
  }

  // EOF handling
  if (fieldState === "quoted") {
    throw new Error("CSV syntax error: unclosed quote at end of file");
  }

  if (fieldState === "unquoted" || fieldState === "closed") {
    currentRow.push(currentField);
  } else if (fieldState === "start" && currentRow.length > 0) {
    currentRow.push("");
  }

  if (currentRow.length > 0) {
    const rowToEmit = currentRow;
    currentRow = [];
    if (!headers) {
      headers = processCsvHeaders(rowToEmit);
    } else {
      dataRowCount++;
      if (rowToEmit.length !== headers.length) {
        throw new Error(
          `CSV syntax error: Row ${dataRowCount} has ${rowToEmit.length} fields, expected ${headers.length}`,
        );
      }
      const doc = rowToDocument(headers, rowToEmit);
      const rawRow = rowToEmit.map(escapeCsvField).join(",");
      yield { doc, rawRow, headers };
    }
  }

  if (!headers || dataRowCount === 0) {
    throw new ZeroDocumentImportError("CSV file contains a header row but zero data rows.");
  }
}

function processCsvHeaders(row: string[]): string[] {
  const headers = row.map((h) => h.trim());
  if (headers.length === 0 || (headers.length === 1 && headers[0] === "")) {
    throw new ZeroDocumentImportError("CSV file is empty or missing headers.");
  }

  const seen = new Set<string>();
  for (const h of headers) {
    if (!h) {
      throw new Error("CSV contains empty column header");
    }
    if (seen.has(h)) {
      throw new Error(`CSV contains duplicate column header: ${h}`);
    }
    seen.add(h);

    if (h.includes("__proto__") || h.includes("constructor") || h.includes("prototype")) {
      throw new Error(
        `SECURITY_VIOLATION: Prototype pollution attempt detected in CSV header: ${h}`,
      );
    }
  }
  return headers;
}

function rowToDocument(headers: string[], row: string[]): MongoBulkDocument {
  const doc: MongoBulkDocument = {};
  for (let c = 0; c < headers.length; c++) {
    const rawVal = c < row.length ? row[c] : "";
    const coerced = coerceCsvValue(rawVal);
    setDottedPath(doc, headers[c], coerced);
  }
  assertNoPrototypePollution(doc);
  return doc;
}

// ===========================================================================
// Preview Helper
// ===========================================================================

interface CsvParsedRow {
  doc: MongoBulkDocument;
  rawRow: string;
  headers: string[];
}

type RawParsedItem = MongoBulkDocument | CsvParsedRow;

function isCsvItem(item: RawParsedItem): item is CsvParsedRow {
  return "rawRow" in item && "headers" in item && "doc" in item;
}

/**
 * Reads up to maxDocs documents for non-blocking UI preview.
 */
export async function previewImportFile(
  file: File,
  format: MongoBulkFormat,
  maxDocs = 5,
): Promise<MongoBulkDocument[]> {
  const docs: MongoBulkDocument[] = [];
  let reader: AsyncGenerator<RawParsedItem, void, unknown>;

  if (format === "json") {
    reader = parseJsonArrayStream(file, { sliceSize: 64 * 1024 });
  } else if (format === "ndjson") {
    reader = parseNdjsonStream(file, { sliceSize: 64 * 1024 });
  } else {
    reader = parseCsvStream(file, { sliceSize: 64 * 1024 });
  }

  for await (const item of reader) {
    if (isCsvItem(item)) {
      docs.push(item.doc);
    } else {
      docs.push(item);
    }
    if (docs.length >= maxDocs) {
      break;
    }
  }
  return docs;
}

// ===========================================================================
// Incremental Chunk Generator
// ===========================================================================

/**
 * Creates sequential chunks respecting:
 * - Up to 1,000 documents per chunk (MAX_IMPORT_CHUNK_DOCS)
 * - Target 2 MB serialized payload per chunk (TARGET_IMPORT_CHUNK_BYTES)
 * - Hard limit 4 MB per chunk (MAX_IMPORT_CHUNK_BYTES)
 * - Cumulative 16 MB session limit pre-send check (MAX_IMPORT_TOTAL_SIZE_BYTES)
 * - Deterministic single serialization
 * - Re-injected header row for CSV chunks
 */
export async function* createIncrementalChunkReader(
  file: File,
  format: MongoBulkFormat,
  options?: ChunkReaderOptions,
): AsyncGenerator<ImportChunk, void, unknown> {
  const signal = options?.signal;
  const encoder = new TextEncoder();

  interface AccumulatedChunk {
    documents: MongoBulkDocument[];
    rawCsvRows?: string[];
    headerRow?: string;
  }

  let pending: AccumulatedChunk = { documents: [] };
  let pendingSerializedPayload = "";
  let pendingByteLength = 0;
  let chunkIndex = 0;
  let cumulativeBytesSent = 0;

  function buildPayload(acc: AccumulatedChunk): { payload: string; byteLength: number } {
    if (format === "json") {
      let serialized: string;
      try {
        serialized = JSON.stringify(acc.documents);
      } catch (err: unknown) {
        const msg = err instanceof Error ? err.message : String(err);
        throw new ImportSerializationError(`Failed to serialize chunk documents: ${msg}`);
      }
      return { payload: serialized, byteLength: encoder.encode(serialized).length };
    } else if (format === "ndjson") {
      let serialized: string;
      try {
        serialized = acc.documents.map((d) => JSON.stringify(d)).join("\n");
      } catch (err: unknown) {
        const msg = err instanceof Error ? err.message : String(err);
        throw new ImportSerializationError(`Failed to serialize chunk documents: ${msg}`);
      }
      return { payload: serialized, byteLength: encoder.encode(serialized).length };
    } else {
      // CSV: prepend header row to each chunk so the bridge can parse column headers
      const csvLines = [acc.headerRow ?? "", ...(acc.rawCsvRows ?? [])];
      const serialized = csvLines.join("\n");
      return { payload: serialized, byteLength: encoder.encode(serialized).length };
    }
  }

  // Iterate over raw documents from corresponding parser
  let rawStream: AsyncGenerator<RawParsedItem, void, unknown>;
  if (format === "json") {
    rawStream = parseJsonArrayStream(file, options);
  } else if (format === "ndjson") {
    rawStream = parseNdjsonStream(file, options);
  } else {
    rawStream = parseCsvStream(file, options);
  }

  let csvHeaders: string[] | null = null;

  for await (const item of rawStream) {
    if (signal?.aborted) {
      throw new DOMException("The operation was aborted", "AbortError");
    }

    let doc: MongoBulkDocument;
    let rawCsvRow: string | undefined;

    if (isCsvItem(item)) {
      doc = item.doc;
      rawCsvRow = item.rawRow;
      if (!csvHeaders) {
        csvHeaders = item.headers;
      }
    } else {
      doc = item;
    }

    // Verify single document does not exceed 4 MB
    let singleDocSize = 0;
    try {
      singleDocSize = encoder.encode(JSON.stringify(doc)).length;
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      throw new ImportSerializationError(`Failed to serialize document: ${msg}`);
    }

    if (singleDocSize > MAX_IMPORT_CHUNK_BYTES) {
      throw new ImportLimitExceededError(
        `Single document size (${singleDocSize} bytes) exceeds the maximum 4 MB chunk limit.`,
      );
    }

    // Speculatively check if adding this document would exceed 1,000 docs or 2 MB target
    const currentDocCount = pending.documents.length;
    const testDocList = [...pending.documents, doc];
    const testChunk: AccumulatedChunk = {
      documents: testDocList,
      headerRow: csvHeaders ? csvHeaders.map(escapeCsvField).join(",") : undefined,
      rawCsvRows: format === "csv" ? [...(pending.rawCsvRows ?? []), rawCsvRow!] : undefined,
    };
    const { byteLength: testByteLength } = buildPayload(testChunk);

    // If pending has at least 1 document and adding this doc breaches either boundary:
    if (
      currentDocCount > 0 &&
      (currentDocCount >= MAX_IMPORT_CHUNK_DOCS || testByteLength > TARGET_IMPORT_CHUNK_BYTES)
    ) {
      // Chunk ready to yield! (We know isLastChunk is FALSE because another doc is pending)
      if (pendingByteLength > MAX_IMPORT_CHUNK_BYTES) {
        throw new ImportLimitExceededError(
          `Chunk payload size (${pendingByteLength} bytes) exceeds the 4 MB limit.`,
        );
      }

      if (cumulativeBytesSent + pendingByteLength > MAX_IMPORT_TOTAL_SIZE_BYTES) {
        throw new ImportLimitExceededError(
          `Import halted: next chunk would exceed the cumulative 16 MB session limit ` +
            `(${cumulativeBytesSent} bytes sent + ${pendingByteLength} bytes pending > 16 MB).`,
        );
      }

      yield {
        chunkIndex,
        isLastChunk: false,
        payload: pendingSerializedPayload,
        documents: pending.documents,
        byteLength: pendingByteLength,
        documentCount: pending.documents.length,
      };

      cumulativeBytesSent += pendingByteLength;
      chunkIndex++;

      // Reset pending with current doc
      pending = {
        documents: [doc],
        headerRow: csvHeaders ? csvHeaders.map(escapeCsvField).join(",") : undefined,
        rawCsvRows: format === "csv" ? [rawCsvRow!] : undefined,
      };
      const built = buildPayload(pending);
      pendingSerializedPayload = built.payload;
      pendingByteLength = built.byteLength;
    } else {
      // Add to pending
      pending.documents.push(doc);
      if (format === "csv") {
        pending.rawCsvRows = pending.rawCsvRows
          ? [...pending.rawCsvRows, rawCsvRow!]
          : [rawCsvRow!];
        pending.headerRow = csvHeaders ? csvHeaders.map(escapeCsvField).join(",") : undefined;
      }
      pendingSerializedPayload = testChunk ? buildPayload(pending).payload : "";
      pendingByteLength = testByteLength;
    }
  }

  // Flush final pending chunk with isLastChunk = true
  if (pending.documents.length > 0) {
    const { payload, byteLength } = buildPayload(pending);

    if (byteLength > MAX_IMPORT_CHUNK_BYTES) {
      throw new ImportLimitExceededError(
        `Chunk payload size (${byteLength} bytes) exceeds the 4 MB limit.`,
      );
    }

    if (cumulativeBytesSent + byteLength > MAX_IMPORT_TOTAL_SIZE_BYTES) {
      throw new ImportLimitExceededError(
        `Import halted: next chunk would exceed the cumulative 16 MB session limit ` +
          `(${cumulativeBytesSent} bytes sent + ${byteLength} bytes pending > 16 MB).`,
      );
    }

    yield {
      chunkIndex,
      isLastChunk: true,
      payload,
      documents: pending.documents,
      byteLength,
      documentCount: pending.documents.length,
    };
  }
}
