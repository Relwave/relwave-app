import { loadAISettings, type AISettings } from "@/services/bridge/ai";
import { useEffect, useState } from "react";

const DEFAULT: AISettings = { defaultProvider: "openai" };

/**
 * Reads AISettings from the bridge (ai-settings.json on disk).
 * Returns a stable object that is refreshed whenever the settings dialog saves.
 *
 * Because saving goes through the bridge and NOT localStorage, the old
 * StorageEvent trick no longer applies. Instead, callers that need fresh
 * settings after a save should re-mount or call `reload()`.
 */
export function useAISettings(): { settings: AISettings; isLoading: boolean; reload: () => void } {
  const [settings, setSettings] = useState<AISettings>(DEFAULT);
  const [isLoading, setIsLoading] = useState(true);
  const [tick, setTick] = useState(0);

  useEffect(() => {
    setIsLoading(true);
    loadAISettings().then((loaded) => {
      setSettings(loaded);
      setIsLoading(false);
    });
  }, [tick]);

  const reload = () => setTick((t) => t + 1);

  return { settings, isLoading, reload };
}
