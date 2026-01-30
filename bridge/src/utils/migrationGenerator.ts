import fs from "fs";
import path from "path";

export interface MigrationFile {
    version: string;
    name: string;
    filename: string;
    upSQL: string;
    downSQL: string;
}

/**
 * Generate a migration version timestamp
 * Format: YYYYMMDDHHmmss
 */
export function generateMigrationVersion(): string {
    const now = new Date();
    const year = now.getFullYear();
    const month = String(now.getMonth() + 1).padStart(2, "0");
    const day = String(now.getDate()).padStart(2, "0");
    const hours = String(now.getHours()).padStart(2, "0");
    const minutes = String(now.getMinutes()).padStart(2, "0");
    const seconds = String(now.getSeconds()).padStart(2, "0");

    return `${year}${month}${day}${hours}${minutes}${seconds}`;
}

/**
 * Generate CREATE TABLE migration
 */
export function generateCreateTableMigration(params: {
    schemaName: string;
    tableName: string;
    columns: any[];
    foreignKeys?: any[];
    dbType: "mysql" | "postgres" | "mariadb";
}): MigrationFile {
    const { schemaName, tableName, columns, foreignKeys = [], dbType } = params;
    const version = generateMigrationVersion();
    const name = `create_${tableName}_table`;
    const filename = `${version}_${name}.sql`;

    // Build column definitions
    const columnDefs = columns.map((col) => {
        let def = `  ${quoteIdent(col.name, dbType)} ${col.type}`;
        if (col.not_nullable) def += " NOT NULL";
        if (col.default_value) def += ` DEFAULT ${col.default_value}`;
        if (col.is_primary_key) def += " PRIMARY KEY";
        return def;
    }).join(",\n");

    // Build foreign key constraints
    const fkDefs = foreignKeys.map((fk) => {
        const onDelete = fk.on_delete || "NO ACTION";
        const onUpdate = fk.on_update || "NO ACTION";
        return `  CONSTRAINT ${quoteIdent(fk.constraint_name, dbType)} FOREIGN KEY (${quoteIdent(fk.source_column, dbType)}) REFERENCES ${quoteIdent(fk.target_schema, dbType)}.${quoteIdent(fk.target_table, dbType)}(${quoteIdent(fk.target_column, dbType)}) ON DELETE ${onDelete} ON UPDATE ${onUpdate}`;
    });

    const allDefs = [...[columnDefs], ...fkDefs].filter(Boolean).join(",\n");

    // For MySQL/MariaDB, use database.table format (schemas are databases)
    // For Postgres, use schema.table format
    const tableRef = `${quoteIdent(schemaName, dbType)}.${quoteIdent(tableName, dbType)}`;

    // Generate UP SQL
    const upSQL = `CREATE TABLE ${tableRef} (
${allDefs}
);`;

    // Generate DOWN SQL
    const downSQL = `DROP TABLE ${tableRef};`;

    return {
        version,
        name,
        filename,
        upSQL,
        downSQL,
    };
}

/**
 * Generate ALTER TABLE migration
 */
export function generateAlterTableMigration(params: {
    schemaName: string;
    tableName: string;
    operations: any[];
    dbType: "mysql" | "postgres" | "mariadb";
}): MigrationFile {
    const { schemaName, tableName, operations, dbType } = params;
    const version = generateMigrationVersion();
    const name = `alter_${tableName}_table`;
    const filename = `${version}_${name}.sql`;

    // For all database types, use schema/database prefix
    const fullTableName = `${quoteIdent(schemaName, dbType)}.${quoteIdent(tableName, dbType)}`;

    // Build UP SQL
    const upStatements: string[] = [];
    const downStatements: string[] = [];

    for (const op of operations) {
        switch (op.type) {
            case "ADD_COLUMN":
                upStatements.push(
                    `ALTER TABLE ${fullTableName} ADD COLUMN ${quoteIdent(op.column.name, dbType)} ${op.column.type}${op.column.not_nullable ? " NOT NULL" : ""}${op.column.default_value ? ` DEFAULT ${op.column.default_value}` : ""};`
                );
                downStatements.push(
                    `ALTER TABLE ${fullTableName} DROP COLUMN ${quoteIdent(op.column.name, dbType)};`
                );
                break;

            case "DROP_COLUMN":
                // Note: Can't fully reverse without knowing column definition
                upStatements.push(
                    `ALTER TABLE ${fullTableName} DROP COLUMN ${quoteIdent(op.column_name, dbType)};`
                );
                downStatements.push(
                    `-- WARNING: Cannot automatically reverse DROP COLUMN. Manual intervention required.`
                );
                break;

            case "RENAME_COLUMN":
                if (dbType === "postgres") {
                    upStatements.push(
                        `ALTER TABLE ${fullTableName} RENAME COLUMN ${quoteIdent(op.from, dbType)} TO ${quoteIdent(op.to, dbType)};`
                    );
                    downStatements.push(
                        `ALTER TABLE ${fullTableName} RENAME COLUMN ${quoteIdent(op.to, dbType)} TO ${quoteIdent(op.from, dbType)};`
                    );
                } else {
                    upStatements.push(
                        `ALTER TABLE ${fullTableName} RENAME COLUMN ${quoteIdent(op.from, dbType)} TO ${quoteIdent(op.to, dbType)};`
                    );
                    downStatements.push(
                        `ALTER TABLE ${fullTableName} RENAME COLUMN ${quoteIdent(op.to, dbType)} TO ${quoteIdent(op.from, dbType)};`
                    );
                }
                break;

            case "ALTER_TYPE":
                upStatements.push(
                    `ALTER TABLE ${fullTableName} ${dbType === "postgres" ? "ALTER COLUMN" : "MODIFY"} ${quoteIdent(op.column_name, dbType)} ${dbType === "postgres" ? "TYPE " : ""}${op.new_type};`
                );
                downStatements.push(
                    `-- WARNING: Cannot automatically reverse ALTER TYPE. Manual intervention required.`
                );
                break;

            case "SET_NOT_NULL":
                if (dbType === "postgres") {
                    upStatements.push(
                        `ALTER TABLE ${fullTableName} ALTER COLUMN ${quoteIdent(op.column_name, dbType)} SET NOT NULL;`
                    );
                    downStatements.push(
                        `ALTER TABLE ${fullTableName} ALTER COLUMN ${quoteIdent(op.column_name, dbType)} DROP NOT NULL;`
                    );
                } else {
                    upStatements.push(
                        `ALTER TABLE ${fullTableName} MODIFY ${quoteIdent(op.column_name, dbType)} ${op.new_type} NOT NULL;`
                    );
                    downStatements.push(
                        `ALTER TABLE ${fullTableName} MODIFY ${quoteIdent(op.column_name, dbType)} ${op.new_type};`
                    );
                }
                break;

            case "DROP_NOT_NULL":
                if (dbType === "postgres") {
                    upStatements.push(
                        `ALTER TABLE ${fullTableName} ALTER COLUMN ${quoteIdent(op.column_name, dbType)} DROP NOT NULL;`
                    );
                    downStatements.push(
                        `ALTER TABLE ${fullTableName} ALTER COLUMN ${quoteIdent(op.column_name, dbType)} SET NOT NULL;`
                    );
                } else {
                    upStatements.push(
                        `ALTER TABLE ${fullTableName} MODIFY ${quoteIdent(op.column_name, dbType)} ${op.new_type};`
                    );
                    downStatements.push(
                        `ALTER TABLE ${fullTableName} MODIFY ${quoteIdent(op.column_name, dbType)} ${op.new_type} NOT NULL;`
                    );
                }
                break;

            case "SET_DEFAULT":
                if (dbType === "postgres") {
                    upStatements.push(
                        `ALTER TABLE ${fullTableName} ALTER COLUMN ${quoteIdent(op.column_name, dbType)} SET DEFAULT ${op.default_value};`
                    );
                    downStatements.push(
                        `ALTER TABLE ${fullTableName} ALTER COLUMN ${quoteIdent(op.column_name, dbType)} DROP DEFAULT;`
                    );
                } else {
                    upStatements.push(
                        `ALTER TABLE ${fullTableName} ALTER COLUMN ${quoteIdent(op.column_name, dbType)} SET DEFAULT ${op.default_value};`
                    );
                    downStatements.push(
                        `ALTER TABLE ${fullTableName} ALTER COLUMN ${quoteIdent(op.column_name, dbType)} DROP DEFAULT;`
                    );
                }
                break;

            case "DROP_DEFAULT":
                if (dbType === "postgres") {
                    upStatements.push(
                        `ALTER TABLE ${fullTableName} ALTER COLUMN ${quoteIdent(op.column_name, dbType)} DROP DEFAULT;`
                    );
                    downStatements.push(
                        `-- WARNING: Cannot automatically reverse DROP DEFAULT. Manual intervention required.`
                    );
                } else {
                    upStatements.push(
                        `ALTER TABLE ${fullTableName} ALTER COLUMN ${quoteIdent(op.column_name, dbType)} DROP DEFAULT;`
                    );
                    downStatements.push(
                        `-- WARNING: Cannot automatically reverse DROP DEFAULT. Manual intervention required.`
                    );
                }
                break;
        }
    }

    const upSQL = upStatements.join("\n");
    const downSQL = downStatements.reverse().join("\n");

    return {
        version,
        name,
        filename,
        upSQL,
        downSQL,
    };
}

/**
 * Generate DROP TABLE migration
 */
export function generateDropTableMigration(params: {
    schemaName: string;
    tableName: string;
    mode: "RESTRICT" | "DETACH_FKS" | "CASCADE";
    dbType: "mysql" | "postgres" | "mariadb";
}): MigrationFile {
    const { schemaName, tableName, mode, dbType } = params;
    const version = generateMigrationVersion();
    const name = `drop_${tableName}_table`;
    const filename = `${version}_${name}.sql`;

    // For all database types, use schema/database prefix
    const fullTableName = `${quoteIdent(schemaName, dbType)}.${quoteIdent(tableName, dbType)}`;

    let upSQL = "";
    if (mode === "CASCADE") {
        upSQL = `DROP TABLE ${fullTableName} CASCADE;`;
    } else if (mode === "DETACH_FKS") {
        upSQL = `-- First drop foreign key constraints, then drop table
-- WARNING: FK constraint names need to be specified manually
DROP TABLE ${fullTableName};`;
    } else {
        upSQL = `DROP TABLE ${fullTableName};`;
    }

    const downSQL = `-- WARNING: Cannot automatically reverse DROP TABLE.
-- You must manually recreate the table with all its data, constraints, and indexes.`;

    return {
        version,
        name,
        filename,
        upSQL,
        downSQL,
    };
}

/**
 * Write migration file to disk
 */
export function writeMigrationFile(
    migrationsDir: string,
    migration: MigrationFile
): string {
    if (!fs.existsSync(migrationsDir)) {
        fs.mkdirSync(migrationsDir, { recursive: true });
    }

    const filepath = path.join(migrationsDir, migration.filename);

    const content = `-- ${migration.filename}

-- +up
${migration.upSQL}

-- +down
${migration.downSQL}
`;

    fs.writeFileSync(filepath, content, "utf8");

    return filepath;
}

/**
 * Helper: Quote identifier based on database type
 */
function quoteIdent(name: string, dbType: "mysql" | "postgres" | "mariadb"): string {
    if (dbType === "mysql" || dbType === "mariadb") {
        return `\`${name.replace(/`/g, "``")}\``;
    } else {
        return `"${name.replace(/"/g, '""')}"`;
    }
}

/**
 * Helper: Typo fix for quoteIdent
 */
function quoteQuote(name: string, dbType: "mysql" | "postgres" | "mariadb"): string {
    return quoteIdent(name, dbType);
}
