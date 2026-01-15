import { Rpc } from "../types";
import { DatabaseService } from "../services/databaseService";
import { QueryExecutor } from "../services/queryExecutor";
import { Logger } from "pino";
import { getMigrationsDir } from "../services/dbStore";
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

            // Apply migration
            if (dbType === "mysql") {
                await this.queryExecutor.mysql.applyMigration(conn, migrationFilePath);
            } else {
                await this.queryExecutor.postgres.applyMigration(conn, migrationFilePath);
            }

            this.rpc.sendResponse(id, { ok: true });
        } catch (e: any) {
            this.logger?.error({ e }, "migration.apply failed");
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
            } else {
                await this.queryExecutor.postgres.rollbackMigration(conn, version, migrationFilePath);
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
