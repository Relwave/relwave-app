import { afterEach, beforeEach, describe, expect, jest, test } from "@jest/globals";
import { ProjectStore, ProjectMetadata, SchemaSnapshot } from "../src/services/projectStore";
import fs from "fs/promises";
import fsSync from "fs";
import path from "path";
import os from "os";

// ─── Test Setup ──────────────────────────────────────

const TEST_ROOT = path.join(os.tmpdir(), "projectstore-test-" + Date.now());
const PROJECTS_DIR = path.join(TEST_ROOT, "projects");
const INDEX_FILE = path.join(PROJECTS_DIR, "index.json");

/**
 * ProjectStore uses `getProjectDir()` from config.ts, which is hardcoded.
 * We mock the config module to redirect to our temp folder.
 */
jest.mock("../src/utils/config", () => {
    const original = jest.requireActual("../src/utils/config") as any;
    const _path = require("path");
    const _os = require("os");
    const testProjects = _path.join(_os.tmpdir(), "projectstore-test-" + Date.now(), "projects");
    return {
        ...original,
        PROJECTS_FOLDER: testProjects,
        PROJECTS_INDEX_FILE: _path.join(testProjects, "index.json"),
        getProjectDir: (id: string) => _path.join(testProjects, id),
    };
});

/**
 * Mock dbStoreInstance.getDB to avoid needing a real database store
 */
jest.mock("../src/services/dbStore", () => ({
    dbStoreInstance: {
        getDB: jest.fn<() => Promise<any>>().mockResolvedValue({
            id: "test-db-id",
            name: "TestDB",
            type: "POSTGRES",
            host: "localhost",
            port: 5432,
        }),
    },
    DBMeta: {},
}));

// After mocking, get the actual folder being used
import { PROJECTS_FOLDER, PROJECTS_INDEX_FILE, getProjectDir } from "../src/utils/config";

describe("ProjectStore", () => {
    let store: ProjectStore;

    beforeEach(async () => {
        // Clean & create test directory
        if (fsSync.existsSync(PROJECTS_FOLDER)) {
            await fs.rm(PROJECTS_FOLDER, { recursive: true, force: true });
        }
        await fs.mkdir(PROJECTS_FOLDER, { recursive: true });

        store = new ProjectStore(PROJECTS_FOLDER, PROJECTS_INDEX_FILE);
    });

    afterEach(async () => {
        if (fsSync.existsSync(PROJECTS_FOLDER)) {
            await fs.rm(PROJECTS_FOLDER, { recursive: true, force: true });
        }
    });

    // ==========================================
    // Project CRUD
    // ==========================================

    describe("CRUD Operations", () => {
        test("should create a new project", async () => {
            const project = await store.createProject({
                databaseId: "db-1",
                name: "My Project",
                description: "A test project",
            });

            expect(project).toBeDefined();
            expect(project.id).toBeDefined();
            expect(project.name).toBe("My Project");
            expect(project.description).toBe("A test project");
            expect(project.databaseId).toBe("db-1");
            expect(project.engine).toBe("POSTGRES"); // from mocked dbStore
            expect(project.version).toBe(1);
            expect(project.createdAt).toBeDefined();
            expect(project.updatedAt).toBeDefined();
        });

        test("should create project directories", async () => {
            const project = await store.createProject({
                databaseId: "db-1",
                name: "DirTest",
            });

            const dir = getProjectDir(project.id);
            expect(fsSync.existsSync(dir)).toBe(true);
            expect(fsSync.existsSync(path.join(dir, "schema"))).toBe(true);
            expect(fsSync.existsSync(path.join(dir, "diagrams"))).toBe(true);
            expect(fsSync.existsSync(path.join(dir, "queries"))).toBe(true);
        });

        test("should create initial sub-files", async () => {
            const project = await store.createProject({
                databaseId: "db-1",
                name: "SubFileTest",
            });

            const dir = getProjectDir(project.id);
            expect(fsSync.existsSync(path.join(dir, "relwave.json"))).toBe(true);
            expect(fsSync.existsSync(path.join(dir, "relwave.local.json"))).toBe(true);
            expect(fsSync.existsSync(path.join(dir, "schema", "schema.json"))).toBe(true);
            expect(fsSync.existsSync(path.join(dir, "diagrams", "er.json"))).toBe(true);
            expect(fsSync.existsSync(path.join(dir, "queries", "queries.json"))).toBe(true);
            expect(fsSync.existsSync(path.join(dir, ".gitignore"))).toBe(true);
        });

        test("should get project by ID", async () => {
            const created = await store.createProject({
                databaseId: "db-1",
                name: "GetTest",
            });

            const found = await store.getProject(created.id);
            expect(found).toBeDefined();
            expect(found!.id).toBe(created.id);
            expect(found!.name).toBe("GetTest");
        });

        test("should return null for non-existent project", async () => {
            const found = await store.getProject("non-existent-id");
            expect(found).toBeNull();
        });

        test("should get project by databaseId", async () => {
            await store.createProject({
                databaseId: "db-unique",
                name: "Linked Project",
            });

            const found = await store.getProjectByDatabaseId("db-unique");
            expect(found).toBeDefined();
            expect(found!.name).toBe("Linked Project");
        });

        test("should return null for unlinked databaseId", async () => {
            const found = await store.getProjectByDatabaseId("no-such-db");
            expect(found).toBeNull();
        });

        test("should list all projects", async () => {
            await store.createProject({ databaseId: "db-1", name: "P1" });
            await store.createProject({ databaseId: "db-2", name: "P2" });
            await store.createProject({ databaseId: "db-3", name: "P3" });

            const projects = await store.listProjects();
            expect(projects).toHaveLength(3);
            expect(projects.map((p) => p.name).sort()).toEqual(["P1", "P2", "P3"]);
        });

        test("should update project metadata", async () => {
            const project = await store.createProject({
                databaseId: "db-1",
                name: "Original",
                description: "Old desc",
            });

            const updated = await store.updateProject(project.id, {
                name: "Renamed",
                description: "New desc",
            });

            expect(updated).toBeDefined();
            expect(updated!.name).toBe("Renamed");
            expect(updated!.description).toBe("New desc");
            expect(updated!.updatedAt).not.toBe(project.updatedAt);
        });

        test("should only update whitelisted fields", async () => {
            const project = await store.createProject({
                databaseId: "db-1",
                name: "WhitelistTest",
            });

            const updated = await store.updateProject(project.id, {
                name: "NewName",
                // These should be ignored / not writable:
                ...({ id: "injected-id", databaseId: "injected-db" } as any),
            });

            expect(updated!.name).toBe("NewName");
            expect(updated!.id).toBe(project.id); // unchanged
            expect(updated!.databaseId).toBe(project.databaseId); // unchanged
        });

        test("should return null when updating non-existent project", async () => {
            const result = await store.updateProject("no-such-id", { name: "x" });
            expect(result).toBeNull();
        });

        test("should sync index after update", async () => {
            const project = await store.createProject({
                databaseId: "db-1",
                name: "SyncTest",
            });

            await store.updateProject(project.id, { name: "Updated" });

            const projects = await store.listProjects();
            expect(projects.find((p) => p.id === project.id)?.name).toBe("Updated");
        });

        test("should delete a project", async () => {
            const project = await store.createProject({
                databaseId: "db-1",
                name: "DeleteTest",
            });

            const dir = getProjectDir(project.id);
            expect(fsSync.existsSync(dir)).toBe(true);

            await store.deleteProject(project.id);

            expect(fsSync.existsSync(dir)).toBe(false);
            const projects = await store.listProjects();
            expect(projects.find((p) => p.id === project.id)).toBeUndefined();
        });

        test("should handle deleting non-existent project gracefully", async () => {
            // Should not throw
            await expect(store.deleteProject("no-such-id")).resolves.not.toThrow();
        });
    });

    // ==========================================
    // Schema Operations
    // ==========================================

    describe("Schema Operations", () => {
        let projectId: string;

        beforeEach(async () => {
            const project = await store.createProject({
                databaseId: "db-1",
                name: "SchemaTest",
            });
            projectId = project.id;
        });

        const mockSchemas: SchemaSnapshot[] = [
            {
                name: "public",
                tables: [
                    {
                        name: "users",
                        type: "BASE TABLE",
                        columns: [
                            { name: "id", type: "integer", nullable: false, isPrimaryKey: true, isForeignKey: false, defaultValue: null, isUnique: true },
                            { name: "email", type: "varchar(255)", nullable: false, isPrimaryKey: false, isForeignKey: false, defaultValue: null, isUnique: true },
                        ],
                    },
                ],
            },
        ];

        test("should get initial empty schema", async () => {
            const schema = await store.getSchema(projectId);
            expect(schema).toBeDefined();
            expect(schema!.schemas).toEqual([]);
        });

        test("should save and retrieve schema", async () => {
            await store.saveSchema(projectId, mockSchemas);
            const saved = await store.getSchema(projectId);

            expect(saved).toBeDefined();
            expect(saved!.schemas).toHaveLength(1);
            expect(saved!.schemas[0].name).toBe("public");
            expect(saved!.schemas[0].tables[0].name).toBe("users");
        });

        test("should skip write when schema is identical (cachedAt dedup)", async () => {
            const first = await store.saveSchema(projectId, mockSchemas);
            const second = await store.saveSchema(projectId, mockSchemas);

            // Same cachedAt means the write was skipped
            expect(second.cachedAt).toBe(first.cachedAt);
        });

        test("should write when schema changes", async () => {
            const first = await store.saveSchema(projectId, mockSchemas);

            const changedSchemas: SchemaSnapshot[] = [
                {
                    ...mockSchemas[0],
                    tables: [
                        ...mockSchemas[0].tables,
                        {
                            name: "posts",
                            type: "BASE TABLE",
                            columns: [
                                { name: "id", type: "integer", nullable: false, isPrimaryKey: true, isForeignKey: false, defaultValue: null, isUnique: true },
                            ],
                        },
                    ],
                },
            ];

            // Allow time difference
            await new Promise((r) => setTimeout(r, 10));
            const second = await store.saveSchema(projectId, changedSchemas);

            expect(second.cachedAt).not.toBe(first.cachedAt);
            expect(second.schemas[0].tables).toHaveLength(2);
        });

        test("should throw when saving schema for non-existent project", async () => {
            await expect(
                store.saveSchema("no-such-project", mockSchemas)
            ).rejects.toThrow("Project no-such-project not found");
        });
    });

    // ==========================================
    // ER Diagram Operations
    // ==========================================

    describe("ER Diagram Operations", () => {
        let projectId: string;

        beforeEach(async () => {
            const project = await store.createProject({
                databaseId: "db-1",
                name: "ERTest",
            });
            projectId = project.id;
        });

        test("should get initial empty diagram", async () => {
            const diagram = await store.getERDiagram(projectId);
            expect(diagram).toBeDefined();
            expect(diagram!.nodes).toEqual([]);
        });

        test("should save and retrieve diagram", async () => {
            const nodes = [
                { tableId: "users", x: 100, y: 200 },
                { tableId: "posts", x: 300, y: 400, collapsed: true },
            ];

            const saved = await store.saveERDiagram(projectId, {
                nodes,
                zoom: 1.5,
                panX: 50,
                panY: 75,
            });

            expect(saved.nodes).toHaveLength(2);
            expect(saved.zoom).toBe(1.5);
            expect(saved.panX).toBe(50);

            const retrieved = await store.getERDiagram(projectId);
            expect(retrieved!.nodes).toHaveLength(2);
            expect(retrieved!.nodes[0].tableId).toBe("users");
        });
    });

    // ==========================================
    // Query Operations
    // ==========================================

    describe("Query Operations", () => {
        let projectId: string;

        beforeEach(async () => {
            const project = await store.createProject({
                databaseId: "db-1",
                name: "QueryTest",
            });
            projectId = project.id;
        });

        test("should get initial empty queries", async () => {
            const queries = await store.getQueries(projectId);
            expect(queries).toBeDefined();
            expect(queries!.queries).toEqual([]);
        });

        test("should add a query", async () => {
            const query = await store.addQuery(projectId, {
                name: "Get Users",
                sql: "SELECT * FROM users",
                description: "Fetch all users",
            });

            expect(query).toBeDefined();
            expect(query.id).toBeDefined();
            expect(query.name).toBe("Get Users");
            expect(query.sql).toBe("SELECT * FROM users");
            expect(query.description).toBe("Fetch all users");
        });

        test("should list queries after adding", async () => {
            await store.addQuery(projectId, { name: "Q1", sql: "SELECT 1" });
            await store.addQuery(projectId, { name: "Q2", sql: "SELECT 2" });

            const queries = await store.getQueries(projectId);
            expect(queries!.queries).toHaveLength(2);
        });

        test("should update a query", async () => {
            const query = await store.addQuery(projectId, {
                name: "Old Name",
                sql: "SELECT 1",
            });

            const updated = await store.updateQuery(projectId, query.id, {
                name: "New Name",
                sql: "SELECT 2",
            });

            expect(updated).toBeDefined();
            expect(updated!.name).toBe("New Name");
            expect(updated!.sql).toBe("SELECT 2");
            expect(updated!.updatedAt).not.toBe(query.updatedAt);
        });

        test("should return null when updating non-existent query", async () => {
            const result = await store.updateQuery(projectId, "no-such-query", {
                name: "x",
            });
            expect(result).toBeNull();
        });

        test("should delete a query", async () => {
            const query = await store.addQuery(projectId, {
                name: "To Delete",
                sql: "SELECT 1",
            });

            await store.deleteQuery(projectId, query.id);

            const queries = await store.getQueries(projectId);
            expect(queries!.queries.find((q) => q.id === query.id)).toBeUndefined();
        });
    });

    // ==========================================
    // Export
    // ==========================================

    describe("Export", () => {
        test("should export full project bundle", async () => {
            const project = await store.createProject({
                databaseId: "db-1",
                name: "ExportTest",
            });

            // Add some data
            await store.saveSchema(project.id, [
                { name: "public", tables: [] },
            ]);
            await store.saveERDiagram(project.id, { nodes: [{ tableId: "t1", x: 0, y: 0 }] });
            await store.addQuery(project.id, { name: "Q1", sql: "SELECT 1" });

            const bundle = await store.exportProject(project.id);
            expect(bundle).toBeDefined();
            expect(bundle!.metadata.name).toBe("ExportTest");
            expect(bundle!.schema).toBeDefined();
            expect(bundle!.erDiagram!.nodes).toHaveLength(1);
            expect(bundle!.queries!.queries).toHaveLength(1);
        });

        test("should return null for non-existent project export", async () => {
            const bundle = await store.exportProject("no-such-id");
            expect(bundle).toBeNull();
        });
    });

    // ==========================================
    // Local Config (git-ignored)
    // ==========================================

    describe("Local Config", () => {
        let projectId: string;

        beforeEach(async () => {
            const project = await store.createProject({
                databaseId: "db-1",
                name: "ConfigTest",
            });
            projectId = project.id;
        });

        test("should get initial empty local config", async () => {
            const config = await store.getLocalConfig(projectId);
            expect(config).toBeDefined();
            expect(config).toEqual({});
        });

        test("should save and retrieve local config", async () => {
            const saved = await store.saveLocalConfig(projectId, {
                connectionUrl: "postgres://localhost:5432/mydb",
                environment: "development",
                notes: "My dev setup",
            });

            expect(saved.connectionUrl).toBe("postgres://localhost:5432/mydb");

            const retrieved = await store.getLocalConfig(projectId);
            expect(retrieved!.environment).toBe("development");
        });
    });

    // ==========================================
    // .gitignore Management
    // ==========================================

    describe("Gitignore Management", () => {
        let projectId: string;

        beforeEach(async () => {
            const project = await store.createProject({
                databaseId: "db-1",
                name: "GitignoreTest",
            });
            projectId = project.id;
        });

        test("should create .gitignore on project creation", async () => {
            const dir = getProjectDir(projectId);
            const giPath = path.join(dir, ".gitignore");
            expect(fsSync.existsSync(giPath)).toBe(true);
        });

        test("should include relwave.local.json in .gitignore", async () => {
            const dir = getProjectDir(projectId);
            const content = await fs.readFile(path.join(dir, ".gitignore"), "utf-8");
            expect(content).toContain("relwave.local.json");
        });

        test("should be idempotent", async () => {
            // Already created once during project creation
            const result = await store.ensureGitignore(projectId);
            // Should return false = already has our rules
            expect(result).toBe(false);
        });

        test("should append to existing .gitignore without our rules", async () => {
            const dir = getProjectDir(projectId);
            const giPath = path.join(dir, ".gitignore");

            // Overwrite with custom content (without our rules)
            await fs.writeFile(giPath, "node_modules/\n*.log\n", "utf-8");

            const result = await store.ensureGitignore(projectId);
            expect(result).toBe(true);

            const content = await fs.readFile(giPath, "utf-8");
            expect(content).toContain("node_modules/");
            expect(content).toContain("relwave.local.json");
        });
    });

    // ==========================================
    // README Generation
    // ==========================================

    describe("README Generation", () => {
        test("should create README.md on project creation", async () => {
            const project = await store.createProject({
                databaseId: "db-1",
                name: "My Project",
                description: "A cool database project",
            });
            const dir = getProjectDir(project.id);
            const readmePath = path.join(dir, "README.md");
            expect(fsSync.existsSync(readmePath)).toBe(true);
        });

        test("should include project name and description", async () => {
            const project = await store.createProject({
                databaseId: "db-1",
                name: "ReadmeProject",
                description: "This is the project description",
            });
            const dir = getProjectDir(project.id);
            const content = await fs.readFile(path.join(dir, "README.md"), "utf-8");
            expect(content).toContain("# ReadmeProject");
            expect(content).toContain("This is the project description");
        });

        test("should include .env reference and variable table", async () => {
            const project = await store.createProject({
                databaseId: "db-1",
                name: "EnvRef",
            });
            const dir = getProjectDir(project.id);
            const content = await fs.readFile(path.join(dir, "README.md"), "utf-8");
            expect(content).toContain(".env");
            expect(content).toContain("DB_HOST");
            expect(content).toContain("PGHOST");
            expect(content).toContain("MYSQL_HOST");
        });

        test("should include project structure section", async () => {
            const project = await store.createProject({
                databaseId: "db-1",
                name: "StructureRef",
            });
            const dir = getProjectDir(project.id);
            const content = await fs.readFile(path.join(dir, "README.md"), "utf-8");
            expect(content).toContain("relwave.json");
            expect(content).toContain("relwave.local.json");
            expect(content).toContain("schema.json");
            expect(content).toContain("er.json");
            expect(content).toContain("queries.json");
        });

        test("should include collaboration notes", async () => {
            const project = await store.createProject({
                databaseId: "db-1",
                name: "CollabRef",
            });
            const dir = getProjectDir(project.id);
            const content = await fs.readFile(path.join(dir, "README.md"), "utf-8");
            expect(content).toContain("Collaboration");
            expect(content).toContain("git-ignored");
        });

        test("should be idempotent (not overwrite existing README)", async () => {
            const project = await store.createProject({
                databaseId: "db-1",
                name: "IdempotentReadme",
            });
            const dir = getProjectDir(project.id);
            const readmePath = path.join(dir, "README.md");

            // Overwrite with custom content
            await fs.writeFile(readmePath, "# Custom README\n", "utf-8");

            // ensureReadme should NOT replace it
            const result = await store.ensureReadme(project.id, { name: "IdempotentReadme" });
            expect(result).toBe(false);

            const content = await fs.readFile(readmePath, "utf-8");
            expect(content).toBe("# Custom README\n");
        });
    });
});
