import { buildSchemaContext } from "../src/ai/utils/schemaContext";
import { SchemaFile } from "../src/services/projectStore";

describe("buildSchemaContext", () => {
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
        enums: [{ name: "user_status", values: ["active", "inactive"] }],
        tables: [
          {
            name: "users",
            type: "BASE TABLE",
            columns: [
              {
                name: "id",
                type: "uuid",
                isPrimaryKey: true,
                nullable: false,
                isForeignKey: false,
                isUnique: false,
                isSerial: false,
                ordinalPosition: 1,
                defaultValue: "uuid_generate_v4()",
              },
              {
                name: "email",
                type: "varchar",
                isPrimaryKey: false,
                nullable: false,
                isForeignKey: false,
                isUnique: true,
                isSerial: false,
                ordinalPosition: 2,
                defaultValue: null,
              },
              {
                name: "password_hash",
                type: "varchar",
                isPrimaryKey: false,
                nullable: false,
                isForeignKey: false,
                isUnique: false,
                isSerial: false,
                ordinalPosition: 3,
                defaultValue: null,
              },
              {
                name: "status",
                type: "user_status",
                isPrimaryKey: false,
                nullable: false,
                isForeignKey: false,
                isUnique: false,
                isSerial: false,
                ordinalPosition: 4,
                defaultValue: "'active'",
              },
            ],
            indexes: [{ name: "users_email_idx", columns: ["email"], unique: true }],
            foreignKeys: [],
            checks: [],
          },
          {
            name: "orders",
            type: "BASE TABLE",
            columns: [
              {
                name: "id",
                type: "integer",
                isPrimaryKey: true,
                nullable: false,
                isForeignKey: false,
                isUnique: false,
                isSerial: true,
                ordinalPosition: 1,
                defaultValue: null,
              },
              {
                name: "user_id",
                type: "uuid",
                isPrimaryKey: false,
                nullable: false,
                isForeignKey: true,
                isUnique: false,
                isSerial: false,
                ordinalPosition: 2,
                defaultValue: null,
                foreignKey: { schema: "public", table: "users", column: "id" },
              },
              {
                name: "total",
                type: "numeric",
                isPrimaryKey: false,
                nullable: false,
                isForeignKey: false,
                isUnique: false,
                isSerial: false,
                ordinalPosition: 3,
                defaultValue: null,
              },
            ],
            indexes: [],
            foreignKeys: [
              {
                name: "orders_user_id_fkey",
                columns: ["user_id"],
                referencedSchema: "public",
                referencedTable: "users",
                referencedColumns: ["id"],
                onDelete: "CASCADE",
                onUpdate: "NO ACTION",
              },
            ],
            checks: [],
          },
          {
            name: "schema_migrations",
            type: "BASE TABLE",
            columns: [
              {
                name: "version",
                type: "varchar",
                isPrimaryKey: true,
                nullable: false,
                isForeignKey: false,
                isUnique: false,
                isSerial: false,
                ordinalPosition: 1,
                defaultValue: null,
              },
            ],
            indexes: [],
            foreignKeys: [],
            checks: [],
          },
        ],
      },
    ],
  };

  it("should build a compact context", () => {
    const result = buildSchemaContext(mockSchema);

    // Check header
    expect(result).toContain("Database: postgresql | Schema captured: 2023-01-01T00:00:00.000Z");

    // Check enums
    expect(result).toContain("ENUM TYPES:");
    expect(result).toContain("public.user_status = [active, inactive]");

    // Check tables and columns
    expect(result).toContain("TABLE public.users");
    expect(result).toContain("id uuid [PK, NOT NULL, DEFAULT uuid_generate_v4()]");
    expect(result).toContain("email varchar [NOT NULL, UNIQUE]");

    // Check masking sensitive columns
    expect(result).toContain("password_hash: [REDACTED]");

    // Check foreign key column flag
    expect(result).toContain("user_id uuid [FK→public.users.id, NOT NULL]");

    // Check indexes
    expect(result).toContain("UNIQUE INDEX (email)");

    // Check relationships
    expect(result).toContain("RELATIONSHIPS:");
    expect(result).toContain("RELATIONSHIP public.orders.user_id → public.users.id");

    // Check that excluded tables are absent
    expect(result).not.toContain("TABLE public.schema_migrations");
  });

  it("should respect excludeTables and targetSchema options", () => {
    const result = buildSchemaContext(mockSchema, {
      excludeTables: ["orders"],
      targetSchema: "public",
    });
    expect(result).not.toContain("TABLE public.orders");
    expect(result).not.toContain("RELATIONSHIP public.orders.user_id");
    expect(result).toContain("TABLE public.users");
  });
});
