import { validateGeneratedSQL } from "../src/ai/utils/sqlValidator";
import { SchemaFile } from "../src/services/projectStore";

describe("validateGeneratedSQL", () => {
  const mockSchema: SchemaFile = {
    version: 2,
    projectId: "proj_1",
    databaseId: "db_1",
    dialect: "postgresql",
    cachedAt: "2023-01-01T00:00:00.000Z",
    relwaveVersion: "1.0.0",
    schemaHash: "abc",
    schemas: [
      {
        name: "public",
        tables: [
          {
            name: "users",
            type: "BASE TABLE",
            columns: [],
            indexes: [],
            foreignKeys: [],
            checks: [],
          },
          {
            name: "orders",
            type: "BASE TABLE",
            columns: [],
            indexes: [],
            foreignKeys: [],
            checks: [],
          },
        ],
      },
    ],
  };

  it("should allow a valid SELECT query with known tables", () => {
    const result = validateGeneratedSQL(
      'SELECT * FROM "users" JOIN public.orders on users.id = orders.user_id',
      mockSchema,
    );
    expect(result.valid).toBe(true);
    expect(result.intent).toBe("read");
  });

  it("should block non-SELECT queries", () => {
    const result = validateGeneratedSQL(
      "WITH cte AS (SELECT * FROM users) SELECT * FROM cte",
      mockSchema,
    );
    // Actually our simple check blocks WITH if it doesn't start with SELECT.
    // That's acceptable for a strict auto-execution guard as per TASKS.md
    expect(result.valid).toBe(false);
    expect(result.reason).toContain("start with SELECT");
  });

  it("should block destructive operations", () => {
    const result = validateGeneratedSQL("SELECT * FROM users; DROP TABLE users", mockSchema);
    expect(result.valid).toBe(false);
    expect(result.reason).toContain("DROP TABLE");
    expect(result.intent).toBe("destructive");
  });

  it("should block UPDATE operations", () => {
    const result = validateGeneratedSQL("UPDATE users SET name = 'test'", mockSchema);
    expect(result.valid).toBe(false);
    expect(result.reason).toContain("UPDATE ");
    expect(result.intent).toBe("write");
  });

  it("should block unknown tables", () => {
    const result = validateGeneratedSQL("SELECT * FROM unknown_table", mockSchema);
    expect(result.valid).toBe(false);
    expect(result.reason).toContain("unknown_table");
  });

  it("should block stacked statements", () => {
    const result = validateGeneratedSQL("SELECT * FROM users; SELECT * FROM orders", mockSchema);
    expect(result.valid).toBe(false);
    expect(result.reason).toContain("Stacked statements");
  });

  it("should block comments", () => {
    const result = validateGeneratedSQL("SELECT * FROM users -- comment", mockSchema);
    expect(result.valid).toBe(false);
    expect(result.reason).toContain("comments");
  });
});
