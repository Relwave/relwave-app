import { Rpc } from "../types";
import { Logger } from "pino";
import { projectStoreInstance } from "../services/projectStore";
import { DatabaseService } from "../services/databaseService";
import { QueryExecutor } from "../services/queryExecutor";
import { gitServiceInstance } from "../services/gitService";
import path from "path";

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
                this.rpc?.sendNotification?.("project.schema_changed", { projectId, newHash });

                // Commit to Git if tracking
                try {
                    const projectDir = await projectStoreInstance.resolveProjectDir(projectId);
                    if (projectDir) {
                        await gitServiceInstance.syncSchemaFile(projectDir);
                    }
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

            const project = await projectStoreInstance.getProject(projectId);
            if (!project) {
                return this.rpc.sendError(id, { code: "NOT_FOUND", message: "Project not found" });
            }

            // 1. Read schema snapshot
            const schemaFile = await projectStoreInstance.getSchema(projectId);
            const hasSchemaSnapshot = !!schemaFile && !!(schemaFile as any)?.schemas?.length;
            const schemaHash = (schemaFile as any)?.schemaHash || "";

            // 2. Read migration files from project-local dir
            const { listMigrationFiles, readMigrationFile } = await import("../utils/migrationFileReader");
            let migrationFiles: string[] = [];
            let migrationsDir = "";
            if (project.databaseId) {
                migrationsDir = await projectStoreInstance.resolveMigrationsDir(project.databaseId);
                migrationFiles = listMigrationFiles(migrationsDir);
            }
            const hasMigrations = migrationFiles.length > 0;

            // 3. Read lock file
            let lockFileStatus: "valid" | "tampered" | "missing" = "missing";
            let tamperedFiles: string[] = [];
            let appliedVersions: string[] = [];
            if (project.databaseId) {
                const { readMigrationLock } = await import("../services/migrationLock");
                const lock = await readMigrationLock(project.databaseId);
                if (lock) {
                    lockFileStatus = lock.schemaHash === schemaHash ? "valid" : "tampered";
                    appliedVersions = lock.appliedMigrations || [];
                }
            }

            // 4. Query live database for table count
            let targetDatabaseEmpty = true;
            let targetTableCount = 0;
            let dbAppliedVersions: string[] = [];
            if (project.databaseId) {
                try {
                    const { conn, dbType } = await this.dbService.getDatabaseConnection(project.databaseId);
                    let connector: any;
                    if (dbType === "mysql") connector = require("../connectors/mysql");
                    else if (dbType === "postgres") connector = require("../connectors/postgres");
                    else if (dbType === "mariadb") connector = require("../connectors/mariadb");
                    else if (dbType === "sqlite") connector = require("../connectors/sqlite");

                    if (connector) {
                        try {
                            const tables = await connector.listTables(conn);
                            // Filter out internal migration tracking tables
                            const userTables = (tables || []).filter((t: any) => {
                                const name = typeof t === "string" ? t : t?.name || "";
                                return name !== "__relwave_migrations" && name !== "relwave_migrations";
                            });
                            targetTableCount = userTables.length;
                            targetDatabaseEmpty = targetTableCount === 0;
                        } catch {
                            // Can't list tables — assume non-empty for safety
                            targetDatabaseEmpty = false;
                        }

                        try {
                            const applied = await connector.listAppliedMigrations(conn);
                            dbAppliedVersions = (applied || []).map((m: any) => m.version);
                        } catch {
                            // Migration tracking table may not exist yet
                        }
                    }
                } catch {
                    // Database connection may not be available
                }
            }

            // 5. Compute pending migrations
            const appliedSet = new Set(dbAppliedVersions);
            const pendingMigrations: Array<{
                file: string;
                version: string;
                isDestructive: boolean;
                destructiveOps: string[];
            }> = [];

            for (const file of migrationFiles) {
                const versionMatch = file.match(/^(\d{13,14})/);
                if (!versionMatch) continue;
                const version = versionMatch[1];
                if (appliedSet.has(version)) continue;

                // Parse for destructive operations
                let isDestructive = false;
                const destructiveOps: string[] = [];
                try {
                    const parsed = readMigrationFile(path.join(migrationsDir, file));
                    const upSQL = parsed.upSQL.toUpperCase();
                    if (upSQL.includes("DROP TABLE")) {
                        isDestructive = true;
                        destructiveOps.push("DROP TABLE");
                    }
                    if (upSQL.includes("DROP COLUMN")) {
                        isDestructive = true;
                        destructiveOps.push("DROP COLUMN");
                    }
                    if (upSQL.includes("TRUNCATE")) {
                        isDestructive = true;
                        destructiveOps.push("TRUNCATE");
                    }
                } catch {
                    // Skip parse errors
                }

                pendingMigrations.push({ file, version, isDestructive, destructiveOps });
            }

            // 6. Detect if all migration files are baseline-only (no real user migrations)
            const isBaselineOnly = hasMigrations && migrationFiles.every(f => f.includes("baseline"));

            // 7. Compute drift status
            let driftStatus: "synced" | "drifted" | "unknown" = "unknown";
            if (pendingMigrations.length === 0 && hasMigrations) {
                // All migrations applied
                driftStatus = "synced";
            } else if (pendingMigrations.length === 0 && !hasMigrations && !hasSchemaSnapshot) {
                // No migrations or schema — fresh project
                driftStatus = "synced";
            } else if (pendingMigrations.length > 0) {
                driftStatus = "drifted";
            } else if (!hasMigrations && hasSchemaSnapshot && targetDatabaseEmpty) {
                // Schema exists but database is empty — need to apply snapshot
                driftStatus = "drifted";
            } else if (!hasMigrations && hasSchemaSnapshot && !targetDatabaseEmpty) {
                // Schema exists and database has tables — assume synced (user just hasn't made migrations yet)
                driftStatus = "synced";
            }

            // 8. Compute available modes
            const availableModes: Array<"run_migrations" | "apply_snapshot" | "skip"> = ["skip"];
            let recommendedMode: "run_migrations" | "apply_snapshot" | "skip" = "skip";

            if (isBaselineOnly && hasSchemaSnapshot && targetDatabaseEmpty) {
                // Baseline-only + empty DB + schema.json exists:
                // The baseline file has no real DDL — use schema.json to reconstruct the DB
                availableModes.unshift("apply_snapshot");
                recommendedMode = "apply_snapshot";
                // Override: treat as "no real migrations" for the dialog
                driftStatus = "drifted";
            } else if (hasMigrations && pendingMigrations.length > 0 && !isBaselineOnly) {
                availableModes.unshift("run_migrations");
                recommendedMode = "run_migrations";
            }
            if (hasSchemaSnapshot && targetDatabaseEmpty && !hasMigrations) {
                availableModes.unshift("apply_snapshot");
                recommendedMode = "apply_snapshot";
            }

            // For the dialog: if baseline-only + empty DB, report as "no real migrations"
            // so the frontend shows "Apply Schema Snapshot" (STATE 3) instead of
            // "Pending Migrations" (STATE 2) which would try to run the empty baseline
            const reportHasMigrations = isBaselineOnly && targetDatabaseEmpty ? false : hasMigrations;
            const reportPendingMigrations = isBaselineOnly && targetDatabaseEmpty ? [] : pendingMigrations;

            const result = {
                hasMigrations: reportHasMigrations,
                migrationCount: reportPendingMigrations.length,
                hasSchemaSnapshot,
                lockFileStatus,
                tamperedFiles,
                targetDatabaseEmpty,
                targetTableCount,
                driftStatus,
                driftDetails: undefined,
                pendingMigrations: reportPendingMigrations,
                availableModes,
                recommendedMode,
            };

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

            const isValid = await verifyMigrationLock(project.databaseId, schemaHash);
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
            await gitServiceInstance.pushMigrations(projectDir);
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

    async handleUnlinkFromConnection(params: any, id: number | string) {
        try {
            const { databaseId } = params || {};
            if (!databaseId) {
                return this.rpc.sendError(id, {
                    code: "BAD_REQUEST",
                    message: "Missing databaseId",
                });
            }

            await projectStoreInstance.unlinkDatabase(databaseId);
            this.rpc.sendResponse(id, { ok: true });
        } catch (e: any) {
            this.logger?.error({ e }, "project.unlinkFromConnection failed");
            this.rpc.sendError(id, { code: "IO_ERROR", message: String(e) });
        }
    }

    async handleDeleteWithConnection(params: any, id: number | string) {
        try {
            const { databaseId } = params || {};
            if (!databaseId) {
                return this.rpc.sendError(id, {
                    code: "BAD_REQUEST",
                    message: "Missing databaseId",
                });
            }

            await projectStoreInstance.deleteProjectByDatabaseId(databaseId);
            this.rpc.sendResponse(id, { ok: true });
        } catch (e: any) {
            this.logger?.error({ e }, "project.deleteWithConnection failed");
            this.rpc.sendError(id, { code: "IO_ERROR", message: String(e) });
        }
    }

    async handleGetGitRemote(params: any, id: number | string) {
        try {
            const { projectPath } = params || {};
            if (!projectPath) {
                return this.rpc.sendError(id, {
                    code: "BAD_REQUEST",
                    message: "Missing projectPath",
                });
            }

            // Using gitServiceInstance since it handles standard git operations
            const remotes = await gitServiceInstance.remoteList(projectPath);
            const remoteUrl = remotes.length > 0 ? remotes[0].fetchUrl : null;
            
            this.rpc.sendResponse(id, { ok: true, data: { remoteUrl } });
        } catch (e: any) {
            // If it's not a git repo or fails, just return null
            this.logger?.error({ e }, "project.getGitRemote failed (might not be a git repo)");
            this.rpc.sendResponse(id, { ok: true, data: { remoteUrl: null } });
        }
    }

    async handleRelinkToConnection(params: any, id: number | string) {
        try {
            const { projectId, databaseId } = params || {};
            if (!projectId || !databaseId) {
                return this.rpc.sendError(id, {
                    code: "BAD_REQUEST",
                    message: "Missing projectId or databaseId",
                });
            }

            const project = await projectStoreInstance.relinkDatabase(projectId, databaseId);
            
            this.rpc.sendResponse(id, { ok: true, data: project });
        } catch (e: any) {
            this.logger?.error({ e }, "project.relinkToConnection failed");
            // Check if it's the specific error we throw
            if (e.message?.includes("DATABASE_ALREADY_HAS_PROJECT")) {
                this.rpc.sendError(id, { code: "DATABASE_ALREADY_HAS_PROJECT", message: e.message });
            } else {
                this.rpc.sendError(id, { code: "IO_ERROR", message: String(e) });
            }
        }
    }

    async handleGenerateSQL(params: any, id: number | string) {
        try {
            const { projectId } = params || {};
            if (!projectId) {
                return this.rpc.sendError(id, {
                    code: "BAD_REQUEST",
                    message: "Missing projectId",
                });
            }

            const { projectStoreInstance } = await import("../services/projectStore");
            const schemaFile = await projectStoreInstance.getSchema(projectId);
            if (!schemaFile) {
                return this.rpc.sendError(id, {
                    code: "NOT_FOUND",
                    message: "No schema snapshot found",
                });
            }

            const { generateBaselineSQL } = await import("../utils/baselineMigration");
            const sql = generateBaselineSQL(schemaFile as any, "preview", "preview");

            this.rpc.sendResponse(id, { ok: true, data: { sql } });
        } catch (e: any) {
            this.logger?.error({ e }, "project.generateSQL failed");
            this.rpc.sendError(id, { code: "IO_ERROR", message: String(e) });
        }
    }
}
