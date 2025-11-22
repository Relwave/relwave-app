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

class BridgeApiService {
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
  async listTables(id: string): Promise<string[]> {
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
