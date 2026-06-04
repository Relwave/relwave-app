import { loadAISettings, type AISettings } from "@/services/bridge/ai";
import { useEffect, useState } from "react";

/**
 * Reads AISettings from localStorage and stays in sync when
 * the user updates them in the Settings page during the same session.
 */
export function useAISettings(): AISettings {
  const [settings, setSettings] = useState<AISettings>(loadAISettings);

  useEffect(() => {
    const onStorage = (e: StorageEvent) => {
      if (e.key === "relwave:ai-settings") {
        setSettings(loadAISettings());
      }
    };
    window.addEventListener("storage", onStorage);
    return () => window.removeEventListener("storage", onStorage);
  }, []);

  return settings;
}
