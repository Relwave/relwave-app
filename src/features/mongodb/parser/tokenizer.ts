import { Token, TokenType } from "./types";
import { MongoParserError } from "./errors";

const PUNCTUATORS = new Set([
  ".",
  "(",
  ")",
  "[",
  "]",
  "{",
  "}",
  ":",
  ",",
  ";",
  "=",
  "<",
  ">",
  "+",
  "-",
  "*",
  "/",
  "!",
]);

export function tokenize(source: string): Token[] {
  const tokens: Token[] = [];
  let index = 0;
  let line = 1;
  let column = 1;

  function peek(offset = 0): string {
    return source[index + offset] ?? "";
  }

  function advance(): string {
    const ch = source[index++];
    if (ch === "\n") {
      line++;
      column = 1;
    } else {
      column++;
    }
    return ch;
  }

  while (index < source.length) {
    const ch = peek();

    // Skip whitespace
    if (/\s/.test(ch)) {
      advance();
      continue;
    }

    // Skip single-line comments // ...
    if (ch === "/" && peek(1) === "/") {
      advance();
      advance();
      while (index < source.length && peek() !== "\n") {
        advance();
      }
      continue;
    }

    // Skip multi-line comments /* ... */
    if (ch === "/" && peek(1) === "*") {
      const startLine = line;
      const startCol = column;
      const startOffset = index;
      advance();
      advance();
      let closed = false;
      while (index < source.length) {
        if (peek() === "*" && peek(1) === "/") {
          advance();
          advance();
          closed = true;
          break;
        }
        advance();
      }
      if (!closed) {
        throw new MongoParserError(
          "Unterminated multi-line comment.",
          "INVALID_SYNTAX",
          startLine,
          startCol,
          startOffset
        );
      }
      continue;
    }

    const startLine = line;
    const startCol = column;
    const startOffset = index;

    // Check for arrow function `=>`
    if (ch === "=" && peek(1) === ">") {
      advance();
      advance();
      throw new MongoParserError(
        "Arrow functions and arbitrary JavaScript expressions are not supported.",
        "SECURITY_VIOLATION",
        startLine,
        startCol,
        startOffset
      );
    }

    // Strings: single quotes, double quotes, backticks
    if (ch === '"' || ch === "'" || ch === "`") {
      const quote = advance();
      let strVal = "";
      let closed = false;

      while (index < source.length) {
        const curr = peek();
        if (curr === quote) {
          advance();
          closed = true;
          break;
        }
        if (curr === "\\") {
          advance(); // skip escape backslash
          if (index >= source.length) break;
          const escaped = advance();
          switch (escaped) {
            case "n":
              strVal += "\n";
              break;
            case "r":
              strVal += "\r";
              break;
            case "t":
              strVal += "\t";
              break;
            case "b":
              strVal += "\b";
              break;
            case "f":
              strVal += "\f";
              break;
            case "0":
              strVal += "\0";
              break;
            case "\\":
              strVal += "\\";
              break;
            case '"':
              strVal += '"';
              break;
            case "'":
              strVal += "'";
              break;
            case "`":
              strVal += "`";
              break;
            case "u": {
              const hex = source.substring(index, index + 4);
              if (/^[0-9a-fA-F]{4}$/.test(hex)) {
                strVal += String.fromCharCode(parseInt(hex, 16));
                for (let k = 0; k < 4; k++) advance();
              } else {
                strVal += "\\u";
              }
              break;
            }
            default:
              strVal += escaped;
          }
        } else {
          strVal += advance();
        }
      }

      if (!closed) {
        throw new MongoParserError(
          "Unterminated string literal.",
          "INVALID_SYNTAX",
          startLine,
          startCol,
          startOffset
        );
      }

      tokens.push({
        type: "String",
        value: strVal,
        raw: source.substring(startOffset, index),
        line: startLine,
        column: startCol,
        offset: startOffset,
      });
      continue;
    }

    // Numbers: optional leading +/- followed by digits, or decimal point followed by digits
    const isNegativeOrPositiveDigit =
      (ch === "-" || ch === "+") && /\d/.test(peek(1));
    const isDigitOrLeadingDot =
      /\d/.test(ch) || (ch === "." && /\d/.test(peek(1)));

    if (isNegativeOrPositiveDigit || isDigitOrLeadingDot) {
      if (ch === "-" || ch === "+") {
        advance();
      }

      while (/\d/.test(peek())) {
        advance();
      }

      if (peek() === "." && /\d/.test(peek(1))) {
        advance(); // consume '.'
        while (/\d/.test(peek())) {
          advance();
        }
      }

      // Exponent part
      if (peek() === "e" || peek() === "E") {
        advance();
        if (peek() === "+" || peek() === "-") {
          advance();
        }
        while (/\d/.test(peek())) {
          advance();
        }
      }

      const rawNum = source.substring(startOffset, index);
      tokens.push({
        type: "Number",
        value: rawNum,
        raw: rawNum,
        line: startLine,
        column: startCol,
        offset: startOffset,
      });
      continue;
    }

    // Punctuators
    if (PUNCTUATORS.has(ch)) {
      advance();
      tokens.push({
        type: "Punctuator",
        value: ch,
        raw: ch,
        line: startLine,
        column: startCol,
        offset: startOffset,
      });
      continue;
    }

    // Identifiers & Keywords: starts with [a-zA-Z_$]
    if (/[a-zA-Z_$]/.test(ch)) {
      while (/[a-zA-Z0-9_$]/.test(peek())) {
        advance();
      }
      const rawIdent = source.substring(startOffset, index);

      let tokenType: TokenType = "Identifier";
      if (rawIdent === "true" || rawIdent === "false") {
        tokenType = "Boolean";
      } else if (rawIdent === "null") {
        tokenType = "Null";
      }

      tokens.push({
        type: tokenType,
        value: rawIdent,
        raw: rawIdent,
        line: startLine,
        column: startCol,
        offset: startOffset,
      });
      continue;
    }

    // Unrecognized character
    const badChar = advance();
    throw new MongoParserError(
      `Unexpected character '${badChar}'.`,
      "INVALID_SYNTAX",
      startLine,
      startCol,
      startOffset
    );
  }

  tokens.push({
    type: "EOF",
    value: "",
    raw: "",
    line,
    column,
    offset: index,
  });

  return tokens;
}
