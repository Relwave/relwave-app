import { DBType, DatabaseConfig } from "../types";
import { SQLiteConfig } from "../types/sqlite";
import { isWindowsDriveRootPath, normalizeSQLitePath } from "../utils/sqlitePath";
import { sshTunnelServiceInstance, TunnelInfo } from "./sshTunnelService";

export interface BuildResult {
  config: DatabaseConfig | SQLiteConfig;
  tunnel?: TunnelInfo;
}

export class ConnectionBuilder {
  static async buildConnection(
    db: any,
    pwd: string | null,
    dbType: DBType
  ): Promise<BuildResult> {
    if (dbType === DBType.SQLITE) {
      const dbPath = normalizeSQLitePath(db.database || db.path);
      if (!dbPath || typeof dbPath !== "string" || !dbPath.trim()) {
        throw new Error(
          `SQLite connection requires a non-empty file path. ` +
          `Got database=${JSON.stringify(db.database)}, path=${JSON.stringify(db.path)}`
        );
      }
      if (isWindowsDriveRootPath(dbPath)) {
        throw new Error(
          `Invalid SQLite path "${dbPath}" — it points to a Windows drive root, not a database file.`
        );
      }
      return {
        config: {
          path: dbPath,
          readonly: db.readonly ?? false,
        } as SQLiteConfig,
      };
    }

    const base: DatabaseConfig = {
      host: db.host,
      port: db.port || (dbType === DBType.MYSQL || dbType === DBType.MARIADB ? 3306 : 5432),
      user: db.user,
      password: pwd ?? undefined,
      ssl: db.ssl,
      database: db.database,
      ssh: db.ssh,
    };

    if (base.ssh) {
      const tunnel = await sshTunnelServiceInstance.createSSHTunnel(
        base.ssh,
        base.host,
        base.port
      );
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
}
