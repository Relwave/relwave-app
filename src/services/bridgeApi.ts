import {
  AddDatabaseParams,
  ConnectionTestResult,
  CreateTableColumn,
  DatabaseConnection,
  DatabaseSchemaDetails,
  DatabaseStats,
  DiscoveredDatabase,
  RunQueryParams,
  TableRow,
  UpdateDatabaseParams
} from '@/features/database/types';
import {
  GitStatus,
  GitFileChange,
  GitLogEntry,
  GitBranchInfo,
  GitRemoteInfo,
  GitPushPullResult
} from "@/features/git/types";
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

  // ------------------------------------
  // 13. GIT REMOTE OPERATIONS
  // ------------------------------------

  /** List all configured remotes */
  async gitRemoteList(dir: string): Promise<GitRemoteInfo[]> {
    const result = await bridgeRequest("git.remoteList", { dir });
    return result?.data || [];
  }

  /** Add a named remote */
  async gitRemoteAdd(dir: string, name: string, url: string): Promise<void> {
    await bridgeRequest("git.remoteAdd", { dir, name, url });
  }

  /** Remove a named remote */
  async gitRemoteRemove(dir: string, name: string): Promise<void> {
    await bridgeRequest("git.remoteRemove", { dir, name });
  }

  /** Get the URL of a remote */
  async gitRemoteGetUrl(dir: string, name = "origin"): Promise<string | null> {
    const result = await bridgeRequest("git.remoteGetUrl", { dir, name });
    return result?.data?.url || null;
  }

  /** Change the URL of an existing remote */
  async gitRemoteSetUrl(dir: string, name: string, url: string): Promise<void> {
    await bridgeRequest("git.remoteSetUrl", { dir, name, url });
  }

  // ------------------------------------
  // 14. GIT PUSH / PULL / FETCH (P3)
  // ------------------------------------

  /** Push commits to a remote */
  async gitPush(
    dir: string,
    remote = "origin",
    branch?: string,
    options?: { force?: boolean; setUpstream?: boolean }
  ): Promise<GitPushPullResult> {
    const result = await bridgeRequest("git.push", { dir, remote, branch, ...options });
    return result?.data || { output: "" };
  }

  /** Pull from a remote */
  async gitPull(
    dir: string,
    remote = "origin",
    branch?: string,
    options?: { rebase?: boolean }
  ): Promise<GitPushPullResult> {
    const result = await bridgeRequest("git.pull", { dir, remote, branch, ...options });
    return result?.data || { output: "" };
  }

  /** Fetch from a remote (or all) */
  async gitFetch(
    dir: string,
    remote?: string,
    options?: { prune?: boolean; all?: boolean }
  ): Promise<GitPushPullResult> {
    const result = await bridgeRequest("git.fetch", { dir, remote, ...options });
    return result?.data || { output: "" };
  }

  // ------------------------------------
  // 15. GIT REVERT (Rollback)
  // ------------------------------------

  /** Revert a specific commit */
  async gitRevert(dir: string, hash: string, noCommit = false): Promise<GitPushPullResult> {
    const result = await bridgeRequest("git.revert", { dir, hash, noCommit });
    return result?.data || { output: "" };
  }
}

// Export singleton instance
export const bridgeApi = new BridgeApiService();

// Export for testing or custom instances
export { BridgeApiService };
