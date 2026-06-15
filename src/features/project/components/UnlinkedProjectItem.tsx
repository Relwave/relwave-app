import React from "react";
import { AlertTriangle, Folder, Link2, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
    DropdownMenu,
    DropdownMenuContent,
    DropdownMenuItem,
    DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { useDatabases } from "@/features/project/hooks/useDbQueries";
import { toast } from "sonner";
import { useDeleteProject, useRelinkProject } from "@/features/project/hooks/useProjectQueries";

export function UnlinkedProjectItem({ project }: { project: any }) {
    const { data: databases = [] } = useDatabases();
    const deleteProjectMutation = useDeleteProject();
    const relinkProjectMutation = useRelinkProject();

    const handleRelink = async (databaseId: string) => {
        try {
            await relinkProjectMutation.mutateAsync({ projectId: project.id, databaseId });
            toast.success("Project relinked successfully");
        } catch (error: any) {
            toast.error("Failed to relink project", { description: error.message });
        }
    };

    const handleDelete = async () => {
        try {
            await deleteProjectMutation.mutateAsync(project.id);
            toast.success("Project deleted");
        } catch (error: any) {
            toast.error("Failed to delete project", { description: error.message });
        }
    };

    return (
        <div className="group/item flex flex-col p-2.5 rounded-lg mb-1 relative border border-transparent bg-background/50 transition-colors hover:bg-accent/30">
            <div className="flex items-center gap-3 w-full relative z-10 pr-6">
                <div className="h-8 w-8 rounded-md bg-muted/30 flex items-center justify-center shrink-0 border border-border/50">
                    <Folder className="h-4 w-4 text-muted-foreground opacity-50" />
                </div>
                <div className="flex-1 min-w-0">
                    <div className="flex items-center justify-between mb-1">
                        <p className="text-sm font-semibold truncate text-foreground/70">{project.name}</p>
                    </div>
                    <div className="flex items-center gap-1.5 text-[10px] font-medium text-amber-500/90 bg-amber-500/10 px-1.5 py-0.5 rounded-md w-fit ring-1 ring-amber-500/20">
                        <AlertTriangle className="h-3 w-3" />
                        <span>No connection linked</span>
                    </div>
                </div>
            </div>

            <div className="flex items-center gap-2 mt-3 z-10 relative">
                <DropdownMenu>
                    <DropdownMenuTrigger asChild>
                        <Button variant="outline" size="sm" className="h-7 text-[11px] px-2 w-full flex-1 border-primary/20 hover:bg-primary/5">
                            <Link2 className="h-3 w-3 mr-1.5" />
                            Relink
                        </Button>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent align="start" className="w-48 max-h-48 overflow-y-auto">
                        {databases.length === 0 ? (
                            <div className="text-xs text-muted-foreground p-2 text-center">No databases available</div>
                        ) : (
                            databases.map(db => (
                                <DropdownMenuItem key={db.id} onClick={() => handleRelink(db.id)}>
                                    <div className="flex items-center gap-2 w-full">
                                        <div className="h-2 w-2 rounded-full bg-primary/40 shrink-0" />
                                        <span className="truncate">{db.name}</span>
                                    </div>
                                </DropdownMenuItem>
                            ))
                        )}
                    </DropdownMenuContent>
                </DropdownMenu>

                <Button 
                    variant="outline" 
                    size="sm" 
                    onClick={handleDelete} 
                    className="h-7 text-[11px] px-2 border-destructive/20 text-destructive hover:bg-destructive/10 hover:text-destructive"
                    disabled={deleteProjectMutation.isPending}
                >
                    <Trash2 className="h-3 w-3 mr-1.5" />
                    Delete
                </Button>
            </div>
        </div>
    );
}
