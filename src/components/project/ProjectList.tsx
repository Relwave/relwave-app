import {
  Plus,
  FolderOpen,
  Search,
  Trash2,
  Database,
  Upload,
} from "lucide-react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import {
  ContextMenu,
  ContextMenuContent,
  ContextMenuItem,
  ContextMenuSeparator,
  ContextMenuTrigger,
} from "@/components/ui/context-menu";
import { cn } from "@/lib/utils";
import { ProjectSummary } from "@/types/project";

interface ProjectListProps {
  projects: ProjectSummary[];
  filteredProjects: ProjectSummary[];
  loading: boolean;
  searchQuery: string;
  setSearchQuery: (q: string) => void;
  selectedProject: string | null;
  setSelectedProject: (id: string | null) => void;
  onCreateClick: () => void;
  onImportClick: () => void;
  onDelete: (id: string, name: string) => void;
  onOpen: (id: string) => void;
}

const ENGINE_COLORS: Record<string, string> = {
  postgres: "text-blue-500",
  postgresql: "text-blue-500",
  mysql: "text-orange-500",
  mariadb: "text-sky-500",
};

export function ProjectList({
  projects,
  filteredProjects,
  loading,
  searchQuery,
  setSearchQuery,
  selectedProject,
  setSelectedProject,
  onCreateClick,
  onImportClick,
  onDelete,
  onOpen,
}: ProjectListProps) {
  return (
    <div className="w-72 border-r border-border/50 flex flex-col bg-muted/20">
      {/* Header */}
      <div className="p-4 border-b border-border/50">
        <div className="flex items-center justify-between mb-3">
          <h1 className="text-sm font-semibold">Projects</h1>
          <div className="flex items-center gap-1">
            <Button
              variant="ghost"
              size="icon"
              className="h-7 w-7"
              onClick={onImportClick}
              title="Import project"
            >
              <Upload className="h-4 w-4" />
            </Button>
            <Button
              variant="ghost"
              size="icon"
              className="h-7 w-7"
              onClick={onCreateClick}
              title="Create project"
            >
              <Plus className="h-4 w-4" />
            </Button>
          </div>
        </div>
        <div className="relative">
          <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground/60" />
          <Input
            placeholder="Search projects..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="h-8 pl-8 text-xs bg-background/50"
          />
        </div>
      </div>

      {/* List */}
      <div className="flex-1 overflow-y-auto py-2">
        {loading ? (
          <div className="flex items-center justify-center py-8">
            <div className="h-5 w-5 border-2 border-primary/30 border-t-primary rounded-full animate-spin" />
          </div>
        ) : filteredProjects.length === 0 ? (
          <div className="px-4 py-8 text-center">
            <FolderOpen className="h-8 w-8 text-muted-foreground/30 mx-auto mb-2" />
            <p className="text-xs text-muted-foreground">
              {projects.length === 0
                ? "No projects yet"
                : "No matches found"}
            </p>
            {projects.length === 0 && (
              <Button
                variant="link"
                size="sm"
                className="mt-1 text-xs"
                onClick={onCreateClick}
              >
                Create your first project
              </Button>
            )}
          </div>
        ) : (
          <div className="space-y-0.5 px-2">
            {filteredProjects.map((project) => {
              const isSelected = selectedProject === project.id;
              const engineColor =
                ENGINE_COLORS[project.engine?.toLowerCase() ?? ""] ??
                "text-muted-foreground";

              return (
                <ContextMenu key={project.id}>
                  <ContextMenuTrigger asChild>
                    <button
                      onClick={() => setSelectedProject(project.id)}
                      onDoubleClick={() => onOpen(project.id)}
                      className={cn(
                        "w-full flex items-center gap-2.5 px-2.5 py-2 rounded-md text-left transition-colors",
                        isSelected
                          ? "bg-accent text-accent-foreground"
                          : "hover:bg-accent/50"
                      )}
                    >
                      <Database className={cn("h-4 w-4 shrink-0", engineColor)} />
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-medium truncate">
                          {project.name}
                        </p>
                        <p className="text-[10px] text-muted-foreground truncate">
                          {project.engine ?? "—"}{" "}
                          {project.description
                            ? `• ${project.description}`
                            : ""}
                        </p>
                      </div>
                    </button>
                  </ContextMenuTrigger>
                  <ContextMenuContent>
                    <ContextMenuItem onClick={() => onOpen(project.id)}>
                      <FolderOpen className="h-3.5 w-3.5 mr-2" />
                      Open Project
                    </ContextMenuItem>
                    <ContextMenuSeparator />
                    <ContextMenuItem
                      className="text-destructive"
                      onClick={() => onDelete(project.id, project.name)}
                    >
                      <Trash2 className="h-3.5 w-3.5 mr-2" />
                      Delete
                    </ContextMenuItem>
                  </ContextMenuContent>
                </ContextMenu>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
