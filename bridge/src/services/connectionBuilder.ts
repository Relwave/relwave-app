import { DBType, DatabaseConfig } from "../types";
import { SQLiteConfig } from "../types/sqlite";
import { isWindowsDriveRootPath, normalizeSQLitePath } from "../utils/sqlitePath";
import { parseClickHouseUrl } from "../utils/clickhouseUrl";
import { sshTunnelServiceInstance, TunnelInfo } from "./sshTunnelService";

export interface BuildResult {
  config: DatabaseConfig | SQLiteConfig;
  tunnel?: TunnelInfo;
}

export class ConnectionBuilder {
  static async buildConnection(db: any, pwd: string | null, dbType: DBType): Promise<BuildResult> {
    if (dbType === DBType.SQLITE || dbType === DBType.DUCKDB) {
      const engineName = dbType === DBType.DUCKDB ? "DuckDB" : "SQLite";
      const dbPath = normalizeSQLitePath(db.database || db.path);
      if (!dbPath || typeof dbPath !== "string" || !dbPath.trim()) {
        throw new Error(
          `${engineName} connection requires a non-empty file path. ` +
            `Got database=${JSON.stringify(db.database)}, path=${JSON.stringify(db.path)}`,
        );
      }
      if (isWindowsDriveRootPath(dbPath)) {
        throw new Error(
          `Invalid ${engineName} path "${dbPath}" — it points to a Windows drive root, not a database file.`,
        );
      }
      return {
        config: {
          path: dbPath,
          readonly: db.readonly ?? false,
        } as SQLiteConfig,
      };
    }

    if (dbType === DBType.CLICKHOUSE) {
      const rawTarget = db.url || db.host;
      if (!rawTarget) {
        throw new Error("ClickHouse connection requires a URL or host");
      }
      const parsed = parseClickHouseUrl(rawTarget);
      return {
        config: {
          url: parsed.url,
          host: db.host || parsed.host,
          port: db.port || parsed.port,
          user: db.user || "default",
          password: pwd ?? undefined,
          database: db.database || parsed.database || "default",
          ssl: db.ssl !== undefined ? db.ssl : parsed.ssl,
        } as any,
      };
    }

    const defaultPort =
      dbType === DBType.MYSQL || dbType === DBType.MARIADB
        ? 3306
        : 5432;

    const base: DatabaseConfig = {
      host: db.host,
      port: db.port || defaultPort,
      user: db.user || "",
      password: pwd ?? undefined,
      ssl: db.ssl,
      database: db.database || "",
      ssh: db.ssh,
    };

    if (base.ssh) {
      const tunnel = await sshTunnelServiceInstance.createSSHTunnel(base.ssh, base.host, base.port);
      // Rewrite host/port to point to the local tunnel endpoint
      return {
        config: {
          ...base,
          host: "127.0.0.1",
          port: tunnel.localPort,
        },
        tunnel,
      };
    }

    return { config: base };
  }

  static async buildPostgresConnection(db: any, pwd: string | null): Promise<BuildResult> {
    return this.buildConnection(db, pwd, DBType.POSTGRES);
  }

  static async buildMySQLConnection(db: any, pwd: string | null): Promise<BuildResult> {
    return this.buildConnection(db, pwd, DBType.MYSQL);
  }

  static async buildMariaDBConnection(db: any, pwd: string | null): Promise<BuildResult> {
    return this.buildConnection(db, pwd, DBType.MARIADB);
  }

  static async buildSQLiteConnection(db: any): Promise<BuildResult> {
    return this.buildConnection(db, null, DBType.SQLITE);
  }

  static async buildDuckDBConnection(db: any): Promise<BuildResult> {
    return this.buildConnection(db, null, DBType.DUCKDB);
  }

  static async buildClickHouseConnection(db: any, pwd: string | null): Promise<BuildResult> {
    return this.buildConnection(db, pwd, DBType.CLICKHOUSE);
  }
}
