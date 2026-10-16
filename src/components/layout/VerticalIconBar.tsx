import { useState } from "react";
import {
  Activity,
  Home,
  Database,
  Search,
  GitBranch,
  GitCommitHorizontal,
  Layers,
  Terminal,
  History,
  Sparkles,
  Settings,
} from "lucide-react";
import { Link, useLocation } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { SettingsDialog } from "@/features/settings/components";

export type PanelType =
  | "data"
  | "sql-workspace"
  | "query-builder"
  | "schema-explorer"
  | "er-diagram"
  | "monitoring"
  | "git-status"
  | "migrations"
  | "ai-workspace";

interface VerticalIconBarProps {
  dbId?: string;
  databaseType?: string;
  activePanel?: PanelType;
  onPanelChange?: (panel: PanelType) => void;
}

const globalNavigationItems = [{ icon: Home, label: "Dashboard", path: "/" }];

function supportsMonitoring(databaseType?: string) {
  const type = databaseType?.toLowerCase();
  return (
    type === "postgres" ||
    type === "postgresql" ||
    type === "mysql" ||
    type === "mariadb" ||
    type === "clickhouse"
  );
}

export function getDatabasePanelItems(databaseType?: string): Array<{
  icon: any;
  label: string;
  panel: PanelType;
}> {
  return [
    { icon: Layers, label: "Data View", panel: "data" },
    { icon: Terminal, label: "SQL Workspace", panel: "sql-workspace" },
    { icon: Sparkles, label: "AI Workspace", panel: "ai-workspace" },
    { icon: Search, label: "Query Builder", panel: "query-builder" },
    { icon: GitBranch, label: "Schema Explorer", panel: "schema-explorer" },
    { icon: Database, label: "ER Diagram", panel: "er-diagram" },
    ...(supportsMonitoring(databaseType)
      ? [{ icon: Activity, label: "Monitoring", panel: "monitoring" as PanelType }]
      : []),
    { icon: History, label: "Migrations", panel: "migrations" },
    { icon: GitCommitHorizontal, label: "Git Status", panel: "git-status" },
  ];
}

export default function VerticalIconBar({
  dbId,
  databaseType,
  activePanel,
  onPanelChange,
}: VerticalIconBarProps) {
  const location = useLocation();
  const [settingsOpen, setSettingsOpen] = useState(false);

  const isGlobalActive = (path: string) => {
    if (path === "/") {
      return location.pathname === "/";
    }
    return location.pathname.includes(path);
  };

  // Database-specific panel items (only shown when dbId is provided)
  const databasePanelItems = dbId ? getDatabasePanelItems(databaseType) : [];

  return (
    <nav className="fixed left-0 top-8 h-[calc(100vh-32px)] w-15 bg-sidebar/90 border-r border-sidebar-border z-40 flex flex-col items-center py-4 gap-2 backdrop-blur-xl shadow-[1px_0_0_rgba(255,255,255,0.03)_inset]">
      {/* Global Navigation Icons */}
      <div className="flex flex-col gap-2">
        {globalNavigationItems.map((item) => {
          const Icon = item.icon;
          const active = isGlobalActive(item.path);

          return (
            <Tooltip key={item.path}>
              <TooltipTrigger asChild>
                <Link to={item.path}>
                  <Button
                    variant="ghost"
                    size="icon"
                    className={`
                      w-10 h-10 rounded-lg transition-all duration-150
                      ${
                        active
                          ? "bg-primary text-primary-foreground shadow-lg shadow-primary/20"
                          : "text-sidebar-foreground/62 hover:bg-sidebar-accent hover:text-sidebar-accent-foreground"
                      }
                    `}
                  >
                    <Icon className="h-5 w-5" />
                  </Button>
                </Link>
              </TooltipTrigger>
              <TooltipContent side="right">
                <p>{item.label}</p>
              </TooltipContent>
            </Tooltip>
          );
        })}
      </div>

      {/* Database-Specific Panel Items (state-based, no navigation) */}
      {databasePanelItems.length > 0 && (
        <>
          <div className="w-8 h-px bg-sidebar-border my-2" />
          <div className="flex flex-col gap-2">
            {databasePanelItems.map((item, index) => {
              const Icon = item.icon;
              const active = activePanel === item.panel;
              const shortcut = index < 9 ? `Alt+${index + 1}` : undefined;

              return (
                <Tooltip key={item.panel}>
                  <TooltipTrigger asChild>
                    <Button
                      variant="ghost"
                      size="icon"
                      onClick={() => onPanelChange?.(item.panel)}
                      className={`
                          w-10 h-10 rounded-lg transition-all duration-150
                          ${
                            active
                              ? "bg-primary text-primary-foreground shadow-lg shadow-primary/20"
                              : "text-sidebar-foreground/62 hover:bg-sidebar-accent hover:text-sidebar-accent-foreground"
                          }
                        `}
                    >
                      <Icon className="h-5 w-5" />
                    </Button>
                  </TooltipTrigger>
                  <TooltipContent side="right" className="flex items-center gap-1.5 font-sans">
                    <span>{item.label}</span>
                    {shortcut && (
                      <kbd className="px-1 py-0.5 text-[10px] font-mono bg-muted text-muted-foreground rounded border border-border/50">
                        {shortcut}
                      </kbd>
                    )}
                  </TooltipContent>
                </Tooltip>
              );
            })}
          </div>
        </>
      )}

      {/* Bottom Actions */}
      <div className="mt-auto flex flex-col items-center gap-2 mb-6">
        <Tooltip>
          <TooltipTrigger asChild>
            <Button
              variant="ghost"
              size="icon"
              onClick={() => setSettingsOpen(true)}
              className="w-10 h-10 rounded-lg text-sidebar-foreground/62 hover:bg-sidebar-accent hover:text-sidebar-accent-foreground transition-all duration-150"
            >
              <Settings className="h-5 w-5" />
            </Button>
          </TooltipTrigger>
          <TooltipContent side="right">
            <p>Settings</p>
          </TooltipContent>
        </Tooltip>
      </div>

      <SettingsDialog open={settingsOpen} onOpenChange={setSettingsOpen} />
    </nav>
  );
}
