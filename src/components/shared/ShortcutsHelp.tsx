import * as React from "react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { cn } from "@/lib/utils";

interface ShortcutItem {
  keys: string[];
  label: string;
}

interface ShortcutGroup {
  title: string;
  shortcuts: ShortcutItem[];
}

const shortcutGroups: ShortcutGroup[] = [
  {
    title: "Global",
    shortcuts: [
      { keys: ["Ctrl", "K"], label: "Command Palette" },
      { keys: ["?"], label: "Show Shortcuts" },
      { keys: ["Esc"], label: "Close Dialog / Cancel" },
    ],
  },
  {
    title: "Dashboard",
    shortcuts: [
      { keys: ["/"], label: "Search Connections" },
      { keys: ["Alt", "N"], label: "New Connection" },
    ],
  },
  {
    title: "Database Detail",
    shortcuts: [
      { keys: ["Ctrl", "Enter"], label: "Execute SQL Query" },
      { keys: ["Ctrl", "S"], label: "Save Query / Changes" },
      { keys: ["Ctrl", "F"], label: "Find in Data / SQL" },
    ],
  },
  {
    title: "Navigation",
    shortcuts: [
      { keys: ["Alt", "1"], label: "Go to Dashboard" },
      { keys: ["Alt", "2"], label: "Go to Projects" },
      { keys: ["Alt", "3"], label: "Go to Settings" },
    ],
  },
];

export function ShortcutsHelp({ open, onOpenChange }: { open?: boolean, onOpenChange?: (open: boolean) => void }) {
  const [internalOpen, setInternalOpen] = React.useState(false);

  // Sync with prop if provided, otherwise manage internally
  const isOpen = open !== undefined ? open : internalOpen;
  const setIsOpen = onOpenChange !== undefined ? onOpenChange : setInternalOpen;

  React.useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      // Don't trigger if typing in an input or textarea
      if (
        e.target instanceof HTMLInputElement ||
        e.target instanceof HTMLTextAreaElement ||
        (e.target as HTMLElement).isContentEditable
      ) {
        return;
      }

      if (e.key === "?" && !e.ctrlKey && !e.metaKey) {
        setIsOpen(true);
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [setIsOpen]);

  return (
    <Dialog open={isOpen} onOpenChange={setIsOpen}>
      <DialogContent className="sm:max-w-[550px] bg-sidebar/95 backdrop-blur-xl border-sidebar-border">
        <DialogHeader>
          <DialogTitle className="text-xl font-bold flex items-center gap-2">
            Keyboard Shortcuts
          </DialogTitle>
        </DialogHeader>
        <div className="grid grid-cols-2 gap-8 py-4">
          {shortcutGroups.map((group) => (
            <div key={group.title} className="space-y-4">
              <h3 className="text-sm font-semibold text-primary/80 uppercase tracking-wider">
                {group.title}
              </h3>
              <div className="space-y-3">
                {group.shortcuts.map((shortcut) => (
                  <div key={shortcut.label} className="flex items-center justify-between group">
                    <span className="text-sm text-muted-foreground group-hover:text-foreground transition-colors">
                      {shortcut.label}
                    </span>
                    <div className="flex gap-1">
                      {shortcut.keys.map((key) => (
                        <kbd
                          key={key}
                          className="pointer-events-none inline-flex h-5 select-none items-center gap-1 rounded border border-sidebar-border bg-sidebar-accent px-1.5 font-mono text-[10px] font-medium text-sidebar-accent-foreground opacity-100"
                        >
                          {key}
                        </kbd>
                      ))}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>
        <div className="mt-4 pt-4 border-t border-sidebar-border text-center">
          <p className="text-[10px] text-muted-foreground italic">
            Press <kbd className="font-mono px-1 border rounded bg-muted/20">Esc</kbd> to close
          </p>
        </div>
      </DialogContent>
    </Dialog>
  );
}
