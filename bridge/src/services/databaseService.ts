import { ConnectionBuilder } from "./connectionBuilder";
import { DBTypeDetector } from "../utils/dbTypeDetector";
import { DBType } from "../types";
import { dbStoreInstance } from "./dbStore";   // always use the singleton
import { connectionPool } from "./connectionPool";

export class DatabaseService {
  /**
   * Get a single database's metadata (no password).
   */
  async getDatabase(dbId: string) {
    return dbStoreInstance.getDB(dbId);
  }

  /**
   * Return a connection config for the given dbId.
   * Hits the in-memory pool first; builds a fresh config on miss.
   *
   * NOTE: the connectors create their own client on every call using the
   * config object, so the "connection" here is a config descriptor, not an
   * open socket.  The pool avoids repeated dbStore + password lookups.
   */
  async getDatabaseConnection(dbId: string): Promise<{ db: unknown; conn: any; dbType: DBType }> {
    // Pool hit — skip disk IO entirely
    const cached = connectionPool.get(dbId);
    if (cached) {
      const db = await dbStoreInstance.getDB(dbId);
      return { db, conn: cached.conn, dbType: cached.dbType };
    }

    // Pool miss — build config and cache it
    const db = await dbStoreInstance.getDB(dbId);
    if (!db) throw new Error("Database not found");

    const pwd = await dbStoreInstance.getPasswordFor(db);
    const dbType = DBTypeDetector.detect(db);
    const conn = ConnectionBuilder.buildConnection(db, pwd, dbType);

    connectionPool.set(dbId, conn, dbType);
    return { db, conn, dbType };
  }

  async listDatabases() {
    const dbs = await dbStoreInstance.listDBs();
    return dbs.map((d) => ({ ...d, credentialId: undefined }));
  }

  async addDatabase(payload: Record<string, unknown>) {
    const isSQLite = (payload.type as string | undefined)?.toLowerCase().includes("sqlite");
    const required = isSQLite
      ? ["name", "database", "type"]
      : ["name", "host", "port", "user", "database", "type"];
    for (const field of required) {
      if (!payload[field]) throw new Error(`Missing required field: ${field}`);
    }
    if (isSQLite) {
      const sqliteConfig = ConnectionBuilder.buildSQLiteConnection(payload);
      payload = {
        ...payload,
        database: sqliteConfig.path,
      };
    }
    return dbStoreInstance.addDB(payload as Parameters<typeof dbStoreInstance.addDB>[0]);
  }

  async updateDatabase(id: string, payload: Record<string, unknown>) {
    if (!id) throw new Error("Missing id");
    const isSQLite = (payload.type as string | undefined)?.toLowerCase().includes("sqlite");
    if (isSQLite || typeof payload.database === "string") {
      const current = await dbStoreInstance.getDB(id);
      const currentIsSQLite = (current?.type as string | undefined)?.toLowerCase().includes("sqlite");
      if (currentIsSQLite || isSQLite) {
        const sqliteConfig = ConnectionBuilder.buildSQLiteConnection({
          ...current,
          ...payload,
        });
        payload = {
          ...payload,
          database: sqliteConfig.path,
        };
      }
    }
    connectionPool.invalidate(id); // evict stale cached config
    return dbStoreInstance.updateDB(id, payload as Parameters<typeof dbStoreInstance.updateDB>[1]);
  }

  async deleteDatabase(id: string) {
    if (!id) throw new Error("Missing id");
    connectionPool.invalidate(id); // evict before removing from store
    return dbStoreInstance.deleteDB(id);
  }

  async touchDatabase(id: string) {
    if (!id) throw new Error("Missing id");
    return dbStoreInstance.touchDB(id);
  }
}
