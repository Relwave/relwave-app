export type MongoParserErrorCode =
  | "INVALID_SYNTAX"
  | "SECURITY_VIOLATION"
  | "UNSUPPORTED_METHOD"
  | "UNSUPPORTED_OPERATION"
  | "INVALID_BSON_CONSTRUCTOR"
  | "INVALID_COLLECTION_NAME"
  | "DEPTH_LIMIT_EXCEEDED"
  | "COMPOUND_STATEMENT";

export class MongoParserError extends Error {
  readonly code: MongoParserErrorCode;
  readonly line: number;
  readonly column: number;
  readonly offset: number;

  constructor(message: string, code: MongoParserErrorCode, line = 1, column = 1, offset = 0) {
    super(`${message} (line ${line}, col ${column})`);
    this.name = "MongoParserError";
    this.code = code;
    this.line = line;
    this.column = column;
    this.offset = offset;
    Object.setPrototypeOf(this, MongoParserError.prototype);
  }
}
