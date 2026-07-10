import { useState } from "react";
import { AISettings, AIHistoryPanel, CheckForUpdates, ColorVariant, DeveloperMode, ThemeMode, Version, AnalyticsSettings } from "@/features/settings/components";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogTitle } from "@/components/ui/dialog";

type TabId = "general" | "ai" | "analytics" | "shortcuts" | "about";

interface Tab {
  id: TabId;
  label: string;
}

const TABS: Tab[] = [
  { id: "general", label: "General" },
  { id: "ai", label: "AI Providers" },
  { id: "analytics", label: "Analytics" },
  { id: "shortcuts", label: "Shortcuts" },
  { id: "about", label: "About" },
];

export interface SettingsDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function SettingsDialog({ open, onOpenChange }: SettingsDialogProps) {
  const [activeTab, setActiveTab] = useState<TabId>("general");

  return (
    <Dialog modal={false} open={open} onOpenChange={onOpenChange}>
      <DialogContent className="w-[90vw] sm:max-w-[1100px] p-0 gap-0 overflow-hidden bg-background border-border/20 rounded-xl shadow-2xl h-[70vh] min-h-[600px] max-h-[800px] flex flex-col duration-300 ease-out data-[state=open]:slide-in-from-top-2 data-[state=closed]:slide-out-to-top-2 transition-[background-color,border-color,box-shadow] [&>button]:top-4 [&>button]:right-6 [&>button]:text-muted-foreground [&>button:hover]:text-foreground [&>button]:p-1.5 [&>button]:rounded-md [&>button:hover]:bg-accent [&>button]:transition-colors">        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-border/10 transition-colors duration-300">
          <DialogTitle className="text-lg font-semibold text-foreground tracking-tight">Settings</DialogTitle>
        </div>

        {/* Body */}
        <div className="flex flex-1 overflow-hidden w-full">
          {/* Sidebar */}
          <div className="w-64 border-r border-border/10 p-4 space-y-1 flex flex-col bg-muted/30 transition-colors duration-300">            {TABS.map((tab) => (
            <Button
              key={tab.id}
              type="button"
              variant="ghost"
              onClick={() => setActiveTab(tab.id)}
              className={cn(
                "h-9 w-full justify-start rounded-lg px-3 text-sm transition-colors duration-200",
                activeTab === tab.id
                  ? "bg-primary/20 text-primary hover:bg-primary/20 hover:text-primary"
                  : "text-muted-foreground hover:text-foreground hover:bg-accent"
              )}
            >
              {tab.label}
            </Button>
          ))}
          </div>

          {/* Content Area */}
          <div className="flex-1 overflow-y-auto p-10 bg-background transition-colors duration-300">
            <div className="max-w-2xl">
              {activeTab === "general" && (
                <div className="space-y-8">
                  <ThemeMode />
                  <ColorVariant />

                </div>
              )}

              {activeTab === "ai" && (
                <div className="space-y-8">
                  <AISettings />
                  <AIHistoryPanel />
                </div>
              )}

              {activeTab === "analytics" && (
                <div className="space-y-8">
                  <AnalyticsSettings />
                </div>
              )}

              {activeTab === "shortcuts" && (
                <div className="space-y-8">
                  <p className="text-muted-foreground text-sm">Keyboard shortcuts will be available here.</p>
                </div>
              )}

              {activeTab === "about" && (
                <div className="space-y-8">
                  <Version />
                  <CheckForUpdates />
                  <DeveloperMode />
                </div>
              )}
            </div>
          </div>
        </div>

        {/* Footer */}
        <div className="flex items-center justify-end px-6 py-4 border-t border-border/10 gap-3 bg-muted/30 transition-colors duration-300">
          <Button
            type="button"
            variant="ghost"
            onClick={() => onOpenChange(false)}
          >
            Close
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
