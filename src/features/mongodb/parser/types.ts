import type { MongoMqlOperation } from "../types";

export type TokenType =
  "Identifier" | "String" | "Number" | "Boolean" | "Null" | "Punctuator" | "EOF";

export interface Token {
  type: TokenType;
  value: string;
  raw: string;
  line: number;
  column: number;
  offset: number;
}

export interface MongoshParseResult {
  collection: string;
  op: MongoMqlOperation;
}
