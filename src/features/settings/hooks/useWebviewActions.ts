import { useCallback } from "react";
import { invoke } from "@tauri-apps/api/core";

export const useWebviewActions = () => {
  const reload = useCallback(async () => {
    try {
      await invoke("reload_webview");
    } catch {
      window.location.reload();
    }
  }, []);

  const goBack = useCallback(async () => {
    try {
      await invoke("navigate_back");
    } catch {
      window.history.back();
    }
  }, []);

  const goForward = useCallback(async () => {
    try {
      await invoke("navigate_forward");
    } catch {
      window.history.forward();
    }
  }, []);

  const openDevtools = useCallback(async () => {
    try {
      await invoke("open_devtools");
    } catch (e) {
      console.error("Failed to open devtools:", e);
    }
  }, []);

  const copy = useCallback(() => document.execCommand("copy"), []);
  const cut = useCallback(() => document.execCommand("cut"), []);

  const paste = useCallback(async () => {
    try {
      const text = await navigator.clipboard.readText();
      document.execCommand("insertText", false, text);
    } catch {
      document.execCommand("paste");
    }
  }, []);

  return { reload, goBack, goForward, openDevtools, copy, cut, paste };
};
