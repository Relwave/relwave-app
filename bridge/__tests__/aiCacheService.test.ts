import { describe, expect, test } from "@jest/globals";
import {
  canonicalize,
  generateContentHash,
  hashSchemaAnalysis,
} from "../src/services/aiCacheService";
import { SchemaAnalysisInput } from "../src/types/ai";

describe("aiCacheService canonical ordering & hashing", () => {
  test("canonicalize recursively sorts object keys alphabetically", () => {
    const input = {
      z: 1,
      m: {
        b: 2,
        a: 3,
      },
      a: "first",
    };
    const canonical = canonicalize(input);
    expect(Object.keys(canonical as Record<string, unknown>)).toEqual(["a", "m", "z"]);
    expect(Object.keys((canonical as Record<string, Record<string, unknown>>).m)).toEqual([
      "a",
      "b",
    ]);
    expect(JSON.stringify(canonical)).toBe(
      JSON.stringify({
        a: "first",
        m: { a: 3, b: 2 },
        z: 1,
      }),
    );
  });

  test("canonicalize preserves array ordering and primitive values", () => {
    expect(canonicalize([3, 1, 2])).toEqual([3, 1, 2]);
    expect(canonicalize(42)).toBe(42);
    expect(canonicalize("hello")).toBe("hello");
    expect(canonicalize(true)).toBe(true);
    expect(canonicalize(false)).toBe(false);
    expect(canonicalize(null)).toBeNull();
    expect(canonicalize(undefined)).toBeUndefined();

    const arrWithObjects = [
      { b: 1, a: 2 },
      { y: 3, x: 4 },
    ];
    const result = canonicalize(arrWithObjects) as Array<Record<string, unknown>>;
    expect(Object.keys(result[0])).toEqual(["a", "b"]);
    expect(Object.keys(result[1])).toEqual(["x", "y"]);
    expect(result[0].a).toBe(2);
    expect(result[1].x).toBe(4);
  });

  test("canonicalize does not drop undeclared or extra fields on objects", () => {
    const input = {
      table: "users",
      column: "id",
      customMeta: { flag: true, extra: [1, 2] },
      undeclaredProp: 123,
    };
    const canonical = canonicalize(input) as Record<string, unknown>;
    expect(Object.keys(canonical)).toEqual(["column", "customMeta", "table", "undeclaredProp"]);
    expect(canonical.undeclaredProp).toBe(123);
    expect((canonical.customMeta as Record<string, unknown>).flag).toBe(true);
  });

  test("generateContentHash returns identical hash regardless of key insertion order for nested objects", () => {
    const objA = {
      feature: "test",
      nested: {
        z: 10,
        a: 20,
        inner: { beta: "b", alpha: "a" },
      },
    };
    const objB = {
      nested: {
        inner: { alpha: "a", beta: "b" },
        a: 20,
        z: 10,
      },
      feature: "test",
    };

    const hashA = generateContentHash("schema-analysis", objA);
    const hashB = generateContentHash("schema-analysis", objB);
    expect(hashA).toBe(hashB);
  });

  test("hashSchemaAnalysis returns identical hash when column references has keys inserted in different orders", () => {
    const schemaA: SchemaAnalysisInput = {
      databaseType: "postgres",
      tables: [
        {
          name: "orders",
          columns: [
            {
              name: "user_id",
              type: "integer",
              references: { table: "users", column: "id" },
            },
          ],
        },
      ],
    };

    const schemaB: SchemaAnalysisInput = {
      databaseType: "postgres",
      tables: [
        {
          name: "orders",
          columns: [
            {
              name: "user_id",
              type: "integer",
              references: { column: "id", table: "users" } as any,
            },
          ],
        },
      ],
    };

    const hashA = hashSchemaAnalysis(schemaA, "main_db");
    const hashB = hashSchemaAnalysis(schemaB, "main_db");
    expect(hashA).toBe(hashB);
  });

  test("hashSchemaAnalysis preserves any extra metadata fields present on references", () => {
    const schemaWithExtra: SchemaAnalysisInput = {
      databaseType: "postgres",
      tables: [
        {
          name: "orders",
          columns: [
            {
              name: "user_id",
              type: "integer",
              references: {
                table: "users",
                column: "id",
                onDelete: "CASCADE",
              } as any,
            },
          ],
        },
      ],
    };

    const schemaStandard: SchemaAnalysisInput = {
      databaseType: "postgres",
      tables: [
        {
          name: "orders",
          columns: [
            {
              name: "user_id",
              type: "integer",
              references: { table: "users", column: "id" },
            },
          ],
        },
      ],
    };

    const hashExtra = hashSchemaAnalysis(schemaWithExtra, "main_db");
    const hashStd = hashSchemaAnalysis(schemaStandard, "main_db");
    expect(hashExtra).not.toBe(hashStd);

    const schemaWithExtraReordered: SchemaAnalysisInput = {
      databaseType: "postgres",
      tables: [
        {
          name: "orders",
          columns: [
            {
              name: "user_id",
              type: "integer",
              references: {
                onDelete: "CASCADE",
                column: "id",
                table: "users",
              } as any,
            },
          ],
        },
      ],
    };

    const hashExtraReordered = hashSchemaAnalysis(schemaWithExtraReordered, "main_db");
    expect(hashExtraReordered).toBe(hashExtra);
  });
});
