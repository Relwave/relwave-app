import type { ReactNode } from "react";
import type { DatabaseType } from "@/features/database/types";
import { cn } from "@/lib/utils";
import { Database } from "lucide-react";
import MongodbOriginal from "react-devicons/mongodb/original";
import PostgresqlOriginal from "react-devicons/postgresql/original";
import MysqlOriginal from "react-devicons/mysql/original";
import MariadbOriginal from "react-devicons/mariadb/original";
import SqliteOriginal from "react-devicons/sqlite/original";

export type SupportedDatabaseType = DatabaseType | "mariadb";

export type DatabaseKind = "sql" | "nosql";

export interface DatatypeCategory {
  category: string;
  types: string[];
}

export interface ForeignKeySupport {
  supported: boolean;
  notes: string;
}

export interface DatabaseConfig {
  id: SupportedDatabaseType;
  type: SupportedDatabaseType;
  name: string;
  icon: ReactNode;
  deviconClass?: string;
  kind?: DatabaseKind;
  category: "Relational" | "Embedded" | "OLAP" | "Document";
  description: string;
  defaultPort?: string;
  defaultUser?: string;
  defaultDatabase?: string;
  placeholderUrl?: string;
  isFileBased?: boolean;
  fileExtensions?: string[];
  supportsSsl?: boolean;
  supportsSsh?: boolean;
  foreignKeySupport: ForeignKeySupport;
  acceptedDatatypes: DatatypeCategory[];
}

export const databases: DatabaseConfig[] = [
  {
    id: "postgresql",
    type: "postgresql",
    name: "PostgreSQL",
    category: "Relational",
    description: "Powerful open-source object-relational SQL database",
    defaultPort: "5432",
    defaultUser: "postgres",
    defaultDatabase: "postgres",
    placeholderUrl: "postgresql://postgres:password@localhost:5432/mydb",
    supportsSsl: true,
    supportsSsh: true,
    deviconClass: "devicon-postgresql-plain colored",
    foreignKeySupport: {
      supported: true,
      notes:
        "Robust support including ON DELETE CASCADE, ON UPDATE, and deferred constraint checks.",
    },
    acceptedDatatypes: [
      { category: "Integers", types: ["INT", "BIGINT", "SMALLINT", "SERIAL", "BIGSERIAL"] },
      {
        category: "Decimals and Floats",
        types: ["NUMERIC", "DOUBLE PRECISION", "REAL", "DECIMAL"],
      },
      { category: "Text Strings", types: ["VARCHAR", "TEXT", "CHAR"] },
      {
        category: "Date and Time",
        types: ["DATE", "TIMESTAMP", "TIMESTAMPTZ", "INTERVAL", "TIME"],
      },
      { category: "Boolean Flags", types: ["BOOLEAN"] },
      { category: "Complex and Arrays", types: ["JSON", "JSONB", "UUID", "BYTEA", "ARRAY"] },
    ],
    icon: <PostgresqlOriginal size="100%" />,
  },
  {
    id: "mysql",
    type: "mysql",
    name: "MySQL",
    category: "Relational",
    description: "High-performance open-source relational database",
    defaultPort: "3306",
    defaultUser: "root",
    defaultDatabase: "mysql",
    placeholderUrl: "mysql://root:password@localhost:3306/mydb",
    supportsSsl: false,
    supportsSsh: true,
    deviconClass: "devicon-mysql-original colored",
    foreignKeySupport: {
      supported: true,
      notes: "Enforced natively when using the default InnoDB transactional storage engine.",
    },
    acceptedDatatypes: [
      { category: "Integers", types: ["INT", "BIGINT", "TINYINT", "SMALLINT", "MEDIUMINT"] },
      { category: "Decimals and Floats", types: ["DECIMAL", "DOUBLE", "FLOAT"] },
      { category: "Text Strings", types: ["VARCHAR", "TEXT", "CHAR", "MEDIUMTEXT", "LONGTEXT"] },
      { category: "Date and Time", types: ["DATE", "DATETIME", "TIMESTAMP", "TIME"] },
      { category: "Boolean Flags", types: ["BOOLEAN", "TINYINT(1)"] },
      { category: "Complex and Arrays", types: ["JSON"] },
    ],
    icon: <MysqlOriginal size="100%" />,
  },
  {
    id: "mariadb",
    type: "mariadb",
    name: "MariaDB",
    category: "Relational",
    description: "Fast, community-driven relational database fork of MySQL",
    defaultPort: "3306",
    defaultUser: "root",
    defaultDatabase: "mariadb",
    placeholderUrl: "mariadb://root:password@localhost:3306/mydb",
    supportsSsl: true,
    supportsSsh: true,
    deviconClass: "devicon-mariadb-original colored",
    foreignKeySupport: {
      supported: true,
      notes: "Enforced natively when using the default InnoDB transactional storage engine.",
    },
    acceptedDatatypes: [
      { category: "Integers", types: ["INT", "BIGINT", "TINYINT", "SMALLINT", "MEDIUMINT"] },
      { category: "Decimals and Floats", types: ["DECIMAL", "DOUBLE", "FLOAT"] },
      { category: "Text Strings", types: ["VARCHAR", "TEXT", "CHAR", "MEDIUMTEXT", "LONGTEXT"] },
      { category: "Date and Time", types: ["DATE", "DATETIME", "TIMESTAMP", "TIME"] },
      { category: "Boolean Flags", types: ["BOOLEAN", "TINYINT(1)"] },
      { category: "Complex and Arrays", types: ["JSON"] },
    ],
    icon: <MariadbOriginal size="100%" />,
  },
  {
    id: "sqlite",
    type: "sqlite",
    name: "SQLite",
    category: "Embedded",
    description: "Lightweight, zero-config file-based embedded SQL database",
    isFileBased: true,
    fileExtensions: ["db", "sqlite", "sqlite3", "s3db"],
    deviconClass: "devicon-sqlite-plain colored",
    foreignKeySupport: {
      supported: true,
      notes:
        "Syntax is supported but disabled by default. Must run 'PRAGMA foreign_keys = ON;' per session.",
    },
    acceptedDatatypes: [
      { category: "Integers", types: ["INTEGER", "INT", "BIGINT", "SMALLINT", "TINYINT"] },
      { category: "Decimals and Floats", types: ["REAL", "NUMERIC", "FLOAT", "DOUBLE"] },
      { category: "Text Strings", types: ["TEXT", "VARCHAR", "CHAR", "CLOB"] },
      { category: "Date and Time", types: ["DATETIME", "DATE", "TIMESTAMP"] },
      { category: "Boolean Flags", types: ["BOOLEAN"] },
      { category: "Complex and Arrays", types: ["BLOB", "JSON"] },
    ],
    icon: <SqliteOriginal size="100%" />,
  },
  {
    id: "duckdb",
    type: "duckdb",
    name: "DuckDB",
    category: "Embedded",
    description: "Fast in-process columnar analytical SQL database file",
    isFileBased: true,
    fileExtensions: ["db", "duckdb", "ddb"],
    foreignKeySupport: {
      supported: true,
      notes:
        "Enforced during INSERT statements for data validation, but lacks cascading delete/update mechanisms.",
    },
    acceptedDatatypes: [
      {
        category: "Integers",
        types: ["INT", "BIGINT", "HUGEINT", "SMALLINT", "TINYINT", "UTINYINT", "UINT", "UBIGINT"],
      },
      { category: "Decimals and Floats", types: ["DECIMAL", "DOUBLE", "FLOAT"] },
      { category: "Text Strings", types: ["VARCHAR", "TEXT"] },
      { category: "Date and Time", types: ["DATE", "TIMESTAMP", "TIME", "INTERVAL"] },
      { category: "Boolean Flags", types: ["BOOLEAN"] },
      { category: "Complex and Arrays", types: ["ARRAY", "LIST", "STRUCT", "MAP", "JSON", "UUID"] },
    ],
    icon: (
      <svg viewBox="0 0 128 128">
        <path
          fill="#000000"
          d="M64 128C28.6 128 0 99.4 0 64S28.6 0 64 0s64 28.6 64 64-28.6 64-64 64Z"
        ></path>
        <path
          fill="#fff100"
          d="M98.2 54.5H85.6v18.9h12.6c5.2 0 9.5-4.3 9.5-9.5s-4.3-9.4-9.5-9.4ZM24.2 64c0 14.6 11.9 26.5 26.5 26.5S77.2 78.6 77.2 64 65.3 37.5 50.7 37.5 24.2 49.4 24.2 64Z"
        ></path>
      </svg>
    ),
  },
  {
    id: "clickhouse",
    type: "clickhouse",
    name: "ClickHouse",
    category: "OLAP",
    description: "Ultra-fast columnar database for real-time analytics",
    defaultPort: "8123",
    defaultUser: "default",
    defaultDatabase: "default",
    placeholderUrl: "http://default:password@localhost:8123/default",
    supportsSsl: true,
    supportsSsh: false,
    foreignKeySupport: {
      supported: false,
      notes:
        "Analytical column-store. Does not support relational constraints; structural relations rely entirely on JOINs.",
    },
    acceptedDatatypes: [
      {
        category: "Integers",
        types: ["Int8", "Int16", "Int32", "Int64", "UInt8", "UInt16", "UInt32", "UInt64"],
      },
      { category: "Decimals and Floats", types: ["Decimal", "Float32", "Float64"] },
      { category: "Text Strings", types: ["String", "FixedString"] },
      { category: "Date and Time", types: ["Date", "Date32", "DateTime", "DateTime64"] },
      { category: "Boolean Flags", types: ["Bool"] },
      { category: "Complex and Arrays", types: ["Array(T)", "Map(K, V)", "Tuple", "JSON", "UUID"] },
    ],
    icon: (
      <svg viewBox="0 0 128 128">
        <path d="M0 0h128v128H0z" fill="#f9ff69"></path>
        <path
          fill="#000000"
          d="M26.54 23.21a.945.945 0 0 0-.938.938v79.618c0 .511.425.937.937.937h7.168a.945.945 0 0 0 .938-.937V24.148a.945.945 0 0 0-.938-.937Zm18.089 0a.945.945 0 0 0-.938.938v79.618c0 .511.426.937.938.937h7.168a.949.949 0 0 0 .941-.937V24.148a.949.949 0 0 0-.941-.937Zm18.09 0a.945.945 0 0 0-.938.938v79.618c0 .511.426.937.938.937h7.168a.949.949 0 0 0 .941-.937V24.148a.949.949 0 0 0-.941-.937Zm18.18 0a.946.946 0 0 0-.942.938v79.618c0 .511.426.937.941.937h7.165a.949.949 0 0 0 .94-.937V24.148a.949.949 0 0 0-.94-.937Zm18.09 31.743a.952.952 0 0 0-.942.942v16.21c0 .512.43.942.941.942h7.168c.512 0 .938-.43.938-.942v-16.21a.949.949 0 0 0-.938-.942Zm0 0"
        ></path>
      </svg>
    ),
  },
  {
    id: "mongodb",
    type: "mongodb",
    name: "MongoDB",
    kind: "nosql",
    category: "Document",
    description: "Scalable document (NoSQL) database",
    defaultPort: "27017",
    defaultUser: "",
    defaultDatabase: "",
    placeholderUrl: "mongodb://localhost:27017/mydb",
    supportsSsl: true,
    supportsSsh: true,
    deviconClass: "devicon-mongodb-plain colored",
    foreignKeySupport: {
      supported: false,
      notes:
        "Document store; relationships are embedded or referenced in application logic, not enforced by the database.",
    },
    acceptedDatatypes: [
      {
        category: "BSON Types",
        types: [
          "String",
          "Int32",
          "Int64/Long",
          "Double",
          "Decimal128",
          "Bool",
          "Date",
          "ObjectId",
          "Binary",
          "Array",
          "Object",
          "Null",
        ],
      },
    ],
    icon: <MongodbOriginal size="100%" />,
  },
];

export const SUPPORTED_DATABASES = databases;

export const STANDARD_SQL_DATATYPES: DatatypeCategory[] = [
  { category: "Integers", types: ["INT", "INTEGER", "BIGINT", "SMALLINT"] },
  { category: "Decimals and Floats", types: ["DECIMAL", "FLOAT", "NUMERIC", "REAL"] },
  { category: "Text Strings", types: ["VARCHAR", "CHAR", "TEXT"] },
  { category: "Date and Time", types: ["DATE", "TIMESTAMP", "TIME"] },
  { category: "Boolean Flags", types: ["BOOLEAN"] },
  { category: "Complex and Arrays", types: ["ARRAY", "JSON"] },
];

export function getDatabaseMeta(typeOrName?: string | null): DatabaseConfig | undefined {
  if (!typeOrName) return undefined;
  const normalized = typeOrName.toLowerCase().trim();
  return databases.find(
    (db) => db.id === normalized || db.type === normalized || db.name.toLowerCase() === normalized,
  );
}

export function getDatabaseForeignKeySupport(typeOrName?: string | null): ForeignKeySupport {
  const meta = getDatabaseMeta(typeOrName);
  return (
    meta?.foreignKeySupport ?? {
      supported: true,
      notes: "Fully supported natively as part of standard relational constraints.",
    }
  );
}

export function getDatabaseAcceptedDatatypes(typeOrName?: string | null): DatatypeCategory[] {
  const meta = getDatabaseMeta(typeOrName);
  const rawCategories = meta?.acceptedDatatypes ?? STANDARD_SQL_DATATYPES;
  const seen = new Set<string>();

  return rawCategories
    .map((group) => ({
      category: group.category,
      types: group.types.filter((type) => {
        const lower = type.toLowerCase();
        if (seen.has(lower)) return false;
        seen.add(lower);
        return true;
      }),
    }))
    .filter((group) => group.types.length > 0);
}

export function getAllAcceptedDatatypes(typeOrName?: string | null): string[] {
  const categories = getDatabaseAcceptedDatatypes(typeOrName);
  return categories.flatMap((cat) => cat.types);
}

export function isDocumentDatabase(typeOrName?: string | null): boolean {
  const normalized = typeOrName?.toLowerCase().trim();
  return normalized === "mongodb";
}

export function getDatabaseKind(typeOrName?: string | null): DatabaseKind {
  return isDocumentDatabase(typeOrName) ? "nosql" : "sql";
}

export function getDefaultColumnType(typeOrName?: string | null): string {
  const normalized = typeOrName?.toLowerCase().trim();
  if (normalized === "mongodb") return "string";
  if (normalized === "clickhouse") return "String";
  if (normalized === "sqlite") return "INTEGER";
  return "VARCHAR";
}

export function getDatabaseIcon(typeOrName?: string | null): ReactNode | null {
  return getDatabaseMeta(typeOrName)?.icon ?? null;
}

export function DatabaseLogo({
  type,
  className = "w-5 h-5",
}: {
  type?: string | null;
  className?: string;
  useDevicon?: boolean;
}) {
  const meta = getDatabaseMeta(type);

  if (!meta) {
    return <Database className={cn("h-4 w-4", className)} />;
  }

  return (
    <div
      className={cn(
        "shrink-0 flex items-center justify-center [&>svg]:w-full [&>svg]:h-full",
        className,
      )}
    >
      {meta.icon}
    </div>
  );
}
