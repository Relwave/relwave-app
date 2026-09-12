import { useEffect, useState } from "react";
import { getDeveloperMode } from "./useDeveloperMode";

export const useDevMode = () => {
  const [devMode, setDevMode] = useState(getDeveloperMode);

  useEffect(() => {
    const handleChange = (e: CustomEvent<{ enabled: boolean }>) => {
      setDevMode(e.detail.enabled);
    };

    window.addEventListener("developer-mode-change", handleChange as EventListener);
    return () => window.removeEventListener("developer-mode-change", handleChange as EventListener);
  }, []);

  return devMode;
};
