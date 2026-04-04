// ----------------------------
// services/connectorRegistry.ts
// ----------------------------
//
// Single place that maps DBType → connector module.
// All handler code calls getConnector(dbType).someMethod(...)
// instead of repeating if/else chains for every operation.

import { DBType } from "../types";
import * as postgresConnector from "../connectors/postgres";
import * as mysqlConnector from "../connectors/mysql";
import * as mariadbConnector from "../connectors/mariadb";
import * as sqliteConnector from "../connectors/sqlite";

export type Connector =
  | typeof postgresConnector
  | typeof mysqlConnector
  | typeof mariadbConnector
  | typeof sqliteConnector;

const registry: Record<DBType, Connector> = {
  [DBType.POSTGRES]: postgresConnector,
  [DBType.MYSQL]: mysqlConnector,
  [DBType.MARIADB]: mariadbConnector,
  [DBType.SQLITE]: sqliteConnector,
};

/**
 * Return the connector module for the given database type.
 * Throws a clear error when an unsupported type is encountered.
 */
export function getConnector(dbType: DBType): Connector {
  const connector = registry[dbType];
  if (!connector) {
    throw new Error(`Unsupported database type: ${dbType}`);
  }
  return connector;
}
