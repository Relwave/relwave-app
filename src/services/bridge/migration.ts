import { bridgeRequest } from "./bridgeClient";
import { analyticsService } from "../analytics";

class MigrationService {
    /**
    * Generate CREATE TABLE migration file
    */
    async generateCreateMigration(params: {
        dbId: string;
        schemaName: string;
        tableName: string;
        columns: any[];
        foreignKeys?: any[];
    }): Promise<{ version: string; filename: string; filepath: string }> {
        try {
            const result = await bridgeRequest("migration.generateCreate", params);
            analyticsService.trackMigrationCreated();
            return result?.data;
        } catch (error: any) {
            console.error("Failed to generate create migration:", error);
            throw new Error(`Failed to generate migration: ${error.message}`);
        }
    }

    /**
     * Generate ALTER TABLE migration file
     */
    async generateAlterMigration(params: {
        dbId: string;
        schemaName: string;
        tableName: string;
        operations: any[];
    }): Promise<{ version: string; filename: string; filepath: string }> {
        try {
            const result = await bridgeRequest("migration.generateAlter", params);
            analyticsService.trackMigrationCreated();
            return result?.data;
        } catch (error: any) {
            console.error("Failed to generate alter migration:", error);
            throw new Error(`Failed to generate migration: ${error.message}`);
        }
    }

    /**
     * Generate DROP TABLE migration file
     */
    async generateDropMigration(params: {
        dbId: string;
        schemaName: string;
        tableName: string;
        mode?: "RESTRICT" | "DETACH_FKS" | "CASCADE";
    }): Promise<{ version: string; filename: string; filepath: string }> {
        try {
            const result = await bridgeRequest("migration.generateDrop", params);
            analyticsService.trackMigrationCreated();
            return result?.data;
        } catch (error: any) {
            console.error("Failed to generate drop migration:", error);
            throw new Error(`Failed to generate migration: ${error.message}`);
        }
    }

    /**
     * Apply a pending migration
     */
    async applyMigration(dbId: string, version: string): Promise<boolean> {
        try {
            const result = await bridgeRequest("migration.apply", { dbId, version });
            if (result?.ok) {
                analyticsService.trackMigrationApplied();
            }
            return result?.ok === true;
        } catch (error: any) {
            console.error("Failed to apply migration:", error);
            throw new Error(`Failed to apply migration: ${error.message}`);
        }
    }

    /**
     * Rollback an applied migration
     */
    async rollbackMigration(dbId: string, version: string): Promise<boolean> {
        try {
            const result = await bridgeRequest("migration.rollback", { dbId, version });
            return result?.ok === true;
        } catch (error: any) {
            console.error("Failed to rollback migration:", error);
            throw new Error(`Failed to rollback migration: ${error.message}`);
        }
    }

    /**
     * Delete a pending migration file
     */
    async deleteMigration(dbId: string, version: string): Promise<boolean> {
        try {
            const result = await bridgeRequest("migration.delete", { dbId, version });
            return result?.ok === true;
        } catch (error: any) {
            console.error("Failed to delete migration:", error);
            throw new Error(`Failed to delete migration: ${error.message}`);
        }
    }

    /**
     * Get migration SQL (up and down)
     */
    async getMigrationSQL(dbId: string, version: string): Promise<{ up: string; down: string }> {
        try {
            const result = await bridgeRequest("migration.getSQL", { dbId, version });
            return result?.data;
        } catch (error: any) {
            console.error("Failed to get migration SQL:", error);
            throw new Error(`Failed to get migration SQL: ${error.message}`);
        }
    }
}


export const migrationService = new MigrationService();