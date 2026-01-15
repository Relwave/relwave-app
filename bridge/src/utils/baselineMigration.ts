import fs from "fs";
import path from "path";

function generateBaselineSQL(version: string, name: string) {
    return `-- ${version}_${name}.sql

-- +up
-- Baseline migration
-- Existing schema assumed to be correct
-- No-op

-- +down
-- Rollback not supported for baseline
`;
}


export function writeBaselineMigration(
    migrationsDir: string,
    version: string,
    name: string
) {
    if (!fs.existsSync(migrationsDir)) {
        fs.mkdirSync(migrationsDir, { recursive: true });
    }

    const filename = `${version}_${name}.sql`;
    const filepath = path.join(migrationsDir, filename);

    const sql = generateBaselineSQL(version, name);
    fs.writeFileSync(filepath, sql, "utf8");

    return filepath;
}

export async function loadLocalMigrations(migrationsDir: string) {
    const files = await fs.promises.readdir(migrationsDir);
    const migrations = files
        .filter((file) => file.endsWith(".sql"))
        .map((file) => {
            const version = file.split("_")[0];
            const name = file.split("_")[1];
            return { version, name };
        });
    return migrations;
}


