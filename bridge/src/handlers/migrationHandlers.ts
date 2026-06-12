import { Rpc } from "../types";
import { DatabaseService } from "../services/databaseService";
import { QueryExecutor } from "../services/queryExecutor";
import { Logger } from "pino";
import { getMigrationsDir } from "../utils/config";
import path from "path";
import fs from "fs";

export class MigrationHandlers {
    constructor(
        private rpc: Rpc,
        private logger: Logger,
        private dbService: DatabaseService,
        private queryExecutor: QueryExecutor
    ) { }

    async handleGenerateCreateMigration(params: any, id: number | string) {
        try {
            const { dbId, schemaName, tableName, columns, foreignKeys = [] } = params || {};

            if (!dbId || !schemaName || !tableName || !columns) {
                return this.rpc.sendError(id, {
                    code: "BAD_REQUEST",
                    message: "Missing required parameters",
                });
            }

            const { conn, dbType } = await this.dbService.getDatabaseConnection(dbId);
            const migrationsDir = getMigrationsDir(dbId);

            // Generate migration file
            const { generateCreateTableMigration, writeMigrationFile } = await import('../utils/migrationGenerator');
            const migration = generateCreateTableMigration({
                schemaName,
                tableName,
                columns,
                foreignKeys,
                dbType,
            });

            const filepath = writeMigrationFile(migrationsDir, migration);

            this.rpc.sendResponse(id, {
                ok: true,
                data: {
                    version: migration.version,
                    filename: migration.filename,
                    filepath,
                },
            });
        } catch (e: any) {
            this.logger?.error({ e }, "migration.generateCreate failed");
            this.rpc.sendError(id, { code: "IO_ERROR", message: String(e) });
        }
    }

    async handleGenerateAlterMigration(params: any, id: number | string) {
        try {
            const { dbId, schemaName, tableName, operations } = params || {};

            if (!dbId || !schemaName || !tableName || !operations) {
                return this.rpc.sendError(id, {
                    code: "BAD_REQUEST",
                    message: "Missing required parameters",
                });
            }

            const { conn, dbType } = await this.dbService.getDatabaseConnection(dbId);
            const migrationsDir = getMigrationsDir(dbId);

            // Generate migration file
            const { generateAlterTableMigration, writeMigrationFile } = await import('../utils/migrationGenerator');
            const migration = generateAlterTableMigration({
                schemaName,
                tableName,
                operations,
                dbType,
            });

            const filepath = writeMigrationFile(migrationsDir, migration);

            this.rpc.sendResponse(id, {
                ok: true,
                data: {
                    version: migration.version,
                    filename: migration.filename,
                    filepath,
                },
            });
        } catch (e: any) {
            this.logger?.error({ e }, "migration.generateAlter failed");
            this.rpc.sendError(id, { code: "IO_ERROR", message: String(e) });
        }
    }

    async handleGenerateDropMigration(params: any, id: number | string) {
        try {
            const { dbId, schemaName, tableName, mode = "RESTRICT" } = params || {};

            if (!dbId || !schemaName || !tableName) {
                return this.rpc.sendError(id, {
                    code: "BAD_REQUEST",
                    message: "Missing required parameters",
                });
            }

            const { conn, dbType } = await this.dbService.getDatabaseConnection(dbId);
            const migrationsDir = getMigrationsDir(dbId);

            // Generate migration file
            const { generateDropTableMigration, writeMigrationFile } = await import('../utils/migrationGenerator');
            const migration = generateDropTableMigration({
                schemaName,
                tableName,
                mode,
                dbType,
            });

            const filepath = writeMigrationFile(migrationsDir, migration);

            this.rpc.sendResponse(id, {
                ok: true,
                data: {
                    version: migration.version,
                    filename: migration.filename,
                    filepath,
                },
            });
        } catch (e: any) {
            this.logger?.error({ e }, "migration.generateDrop failed");
            this.rpc.sendError(id, { code: "IO_ERROR", message: String(e) });
        }
    }

    async handleApplyMigration(params: any, id: number | string) {
        try {
            const { dbId, version } = params || {};

            if (!dbId || !version) {
                return this.rpc.sendError(id, {
                    code: "BAD_REQUEST",
                    message: "Missing dbId or version",
                });
            }

            const { conn, dbType } = await this.dbService.getDatabaseConnection(dbId);
            const migrationsDir = getMigrationsDir(dbId);

            // Find migration file
            const { listMigrationFiles } = await import('../utils/migrationFileReader');
            const files = listMigrationFiles(migrationsDir);
            const migrationFile = files.find(f => f.startsWith(version));

            if (!migrationFile) {
                return this.rpc.sendError(id, {
                    code: "NOT_FOUND",
                    message: `Migration file not found for version: ${version}`,
                });
            }

            const migrationFilePath = path.join(migrationsDir, migrationFile);

            if (dbType === "mysql") {
                await this.queryExecutor.mysql.applyMigration(conn, migrationFilePath);
            } else if (dbType === "postgres") {
                await this.queryExecutor.postgres.applyMigration(conn, migrationFilePath);
            } else if (dbType === "mariadb") {
                await this.queryExecutor.mariadb.applyMigration(conn, migrationFilePath);
            } else if (dbType === "sqlite") {
                await this.queryExecutor.sqlite.applyMigration(conn, migrationFilePath);
            }

            // Hook syncMigrationFiles
            try {
                const { projectStoreInstance } = await import("../services/projectStore");
                const { gitServiceInstance } = await import("../services/gitService");
                const { writeMigrationLock } = await import("../services/migrationLock");

                const project = await projectStoreInstance.getProjectByDatabaseId(dbId);
                if (project) {
                    const projectDir = await projectStoreInstance.resolveProjectDir(project.id);
                    if (projectDir) {
                        const syncResult = await gitServiceInstance.syncMigrationFiles(projectDir);
                        if (syncResult.error) {
                            this.logger?.warn({ error: syncResult.error }, "Git sync failed after migration apply");
                        }
                    }

                    // Update Migration Lock
                    let appliedMigrations: any[] = [];
                    if (dbType === "mysql") {
                        appliedMigrations = await require("../connectors/mysql").listAppliedMigrations(conn);
                    } else if (dbType === "postgres") {
                        appliedMigrations = await require("../connectors/postgres").listAppliedMigrations(conn);
                    } else if (dbType === "mariadb") {
                        appliedMigrations = await require("../connectors/mariadb").listAppliedMigrations(conn);
                    } else if (dbType === "sqlite") {
                        appliedMigrations = await require("../connectors/sqlite").listAppliedMigrations(conn);
                    }

                    const schemaFile = await projectStoreInstance.getSchema(project.id);
                    const schemaHash = (schemaFile as any)?.schemaHash || "";
                    
                    const appliedVersions = appliedMigrations.map(m => m.version);
                    writeMigrationLock(dbId, schemaHash, appliedVersions);
                }
            } catch (syncErr) {
                this.logger?.error({ err: syncErr }, "syncMigrationFiles/lock hook failed");
            }

            this.rpc.sendResponse(id, { ok: true });
        } catch (e: any) {
            this.logger?.error({ e }, "migration.apply failed");
            this.rpc.sendError(id, { code: "IO_ERROR", message: String(e) });
        }
    }

    async handleApplyMigrations(params: any, id: number | string) {
        try {
            const { dbId } = params || {};
            if (!dbId) return this.rpc.sendError(id, { code: "BAD_REQUEST", message: "Missing dbId" });

            const { conn, dbType } = await this.dbService.getDatabaseConnection(dbId);
            const migrationsDir = getMigrationsDir(dbId);
            
            const { loadLocalMigrations } = await import('../utils/baselineMigration');
            const localMigrations = await loadLocalMigrations(migrationsDir);
            
            let connector: any;
            if (dbType === "mysql") connector = require("../connectors/mysql");
            else if (dbType === "postgres") connector = require("../connectors/postgres");
            else if (dbType === "mariadb") connector = require("../connectors/mariadb");
            else if (dbType === "sqlite") connector = require("../connectors/sqlite");
            
            const appliedMigrations = await connector.listAppliedMigrations(conn);
            const appliedSet = new Set(appliedMigrations.map((m: any) => m.version));
            
            const pending = localMigrations.filter(m => !appliedSet.has(m.version)).sort((a, b) => a.version.localeCompare(b.version));
            
            for (const migration of pending) {
                const migrationFile = (await fs.promises.readdir(migrationsDir)).find(f => f.startsWith(migration.version));
                if (!migrationFile) throw new Error(`Migration file not found for version: ${migration.version}`);
                
                const migrationFilePath = path.join(migrationsDir, migrationFile);
                if (dbType === "mysql") await this.queryExecutor.mysql.applyMigration(conn, migrationFilePath);
                else if (dbType === "postgres") await this.queryExecutor.postgres.applyMigration(conn, migrationFilePath);
                else if (dbType === "mariadb") await this.queryExecutor.mariadb.applyMigration(conn, migrationFilePath);
                else if (dbType === "sqlite") await this.queryExecutor.sqlite.applyMigration(conn, migrationFilePath);
            }

            try {
                const { projectStoreInstance } = await import("../services/projectStore");
                const { writeMigrationLock } = await import("../services/migrationLock");
                const project = await projectStoreInstance.getProjectByDatabaseId(dbId);
                if (project) {
                    const schemaFile = await projectStoreInstance.getSchema(project.id);
                    const schemaHash = (schemaFile as any)?.schemaHash || "";
                    const updatedApplied = await connector.listAppliedMigrations(conn);
                    writeMigrationLock(dbId, schemaHash, updatedApplied.map((m: any) => m.version));
                }
            } catch (syncErr) {
                this.logger?.error({ err: syncErr }, "Lock hook failed");
            }

            this.rpc.sendResponse(id, { ok: true, count: pending.length });
        } catch (e: any) {
            this.logger?.error({ e }, "migration.applyMigrations failed");
            this.rpc.sendError(id, { code: "IO_ERROR", message: String(e) });
        }
    }

    async handleApplySnapshot(params: any, id: number | string) {
        try {
            const { dbId } = params || {};
            if (!dbId) return this.rpc.sendError(id, { code: "BAD_REQUEST", message: "Missing dbId" });

            const { conn, dbType } = await this.dbService.getDatabaseConnection(dbId);

            const { projectStoreInstance } = await import("../services/projectStore");
            const project = await projectStoreInstance.getProjectByDatabaseId(dbId);
            if (!project) throw new Error("Project not found for database");
            const snapshot = await projectStoreInstance.getSchema(project.id);
            if (!snapshot) throw new Error("Schema snapshot not found");

            const { generateBaselineSQL } = await import("../utils/baselineMigration");
            const baselineSQL = generateBaselineSQL(snapshot, Date.now().toString(), "apply_snapshot");

            let connector: any;
            if (dbType === "mysql") connector = require("../connectors/mysql");
            else if (dbType === "postgres") connector = require("../connectors/postgres");
            else if (dbType === "mariadb") connector = require("../connectors/mariadb");
            else if (dbType === "sqlite") connector = require("../connectors/sqlite");

            // For full snapshot apply, we assume DB is empty or we should drop it.
            // A full implementation would drop tables here.
            // For now, we write the SQL and apply it. 

            const tmpPath = path.join(getMigrationsDir(dbId), "tmp_snapshot_apply.sql");
            fs.writeFileSync(tmpPath, baselineSQL, "utf8");
            
            if (dbType === "mysql") await this.queryExecutor.mysql.applyMigration(conn, tmpPath);
            else if (dbType === "postgres") await this.queryExecutor.postgres.applyMigration(conn, tmpPath);
            else if (dbType === "mariadb") await this.queryExecutor.mariadb.applyMigration(conn, tmpPath);
            else if (dbType === "sqlite") await this.queryExecutor.sqlite.applyMigration(conn, tmpPath);
            
            if (fs.existsSync(tmpPath)) fs.unlinkSync(tmpPath);

            try {
                const { writeMigrationLock } = await import("../services/migrationLock");
                const schemaHash = (snapshot as any)?.schemaHash || "";
                const updatedApplied = await connector.listAppliedMigrations(conn);
                writeMigrationLock(dbId, schemaHash, updatedApplied.map((m: any) => m.version));
            } catch (syncErr) {
                this.logger?.error({ err: syncErr }, "Lock hook failed");
            }

            this.rpc.sendResponse(id, { ok: true });
        } catch (e: any) {
            this.logger?.error({ e }, "migration.applySnapshot failed");
            this.rpc.sendError(id, { code: "IO_ERROR", message: String(e) });
        }
    }

    async handleRollbackMigration(params: any, id: number | string) {
        try {
            const { dbId, version } = params || {};

            if (!dbId || !version) {
                return this.rpc.sendError(id, {
                    code: "BAD_REQUEST",
                    message: "Missing dbId or version",
                });
            }

            const { conn, dbType } = await this.dbService.getDatabaseConnection(dbId);
            const migrationsDir = getMigrationsDir(dbId);

            // Find migration file
            const { listMigrationFiles } = await import('../utils/migrationFileReader');
            const files = listMigrationFiles(migrationsDir);
            const migrationFile = files.find(f => f.startsWith(version));

            if (!migrationFile) {
                return this.rpc.sendError(id, {
                    code: "NOT_FOUND",
                    message: `Migration file not found for version: ${version}`,
                });
            }

            const migrationFilePath = path.join(migrationsDir, migrationFile);

            // Rollback migration
            if (dbType === "mysql") {
                await this.queryExecutor.mysql.rollbackMigration(conn, version, migrationFilePath);
            } else if (dbType === "postgres") {
                await this.queryExecutor.postgres.rollbackMigration(conn, version, migrationFilePath);
            } else if (dbType === "mariadb") {
                await this.queryExecutor.mariadb.rollbackMigration(conn, version, migrationFilePath);
            } else if (dbType === "sqlite") {
                await this.queryExecutor.sqlite.rollbackMigration(conn, version, migrationFilePath);
            }

            // Hook syncMigrationFiles and Lock Update
            try {
                const { projectStoreInstance } = await import("../services/projectStore");
                const { gitServiceInstance } = await import("../services/gitService");
                const { writeMigrationLock } = await import("../services/migrationLock");

                const project = await projectStoreInstance.getProjectByDatabaseId(dbId);
                if (project) {
                    const projectDir = await projectStoreInstance.resolveProjectDir(project.id);
                    if (projectDir) {
                        const syncResult = await gitServiceInstance.syncMigrationFiles(projectDir);
                        if (syncResult.error) {
                            this.logger?.warn({ error: syncResult.error }, "Git sync failed after migration rollback");
                        }
                    }

                    // Update Migration Lock
                    let appliedMigrations: any[] = [];
                    if (dbType === "mysql") {
                        appliedMigrations = await require("../connectors/mysql").listAppliedMigrations(conn);
                    } else if (dbType === "postgres") {
                        appliedMigrations = await require("../connectors/postgres").listAppliedMigrations(conn);
                    } else if (dbType === "mariadb") {
                        appliedMigrations = await require("../connectors/mariadb").listAppliedMigrations(conn);
                    } else if (dbType === "sqlite") {
                        appliedMigrations = await require("../connectors/sqlite").listAppliedMigrations(conn);
                    }

                    const schemaFile = await projectStoreInstance.getSchema(project.id);
                    const schemaHash = (schemaFile as any)?.schemaHash || "";
                    
                    const appliedVersions = appliedMigrations.map(m => m.version);
                    writeMigrationLock(dbId, schemaHash, appliedVersions);
                }
            } catch (syncErr) {
                this.logger?.error({ err: syncErr }, "syncMigrationFiles/lock hook failed");
            }

            this.rpc.sendResponse(id, { ok: true });
        } catch (e: any) {
            this.logger?.error({ e }, "migration.rollback failed");
            this.rpc.sendError(id, { code: "IO_ERROR", message: String(e) });
        }
    }

    async handleDeleteMigration(params: any, id: number | string) {
        try {
            const { dbId, version } = params || {};

            if (!dbId || !version) {
                return this.rpc.sendError(id, {
                    code: "BAD_REQUEST",
                    message: "Missing dbId or version",
                });
            }

            const migrationsDir = getMigrationsDir(dbId);

            // Find and delete migration file
            const { listMigrationFiles } = await import('../utils/migrationFileReader');
            const files = listMigrationFiles(migrationsDir);
            const migrationFile = files.find(f => f.startsWith(version));

            if (!migrationFile) {
                return this.rpc.sendError(id, {
                    code: "NOT_FOUND",
                    message: `Migration file not found for version: ${version}`,
                });
            }

            const migrationFilePath = path.join(migrationsDir, migrationFile);
            fs.unlinkSync(migrationFilePath);

            this.rpc.sendResponse(id, { ok: true });
        } catch (e: any) {
            this.logger?.error({ e }, "migration.delete failed");
            this.rpc.sendError(id, { code: "IO_ERROR", message: String(e) });
        }
    }

    async handleGetMigrationSQL(params: any, id: number | string) {
        try {
            const { dbId, version } = params || {};

            if (!dbId || !version) {
                return this.rpc.sendError(id, {
                    code: "BAD_REQUEST",
                    message: "Missing dbId or version",
                });
            }

            const migrationsDir = getMigrationsDir(dbId);

            // Find and read migration file
            const { listMigrationFiles, readMigrationFile } = await import('../utils/migrationFileReader');
            const files = listMigrationFiles(migrationsDir);
            const migrationFile = files.find(f => f.startsWith(version));

            if (!migrationFile) {
                return this.rpc.sendError(id, {
                    code: "NOT_FOUND",
                    message: `Migration file not found for version: ${version}`,
                });
            }

            const migrationFilePath = path.join(migrationsDir, migrationFile);
            const migration = readMigrationFile(migrationFilePath);

            this.rpc.sendResponse(id, {
                ok: true,
                data: {
                    up: migration.upSQL,
                    down: migration.downSQL,
                },
            });
        } catch (e: any) {
            this.logger?.error({ e }, "migration.getSQL failed");
            this.rpc.sendError(id, { code: "IO_ERROR", message: String(e) });
        }
    }
}
