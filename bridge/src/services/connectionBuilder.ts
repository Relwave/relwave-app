import { DBType, DatabaseConfig } from "../types";

export class ConnectionBuilder {
  static buildConnection(
    db: any,
    pwd: string | null,
    dbType: DBType
  ): DatabaseConfig {
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
    return this.buildConnection(db, pwd, DBType.POSTGRES);
  }

  static buildMySQLConnection(db: any, pwd: string | null): DatabaseConfig {
    return this.buildConnection(db, pwd, DBType.MYSQL);
  }
}
