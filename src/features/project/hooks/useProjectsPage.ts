// features/project/hooks/useProjectsPage.ts

import { useState, useMemo } from "react";
import { toast } from "sonner";
import { useNavigate } from "react-router-dom";
import { useQueryClient } from "@tanstack/react-query";
import { useDatabases, queryKeys } from "@/features/project/hooks/useDbQueries";
import {
    useProjects,
    useCreateProject,
    useDeleteProject,
    useProjectSchema,
    useProjectERDiagram,
    useProjectQueries,
    projectKeys,
} from "@/features/project/hooks/useProjectQueries";
import { projectService } from "@/services/bridge/project";
import { ProjectSummary } from "../types";


// ---- Types ----

interface CreateProjectInput {
    databaseId: string;
    name: string;
    description?: string;
    defaultSchema?: string;
}

interface ProjectToDelete {
    id: string;
    name: string;
}

// ---- Hook ----

export const useProjectsPage = () => {
    const navigate = useNavigate();
    const queryClient = useQueryClient();

    // Data
    const { data: projects = [], isLoading: projectsLoading } = useProjects();
    const { data: databases = [] } = useDatabases();

    // Mutations
    const createProjectMutation = useCreateProject();
    const deleteProjectMutation = useDeleteProject();

    // UI State
    const [searchQuery, setSearchQuery] = useState("");
    const [selectedProject, setSelectedProject] = useState<string | null>(null);
    const [isCreateOpen, setIsCreateOpen] = useState(false);
    const [isImportOpen, setIsImportOpen] = useState(false);
    const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
    const [projectToDelete, setProjectToDelete] = useState<ProjectToDelete | null>(null);

    // Sub-resource queries for selected project
    const { data: schemaData } = useProjectSchema(selectedProject ?? undefined);
    const { data: erData } = useProjectERDiagram(selectedProject ?? undefined);
    const { data: queriesData } = useProjectQueries(selectedProject ?? undefined);

    // Derived state
    const filteredProjects = useMemo(
        () =>
            projects.filter(
                (p: ProjectSummary) =>
                    p.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
                    (p.description ?? "").toLowerCase().includes(searchQuery.toLowerCase())
            ),
        [projects, searchQuery]
    );

    const selectedProjectData = useMemo(
        () => projects.find((p: ProjectSummary) => p.id === selectedProject) ?? null,
        [projects, selectedProject]
    );

    // ---- Bridge Handlers (belong in hook) ----

    const handleCreate = async (data: CreateProjectInput) => {
        try {
            const created = await createProjectMutation.mutateAsync(data);
            toast.success("Project created", { description: (created as ProjectSummary).name });
            setIsCreateOpen(false);
            setSelectedProject((created as ProjectSummary).id);
        } catch (err: any) {
            toast.error("Failed to create project", { description: err.message });
        }
    };

    const handleDelete = async () => {
        if (!projectToDelete) return;
        try {
            await deleteProjectMutation.mutateAsync(projectToDelete.id);
            toast.success("Project deleted");
            setDeleteDialogOpen(false);
            setProjectToDelete(null);
            if (selectedProject === projectToDelete.id) setSelectedProject(null);
        } catch (err: any) {
            toast.error("Failed to delete", { description: err.message });
        }
    };

    const handleExport = async (projectId: string) => {
        try {
            const bundle = await projectService.exportProject(projectId);
            if (!bundle) {
                toast.error("Project not found");
                return;
            }
            const blob = new Blob([JSON.stringify(bundle, null, 2)], {
                type: "application/json",
            });
            const url = URL.createObjectURL(blob);
            const a = document.createElement("a");
            a.href = url;
            a.download = `${bundle.metadata.name.replace(/\s+/g, "-").toLowerCase()}-export.json`;
            a.click();
            setTimeout(() => URL.revokeObjectURL(url), 0);
            toast.success("Project exported");
        } catch (err: any) {
            toast.error("Export failed", { description: err.message });
        }
    };

    const handleImportComplete = (projectId: string, projectName: string) => {
        queryClient.invalidateQueries({ queryKey: projectKeys.all });
        queryClient.invalidateQueries({ queryKey: queryKeys.databases });
        toast.success("Project imported", { description: projectName });
        setSelectedProject(projectId);
    };

    // ---- Navigation Handler (can stay in page but fine here too) ----

    const handleOpen = (projectId: string) => {
        const project = projects.find((p: ProjectSummary) => p.id === projectId);
        if (project) navigate(`/${project.databaseId}`);
    };

    // ---- Delete dialog helpers ----

    const openDeleteDialog = (id: string, name: string) => {
        setProjectToDelete({ id, name });
        setDeleteDialogOpen(true);
    };

    return {
        // Data
        projects,
        databases,
        filteredProjects,
        selectedProjectData,
        projectsLoading,

        // Sub-resource data
        schemaData,
        erData,
        queriesData,

        // Mutation states
        isCreating: createProjectMutation.isPending,

        // UI state
        searchQuery,
        setSearchQuery,
        selectedProject,
        setSelectedProject,
        isCreateOpen,
        setIsCreateOpen,
        isImportOpen,
        setIsImportOpen,
        deleteDialogOpen,
        setDeleteDialogOpen,
        projectToDelete,

        // Handlers
        handleCreate,
        handleDelete,
        handleExport,
        handleImportComplete,
        handleOpen,
        openDeleteDialog,
    };
};