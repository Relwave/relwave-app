import { ConnectionBuilder } from "./connectionBuilder";
import { DBTypeDetector } from "../utils/dbTypeDetector";
import { DBType } from "../types";
import { dbStoreInstance } from "./dbStore";   // always use the singleton
import { connectionPool } from "./connectionPool";
import { keyringServiceInstance } from "./keyringService";

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

    // If SSH is present, retrieve credentials from keyring
    if (db.ssh) {
      if (db.ssh.authMethod === "password") {
        db.ssh.password = await keyringServiceInstance.getCredential(`${dbId}_ssh_pwd`) || undefined;
      } else if (db.ssh.authMethod === "privateKey") {
        db.ssh.passphrase = await keyringServiceInstance.getCredential(`${dbId}_ssh_pass`) || undefined;
      }
    }

    const { config, tunnel } = await ConnectionBuilder.buildConnection(db, pwd, dbType);

    connectionPool.set(dbId, config, dbType, tunnel);
    return { db, conn: config, dbType };
  }

  async listDatabases() {
    const dbs = await dbStoreInstance.listDBs();
    return dbs.map((d) => ({ ...d, credentialId: undefined }));
  }

  async addDatabase(payload: Record<string, any>) {
    const isSQLite = (payload.type as string | undefined)?.toLowerCase().includes("sqlite");
    const required = isSQLite
      ? ["name", "database", "type"]
      : ["name", "host", "port", "user", "database", "type"];
    for (const field of required) {
      if (!payload[field]) throw new Error(`Missing required field: ${field}`);
    }

    // Extract SSH credentials before saving to dbStore
    const sshPwd = payload.ssh?.password;
    const sshPass = payload.ssh?.passphrase;
    if (payload.ssh) {
      delete payload.ssh.password;
      delete payload.ssh.passphrase;
    }

    if (isSQLite) {
      const { config } = await ConnectionBuilder.buildSQLiteConnection(payload);
      payload = {
        ...payload,
        database: (config as any).path,
      };
    }

    const res = await dbStoreInstance.addDB(payload as Parameters<typeof dbStoreInstance.addDB>[0]);

    // Store SSH credentials in keyring
    if (sshPwd) {
      await keyringServiceInstance.storeCredential(`${res.id}_ssh_pwd`, sshPwd);
    }
    if (sshPass) {
      await keyringServiceInstance.storeCredential(`${res.id}_ssh_pass`, sshPass);
    }

    return res;
  }

  async updateDatabase(id: string, payload: Record<string, any>) {
    if (!id) throw new Error("Missing id");
    const isSQLite = (payload.type as string | undefined)?.toLowerCase().includes("sqlite");

    // Extract SSH credentials
    const sshPwd = payload.ssh?.password;
    const sshPass = payload.ssh?.passphrase;
    if (payload.ssh) {
      delete payload.ssh.password;
      delete payload.ssh.passphrase;
    }

    if (isSQLite || typeof payload.database === "string") {
      const current = await dbStoreInstance.getDB(id);
      const currentIsSQLite = (current?.type as string | undefined)?.toLowerCase().includes("sqlite");
      if (currentIsSQLite || isSQLite) {
        const { config } = await ConnectionBuilder.buildSQLiteConnection({
          ...current,
          ...payload,
        });
        payload = {
          ...payload,
          database: (config as any).path,
        };
      }
    }

    connectionPool.invalidate(id); // evict stale cached config
    const res = await dbStoreInstance.updateDB(id, payload as Parameters<typeof dbStoreInstance.updateDB>[1]);

    // Update SSH credentials in keyring
    if (sshPwd !== undefined) {
      if (sshPwd) {
        await keyringServiceInstance.storeCredential(`${id}_ssh_pwd`, sshPwd);
      } else {
        await keyringServiceInstance.deleteCredential(`${id}_ssh_pwd`);
      }
    }
    if (sshPass !== undefined) {
      if (sshPass) {
        await keyringServiceInstance.storeCredential(`${id}_ssh_pass`, sshPass);
      } else {
        await keyringServiceInstance.deleteCredential(`${id}_ssh_pass`);
      }
    }

    return res;
  }

  async deleteDatabase(id: string) {
    if (!id) throw new Error("Missing id");
    connectionPool.invalidate(id); // evict before removing from store
    const res = await dbStoreInstance.deleteDB(id);

    // Delete SSH credentials from keyring
    await keyringServiceInstance.deleteCredential(`${id}_ssh_pwd`);
    await keyringServiceInstance.deleteCredential(`${id}_ssh_pass`);

    return res;
  }

  async touchDatabase(id: string) {
    if (!id) throw new Error("Missing id");
    return dbStoreInstance.touchDB(id);
  }
}
