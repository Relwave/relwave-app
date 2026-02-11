import { AddDatabaseParams, ConnectionTestResult, CreateTableColumn, DatabaseConnection, DatabaseSchemaDetails, DatabaseStats, DiscoveredDatabase, RunQueryParams, TableRow, UpdateDatabaseParams } from "@/types/database";
import { ProjectSummary, ProjectMetadata, CreateProjectParams, UpdateProjectParams, SchemaFile, SchemaSnapshot, ERDiagramFile, ERNode, QueriesFile, SavedQuery, ProjectExport } from "@/types/project";
import { GitStatus, GitFileChange, GitLogEntry, GitBranchInfo } from "@/types/git";
import { SchemaDiffResponse, SchemaFileHistoryResponse } from "@/types/schemaDiff";
import {
  TimelineEntry,
  TimelineChangeSummary,
  AutoCommitResult,
  EnvironmentConfig,
  EnvironmentMapping,
  ResolvedEnvironment,
  ConflictReport,
} from "@/types/gitWorkflow";
import { bridgeRequest } from "./bridgeClient";


class BridgeApiService {
  // ------------------------------------
  // 1. SESSION MANAGEMENT METHODS (query.*)
  // ------------------------------------

  /**
   * Creates a new query session on the bridge server.
   * @param connectionConfig - (Optional) Connection details if needed for session meta.
   * @returns The unique sessionId string.
   */
  async createSession(connectionConfig?: any): Promise<string> {
    try {
      const result = await bridgeRequest("query.createSession", {
        config: connectionConfig,
      });
      const sessionId = result?.data?.sessionId;
      if (!sessionId) {
        throw new Error("Server failed to return a session ID.");
      }
      return sessionId;
    } catch (error: any) {
      console.error("Failed to create query session:", error);
      throw new Error(`Failed to create query session: ${error.message}`);
    }
  }

  /**
   * Cancels an active query session on the bridge server.
   * @param sessionId - The ID of the session to cancel.
   * @returns true if the query was successfully cancelled or false if it was not running.
   */
  async cancelSession(sessionId: string): Promise<boolean> {
    try {
      if (!sessionId) {
        throw new Error("Session ID is required for cancellation.");
      }
      const result = await bridgeRequest("query.cancel", { sessionId });
      return result?.data?.cancelled === true;
    } catch (error: any) {
      console.error("Failed to cancel session:", error);
      throw new Error(`Failed to cancel session: ${error.message}`);
    }
  }

  // ------------------------------------
  // 2. DATA RETRIEVAL METHODS (query.*)
  // ------------------------------------

  /**
   * Executes a streaming/long-running SQL query.
   * The actual results, progress, and completion status are sent via asynchronous notifications
   * (query.started, query.result, query.done, query.error) handled by bridgeClient listeners.
   * @param params - Contains sessionId, dbId, SQL query, and optional batchSize.
   * @returns Promise resolves when the query is successfully *initiated* on the server.
   */
  async runQuery(params: RunQueryParams): Promise<void> {
    try {
      if (!params.sessionId || !params.dbId || !params.sql) {
        throw new Error("sessionId, dbId, and sql are required.");
      }

      // The server returns immediately after starting the background job.
      await bridgeRequest("query.run", params);
    } catch (error: any) {
      console.error("Failed to initiate query execution:", error);
      throw new Error(`Failed to run query: ${error.message}`);
    }
  }

  /**
   * Fetches data from a specific table with pagination support.
   * @param dbId - The ID of the database connection to use.
   * @param schemaName - The schema containing the table (e.g., 'public').
   * @param tableName - The name of the table.
   * @param limit - Number of rows per page.
   * @param page - Page number (1-based).
   * @returns Object with rows array and totalCount.
   */
  async fetchTableData(
    dbId: string,
    schemaName: string,
    tableName: string,
    limit: number,
    page: number
  ): Promise<{ rows: TableRow[]; total: number }> {
    try {
      if (!dbId || !schemaName || !tableName) {
        throw new Error("Database ID, schema, and table name are required.");
      }
      const result = await bridgeRequest("query.fetchTableData", {
        dbId,
        schemaName,
        tableName,
        limit,
        page
      });
      return {
        rows: result?.data?.rows || [],
        total: result?.data?.total || result?.data?.rows?.length || 0
      };
    } catch (error: any) {
      console.error("Failed to fetch table data:", error);
      throw new Error(`Failed to fetch table data: ${error.message}`);
    }
  }

  // ------------------------------------
  // 3. DATABASE CRUD/METADATA METHODS (db.*)
  // ------------------------------------

  /**
   * List all database connections
   */
  async listDatabases(): Promise<DatabaseConnection[]> {
    try {
      const result = await bridgeRequest("db.list", {});
      return result?.data || [];
    } catch (error: any) {
      console.error("Failed to list databases:", error);
      throw new Error(`Failed to list databases: ${error.message}`);
    }
  }

  /**
   * Get a specific database connection by ID
   */
  async getDatabase(id: string): Promise<DatabaseConnection | null> {
    try {
      const result = await bridgeRequest("db.get", { id });
      return result?.data || null;
    } catch (error: any) {
      console.error("Failed to get database:", error);
      throw new Error(`Failed to get database: ${error.message}`);
    }
  }

  /**
   * Get migrations data for a database
   */
  async getMigrations(id: string): Promise<{ migrations: { local: any[]; applied: any[] }; baselined: boolean } | null> {
    try {
      const result = await bridgeRequest("query.connectToDatabase", { dbId: id });
      console.log(result)
      return result?.result || null;
    } catch (error: any) {
      console.error("Failed to get migrations:", error);
      throw new Error(`Failed to get migrations: ${error.message}`);
    }
  }

  /**
   * Add a new database connection
   */
  async addDatabase(params: AddDatabaseParams): Promise<DatabaseConnection> {
    try {
      // Validate required fields
      const required = ["name", "type", "host", "port", "user", "database"];
      for (const field of required) {
        if (!params[field as keyof AddDatabaseParams]) {
          throw new Error(`Missing required field: ${field}`);
        }
      }
      const result = await bridgeRequest("db.add", params);
      if (!result?.ok) {
        throw new Error("Failed to add database");
      }

      // Fetch the full database details
      const dbId = result.data?.id;
      if (!dbId) {
        throw new Error("No database ID returned");
      }

      const database = await this.getDatabase(dbId);
      if (!database) {
        throw new Error("Failed to fetch created database");
      }

      return database;
    } catch (error: any) {
      console.error("Failed to add database:", error);
      throw new Error(`Failed to add database: ${error.message}`);
    }
  }

  /**
   * Update an existing database connection
   */
  async updateDatabase(params: UpdateDatabaseParams): Promise<void> {
    try {
      if (!params.id) {
        throw new Error("Database ID is required");
      }

      await bridgeRequest("db.update", params);
    } catch (error: any) {
      console.error("Failed to update database:", error);
      throw new Error(`Failed to update database: ${error.message}`);
    }
  }

  /**
   * Delete a database connection
   */
  async deleteDatabase(id: string): Promise<void> {
    try {
      if (!id) {
        throw new Error("Database ID is required");
      }

      await bridgeRequest("db.delete", { id });
    } catch (error: any) {
      console.error("Failed to delete database:", error);
      throw new Error(`Failed to delete database: ${error.message}`);
    }
  }

  /**
   * Update the lastAccessedAt timestamp for a database
   * @param id - Database ID to touch
   */
  async touchDatabase(id: string): Promise<void> {
    try {
      if (!id) return;
      await bridgeRequest("db.touch", { id });
    } catch (error: any) {
      // Silently fail - this is not critical
      console.warn("Failed to update last accessed time:", error);
    }
  }

  /**
   * Test connection to a database
   * @param id - Database ID to test
   */
  async testConnection(id: string): Promise<ConnectionTestResult> {
    try {
      if (!id) {
        throw new Error("Database ID is required");
      }

      const result = await bridgeRequest("db.connectTest", { id });
      console.log(result);
      return result?.data || { ok: false, message: "Unknown error" };
    } catch (error: any) {
      console.error("Failed to test connection:", error);
      return { ok: false, message: error.message, status: 'disconnected' };
    }
  }

  async testAllConnections(): Promise<{ id: string; result: ConnectionTestResult }[]> {
    try {
      const databases = await this.listDatabases();
      const results: { id: string; result: ConnectionTestResult }[] = [];
      for (const db of databases) {
        const testResult = await this.testConnection(db.id);
        results.push({ id: db.id, result: testResult });
      }
      return results;
    } catch (error) {
      console.log(error)
      return [];
    }
  }

  /**
   * Test connection with raw connection parameters (without saving)
   */
  async testConnectionDirect(connection: {
    host: string;
    port: number;
    user: string;
    password?: string;
    database: string;
  }): Promise<ConnectionTestResult> {
    try {
      const result = await bridgeRequest("db.connectTest", { connection });
      return result?.data || { ok: false, message: "Unknown error" };
    } catch (error: any) {
      console.error("Failed to test connection:", error);
      return { ok: false, message: error.message, status: 'disconnected' };
    }
  }

  /**
   * List all tables in a database
   */
  async listTables(id: string, schema?: string): Promise<any[]> {
    // Changed return type to any[] to match typical result shape [{schema, name, type}]
    try {
      if (!id) {
        throw new Error("Database ID is required");
      }

      const result = await bridgeRequest("db.listTables", { id, schema });
      return result?.data || [];
    } catch (error: any) {
      console.error("Failed to list tables:", error);
      throw new Error(`Failed to list tables: ${error.message}`);
    }
  }

  async listSchemas(id: string): Promise<string[]> {
    try {
      if (!id) {
        throw new Error("Database ID is required");
      }

      const result = await bridgeRequest("db.listSchemas", { id });
      return result?.data || [];
    } catch (error: any) {
      console.error("Failed to list schemas:", error);
      throw new Error(`Failed to list schemas: ${error.message}`);
    }
  }

  /**
   * Alias for getDatabaseStats - used by useDbQueries hook
   */
  async getDataBaseStats(id: string): Promise<DatabaseStats> {
    try {
      if (!id) {
        throw new Error("Database ID is required");
      }
      const result = await bridgeRequest("db.getStats", { id });
      return result?.data || { tables: 0, rows: 0, sizeBytes: 0 };
    } catch (error: any) {
      console.error("Failed to get database stats:", error);
      throw new Error(`Failed to get database stats: ${error.message}`);
    }
  }

  async getTotalDatabaseStats(): Promise<DatabaseStats> {
    try {
      const result = await bridgeRequest("db.getTotalStats", {});
      return result?.data || { row: 0, size: 0, tables: 0 };
    } catch (error) {
      console.log(error);
      throw new Error(`Failed to get total database stats: ${error}`);
    }
  }

  async getSchema(id: string): Promise<DatabaseSchemaDetails | null> {
    try {
      if (!id) {
        throw new Error("Database ID is required.");
      }
      const result = await bridgeRequest("db.getSchema", { id });
      return result?.data || null;
    } catch (error: any) {
      console.error("Failed to fetch schema details:", error);
      throw new Error(`Failed to fetch schema details: ${error.message}`);
    }
  }

  async getPrimaryKeys(id: string, schemaName: string, tableName: string): Promise<string> {
    try {
      if (!id || !schemaName || !tableName) {
        throw new Error("Database ID, schema name, and table name are required.");
      }
      const result = await bridgeRequest("query.listPrimaryKeys", {
        dbId: id,
        schemaName,
        tableName,
      });
      return result?.primaryKeys[0].column_name || result?.primaryKeys[0].COLUMN_NAME || result.primaryKeys[0] || "";
    } catch (error: any) {
      console.error("Failed to fetch primary keys:", error);
      throw new Error(`Failed to fetch primary keys: ${error.message}`);
    }
  }

  /**
   * Create a new table in the database
   */
  async createTable(params: {
    dbId: string;
    schemaName: string;
    tableName: string;
    columns: CreateTableColumn[];
    foreignKeys?: any[];
  }): Promise<boolean> {
    try {
      if (!params.dbId || !params.schemaName || !params.tableName) {
        throw new Error("Database ID, schema name, and table name are required.");
      }
      if (!params.columns || params.columns.length === 0) {
        throw new Error("At least one column is required.");
      }
      const result = await bridgeRequest("query.createTable", {
        dbId: params.dbId,
        schemaName: params.schemaName,
        tableName: params.tableName,
        columns: params.columns,
        foreignKeys: params.foreignKeys || [],
      });
      return result?.ok === true;
    } catch (error: any) {
      console.error("Failed to create table:", error);
      throw new Error(`Failed to create table: ${error.message}`);
    }
  }

  /**
   * Create indexes for tables in the database
   */
  async createIndexes(params: {
    dbId: string;
    schemaName: string;
    indexes: any[];
  }): Promise<boolean> {
    try {
      if (!params.dbId || !params.schemaName) {
        throw new Error("Database ID and schema name are required.");
      }
      if (!params.indexes || params.indexes.length === 0) {
        throw new Error("At least one index is required.");
      }

      const result = await bridgeRequest("query.createIndexes", {
        dbId: params.dbId,
        schemaName: params.schemaName,
        indexes: params.indexes,
      });
      console.log(result)
      return result?.ok === true;
    } catch (error: any) {
      console.error("Failed to create indexes:", error);
      throw new Error(`Failed to create indexes: ${error.message}`);
    }
  }

  /**
   * Alter table structure
   */
  async alterTable(params: {
    dbId: string;
    schemaName: string;
    tableName: string;
    operations: any[];
  }): Promise<boolean> {
    try {
      if (!params.dbId || !params.schemaName || !params.tableName) {
        throw new Error("Database ID, schema name, and table name are required.");
      }
      if (!params.operations || params.operations.length === 0) {
        throw new Error("At least one operation is required.");
      }

      const result = await bridgeRequest("query.alterTable", {
        dbId: params.dbId,
        schemaName: params.schemaName,
        tableName: params.tableName,
        operations: params.operations,
      });

      return result?.ok === true;
    } catch (error: any) {
      console.error("Failed to alter table:", error);
      throw new Error(`Failed to alter table: ${error.message}`);
    }
  }

  /**
   * Drop a table
   */
  async dropTable(params: {
    dbId: string;
    schemaName: string;
    tableName: string;
    mode?: "RESTRICT" | "DETACH_FKS" | "CASCADE";
  }): Promise<boolean> {
    try {
      if (!params.dbId || !params.schemaName || !params.tableName) {
        throw new Error("Database ID, schema name, and table name are required.");
      }

      const result = await bridgeRequest("query.dropTable", {
        dbId: params.dbId,
        schemaName: params.schemaName,
        tableName: params.tableName,
        mode: params.mode || "RESTRICT",
      });

      return result?.ok === true;
    } catch (error: any) {
      console.error("Failed to drop table:", error);
      throw new Error(`Failed to drop table: ${error.message}`);
    }
  }

  /**
   * Insert a row into a table
   */
  async insertRow(params: {
    dbId: string;
    schemaName: string;
    tableName: string;
    rowData: Record<string, any>;
  }): Promise<any> {
    try {
      if (!params.dbId || !params.schemaName || !params.tableName) {
        throw new Error("Database ID, schema name, and table name are required.");
      }
      if (!params.rowData || Object.keys(params.rowData).length === 0) {
        throw new Error("Row data is required.");
      }

      const result = await bridgeRequest("query.insertRow", {
        dbId: params.dbId,
        schemaName: params.schemaName,
        tableName: params.tableName,
        rowData: params.rowData,
      });

      return result?.result || result;
    } catch (error: any) {
      console.error("Failed to insert row:", error);
      throw new Error(`Failed to insert row: ${error.message}`);
    }
  }

  /**
   * Update a row in a table
   */
  async updateRow(params: {
    dbId: string;
    schemaName: string;
    tableName: string;
    primaryKeyColumn: string;
    primaryKeyValue: any;
    rowData: Record<string, any>;
  }): Promise<any> {
    try {
      if (!params.dbId || !params.schemaName || !params.tableName || !params.primaryKeyColumn) {
        throw new Error("Database ID, schema name, table name, and primary key column are required.");
      }
      if (params.primaryKeyValue === undefined) {
        throw new Error("Primary key value is required.");
      }
      if (!params.rowData || Object.keys(params.rowData).length === 0) {
        throw new Error("Row data is required.");
      }

      const result = await bridgeRequest("query.updateRow", {
        dbId: params.dbId,
        schemaName: params.schemaName,
        tableName: params.tableName,
        primaryKeyColumn: params.primaryKeyColumn,
        primaryKeyValue: params.primaryKeyValue,
        rowData: params.rowData,
      });

      return result?.result || result;
    } catch (error: any) {
      console.error("Failed to update row:", error);
      throw new Error(`Failed to update row: ${error.message}`);
    }
  }

  /**
   * Delete a row from a table
   */
  async deleteRow(params: {
    dbId: string;
    schemaName: string;
    tableName: string;
    primaryKeyColumn: string;
    primaryKeyValue: any;
  }): Promise<boolean> {
    try {
      if (!params.dbId || !params.schemaName || !params.tableName) {
        throw new Error("Database ID, schema name, and table name are required.");
      }
      // Allow empty primaryKeyColumn if primaryKeyValue is an object (composite key)
      if (!params.primaryKeyColumn && typeof params.primaryKeyValue !== 'object') {
        throw new Error("Primary key column is required when not using composite key.");
      }
      if (params.primaryKeyValue === undefined || params.primaryKeyValue === null) {
        throw new Error("Primary key value or row data is required.");
      }

      const result = await bridgeRequest("query.deleteRow", {
        dbId: params.dbId,
        schemaName: params.schemaName,
        tableName: params.tableName,
        primaryKeyColumn: params.primaryKeyColumn,
        primaryKeyValue: params.primaryKeyValue,
      });

      return result?.deleted === true;
    } catch (error: any) {
      console.error("Failed to delete row:", error);
      throw new Error(`Failed to delete row: ${error.message}`);
    }
  }

  /**
   * Search for rows in a table
   */
  async searchTable(params: {
    dbId: string;
    schemaName: string;
    tableName: string;
    searchTerm: string;
    column?: string;
    page?: number;
    pageSize?: number;
  }): Promise<{ rows: any[]; total: number }> {
    try {
      if (!params.dbId || !params.schemaName || !params.tableName || !params.searchTerm) {
        throw new Error("Database ID, schema name, table name, and search term are required.");
      }

      const result = await bridgeRequest("query.searchTable", {
        dbId: params.dbId,
        schemaName: params.schemaName,
        tableName: params.tableName,
        searchTerm: params.searchTerm,
        column: params.column,
        page: params.page || 1,
        pageSize: params.pageSize || 50,
      });

      return { rows: result?.rows || [], total: result?.total || 0 };
    } catch (error: any) {
      console.error("Failed to search table:", error);
      throw new Error(`Failed to search table: ${error.message}`);
    }
  }

  // ------------------------------------
  // MIGRATION METHODS
  // ------------------------------------

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

  // ------------------------------------
  // 4. BRIDGE UTILITY METHODS
  // ------------------------------------

  /**
   * Ping the bridge to check if it's alive
   */
  async ping(): Promise<boolean> {
    try {
      const result = await bridgeRequest("ping", {});
      return result?.ok === true;
    } catch (error) {
      return false;
    }
  }

  /**
   * Get bridge health status
   */
  async healthCheck(): Promise<{
    ok: boolean;
    uptimeSec: number;
    pid: number;
  }> {
    try {
      const result = await bridgeRequest("health.ping", {});
      return result?.data || { ok: false, uptimeSec: 0, pid: 0 };
    } catch (error: any) {
      throw new Error(`Health check failed: ${error.message}`);
    }
  }

  // ------------------------------------
  // 5. DATABASE DISCOVERY METHODS
  // ------------------------------------

  /**
   * Discover locally running databases (on localhost or Docker)
   * Scans common database ports and detects Docker containers
   */
  async discoverDatabases(): Promise<DiscoveredDatabase[]> {
    try {
      const result = await bridgeRequest("db.discover", {});
      return result?.data || [];
    } catch (error: any) {
      console.error("Failed to discover databases:", error);
      return []; // Return empty array on error, don't throw
    }
  }

  // ------------------------------------
  // 6. PROJECT METHODS (project.*)
  // ------------------------------------

  /**
   * List all projects
   */
  async listProjects(): Promise<ProjectSummary[]> {
    try {
      const result = await bridgeRequest("project.list", {});
      return result?.data || [];
    } catch (error: any) {
      console.error("Failed to list projects:", error);
      throw new Error(`Failed to list projects: ${error.message}`);
    }
  }

  /**
   * Get a single project by ID
   */
  async getProject(projectId: string): Promise<ProjectMetadata | null> {
    try {
      if (!projectId) throw new Error("Project ID is required");
      const result = await bridgeRequest("project.get", { id: projectId });
      return result?.data || null;
    } catch (error: any) {
      console.error("Failed to get project:", error);
      throw new Error(`Failed to get project: ${error.message}`);
    }
  }

  /**
   * Find a project linked to a specific database connection.
   * Returns null when no project is linked (not an error).
   */
  async getProjectByDatabaseId(databaseId: string): Promise<ProjectMetadata | null> {
    try {
      if (!databaseId) throw new Error("Database ID is required");
      const result = await bridgeRequest("project.getByDatabaseId", { databaseId });
      return result?.data || null;
    } catch (error: any) {
      console.error("Failed to get project by database ID:", error);
      throw new Error(`Failed to get project by database ID: ${error.message}`);
    }
  }

  /**
   * Create a new project linked to a database connection
   */
  async createProject(params: CreateProjectParams): Promise<ProjectMetadata> {
    try {
      if (!params.databaseId || !params.name) {
        throw new Error("databaseId and name are required");
      }
      const result = await bridgeRequest("project.create", params);
      if (!result?.data) throw new Error("Failed to create project");
      return result.data;
    } catch (error: any) {
      console.error("Failed to create project:", error);
      throw new Error(`Failed to create project: ${error.message}`);
    }
  }

  /**
   * Update a project's metadata
   */
  async updateProject(params: UpdateProjectParams): Promise<ProjectMetadata> {
    try {
      if (!params.id) throw new Error("Project ID is required");
      const result = await bridgeRequest("project.update", params);
      if (!result?.data) throw new Error("Project not found");
      return result.data;
    } catch (error: any) {
      console.error("Failed to update project:", error);
      throw new Error(`Failed to update project: ${error.message}`);
    }
  }

  /**
   * Delete a project and all its files
   */
  async deleteProject(projectId: string): Promise<void> {
    try {
      if (!projectId) throw new Error("Project ID is required");
      await bridgeRequest("project.delete", { id: projectId });
    } catch (error: any) {
      console.error("Failed to delete project:", error);
      throw new Error(`Failed to delete project: ${error.message}`);
    }
  }

  /**
   * Get cached schema for a project
   */
  async getProjectSchema(projectId: string): Promise<SchemaFile | null> {
    try {
      if (!projectId) throw new Error("Project ID is required");
      const result = await bridgeRequest("project.getSchema", { projectId });
      return result?.data || null;
    } catch (error: any) {
      console.error("Failed to get project schema:", error);
      throw new Error(`Failed to get project schema: ${error.message}`);
    }
  }

  /**
   * Save/cache schema data for a project
   */
  async saveProjectSchema(projectId: string, schemas: SchemaSnapshot[]): Promise<SchemaFile> {
    try {
      if (!projectId || !schemas) throw new Error("projectId and schemas are required");
      const result = await bridgeRequest("project.saveSchema", { projectId, schemas });
      return result?.data;
    } catch (error: any) {
      console.error("Failed to save project schema:", error);
      throw new Error(`Failed to save project schema: ${error.message}`);
    }
  }

  /**
   * Get ER diagram layout for a project
   */
  async getProjectERDiagram(projectId: string): Promise<ERDiagramFile | null> {
    try {
      if (!projectId) throw new Error("Project ID is required");
      const result = await bridgeRequest("project.getERDiagram", { projectId });
      return result?.data || null;
    } catch (error: any) {
      console.error("Failed to get ER diagram:", error);
      throw new Error(`Failed to get ER diagram: ${error.message}`);
    }
  }

  /**
   * Save ER diagram layout for a project
   */
  async saveProjectERDiagram(
    projectId: string,
    data: { nodes: ERNode[]; zoom?: number; panX?: number; panY?: number }
  ): Promise<ERDiagramFile> {
    try {
      if (!projectId || !data.nodes) throw new Error("projectId and nodes are required");
      const result = await bridgeRequest("project.saveERDiagram", { projectId, ...data });
      return result?.data;
    } catch (error: any) {
      console.error("Failed to save ER diagram:", error);
      throw new Error(`Failed to save ER diagram: ${error.message}`);
    }
  }

  /**
   * Get saved queries for a project
   */
  async getProjectQueries(projectId: string): Promise<QueriesFile | null> {
    try {
      if (!projectId) throw new Error("Project ID is required");
      const result = await bridgeRequest("project.getQueries", { projectId });
      return result?.data || null;
    } catch (error: any) {
      console.error("Failed to get project queries:", error);
      throw new Error(`Failed to get project queries: ${error.message}`);
    }
  }

  /**
   * Add a saved query to a project
   */
  async addProjectQuery(
    projectId: string,
    params: { name: string; sql: string; description?: string }
  ): Promise<SavedQuery> {
    try {
      if (!projectId || !params.name || !params.sql) {
        throw new Error("projectId, name, and sql are required");
      }
      const result = await bridgeRequest("project.addQuery", { projectId, ...params });
      return result?.data;
    } catch (error: any) {
      console.error("Failed to add project query:", error);
      throw new Error(`Failed to add project query: ${error.message}`);
    }
  }

  /**
   * Update a saved query in a project
   */
  async updateProjectQuery(
    projectId: string,
    queryId: string,
    updates: { name?: string; sql?: string; description?: string }
  ): Promise<SavedQuery> {
    try {
      if (!projectId || !queryId) throw new Error("projectId and queryId are required");
      const result = await bridgeRequest("project.updateQuery", { projectId, queryId, ...updates });
      if (!result?.data) throw new Error("Query not found");
      return result.data;
    } catch (error: any) {
      console.error("Failed to update project query:", error);
      throw new Error(`Failed to update project query: ${error.message}`);
    }
  }

  /**
   * Delete a saved query from a project
   */
  async deleteProjectQuery(projectId: string, queryId: string): Promise<void> {
    try {
      if (!projectId || !queryId) throw new Error("projectId and queryId are required");
      await bridgeRequest("project.deleteQuery", { projectId, queryId });
    } catch (error: any) {
      console.error("Failed to delete project query:", error);
      throw new Error(`Failed to delete project query: ${error.message}`);
    }
  }

  /**
   * Export full project bundle (metadata + schema + ER + queries)
   */
  async exportProject(projectId: string): Promise<ProjectExport | null> {
    try {
      if (!projectId) throw new Error("Project ID is required");
      const result = await bridgeRequest("project.export", { projectId });
      return result?.data || null;
    } catch (error: any) {
      console.error("Failed to export project:", error);
      throw new Error(`Failed to export project: ${error.message}`);
    }
  }

  /**
   * Get the filesystem directory path for a project
   */
  async getProjectDir(projectId: string): Promise<string | null> {
    try {
      if (!projectId) return null;
      const result = await bridgeRequest("project.getDir", { projectId });
      return result?.data?.dir || null;
    } catch (error: any) {
      console.error("Failed to get project dir:", error);
      return null;
    }
  }

  // ------------------------------------
  // 8. GIT OPERATIONS (git.*)
  // ------------------------------------

  /**
   * Get git repository status for a directory
   */
  async gitStatus(dir: string): Promise<GitStatus> {
    const result = await bridgeRequest("git.status", { dir });
    return result?.data;
  }

  /**
   * Initialize a new git repo in the given directory
   */
  async gitInit(dir: string, defaultBranch = "main"): Promise<GitStatus> {
    const result = await bridgeRequest("git.init", { dir, defaultBranch });
    return result?.data;
  }

  /**
   * Get list of changed files
   */
  async gitChanges(dir: string): Promise<GitFileChange[]> {
    const result = await bridgeRequest("git.changes", { dir });
    return result?.data || [];
  }

  /**
   * Stage specific files
   */
  async gitStage(dir: string, files: string[]): Promise<void> {
    await bridgeRequest("git.stage", { dir, files });
  }

  /**
   * Stage all changes
   */
  async gitStageAll(dir: string): Promise<void> {
    await bridgeRequest("git.stageAll", { dir });
  }

  /**
   * Unstage specific files
   */
  async gitUnstage(dir: string, files: string[]): Promise<void> {
    await bridgeRequest("git.unstage", { dir, files });
  }

  /**
   * Commit staged changes
   */
  async gitCommit(dir: string, message: string): Promise<{ hash: string }> {
    const result = await bridgeRequest("git.commit", { dir, message });
    return result?.data;
  }

  /**
   * Get recent commit history
   */
  async gitLog(dir: string, count = 20): Promise<GitLogEntry[]> {
    const result = await bridgeRequest("git.log", { dir, count });
    return result?.data || [];
  }

  /**
   * List all branches
   */
  async gitBranches(dir: string): Promise<GitBranchInfo[]> {
    const result = await bridgeRequest("git.branches", { dir });
    return result?.data || [];
  }

  /**
   * Create and checkout a new branch
   */
  async gitCreateBranch(dir: string, name: string): Promise<{ branch: string }> {
    const result = await bridgeRequest("git.createBranch", { dir, name });
    return result?.data;
  }

  /**
   * Checkout an existing branch
   */
  async gitCheckout(dir: string, name: string): Promise<{ branch: string }> {
    const result = await bridgeRequest("git.checkout", { dir, name });
    return result?.data;
  }

  /**
   * Discard unstaged changes for specific files
   */
  async gitDiscard(dir: string, files: string[]): Promise<void> {
    await bridgeRequest("git.discard", { dir, files });
  }

  /**
   * Stash all changes
   */
  async gitStash(dir: string, message?: string): Promise<void> {
    await bridgeRequest("git.stash", { dir, message });
  }

  /**
   * Pop latest stash
   */
  async gitStashPop(dir: string): Promise<void> {
    await bridgeRequest("git.stashPop", { dir });
  }

  /**
   * Get diff for a file (or all files)
   */
  async gitDiff(dir: string, file?: string, staged = false): Promise<string> {
    const result = await bridgeRequest("git.diff", { dir, file, staged });
    return result?.data?.diff || "";
  }

  /**
   * Ensure .gitignore has RelWave rules
   */
  async gitEnsureIgnore(dir: string): Promise<{ modified: boolean }> {
    const result = await bridgeRequest("git.ensureIgnore", { dir });
    return result?.data;
  }

  // ------------------------------------
  // 9. SCHEMA DIFF (schema.*)
  // ------------------------------------

  /**
   * Compute structured schema diff between two git refs.
   * Default: HEAD vs working tree.
   */
  async schemaDiff(
    projectId: string,
    fromRef = "HEAD",
    toRef?: string
  ): Promise<SchemaDiffResponse> {
    const result = await bridgeRequest("schema.diff", { projectId, fromRef, toRef });
    return result?.data;
  }

  /**
   * Get commit history for a project's schema.json file.
   */
  async schemaFileHistory(
    projectId: string,
    count = 20
  ): Promise<SchemaFileHistoryResponse> {
    const result = await bridgeRequest("schema.fileHistory", { projectId, count });
    return result?.data;
  }

  // ------------------------------------
  // 10. MIGRATION TIMELINE (timeline.*)
  // ------------------------------------

  /**
   * Get the migration timeline (commits that changed schema.json)
   */
  async timelineList(
    projectId: string,
    count = 50
  ): Promise<{ entries: TimelineEntry[] }> {
    const result = await bridgeRequest("timeline.list", { projectId, count });
    return result?.data;
  }

  /**
   * Get change summary for a specific commit in the timeline
   */
  async timelineCommitSummary(
    projectId: string,
    commitHash: string
  ): Promise<{ summary: TimelineChangeSummary | null }> {
    const result = await bridgeRequest("timeline.commitSummary", {
      projectId,
      commitHash,
    });
    return result?.data;
  }

  /**
   * Auto-commit the current schema snapshot with optional tag
   */
  async timelineAutoCommit(
    projectId: string,
    options?: { message?: string; tag?: string }
  ): Promise<AutoCommitResult> {
    const result = await bridgeRequest("timeline.autoCommit", {
      projectId,
      ...options,
    });
    return result?.data;
  }

  // ------------------------------------
  // 11. ENVIRONMENT (env.*)
  // ------------------------------------

  /**
   * Get environment config (branch → environment mappings)
   */
  async envGetConfig(projectId: string): Promise<EnvironmentConfig> {
    const result = await bridgeRequest("env.getConfig", { projectId });
    return result?.data;
  }

  /**
   * Replace the full environment config
   */
  async envSaveConfig(
    projectId: string,
    config: EnvironmentConfig
  ): Promise<EnvironmentConfig> {
    const result = await bridgeRequest("env.saveConfig", {
      projectId,
      config,
    });
    return result?.data;
  }

  /**
   * Add or update a single branch → environment mapping
   */
  async envSetMapping(
    projectId: string,
    mapping: EnvironmentMapping
  ): Promise<EnvironmentConfig> {
    const result = await bridgeRequest("env.setMapping", {
      projectId,
      mapping,
    });
    return result?.data;
  }

  /**
   * Remove a branch mapping
   */
  async envRemoveMapping(
    projectId: string,
    branch: string
  ): Promise<EnvironmentConfig> {
    const result = await bridgeRequest("env.removeMapping", {
      projectId,
      branch,
    });
    return result?.data;
  }

  /**
   * Resolve the current environment (based on active git branch)
   */
  async envResolve(projectId: string): Promise<ResolvedEnvironment> {
    const result = await bridgeRequest("env.resolve", { projectId });
    return result?.data;
  }

  // ------------------------------------
  // 12. CONFLICT DETECTION (conflict.*)
  // ------------------------------------

  /**
   * Detect schema conflicts between current branch and a target
   */
  async conflictDetect(
    projectId: string,
    targetBranch = "main"
  ): Promise<ConflictReport> {
    const result = await bridgeRequest("conflict.detect", {
      projectId,
      targetBranch,
    });
    return result?.data;
  }
}

// Export singleton instance
export const bridgeApi = new BridgeApiService();

// Export for testing or custom instances
export { BridgeApiService };
