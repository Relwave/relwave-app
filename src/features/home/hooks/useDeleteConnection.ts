import { useState } from "react";
import { toast } from "sonner";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { databaseService } from "@/services/bridge/database";
import { bridgeRequest } from "@/services/bridge/bridgeClient";
import { projectKeys } from "@/features/project/hooks/useProjectQueries";

type DeleteConnectionDialogProps = {
    open: boolean;
    onOpenChange: (open: boolean) => void;
    connectionName: string;
    projectName: string;
    projectPath: string;
    hasGitRemote: boolean;
    gitRemoteUrl?: string;
    onConfirm: (choice: "unlink" | "delete_project") => Promise<void>;
};

export function useDeleteConnection(onSuccess?: () => void) {
    const queryClient = useQueryClient();
    
    // Core state
    const [dialogOpen, setDialogOpen] = useState(false);
    const [dialogProps, setDialogProps] = useState<Omit<DeleteConnectionDialogProps, "open" | "onOpenChange"> | null>(null);
    const [isDeleting, setIsDeleting] = useState(false);

    // Database deletion mutation (simple path or final step of complex path)
    const deleteDatabaseMutation = useMutation({
        mutationFn: databaseService.deleteDatabase,
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: ["databases"] });
            onSuccess?.();
        },
    });

    const initiateDelete = async (databaseId: string, databaseName: string) => {
        setIsDeleting(true);
        try {
            // 1. Check for linked project
            const res = await bridgeRequest("project.getByDatabaseId", { databaseId });
            const linkedProject = res?.data;

            if (!linkedProject) {
                // 2. No project -> call existing delete directly
                await deleteDatabaseMutation.mutateAsync(databaseId);
                toast.success("Database removed");
            } else {
                // 3. Project exists -> fetch git remote, open dialog
                const projectPathRes = await bridgeRequest("project.getDir", { projectId: linkedProject.id });
                const projectPath = projectPathRes?.data?.dir || "";

                const gitRes = await bridgeRequest("project.getGitRemote", { projectPath });
                const remoteUrl = gitRes?.data?.remoteUrl;

                setDialogProps({
                    connectionName: databaseName,
                    projectName: linkedProject.name,
                    projectPath,
                    hasGitRemote: !!remoteUrl,
                    gitRemoteUrl: remoteUrl || undefined,
                    onConfirm: async (choice) => {
                        try {
                            if (choice === "unlink") {
                                await bridgeRequest("project.unlinkFromConnection", { databaseId });
                            } else {
                                await bridgeRequest("project.deleteWithConnection", { databaseId });
                                // Invalidate projects since one was just deleted
                                queryClient.invalidateQueries({ queryKey: projectKeys.all });
                            }
                            
                            // Delete the DB connection itself
                            await deleteDatabaseMutation.mutateAsync(databaseId);
                            toast.success("Database removed");
                            setDialogOpen(false);
                        } catch (err: any) {
                            toast.error("Failed to delete", { description: err.message });
                            throw err; // throw to keep dialog open if error happens
                        }
                    }
                });
                
                setDialogOpen(true);
            }
        } catch (err: any) {
            toast.error("Failed to initiate delete", { description: err.message });
        } finally {
            setIsDeleting(false);
        }
    };

    return {
        initiateDelete,
        dialogOpen,
        setDialogOpen,
        dialogProps,
        isDeleting: deleteDatabaseMutation.isPending || isDeleting,
    };
}
