// bridge/src/index.ts
import { JsonStdio } from "./jsonRpc";
import logger from "./services/logger";
import { registerDbHandlers } from "./jsonRpcHandler";
import { SessionManager } from "./sessionManager";
import { connectionPool } from "./services/connectionPool";

const rpc = new JsonStdio();
const sessions = new SessionManager();

// Register all database and project handlers directly on rpc
// (JsonStdio.register() is used, no globalThis needed)
try {
  if (typeof registerDbHandlers === "function") {
    registerDbHandlers(rpc, logger, sessions);
    logger.info("Registered JSON-RPC handlers");
  }
} catch (e) {
  logger.error({ e }, "Failed to register handlers");
}

logger.info("Bridge (JSON-RPC) starting");
logger.info("--- System Info ---");
logger.info(`Process PID: ${process.pid}`);
logger.info(`Node.js version: ${process.version}`);
logger.info(`Uptime at start: ${process.uptime()} sec`);
logger.info(`process.execPath: ${process.execPath}`);
logger.info(`process.cwd(): ${process.cwd()}`);
logger.info(`isPkg: ${Boolean((process as any).pkg)}`);
logger.info(`RELWAVE_SQLITE_NATIVE_BINDING: ${process.env.RELWAVE_SQLITE_NATIVE_BINDING ?? "(not set)"}`);
logger.info(`BETTER_SQLITE3_BINDING: ${process.env.BETTER_SQLITE3_BINDING ?? "(not set)"}`);

// Send initial ready notification
rpc.sendNotification("bridge.ready", { pid: process.pid });
rpc.sendNotification("bridge.uptime", { uptimeSec: process.uptime() });

// Handle incoming notifications (one-way)
rpc.on("notification", (n: any) => {
  logger.debug({ notification: n }, "received notification (one-way)");
});

// Fallback request handler: handles methods not registered via rpc.register()
// Only truly built-in methods should be here.
rpc.on("request", async (req: any) => {
  const { id, method, params } = req;
  logger.info({ id, method }, "unregistered request (fallback handler)");

  try {
    switch (method) {
      case "health.ping": {
        rpc.sendResponse(id, {
          ok: true,
          data: { uptimeSec: process.uptime(), pid: process.pid },
        });
        break;
      }

      default: {
        rpc.sendError(id, {
          code: "UNKNOWN_METHOD",
          message: `Unknown method: ${method}`,
        });
      }
    }
  } catch (err: any) {
    logger.error({ err }, "error handling fallback request");
    rpc.sendError(id, { code: "INTERNAL_ERROR", message: String(err) });
  }
});

// Graceful shutdown
function shutdown(signal: string) {
  logger.info(`Bridge received ${signal} — shutting down`);
  sessions.destroy();
  connectionPool.destroy();
  process.exit(0);
}
process.on("SIGINT", () => shutdown("SIGINT"));
process.on("SIGTERM", () => shutdown("SIGTERM"));
