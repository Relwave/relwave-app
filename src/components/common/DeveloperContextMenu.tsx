import { useEffect, useState, useCallback } from "react";
import { invoke } from "@tauri-apps/api/core";
import {
    ContextMenu,
    ContextMenuContent,
    ContextMenuItem,
    ContextMenuSeparator,
    ContextMenuTrigger,
    ContextMenuShortcut,
} from "@/components/ui/context-menu";
import {
    ArrowLeft,
    ArrowRight,
    RefreshCw,
    Bug,
    Copy,
    ClipboardPaste,
    Scissors,
} from "lucide-react";
import { getDeveloperMode } from "@/hooks/useDeveloperMode";

interface DeveloperContextMenuProps {
    children: React.ReactNode;
}

export function DeveloperContextMenu({ children }: DeveloperContextMenuProps) {
    const [devMode, setDevMode] = useState(getDeveloperMode);

    // Listen for developer mode changes
    useEffect(() => {
        const handleChange = (e: CustomEvent<{ enabled: boolean }>) => {
            setDevMode(e.detail.enabled);
        };

        window.addEventListener("developer-mode-change", handleChange as EventListener);
        return () => {
            window.removeEventListener("developer-mode-change", handleChange as EventListener);
        };
    }, []);

    // Block dev tools keyboard shortcuts when dev mode is disabled
    useEffect(() => {
        const handleKeyDown = (e: KeyboardEvent) => {
            if (devMode) return; // Allow shortcuts when dev mode is enabled

            // Block Ctrl+Shift+I, Ctrl+Shift+J, Ctrl+Shift+C, F12
            if (
                (e.ctrlKey && e.shiftKey && (e.key === 'I' || e.key === 'i' || e.key === 'J' || e.key === 'j' || e.key === 'C' || e.key === 'c')) ||
                e.key === 'F12'
            ) {
                e.preventDefault();
                e.stopPropagation();
            }
        };

        window.addEventListener('keydown', handleKeyDown, true);
        return () => {
            window.removeEventListener('keydown', handleKeyDown, true);
        };
    }, [devMode]);

    const handleReload = useCallback(async () => {
        try {
            await invoke("reload_webview");
        } catch (e) {
            console.error("Failed to reload:", e);
            window.location.reload();
        }
    }, []);

    const handleBack = useCallback(async () => {
        try {
            await invoke("navigate_back");
        } catch (e) {
            console.error("Failed to navigate back:", e);
            window.history.back();
        }
    }, []);

    const handleForward = useCallback(async () => {
        try {
            await invoke("navigate_forward");
        } catch (e) {
            console.error("Failed to navigate forward:", e);
            window.history.forward();
        }
    }, []);

    const handleInspect = useCallback(async () => {
        try {
            await invoke("open_devtools");
        } catch (e) {
            console.error("Failed to open devtools:", e);
        }
    }, []);

    const handleCopy = useCallback(() => {
        document.execCommand("copy");
    }, []);

    const handleCut = useCallback(() => {
        document.execCommand("cut");
    }, []);

    const handlePaste = useCallback(async () => {
        try {
            const text = await navigator.clipboard.readText();
            document.execCommand("insertText", false, text);
        } catch (e) {
            document.execCommand("paste");
        }
    }, []);

    // If developer mode is disabled, block all context menus
    if (!devMode) {
        return (
            <div 
                className="contents" 
                onContextMenu={(e) => e.preventDefault()}
            >
                {children}
            </div>
        );
    }

    return (
        <ContextMenu>
            <ContextMenuTrigger asChild>
                <div className="contents">{children}</div>
            </ContextMenuTrigger>
            <ContextMenuContent className="w-56">
                <ContextMenuItem onClick={handleBack} className="gap-2">
                    <ArrowLeft className="h-4 w-4" />
                    Back
                    <ContextMenuShortcut>Alt+←</ContextMenuShortcut>
                </ContextMenuItem>
                <ContextMenuItem onClick={handleForward} className="gap-2">
                    <ArrowRight className="h-4 w-4" />
                    Forward
                    <ContextMenuShortcut>Alt+→</ContextMenuShortcut>
                </ContextMenuItem>
                <ContextMenuItem onClick={handleReload} className="gap-2">
                    <RefreshCw className="h-4 w-4" />
                    Reload
                    <ContextMenuShortcut>Ctrl+R</ContextMenuShortcut>
                </ContextMenuItem>
                <ContextMenuSeparator />
                <ContextMenuItem onClick={handleInspect} className="gap-2">
                    <Bug className="h-4 w-4" />
                    Inspect Element
                    <ContextMenuShortcut>F12</ContextMenuShortcut>
                </ContextMenuItem>
            </ContextMenuContent>
        </ContextMenu>
    );
}
