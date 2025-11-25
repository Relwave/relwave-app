import { bridgeRequest } from "./bridgeClient";

export type DatabaseType = "postgresql" | "mysql" | "mongodb" | "sqlite";

export interface DatabaseConnection {
  id: string;
  name: string;
  type: string;
  host: string;
  port: number;
  user: string;
  database: string;
  tags?: string[];
  notes?: string;
  createdAt: string;
  updatedAt: string;
  credentialId?: string;
}

export interface AddDatabaseParams {
  name: string;
  type: string;
  host: string;
  port: number;
  user: string;
  database: string;
  password?: string;
  notes?: string;
  tags?: string[];
  ssl?: boolean;
  sslmode?: string;
}

export interface UpdateDatabaseParams {
  id: string;
  name?: string;
  host?: string;
  port?: number;
  user?: string;
  database?: string;
  password?: string;
  notes?: string;
  tags?: string[];
}

export interface ConnectionTestResult {
  ok: boolean;
  message?: string;
}

// --- NEW INTERFACES FOR QUERY/SESSION HANDLING ---

export interface TableRow extends Record<string, any> {}

export interface TableColumn {
  name: string;
  // Add other metadata fields as needed (e.g., dataType, nullable)
}

// Interface for initiating a query
export interface RunQueryParams {
  sessionId: string;
  dbId: string;
  sql: string;
  batchSize?: number;
}

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
   * Fetches all data (SELECT *) from a specific table in a database.
   * NOTE: This is for smaller tables. Large tables should use query.run streaming.
   * @param dbId - The ID of the database connection to use.
   * @param schemaName - The schema containing the table (e.g., 'public').
   * @param tableName - The name of the table.
   * @returns An array of rows (objects).
   */
  async fetchTableData(
    dbId: string,
    schemaName: string,
    tableName: string
  ): Promise<TableRow[]> {
    try {
      if (!dbId || !schemaName || !tableName) {
        throw new Error("Database ID, schema, and table name are required.");
      }
      const result = await bridgeRequest("query.fetchTableData", {
        dbId,
        schemaName,
        tableName,
      });
      return result?.data || [];
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
      console.log("Adding database with params:", params);
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
      return result?.data || { ok: false, message: "Unknown error" };
    } catch (error: any) {
      console.error("Failed to test connection:", error);
      return { ok: false, message: error.message };
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
      return { ok: false, message: error.message };
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
