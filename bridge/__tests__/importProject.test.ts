import { afterEach, beforeEach, describe, expect, jest, test } from "@jest/globals";
import { ProjectStore } from "../src/services/projectStore";
import fs from "fs/promises";
import fsSync from "fs";
import path from "path";
import os from "os";

// ─── Test Setup ──────────────────────────────────────

const TEST_ROOT = path.join(os.tmpdir(), "import-test-" + Date.now());
const PROJECTS_DIR = path.join(TEST_ROOT, "projects");
const INDEX_FILE = path.join(PROJECTS_DIR, "index.json");
const SOURCE_DIR = path.join(TEST_ROOT, "cloned-repo");

/**
 * Mock config module to redirect to our temp folders
 */
jest.mock("../src/utils/config", () => {
    const original = jest.requireActual("../src/utils/config") as any;
    const _path = require("path");
    const _os = require("os");
    const testRoot = _path.join(_os.tmpdir(), "import-test-" + Date.now(), "projects");
    return {
        ...original,
        PROJECTS_FOLDER: testRoot,
        PROJECTS_INDEX_FILE: _path.join(testRoot, "index.json"),
        getProjectDir: (id: string) => _path.join(testRoot, id),
    };
});

/**
 * Mock dbStoreInstance
 */
jest.mock("../src/services/dbStore", () => {
    const addDBMock = jest.fn<(payload: any) => Promise<any>>().mockImplementation((payload) =>
        Promise.resolve({
            id: "auto-created-db-id",
            name: payload.name,
            type: payload.type || "postgresql",
            host: payload.host,
            port: payload.port,
            user: payload.user,
            database: payload.database,
            createdAt: new Date().toISOString(),
            updatedAt: new Date().toISOString(),
        })
    );
    return {
        dbStoreInstance: {
            getDB: jest.fn<() => Promise<any>>().mockResolvedValue({
                id: "test-db-id",
                name: "TestDB",
                type: "postgresql",
                host: "localhost",
                port: 5432,
            }),
            addDB: addDBMock,
        },
        DBMeta: {},
    };
});

import { dbStoreInstance } from "../src/services/dbStore";
const mockAddDB = dbStoreInstance.addDB as jest.Mock;

import { PROJECTS_FOLDER, PROJECTS_INDEX_FILE, getProjectDir } from "../src/utils/config";

// ─── Helpers ──────────────────────────────────────

async function createSourceProject(opts: {
    name?: string;
    description?: string;
    engine?: string;
    envContent?: string;
    schemaData?: any;
    erData?: any;
    queriesData?: any;
    skipRelwaveJson?: boolean;
}) {
    await fs.mkdir(SOURCE_DIR, { recursive: true });
    await fs.mkdir(path.join(SOURCE_DIR, "schema"), { recursive: true });
    await fs.mkdir(path.join(SOURCE_DIR, "diagrams"), { recursive: true });
    await fs.mkdir(path.join(SOURCE_DIR, "queries"), { recursive: true });

    // Write relwave.json
    if (!opts.skipRelwaveJson) {
        const meta = {
            version: 1,
            id: "original-project-id",
            databaseId: "original-db-id",
            name: opts.name || "Cloned Project",
            description: opts.description,
            engine: opts.engine,
            defaultSchema: "public",
            createdAt: "2024-01-01T00:00:00.000Z",
            updatedAt: "2024-01-01T00:00:00.000Z",
        };
        await fs.writeFile(
            path.join(SOURCE_DIR, "relwave.json"),
            JSON.stringify(meta, null, 2)
        );
    }

    // Write .env if content provided
    if (opts.envContent !== undefined) {
        await fs.writeFile(path.join(SOURCE_DIR, ".env"), opts.envContent);
    }

    // Write sub-resource files
    if (opts.schemaData) {
        await fs.writeFile(
            path.join(SOURCE_DIR, "schema", "schema.json"),
            JSON.stringify(opts.schemaData, null, 2)
        );
    }
    if (opts.erData) {
        await fs.writeFile(
            path.join(SOURCE_DIR, "diagrams", "er.json"),
            JSON.stringify(opts.erData, null, 2)
        );
    }
    if (opts.queriesData) {
        await fs.writeFile(
            path.join(SOURCE_DIR, "queries", "queries.json"),
            JSON.stringify(opts.queriesData, null, 2)
        );
    }
}

// ─── Tests ──────────────────────────────────────

describe("ProjectStore — Import Project", () => {
    let store: ProjectStore;

    beforeEach(async () => {
        // Clean up
        for (const dir of [PROJECTS_FOLDER, SOURCE_DIR]) {
            if (fsSync.existsSync(dir)) {
                await fs.rm(dir, { recursive: true, force: true });
            }
        }
        await fs.mkdir(PROJECTS_FOLDER, { recursive: true });

        store = new ProjectStore(PROJECTS_FOLDER, PROJECTS_INDEX_FILE);
        mockAddDB.mockClear();
    });

    afterEach(async () => {
        for (const dir of [PROJECTS_FOLDER, SOURCE_DIR, TEST_ROOT]) {
            if (fsSync.existsSync(dir)) {
                await fs.rm(dir, { recursive: true, force: true });
            }
        }
    });

    // ==========================================
    // .env Parsing (static methods)
    // ==========================================

    describe("parseEnvFile", () => {
        test("should parse simple KEY=VALUE pairs", () => {
            const result = ProjectStore.parseEnvFile(
                "DB_HOST=localhost\nDB_PORT=5432\nDB_USER=admin"
            );
            expect(result).toEqual({
                DB_HOST: "localhost",
                DB_PORT: "5432",
                DB_USER: "admin",
            });
        });

        test("should handle double-quoted values", () => {
            const result = ProjectStore.parseEnvFile('DB_PASSWORD="my secret"');
            expect(result).toEqual({ DB_PASSWORD: "my secret" });
        });

        test("should handle single-quoted values", () => {
            const result = ProjectStore.parseEnvFile("DB_PASSWORD='pass word'");
            expect(result).toEqual({ DB_PASSWORD: "pass word" });
        });

        test("should skip blank lines and comments", () => {
            const result = ProjectStore.parseEnvFile(
                "# This is a comment\n\nDB_HOST=localhost\n   \n# Another comment\nDB_PORT=3306"
            );
            expect(result).toEqual({
                DB_HOST: "localhost",
                DB_PORT: "3306",
            });
        });

        test("should handle values with equals signs", () => {
            const result = ProjectStore.parseEnvFile("DB_PASSWORD=p@ss=word");
            expect(result).toEqual({ DB_PASSWORD: "p@ss=word" });
        });

        test("should handle empty values", () => {
            const result = ProjectStore.parseEnvFile("DB_PASSWORD=");
            expect(result).toEqual({ DB_PASSWORD: "" });
        });

        test("should handle Windows-style line endings", () => {
            const result = ProjectStore.parseEnvFile(
                "DB_HOST=localhost\r\nDB_PORT=5432\r\n"
            );
            expect(result).toEqual({
                DB_HOST: "localhost",
                DB_PORT: "5432",
            });
        });

        test("should trim whitespace from keys and values", () => {
            const result = ProjectStore.parseEnvFile(
                "  DB_HOST  =  localhost  \n  DB_PORT = 5432  "
            );
            expect(result).toEqual({
                DB_HOST: "localhost",
                DB_PORT: "5432",
            });
        });

        test("should return empty object for empty content", () => {
            expect(ProjectStore.parseEnvFile("")).toEqual({});
        });

        test("should return empty object for comment-only content", () => {
            expect(ProjectStore.parseEnvFile("# just a comment\n# another one")).toEqual({});
        });
    });

    describe("extractDbParamsFromEnv", () => {
        test("should extract standard DB_ prefixed variables", () => {
            const result = ProjectStore.extractDbParamsFromEnv({
                DB_HOST: "db.example.com",
                DB_PORT: "3306",
                DB_USER: "root",
                DB_PASSWORD: "secret",
                DB_NAME: "myapp",
                DB_TYPE: "mysql",
            });
            expect(result).toEqual({
                host: "db.example.com",
                port: 3306,
                user: "root",
                password: "secret",
                database: "myapp",
                type: "mysql",
                ssl: undefined,
                name: undefined,
            });
        });

        test("should handle PostgreSQL-style PG* variables", () => {
            const result = ProjectStore.extractDbParamsFromEnv({
                PGHOST: "pg.example.com",
                PGPORT: "5433",
                PGUSER: "pgadmin",
                PGPASSWORD: "pgpass",
                PGDATABASE: "pgdb",
            });
            expect(result).toEqual({
                host: "pg.example.com",
                port: 5433,
                user: "pgadmin",
                password: "pgpass",
                database: "pgdb",
                type: undefined,
                ssl: undefined,
                name: undefined,
            });
        });

        test("should handle DATABASE_ prefixed variables", () => {
            const result = ProjectStore.extractDbParamsFromEnv({
                DATABASE_HOST: "db.prod.com",
                DATABASE_PORT: "5432",
                DATABASE_USER: "appuser",
                DATABASE_PASSWORD: "prodpass",
                DATABASE_NAME: "proddb",
                DATABASE_TYPE: "PostgreSQL",
            });
            expect(result).toEqual({
                host: "db.prod.com",
                port: 5432,
                user: "appuser",
                password: "prodpass",
                database: "proddb",
                type: "postgresql",
                ssl: undefined,
                name: undefined,
            });
        });

        test("should handle MYSQL_ prefixed variables", () => {
            const result = ProjectStore.extractDbParamsFromEnv({
                MYSQL_HOST: "mysql.local",
                MYSQL_PORT: "3307",
                MYSQL_USER: "myuser",
                MYSQL_PASSWORD: "mypass",
                MYSQL_DATABASE: "mydb",
            });
            expect(result).toEqual({
                host: "mysql.local",
                port: 3307,
                user: "myuser",
                password: "mypass",
                database: "mydb",
                type: undefined,
                ssl: undefined,
                name: undefined,
            });
        });

        test("should handle SSL flag", () => {
            const result = ProjectStore.extractDbParamsFromEnv({
                DB_HOST: "secure.db.com",
                DB_SSL: "true",
            });
            expect(result?.ssl).toBe(true);
        });

        test("should handle SSL=false", () => {
            const result = ProjectStore.extractDbParamsFromEnv({
                DB_HOST: "local.db.com",
                DB_SSL: "false",
            });
            expect(result?.ssl).toBe(false);
        });

        test("should return null when no host or database is provided", () => {
            const result = ProjectStore.extractDbParamsFromEnv({
                DB_USER: "user",
                DB_PASSWORD: "pass",
            });
            expect(result).toBeNull();
        });

        test("should handle non-numeric port gracefully", () => {
            const result = ProjectStore.extractDbParamsFromEnv({
                DB_HOST: "localhost",
                DB_PORT: "not-a-number",
            });
            expect(result?.port).toBeUndefined();
        });

        test("should prefer DB_ prefix over fallbacks", () => {
            const result = ProjectStore.extractDbParamsFromEnv({
                DB_HOST: "primary.host",
                PGHOST: "fallback.host",
                DB_USER: "primary_user",
                DATABASE_USER: "fallback_user",
            });
            expect(result?.host).toBe("primary.host");
            expect(result?.user).toBe("primary_user");
        });

        test("should extract connection name", () => {
            const result = ProjectStore.extractDbParamsFromEnv({
                DB_HOST: "localhost",
                DB_CONNECTION_NAME: "My Custom DB",
            });
            expect(result?.name).toBe("My Custom DB");
        });
    });

    // ==========================================
    // scanImportSource (read-only preview)
    // ==========================================

    describe("scanImportSource", () => {
        test("should scan a valid project directory", async () => {
            await createSourceProject({
                name: "Scan Test",
                description: "A project to scan",
                engine: "postgresql",
            });

            const result = await store.scanImportSource(SOURCE_DIR);

            expect(result.metadata.name).toBe("Scan Test");
            expect(result.metadata.description).toBe("A project to scan");
            expect(result.metadata.engine).toBe("postgresql");
            expect(result.metadata.defaultSchema).toBe("public");
            expect(result.envFound).toBe(false);
            expect(result.parsedEnv).toBeNull();
        });

        test("should detect and parse .env file", async () => {
            await createSourceProject({
                name: "Env Scan",
                envContent: [
                    "DB_HOST=db.example.com",
                    "DB_PORT=5432",
                    "DB_USER=admin",
                    "DB_PASSWORD=secret",
                    "DB_NAME=mydb",
                    "DB_TYPE=postgresql",
                ].join("\n"),
            });

            const result = await store.scanImportSource(SOURCE_DIR);

            expect(result.envFound).toBe(true);
            expect(result.parsedEnv).toBeDefined();
            expect(result.parsedEnv?.host).toBe("db.example.com");
            expect(result.parsedEnv?.port).toBe(5432);
            expect(result.parsedEnv?.user).toBe("admin");
            expect(result.parsedEnv?.password).toBe("secret");
            expect(result.parsedEnv?.database).toBe("mydb");
            expect(result.parsedEnv?.type).toBe("postgresql");
        });

        test("should return envFound=true but parsedEnv=null for incomplete .env", async () => {
            await createSourceProject({
                name: "Partial Env",
                envContent: "DB_USER=admin\nDB_PASSWORD=pass\n# no host or db",
            });

            const result = await store.scanImportSource(SOURCE_DIR);

            expect(result.envFound).toBe(true);
            expect(result.parsedEnv).toBeNull();
        });

        test("should throw when relwave.json is missing", async () => {
            await fs.mkdir(SOURCE_DIR, { recursive: true });

            await expect(store.scanImportSource(SOURCE_DIR)).rejects.toThrow(
                "Not a valid RelWave project"
            );
        });

        test("should throw when relwave.json has no name", async () => {
            await fs.mkdir(SOURCE_DIR, { recursive: true });
            await fs.writeFile(
                path.join(SOURCE_DIR, "relwave.json"),
                JSON.stringify({ version: 1, id: "x" })
            );

            await expect(store.scanImportSource(SOURCE_DIR)).rejects.toThrow(
                "Invalid relwave.json"
            );
        });

        test("should NOT create any files or modify the store", async () => {
            await createSourceProject({ name: "No Side Effects" });

            await store.scanImportSource(SOURCE_DIR);

            // Should have no projects in the index
            const listed = await store.listProjects();
            expect(listed).toHaveLength(0);
        });
    });

    // ==========================================
    // importProject
    // ==========================================

    describe("importProject", () => {
        test("should throw when relwave.json is missing", async () => {
            await fs.mkdir(SOURCE_DIR, { recursive: true });

            await expect(
                store.importProject({ sourcePath: SOURCE_DIR, databaseId: "db-1" })
            ).rejects.toThrow("Not a valid RelWave project");
        });

        test("should throw when relwave.json has no name", async () => {
            await fs.mkdir(SOURCE_DIR, { recursive: true });
            await fs.writeFile(
                path.join(SOURCE_DIR, "relwave.json"),
                JSON.stringify({ version: 1, id: "x" })
            );

            await expect(
                store.importProject({ sourcePath: SOURCE_DIR, databaseId: "db-1" })
            ).rejects.toThrow("Invalid relwave.json");
        });

        test("should throw when databaseId is missing", async () => {
            await createSourceProject({ name: "No DB ID" });

            await expect(
                store.importProject({ sourcePath: SOURCE_DIR, databaseId: "" })
            ).rejects.toThrow("databaseId is required");
        });

        test("should import project with supplied databaseId", async () => {
            await createSourceProject({
                name: "Imported Project",
                description: "A test import",
            });

            const project = await store.importProject({
                sourcePath: SOURCE_DIR,
                databaseId: "my-db-id",
            });

            expect(project).toBeDefined();
            expect(project.name).toBe("Imported Project");
            expect(project.description).toBe("A test import");
            // Effective databaseId comes from local config
            expect(project.databaseId).toBe("my-db-id");
            expect(project.sourcePath).toBe(SOURCE_DIR);
            // Must keep the original projectId from relwave.json
            expect(project.id).toBe("original-project-id");
        });

        test("should NOT modify tracked files (read-only import)", async () => {
            const schemaData = {
                version: 1,
                projectId: "original-id",
                databaseId: "original-db-id",
                schemas: [{ name: "public", tables: [{ name: "users" }] }],
                cachedAt: "2024-01-01T00:00:00.000Z",
            };
            const erData = {
                version: 1,
                projectId: "original-id",
                nodes: [{ tableId: "users", x: 100, y: 200 }],
                updatedAt: "2024-01-01T00:00:00.000Z",
            };
            const queriesData = {
                version: 1,
                projectId: "original-id",
                queries: [{ id: "q1", name: "All users", sql: "SELECT * FROM users" }],
            };

            await createSourceProject({
                name: "Full Project",
                schemaData,
                erData,
                queriesData,
            });

            // Snapshot the original file contents BEFORE import
            const origRelwave = await fs.readFile(path.join(SOURCE_DIR, "relwave.json"), "utf-8");
            const origSchema = await fs.readFile(path.join(SOURCE_DIR, "schema", "schema.json"), "utf-8");
            const origER = await fs.readFile(path.join(SOURCE_DIR, "diagrams", "er.json"), "utf-8");
            const origQueries = await fs.readFile(path.join(SOURCE_DIR, "queries", "queries.json"), "utf-8");

            await store.importProject({
                sourcePath: SOURCE_DIR,
                databaseId: "copy-db-id",
            });

            // ALL tracked files must be IDENTICAL after import
            const afterRelwave = await fs.readFile(path.join(SOURCE_DIR, "relwave.json"), "utf-8");
            const afterSchema = await fs.readFile(path.join(SOURCE_DIR, "schema", "schema.json"), "utf-8");
            const afterER = await fs.readFile(path.join(SOURCE_DIR, "diagrams", "er.json"), "utf-8");
            const afterQueries = await fs.readFile(path.join(SOURCE_DIR, "queries", "queries.json"), "utf-8");

            expect(afterRelwave).toBe(origRelwave);
            expect(afterSchema).toBe(origSchema);
            expect(afterER).toBe(origER);
            expect(afterQueries).toBe(origQueries);
        });

        test("should store databaseId in local config (git-ignored)", async () => {
            await createSourceProject({ name: "Local Config Test" });

            await store.importProject({
                sourcePath: SOURCE_DIR,
                databaseId: "local-db-id",
            });

            // databaseId should be in relwave.local.json (git-ignored)
            const localConfig = JSON.parse(
                await fs.readFile(path.join(SOURCE_DIR, "relwave.local.json"), "utf-8")
            );
            expect(localConfig.databaseId).toBe("local-db-id");

            // relwave.json should still have the ORIGINAL databaseId (untouched)
            const meta = JSON.parse(
                await fs.readFile(path.join(SOURCE_DIR, "relwave.json"), "utf-8")
            );
            expect(meta.databaseId).toBe("original-db-id");
        });

        test("should handle missing sub-resource files gracefully", async () => {
            await createSourceProject({
                name: "Minimal Project",
                // No schema/ER/queries files
            });

            const project = await store.importProject({
                sourcePath: SOURCE_DIR,
                databaseId: "min-db-id",
            });

            // Should still succeed — import doesn't require sub-resources
            expect(project).toBeDefined();
            expect(project.name).toBe("Minimal Project");
        });

        test("should add imported project to the global index with sourcePath", async () => {
            await createSourceProject({ name: "Indexed Project" });

            const project = await store.importProject({
                sourcePath: SOURCE_DIR,
                databaseId: "idx-db-id",
            });

            const listed = await store.listProjects();
            expect(listed).toHaveLength(1);
            expect(listed[0].id).toBe(project.id);
            expect(listed[0].name).toBe("Indexed Project");
            expect(listed[0].sourcePath).toBe(SOURCE_DIR);
        });

        test("should ensure subdirectories exist in source dir", async () => {
            await createSourceProject({ name: "Dir Check" });

            await store.importProject({
                sourcePath: SOURCE_DIR,
                databaseId: "dir-db-id",
            });

            // Directories should exist in the SOURCE dir (not internal)
            expect(fsSync.existsSync(path.join(SOURCE_DIR, "schema"))).toBe(true);
            expect(fsSync.existsSync(path.join(SOURCE_DIR, "diagrams"))).toBe(true);
            expect(fsSync.existsSync(path.join(SOURCE_DIR, "queries"))).toBe(true);
            expect(fsSync.existsSync(path.join(SOURCE_DIR, ".gitignore"))).toBe(true);
        });

        test("should resolve project dir to sourcePath for imported projects", async () => {
            await createSourceProject({ name: "Resolve Test" });

            const project = await store.importProject({
                sourcePath: SOURCE_DIR,
                databaseId: "res-db-id",
            });

            const resolvedDir = await store.resolveProjectDir(project.id);
            expect(resolvedDir).toBe(SOURCE_DIR);
        });

        test("should keep the original project ID from relwave.json", async () => {
            await createSourceProject({ name: "Keep ID Test" });

            const project = await store.importProject({
                sourcePath: SOURCE_DIR,
                databaseId: "uid-db-id",
            });

            // Must reuse the original projectId — never generate a new one
            expect(project.id).toBe("original-project-id");
        });

        test("should preserve defaultSchema from source metadata", async () => {
            await createSourceProject({ name: "Schema Test" });

            const project = await store.importProject({
                sourcePath: SOURCE_DIR,
                databaseId: "schema-db-id",
            });

            expect(project.defaultSchema).toBe("public");
        });

        test("should reject importing the same project twice", async () => {
            await createSourceProject({ name: "Duplicate Test" });

            // First import succeeds
            await store.importProject({
                sourcePath: SOURCE_DIR,
                databaseId: "dup-db-id",
            });

            // Second import of the same project ID should fail
            await expect(
                store.importProject({ sourcePath: SOURCE_DIR, databaseId: "dup-db-id" })
            ).rejects.toThrow("already imported");
        });

        test("should merge databaseId from local config in getProject", async () => {
            await createSourceProject({ name: "Merge Test" });

            const project = await store.importProject({
                sourcePath: SOURCE_DIR,
                databaseId: "merged-db-id",
            });

            // getProject should return the local databaseId, not the original
            const loaded = await store.getProject(project.id);
            expect(loaded).toBeDefined();
            expect(loaded!.databaseId).toBe("merged-db-id");
            expect(loaded!.name).toBe("Merge Test");
        });
    });

    // ==========================================
    // linkDatabase
    // ==========================================

    describe("linkDatabase", () => {
        test("should link a database to a project", async () => {
            const project = await store.createProject({
                databaseId: "pending",
                name: "Pending Project",
            });

            const updated = await store.linkDatabase(project.id, "real-db-id");

            expect(updated).toBeDefined();
            expect(updated!.databaseId).toBe("real-db-id");
        });

        test("should update engine type from linked database", async () => {
            const project = await store.createProject({
                databaseId: "pending",
                name: "Engine Test",
            });

            const updated = await store.linkDatabase(project.id, "test-db-id");

            // Engine should be resolved from mocked dbStore
            expect(updated!.engine).toBe("postgresql");
        });

        test("should update the global index", async () => {
            const project = await store.createProject({
                databaseId: "pending",
                name: "Index Sync Test",
            });

            await store.linkDatabase(project.id, "linked-db-id");

            const listed = await store.listProjects();
            expect(listed[0].databaseId).toBe("linked-db-id");
        });

        test("should update schema file's databaseId", async () => {
            const project = await store.createProject({
                databaseId: "pending",
                name: "Schema Sync",
            });

            // Save a schema first
            await store.saveSchema(project.id, [
                { name: "public", tables: [] },
            ]);

            await store.linkDatabase(project.id, "new-db-id");

            const schema = await store.getSchema(project.id);
            expect(schema!.databaseId).toBe("new-db-id");
        });

        test("should return null for non-existent project", async () => {
            const result = await store.linkDatabase("no-such-project", "db-id");
            expect(result).toBeNull();
        });

        test("should update the updatedAt timestamp", async () => {
            const project = await store.createProject({
                databaseId: "pending",
                name: "Timestamp Test",
            });

            // Wait a tick to ensure timestamp difference
            await new Promise((r) => setTimeout(r, 10));

            const updated = await store.linkDatabase(project.id, "db-id");

            expect(updated!.updatedAt).not.toBe(project.updatedAt);
        });

        test("should write to local config (not relwave.json) for imported projects", async () => {
            await createSourceProject({ name: "Link Imported" });

            const project = await store.importProject({
                sourcePath: SOURCE_DIR,
                databaseId: "initial-db-id",
            });

            // Snapshot relwave.json BEFORE linkDatabase
            const beforeMeta = await fs.readFile(path.join(SOURCE_DIR, "relwave.json"), "utf-8");

            // Re-link to a different database
            const updated = await store.linkDatabase(project.id, "relinked-db-id");
            expect(updated!.databaseId).toBe("relinked-db-id");

            // relwave.json must NOT have changed
            const afterMeta = await fs.readFile(path.join(SOURCE_DIR, "relwave.json"), "utf-8");
            expect(afterMeta).toBe(beforeMeta);

            // databaseId should be in local config
            const localConfig = JSON.parse(
                await fs.readFile(path.join(SOURCE_DIR, "relwave.local.json"), "utf-8")
            );
            expect(localConfig.databaseId).toBe("relinked-db-id");

            // Index should have the updated databaseId
            const listed = await store.listProjects();
            expect(listed[0].databaseId).toBe("relinked-db-id");
        });
    });

    // ─── updateProject for imported projects ──────────────────────────

    describe("updateProject (imported)", () => {
        test("should NOT modify relwave.json for imported projects", async () => {
            await createSourceProject({ name: "Imported Update", description: "Old desc" });

            const project = await store.importProject({
                sourcePath: SOURCE_DIR,
                databaseId: "db-1",
            });

            // Snapshot relwave.json BEFORE update
            const beforeMeta = await fs.readFile(path.join(SOURCE_DIR, "relwave.json"), "utf-8");

            await store.updateProject(project.id, {
                name: "Renamed Locally",
                description: "New desc",
            });

            // relwave.json must NOT have changed
            const afterMeta = await fs.readFile(path.join(SOURCE_DIR, "relwave.json"), "utf-8");
            expect(afterMeta).toBe(beforeMeta);
        });

        test("should store overrides in local config", async () => {
            await createSourceProject({ name: "Override Test" });

            const project = await store.importProject({
                sourcePath: SOURCE_DIR,
                databaseId: "db-1",
            });

            await store.updateProject(project.id, {
                name: "Local Name",
                description: "Local desc",
                defaultSchema: "custom",
            });

            const localConfig = JSON.parse(
                await fs.readFile(path.join(SOURCE_DIR, "relwave.local.json"), "utf-8")
            );
            expect(localConfig.overrides).toBeDefined();
            expect(localConfig.overrides.name).toBe("Local Name");
            expect(localConfig.overrides.description).toBe("Local desc");
            expect(localConfig.overrides.defaultSchema).toBe("custom");
        });

        test("should merge overrides into getProject result", async () => {
            await createSourceProject({ name: "Merge Test", description: "Original" });

            const project = await store.importProject({
                sourcePath: SOURCE_DIR,
                databaseId: "db-1",
            });

            await store.updateProject(project.id, { name: "Overridden" });

            const fetched = await store.getProject(project.id);
            expect(fetched!.name).toBe("Overridden");
            // Description stays from relwave.json (not overridden)
            expect(fetched!.description).toBe("Original");
        });

        test("should sync index after imported project update", async () => {
            await createSourceProject({ name: "Index Sync" });

            const project = await store.importProject({
                sourcePath: SOURCE_DIR,
                databaseId: "db-1",
            });

            await store.updateProject(project.id, { name: "Updated Name" });

            const listed = await store.listProjects();
            const entry = listed.find((p) => p.id === project.id);
            expect(entry!.name).toBe("Updated Name");
        });

        test("should preserve existing local config fields when adding overrides", async () => {
            await createSourceProject({ name: "Preserve Fields" });

            const project = await store.importProject({
                sourcePath: SOURCE_DIR,
                databaseId: "db-1",
            });

            // Local config already has databaseId from import
            await store.updateProject(project.id, { name: "New Name" });

            const localConfig = JSON.parse(
                await fs.readFile(path.join(SOURCE_DIR, "relwave.local.json"), "utf-8")
            );
            // databaseId should still be there
            expect(localConfig.databaseId).toBe("db-1");
            // And overrides should be added
            expect(localConfig.overrides.name).toBe("New Name");
        });

        test("should still modify relwave.json for regular (non-imported) projects", async () => {
            const project = await store.createProject({
                databaseId: "db-1",
                name: "Regular Project",
            });

            const updated = await store.updateProject(project.id, {
                name: "Renamed Regular",
            });

            expect(updated!.name).toBe("Renamed Regular");

            // For regular projects, relwave.json should be updated directly
            const fetched = await store.getProject(project.id);
            expect(fetched!.name).toBe("Renamed Regular");
        });
    });
});
