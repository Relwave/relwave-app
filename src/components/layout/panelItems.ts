import {
  Activity,
  Database,
  Search,
  GitBranch,
  GitCommitHorizontal,
  Layers,
  Terminal,
  History,
  Sparkles,
  LucideIcon,
} from "lucide-react";
import { getDatabaseKind } from "@/lib/databases";

export type PanelType =
  | "data"
  | "sql-workspace"
  | "query-builder"
  | "schema-explorer"
  | "er-diagram"
  | "monitoring"
  | "git-status"
  | "migrations"
  | "ai-workspace"
  | "mongo-workspace"
  | "mongo-aggregation"
  | "mongo-migrations";

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
  icon: LucideIcon;
  label: string;
  panel: PanelType;
}> {
  if (getDatabaseKind(databaseType) === "nosql") {
    return [
      { icon: Layers, label: "Data View", panel: "data" },
      { icon: Terminal, label: "Query Workspace", panel: "mongo-workspace" },
      { icon: GitBranch, label: "Aggregation Builder", panel: "mongo-aggregation" },
      { icon: History, label: "Migrations", panel: "mongo-migrations" },
    ];
  }

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
