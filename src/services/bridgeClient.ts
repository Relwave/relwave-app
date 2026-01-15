// src/renderer/src/services/bridgeClient.ts
import { invoke } from "@tauri-apps/api/core";
import { listen, type UnlistenFn } from "@tauri-apps/api/event";

type Pending = { resolve: (v: any) => void; reject: (e: any) => void };
const pending = new Map<number, Pending>();
let nextId = 1;

let isInitialized = false;
let unlistenStdout: UnlistenFn | null = null;
let unlistenStderr: UnlistenFn | null = null;

// Connection health tracking
let lastSuccessfulRequest = Date.now();
let lastHealthCheckTime = Date.now();
let connectionHealthy = true;
let healthCheckInterval: ReturnType<typeof setInterval> | null = null;
let reconnectAttempts = 0;
let isReconnecting = false; // Prevent concurrent reconnection attempts
const MAX_RECONNECT_ATTEMPTS = 3;
const HEALTH_CHECK_INTERVAL = 30000; // 30 seconds
const CONNECTION_TIMEOUT = 60000; // Consider unhealthy after 60s of no successful requests
const SLEEP_DETECTION_THRESHOLD = 60000; // If interval fires 60s+ late, system likely slept

// Listeners for connection state changes
type ConnectionStateListener = (healthy: boolean) => void;
const connectionStateListeners = new Set<ConnectionStateListener>();

export function onConnectionStateChange(listener: ConnectionStateListener): () => void {
  connectionStateListeners.add(listener);
  return () => connectionStateListeners.delete(listener);
}

function notifyConnectionState(healthy: boolean) {
  connectionHealthy = healthy;
  connectionStateListeners.forEach(listener => listener(healthy));
}

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
              // Track successful response - connection is healthy
              lastSuccessfulRequest = Date.now();
              if (!connectionHealthy) {
                console.log("bridgeClient: Connection restored");
                notifyConnectionState(true);
                reconnectAttempts = 0;
              }
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
    connectionHealthy = true;
    lastSuccessfulRequest = Date.now();
    
    // Start health check interval
    startHealthCheck();
    
    // Listen for visibility changes (tab/app becomes visible)
    setupVisibilityHandler();
    
    console.log("bridgeClient: Listeners initialized");
  } catch (error) {
    console.error("bridgeClient: Failed to initialize listeners", error);
    throw error;
  }
}

let visibilityHandler: (() => void) | null = null;

/**
 * Setup handler for when app becomes visible after being hidden
 */
function setupVisibilityHandler(): void {
  if (visibilityHandler) {
    document.removeEventListener("visibilitychange", visibilityHandler);
  }
  
  visibilityHandler = async () => {
    if (document.visibilityState === "visible" && isInitialized) {
      console.log("bridgeClient: App became visible, verifying connection...");
      
      // Reset timestamp to avoid immediate health check trigger
      lastSuccessfulRequest = Date.now();
      
      // Small delay for system to stabilize
      await new Promise(resolve => setTimeout(resolve, 500));
      
      // Quick health check
      try {
        const status = await invoke<string>("bridge_status");
        if (status === "running") {
          await bridgeRequestInternal("ping", {}, 5000);
          console.log("bridgeClient: Connection OK after visibility change");
          lastSuccessfulRequest = Date.now();
          if (!connectionHealthy) {
            notifyConnectionState(true);
            reconnectAttempts = 0;
          }
        } else {
          console.warn("bridgeClient: Bridge not running after visibility change");
          await handleBridgeReconnect();
        }
      } catch (error) {
        console.warn("bridgeClient: Connection check failed after visibility change:", error);
        // Don't immediately reconnect - the health check will handle it if needed
      }
    }
  };
  
  document.addEventListener("visibilitychange", visibilityHandler);
}

/**
 * Start periodic health checks
 */
function startHealthCheck(): void {
  if (healthCheckInterval) {
    clearInterval(healthCheckInterval);
  }
  
  lastHealthCheckTime = Date.now();
  
  healthCheckInterval = setInterval(async () => {
    const now = Date.now();
    const timeSinceLastHealthCheck = now - lastHealthCheckTime;
    lastHealthCheckTime = now;
    
    // Detect system wake from sleep - if interval fired much later than expected
    if (timeSinceLastHealthCheck > HEALTH_CHECK_INTERVAL + SLEEP_DETECTION_THRESHOLD) {
      console.log(`bridgeClient: System likely woke from sleep (${Math.round(timeSinceLastHealthCheck / 1000)}s since last check)`);
      // Reset the timestamp to give the system time to stabilize
      lastSuccessfulRequest = now;
      reconnectAttempts = 0;
      
      // Wait a moment for system to stabilize after wake
      await new Promise(resolve => setTimeout(resolve, 2000));
      
      // Do a gentle health check
      try {
        const status = await invoke<string>("bridge_status");
        if (status === "running") {
          // Try a ping to verify connection is actually working
          await bridgeRequestInternal("ping", {}, 10000);
          console.log("bridgeClient: Connection verified after wake");
          lastSuccessfulRequest = Date.now();
          if (!connectionHealthy) {
            notifyConnectionState(true);
          }
        } else {
          console.warn(`bridgeClient: Bridge not running after wake (status: ${status})`);
          await handleBridgeReconnect();
        }
      } catch (error) {
        console.warn("bridgeClient: Health check failed after wake, attempting reconnect...", error);
        await handleBridgeReconnect();
      }
      return;
    }
    
    // Normal health check - only if no recent successful communication
    const timeSinceLastSuccess = now - lastSuccessfulRequest;
    
    if (timeSinceLastSuccess > CONNECTION_TIMEOUT && connectionHealthy) {
      console.warn("bridgeClient: No recent successful requests, checking health...");
      
      // First check if the bridge process is still running
      try {
        const status = await invoke<string>("bridge_status");
        if (status !== "running") {
          console.warn(`bridgeClient: Bridge process not running (status: ${status}), attempting restart...`);
          notifyConnectionState(false);
          await handleBridgeReconnect();
          return;
        }
      } catch (statusError) {
        console.error("bridgeClient: Failed to check bridge status:", statusError);
      }
      
      // If process is running, try a ping
      try {
        // Try a simple ping request - the bridge uses "ping" not "session.ping"
        await bridgeRequestInternal("ping", {}, 5000);
        lastSuccessfulRequest = Date.now();
        // Reset reconnect attempts on successful health check
        reconnectAttempts = 0;
      } catch (error) {
        console.error("bridgeClient: Health check ping failed", error);
        notifyConnectionState(false);
        
        // If ping failed, try to restart
        if (isPipeError(error)) {
          await handleBridgeReconnect();
        }
      }
    }
  }, HEALTH_CHECK_INTERVAL);
}

/**
 * Handle bridge reconnection with deduplication
 */
async function handleBridgeReconnect(): Promise<void> {
  if (isReconnecting) {
    console.log("bridgeClient: Reconnection already in progress, skipping...");
    return;
  }
  
  isReconnecting = true;
  try {
    await reinitializeBridge();
  } catch (reinitError) {
    console.error("bridgeClient: Failed to reinitialize:", reinitError);
  } finally {
    isReconnecting = false;
  }
}

/**
 * stopBridgeListeners()
 * - Cleanup function to remove listeners
 * - Call this when your component unmounts
 */
export function stopBridgeListeners(): void {
  if (healthCheckInterval) {
    clearInterval(healthCheckInterval);
    healthCheckInterval = null;
  }
  if (visibilityHandler) {
    document.removeEventListener("visibilitychange", visibilityHandler);
    visibilityHandler = null;
  }
  if (unlistenStdout) {
    unlistenStdout();
    unlistenStdout = null;
  }
  if (unlistenStderr) {
    unlistenStderr();
    unlistenStderr = null;
  }
  isInitialized = false;
  connectionHealthy = false;
  isReconnecting = false;
  console.log("bridgeClient: Listeners stopped");
}

/**
 * Get appropriate timeout for different operations
 */
function getTimeoutForMethod(method: string): number {
  // Ping should be fast
  if (method === "ping" || method === "health.ping") return 5000; // 5 seconds
  
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
 * Check if an error indicates a broken pipe/connection
 */
function isPipeError(error: any): boolean {
  const errorStr = String(error).toLowerCase();
  return (
    errorStr.includes("pipe") ||
    errorStr.includes("os error 232") ||
    errorStr.includes("broken") ||
    errorStr.includes("closed") ||
    errorStr.includes("disconnected")
  );
}

/**
 * Internal bridge request without retry logic
 */
async function bridgeRequestInternal(
  method: string,
  params?: any,
  timeoutMs?: number
): Promise<any> {
  const timeout = timeoutMs ?? getTimeoutForMethod(method);
  
  if (!hasTauriInvoke()) {
    throw new Error(
      "Tauri runtime not available. Run inside the Tauri app (pnpm tauri dev) or provide a browser fallback."
    );
  }

  if (!isInitialized) {
    throw new Error(
      "Bridge client not initialized. Call startBridgeListeners() first."
    );
  }

  const id = nextId++;
  const req = { id, method, params };
  const payload = JSON.stringify(req);

  const startTime = performance.now();
  console.debug(`[Bridge Request ${id}] ${method}`, params);

  const promise = new Promise((resolve, reject) => {
    const timeoutHandle = setTimeout(() => {
      if (pending.has(id)) {
        pending.delete(id);
        const elapsed = performance.now() - startTime;
        console.error(
          `[Bridge Timeout ${id}] ${method} after ${elapsed.toFixed(0)}ms (limit: ${timeout}ms)`
        );
        reject(new Error(`Bridge request timeout after ${timeout}ms: ${method}`));
      }
    }, timeout);

    const wrappedResolve = (v: any) => {
      clearTimeout(timeoutHandle);
      const elapsed = performance.now() - startTime;
      console.debug(`[Bridge Response ${id}] ${method} completed in ${elapsed.toFixed(0)}ms`);
      resolve(v);
    };

    const wrappedReject = (e: any) => {
      clearTimeout(timeoutHandle);
      const elapsed = performance.now() - startTime;
      console.error(`[Bridge Error ${id}] ${method} failed after ${elapsed.toFixed(0)}ms`, e);
      reject(e);
    };

    pending.set(id, { resolve: wrappedResolve, reject: wrappedReject });
  });

  try {
    await invoke("bridge_write", { data: payload });
  } catch (error) {
    pending.delete(id);
    throw new Error(`Failed to send bridge request: ${error}`);
  }

  return promise;
}

/**
 * bridgeRequest - Send a JSON-RPC request to the bridge process with automatic retry
 * @param method - The JSON-RPC method name
 * @param params - The parameters for the method
 * @param timeoutMs - Request timeout in milliseconds (auto-determined if not provided)
 */
export async function bridgeRequest(
  method: string,
  params?: any,
  timeoutMs?: number
): Promise<any> {
  const maxRetries = 2;
  let lastError: any;

  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    try {
      const result = await bridgeRequestInternal(method, params, timeoutMs);
      return result;
    } catch (error) {
      lastError = error;
      
      // Check if this is a pipe/connection error
      if (isPipeError(error)) {
        console.warn(`[Bridge] Pipe error on attempt ${attempt + 1}/${maxRetries + 1}:`, error);
        notifyConnectionState(false);
        
        if (attempt < maxRetries) {
          // Wait before retry, increasing delay with each attempt
          const delay = Math.min(1000 * Math.pow(2, attempt), 5000);
          console.log(`[Bridge] Retrying in ${delay}ms...`);
          await new Promise(resolve => setTimeout(resolve, delay));
          
          // Try to reinitialize the connection
          try {
            await reinitializeBridge();
          } catch (reinitError) {
            console.error("[Bridge] Failed to reinitialize:", reinitError);
          }
          continue;
        }
      }
      
      // For non-pipe errors or if we've exhausted retries, throw
      throw error;
    }
  }

  throw lastError;
}

/**
 * Attempt to reinitialize the bridge connection
 */
async function reinitializeBridge(): Promise<void> {
  if (reconnectAttempts >= MAX_RECONNECT_ATTEMPTS) {
    console.error("[Bridge] Max reconnect attempts reached");
    throw new Error("Max reconnect attempts reached. Please restart the application.");
  }
  
  reconnectAttempts++;
  console.log(`[Bridge] Reinitializing (attempt ${reconnectAttempts}/${MAX_RECONNECT_ATTEMPTS})...`);
  
  // Stop existing listeners
  stopBridgeListeners();
  
  // Wait a bit for cleanup
  await new Promise(resolve => setTimeout(resolve, 500));
  
  // Try to restart the bridge process on the Rust side
  try {
    console.log("[Bridge] Requesting bridge restart from Rust...");
    await invoke("bridge_restart");
    console.log("[Bridge] Bridge process restarted successfully");
  } catch (rustError) {
    console.error("[Bridge] Failed to restart bridge process:", rustError);
    // Continue anyway - listeners restart might help
  }
  
  // Wait for the new bridge process to be ready
  await new Promise(resolve => setTimeout(resolve, 1000));
  
  // Restart listeners
  await startBridgeListeners();
  
  console.log("[Bridge] Reinitialized successfully");
}

/**
 * Helper to check if bridge is ready to use
 */
export function isBridgeReady(): boolean {
  return hasTauriInvoke() && isInitialized;
}

/**
 * Helper to check if bridge connection is healthy
 */
export function isBridgeHealthy(): boolean {
  return connectionHealthy;
}

/**
 * Check bridge process status from Rust side
 */
export async function checkBridgeStatus(): Promise<string> {
  if (!hasTauriInvoke()) {
    return "not_available";
  }
  try {
    return await invoke<string>("bridge_status");
  } catch (error) {
    console.error("[Bridge] Failed to check status:", error);
    return "error";
  }
}

/**
 * Manually restart the bridge (can be called from UI)
 */
export async function restartBridge(): Promise<boolean> {
  if (!hasTauriInvoke()) {
    return false;
  }
  
  try {
    console.log("[Bridge] Manual restart requested...");
    stopBridgeListeners();
    
    await invoke("bridge_restart");
    
    // Wait for the new bridge process to be ready
    await new Promise(resolve => setTimeout(resolve, 1000));
    
    await startBridgeListeners();
    
    // Reset reconnect attempts on successful manual restart
    reconnectAttempts = 0;
    notifyConnectionState(true);
    
    console.log("[Bridge] Manual restart completed successfully");
    return true;
  } catch (error) {
    console.error("[Bridge] Manual restart failed:", error);
    notifyConnectionState(false);
    return false;
  }
}

/**
 * Reset reconnect attempts counter (call after successful manual recovery)
 */
export function resetReconnectAttempts(): void {
  reconnectAttempts = 0;
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
