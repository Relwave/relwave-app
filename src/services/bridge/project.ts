import {
    ProjectSummary,
    ProjectMetadata,
    CreateProjectParams,
    UpdateProjectParams,
    SchemaFile,
    SchemaSnapshot,
    ERDiagramFile,
    ERNode,
    QueriesFile,
    SavedQuery,
    ProjectExport,
    ImportProjectParams,
    ScanImportResult,
    AnnotationsFile
} from "@/features/project/types"; import { bridgeRequest } from "../bridgeClient";
import { TLEditorSnapshot } from "tldraw";

class ProjectService {
    // ------------------------------------
    // 6. PROJECT METHODS (project.*)
    // ------------------------------------

    /**
     * List all projects
     */
    async listProjects(): Promise<ProjectSummary[]> {
        try {
            const result = await bridgeRequest("project.list", {});
            return result?.data || [];
        } catch (error: any) {
            console.error("Failed to list projects:", error);
            throw new Error(`Failed to list projects: ${error.message}`);
        }
    }

    /**
     * Get a single project by ID
     */
    async getProject(projectId: string): Promise<ProjectMetadata | null> {
        try {
            if (!projectId) throw new Error("Project ID is required");
            const result = await bridgeRequest("project.get", { id: projectId });
            return result?.data || null;
        } catch (error: any) {
            console.error("Failed to get project:", error);
            throw new Error(`Failed to get project: ${error.message}`);
        }
    }

    /**
     * Find a project linked to a specific database connection.
     * Returns null when no project is linked (not an error).
     */
    async getProjectByDatabaseId(databaseId: string): Promise<ProjectMetadata | null> {
        try {
            if (!databaseId) throw new Error("Database ID is required");
            const result = await bridgeRequest("project.getByDatabaseId", { databaseId });
            return result?.data || null;
        } catch (error: any) {
            console.error("Failed to get project by database ID:", error);
            throw new Error(`Failed to get project by database ID: ${error.message}`);
        }
    }

    /**
     * Create a new project linked to a database connection
     */
    async createProject(params: CreateProjectParams): Promise<ProjectMetadata> {
        try {
            if (!params.databaseId || !params.name) {
                throw new Error("databaseId and name are required");
            }
            const result = await bridgeRequest("project.create", params);
            if (!result?.data) throw new Error("Failed to create project");
            return result.data;
        } catch (error: any) {
            console.error("Failed to create project:", error);
            throw new Error(`Failed to create project: ${error.message}`);
        }
    }

    /**
     * Update a project's metadata
     */
    async updateProject(params: UpdateProjectParams): Promise<ProjectMetadata> {
        try {
            if (!params.id) throw new Error("Project ID is required");
            const result = await bridgeRequest("project.update", params);
            if (!result?.data) throw new Error("Project not found");
            return result.data;
        } catch (error: any) {
            console.error("Failed to update project:", error);
            throw new Error(`Failed to update project: ${error.message}`);
        }
    }

    /**
     * Delete a project and all its files
     */
    async deleteProject(projectId: string): Promise<void> {
        try {
            if (!projectId) throw new Error("Project ID is required");
            await bridgeRequest("project.delete", { id: projectId });
        } catch (error: any) {
            console.error("Failed to delete project:", error);
            throw new Error(`Failed to delete project: ${error.message}`);
        }
    }

    /**
     * Get cached schema for a project
     */
    async getProjectSchema(projectId: string): Promise<SchemaFile | null> {
        try {
            if (!projectId) throw new Error("Project ID is required");
            const result = await bridgeRequest("project.getSchema", { projectId });
            return result?.data || null;
        } catch (error: any) {
            console.error("Failed to get project schema:", error);
            throw new Error(`Failed to get project schema: ${error.message}`);
        }
    }

    /**
     * Save/cache schema data for a project
     */
    async saveProjectSchema(projectId: string, schemas: SchemaSnapshot[]): Promise<SchemaFile> {
        try {
            if (!projectId || !schemas) throw new Error("projectId and schemas are required");
            const result = await bridgeRequest("project.saveSchema", { projectId, schemas });
            return result?.data;
        } catch (error: any) {
            console.error("Failed to save project schema:", error);
            throw new Error(`Failed to save project schema: ${error.message}`);
        }
    }

    /**
     * Get ER diagram layout for a project
     */
    async getProjectERDiagram(projectId: string): Promise<ERDiagramFile | null> {
        try {
            if (!projectId) throw new Error("Project ID is required");
            const result = await bridgeRequest("project.getERDiagram", { projectId });
            return result?.data || null;
        } catch (error: any) {
            console.error("Failed to get ER diagram:", error);
            throw new Error(`Failed to get ER diagram: ${error.message}`);
        }
    }

    /**
     * Save ER diagram layout for a project
     */
    async saveProjectERDiagram(
        projectId: string,
        data: { nodes: ERNode[]; zoom?: number; panX?: number; panY?: number }
    ): Promise<ERDiagramFile> {
        try {
            if (!projectId || !data.nodes) throw new Error("projectId and nodes are required");
            const result = await bridgeRequest("project.saveERDiagram", { projectId, ...data });
            return result?.data;
        } catch (error: any) {
            console.error("Failed to save ER diagram:", error);
            throw new Error(`Failed to save ER diagram: ${error.message}`);
        }
    }

    /**
     * Get annotations for a project
     */
    async getProjectAnnotations(projectId: string): Promise<AnnotationsFile | null> {
        try {
            if (!projectId) throw new Error("Project ID is required");
            const result = await bridgeRequest("project.getAnnotations", { projectId });
            return result?.data || null;
        } catch (error: any) {
            console.error("Failed to get annotations:", error);
            throw new Error(`Failed to get annotations: ${error.message}`);
        }
    }

    /**
     * Save annotations for a project
     */
    async saveProjectAnnotations(
        projectId: string,
        snapshot: TLEditorSnapshot
    ): Promise<AnnotationsFile> {
        try {
            if (!projectId) throw new Error("Project ID is required");
            if (!snapshot || typeof snapshot !== "object" || Object.keys(snapshot).length === 0) {
                throw new Error("A non-empty snapshot object is required");
            }
            const result = await bridgeRequest("project.saveAnnotations", { projectId, snapshot });
            return result?.data;
        } catch (error: any) {
            console.error("Failed to save annotations:", error);
            throw new Error(`Failed to save annotations: ${error.message}`);
        }
    }

    /**
     * Get saved queries for a project
     */
    async getProjectQueries(projectId: string): Promise<QueriesFile | null> {
        try {
            if (!projectId) throw new Error("Project ID is required");
            const result = await bridgeRequest("project.getQueries", { projectId });
            return result?.data || null;
        } catch (error: any) {
            console.error("Failed to get project queries:", error);
            throw new Error(`Failed to get project queries: ${error.message}`);
        }
    }

    /**
     * Add a saved query to a project
     */
    async addProjectQuery(
        projectId: string,
        params: { name: string; sql: string; description?: string }
    ): Promise<SavedQuery> {
        try {
            if (!projectId || !params.name || !params.sql) {
                throw new Error("projectId, name, and sql are required");
            }
            const result = await bridgeRequest("project.addQuery", { projectId, ...params });
            return result?.data;
        } catch (error: any) {
            console.error("Failed to add project query:", error);
            throw new Error(`Failed to add project query: ${error.message}`);
        }
    }

    /**
     * Update a saved query in a project
     */
    async updateProjectQuery(
        projectId: string,
        queryId: string,
        updates: { name?: string; sql?: string; description?: string }
    ): Promise<SavedQuery> {
        try {
            if (!projectId || !queryId) throw new Error("projectId and queryId are required");
            const result = await bridgeRequest("project.updateQuery", { projectId, queryId, ...updates });
            if (!result?.data) throw new Error("Query not found");
            return result.data;
        } catch (error: any) {
            console.error("Failed to update project query:", error);
            throw new Error(`Failed to update project query: ${error.message}`);
        }
    }

    /**
     * Delete a saved query from a project
     */
    async deleteProjectQuery(projectId: string, queryId: string): Promise<void> {
        try {
            if (!projectId || !queryId) throw new Error("projectId and queryId are required");
            await bridgeRequest("project.deleteQuery", { projectId, queryId });
        } catch (error: any) {
            console.error("Failed to delete project query:", error);
            throw new Error(`Failed to delete project query: ${error.message}`);
        }
    }

    /**
     * Export full project bundle (metadata + schema + ER + queries)
     */
    async exportProject(projectId: string): Promise<ProjectExport | null> {
        try {
            if (!projectId) throw new Error("Project ID is required");
            const result = await bridgeRequest("project.export", { projectId });
            return result?.data || null;
        } catch (error: any) {
            console.error("Failed to export project:", error);
            throw new Error(`Failed to export project: ${error.message}`);
        }
    }

    /**
     * Get the filesystem directory path for a project
     */
    async getProjectDir(projectId: string): Promise<string | null> {
        try {
            if (!projectId) return null;
            const result = await bridgeRequest("project.getDir", { projectId });
            return result?.data?.dir || null;
        } catch (error: any) {
            console.error("Failed to get project dir:", error);
            return null;
        }
    }

    /**
     * Scan a cloned repo directory for import — read-only, no side effects.
     * Returns project metadata and .env info so the UI can preview.
     */
    async scanImportSource(sourcePath: string): Promise<ScanImportResult> {
        try {
            if (!sourcePath) throw new Error("sourcePath is required");
            const result = await bridgeRequest("project.scanImport", { sourcePath });
            if (!result?.data) throw new Error("Failed to scan import source");
            return result.data;
        } catch (error: any) {
            console.error("Failed to scan import source:", error);
            throw new Error(`Failed to scan import source: ${error.message}`);
        }
    }

    /**
     * Import a project from a cloned repository directory.
     * Requires a valid databaseId — create the database connection first.
     */
    async importProject(params: ImportProjectParams): Promise<ProjectMetadata> {
        try {
            if (!params.sourcePath) throw new Error("sourcePath is required");
            if (!params.databaseId) throw new Error("databaseId is required");
            const result = await bridgeRequest("project.import", params);
            if (!result?.data) throw new Error("Failed to import project");
            return result.data;
        } catch (error: any) {
            console.error("Failed to import project:", error);
            throw new Error(`Failed to import project: ${error.message}`);
        }
    }

    /**
     * Link (or re-link) a database connection to a project.
     * Updates the project's databaseId and resolves the engine type.
     */
    async linkProjectDatabase(projectId: string, databaseId: string): Promise<ProjectMetadata> {
        try {
            if (!projectId || !databaseId) {
                throw new Error("projectId and databaseId are required");
            }
            const result = await bridgeRequest("project.linkDatabase", { projectId, databaseId });
            if (!result?.data) throw new Error("Project not found");
            return result.data;
        } catch (error: any) {
            console.error("Failed to link database:", error);
            throw new Error(`Failed to link database: ${error.message}`);
        }
    }
}

export const projectService = new ProjectService();