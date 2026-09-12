import { Logger } from "pino";
import { Rpc } from "../types";
import { DatabaseService } from "../services/databaseService";
import { MonitoringService } from "../services/monitoringService";

export class MonitoringHandlers {
  constructor(
    private rpc: Rpc,
    private logger: Logger,
    private dbService: DatabaseService,
    private monitoringService: MonitoringService,
  ) {}

  async handleGetSnapshot(params: any, id: number | string) {
    try {
      const { id: dbId } = params || {};
      if (!dbId) {
        return this.rpc.sendError(id, {
          code: "BAD_REQUEST",
          message: "Missing id",
        });
      }

      const { conn, dbType } = await this.dbService.getDatabaseConnection(dbId);
      const snapshot = await this.monitoringService.getSnapshot(dbId, conn, dbType);
      this.rpc.sendResponse(id, { ok: true, data: snapshot });
    } catch (error: any) {
      this.logger?.error({ error }, "db.monitoringSnapshot failed");
      this.rpc.sendError(id, {
        code: "MONITORING_ERROR",
        message: error?.message || String(error),
      });
    }
  }
}
