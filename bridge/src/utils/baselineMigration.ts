import fs from "fs";
import path from "path";

import { SchemaFile } from "../services/projectStore";

function quoteIdent(name: string, dbType: string): string {
    if (dbType === "mysql" || dbType === "mariadb") {
        return `\`${name.replace(/`/g, "``")}\``;
    } else {
        return `"${name.replace(/"/g, '""')}"`;
    }
}

export function generateBaselineSQL(snapshot: SchemaFile, version: string, name: string) {
    const dbType = snapshot.dialect || "unknown";
    
    if (dbType === "unknown") {
        return `-- ${version}_${name}.sql

-- +up
-- Baseline migration
-- Existing schema assumed to be correct
-- No-op

-- +down
-- Rollback not supported for baseline
`;
    }

    let upSQL = "";

    for (const schema of snapshot.schemas) {
        // Enums (Postgres)
        if (schema.enums && dbType === "postgresql") {
            for (const e of schema.enums) {
                const vals = e.values.map(v => `'${v.replace(/'/g, "''")}'`).join(", ");
                upSQL += `CREATE TYPE ${quoteIdent(schema.name, dbType)}.${quoteIdent(e.name, dbType)} AS ENUM (${vals});\n`;
            }
            if (schema.enums.length > 0) upSQL += "\n";
        }

        // Tables
        for (const table of schema.tables) {
            const tableRef = dbType === "sqlite" ? quoteIdent(table.name, dbType) : `${quoteIdent(schema.name, dbType)}.${quoteIdent(table.name, dbType)}`;
            
            const columnDefs = table.columns.map(col => {
                let def = `  ${quoteIdent(col.name, dbType)} ${col.type}`;
                if (!col.nullable) def += " NOT NULL";
                if (col.defaultValue) def += ` DEFAULT ${col.defaultValue}`;
                if (col.isPrimaryKey) def += " PRIMARY KEY";
                if (col.isUnique && !col.isPrimaryKey) def += " UNIQUE";
                if (col.checkConstraint) def += ` ${col.checkConstraint}`;
                return def;
            });

            // check constraints
            if (table.checks && table.checks.length > 0) {
                for (const chk of table.checks) {
                    columnDefs.push(`  CONSTRAINT ${quoteIdent(chk.name, dbType)} CHECK (${chk.expression})`);
                }
            }

            const fkDefs = (table.foreignKeys || []).map(fk => {
                const onDelete = fk.onDelete || "NO ACTION";
                const onUpdate = fk.onUpdate || "NO ACTION";
                const targetRef = dbType === "sqlite" ? quoteIdent(fk.referencedTable, dbType) : `${quoteIdent(fk.referencedSchema || schema.name, dbType)}.${quoteIdent(fk.referencedTable, dbType)}`;
                const srcCols = fk.columns.map(c => quoteIdent(c, dbType)).join(", ");
                const tgtCols = fk.referencedColumns.map(c => quoteIdent(c, dbType)).join(", ");
                return `  CONSTRAINT ${quoteIdent(fk.name, dbType)} FOREIGN KEY (${srcCols}) REFERENCES ${targetRef}(${tgtCols}) ON DELETE ${onDelete} ON UPDATE ${onUpdate}`;
            });

            const allDefs = [...columnDefs, ...fkDefs].join(",\n");

            upSQL += `CREATE TABLE ${tableRef} (\n${allDefs}\n);\n\n`;

            // Indexes
            const indexesToCreate = (table.indexes || []);
            for (const idx of indexesToCreate) {
                const idxCols = idx.columns.map(c => quoteIdent(c, dbType)).join(", ");
                const uniqueStr = idx.unique ? "UNIQUE " : "";
                upSQL += `CREATE ${uniqueStr}INDEX ${quoteIdent(idx.name, dbType)} ON ${tableRef} (${idxCols});\n`;
            }
            if (indexesToCreate.length > 0) upSQL += "\n";
        }
        
        // Views
        if (schema.views) {
            for (const v of schema.views) {
                const viewRef = dbType === "sqlite" ? quoteIdent(v.name, dbType) : `${quoteIdent(schema.name, dbType)}.${quoteIdent(v.name, dbType)}`;
                upSQL += `CREATE VIEW ${viewRef} AS ${v.definition};\n\n`;
            }
        }
    }

    return `-- ${version}_${name}.sql

-- +up
-- Baseline migration generated from current schema snapshot
${upSQL.trim()}

-- +down
-- Rollback not supported for baseline
`;
}


export function writeBaselineMigration(
    migrationsDir: string,
    version: string,
    name: string,
    snapshot: SchemaFile
) {
    if (!fs.existsSync(migrationsDir)) {
        fs.mkdirSync(migrationsDir, { recursive: true });
    }

    const filename = `${version}_${name}.sql`;
    const filepath = path.join(migrationsDir, filename);

    const sql = generateBaselineSQL(snapshot, version, name);
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


