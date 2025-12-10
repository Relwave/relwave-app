import { useEffect } from "react";
import { useQueryClient } from "@tanstack/react-query";
import {
  startBridgeListeners,
  stopBridgeListeners,
  isBridgeReady,
  waitForTauri
} from "@/services/bridgeClient";

/**
 * Initializes the Tauri bridge once the app is ready.
 * Ensures Tauri APIs are available before calling startBridgeListeners().
 */
export function useBridgeInit() {
  const queryClient = useQueryClient();

  useEffect(() => {
    let cleanupFn: (() => void) | undefined;

    const init = async () => {
      console.log("[BridgeInit] Waiting for Tauri...");
      await waitForTauri(); // 🔥 The magic

      console.log("[BridgeInit] Tauri detected, initializing bridge listeners...");
      await startBridgeListeners();

      const handleBridgeReady = () => {
        console.log("[BridgeInit] bridge.ready event received");
        queryClient.setQueryData(["bridge-ready"], true);
      };

      // Listen for the ready event
      window.addEventListener("bridge:bridge.ready", handleBridgeReady);

      // If bridge was ready instantly, mark as ready
      if (isBridgeReady()) {
        queryClient.setQueryData(["bridge-ready"], true);
      }

      cleanupFn = () => {
        console.log("[BridgeInit] Cleanup listeners");
        window.removeEventListener("bridge:bridge.ready", handleBridgeReady);
        stopBridgeListeners();
      };
    };

    init();

    return () => cleanupFn?.();
  }, [queryClient]);
}
