import { JsonStdio } from "./jsonRpc";
import { randomUUID } from "node:crypto";
import logger from "./services/logger";
import { testConnection, streamQueryCancelable } from "./connectors/postgres";
import { SessionManager } from "./sessionManager";

const rpc = new JsonStdio();
const sessions = new SessionManager();

logger.info("Bridge (JSON-RPC) starting");

// send initial ready notification
rpc.sendNotification("bridge.ready", { pid: process.pid });

// handle incoming notifications (one-way)
rpc.on("notification", (n: any) => {
  logger.debug({ notification: n }, "received notification (one-way)");
});

// helper to send a query error notification
function notifyQueryError(sessionId: string, err: any) {
  try {
    rpc.sendNotification("query.error", {
      sessionId,
      error: { message: String(err) },
    });
  } catch (e) {
    /* ignore */
  }
}

// handle incoming requests (id present)
rpc.on("request", async (req: any) => {
  const id = req.id;
  const method = req.method;
  const params = req.params;
  logger.info({ id, method }, "incoming request");

  try {
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
        const cfg = params?.config;
        const res = await testConnection(cfg);
        rpc.sendResponse(id, { ok: res.ok, message: res.message });
        break;
      }

      case "query.createSession": {
        const sessionId = randomUUID();
        sessions.create(sessionId, {});
        rpc.sendResponse(id, { ok: true, data: { sessionId } });
        break;
      }

      case "query.run": {
        const { sessionId, connection, sql, batchSize = 200 } = params || {};
        if (!sessionId)
          return rpc.sendError(id, {
            code: "NO_SESSION",
            message: "Missing sessionId",
          });

        let cancelled = false;
        const cancelState: { fn: (() => Promise<void>) | null } = { fn: null };

        // create runner with real onBatch / onDone
        const start = Date.now();
        let batchIndex = 0;
        let totalRows = 0;

        const runner = streamQueryCancelable(
          connection,
          sql,
          batchSize,
          async (rows, columns) => {
            if (cancelled) throw new Error("query cancelled");
            totalRows += rows.length;
            rpc.sendNotification("query.result", {
              sessionId,
              batchIndex: batchIndex++,
              rows,
              columns,
              complete: false,
            });
          },
          () => {
            rpc.sendNotification("query.done", {
              sessionId,
              rows: totalRows,
              timeMs: Date.now() - start,
              status: "success",
            });
          }
        );

        // set cancel handler synchronously
        cancelState.fn = async () => {
          try {
            await runner.cancel();
          } catch (e) {}
        };

        sessions.registerCancel(sessionId, async () => {
          cancelled = true;
          if (cancelState.fn) await cancelState.fn();
        });

        // run the promise in background
        (async () => {
          try {
            await runner.promise;
          } catch (err: any) {
            if (String(err).toLowerCase().includes("cancel") || cancelled) {
              rpc.sendNotification("query.done", {
                sessionId,
                rows: totalRows,
                timeMs: Date.now() - start,
                status: "cancelled",
              });
            } else {
              notifyQueryError(sessionId, err);
            }
          } finally {
            sessions.remove(sessionId);
            cancelState.fn = null;
          }
        })();

        rpc.sendResponse(id, { ok: true });
        break;
      }

      case "query.cancel": {
        const { sessionId } = params || {};
        if (!sessionId)
          return rpc.sendError(id, {
            code: "NO_SESSION",
            message: "Missing sessionId",
          });
        const ok = await sessions.cancel(sessionId);
        rpc.sendResponse(id, { ok: true, data: { cancelled: ok } });
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

// graceful shutdown logging
process.on("SIGINT", () => {
  logger.info("Bridge received SIGINT — exiting");
  process.exit(0);
});
process.on("SIGTERM", () => {
  logger.info("Bridge received SIGTERM — exiting");
  process.exit(0);
});
