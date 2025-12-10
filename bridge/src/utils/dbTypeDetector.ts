import { DBType } from "../types";

export class DBTypeDetector {
  static detect(db: any): DBType {
    if (db.type) {
      const normalized = db.type.toLowerCase();
      if (normalized.includes("mysql")) return DBType.MYSQL;
      if (normalized.includes("postgres") || normalized.includes("pg")) {
        return DBType.POSTGRES;
      }
    }
    return DBType.POSTGRES; // default
  }
}
