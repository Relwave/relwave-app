import { loadAISettings, getCachedAISettings, type AISettings } from "@/services/bridge/ai";
import { useEffect, useState, useCallback } from "react";

const DEFAULT: AISettings = { defaultProvider: "openai" };

/**
 * Reads AISettings from the bridge (ai-settings.json on disk) with instant memory cache.
 */
export function useAISettings(): { settings: AISettings; isLoading: boolean; reload: () => void } {
  const cached = getCachedAISettings();
  const [settings, setSettings] = useState<AISettings>(cached ?? DEFAULT);
  const [isLoading, setIsLoading] = useState(!cached);
  const [tick, setTick] = useState(0);

  useEffect(() => {
    let active = true;
    if (!cached) {
      setIsLoading(true);
    }
    loadAISettings().then((loaded) => {
      if (active) {
        setSettings(loaded);
        setIsLoading(false);
      }
    });
    return () => {
      active = false;
    };
  }, [tick, cached]);

  const reload = useCallback(() => {
    loadAISettings({ forceRefresh: true }).then((loaded) => {
      setSettings(loaded);
    });
    setTick((t) => t + 1);
  }, []);

  return { settings, isLoading, reload };
}
