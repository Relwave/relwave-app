import {
  AddDatabaseParams,
  ConnectionTestResult,
  CreateTableColumn,
  DatabaseConnection,
  DatabaseSchemaDetails,
  DatabaseStats,
  DiscoveredDatabase,
  MonitoringSnapshot,
  SSHConfig,
  UpdateDatabaseParams,
} from "@/features/database/types";
import {
  MongoCollectionInfo,
  MongoCollectionSchema,
  MongoCreateCollectionOptions,
  MongoMigrationManifest,
  MongoMigrationListResult,
  MongoMigrationValidateResult,
  MongoMigrationApplyResult,
  MongoMigrationRollbackResult,
  MongoMigrationGetStatusResult,
  MongoInferRelationshipsRequest,
  MongoInferRelationshipsResult,
  MongoListRelationshipsRequest,
  MongoListRelationshipsResult,
  MongoSetRelationshipStatusRequest,
  MongoSetRelationshipStatusResult,
  MongoSaveRelationshipRequest,
  MongoSaveRelationshipResult,
  MongoDeleteRelationshipRequest,
  MongoDeleteRelationshipResult,
  MongoBulkImportStartRequest,
  MongoBulkImportStartResult,
  MongoBulkImportChunkRequest,
  MongoBulkImportChunkResult,
  MongoBulkExportStartRequest,
  MongoBulkExportStartResult,
  MongoBulkGetOperationStatusRequest,
  MongoBulkOperationStatusResult,
  MongoBulkCancelRequest,
  MongoBulkCancelResult,
  MongoBulkCleanupRequest,
  MongoBulkCleanupResult,
  MongoBulkInsertRequest,
  MongoBulkInsertResult,
  MongoBulkUpdateRequest,
  MongoBulkUpdateResult,
  MongoBulkDeleteRequest,
  MongoBulkDeleteResult,
  MongoBulkExportSaveToRequest,
  MongoBulkExportSaveToResult,
} from "@/features/mongodb/types";
import { bridgeRequest } from "./bridgeClient";
import {
  databaseBridge,
  MongoIndexDirection,
  MongoIndexOptions,
  MongoIndexListResult,
  MongoIndexCreateResult,
  MongoIndexDropResult,
  MongoIndexStatsResult,
  MongoIndexHideResult,
} from "./databaseBridge";

class DatabaseService {
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
  async getMigrations(
    id: string,
  ): Promise<{ migrations: { local: any[]; applied: any[] }; baselined: boolean } | null> {
    try {
      const result = await bridgeRequest("query.connectToDatabase", { dbId: id });
      console.log(result);
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
      const isFileBasedDB = params.type === "sqlite" || params.type === "duckdb";
      const isClickHouse = params.type === "clickhouse";
      const isMongo = params.type === "mongodb";
      const required = isFileBasedDB
        ? ["name", "type", "database"]
        : isClickHouse
          ? ["name", "type"]
          : isMongo
            ? params.url
              ? ["name", "type"]
              : ["name", "type", "host", "port"]
            : ["name", "type", "host", "port", "user", "database"];
      for (const field of required) {
        if (!params[field as keyof AddDatabaseParams]) {
          throw new Error(`Missing required field: ${field}`);
        }
      }
      if (isClickHouse && !params.url && !params.host) {
        throw new Error("Missing required field: url");
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
      return result?.data || { ok: false, message: "Unknown error" };
    } catch (error: any) {
      if (error?.message && /enotfound|econnrefused|etimedout|offline/i.test(error.message)) {
        console.warn(`Database ${id} is offline: ${error.message}`);
        return { ok: false, message: error.message, status: "disconnected" };
      }
      console.error("Failed to test connection:", error);
      return { ok: false, message: error.message, status: "disconnected" };
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
      console.log(error);
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
    type?: string;
    ssh?: SSHConfig;
  }): Promise<ConnectionTestResult> {
    try {
      const result = await bridgeRequest("db.connectTest", { connection });
      return result?.data || { ok: false, message: "Unknown error" };
    } catch (error: any) {
      if (error?.message && /enotfound|econnrefused|etimedout|offline/i.test(error.message)) {
        console.warn(`Connection is offline: ${error.message}`);
        return { ok: false, message: error.message, status: "disconnected" };
      }
      console.error("Failed to test connection:", error);
      return { ok: false, message: error.message, status: "disconnected" };
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
      if (error?.message && /enotfound|econnrefused|etimedout|offline/i.test(error.message)) {
        console.warn(`Database ${id} is offline: ${error.message}`);
        return [];
      }
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
      if (error?.message && /enotfound|econnrefused|etimedout|offline/i.test(error.message)) {
        console.warn(`Database ${id} is offline: ${error.message}`);
        return [];
      }
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
      if (error?.message && /enotfound|econnrefused|etimedout|offline/i.test(error.message)) {
        console.warn(`Database ${id} is offline: ${error.message}`);
        return { tables: 0, rows: 0, sizeBytes: 0 };
      }
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

  async getMonitoringSnapshot(id: string): Promise<MonitoringSnapshot> {
    try {
      if (!id) {
        throw new Error("Database ID is required");
      }
      const result = await bridgeRequest("db.monitoringSnapshot", { id }, 15000);
      return result?.data;
    } catch (error: any) {
      console.error("Failed to get monitoring snapshot:", error);
      throw new Error(`Failed to get monitoring snapshot: ${error.message}`);
    }
  }

  async getMonitoringWebSocketInfo(): Promise<{ url: string; intervalMs: number }> {
    try {
      const result = await bridgeRequest("db.monitoringWsInfo", {}, 5000);
      return result?.data;
    } catch (error: any) {
      console.error("Failed to get monitoring WebSocket info:", error);
      throw new Error(`Failed to get monitoring WebSocket info: ${error.message}`);
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
      return (
        result?.primaryKeys?.[0]?.column_name ||
        result?.primaryKeys?.[0]?.COLUMN_NAME ||
        (typeof result?.primaryKeys?.[0] === "string" ? result.primaryKeys[0] : "") ||
        ""
      );
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
      console.log(result);
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
        throw new Error(
          "Database ID, schema name, table name, and primary key column are required.",
        );
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
      if (!params.primaryKeyColumn && typeof params.primaryKeyValue !== "object") {
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

  /**
   * List collections in a MongoDB database (db.listCollections)
   */
  async listMongoCollections(dbId: string): Promise<{ collections: MongoCollectionInfo[] }> {
    try {
      if (!dbId) throw new Error("Database ID is required");
      const result = await bridgeRequest("db.listCollections", { dbId });
      return result?.data || { collections: [] };
    } catch (error: any) {
      console.error("Failed to list MongoDB collections:", error);
      throw new Error(`Failed to list collections: ${error.message}`);
    }
  }

  /**
   * Get inferred schema for a MongoDB collection (db.getInferredSchema)
   */
  async getMongoInferredSchema(
    dbId: string,
    collection: string,
    sampleSize?: number,
    maxDepth?: number,
  ): Promise<MongoCollectionSchema> {
    try {
      if (!dbId || !collection) throw new Error("Database ID and collection name are required");
      const result = await bridgeRequest("db.getInferredSchema", {
        dbId,
        collection,
        sampleSize,
        maxDepth,
      });
      return result?.data;
    } catch (error: any) {
      console.error("Failed to get inferred MongoDB schema:", error);
      throw new Error(`Failed to get inferred schema: ${error.message}`);
    }
  }

  async createMongoCollection(
    dbId: string,
    collection: string,
    options?: MongoCreateCollectionOptions,
  ): Promise<{ ok: boolean; collection: string }> {
    try {
      if (!dbId || !collection) throw new Error("Database ID and collection name are required");
      const result = await bridgeRequest("db.createCollection", { dbId, collection, options });
      return result?.data;
    } catch (error: any) {
      console.error("Failed to create MongoDB collection:", error);
      throw new Error(`Failed to create MongoDB collection: ${error.message}`);
    }
  }

  async dropMongoCollection(
    dbId: string,
    collection: string,
  ): Promise<{ ok: boolean; collection: string }> {
    try {
      if (!dbId || !collection) throw new Error("Database ID and collection name are required");
      const result = await bridgeRequest("db.dropCollection", { dbId, collection });
      return result?.data;
    } catch (error: any) {
      console.error("Failed to drop MongoDB collection:", error);
      throw new Error(`Failed to drop MongoDB collection: ${error.message}`);
    }
  }

  // ------------------------------------
  // MONGO INDEX MANAGEMENT METHODS (index.*)
  // ------------------------------------

  /**
   * List secondary indexes in a MongoDB collection (index.list)
   */
  async listMongoIndexes(dbId: string, collection: string): Promise<MongoIndexListResult> {
    return databaseBridge.listIndexes(dbId, collection);
  }

  /**
   * Create a secondary index in a MongoDB collection (index.create)
   */
  async createMongoIndex(
    dbId: string,
    collection: string,
    key: Record<string, MongoIndexDirection>,
    options?: MongoIndexOptions,
  ): Promise<MongoIndexCreateResult> {
    return databaseBridge.createIndex(dbId, collection, key, options);
  }

  /**
   * Drop a secondary index in a MongoDB collection (index.drop)
   */
  async dropMongoIndex(
    dbId: string,
    collection: string,
    indexName: string,
  ): Promise<MongoIndexDropResult> {
    return databaseBridge.dropIndex(dbId, collection, indexName);
  }

  /**
   * Get index usage statistics for a MongoDB collection (index.getStats)
   */
  async getMongoIndexStats(dbId: string, collection: string): Promise<MongoIndexStatsResult> {
    return databaseBridge.getIndexStats(dbId, collection);
  }

  /**
   * Toggle index visibility in a MongoDB collection (index.hide)
   */
  async hideMongoIndex(
    dbId: string,
    collection: string,
    indexName: string,
    hidden: boolean,
  ): Promise<MongoIndexHideResult> {
    return databaseBridge.hideIndex(dbId, collection, indexName, hidden);
  }

  // ------------------------------------
  // MongoDB Migration Engine Methods
  // ------------------------------------

  /**
   * List applied and pending MongoDB migrations and lock state (migration.list)
   */
  async listMongoMigrations(dbId: string, projectRoot?: string): Promise<MongoMigrationListResult> {
    return databaseBridge.listMongoMigrations(dbId, projectRoot);
  }

  /**
   * Statically validate a MongoDB migration manifest (migration.validate)
   */
  async validateMongoMigration(
    manifest: MongoMigrationManifest,
    dbId?: string,
  ): Promise<MongoMigrationValidateResult> {
    return databaseBridge.validateMongoMigration(manifest, dbId);
  }

  /**
   * Apply pending MongoDB migration(s) (migration.apply)
   */
  async applyMongoMigration(
    dbId: string,
    options?: { version?: string; dryRun?: boolean; projectRoot?: string; ownerId?: string },
  ): Promise<MongoMigrationApplyResult> {
    return databaseBridge.applyMongoMigration(dbId, options);
  }

  /**
   * Rollback an applied MongoDB migration via inverse compensation (migration.rollback)
   */
  async rollbackMongoMigration(
    dbId: string,
    version: string,
    options?: { force?: boolean; projectRoot?: string; ownerId?: string },
  ): Promise<MongoMigrationRollbackResult> {
    return databaseBridge.rollbackMongoMigration(dbId, version, options);
  }

  /**
   * Get MongoDB migration status, lock details, and audit events (migration.getStatus)
   */
  async getMongoMigrationStatus(
    dbId: string,
    migrationId?: string,
  ): Promise<MongoMigrationGetStatusResult> {
    return databaseBridge.getMongoMigrationStatus(dbId, migrationId);
  }

  // ------------------------------------
  // MongoDB Relationship Engine Methods
  // ------------------------------------

  async inferMongoRelationships(
    request: MongoInferRelationshipsRequest,
  ): Promise<MongoInferRelationshipsResult> {
    return databaseBridge.inferMongoRelationships(request);
  }

  async listMongoRelationships(
    request: MongoListRelationshipsRequest,
  ): Promise<MongoListRelationshipsResult> {
    return databaseBridge.listMongoRelationships(request);
  }

  async setMongoRelationshipStatus(
    request: MongoSetRelationshipStatusRequest,
  ): Promise<MongoSetRelationshipStatusResult> {
    return databaseBridge.setMongoRelationshipStatus(request);
  }

  async saveMongoRelationship(
    request: MongoSaveRelationshipRequest,
  ): Promise<MongoSaveRelationshipResult> {
    return databaseBridge.saveMongoRelationship(request);
  }

  async deleteMongoRelationship(
    request: MongoDeleteRelationshipRequest,
  ): Promise<MongoDeleteRelationshipResult> {
    return databaseBridge.deleteMongoRelationship(request);
  }

  // ------------------------------------
  // MongoDB Bulk Operations Engine Methods
  // ------------------------------------

  async startMongoBulkImport(
    request: MongoBulkImportStartRequest,
  ): Promise<MongoBulkImportStartResult> {
    return databaseBridge.startMongoBulkImport(request);
  }

  async importMongoBulkChunk(
    request: MongoBulkImportChunkRequest,
  ): Promise<MongoBulkImportChunkResult> {
    return databaseBridge.importMongoBulkChunk(request);
  }

  async startMongoBulkExport(
    request: MongoBulkExportStartRequest,
  ): Promise<MongoBulkExportStartResult> {
    return databaseBridge.startMongoBulkExport(request);
  }

  async getMongoBulkOperationStatus(
    request: MongoBulkGetOperationStatusRequest,
  ): Promise<MongoBulkOperationStatusResult> {
    return databaseBridge.getMongoBulkOperationStatus(request);
  }

  async cancelMongoBulkOperation(request: MongoBulkCancelRequest): Promise<MongoBulkCancelResult> {
    return databaseBridge.cancelMongoBulkOperation(request);
  }

  async cleanupMongoBulkOperation(
    request: MongoBulkCleanupRequest,
  ): Promise<MongoBulkCleanupResult> {
    return databaseBridge.cleanupMongoBulkOperation(request);
  }

  async bulkInsertMongoDocuments(request: MongoBulkInsertRequest): Promise<MongoBulkInsertResult> {
    return databaseBridge.bulkInsertMongoDocuments(request);
  }

  async bulkUpdateMongoDocuments(request: MongoBulkUpdateRequest): Promise<MongoBulkUpdateResult> {
    return databaseBridge.bulkUpdateMongoDocuments(request);
  }

  async bulkDeleteMongoDocuments(request: MongoBulkDeleteRequest): Promise<MongoBulkDeleteResult> {
    return databaseBridge.bulkDeleteMongoDocuments(request);
  }

  async saveMongoBulkExportTo(
    request: MongoBulkExportSaveToRequest,
  ): Promise<MongoBulkExportSaveToResult> {
    return databaseBridge.saveMongoBulkExportTo(request);
  }
}

export const databaseService = new DatabaseService();
