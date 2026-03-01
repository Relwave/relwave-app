import {
  Database,
  Clock,
  Layers,
  GitBranch,
  FileCode2,
  ExternalLink,
  MoreHorizontal,
  Trash2,
  Download,
  FolderOpen,
  Pencil,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { cn } from "@/lib/utils";
import { ProjectSummary } from "@/types/project";

interface ProjectDetailViewProps {
  project: ProjectSummary;
  schemaCount?: number;
  queryCount?: number;
  hasERLayout?: boolean;
  onOpen: () => void;
  onDelete: () => void;
  onExport: () => void;
}

function formatRelativeTime(dateStr: string) {
  const diff = Date.now() - new Date(dateStr).getTime();
  const minutes = Math.floor(diff / 60000);
  if (minutes < 1) return "just now";
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  if (days < 30) return `${days}d ago`;
  return new Date(dateStr).toLocaleDateString();
}

const ENGINE_COLORS: Record<string, { bg: string; text: string }> = {
  postgres: { bg: "bg-blue-500/10", text: "text-blue-500" },
  postgresql: { bg: "bg-blue-500/10", text: "text-blue-500" },
  mysql: { bg: "bg-orange-500/10", text: "text-orange-500" },
  mariadb: { bg: "bg-sky-500/10", text: "text-sky-500" },
};

export function ProjectDetailView({
  project,
  schemaCount,
  queryCount,
  hasERLayout,
  onOpen,
  onDelete,
  onExport,
}: ProjectDetailViewProps) {
  const colors =
    ENGINE_COLORS[project.engine?.toLowerCase() ?? ""] ?? {
      bg: "bg-primary/10",
      text: "text-primary",
    };

  return (
    <div className="h-full flex flex-col">
      {/* Header */}
      <div className="p-6 border-b border-border/50">
        <div className="flex items-start justify-between">
          <div className="flex items-center gap-4">
            <div
              className={cn(
                "h-14 w-14 rounded-xl flex items-center justify-center",
                colors.bg
              )}
            >
              <FolderOpen className={cn("h-7 w-7", colors.text)} />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h2 className="text-xl font-semibold">{project.name}</h2>
                {project.engine && (
                  <span className="inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-medium bg-muted text-muted-foreground">
                    {project.engine}
                  </span>
                )}
              </div>
              {project.description && (
                <p className="text-sm text-muted-foreground mt-0.5">
                  {project.description}
                </p>
              )}
              <div className="flex items-center gap-3 mt-1.5 text-xs text-muted-foreground">
                <span className="flex items-center gap-1">
                  <Clock className="h-3 w-3" />
                  Updated {formatRelativeTime(project.updatedAt)}
                </span>
              </div>
            </div>
          </div>

          {/* Actions */}
          <div className="flex items-center gap-2">
            <Button size="sm" onClick={onOpen}>
              <ExternalLink className="h-3.5 w-3.5 mr-1.5" />
              Open
            </Button>
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="ghost" size="icon" className="h-8 w-8">
                  <MoreHorizontal className="h-4 w-4" />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end">
                <DropdownMenuItem onClick={onExport}>
                  <Download className="h-3.5 w-3.5 mr-2" />
                  Export Bundle
                </DropdownMenuItem>
                <DropdownMenuItem
                  className="text-destructive"
                  onClick={onDelete}
                >
                  <Trash2 className="h-3.5 w-3.5 mr-2" />
                  Delete Project
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
        </div>
      </div>

      {/* Content cards */}
      <div className="flex-1 overflow-y-auto p-6">
        <h3 className="text-sm font-semibold mb-4">Project Data</h3>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          {/* Schema card */}
          <div className="p-5 rounded-xl border border-border/50 bg-card hover:border-border transition-colors">
            <div className="flex items-center gap-3 mb-3">
              <div className="h-9 w-9 rounded-lg bg-violet-500/10 flex items-center justify-center">
                <Layers className="h-4.5 w-4.5 text-violet-500" />
              </div>
              <h4 className="text-sm font-medium">Schema Cache</h4>
            </div>
            <p className="text-2xl font-bold tabular-nums font-mono">
              {schemaCount ?? "—"}
            </p>
            <p className="text-xs text-muted-foreground mt-1">
              Cached schemas
            </p>
          </div>

          {/* ER Diagram card */}
          <div className="p-5 rounded-xl border border-border/50 bg-card hover:border-border transition-colors">
            <div className="flex items-center gap-3 mb-3">
              <div className="h-9 w-9 rounded-lg bg-emerald-500/10 flex items-center justify-center">
                <GitBranch className="h-4.5 w-4.5 text-emerald-500" />
              </div>
              <h4 className="text-sm font-medium">ER Diagram</h4>
            </div>
            <p className="text-2xl font-bold tabular-nums font-mono">
              {hasERLayout ? "Saved" : "—"}
            </p>
            <p className="text-xs text-muted-foreground mt-1">
              Diagram layout
            </p>
          </div>

          {/* Queries card */}
          <div className="p-5 rounded-xl border border-border/50 bg-card hover:border-border transition-colors">
            <div className="flex items-center gap-3 mb-3">
              <div className="h-9 w-9 rounded-lg bg-amber-500/10 flex items-center justify-center">
                <FileCode2 className="h-4.5 w-4.5 text-amber-500" />
              </div>
              <h4 className="text-sm font-medium">Saved Queries</h4>
            </div>
            <p className="text-2xl font-bold tabular-nums font-mono">
              {queryCount ?? "—"}
            </p>
            <p className="text-xs text-muted-foreground mt-1">
              Stored queries
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
