import { useEffect, useState } from "react";
import { ThemeVariant, defaultVariant, themeVariants } from "@/lib/themes";

const STORAGE_KEY = "relwave-theme-variant";

export function useThemeVariant() {
  const [variant, setVariantState] = useState<ThemeVariant>(() => {
    const stored = localStorage.getItem(STORAGE_KEY);
    if (stored && stored in themeVariants) {
      return stored as ThemeVariant;
    }
    return defaultVariant;
  });

  useEffect(() => {
    const root = document.documentElement;
    root.setAttribute("data-theme-variant", variant);
  }, [variant]);

  const setVariant = (newVariant: ThemeVariant) => {
    localStorage.setItem(STORAGE_KEY, newVariant);
    setVariantState(newVariant);
  };

  return { variant, setVariant };
}
