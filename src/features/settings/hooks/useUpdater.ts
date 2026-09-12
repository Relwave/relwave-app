import { useState, useEffect, useCallback } from "react";
import { check, Update } from "@tauri-apps/plugin-updater";
import { relaunch } from "@tauri-apps/plugin-process";
import { invoke } from "@tauri-apps/api/core";

const LAST_INSTALLED_UPDATE_KEY = "relwave:last-installed-update";
const RELEASES_URL = "https://github.com/Relwave/relwave-app/releases/latest";

export type UpdateStatus =
  "idle" | "checking" | "available" | "downloading" | "ready" | "error" | "up-to-date" | "dev-mode";

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
const isLinuxRuntime = typeof navigator !== "undefined" && /linux/i.test(navigator.userAgent);

function normalizeUpdaterErrorMessage(message: string): string {
  const normalized = message.trim();
  const isPermissionError = /permission denied|os error 13/i.test(normalized);

  if (isLinuxRuntime && isPermissionError) {
    return [
      "Linux updater could not replace the installed app due to file permissions.",
      "If you installed via .deb/.rpm (system path), use manual update from:",
      RELEASES_URL,
    ].join(" ");
  }

  return normalized;
}

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
      setError(normalizeUpdaterErrorMessage(errorMessage));
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

      // Kill the bridge process BEFORE the installer runs so that it releases
      // its file-handle on better_sqlite3.node (and other bundled resources).
      // Without this, the NSIS installer throws "Error opening file for writing"
      // because the native module is still memory-mapped by the bridge process.
      try {
        await invoke("bridge_kill");
        // Give the OS a moment to fully release the file handles.
        await new Promise((r) => setTimeout(r, 800));
      } catch {
        // Non-fatal: if the bridge is already dead, continue with the update.
      }

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

      if (updateInfo?.version) {
        try {
          localStorage.setItem(
            LAST_INSTALLED_UPDATE_KEY,
            JSON.stringify({
              version: updateInfo.version,
              body: updateInfo.body,
              date: updateInfo.date,
              previousVersion: updateInfo.currentVersion,
              installedAt: new Date().toISOString(),
            }),
          );
        } catch {
          // Non-blocking: if storage fails we still complete update flow.
        }
      }

      setStatus("ready");
    } catch (err) {
      console.error("Failed to download update:", err);
      const errorMessage = err instanceof Error ? err.message : String(err);
      setError(normalizeUpdaterErrorMessage(errorMessage));
      setStatus("error");
    }
  }, [update, updateInfo]);

  const relaunchApp = useCallback(async () => {
    try {
      await relaunch();
    } catch (err) {
      console.error("Failed to relaunch:", err);
      const errorMessage = err instanceof Error ? err.message : String(err);
      setError(normalizeUpdaterErrorMessage(errorMessage));
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
