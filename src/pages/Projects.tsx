import { useState, useMemo } from "react";
import { toast } from "sonner";
import { useNavigate } from "react-router-dom";
import { useQueryClient } from "@tanstack/react-query";
import { useBridgeQuery } from "@/hooks/useBridgeQuery";
import { useDatabases, queryKeys } from "@/hooks/useDbQueries";
import {
    useProjects,
    useCreateProject,
    useDeleteProject,
    useProjectSchema,
    useProjectERDiagram,
    useProjectQueries,
    projectKeys,
} from "@/hooks/useProjectQueries";
import { bridgeApi } from "@/services/bridgeApi";
import BridgeLoader from "@/components/feedback/BridgeLoader";
import BridgeFailed from "@/components/feedback/BridgeFailed";
import VerticalIconBar from "@/components/common/VerticalIconBar";
import {
    ProjectList,
    CreateProjectDialog,
    DeleteProjectDialog,
    ImportProjectDialog,
    ProjectDetailView,
} from "@/components/project";
import { FolderOpen, Sparkles } from "lucide-react";
import { Button } from "@/components/ui/button";

const Projects = () => {
    const navigate = useNavigate();
    const queryClient = useQueryClient();
    const { data: bridgeReady, isLoading: bridgeLoading } = useBridgeQuery();

    // Data queries
    const { data: projects = [], isLoading: projectsLoading } = useProjects();
    const { data: databases = [] } = useDatabases();

    // Mutations
    const createProjectMutation = useCreateProject();
    const deleteProjectMutation = useDeleteProject();

    // Local state
    const [searchQuery, setSearchQuery] = useState("");
    const [selectedProject, setSelectedProject] = useState<string | null>(null);
    const [isCreateOpen, setIsCreateOpen] = useState(false);
    const [isImportOpen, setIsImportOpen] = useState(false);
    const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
    const [projectToDelete, setProjectToDelete] = useState<{
        id: string;
        name: string;
    } | null>(null);

    // Sub-resource queries for the selected project
    const { data: schemaData } = useProjectSchema(selectedProject ?? undefined);
    const { data: erData } = useProjectERDiagram(selectedProject ?? undefined);
    const { data: queriesData } = useProjectQueries(selectedProject ?? undefined);

    // Filtering
    const filteredProjects = useMemo(
        () =>
            projects.filter(
                (p) =>
                    p.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
                    (p.description ?? "").toLowerCase().includes(searchQuery.toLowerCase())
            ),
        [projects, searchQuery]
    );

    const selectedProjectData = useMemo(
        () => projects.find((p) => p.id === selectedProject) ?? null,
        [projects, selectedProject]
    );

    // ---- Handlers ----

    const handleCreate = async (data: {
        databaseId: string;
        name: string;
        description?: string;
        defaultSchema?: string;
    }) => {
        try {
            const created = await createProjectMutation.mutateAsync(data);
            toast.success("Project created", { description: created.name });
            setIsCreateOpen(false);
            setSelectedProject(created.id);
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
            const bundle = await bridgeApi.exportProject(projectId);
            if (!bundle) {
                toast.error("Project not found");
                return;
            }
            // Download as JSON file
            const blob = new Blob([JSON.stringify(bundle, null, 2)], {
                type: "application/json",
            });
            const url = URL.createObjectURL(blob);
            const a = document.createElement("a");
            a.href = url;
            a.download = `${bundle.metadata.name.replace(/\s+/g, "-").toLowerCase()}-export.json`;
            a.click();
            setTimeout(() => {
                URL.revokeObjectURL(url);
            }, 0);
            toast.success("Project exported");
        } catch (err: any) {
            toast.error("Export failed", { description: err.message });
        }
    };

    /**
     * Called by ImportProjectDialog after it successfully creates the DB
     * connection AND imports the project.  We invalidate caches so the new
     * project + database appear immediately in the UI.
     */
    const handleImportComplete = (projectId: string, projectName: string) => {
        queryClient.invalidateQueries({ queryKey: projectKeys.all });
        queryClient.invalidateQueries({ queryKey: queryKeys.databases });
        toast.success("Project imported", { description: projectName });
        setSelectedProject(projectId);
    };

    const handleOpen = (projectId: string) => {
        const project = projects.find((p) => p.id === projectId);
        if (project) {
            // Navigate to the linked database detail page
            navigate(`/${project.databaseId}`);
        }
    };

    // ---- Loading / Error states ----
    if (bridgeLoading || bridgeReady === undefined) return <BridgeLoader />;
    if (!bridgeReady) return <BridgeFailed />;

    return (
        <div className="h-[calc(100vh-32px)] flex bg-background text-foreground overflow-hidden">
            <VerticalIconBar />
            <main className="flex-1 ml-[60px] flex">
                {/* Left panel */}
                <ProjectList
                    projects={projects}
                    filteredProjects={filteredProjects}
                    loading={projectsLoading}
                    searchQuery={searchQuery}
                    setSearchQuery={setSearchQuery}
                    selectedProject={selectedProject}
                    setSelectedProject={setSelectedProject}
                    onCreateClick={() => setIsCreateOpen(true)}
                    onImportClick={() => setIsImportOpen(true)}
                    onDelete={(id: string, name: string) => {
                        setProjectToDelete({ id, name });
                        setDeleteDialogOpen(true);
                    }}
                    onOpen={handleOpen}
                />

                {/* Right panel */}
                <div className="flex-1 overflow-y-auto">
                    {selectedProjectData ? (
                        <ProjectDetailView
                            project={selectedProjectData}
                            schemaCount={schemaData?.schemas?.length}
                            queryCount={queriesData?.queries?.length}
                            hasERLayout={(erData?.nodes?.length ?? 0) > 0}
                            onOpen={() => handleOpen(selectedProjectData.id)}
                            onDelete={() => {
                                setProjectToDelete({
                                    id: selectedProjectData.id,
                                    name: selectedProjectData.name,
                                });
                                setDeleteDialogOpen(true);
                            }}
                            onExport={() => handleExport(selectedProjectData.id)}
                        />
                    ) : (
                        /* Empty state */
                        <div className="h-full flex flex-col items-center justify-center p-6">
                            <div className="flex items-center gap-3 mb-4">
                                <div className="h-10 w-10 rounded-xl bg-primary/10 flex items-center justify-center">
                                    <FolderOpen className="h-5 w-5 text-primary" />
                                </div>
                                <div>
                                    <h1 className="text-xl font-semibold">Projects</h1>
                                    <p className="text-sm text-muted-foreground">
                                        Save database details, ER diagrams &amp; queries offline
                                    </p>
                                </div>
                            </div>
                            {projects.length === 0 && (
                                <Button onClick={() => setIsCreateOpen(true)} className="mt-4">
                                    <Sparkles className="h-4 w-4 mr-2" />
                                    Create Your First Project
                                </Button>
                            )}
                        </div>
                    )}
                </div>
            </main>

            {/* Dialogs */}
            <CreateProjectDialog
                open={isCreateOpen}
                onOpenChange={setIsCreateOpen}
                onSubmit={handleCreate}
                isLoading={createProjectMutation.isPending}
                databases={databases}
            />

            <ImportProjectDialog
                open={isImportOpen}
                onOpenChange={setIsImportOpen}
                onComplete={handleImportComplete}
            />

            <DeleteProjectDialog
                open={deleteDialogOpen}
                onOpenChange={setDeleteDialogOpen}
                projectName={projectToDelete?.name}
                onConfirm={handleDelete}
            />
        </div>
    );
};

export default Projects;
