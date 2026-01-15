import { useState, useEffect, useCallback } from "react";
import { check, Update } from "@tauri-apps/plugin-updater";
import { relaunch } from "@tauri-apps/plugin-process";

export type UpdateStatus = 
  | "idle" 
  | "checking" 
  | "available" 
  | "downloading" 
  | "ready" 
  | "error" 
  | "up-to-date"
  | "dev-mode";

export interface UpdateInfo {
  version: string;
  currentVersion: string;
  body?: string;
  date?: string;
}

export interface UseUpdaterReturn {
  status: UpdateStatus;
  updateInfo: UpdateInfo | null;
  downloadProgress: number;
  error: string | null;
  checkForUpdates: () => Promise<void>;
  downloadAndInstall: () => Promise<void>;
  relaunchApp: () => Promise<void>;
}

// Check if running in development mode
const isDev = import.meta.env.DEV;

export function useUpdater(): UseUpdaterReturn {
  const [status, setStatus] = useState<UpdateStatus>("idle");
  const [updateInfo, setUpdateInfo] = useState<UpdateInfo | null>(null);
  const [downloadProgress, setDownloadProgress] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [update, setUpdate] = useState<Update | null>(null);

  const checkForUpdates = useCallback(async () => {
    // Skip update checks in development mode
    if (isDev) {
      console.log("Skipping update check in development mode");
      setStatus("dev-mode");
      return;
    }

    try {
      setStatus("checking");
      setError(null);
      
      const updateResult = await check();
      
      if (updateResult) {
        setUpdate(updateResult);
        setUpdateInfo({
          version: updateResult.version,
          currentVersion: updateResult.currentVersion,
          body: updateResult.body ?? undefined,
          date: updateResult.date ?? undefined,
        });
        setStatus("available");
      } else {
        setStatus("up-to-date");
        setUpdateInfo(null);
      }
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : String(err);
      // Don't log as error if plugin is not available (e.g., in dev builds)
      if (errorMessage.includes("plugin updater not found")) {
        console.log("Updater plugin not available (development mode)");
        setStatus("dev-mode");
        return;
      }
      console.error("Failed to check for updates:", err);
      setError(errorMessage);
      setStatus("error");
    }
  }, []);

  const downloadAndInstall = useCallback(async () => {
    if (!update) {
      setError("No update available");
      return;
    }

    try {
      setStatus("downloading");
      setDownloadProgress(0);
      
      let downloaded = 0;
      let contentLength = 0;
      
      await update.downloadAndInstall((event) => {
        switch (event.event) {
          case "Started":
            contentLength = event.data.contentLength ?? 0;
            console.log(`Download started, size: ${contentLength} bytes`);
            break;
          case "Progress":
            downloaded += event.data.chunkLength;
            if (contentLength > 0) {
              const progress = Math.round((downloaded / contentLength) * 100);
              setDownloadProgress(progress);
            }
            break;
          case "Finished":
            console.log("Download finished");
            setDownloadProgress(100);
            break;
        }
      });
      
      setStatus("ready");
    } catch (err) {
      console.error("Failed to download update:", err);
      setError(err instanceof Error ? err.message : String(err));
      setStatus("error");
    }
  }, [update]);

  const relaunchApp = useCallback(async () => {
    try {
      await relaunch();
    } catch (err) {
      console.error("Failed to relaunch:", err);
      setError(err instanceof Error ? err.message : String(err));
    }
  }, []);

  // Check for updates on mount (optional - can be triggered manually)
  useEffect(() => {
    // Delay initial check to let the app fully load
    const timer = setTimeout(() => {
      checkForUpdates();
    }, 5000); // Check 5 seconds after app start

    return () => clearTimeout(timer);
  }, [checkForUpdates]);

  return {
    status,
    updateInfo,
    downloadProgress,
    error,
    checkForUpdates,
    downloadAndInstall,
    relaunchApp,
  };
}
