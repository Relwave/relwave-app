import { useBridgeQuery } from "@/services/bridge/useBridgeQuery";
import { useProjectsPage } from "@/features/project/hooks/useProjectsPage";
import {
    ProjectList,
    CreateProjectDialog,
    DeleteProjectDialog,
    ImportProjectDialog,
    ProjectDetailView,
} from "@/features/project/components";
import { ProjectsEmptyState } from "@/features/project/components/ProjectsEmptyState";
import BridgeLoader from "@/components/feedback/BridgeLoader";
import BridgeFailed from "@/components/feedback/BridgeFailed";
import VerticalIconBar from "@/components/layout/VerticalIconBar";

const Projects = () => {
    const { data: bridgeReady, isLoading: bridgeLoading } = useBridgeQuery();

    // All logic lives in the hook
    const {
        projects,
        databases,
        filteredProjects,
        selectedProjectData,
        projectsLoading,
        schemaData,
        erData,
        queriesData,
        isCreating,
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
        handleCreate,
        handleDelete,
        handleExport,
        handleImportComplete,
        handleOpen,
        openDeleteDialog,
    } = useProjectsPage();

    // ---- Bridge guard — only logic allowed in page ----
    if (bridgeLoading || bridgeReady === undefined) return <BridgeLoader />;
    if (!bridgeReady) return <BridgeFailed />;

    return (
        <div className="h-[calc(100vh-32px)] flex bg-background text-foreground overflow-hidden">
            <VerticalIconBar />

            <main className="flex-1 ml-15 flex">
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
                    onDelete={openDeleteDialog}
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
                            onDelete={() => openDeleteDialog(selectedProjectData.id, selectedProjectData.name)}
                            onExport={() => handleExport(selectedProjectData.id)}
                            onBack={() => setSelectedProject(null)}
                        />
                    ) : (
                        <ProjectsEmptyState
                            hasProjects={projects.length > 0}
                            onCreateClick={() => setIsCreateOpen(true)}
                            onImportClick={() => setIsImportOpen(true)}
                        />
                    )}
                </div>
            </main>

            {/* Dialogs */}
            <CreateProjectDialog
                open={isCreateOpen}
                onOpenChange={setIsCreateOpen}
                onSubmit={handleCreate}
                isLoading={isCreating}
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
