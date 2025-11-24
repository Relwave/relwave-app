// bridge/src/index.ts
import { JsonStdio } from "./jsonRpc";
import logger from "./services/logger";
import { testConnection } from "./connectors/postgres";
import { registerDbHandlers } from "./jsonRpcHandler";
import { SessionManager } from "./sessionManager";

const rpc = new JsonStdio();
const sessions = new SessionManager();
// --- Adapter: expose global rpcRegister so handlers can register themselves ---
// This adapter writes handlers into a global fallback map and also attempts
// to register with the dispatcher if it exposes a registration API.
function attachRpcRegister(rpcDispatcher: any) {
  (globalThis as any)._rpcHandlers = (globalThis as any)._rpcHandlers || {};

  const registerFn = (
    method: string,
    handler: (params: any, id: number | string) => Promise<void> | void
  ) => {
    if (!method || typeof handler !== "function") return;

    // Always keep the fallback map for lookup inside the main request loop
    (globalThis as any)._rpcHandlers[method] = handler;

    // Try to register with the dispatcher if it provides an API
    try {
      if (typeof rpcDispatcher.on === "function") {
        rpcDispatcher.on(method, handler);
        return;
      }
    } catch (e) {}
    try {
      if (typeof rpcDispatcher.register === "function") {
        rpcDispatcher.register(method, handler);
        return;
      }
    } catch (e) {}
    try {
      if (typeof rpcDispatcher.registerMethod === "function") {
        rpcDispatcher.registerMethod(method, handler);
        return;
      }
    } catch (e) {}
    try {
      if (typeof rpcDispatcher.addHandler === "function") {
        rpcDispatcher.addHandler(method, handler);
        return;
      }
    } catch (e) {}
  };

  (globalThis as any).rpcRegister = registerFn;
}

// Attach registration adapter to RPC dispatcher
attachRpcRegister(rpc);

// Load external JSON-RPC handlers (db.* etc.)
try {
  if (typeof registerDbHandlers === "function") {
    registerDbHandlers(rpc, logger, sessions);
    logger.info("Registered external JSON-RPC handlers (db.*)");
  } else {
    logger.debug("No external jsonRpcHandlers.registerDbHandlers found");
  }
} catch (e) {
  logger.debug(
    { e },
    "jsonRpcHandlers not found or failed to register (this is okay in some builds)"
  );
}

logger.info("Bridge (JSON-RPC) starting");

// send initial ready notification
rpc.sendNotification("bridge.ready", { pid: process.pid });

// handle incoming notifications (one-way)
rpc.on("notification", (n: any) => {
  logger.debug({ notification: n }, "received notification (one-way)");
});

rpc.on("request", async (req: any) => {
  const id = req.id;
  const method = req.method;
  const params = req.params;
  logger.info({ id, method }, "incoming request");

  try {
    // First: consult global fallback handlers if provided by other modules
    const handlersMap =
      (globalThis as any)._rpcHandlers ||
      (globalThis as any).rpcHandlers ||
      undefined;

    if (handlersMap && handlersMap[method]) {
      try {
        await handlersMap[method](params, id);
        return; // external handler is expected to call rpc.sendResponse / rpc.sendError
      } catch (eh: any) {
        logger.error({ eh, method, id }, "external rpc handler threw");
        return rpc.sendError(id, {
          code: "HANDLER_ERROR",
          message: String(eh),
        });
      }
    }

    // Built-in fallback handlers (small / safe)
    switch (method) {
      case "ping": {
        rpc.sendResponse(id, { ok: true, data: { msg: "pong", echo: params } });
        break;
      }

      case "health.ping": {
        rpc.sendResponse(id, {
          ok: true,
          data: { uptimeSec: process.uptime(), pid: process.pid },
        });
        break;
      }

      case "connection.test": {
        // params: { config: PGConfig | connectionString }
        const cfg = params?.config;
        const res = await testConnection(cfg);
        rpc.sendResponse(id, { ok: res.ok, message: res.message });
        break;
      }

      default: {
        rpc.sendError(id, {
          code: "UNKNOWN_METHOD",
          message: `Unknown method ${method}`,
        });
      }
    }
  } catch (err: any) {
    logger.error({ err }, "error handling request");
    rpc.sendError(id, { code: "INTERNAL_ERROR", message: String(err) });
  }
});

// graceful shutdown logs
process.on("SIGINT", () => {
  logger.info("Bridge received SIGINT — exiting");
  process.exit(0);
});
process.on("SIGTERM", () => {
  logger.info("Bridge received SIGTERM — exiting");
  process.exit(0);
});
