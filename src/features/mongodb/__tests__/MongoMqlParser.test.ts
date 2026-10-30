import { test, describe } from "node:test";
import assert from "node:assert";
import { parseMongoshQuery } from "../parser/mongoshParser";
import { MongoParserError } from "../parser/errors";

describe("Mongosh Parser - Collection Syntax & Naming Rules", () => {
  test("parses standard identifier collection reference", () => {
    const res = parseMongoshQuery("db.users.find({})");
    assert.strictEqual(res.collection, "users");
    assert.strictEqual(res.op.operation, "find");
  });

  test("parses db.getCollection('audit.events') with dotted collection name", () => {
    const res = parseMongoshQuery("db.getCollection('audit.events').find({})");
    assert.strictEqual(res.collection, "audit.events");
    assert.strictEqual(res.op.operation, "find");
  });

  test("parses db.collection('audit.events') with dotted collection name", () => {
    const res = parseMongoshQuery('db.collection("audit.events").find({})');
    assert.strictEqual(res.collection, "audit.events");
    assert.strictEqual(res.op.operation, "find");
  });

  test("parses bracket notation with double and single quotes", () => {
    const res1 = parseMongoshQuery('db["audit.events"].find({})');
    assert.strictEqual(res1.collection, "audit.events");

    const res2 = parseMongoshQuery("db['analytics.2026'].find({})");
    assert.strictEqual(res2.collection, "analytics.2026");
  });

  test("explicitly rejects unbracketed dotted namespace db.audit.events.find()", () => {
    assert.throws(
      () => parseMongoshQuery("db.audit.events.find()"),
      (err: any) => {
        assert(err instanceof MongoParserError);
        assert.strictEqual(err.code, "INVALID_COLLECTION_NAME");
        assert(err.message.includes("Dotted collection names must use explicit collection API"));
        return true;
      }
    );
  });

  test("rejects empty, null byte, $, and system.* collection names", () => {
    assert.throws(
      () => parseMongoshQuery('db.getCollection("").find({})'),
      (err: any) => err.code === "INVALID_COLLECTION_NAME"
    );
    assert.throws(
      () => parseMongoshQuery('db.getCollection("users\\0admin").find({})'),
      (err: any) => err.code === "INVALID_COLLECTION_NAME"
    );
    assert.throws(
      () => parseMongoshQuery('db.getCollection("users$admin").find({})'),
      (err: any) => err.code === "INVALID_COLLECTION_NAME"
    );
    assert.throws(
      () => parseMongoshQuery('db.getCollection("system.users").find({})'),
      (err: any) => err.code === "INVALID_COLLECTION_NAME"
    );
  });

  test("rejects collection names exceeding 120 UTF-8 bytes", () => {
    const longName = "a".repeat(121);
    assert.throws(
      () => parseMongoshQuery(`db.getCollection("${longName}").find({})`),
      (err: any) => err.code === "INVALID_COLLECTION_NAME"
    );
  });
});

describe("Mongosh Parser - Root Operations", () => {
  test("parses find with default empty filter and projection", () => {
    const res1 = parseMongoshQuery("db.users.find()");
    assert.strictEqual(res1.op.operation, "find");
    assert.deepStrictEqual(res1.op.payload, { filter: {}, projection: undefined });

    const res2 = parseMongoshQuery('db.users.find({ status: "active" }, { name: 1, email: 1 })');
    assert.strictEqual(res2.op.operation, "find");
    assert.deepStrictEqual(res2.op.payload, {
      filter: { status: "active" },
      projection: { name: 1, email: 1 },
    });
  });

  test("parses aggregate with empty pipeline and stages", () => {
    const res1 = parseMongoshQuery("db.users.aggregate([])");
    assert.strictEqual(res1.op.operation, "aggregate");
    assert.deepStrictEqual(res1.op.payload, { pipeline: [], allowDiskUse: undefined });

    const res2 = parseMongoshQuery('db.users.aggregate([{ $match: { active: true } }], { allowDiskUse: true })');
    assert.strictEqual(res2.op.operation, "aggregate");
    assert.deepStrictEqual(res2.op.payload, {
      pipeline: [{ $match: { active: true } }],
      allowDiskUse: true,
    });
  });

  test("parses countDocuments with and without filter and options", () => {
    const res1 = parseMongoshQuery("db.users.countDocuments()");
    assert.strictEqual(res1.op.operation, "countDocuments");
    assert.deepStrictEqual(res1.op.payload, { filter: {}, skip: undefined, limit: undefined });

    const res2 = parseMongoshQuery('db.users.countDocuments({ status: "pending" }, { limit: 100 })');
    assert.strictEqual(res2.op.operation, "countDocuments");
    assert.deepStrictEqual(res2.op.payload, {
      filter: { status: "pending" },
      skip: undefined,
      limit: 100,
    });
  });

  test("parses estimatedDocumentCount with empty or no argument", () => {
    const res1 = parseMongoshQuery("db.users.estimatedDocumentCount()");
    assert.strictEqual(res1.op.operation, "estimatedDocumentCount");
    assert.strictEqual(res1.op.payload, undefined);

    const res2 = parseMongoshQuery("db.users.estimatedDocumentCount({})");
    assert.strictEqual(res2.op.operation, "estimatedDocumentCount");
    assert.strictEqual(res2.op.payload, undefined);

    // Reject filter in estimatedDocumentCount
    assert.throws(
      () => parseMongoshQuery('db.users.estimatedDocumentCount({ status: "active" })'),
      (err: any) => err.code === "INVALID_SYNTAX"
    );
  });

  test("parses distinct with field and filter", () => {
    const res1 = parseMongoshQuery('db.users.distinct("role")');
    assert.strictEqual(res1.op.operation, "distinct");
    assert.deepStrictEqual(res1.op.payload, { field: "role", filter: undefined });

    const res2 = parseMongoshQuery('db.users.distinct("role", { active: true })');
    assert.strictEqual(res2.op.operation, "distinct");
    assert.deepStrictEqual(res2.op.payload, {
      field: "role",
      filter: { active: true },
    });

    // Rejects empty or non-string field
    assert.throws(
      () => parseMongoshQuery('db.users.distinct("")'),
      (err: any) => err.code === "INVALID_SYNTAX"
    );
  });
});

describe("Mongosh Parser - Chained Modifiers", () => {
  test("parses .sort(), .skip(), .limit(), and .project() on find()", () => {
    const query = 'db.users.find({}).sort({ createdAt: -1, name: 1 }).skip(10).limit(50).project({ email: 1 })';
    const res = parseMongoshQuery(query);
    assert.strictEqual(res.op.operation, "find");
    assert.deepStrictEqual(res.op.payload, {
      filter: {},
      sort: { createdAt: -1, name: 1 },
      skip: 10,
      limit: 50,
      projection: { email: 1 },
    });
  });

  test("parses .allowDiskUse() on aggregate()", () => {
    const res = parseMongoshQuery('db.users.aggregate([{ $group: { _id: "$city" } }]).allowDiskUse(true)');
    assert.strictEqual(res.op.operation, "aggregate");
    assert.strictEqual((res.op.payload as any).allowDiskUse, true);
  });

  test("rejects modifiers incompatible with operation", () => {
    // .sort() on aggregate() is invalid
    assert.throws(
      () => parseMongoshQuery('db.users.aggregate([]).sort({ x: 1 })'),
      (err: any) => {
        assert(err instanceof MongoParserError);
        assert.strictEqual(err.code, "UNSUPPORTED_METHOD");
        assert(err.message.includes("not supported on aggregate()"));
        return true;
      }
    );

    // .limit() on distinct() is invalid
    assert.throws(
      () => parseMongoshQuery('db.users.distinct("role").limit(10)'),
      (err: any) => err.code === "UNSUPPORTED_METHOD"
    );

    // .allowDiskUse() on find() is invalid
    assert.throws(
      () => parseMongoshQuery('db.users.find({}).allowDiskUse(true)'),
      (err: any) => err.code === "UNSUPPORTED_METHOD"
    );
  });

  test("rejects duplicate modifiers", () => {
    assert.throws(
      () => parseMongoshQuery("db.users.find({}).limit(10).limit(20)"),
      (err: any) => {
        assert.strictEqual(err.code, "INVALID_SYNTAX");
        assert(err.message.includes("Duplicate modifier '.limit()'"));
        return true;
      }
    );
  });

  test("rejects fractional or negative integer modifier arguments", () => {
    assert.throws(
      () => parseMongoshQuery("db.users.find({}).skip(-5)"),
      (err: any) => err.code === "INVALID_SYNTAX"
    );
    assert.throws(
      () => parseMongoshQuery("db.users.find({}).limit(10.5)"),
      (err: any) => err.code === "INVALID_SYNTAX"
    );
    assert.throws(
      () => parseMongoshQuery("db.users.find({}).limit(0)"),
      (err: any) => err.code === "INVALID_SYNTAX"
    );
  });

  test("rejects unsupported chained methods (toArray, forEach, map)", () => {
    assert.throws(
      () => parseMongoshQuery("db.users.find({}).toArray()"),
      (err: any) => {
        assert.strictEqual(err.code, "UNSUPPORTED_METHOD");
        assert(err.message.includes("toArray"));
        return true;
      }
    );
    assert.throws(
      () => parseMongoshQuery("db.users.find({}).forEach()"),
      (err: any) => err.code === "UNSUPPORTED_METHOD"
    );
    assert.throws(
      () => parseMongoshQuery("db.users.find({}).map()"),
      (err: any) => err.code === "UNSUPPORTED_METHOD"
    );
  });

  test("rejects trailing tokens after complete query", () => {
    assert.throws(
      () => parseMongoshQuery("db.users.find({}) extra"),
      (err: any) => {
        assert.strictEqual(err.code, "INVALID_SYNTAX");
        assert(err.message.includes("Unexpected token 'extra'"));
        return true;
      }
    );
  });
});

describe("Mongosh Parser - BSON Constructors & Extended JSON v2", () => {
  test("converts ObjectId('24hex') into { $oid: '24hex' }", () => {
    const res = parseMongoshQuery('db.users.find({ _id: ObjectId("507f1f77bcf86cd799439011") })');
    assert.deepStrictEqual((res.op.payload as any).filter, {
      _id: { $oid: "507f1f77bcf86cd799439011" },
    });
  });

  test("rejects malformed ObjectId values", () => {
    assert.throws(
      () => parseMongoshQuery('db.users.find({ _id: ObjectId("tooShort") })'),
      (err: any) => {
        assert.strictEqual(err.code, "INVALID_BSON_CONSTRUCTOR");
        assert(err.message.includes("exactly 24 hexadecimal characters"));
        return true;
      }
    );
    assert.throws(
      () => parseMongoshQuery('db.users.find({ _id: ObjectId("507f1f77bcf86cd79943901g") })'),
      (err: any) => err.code === "INVALID_BSON_CONSTRUCTOR"
    );
  });

  test("converts ISODate and new Date into { $date: '<iso>' }", () => {
    const res1 = parseMongoshQuery('db.users.find({ createdAt: ISODate("2026-10-30T10:00:00.000Z") })');
    assert.deepStrictEqual((res1.op.payload as any).filter, {
      createdAt: { $date: "2026-10-30T10:00:00.000Z" },
    });

    const res2 = parseMongoshQuery('db.users.find({ createdAt: new Date("2026-10-30T10:00:00.000Z") })');
    assert.deepStrictEqual((res2.op.payload as any).filter, {
      createdAt: { $date: "2026-10-30T10:00:00.000Z" },
    });
  });

  test("rejects invalid date strings and prevents rollover (e.g. February 30)", () => {
    // Non-existent calendar days must NOT silently normalize to the next month
    assert.throws(
      () => parseMongoshQuery('db.users.find({ d: ISODate("2026-02-30T10:00:00Z") })'),
      (err: any) => {
        assert.strictEqual(err.code, "INVALID_BSON_CONSTRUCTOR");
        assert(err.message.includes("Invalid day 30 for month 2"));
        return true;
      }
    );

    // Non-leap year Feb 29 rejected
    assert.throws(
      () => parseMongoshQuery('db.users.find({ d: ISODate("2026-02-29T00:00:00Z") })'),
      (err: any) => {
        assert.strictEqual(err.code, "INVALID_BSON_CONSTRUCTOR");
        assert(err.message.includes("Invalid day 29 for month 2"));
        return true;
      }
    );

    // Leap year Feb 29 accepted
    const leapRes = parseMongoshQuery('db.users.find({ d: ISODate("2024-02-29T00:00:00Z") })');
    assert.strictEqual((leapRes.op.payload as any).filter.d.$date, "2024-02-29T00:00:00.000Z");

    // Invalid month, time, or timezone
    assert.throws(
      () => parseMongoshQuery('db.users.find({ d: ISODate("2026-13-01T00:00:00Z") })'),
      (err: any) => err.code === "INVALID_BSON_CONSTRUCTOR"
    );
    assert.throws(
      () => parseMongoshQuery('db.users.find({ d: ISODate("2026-05-10T25:00:00Z") })'),
      (err: any) => err.code === "INVALID_BSON_CONSTRUCTOR"
    );
    assert.throws(
      () => parseMongoshQuery('db.users.find({ d: ISODate("2026-05-10T12:00:00+25:00") })'),
      (err: any) => err.code === "INVALID_BSON_CONSTRUCTOR"
    );
  });

  test("converts NumberLong preserving precision without JS Number loss", () => {
    // 9007199254740993 is greater than Number.MAX_SAFE_INTEGER (9007199254740991)
    const res = parseMongoshQuery('db.users.find({ counter: NumberLong("9007199254740993"), id: NumberLong(9007199254740993) })');
    assert.deepStrictEqual((res.op.payload as any).filter, {
      counter: { $numberLong: "9007199254740993" },
      id: { $numberLong: "9007199254740993" },
    });
  });

  test("validates signed 64-bit integer range for NumberLong", () => {
    // Valid boundary values
    const res = parseMongoshQuery('db.users.find({ min: NumberLong("-9223372036854775808"), max: NumberLong("9223372036854775807") })');
    assert.strictEqual((res.op.payload as any).filter.min.$numberLong, "-9223372036854775808");
    assert.strictEqual((res.op.payload as any).filter.max.$numberLong, "9223372036854775807");

    // Overflow boundary value (9223372036854775808 exceeds max)
    assert.throws(
      () => parseMongoshQuery('db.users.find({ bad: NumberLong("9223372036854775808") })'),
      (err: any) => {
        assert.strictEqual(err.code, "INVALID_BSON_CONSTRUCTOR");
        assert(err.message.includes("signed 64-bit integer range"));
        return true;
      }
    );
  });

  test("converts NumberDecimal preserving exact decimal precision and supports NaN and Infinity", () => {
    const res = parseMongoshQuery('db.users.find({ balance: NumberDecimal("123.456789012345678901234567890"), sci: NumberDecimal("1.23e-4"), nan: NumberDecimal("NaN"), inf: NumberDecimal("Infinity"), ninf: NumberDecimal("-Infinity") })');
    assert.deepStrictEqual((res.op.payload as any).filter, {
      balance: { $numberDecimal: "123.456789012345678901234567890" },
      sci: { $numberDecimal: "1.23e-4" },
      nan: { $numberDecimal: "NaN" },
      inf: { $numberDecimal: "Infinity" },
      ninf: { $numberDecimal: "-Infinity" },
    });

    assert.throws(
      () => parseMongoshQuery('db.users.find({ balance: NumberDecimal("not-a-decimal") })'),
      (err: any) => err.code === "INVALID_BSON_CONSTRUCTOR"
    );
  });

  test("converts UUID into 16-byte Base64 representation with subtype 04 matching known fixture", () => {
    const res = parseMongoshQuery('db.users.find({ uuid: UUID("a0eebc99-9c0b-4ef8-bb6d-6bb9bd380a11") })');
    const filter = (res.op.payload as any).filter;
    assert.strictEqual(filter.uuid.$binary.subType, "04");
    assert.strictEqual(filter.uuid.$binary.base64, "oO68mZwLTvi7bWu5vTgKEQ==");

    // Reject non-36-char malformed UUID
    assert.throws(
      () => parseMongoshQuery('db.users.find({ uuid: UUID("550e8400-e29b") })'),
      (err: any) => err.code === "INVALID_BSON_CONSTRUCTOR"
    );
  });

  test("rejects unsupported constructors (RegExp, Function, Symbol)", () => {
    assert.throws(
      () => parseMongoshQuery('db.users.find({ x: Function("return 1") })'),
      (err: any) => err.code === "SECURITY_VIOLATION"
    );
    assert.throws(
      () => parseMongoshQuery('db.users.find({ x: RegExp("abc") })'),
      (err: any) => err.code === "UNSUPPORTED_METHOD"
    );
  });

  test("handles escape sequences in strings including quotes and unicode", () => {
    const res = parseMongoshQuery('db.users.find({ note: "Line 1\\nLine 2\\tTabbed \\"quoted\\" \\u0041" })');
    assert.strictEqual(
      (res.op.payload as any).filter.note,
      'Line 1\nLine 2\tTabbed "quoted" A'
    );
  });

  test("rejects malformed syntax like unclosed brackets, braces, and missing colons", () => {
    assert.throws(
      () => parseMongoshQuery("db.users.find({ a: 1"),
      (err: any) => err.code === "INVALID_SYNTAX"
    );
    assert.throws(
      () => parseMongoshQuery("db.users.find([ 1, 2"),
      (err: any) => err.code === "INVALID_SYNTAX"
    );
    assert.throws(
      () => parseMongoshQuery("db.users.find({ a 1 })"),
      (err: any) => err.code === "INVALID_SYNTAX"
    );
    assert.throws(
      () => parseMongoshQuery("db.users.find("),
      (err: any) => err.code === "INVALID_SYNTAX"
    );
  });

  test("rejects duplicate projection when specified in both find() and .project()", () => {
    assert.throws(
      () => parseMongoshQuery("db.users.find({}, { name: 1 }).project({ email: 1 })"),
      (err: any) => {
        assert.strictEqual(err.code, "INVALID_SYNTAX");
        assert(err.message.includes("Duplicate projection"));
        return true;
      }
    );
  });

  test("parses new Date() without arguments as valid current date", () => {
    const res = parseMongoshQuery("db.users.find({ time: new Date() })");
    const dStr = (res.op.payload as any).filter.time.$date;
    assert(typeof dStr === "string");
    assert(!isNaN(new Date(dStr).getTime()));
  });
});


describe("Mongosh Parser - Security & Token-Aware Invariants", () => {
  test("token-aware: string literals containing security keywords pass safely", () => {
    // Semicolons inside strings are valid and must NOT trigger compound statement rejection
    const res1 = parseMongoshQuery('db.users.find({ text: "hello; world", query: "SELECT * FROM users; DROP TABLE;" })');
    assert.strictEqual((res1.op.payload as any).filter.text, "hello; world");
    assert.strictEqual((res1.op.payload as any).filter.query, "SELECT * FROM users; DROP TABLE;");

    // Keywords inside string literals are valid and must NOT trigger security violations
    const res2 = parseMongoshQuery('db.users.find({ code: "function() { eval(); }", tag: "constructor", key: "__proto__" })');
    assert.strictEqual((res2.op.payload as any).filter.code, "function() { eval(); }");
    assert.strictEqual((res2.op.payload as any).filter.tag, "constructor");
    assert.strictEqual((res2.op.payload as any).filter.key, "__proto__");
  });

  test("rejects unquoted compound statements with semicolons", () => {
    assert.throws(
      () => parseMongoshQuery("db.users.find(); db.users.drop()"),
      (err: any) => {
        assert(err instanceof MongoParserError);
        assert.strictEqual(err.code, "COMPOUND_STATEMENT");
        assert(err.message.includes("Compound statements are not supported"));
        return true;
      }
    );

    assert.throws(
      () => parseMongoshQuery("db.users.find({}).limit(10); db.admin.dropDatabase()"),
      (err: any) => err.code === "COMPOUND_STATEMENT"
    );
  });

  test("rejects arbitrary JavaScript declarations and statements outside strings", () => {
    assert.throws(
      () => parseMongoshQuery("var x = 1; db.users.find()"),
      (err: any) => err.code === "COMPOUND_STATEMENT" || err.code === "SECURITY_VIOLATION"
    );
    assert.throws(
      () => parseMongoshQuery("const x = 10"),
      (err: any) => err.code === "SECURITY_VIOLATION"
    );
    assert.throws(
      () => parseMongoshQuery("function run() { db.users.find() }"),
      (err: any) => err.code === "SECURITY_VIOLATION"
    );
    assert.throws(
      () => parseMongoshQuery("for (let i = 0; i < 10; i++) {}"),
      (err: any) => err.code === "COMPOUND_STATEMENT" || err.code === "SECURITY_VIOLATION"
    );
    assert.throws(
      () => parseMongoshQuery("while (true) {}"),
      (err: any) => err.code === "SECURITY_VIOLATION"
    );
    assert.throws(
      () => parseMongoshQuery("() => db.users.find()"),
      (err: any) => err.code === "SECURITY_VIOLATION"
    );
  });

  test("rejects prototype-related property keys in object literals at any depth", () => {
    // Top-level forbidden key
    assert.throws(
      () => parseMongoshQuery('db.users.find({ "__proto__": { admin: true } })'),
      (err: any) => {
        assert.strictEqual(err.code, "SECURITY_VIOLATION");
        assert(err.message.includes("__proto__"));
        return true;
      }
    );

    // Nested forbidden key
    assert.throws(
      () => parseMongoshQuery('db.users.find({ nested: { constructor: "exploit" } })'),
      (err: any) => {
        assert.strictEqual(err.code, "SECURITY_VIOLATION");
        assert(err.message.includes("constructor"));
        return true;
      }
    );

    assert.throws(
      () => parseMongoshQuery('db.users.find({ nested: { prototype: "exploit" } })'),
      (err: any) => {
        assert.strictEqual(err.code, "SECURITY_VIOLATION");
        assert(err.message.includes("prototype"));
        return true;
      }
    );

    // Unicode-escaped dangerous keys must be rejected after string decoding
    assert.throws(
      () => parseMongoshQuery('db.users.find({ "\\u005f\\u005fproto\\u005f\\u005f": "exploit" })'),
      (err: any) => {
        assert.strictEqual(err.code, "SECURITY_VIOLATION");
        assert(err.message.includes("__proto__"));
        return true;
      }
    );

    assert.throws(
      () => parseMongoshQuery('db.users.find({ "\\u0063onstructor": "exploit" })'),
      (err: any) => {
        assert.strictEqual(err.code, "SECURITY_VIOLATION");
        assert(err.message.includes("constructor"));
        return true;
      }
    );
  });

  test("handles line and block comments without allowing security bypasses", () => {
    // Valid query with comments
    const res = parseMongoshQuery(`
      // Fetch active users
      db.users.find({
        /* Status check */
        status: "active"
      }) // end of find
    `);
    assert.strictEqual(res.collection, "users");
    assert.deepStrictEqual((res.op.payload as any).filter, { status: "active" });

    // Comments cannot hide compound statement injection
    assert.throws(
      () => parseMongoshQuery("db.users.find({}); /* comment */ db.users.drop()"),
      (err: any) => err.code === "COMPOUND_STATEMENT"
    );
  });

  test("rejects prototype-related property access on query chains", () => {
    assert.throws(
      () => parseMongoshQuery("db.users.find({}).constructor"),
      (err: any) => err.code === "SECURITY_VIOLATION"
    );
    assert.throws(
      () => parseMongoshQuery("db.users.find({}).__proto__"),
      (err: any) => err.code === "SECURITY_VIOLATION"
    );
    assert.throws(
      () => parseMongoshQuery("db.users.find({}).prototype"),
      (err: any) => err.code === "SECURITY_VIOLATION"
    );
  });

  test("enforces maximum nesting depth of 15", () => {
    // Build 15 levels of nesting: should succeed
    let nested15 = '{"val": 1}';
    for (let i = 0; i < 14; i++) {
      nested15 = `{"level${i}": ${nested15}}`;
    }
    const res = parseMongoshQuery(`db.users.find(${nested15})`);
    assert.strictEqual(res.op.operation, "find");

    // Build 16 levels of nesting: should throw DEPTH_LIMIT_EXCEEDED
    let nested16 = '{"val": 1}';
    for (let i = 0; i < 15; i++) {
      nested16 = `{"level${i}": ${nested16}}`;
    }
    assert.throws(
      () => parseMongoshQuery(`db.users.find(${nested16})`),
      (err: any) => {
        assert.strictEqual(err.code, "DEPTH_LIMIT_EXCEEDED");
        assert(err.message.includes("depth of 15"));
        return true;
      }
    );
  });
});
