import fs from "fs/promises";
import path from "path";
import fsSync from "fs";
import { projectStoreInstance } from "./projectStore";

export interface MigrationLock {
    version: string;
    schemaHash: string;
    appliedMigrations: string[]; // List of migration filenames
    updatedAt: string;
}

export async function getLockFilePath(dbId: string): Promise<string> {
    const migrationsDir = await projectStoreInstance.resolveMigrationsDir(dbId);
    return path.join(migrationsDir, "migration.lock.json");
}

export async function readMigrationLock(dbId: string): Promise<MigrationLock | null> {
    const lockPath = await getLockFilePath(dbId);
    if (!fsSync.existsSync(lockPath)) return null;
    
    try {
        const raw = await fs.readFile(lockPath, "utf8");
        return JSON.parse(raw) as MigrationLock;
    } catch (err) {
        return null;
    }
}

export async function writeMigrationLock(
    dbId: string,
    schemaHash: string,
    appliedMigrations: string[]
): Promise<void> {
    const lockPath = await getLockFilePath(dbId);
    const lockData: MigrationLock = {
        version: "1",
        schemaHash,
        appliedMigrations,
        updatedAt: new Date().toISOString()
    };
    
    await fs.mkdir(path.dirname(lockPath), { recursive: true }).catch(() => {});
    await fs.writeFile(lockPath, JSON.stringify(lockData, null, 2), "utf8");
}

export async function verifyMigrationLock(dbId: string, targetHash: string): Promise<boolean> {
    const lock = await readMigrationLock(dbId);
    if (!lock) return false;
    return lock.schemaHash === targetHash;
}
