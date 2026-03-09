import { DBType, DatabaseConfig } from "../types";
import { SQLiteConfig } from "../types/sqlite";

export class ConnectionBuilder {
  static buildConnection(
    db: any,
    pwd: string | null,
    dbType: DBType
  ): DatabaseConfig | SQLiteConfig {
    if (dbType === DBType.SQLITE) {
      const path = db.database || db.path;
      if (!path || typeof path !== "string" || !path.trim()) {
        throw new Error("SQLite connection requires a non-empty file path");
      }
      return {
        path,
        readonly: db.readonly ?? false,
      } as SQLiteConfig;
    }
    const base = {
      host: db.host,
      port: db.port || (dbType === DBType.MYSQL ? 3306 : 5432),
      user: db.user,
      password: pwd ?? undefined,
      ssl: db.ssl,
      database: db.database,
    };
    return base;
  }

  static buildPostgresConnection(db: any, pwd: string | null): DatabaseConfig {
    return this.buildConnection(db, pwd, DBType.POSTGRES) as DatabaseConfig;
  }

  static buildMySQLConnection(db: any, pwd: string | null): DatabaseConfig {
    return this.buildConnection(db, pwd, DBType.MYSQL) as DatabaseConfig;
  }

  static buildMariaDBConnection(db: any, pwd: string | null): DatabaseConfig {
    return this.buildConnection(db, pwd, DBType.MARIADB) as DatabaseConfig;
  }

  static buildSQLiteConnection(db: any): SQLiteConfig {
    return this.buildConnection(db, null, DBType.SQLITE) as SQLiteConfig;
  }
}
