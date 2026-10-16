import { useState } from "react";
import { Plus, X, AlertCircle, CheckCircle2, Loader2, FileCode } from "lucide-react";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { cn } from "@/lib/utils";
import { QueryTab } from "../types";

interface QueryTabBarProps {
  tabs: QueryTab[];
  activeTabId: string;
  onTabSelect: (tabId: string) => void;
  onTabClose: (tabId: string, e: React.MouseEvent) => void;
  onNewTab: () => void;
  onTabRename?: (tabId: string, newName: string) => void;
}

export function QueryTabBar({
  tabs,
  activeTabId,
  onTabSelect,
  onTabClose,
  onNewTab,
  onTabRename,
}: QueryTabBarProps) {
  const [editingTabId, setEditingTabId] = useState<string | null>(null);
  const [editingName, setEditingName] = useState("");

  const handleStartRename = (tab: QueryTab, e: React.MouseEvent) => {
    e.stopPropagation();
    setEditingTabId(tab.id);
    setEditingName(tab.name);
  };

  const handleSaveRename = (tabId: string) => {
    if (editingName.trim() && onTabRename) {
      onTabRename(tabId, editingName.trim());
    }
    setEditingTabId(null);
  };

  return (
    <div className="h-9 border-b border-border/40 bg-muted/10 flex items-center gap-0 overflow-x-auto shrink-0 select-none">
      {tabs.map((tab) => (
        <button
          key={tab.id}
          onClick={() => onTabSelect(tab.id)}
          className={cn(
            "h-full px-3 flex items-center gap-2 border-r border-border/30 min-w-[120px] max-w-[200px] group transition-colors",
            activeTabId === tab.id
              ? "bg-background text-foreground"
              : "text-muted-foreground hover:text-foreground hover:bg-muted/30",
          )}
        >
          <FileCode className="h-3.5 w-3.5 shrink-0" />
          {editingTabId === tab.id ? (
            <input
              type="text"
              value={editingName}
              onChange={(e) => setEditingName(e.target.value)}
              onBlur={() => handleSaveRename(tab.id)}
              onKeyDown={(e) => {
                if (e.key === "Enter") handleSaveRename(tab.id);
                if (e.key === "Escape") setEditingTabId(null);
              }}
              autoFocus
              className="text-xs bg-background border border-primary/50 rounded px-1 py-0.5 w-24 text-foreground outline-none font-mono"
              onClick={(e) => e.stopPropagation()}
            />
          ) : (
            <span
              className="text-xs truncate flex-1 font-mono text-left"
              onDoubleClick={(e) => handleStartRename(tab, e)}
              title="Double-click to rename"
            >
              {tab.name}
            </span>
          )}
          {tab.status === "running" && (
            <Loader2 className="h-3 w-3 animate-spin text-primary shrink-0" />
          )}
          {tab.status === "success" && (
            <CheckCircle2 className="h-3 w-3 text-emerald-500 shrink-0" />
          )}
          {tab.status === "error" && <AlertCircle className="h-3 w-3 text-destructive shrink-0" />}
          {tabs.length > 1 && (
            <button
              onClick={(e) => onTabClose(tab.id, e)}
              className="opacity-0 group-hover:opacity-100 hover:bg-muted rounded p-0.5 shrink-0"
              title="Close tab"
            >
              <X className="h-3 w-3" />
            </button>
          )}
        </button>
      ))}
      <Tooltip>
        <TooltipTrigger asChild>
          <button
            onClick={onNewTab}
            className="h-full px-3 text-muted-foreground hover:text-foreground hover:bg-muted/30 transition-colors"
          >
            <Plus className="h-4 w-4" />
          </button>
        </TooltipTrigger>
        <TooltipContent>New Query Tab</TooltipContent>
      </Tooltip>
    </div>
  );
}
