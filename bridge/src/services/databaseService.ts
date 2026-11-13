import { ConnectionBuilder } from "./connectionBuilder";
import { DBTypeDetector } from "../utils/dbTypeDetector";
import { DBType } from "../types";
import {
  isMongoUri,
  extractMongoCredentials,
  sanitizeMongoUri,
  normalizeMongoUriMeta,
  buildMongoConnectionUri,
} from "../utils/mongoUri";
import { dbStoreInstance } from "./dbStore";
import { connectionPool, ConnectionPool } from "./connectionPool";
import { keyringServiceInstance } from "./keyringService";
import { getClientKey, closeAllMongoClients, setMongoShuttingDown, safeMongoError } from "../connectors/mongo";
import logger from "./logger";

export class DatabaseService {
  private dbGenerations = new Map<string, number>();
  private inFlightConnections = new Map<string, Promise<void>>();
  private activeBuilders = new Set<Promise<void>>();
  private isShuttingDown = false;
  private connectionPool: ConnectionPool = connectionPool;

  getGeneration(dbId: string): number {
    return this.dbGenerations.get(dbId) || 0;
  }

  async invalidateConnection(dbId: string): Promise<void> {
    const nextGen = (this.dbGenerations.get(dbId) || 0) + 1;
    this.dbGenerations.set(dbId, nextGen);
    this.inFlightConnections.delete(dbId);
    await this.connectionPool.invalidate(dbId);
  }

  private async ensureConnectionBuilt(dbId: string): Promise<void> {
    if (this.isShuttingDown) {
      throw new Error("Bridge is shutting down: connection acquisition rejected");
    }

    let pending = this.inFlightConnections.get(dbId);
    if (!pending) {
      const buildGeneration = this.getGeneration(dbId);

      pending = (async () => {
        let builtTunnel: any;
        let builtConfig: any;
        let builtDbType: DBType | undefined;
        let registeredClientKey: string | undefined;

        try {
          if (this.isShuttingDown) {
            throw new Error("Bridge is shutting down: connection build aborted");
          }

          const db = await dbStoreInstance.getDB(dbId);
          if (!db) throw new Error("Database not found");
          const pwd = await dbStoreInstance.getPasswordFor(db);
          const dbType = DBTypeDetector.detect(db);
          builtDbType = dbType;

          if (db.ssh) {
            if (db.ssh.authMethod === "password") {
              db.ssh.password =
                (await keyringServiceInstance.getCredential(`${dbId}_ssh_pwd`)) || undefined;
            } else if (db.ssh.authMethod === "privateKey") {
              db.ssh.passphrase =
                (await keyringServiceInstance.getCredential(`${dbId}_ssh_pass`)) || undefined;
            }
          }

          if (this.isShuttingDown || this.getGeneration(dbId) !== buildGeneration) {
            throw new Error("Connection build aborted: profile was invalidated or bridge is shutting down");
          }

          if (dbType === DBType.MONGODB && !db.ssh) {
            registeredClientKey = getClientKey({
              uri: buildMongoConnectionUri(db, null),
              database: db.database,
            });
            this.connectionPool.registerBuildingClient(registeredClientKey);
          }

          const res = await ConnectionBuilder.buildConnection(db, pwd, dbType);
          builtConfig = res.config;
          builtTunnel = res.tunnel;

          if (dbType === DBType.MONGODB && db.ssh && builtConfig) {
            registeredClientKey = getClientKey(builtConfig);
            this.connectionPool.registerBuildingClient(registeredClientKey);
          }

          if (this.isShuttingDown || this.getGeneration(dbId) !== buildGeneration) {
            if (builtTunnel) {
              const isTunnelAdopted = Array.from(this.connectionPool.getAllEntries()).some(
                (entry) => entry.tunnel === builtTunnel,
              );
              if (!isTunnelAdopted) {
                try {
                  builtTunnel.close();
                } catch {}
              }
            }

            if (registeredClientKey) {
              this.connectionPool.unregisterBuildingClient(registeredClientKey);
              registeredClientKey = undefined;
            }

            if (builtConfig && builtDbType === DBType.MONGODB) {
              await this.connectionPool.safeCloseMongoClient(builtConfig);
            }

            throw new Error("Connection build aborted: profile was invalidated or bridge is shutting down");
          }

          this.connectionPool.set(dbId, builtConfig, builtDbType, builtTunnel);
        } finally {
          if (registeredClientKey) {
            this.connectionPool.unregisterBuildingClient(registeredClientKey);
          }
          if (this.inFlightConnections.get(dbId) === pending) {
            this.inFlightConnections.delete(dbId);
          }
          this.activeBuilders.delete(pending);
        }
      })();

      this.inFlightConnections.set(dbId, pending);
      this.activeBuilders.add(pending);
    }

    await pending;
  }

  isFatalConnectionError(err: any): boolean {
    if (!err) return false;
    const name = err.name || "";
    const msg = err.message || "";
    return (
      name === "MongoServerSelectionError" ||
      name === "MongoNetworkError" ||
      name === "MongoNetworkTimeoutError" ||
      name === "MongoTopologyClosedError" ||
      msg.includes("connection reset by peer") ||
      msg.includes("ECONNRESET") ||
      msg.includes("ECONNREFUSED") ||
      msg.includes("ETIMEDOUT") ||
      msg.includes("Topology is closed")
    );
  }

  async withConnection<T>(
    dbId: string,
    operation: (conn: any, db: any, dbType: DBType) => Promise<T>,
  ): Promise<T> {
    if (this.isShuttingDown) {
      throw new Error("Bridge is shutting down: connection acquisition rejected");
    }

    let lease = this.connectionPool.acquire(dbId);

    if (!lease) {
      await this.ensureConnectionBuilt(dbId);
      lease = this.connectionPool.acquire(dbId);
      if (!lease) {
        throw new Error(`Failed to acquire connection lease for '${dbId}' after build`);
      }
    }

    const db = await dbStoreInstance.getDB(dbId);

    try {
      return await operation(lease.connection.conn, db, lease.connection.dbType);
    } catch (err: any) {
      if (this.isFatalConnectionError(err)) {
        try {
          await this.invalidateConnection(dbId);
        } catch (invalErr: any) {
          logger.error(
            { dbId, err: safeMongoError(invalErr), originalErr: safeMongoError(err) },
            "Failed to invalidate connection following fatal database operation error",
          );
        }
      }
      throw err;
    } finally {
      lease.release();
    }
  }

  async acquireConnection(
    dbId: string,
  ): Promise<{ conn: any; db: any; dbType: DBType; release: () => void }> {
    if (this.isShuttingDown) {
      throw new Error("Bridge is shutting down: connection acquisition rejected");
    }

    let lease = this.connectionPool.acquire(dbId);
    if (!lease) {
      await this.ensureConnectionBuilt(dbId);
      lease = this.connectionPool.acquire(dbId);
      if (!lease) {
        throw new Error(`Failed to acquire connection lease for '${dbId}' after build`);
      }
    }

    const db = await dbStoreInstance.getDB(dbId);
    return {
      conn: lease.connection.conn,
      db,
      dbType: lease.connection.dbType,
      release: lease.release,
    };
  }

  async getDatabaseConnection(dbId: string): Promise<{ db: unknown; conn: any; dbType: DBType }> {
    const cached = this.connectionPool.get(dbId);
    if (cached) {
      const db = await dbStoreInstance.getDB(dbId);
      return { db, conn: cached.conn, dbType: cached.dbType };
    }

    await this.ensureConnectionBuilt(dbId);
    const published = this.connectionPool.get(dbId);
    if (!published) throw new Error("Failed to build connection");
    const db = await dbStoreInstance.getDB(dbId);
    return { db, conn: published.conn, dbType: published.dbType };
  }

  async getDatabase(dbId: string) {
    return dbStoreInstance.getDB(dbId);
  }

  async listDatabases() {
    const dbs = await dbStoreInstance.listDBs();
    return dbs.map((d) => ({ ...d, credentialId: undefined }));
  }

  async addDatabase(payload: Record<string, any>) {
    const isFileBasedDB = ["sqlite", "duckdb"].includes(
      (payload.type as string | undefined)?.toLowerCase() || "",
    );
    const isClickHouse = (payload.type as string | undefined)?.toLowerCase() === "clickhouse";
    const isMongo = (payload.type as string | undefined)?.toLowerCase() === "mongodb";
    const required = isFileBasedDB
      ? ["name", "database", "type"]
      : isClickHouse || isMongo
        ? ["name", "type"]
        : ["name", "host", "port", "user", "database", "type"];
    for (const field of required) {
      if (!payload[field]) throw new Error(`Missing required field: ${field}`);
    }

    const sshPwd = payload.ssh?.password;
    const sshPass = payload.ssh?.passphrase;
    if (payload.ssh) {
      delete payload.ssh.password;
      delete payload.ssh.passphrase;
    }

    if (isFileBasedDB) {
      const { config } = await ConnectionBuilder.buildSQLiteConnection(payload);
      payload = {
        ...payload,
        database: (config as any).path,
      };
    } else if (isClickHouse) {
      if (!payload.url && !payload.host) {
        throw new Error("Missing required field: url");
      }
      const { parseClickHouseUrl } = await import("../utils/clickhouseUrl");
      const parsed = parseClickHouseUrl(payload.url || payload.host);
      payload = {
        ...payload,
        url: parsed.url,
        host: payload.host || parsed.host,
        port: payload.port || parsed.port,
        user: payload.user || "default",
        database: payload.database || parsed.database || "default",
        ssl: payload.ssl !== undefined ? payload.ssl : parsed.ssl,
      };
    } else if (isMongo) {
      if (!payload.url && !payload.host) {
        throw new Error("Missing required field: url");
      }
      if (payload.url && isMongoUri(payload.url)) {
        const creds = extractMongoCredentials(payload.url);
        const meta = normalizeMongoUriMeta(payload.url);
        payload = {
          ...payload,
          url: sanitizeMongoUri(payload.url),
          host: payload.host || meta.host,
          port: payload.port || meta.port,
          user: payload.user || meta.user,
          database: payload.database || meta.database,
          authSource: payload.authSource ?? meta.authSource,
          replicaSet: payload.replicaSet ?? meta.replicaSet,
        };
        if (creds.password) {
          payload = { ...payload, password: creds.password };
        }
      } else {
        payload = { ...payload, port: payload.port || 27017, database: payload.database || "" };
      }
    }

    const res = await dbStoreInstance.addDB(payload as Parameters<typeof dbStoreInstance.addDB>[0]);

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
    const isFileBasedDB = ["sqlite", "duckdb"].includes(
      (payload.type as string | undefined)?.toLowerCase() || "",
    );
    const isClickHouse = (payload.type as string | undefined)?.toLowerCase() === "clickhouse";
    const isMongo = (payload.type as string | undefined)?.toLowerCase() === "mongodb";

    const sshPwd = payload.ssh?.password;
    const sshPass = payload.ssh?.passphrase;
    if (payload.ssh) {
      delete payload.ssh.password;
      delete payload.ssh.passphrase;
    }

    if (isClickHouse && (payload.url || payload.host)) {
      const { parseClickHouseUrl } = await import("../utils/clickhouseUrl");
      const parsed = parseClickHouseUrl(payload.url || payload.host);
      payload = {
        ...payload,
        url: parsed.url,
        host: payload.host || parsed.host,
        port: payload.port || parsed.port,
        database: payload.database || parsed.database || "default",
        ssl: payload.ssl !== undefined ? payload.ssl : parsed.ssl,
      };
    }
    if (isMongo && payload.url && isMongoUri(payload.url)) {
      const creds = extractMongoCredentials(payload.url);
      payload = { ...payload, url: sanitizeMongoUri(payload.url) };
      if (creds.password && payload.password === undefined) {
        payload = { ...payload, password: creds.password };
      }
    }
    if (payload.ssh) {
      delete payload.ssh.password;
      delete payload.ssh.passphrase;
    }

    if (isFileBasedDB || typeof payload.database === "string") {
      const current = await dbStoreInstance.getDB(id);
      const currentIsFileBasedDB = ["sqlite", "duckdb"].includes(
        (current?.type as string | undefined)?.toLowerCase() || "",
      );
      if (currentIsFileBasedDB || isFileBasedDB) {
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

    await this.invalidateConnection(id);
    const res = await dbStoreInstance.updateDB(
      id,
      payload as Parameters<typeof dbStoreInstance.updateDB>[1],
    );

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
    await this.invalidateConnection(id);
    const res = await dbStoreInstance.deleteDB(id);

    await keyringServiceInstance.deleteCredential(`${id}_ssh_pwd`);
    await keyringServiceInstance.deleteCredential(`${id}_ssh_pass`);

    return res;
  }

  async touchDatabase(id: string) {
    if (!id) throw new Error("Missing id");
    return dbStoreInstance.touchDB(id);
  }

  private async drainActiveLeases(): Promise<void> {
    while (this.connectionPool.getActiveOperationsCount() > 0) {
      await new Promise((resolve) => setTimeout(resolve, 20));
    }
  }

  private async executePhase4Teardown(): Promise<void> {
    const inProgressList = Array.from(this.connectionPool.getInProgressCleanups());
    if (inProgressList.length > 0) {
      let syncTimer: NodeJS.Timeout | undefined;
      const syncTimeout = new Promise<void>((resolve) => {
        syncTimer = setTimeout(resolve, 200);
      });
      await Promise.race([Promise.allSettled(inProgressList), syncTimeout]);
      if (syncTimer) clearTimeout(syncTimer);
    }

    this.connectionPool.setForcedTeardownInitiated(true);

    const uniqueTunnels = new Set<any>();
    for (const entry of this.connectionPool.getAllEntries()) {
      if (entry.tunnel) uniqueTunnels.add(entry.tunnel);
    }
    for (const tunnel of uniqueTunnels) {
      try {
        tunnel.close();
      } catch {}
    }

    const phase4Deadline = Date.now() + 100;
    await closeAllMongoClients({ force: true, globalDeadline: phase4Deadline });

    this.connectionPool.clear();
    this.activeBuilders.clear();
  }

  async shutdown(): Promise<void> {
    this.isShuttingDown = true;
    this.connectionPool.setShuttingDown(true);
    setMongoShuttingDown(true);

    for (const dbId of Array.from(this.dbGenerations.keys())) {
      this.dbGenerations.set(dbId, (this.dbGenerations.get(dbId) || 0) + 1);
    }
    this.inFlightConnections.clear();

    const leaseDrainPromise = this.drainActiveLeases();
    const builderDrainPromise = Promise.allSettled(Array.from(this.activeBuilders));

    let drainTimer: NodeJS.Timeout | undefined;
    const timeoutPromise = new Promise<void>((resolve) => {
      drainTimer = setTimeout(resolve, 1500);
    });

    await Promise.race([
      Promise.all([leaseDrainPromise, builderDrainPromise]),
      timeoutPromise,
    ]);
    if (drainTimer) clearTimeout(drainTimer);

    await this.executePhase4Teardown();
  }
}

export const databaseServiceInstance = new DatabaseService();
