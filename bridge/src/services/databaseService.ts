import { ConnectionBuilder } from "./connectionBuilder";
import { DBTypeDetector } from "../utils/dbTypeDetector";
import { DBType } from "../types";
import { DbStore } from "./dbStore";

export class DatabaseService {
  constructor(
    private dbStore = new DbStore(),
    private connBuilder = ConnectionBuilder,
    private typeDetector = DBTypeDetector
  ) {}

  async getDatabase(dbId: string) {
    return this.dbStore.getDB(dbId);
  }

  async getDatabaseConnection(dbId: string) {
    const db = await this.dbStore.getDB(dbId);
    if (!db) throw new Error("Database not found");

    const pwd = await this.dbStore.getPasswordFor(db);
    const dbType = this.typeDetector.detect(db);
    const conn = this.connBuilder.buildConnection(db, pwd, dbType);

    return { db, conn, dbType };
  }

  async listDatabases() {
    const dbs = await this.dbStore.listDBs();
    const safe = dbs.map((d) => ({ ...d, credentialId: undefined }));
    return safe;
  }

  async addDatabase(payload: any) {
    const required = ["name", "host", "port", "user", "database", "type"];
    for (const field of required) {
      if (!payload[field]) {
        throw new Error(`Missing required field: ${field}`);
      }
    }
    return this.dbStore.addDB(payload);
  }

  async updateDatabase(id: string, payload: any) {
    if (!id) throw new Error("Missing id");
    return this.dbStore.updateDB(id, payload);
  }

  async deleteDatabase(id: string) {
    if (!id) throw new Error("Missing id");
    return this.dbStore.deleteDB(id);
  }

  async touchDatabase(id: string) {
    if (!id) throw new Error("Missing id");
    return this.dbStore.touchDB(id);
  }
}
