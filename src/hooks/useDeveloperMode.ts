import { useState, useEffect, useCallback } from "react";

const STORAGE_KEY = "relwave-developer-mode";

export function useDeveloperMode() {
    const [isEnabled, setIsEnabled] = useState<boolean>(() => {
        const stored = localStorage.getItem(STORAGE_KEY);
        return stored === "true";
    });

    useEffect(() => {
        localStorage.setItem(STORAGE_KEY, String(isEnabled));
        
        // Dispatch custom event for other components to listen
        window.dispatchEvent(new CustomEvent("developer-mode-change", { 
            detail: { enabled: isEnabled } 
        }));
    }, [isEnabled]);

    const toggle = useCallback(() => {
        setIsEnabled(prev => !prev);
    }, []);

    return {
        isEnabled,
        setIsEnabled,
        toggle,
    };
}

// Helper to get current dev mode status (for non-hook contexts)
export function getDeveloperMode(): boolean {
    return localStorage.getItem(STORAGE_KEY) === "true";
}
