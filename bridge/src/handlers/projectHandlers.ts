import { Rpc } from "../types";
import { Logger } from "pino";
import { projectStoreInstance } from "../services/projectStore";
import { DatabaseService } from "../services/databaseService";
import { QueryExecutor } from "../services/queryExecutor";
import { gitServiceInstance } from "../services/gitService";

/**
 * RPC handlers for project CRUD and sub-resource operations.
 * Mirrors the DatabaseHandlers pattern.
 */
export class ProjectHandlers {
    constructor(
        private rpc: Rpc,
        private logger: Logger,
        private dbService: DatabaseService,
        private queryExecutor: QueryExecutor
    ) { }


    async handleListProjects(_params: any, id: number | string) {
        try {
            const projects = await projectStoreInstance.listProjects();
            this.rpc.sendResponse(id, { ok: true, data: projects });
        } catch (e: any) {
            this.logger?.error({ e }, "project.list failed");
            this.rpc.sendError(id, { code: "IO_ERROR", message: String(e) });
        }
    }

    async handleGetProject(params: any, id: number | string) {
        try {
            const { id: projectId } = params || {};
            if (!projectId) {
                return this.rpc.sendError(id, {
                    code: "BAD_REQUEST",
                    message: "Missing id",
                });
            }

            const project = await projectStoreInstance.getProject(projectId);
            if (!project) {
                return this.rpc.sendError(id, {
                    code: "NOT_FOUND",
                    message: "Project not found",
                });
            }

            this.rpc.sendResponse(id, { ok: true, data: project });
        } catch (e: any) {
            this.logger?.error({ e }, "project.get failed");
            this.rpc.sendError(id, { code: "IO_ERROR", message: String(e) });
        }
    }

    async handleGetProjectByDatabaseId(params: any, id: number | string) {
        try {
            const { databaseId } = params || {};
            if (!databaseId) {
                return this.rpc.sendError(id, {
                    code: "BAD_REQUEST",
                    message: "Missing databaseId",
                });
            }

            const project = await projectStoreInstance.getProjectByDatabaseId(databaseId);
            // Return null (not an error) when no project is linked
            this.rpc.sendResponse(id, { ok: true, data: project });
        } catch (e: any) {
            this.logger?.error({ e }, "project.getByDatabaseId failed");
            this.rpc.sendError(id, { code: "IO_ERROR", message: String(e) });
        }
    }

    async handleCreateProject(params: any, id: number | string) {
        try {
            const { databaseId, name, description, defaultSchema } = params || {};
            if (!databaseId || !name) {
                return this.rpc.sendError(id, {
                    code: "BAD_REQUEST",
                    message: "Missing databaseId or name",
                });
            }

            const project = await projectStoreInstance.createProject({
                databaseId,
                name,
                description,
                defaultSchema,
            });

            this.rpc.sendResponse(id, { ok: true, data: project });
        } catch (e: any) {
            this.logger?.error({ e }, "project.create failed");
            this.rpc.sendError(id, { code: "IO_ERROR", message: String(e) });
        }
    }

    async handleUpdateProject(params: any, id: number | string) {
        try {
            const { id: projectId, ...updates } = params || {};
            if (!projectId) {
                return this.rpc.sendError(id, {
                    code: "BAD_REQUEST",
                    message: "Missing id",
                });
            }

            const project = await projectStoreInstance.updateProject(projectId, updates);
            if (!project) {
                return this.rpc.sendError(id, {
                    code: "NOT_FOUND",
                    message: "Project not found",
                });
            }

            this.rpc.sendResponse(id, { ok: true, data: project });
        } catch (e: any) {
            this.logger?.error({ e }, "project.update failed");
            this.rpc.sendError(id, { code: "IO_ERROR", message: String(e) });
        }
    }

    async handleDeleteProject(params: any, id: number | string) {
        try {
            const { id: projectId } = params || {};
            if (!projectId) {
                return this.rpc.sendError(id, {
                    code: "BAD_REQUEST",
                    message: "Missing id",
                });
            }

            await projectStoreInstance.deleteProject(projectId);
            this.rpc.sendResponse(id, { ok: true });
        } catch (e: any) {
            this.logger?.error({ e }, "project.delete failed");
            this.rpc.sendError(id, { code: "IO_ERROR", message: String(e) });
        }
    }

    async handleGetSchema(params: any, id: number | string) {
        try {
            const { projectId } = params || {};
            if (!projectId) {
                return this.rpc.sendError(id, {
                    code: "BAD_REQUEST",
                    message: "Missing projectId",
                });
            }

            const schema = await projectStoreInstance.getSchema(projectId);
            this.rpc.sendResponse(id, { ok: true, data: schema });
        } catch (e: any) {
            this.logger?.error({ e }, "project.getSchema failed");
            this.rpc.sendError(id, { code: "IO_ERROR", message: String(e) });
        }
    }

    async handleSaveSchema(params: any, id: number | string) {
        try {
            const { projectId, schemas } = params || {};
            if (!projectId || !schemas) {
                return this.rpc.sendError(id, {
                    code: "BAD_REQUEST",
                    message: "Missing projectId or schemas",
                });
            }

            const result = await projectStoreInstance.saveSchema(projectId, schemas);
            this.rpc.sendResponse(id, { ok: true, data: result });
        } catch (e: any) {
            this.logger?.error({ e }, "project.saveSchema failed");
            this.rpc.sendError(id, { code: "IO_ERROR", message: String(e) });
        }
    }

    async handleRefreshSchemaCache(params: any, id: number | string) {
        try {
            const { projectId } = params || {};
            if (!projectId) {
                return this.rpc.sendError(id, { code: "BAD_REQUEST", message: "Missing projectId" });
            }

            const project = await projectStoreInstance.getProject(projectId);
            if (!project) {
                return this.rpc.sendError(id, { code: "NOT_FOUND", message: "Project not found" });
            }

            if (!project.databaseId) {
                return this.rpc.sendError(id, { code: "BAD_REQUEST", message: "Project has no database ID" });
            }

            // Get DB connection
            const { conn, dbType } = await this.dbService.getDatabaseConnection(project.databaseId);
            const dbSchema = await this.queryExecutor.listSchemas(conn, dbType) as any;
            const liveSchemas = dbSchema.schemas;

            // Generate schema hash from live schemas
            const crypto = require("crypto");
            const newHash = crypto.createHash("sha256").update(JSON.stringify(liveSchemas)).digest("hex");

            // Fetch old schema file to compare
            let oldHash = "";
            try {
                const oldSchemaFile = await projectStoreInstance.getSchema(projectId);
                oldHash = (oldSchemaFile as any)?.schemaHash || "";
            } catch (e) {
                // Initial creation
            }

            // Save anyway (or only if changed, but we can always save)
            // projectStoreInstance.saveSchema now expects to write schemaHash and dialect.
            // Let's call saveSchema and then update the schema.json directly or update saveSchema signature.
            // Since saveSchema only takes `schemas` right now, I'll update saveSchema in projectStore shortly.
            await projectStoreInstance.saveSchema(projectId, liveSchemas, newHash, dbType);

            if (newHash !== oldHash) {
                this.rpc.sendNotification("project.schema_changed", { projectId, newHash });

                // Commit to Git if tracking
                try {
                    await gitServiceInstance.syncSchemaFile(projectId);
                } catch (gitErr) {
                    this.logger?.warn({ err: gitErr }, "Failed to auto-commit schema.json to Git");
                }
            }

            this.rpc.sendResponse(id, { ok: true, hashChanged: newHash !== oldHash, newHash });
        } catch (e: any) {
            this.logger?.error({ e }, "project.refreshSchemaCache failed");
            this.rpc.sendError(id, { code: "IO_ERROR", message: String(e) });
        }
    }

    async handleGetERDiagram(params: any, id: number | string) {
        try {
            const { projectId } = params || {};
            if (!projectId) {
                return this.rpc.sendError(id, {
                    code: "BAD_REQUEST",
                    message: "Missing projectId",
                });
            }

            const diagram = await projectStoreInstance.getERDiagram(projectId);
            this.rpc.sendResponse(id, { ok: true, data: diagram });
        } catch (e: any) {
            this.logger?.error({ e }, "project.getERDiagram failed");
            this.rpc.sendError(id, { code: "IO_ERROR", message: String(e) });
        }
    }

    async handleSaveERDiagram(params: any, id: number | string) {
        try {
            const { projectId, nodes, zoom, panX, panY } = params || {};
            if (!projectId || !nodes) {
                return this.rpc.sendError(id, {
                    code: "BAD_REQUEST",
                    message: "Missing projectId or nodes",
                });
            }

            const result = await projectStoreInstance.saveERDiagram(projectId, {
                nodes,
                zoom,
                panX,
                panY,
            });
            this.rpc.sendResponse(id, { ok: true, data: result });
        } catch (e: any) {
            this.logger?.error({ e }, "project.saveERDiagram failed");
            this.rpc.sendError(id, { code: "IO_ERROR", message: String(e) });
        }
    }

    async handleGetAnnotations(params: any, id: number | string) {
        try {
            const { projectId } = params || {};
            if (!projectId) {
                return this.rpc.sendError(id, {
                    code: "BAD_REQUEST",
                    message: "Missing projectId",
                });
            }

            const annotations = await projectStoreInstance.getAnnotations(projectId);
            this.rpc.sendResponse(id, { ok: true, data: annotations });
        } catch (e: any) {
            this.logger?.error({ e }, "project.getAnnotations failed");
            this.rpc.sendError(id, { code: "IO_ERROR", message: String(e) });
        }
    }

    async handleSaveAnnotations(params: any, id: number | string) {
        try {
            const { projectId, snapshot } = params || {};
            if (!projectId || !snapshot) {
                return this.rpc.sendError(id, {
                    code: "BAD_REQUEST",
                    message: "Missing projectId or snapshot",
                });
            }

            const result = await projectStoreInstance.saveAnnotations(projectId, snapshot);
            this.rpc.sendResponse(id, { ok: true, data: result });
        } catch (e: any) {
            this.logger?.error({ e }, "project.saveAnnotations failed");
            this.rpc.sendError(id, { code: "IO_ERROR", message: String(e) });
        }
    }

    async handleAnalyzeImport(params: any, id: number | string) {
        try {
            const { projectId } = params || {};
            if (!projectId) {
                return this.rpc.sendError(id, { code: "BAD_REQUEST", message: "Missing projectId" });
            }
            const result = await projectStoreInstance.analyzeImportedProject(projectId);
            this.rpc.sendResponse(id, { ok: true, data: result });
        } catch (e: any) {
            this.logger?.error({ e }, "project.analyzeImport failed");
            this.rpc.sendError(id, { code: "IO_ERROR", message: String(e) });
        }
    }

    async handleVerifyLock(params: any, id: number | string) {
        try {
            const { projectId } = params || {};
            if (!projectId) {
                return this.rpc.sendError(id, { code: "BAD_REQUEST", message: "Missing projectId" });
            }
            const project = await projectStoreInstance.getProject(projectId);
            if (!project?.databaseId) {
                return this.rpc.sendError(id, { code: "BAD_REQUEST", message: "Project has no database ID" });
            }
            const { verifyMigrationLock } = await import("../services/migrationLock");
            const schemaFile = await projectStoreInstance.getSchema(projectId);
            const schemaHash = (schemaFile as any)?.schemaHash || "";

            const isValid = verifyMigrationLock(project.databaseId, schemaHash);
            this.rpc.sendResponse(id, { ok: true, isValid });
        } catch (e: any) {
            this.logger?.error({ e }, "project.verifyLock failed");
            this.rpc.sendError(id, { code: "IO_ERROR", message: String(e) });
        }
    }

    async handlePushMigrations(params: any, id: number | string) {
        try {
            const { projectId } = params || {};
            if (!projectId) return this.rpc.sendError(id, { code: "BAD_REQUEST", message: "Missing projectId" });
            const projectDir = await projectStoreInstance.resolveProjectDir(projectId);
            if (!projectDir) return this.rpc.sendError(id, { code: "NOT_FOUND", message: "Project directory not found" });

            const { gitServiceInstance } = await import("../services/gitService");
            await gitServiceInstance.stageAll(projectDir);
            await gitServiceInstance.commit(projectDir, "Push migrations");
            // Here you'd call git push if configured, for now just returning ok
            this.rpc.sendResponse(id, { ok: true });
        } catch (e: any) {
            this.logger?.error({ e }, "project.pushMigrations failed");
            this.rpc.sendError(id, { code: "IO_ERROR", message: String(e) });
        }
    }

    async handleSyncMigrations(params: any, id: number | string) {
        try {
            const { projectId } = params || {};
            if (!projectId) return this.rpc.sendError(id, { code: "BAD_REQUEST", message: "Missing projectId" });
            const projectDir = await projectStoreInstance.resolveProjectDir(projectId);
            if (!projectDir) return this.rpc.sendError(id, { code: "NOT_FOUND", message: "Project directory not found" });

            const { gitServiceInstance } = await import("../services/gitService");
            const result = await gitServiceInstance.syncMigrationFiles(projectDir);
            if (result.error) throw new Error(result.error.message || String(result.error));
            this.rpc.sendResponse(id, { ok: true, data: result });
        } catch (e: any) {
            this.logger?.error({ e }, "project.syncMigrations failed");
            this.rpc.sendError(id, { code: "IO_ERROR", message: String(e) });
        }
    }

    async handleGetDrift(params: any, id: number | string) {
        try {
            const { projectId } = params || {};
            if (!projectId) return this.rpc.sendError(id, { code: "BAD_REQUEST", message: "Missing projectId" });

            // Stub implementation for now
            this.rpc.sendResponse(id, { ok: true, data: { driftDetected: false, differences: [] } });
        } catch (e: any) {
            this.logger?.error({ e }, "project.getDrift failed");
            this.rpc.sendError(id, { code: "IO_ERROR", message: String(e) });
        }
    }

    async handleGetQueries(params: any, id: number | string) {
        try {
            const { projectId } = params || {};
            if (!projectId) {
                return this.rpc.sendError(id, {
                    code: "BAD_REQUEST",
                    message: "Missing projectId",
                });
            }

            const queries = await projectStoreInstance.getQueries(projectId);
            this.rpc.sendResponse(id, { ok: true, data: queries });
        } catch (e: any) {
            this.logger?.error({ e }, "project.getQueries failed");
            this.rpc.sendError(id, { code: "IO_ERROR", message: String(e) });
        }
    }

    async handleAddQuery(params: any, id: number | string) {
        try {
            const { projectId, name, sql, description } = params || {};
            if (!projectId || !name || !sql) {
                return this.rpc.sendError(id, {
                    code: "BAD_REQUEST",
                    message: "Missing projectId, name, or sql",
                });
            }

            const query = await projectStoreInstance.addQuery(projectId, {
                name,
                sql,
                description,
            });
            this.rpc.sendResponse(id, { ok: true, data: query });
        } catch (e: any) {
            this.logger?.error({ e }, "project.addQuery failed");
            this.rpc.sendError(id, { code: "IO_ERROR", message: String(e) });
        }
    }

    async handleUpdateQuery(params: any, id: number | string) {
        try {
            const { projectId, queryId, ...updates } = params || {};
            if (!projectId || !queryId) {
                return this.rpc.sendError(id, {
                    code: "BAD_REQUEST",
                    message: "Missing projectId or queryId",
                });
            }

            const query = await projectStoreInstance.updateQuery(
                projectId,
                queryId,
                updates
            );
            if (!query) {
                return this.rpc.sendError(id, {
                    code: "NOT_FOUND",
                    message: "Query not found",
                });
            }

            this.rpc.sendResponse(id, { ok: true, data: query });
        } catch (e: any) {
            this.logger?.error({ e }, "project.updateQuery failed");
            this.rpc.sendError(id, { code: "IO_ERROR", message: String(e) });
        }
    }

    async handleDeleteQuery(params: any, id: number | string) {
        try {
            const { projectId, queryId } = params || {};
            if (!projectId || !queryId) {
                return this.rpc.sendError(id, {
                    code: "BAD_REQUEST",
                    message: "Missing projectId or queryId",
                });
            }

            await projectStoreInstance.deleteQuery(projectId, queryId);
            this.rpc.sendResponse(id, { ok: true });
        } catch (e: any) {
            this.logger?.error({ e }, "project.deleteQuery failed");
            this.rpc.sendError(id, { code: "IO_ERROR", message: String(e) });
        }
    }

    // ==========================================
    // Export (for future git-native support)
    // ==========================================

    async handleExportProject(params: any, id: number | string) {
        try {
            const { projectId } = params || {};
            if (!projectId) {
                return this.rpc.sendError(id, {
                    code: "BAD_REQUEST",
                    message: "Missing projectId",
                });
            }

            const bundle = await projectStoreInstance.exportProject(projectId);
            if (!bundle) {
                return this.rpc.sendError(id, {
                    code: "NOT_FOUND",
                    message: "Project not found",
                });
            }

            this.rpc.sendResponse(id, { ok: true, data: bundle });
        } catch (e: any) {
            this.logger?.error({ e }, "project.export failed");
            this.rpc.sendError(id, { code: "IO_ERROR", message: String(e) });
        }
    }

    async handleGetProjectDir(params: any, id: number | string) {
        try {
            const { projectId } = params || {};
            if (!projectId) {
                return this.rpc.sendError(id, {
                    code: "BAD_REQUEST",
                    message: "Missing projectId",
                });
            }
            const dir = await projectStoreInstance.resolveProjectDir(projectId);
            this.rpc.sendResponse(id, { ok: true, data: { dir } });
        } catch (e: any) {
            this.logger?.error({ e }, "project.getDir failed");
            this.rpc.sendError(id, { code: "IO_ERROR", message: String(e) });
        }
    }

    async handleGetLocalConfig(params: any, id: number | string) {
        try {
            const { projectId } = params || {};
            if (!projectId) {
                return this.rpc.sendError(id, {
                    code: "BAD_REQUEST",
                    message: "Missing projectId",
                });
            }
            const config = await projectStoreInstance.getLocalConfig(projectId);
            this.rpc.sendResponse(id, { ok: true, data: config });
        } catch (e: any) {
            this.logger?.error({ e }, "project.getLocalConfig failed");
            this.rpc.sendError(id, { code: "IO_ERROR", message: String(e) });
        }
    }

    async handleSaveLocalConfig(params: any, id: number | string) {
        try {
            const { projectId, config } = params || {};
            if (!projectId) {
                return this.rpc.sendError(id, {
                    code: "BAD_REQUEST",
                    message: "Missing projectId",
                });
            }
            const saved = await projectStoreInstance.saveLocalConfig(projectId, config || {});
            this.rpc.sendResponse(id, { ok: true, data: saved });
        } catch (e: any) {
            this.logger?.error({ e }, "project.saveLocalConfig failed");
            this.rpc.sendError(id, { code: "IO_ERROR", message: String(e) });
        }
    }

    async handleEnsureGitignore(params: any, id: number | string) {
        try {
            const { projectId } = params || {};
            if (!projectId) {
                return this.rpc.sendError(id, {
                    code: "BAD_REQUEST",
                    message: "Missing projectId",
                });
            }
            const modified = await projectStoreInstance.ensureGitignore(projectId);
            this.rpc.sendResponse(id, { ok: true, data: { modified } });
        } catch (e: any) {
            this.logger?.error({ e }, "project.ensureGitignore failed");
            this.rpc.sendError(id, { code: "IO_ERROR", message: String(e) });
        }
    }

    /** Read-only scan — returns metadata + .env info without creating anything. */
    async handleScanImport(params: any, id: number | string) {
        try {
            const { sourcePath } = params || {};
            if (!sourcePath) {
                return this.rpc.sendError(id, {
                    code: "BAD_REQUEST",
                    message: "Missing sourcePath",
                });
            }

            const result = await projectStoreInstance.scanImportSource(sourcePath);
            this.rpc.sendResponse(id, { ok: true, data: result });
        } catch (e: any) {
            this.logger?.error({ e }, "project.scanImport failed");
            this.rpc.sendError(id, { code: "IO_ERROR", message: String(e) });
        }
    }

    /** Import a project — requires a valid databaseId (no more "pending" fallback). */
    async handleImportProject(params: any, id: number | string) {
        try {
            const { sourcePath, databaseId } = params || {};
            if (!sourcePath) {
                return this.rpc.sendError(id, {
                    code: "BAD_REQUEST",
                    message: "Missing sourcePath",
                });
            }
            if (!databaseId) {
                return this.rpc.sendError(id, {
                    code: "BAD_REQUEST",
                    message: "Missing databaseId — create a database connection first",
                });
            }

            const project = await projectStoreInstance.importProject({
                sourcePath,
                databaseId,
            });

            this.rpc.sendResponse(id, { ok: true, data: project });
        } catch (e: any) {
            this.logger?.error({ e }, "project.import failed");
            this.rpc.sendError(id, { code: "IO_ERROR", message: String(e) });
        }
    }

    async handleLinkDatabase(params: any, id: number | string) {
        try {
            const { projectId, databaseId } = params || {};
            if (!projectId || !databaseId) {
                return this.rpc.sendError(id, {
                    code: "BAD_REQUEST",
                    message: "Missing projectId or databaseId",
                });
            }

            const project = await projectStoreInstance.linkDatabase(projectId, databaseId);
            if (!project) {
                return this.rpc.sendError(id, {
                    code: "NOT_FOUND",
                    message: "Project not found",
                });
            }

            this.rpc.sendResponse(id, { ok: true, data: project });
        } catch (e: any) {
            this.logger?.error({ e }, "project.linkDatabase failed");
            this.rpc.sendError(id, { code: "IO_ERROR", message: String(e) });
        }
    }
}
