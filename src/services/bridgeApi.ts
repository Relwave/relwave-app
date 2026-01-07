import { AddDatabaseParams, ColumnDetails, ConnectionTestResult, CreateTableColumn, DatabaseConnection, DatabaseSchemaDetails, DatabaseStats, RunQueryParams, TableRow, UpdateDatabaseParams } from "@/types/database";
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
  async listTables(id: string): Promise<any[]> {
    // Changed return type to any[] to match typical result shape [{schema, name, type}]
    try {
      if (!id) {
        throw new Error("Database ID is required");
      }

      const result = await bridgeRequest("db.listTables", { id });
      return result?.data || [];
    } catch (error: any) {
      console.error("Failed to list tables:", error);
      throw new Error(`Failed to list tables: ${error.message}`);
    }
  }

  async getDatabaseStats(id: string): Promise<DatabaseStats | {}> {
    try {
      if (!id) {
        throw new Error("Database ID is required");
      }
      const result = await bridgeRequest("db.getStats", { id });
      return result?.data || {};
    } catch (error: any) {
      console.error("Failed to get database stats:", error);
      throw new Error(`Failed to get database stats: ${error.message}`);
    }
  }

  /**
   * Alias for getDatabaseStats - used by useDbQueries hook
   */
  async getDBStats(id: string): Promise<DatabaseStats | {}> {
    return this.getDatabaseStats(id);
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
}

// Export singleton instance
export const bridgeApi = new BridgeApiService();

// Export for testing or custom instances
export { BridgeApiService };
