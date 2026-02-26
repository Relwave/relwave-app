// ----------------------------
// services/projectStore.ts
// ----------------------------

import path from "path";
import fs from "fs/promises";
import fsSync from "fs";
import { v4 as uuidv4 } from "uuid";
import {
    PROJECTS_FOLDER,
    PROJECTS_INDEX_FILE,
    getProjectDir,
    ensureDir,
} from "../utils/config";
import { dbStoreInstance, DBMeta } from "./dbStore";

// ==========================================
// Types
// ==========================================

export type ProjectMetadata = {
    version: number;
    id: string;
    databaseId: string;
    name: string;
    description?: string;
    engine?: string;
    defaultSchema?: string;
    /** For imported (cloned) projects — the absolute path to the original repo */
    sourcePath?: string;
    createdAt: string;
    updatedAt: string;
};

export type SavedQuery = {
    id: string;
    name: string;
    sql: string;
    description?: string;
    createdAt: string;
    updatedAt: string;
};

export type QueriesFile = {
    version: number;
    projectId: string;
    queries: SavedQuery[];
};

export type ERNode = {
    tableId: string;
    x: number;
    y: number;
    width?: number;
    height?: number;
    collapsed?: boolean;
};

export type ERDiagramFile = {
    version: number;
    projectId: string;
    nodes: ERNode[];
    zoom?: number;
    panX?: number;
    panY?: number;
    updatedAt: string;
};

export type SchemaFile = {
    version: number;
    projectId: string;
    databaseId: string;
    schemas: SchemaSnapshot[];
    cachedAt: string;
};

export type SchemaSnapshot = {
    name: string;
    tables: TableSnapshot[];
};

export type TableSnapshot = {
    name: string;
    type: string;
    columns: ColumnSnapshot[];
};

export type ColumnSnapshot = {
    name: string;
    type: string;
    nullable: boolean;
    isPrimaryKey: boolean;
    isForeignKey: boolean;
    defaultValue: string | null;
    isUnique: boolean;
};

export type ProjectSummary = Pick<
    ProjectMetadata,
    "id" | "name" | "description" | "engine" | "databaseId" | "sourcePath" | "createdAt" | "updatedAt"
>;

/**
 * Local (git-ignored) configuration for a project.
 * Contains per-developer settings that should NOT be committed.
 */
export type LocalConfig = {
    /** Local database connection ID (machine-specific, never committed) */
    databaseId?: string;

    /** Override connection URL (developer-specific) */
    connectionUrl?: string;

    /** Environment label (dev / staging / prod) */
    environment?: string;

    /** Any developer-specific notes */
    notes?: string;
};



type ProjectIndex = {
    version: number;
    projects: ProjectSummary[];
};


const PROJECT_FILES = {
    metadata: "relwave.json",
    localConfig: "relwave.local.json",
    schema: path.join("schema", "schema.json"),
    erDiagram: path.join("diagrams", "er.json"),
    queries: path.join("queries", "queries.json"),
} as const;

export class ProjectStore {
    private projectsFolder: string;
    private indexFile: string;

    /**
     * Sync cache: projectId → sourcePath.  Populated from the index on
     * first load so that `projectDir()` can resolve imported projects
     * without an async lookup.
     */
    private sourcePathCache = new Map<string, string>();
    private cacheLoaded = false;

    constructor(
        projectsFolder: string = PROJECTS_FOLDER,
        indexFile: string = PROJECTS_INDEX_FILE
    ) {
        this.projectsFolder = projectsFolder;
        this.indexFile = indexFile;
    }

    /**
     * Ensure the sourcePathCache is populated from the index.
     * Safe to call multiple times — only reads once.
     */
    private async ensureSourcePathCache(): Promise<void> {
        if (this.cacheLoaded) return;
        const index = await this.loadIndex();
        for (const p of index.projects) {
            if (p.sourcePath) {
                this.sourcePathCache.set(p.id, p.sourcePath);
            }
        }
        this.cacheLoaded = true;
    }

    /**
     * Resolve the working directory for a project.
     * For imported projects this is the original cloned repo (sourcePath);
     * for regular projects it falls back to the internal ~/.relwave/projects/<id> dir.
     */
    private projectDir(projectId: string): string {
        const sp = this.sourcePathCache.get(projectId);
        return sp || getProjectDir(projectId);
    }

    /**
     * Async version that guarantees the cache is loaded first.
     * Use this when accuracy is critical (e.g. project.getDir handler).
     */
    async resolveProjectDir(projectId: string): Promise<string> {
        await this.ensureSourcePathCache();
        return this.projectDir(projectId);
    }

    private projectFile(projectId: string, file: string): string {
        return path.join(this.projectDir(projectId), file);
    }

    /**
     * Ensure the project directory and sub-folders exist
     */
    private async ensureProjectDirs(projectId: string): Promise<void> {
        const base = this.projectDir(projectId);
        ensureDir(base);
        ensureDir(path.join(base, "schema"));
        ensureDir(path.join(base, "diagrams"));
        ensureDir(path.join(base, "queries"));
    }

    /**
     * Read and parse a JSON file, returns null if missing
     */
    private async readJSON<T>(filePath: string): Promise<T | null> {
        try {
            if (!fsSync.existsSync(filePath)) return null;
            const raw = await fs.readFile(filePath, "utf-8");
            return JSON.parse(raw) as T;
        } catch {
            return null;
        }
    }

    /**
     * Write JSON atomically (write to tmp then rename)
     */
    private async writeJSON(filePath: string, data: unknown): Promise<void> {
        const dir = path.dirname(filePath);
        ensureDir(dir);
        const tmp = `${filePath}.${process.pid}.${uuidv4()}.tmp`;
        await fs.writeFile(tmp, JSON.stringify(data, null, 2), "utf-8");
        await fs.rename(tmp, filePath);
    }

    private async loadIndex(): Promise<ProjectIndex> {
        const data = await this.readJSON<ProjectIndex>(this.indexFile);
        return data ?? { version: 1, projects: [] };
    }

    private async saveIndex(index: ProjectIndex): Promise<void> {
        ensureDir(this.projectsFolder);
        await this.writeJSON(this.indexFile, index);
    }


    /**
     * List all projects (lightweight, from index).
     * Also hydrates the sourcePathCache.
     */
    async listProjects(): Promise<ProjectSummary[]> {
        const index = await this.loadIndex();
        // Hydrate the cache on every list call so newly imported projects
        // are resolved correctly even before the next full reload.
        for (const p of index.projects) {
            if (p.sourcePath) {
                this.sourcePathCache.set(p.id, p.sourcePath);
            }
        }
        this.cacheLoaded = true;
        return index.projects;
    }

    /**
     * Get full project metadata.
     * For imported projects the databaseId is merged from the local
     * (git-ignored) config so that the tracked relwave.json is never
     * modified with machine-specific connection IDs.
     */
    async getProject(projectId: string): Promise<ProjectMetadata | null> {
        const meta = await this.readJSON<ProjectMetadata>(
            this.projectFile(projectId, PROJECT_FILES.metadata)
        );
        if (!meta) return null;

        // Merge databaseId from local config (overrides the tracked value)
        const local = await this.getLocalConfig(projectId);
        if (local?.databaseId) {
            meta.databaseId = local.databaseId;
        }

        return meta;
    }

    /**
     * Find a project linked to a specific database ID.
     * Returns the first matching project or null.
     */
    async getProjectByDatabaseId(databaseId: string): Promise<ProjectMetadata | null> {
        const index = await this.loadIndex();
        const entry = index.projects.find((p) => p.databaseId === databaseId);
        if (!entry) return null;
        return this.getProject(entry.id);
    }

    /**
     * Create a new project linked to a database connection
     */
    async createProject(params: {
        databaseId: string;
        name: string;
        description?: string;
        defaultSchema?: string;
    }): Promise<ProjectMetadata> {
        // Resolve engine from the linked database
        let engine: string | undefined;
        try {
            const db: DBMeta | null = await dbStoreInstance.getDB(params.databaseId);
            engine = db?.type;
        } catch {
            // db may not exist yet — that's OK
        }

        const id = uuidv4();
        const now = new Date().toISOString();

        const meta: ProjectMetadata = {
            version: 1,
            id,
            databaseId: params.databaseId,
            name: params.name,
            description: params.description,
            engine,
            defaultSchema: params.defaultSchema,
            createdAt: now,
            updatedAt: now,
        };

        // Create project directory structure
        await this.ensureProjectDirs(id);

        // Write metadata
        await this.writeJSON(
            this.projectFile(id, PROJECT_FILES.metadata),
            meta
        );

        // Initialise empty sub-files
        const emptySchema: SchemaFile = {
            version: 1,
            projectId: id,
            databaseId: params.databaseId,
            schemas: [],
            cachedAt: now,
        };
        const emptyER: ERDiagramFile = {
            version: 1,
            projectId: id,
            nodes: [],
            updatedAt: now,
        };
        const emptyQueries: QueriesFile = {
            version: 1,
            projectId: id,
            queries: [],
        };

        await Promise.all([
            this.writeJSON(this.projectFile(id, PROJECT_FILES.schema), emptySchema),
            this.writeJSON(this.projectFile(id, PROJECT_FILES.erDiagram), emptyER),
            this.writeJSON(this.projectFile(id, PROJECT_FILES.queries), emptyQueries),
        ]);

        // Create git-safe scaffolding
        await this.ensureGitignore(id);
        // Create empty local config (will be gitignored)
        const emptyLocal: LocalConfig = {};
        await this.writeJSON(this.projectFile(id, PROJECT_FILES.localConfig), emptyLocal);

        // Update global index
        const index = await this.loadIndex();
        index.projects.push({
            id,
            name: meta.name,
            description: meta.description,
            engine,
            databaseId: meta.databaseId,
            createdAt: now,
            updatedAt: now,
        });
        await this.saveIndex(index);

        return meta;
    }

    /**
     * Update project metadata (name, description, defaultSchema)
     */
    async updateProject(
        projectId: string,
        updates: Partial<Pick<ProjectMetadata, "name" | "description" | "defaultSchema">>
    ): Promise<ProjectMetadata | null> {
        const meta = await this.getProject(projectId);
        if (!meta) return null;

        const now = new Date().toISOString();

        // Whitelist only allowed fields from updates to avoid overwriting
        // sensitive metadata (e.g., id, databaseId, version, timestamps).
        const { name, description, defaultSchema } = updates;
        const safeUpdates: Partial<Pick<ProjectMetadata, "name" | "description" | "defaultSchema">> = {};
        if (name !== undefined) {
            safeUpdates.name = name;
        }
        if (description !== undefined) {
            safeUpdates.description = description;
        }
        if (defaultSchema !== undefined) {
            safeUpdates.defaultSchema = defaultSchema;
        }

        const updated: ProjectMetadata = {
            ...meta,
            ...safeUpdates,
            updatedAt: now,
        };

        await this.writeJSON(
            this.projectFile(projectId, PROJECT_FILES.metadata),
            updated
        );

        // Sync the index entry
        const index = await this.loadIndex();
        const entry = index.projects.find((p) => p.id === projectId);
        if (entry) {
            if (updates.name !== undefined) entry.name = updates.name;
            if (updates.description !== undefined) entry.description = updates.description;
            entry.updatedAt = now;
            await this.saveIndex(index);
        }

        return updated;
    }

    /**
     * Link (or re-link) a database to a project.
     *
     * For **imported** projects the databaseId is written to the
     * git-ignored local config (relwave.local.json) so the tracked
     * relwave.json stays unmodified — no unnecessary commits.
     *
     * For **regular** (internal) projects it updates relwave.json
     * directly (the whole dir is internal, not shared via git).
     */
    async linkDatabase(projectId: string, databaseId: string): Promise<ProjectMetadata | null> {
        const meta = await this.getProject(projectId);
        if (!meta) return null;

        const now = new Date().toISOString();

        // Resolve engine from the linked database
        let engine: string | undefined;
        try {
            const db: DBMeta | null = await dbStoreInstance.getDB(databaseId);
            engine = db?.type;
        } catch {
            // db may not exist yet
        }

        await this.ensureSourcePathCache();
        const isImported = this.sourcePathCache.has(projectId);

        if (isImported) {
            // ---- Imported project: write to local config only ----
            const local = (await this.getLocalConfig(projectId)) ?? {};
            local.databaseId = databaseId;
            await this.saveLocalConfig(projectId, local);
        } else {
            // ---- Regular project: update relwave.json ----
            const updated: ProjectMetadata = {
                ...meta,
                databaseId,
                engine: engine ?? meta.engine,
                updatedAt: now,
            };
            await this.writeJSON(
                this.projectFile(projectId, PROJECT_FILES.metadata),
                updated
            );

            // Sync schema file's databaseId reference
            const schemaFile = await this.getSchema(projectId);
            if (schemaFile) {
                schemaFile.databaseId = databaseId;
                await this.writeJSON(
                    this.projectFile(projectId, PROJECT_FILES.schema),
                    schemaFile
                );
            }
        }

        // Sync the index entry (always — index is internal)
        const index = await this.loadIndex();
        const entry = index.projects.find((p) => p.id === projectId);
        if (entry) {
            entry.databaseId = databaseId;
            if (engine) entry.engine = engine;
            entry.updatedAt = now;
            await this.saveIndex(index);
        }

        // Return the effective metadata (with merged databaseId)
        return {
            ...meta,
            databaseId,
            engine: engine ?? meta.engine,
            updatedAt: now,
        };
    }

    /**
     * Delete a project.
     * For regular projects the internal directory is removed.
     * For imported projects the source directory is NOT deleted
     * (the user owns it) — only the index entry is removed.
     */
    async deleteProject(projectId: string): Promise<void> {
        await this.ensureSourcePathCache();
        const isImported = this.sourcePathCache.has(projectId);

        if (!isImported) {
            // Regular project — safe to remove the internal dir
            const dir = this.projectDir(projectId);
            if (fsSync.existsSync(dir)) {
                await fs.rm(dir, { recursive: true, force: true });
            }
        }

        // Remove from index + cache
        this.sourcePathCache.delete(projectId);
        const index = await this.loadIndex();
        index.projects = index.projects.filter((p) => p.id !== projectId);
        await this.saveIndex(index);
    }

    async getSchema(projectId: string): Promise<SchemaFile | null> {
        return this.readJSON<SchemaFile>(
            this.projectFile(projectId, PROJECT_FILES.schema)
        );
    }

    async saveSchema(projectId: string, schemas: SchemaSnapshot[]): Promise<SchemaFile> {
        const meta = await this.getProject(projectId);
        if (!meta) throw new Error(`Project ${projectId} not found`);

        // Read existing file and skip write if schema data is identical
        // (avoids cachedAt churn that creates phantom git changes)
        const existing = await this.getSchema(projectId);
        if (existing) {
            const oldData = JSON.stringify(existing.schemas);
            const newData = JSON.stringify(schemas);
            if (oldData === newData) {
                return existing; // nothing changed — keep old cachedAt
            }
        }

        const now = new Date().toISOString();
        const file: SchemaFile = {
            version: 1,
            projectId,
            databaseId: meta.databaseId,
            schemas,
            cachedAt: now,
        };

        await this.writeJSON(
            this.projectFile(projectId, PROJECT_FILES.schema),
            file
        );

        return file;
    }

    async getERDiagram(projectId: string): Promise<ERDiagramFile | null> {
        return this.readJSON<ERDiagramFile>(
            this.projectFile(projectId, PROJECT_FILES.erDiagram)
        );
    }

    async saveERDiagram(
        projectId: string,
        data: Pick<ERDiagramFile, "nodes" | "zoom" | "panX" | "panY">
    ): Promise<ERDiagramFile> {
        const now = new Date().toISOString();
        const file: ERDiagramFile = {
            version: 1,
            projectId,
            nodes: data.nodes,
            zoom: data.zoom,
            panX: data.panX,
            panY: data.panY,
            updatedAt: now,
        };

        await this.writeJSON(
            this.projectFile(projectId, PROJECT_FILES.erDiagram),
            file
        );

        return file;
    }

    async getQueries(projectId: string): Promise<QueriesFile | null> {
        return this.readJSON<QueriesFile>(
            this.projectFile(projectId, PROJECT_FILES.queries)
        );
    }

    async addQuery(
        projectId: string,
        params: { name: string; sql: string; description?: string }
    ): Promise<SavedQuery> {
        const file = (await this.getQueries(projectId)) ?? {
            version: 1,
            projectId,
            queries: [],
        };

        const now = new Date().toISOString();
        const query: SavedQuery = {
            id: uuidv4(),
            name: params.name,
            sql: params.sql,
            description: params.description,
            createdAt: now,
            updatedAt: now,
        };

        file.queries.push(query);

        await this.writeJSON(
            this.projectFile(projectId, PROJECT_FILES.queries),
            file
        );

        return query;
    }

    async updateQuery(
        projectId: string,
        queryId: string,
        updates: Partial<Pick<SavedQuery, "name" | "sql" | "description">>
    ): Promise<SavedQuery | null> {
        const file = await this.getQueries(projectId);
        if (!file) return null;

        const idx = file.queries.findIndex((q) => q.id === queryId);
        if (idx === -1) return null;

        const now = new Date().toISOString();
        file.queries[idx] = {
            ...file.queries[idx],
            ...updates,
            updatedAt: now,
        };

        await this.writeJSON(
            this.projectFile(projectId, PROJECT_FILES.queries),
            file
        );

        return file.queries[idx];
    }

    async deleteQuery(projectId: string, queryId: string): Promise<void> {
        const file = await this.getQueries(projectId);
        if (!file) return;

        file.queries = file.queries.filter((q) => q.id !== queryId);

        await this.writeJSON(
            this.projectFile(projectId, PROJECT_FILES.queries),
            file
        );
    }

    /**
     * Returns the full project bundle — useful for export / git commit
     */
    async exportProject(projectId: string): Promise<{
        metadata: ProjectMetadata;
        schema: SchemaFile | null;
        erDiagram: ERDiagramFile | null;
        queries: QueriesFile | null;
    } | null> {
        const metadata = await this.getProject(projectId);
        if (!metadata) return null;

        const [schema, erDiagram, queries] = await Promise.all([
            this.getSchema(projectId),
            this.getERDiagram(projectId),
            this.getQueries(projectId),
        ]);

        return { metadata, schema, erDiagram, queries };
    }

    // ==========================================
    // Local Config (git-ignored)
    // ==========================================

    /**
     * Read the local (git-ignored) config for a project
     */
    async getLocalConfig(projectId: string): Promise<LocalConfig | null> {
        return this.readJSON<LocalConfig>(
            this.projectFile(projectId, PROJECT_FILES.localConfig)
        );
    }

    /**
     * Write/update the local config
     */
    async saveLocalConfig(projectId: string, config: LocalConfig): Promise<LocalConfig> {
        await this.writeJSON(
            this.projectFile(projectId, PROJECT_FILES.localConfig),
            config
        );
        return config;
    }

    // ==========================================
    // .gitignore management
    // ==========================================

    /**
     * Ensure a .gitignore file exists in the project directory
     * with rules to exclude local credentials and caches.
     */
    async ensureGitignore(projectId: string): Promise<boolean> {
        const dir = this.projectDir(projectId);
        const giPath = path.join(dir, ".gitignore");

        const rules = [
            "# RelWave — auto-generated",
            "# Local config (connection credentials, environment overrides)",
            "relwave.local.json",
            "",
            "# OS / Editor",
            ".DS_Store",
            "Thumbs.db",
            "",
        ].join("\n");

        if (fsSync.existsSync(giPath)) {
            const existing = await fs.readFile(giPath, "utf-8");
            if (existing.includes("relwave.local.json")) {
                return false; // already has our rules
            }
            // Append to existing
            await fs.writeFile(giPath, existing + "\n\n" + rules, "utf-8");
            return true;
        }

        await fs.writeFile(giPath, rules, "utf-8");
        return true;
    }

    // ==========================================
    // Import Project (from cloned repo)
    // ==========================================

    /**
     * Parse a .env file into a key-value map.
     * Supports standard KEY=VALUE, KEY="VALUE", KEY='VALUE', comments, and blank lines.
     */
    static parseEnvFile(content: string): Record<string, string> {
        const result: Record<string, string> = {};
        for (const raw of content.split(/\r?\n/)) {
            const line = raw.trim();
            if (!line || line.startsWith("#")) continue;
            const eqIdx = line.indexOf("=");
            if (eqIdx === -1) continue;
            const key = line.slice(0, eqIdx).trim();
            let value = line.slice(eqIdx + 1).trim();
            // Strip surrounding quotes
            if (
                (value.startsWith('"') && value.endsWith('"')) ||
                (value.startsWith("'") && value.endsWith("'"))
            ) {
                value = value.slice(1, -1);
            }
            result[key] = value;
        }
        return result;
    }

    /**
     * Extract database connection parameters from a parsed .env map.
     * Recognises common variable names used in the ecosystem.
     */
    static extractDbParamsFromEnv(
        env: Record<string, string>
    ): {
        host?: string;
        port?: number;
        user?: string;
        password?: string;
        database?: string;
        type?: string;
        ssl?: boolean;
        name?: string;
    } | null {
        const get = (...keys: string[]): string | undefined => {
            for (const k of keys) {
                if (env[k]) return env[k];
            }
            return undefined;
        };

        const host = get("DB_HOST", "DATABASE_HOST", "PGHOST", "MYSQL_HOST");
        const portStr = get("DB_PORT", "DATABASE_PORT", "PGPORT", "MYSQL_PORT");
        const user = get("DB_USER", "DATABASE_USER", "PGUSER", "MYSQL_USER", "DB_USERNAME", "DATABASE_USERNAME");
        const password = get("DB_PASSWORD", "DATABASE_PASSWORD", "PGPASSWORD", "MYSQL_PASSWORD");
        const database = get("DB_NAME", "DB_DATABASE", "DATABASE_NAME", "PGDATABASE", "MYSQL_DATABASE");
        const type = get("DB_TYPE", "DATABASE_TYPE", "DB_ENGINE", "DATABASE_ENGINE");
        const sslStr = get("DB_SSL", "DATABASE_SSL");
        const name = get("DB_CONNECTION_NAME", "DATABASE_CONNECTION_NAME");

        // Must have at least host or database to be useful
        if (!host && !database) return null;

        const port = portStr ? parseInt(portStr, 10) : undefined;
        const ssl = sslStr ? ["true", "1", "yes"].includes(sslStr.toLowerCase()) : undefined;

        return {
            host,
            port: port && !isNaN(port) ? port : undefined,
            user,
            password,
            database,
            type: type?.toLowerCase(),
            ssl,
            name,
        };
    }

    /**
     * Scan a cloned repo directory for import.
     * Returns project metadata and .env info WITHOUT creating anything.
     * Use this to preview what will be imported and determine if DB creds are needed.
     */
    async scanImportSource(sourcePath: string): Promise<{
        metadata: {
            name: string;
            description?: string;
            engine?: string;
            defaultSchema?: string;
        };
        envFound: boolean;
        parsedEnv: {
            host?: string;
            port?: number;
            user?: string;
            password?: string;
            database?: string;
            type?: string;
            ssl?: boolean;
            name?: string;
        } | null;
    }> {
        const sourceMetaPath = path.join(sourcePath, PROJECT_FILES.metadata);
        if (!fsSync.existsSync(sourceMetaPath)) {
            throw new Error(
                `Not a valid RelWave project: ${PROJECT_FILES.metadata} not found in ${sourcePath}`
            );
        }

        const sourceMeta = await this.readJSON<ProjectMetadata>(sourceMetaPath);
        if (!sourceMeta || !sourceMeta.name) {
            throw new Error(
                `Invalid ${PROJECT_FILES.metadata}: missing required fields`
            );
        }

        let envFound = false;
        let parsedEnv: ReturnType<typeof ProjectStore.extractDbParamsFromEnv> = null;

        const envPath = path.join(sourcePath, ".env");
        if (fsSync.existsSync(envPath)) {
            envFound = true;
            try {
                const envContent = await fs.readFile(envPath, "utf-8");
                const envMap = ProjectStore.parseEnvFile(envContent);
                parsedEnv = ProjectStore.extractDbParamsFromEnv(envMap);
            } catch {
                // .env exists but couldn't be read/parsed
            }
        }

        return {
            metadata: {
                name: sourceMeta.name,
                description: sourceMeta.description,
                engine: sourceMeta.engine,
                defaultSchema: sourceMeta.defaultSchema,
            },
            envFound,
            parsedEnv,
        };
    }

    /**
     * Import a project from a cloned repository directory.
     *
     * **Read-only on tracked files** – the import never modifies
     * `relwave.json` or sub-resource files (schema, ER, queries).
     * This means forking/cloning a project does *not* produce
     * unnecessary diffs that would pollute collaboration history.
     *
     * Machine-specific data (`databaseId`) is stored in the
     * git-ignored `relwave.local.json` so each developer can
     * connect to their own database instance.
     *
     * The original `projectId` from `relwave.json` is preserved so
     * it stays consistent across all forks.
     *
     * @param sourcePath   Absolute path to the cloned repo containing relwave.json
     * @param databaseId   A valid database connection ID to link to the project.
     *                     The caller must create the DB connection first (either
     *                     from .env auto-detection or user-provided credentials).
     *
     * @returns The effective ProjectMetadata (with local databaseId merged).
     */
    async importProject(params: {
        sourcePath: string;
        databaseId: string;
    }): Promise<ProjectMetadata> {
        const { sourcePath, databaseId } = params;

        if (!databaseId) {
            throw new Error("databaseId is required — create a database connection first");
        }

        // ---- 1. Validate source directory has a relwave.json ----
        const sourceMetaPath = path.join(sourcePath, PROJECT_FILES.metadata);
        if (!fsSync.existsSync(sourceMetaPath)) {
            throw new Error(
                `Not a valid RelWave project: ${PROJECT_FILES.metadata} not found in ${sourcePath}`
            );
        }

        const sourceMeta = await this.readJSON<ProjectMetadata>(sourceMetaPath);
        if (!sourceMeta || !sourceMeta.name) {
            throw new Error(
                `Invalid ${PROJECT_FILES.metadata}: missing required fields`
            );
        }

        // ---- 2. Check for duplicate project ID ----
        const id = sourceMeta.id;
        const index = await this.loadIndex();
        if (index.projects.some((p) => p.id === id)) {
            throw new Error(
                `Project "${sourceMeta.name}" is already imported (id: ${id})`
            );
        }

        // ---- 3. Resolve engine from the linked database ----
        let engine: string | undefined;
        try {
            const db: DBMeta | null = await dbStoreInstance.getDB(databaseId);
            engine = db?.type;
        } catch {
            // db may not exist yet
        }

        // ---- 4. Register the sourcePath so projectDir() resolves correctly ----
        this.sourcePathCache.set(id, sourcePath);

        // Ensure subdirectories exist in the source dir (they should,
        // but be defensive)
        for (const sub of ["schema", "diagrams", "queries"]) {
            ensureDir(path.join(sourcePath, sub));
        }

        // ---- 5. DO NOT modify relwave.json or sub-resource files ----
        //      relwave.json keeps the original projectId & databaseId
        //      so forks/clones never produce unnecessary diffs.

        // ---- 6. Ensure .gitignore exists in source dir ----
        await this.ensureGitignore(id);

        // ---- 7. Write databaseId to local config (git-ignored) ----
        const localConfig: LocalConfig = { databaseId };
        const localPath = path.join(sourcePath, PROJECT_FILES.localConfig);
        const existingLocal = fsSync.existsSync(localPath)
            ? await this.readJSON<LocalConfig>(localPath)
            : null;
        await this.writeJSON(localPath, { ...existingLocal, ...localConfig });

        // ---- 8. Add to the global index ----
        const now = new Date().toISOString();
        index.projects.push({
            id,
            name: sourceMeta.name,
            description: sourceMeta.description,
            engine: engine ?? sourceMeta.engine,
            databaseId,
            sourcePath,
            createdAt: sourceMeta.createdAt ?? now,
            updatedAt: now,
        });
        await this.saveIndex(index);

        // ---- 9. Return effective metadata (with local databaseId) ----
        return {
            ...sourceMeta,
            engine: engine ?? sourceMeta.engine,
            databaseId,
            sourcePath,
        };
    }
}

// Singleton instance
export const projectStoreInstance = new ProjectStore();