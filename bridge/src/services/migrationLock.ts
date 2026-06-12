import fs from "fs";
import path from "path";
import crypto from "crypto";
import { getMigrationsDir } from "../utils/config";

export interface MigrationLock {
    version: string;
    schemaHash: string;
    appliedMigrations: string[]; // List of migration filenames
    updatedAt: string;
}

export function getLockFilePath(dbId: string): string {
    return path.join(getMigrationsDir(dbId), "migration.lock.json");
}

export function readMigrationLock(dbId: string): MigrationLock | null {
    const lockPath = getLockFilePath(dbId);
    if (!fs.existsSync(lockPath)) return null;
    
    try {
        const raw = fs.readFileSync(lockPath, "utf8");
        return JSON.parse(raw) as MigrationLock;
    } catch (err) {
        return null;
    }
}

export function writeMigrationLock(
    dbId: string,
    schemaHash: string,
    appliedMigrations: string[]
): void {
    const lockPath = getLockFilePath(dbId);
    const lockData: MigrationLock = {
        version: "1",
        schemaHash,
        appliedMigrations,
        updatedAt: new Date().toISOString()
    };
    
    fs.mkdirSync(path.dirname(lockPath), { recursive: true });
    fs.writeFileSync(lockPath, JSON.stringify(lockData, null, 2), "utf8");
}

export function verifyMigrationLock(dbId: string, targetHash: string): boolean {
    const lock = readMigrationLock(dbId);
    if (!lock) return false;
    return lock.schemaHash === targetHash;
}
