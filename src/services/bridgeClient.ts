// src/renderer/src/services/bridgeClient.ts
import { invoke } from "@tauri-apps/api/core";
import { listen, type UnlistenFn } from "@tauri-apps/api/event";

type Pending = { resolve: (v: any) => void; reject: (e: any) => void };
const pending = new Map<number, Pending>();
let nextId = 1;

let isInitialized = false;
let unlistenStdout: UnlistenFn | null = null;
let unlistenStderr: UnlistenFn | null = null;

/** Check if we're running in Tauri environment */
export function hasTauriInvoke(): boolean {
  return typeof window !== "undefined" && !!(window as any).__TAURI__;
}

/**
 * startBridgeListeners()
 * - Must be called once after Tauri is ready (e.g., in a React useEffect)
 * - Sets up listeners for bridge stdout/stderr events
 */
export async function startBridgeListeners(): Promise<void> {
  if (isInitialized) {
    console.warn("bridgeClient: Already initialized");
    return;
  }

  if (!hasTauriInvoke()) {
    console.warn(
      "bridgeClient: Tauri invoke not available — running in browser fallback mode."
    );
    return;
  }

  try {
    // Listen to bridge stdout forwarded by Rust
    unlistenStdout = await listen<string>("bridge-stdout", (event) => {
      try {
        const payload = JSON.parse(event.payload);
        if (payload && typeof payload === "object") {
          // Handle notification (no id field)
          if (payload.method && payload.id === undefined) {
            window.dispatchEvent(
              new CustomEvent(`bridge:${payload.method}`, {
                detail: payload.params,
              })
            );
            return;
          }

          // Handle response (has id field)
          if (payload.id !== undefined) {
            const p = pending.get(payload.id);
            if (!p) {
              // console.warn('bridge: orphan response', payload);
              return;
            }
            pending.delete(payload.id);
            if ("result" in payload) {
              p.resolve(payload.result);
            } else {
              p.reject(payload.error);
            }
            return;
          }
        }
      } catch (e) {
        console.warn("bridge: invalid json from stdout", event.payload, e);
      }
    });

    // Listen to bridge stderr for logs
    unlistenStderr = await listen<string>("bridge-stderr", (event) => {
      console.debug("bridge-log:", event.payload);
    });

    isInitialized = true;
    console.log("bridgeClient: Listeners initialized");
  } catch (error) {
    console.error("bridgeClient: Failed to initialize listeners", error);
    throw error;
  }
}

/**
 * stopBridgeListeners()
 * - Cleanup function to remove listeners
 * - Call this when your component unmounts
 */
export function stopBridgeListeners(): void {
  if (unlistenStdout) {
    unlistenStdout();
    unlistenStdout = null;
  }
  if (unlistenStderr) {
    unlistenStderr();
    unlistenStderr = null;
  }
  isInitialized = false;
  console.log("bridgeClient: Listeners stopped");
}

/**
 * Get appropriate timeout for different operations
 */
function getTimeoutForMethod(method: string): number {
  // Schema operations can be very slow on large databases
  if (method === "db.getSchema") return 180000; // 3 minutes

  // Table listing can be slow on MySQL
  if (method === "db.listTables") return 120000; // 2 minutes

  // Stats queries are usually fast but can be slow on large DBs
  if (method === "db.getStats") return 60000; // 1 minute

  // Query operations need longer timeouts
  if (method.startsWith("query.")) return 300000; // 5 minutes

  // Default for other operations
  return 30000; // 30 seconds
}

/**
 * bridgeRequest - Send a JSON-RPC request to the bridge process
 * @param method - The JSON-RPC method name
 * @param params - The parameters for the method
 * @param timeoutMs - Request timeout in milliseconds (auto-determined if not provided)
 */
export async function bridgeRequest(
  method: string,
  params?: any,
  timeoutMs?: number
): Promise<any> {
  // Use method-specific timeout if not explicitly provided
  const timeout = timeoutMs ?? getTimeoutForMethod(method);
  if (!hasTauriInvoke()) {
    return Promise.reject(
      new Error(
        "Tauri runtime not available. Run inside the Tauri app (pnpm tauri dev) or provide a browser fallback."
      )
    );
  }

  if (!isInitialized) {
    return Promise.reject(
      new Error(
        "Bridge client not initialized. Call startBridgeListeners() first."
      )
    );
  }

  const id = nextId++;
  const req = { id, method, params };
  const payload = JSON.stringify(req);

  // Add timing for debugging
  const startTime = performance.now();
  console.debug(`[Bridge Request ${id}] ${method}`, params);

  const promise = new Promise((resolve, reject) => {
    const timeoutHandle = setTimeout(() => {
      if (pending.has(id)) {
        pending.delete(id);
        const elapsed = performance.now() - startTime;
        console.error(
          `[Bridge Timeout ${id}] ${method} after ${elapsed.toFixed(
            0
          )}ms (limit: ${timeout}ms)`
        );
        reject(
          new Error(`Bridge request timeout after ${timeout}ms: ${method}`)
        );
      }
    }, timeout);

    const wrappedResolve = (v: any) => {
      clearTimeout(timeoutHandle);
      const elapsed = performance.now() - startTime;
      console.debug(
        `[Bridge Response ${id}] ${method} completed in ${elapsed.toFixed(0)}ms`
      );
      resolve(v);
    };

    const wrappedReject = (e: any) => {
      clearTimeout(timeoutHandle);
      const elapsed = performance.now() - startTime;
      console.error(
        `[Bridge Error ${id}] ${method} failed after ${elapsed.toFixed(0)}ms`,
        e
      );
      reject(e);
    };

    pending.set(id, { resolve: wrappedResolve, reject: wrappedReject });
  });

  try {
    // Write to bridge stdin through Tauri command: bridge_write
    await invoke("bridge_write", { data: payload });
  } catch (error) {
    pending.delete(id);
    throw new Error(`Failed to send bridge request: ${error}`);
  }

  return promise;
}

/**
 * Helper to check if bridge is ready to use
 */
export function isBridgeReady(): boolean {
  return hasTauriInvoke() && isInitialized;
}

/**
 * Batch multiple bridge requests to improve performance
 */
export async function bridgeRequestBatch(
  requests: Array<{ method: string; params?: any }>,
  timeoutMs = 30000
): Promise<any[]> {
  // Send all requests in parallel
  const promises = requests.map((req) =>
    bridgeRequest(req.method, req.params, timeoutMs).catch((error) => {
      console.warn(`Batch request failed: ${req.method}`, error);
      return null; // Return null for failed requests instead of breaking the whole batch
    })
  );

  return Promise.all(promises);
}

/**
 * Wait until Tauri has injected its APIs into the window context.
 * This is required because window.__TAURI__ is NOT available immediately.
 */
export function waitForTauri(): Promise<void> {
  return new Promise((resolve) => {
    const check = () => {
      if ((window as any).__TAURI__) {
        resolve();
      } else {
        requestAnimationFrame(check);
      }
    };
    check();
  });
}
