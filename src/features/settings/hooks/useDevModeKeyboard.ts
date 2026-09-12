import { useEffect } from "react";

export const useDevModeKeyboard = (devMode: boolean) => {
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      // Always block hard reload inside the app
      if ((e.ctrlKey || e.metaKey) && (e.key === "r" || e.key === "R")) {
        e.preventDefault();
        e.stopPropagation();
        return;
      }

      if (devMode) return;

      const isDevToolsShortcut =
        (e.ctrlKey && e.shiftKey && ["I", "i", "J", "j", "C", "c"].includes(e.key)) ||
        e.key === "F12";

      if (isDevToolsShortcut) {
        e.preventDefault();
        e.stopPropagation();
      }
    };

    window.addEventListener("keydown", handleKeyDown, true);
    return () => window.removeEventListener("keydown", handleKeyDown, true);
  }, [devMode]);
};
