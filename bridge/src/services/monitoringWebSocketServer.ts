import { IncomingMessage } from "http";
import { AddressInfo } from "net";
import { DBType } from "../types";
import { DatabaseService } from "./databaseService";
import { MonitoringService } from "./monitoringService";
import { Logger } from "pino";

const { WebSocketServer } = require("ws");

type WebSocketClient = {
  readyState: number;
  send: (data: string) => void;
  close: (code?: number, reason?: string) => void;
  on: (event: string, listener: (...args: any[]) => void) => void;
};

const WS_OPEN = 1;
const MIN_INTERVAL_MS = 2000;
const DEFAULT_INTERVAL_MS = 5000;

export class MonitoringWebSocketServer {
  private server: any | null = null;
  private port: number | null = null;

  constructor(
    private dbService: DatabaseService,
    private monitoringService: MonitoringService,
    private logger: Logger
  ) {}

  start() {
    if (this.server) return;

    this.server = new WebSocketServer({
      host: "127.0.0.1",
      port: 0,
      path: "/monitoring",
    });

    this.server.on("listening", () => {
      const address = this.server?.address() as AddressInfo | null;
      this.port = address?.port ?? null;
      this.logger?.info({ port: this.port }, "Monitoring WebSocket server started");
    });

    this.server.on("connection", (socket: WebSocketClient, request: IncomingMessage) => {
      // return the promise from handler so test harness can await completion
      return this.handleConnection(socket, request);
    });

    this.server.on("error", (error: Error) => {
      this.logger?.error({ error }, "Monitoring WebSocket server error");
    });
  }

  getInfo() {
    if (!this.port) {
      throw new Error("Monitoring WebSocket server is not ready");
    }

    return {
      url: `ws://127.0.0.1:${this.port}/monitoring`,
      intervalMs: DEFAULT_INTERVAL_MS,
    };
  }

  close() {
    this.server?.close();
    this.server = null;
    this.port = null;
  }

  private async handleConnection(socket: WebSocketClient, request: IncomingMessage) {
    const url = new URL(request.url || "/monitoring", "ws://127.0.0.1");
    const dbId = url.searchParams.get("dbId");
    const requestedInterval = Number(url.searchParams.get("intervalMs") || DEFAULT_INTERVAL_MS);
    const intervalMs = Math.max(MIN_INTERVAL_MS, Number.isFinite(requestedInterval) ? requestedInterval : DEFAULT_INTERVAL_MS);

    if (!dbId) {
      socket.close(1008, "Missing dbId");
      return;
    }

    let stopped = false;
    let interval: NodeJS.Timeout | null = null;

    const sendSnapshot = async () => {
      if (stopped || socket.readyState !== WS_OPEN) return;

      try {
        const { conn, dbType } = await this.dbService.getDatabaseConnection(dbId);
        if (![DBType.POSTGRES, DBType.MYSQL, DBType.MARIADB].includes(dbType)) {
          socket.send(JSON.stringify({
            type: "unsupported",
            message: `Monitoring is not supported for ${dbType}`,
          }));
          socket.close(1008, "Unsupported database type");
          return;
        }

        const snapshot = await this.monitoringService.getSnapshot(dbId, conn, dbType);
        socket.send(JSON.stringify({ type: "snapshot", data: snapshot }));
      } catch (error: any) {
        socket.send(JSON.stringify({
          type: "error",
          message: error?.message || String(error),
        }));
      }
    };

    await sendSnapshot();
    interval = setInterval(sendSnapshot, intervalMs);

    socket.on("close", () => {
      stopped = true;
      if (interval) clearInterval(interval);
    });

    socket.on("error", () => {
      stopped = true;
      if (interval) clearInterval(interval);
    });
  }
}
