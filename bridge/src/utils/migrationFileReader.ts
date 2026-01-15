import fs from "fs";
import path from "path";
import crypto from "crypto";

export interface ParsedMigration {
    version: string;
    name: string;
    upSQL: string;
    downSQL: string;
    checksum: string;
}

/**
 * Read and parse a migration file
 */
export function readMigrationFile(filepath: string): ParsedMigration {
    const content = fs.readFileSync(filepath, "utf8");
    const filename = path.basename(filepath);

    // Extract version and name from filename: 20260104160000_create_users.sql
    const match = filename.match(/^(\d{14})_(.+)\.sql$/);
    if (!match) {
        throw new Error(`Invalid migration filename format: ${filename}`);
    }

    const [, version, name] = match;

    // Parse up and down SQL
    const upMatch = content.match(/--\s*\+up\s*\n([\s\S]*?)(?=\n--\s*\+down|$)/i);
    const downMatch = content.match(/--\s*\+down\s*\n([\s\S]*?)$/i);

    if (!upMatch || !downMatch) {
        throw new Error(`Migration file missing +up or +down sections: ${filename}`);
    }

    const upSQL = upMatch[1].trim();
    const downSQL = downMatch[1].trim();

    // Calculate checksum
    const checksum = crypto
        .createHash("sha256")
        .update(content)
        .digest("hex");

    return {
        version,
        name,
        upSQL,
        downSQL,
        checksum,
    };
}

/**
 * List all migration files in a directory
 */
export function listMigrationFiles(migrationsDir: string): string[] {
    if (!fs.existsSync(migrationsDir)) {
        return [];
    }

    const files = fs.readdirSync(migrationsDir);
    return files
        .filter((file) => file.endsWith(".sql"))
        .sort(); // Sort by filename (which includes timestamp)
}
