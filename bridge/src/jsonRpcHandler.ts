import { Rpc } from "./types";
import { SessionManager } from "./sessionManager";
import { DatabaseService } from "./services/databaseService";
import { QueryExecutor } from "./services/queryExecutor";
import { QueryHandlers } from "./handlers/queryHandlers";
import { DatabaseHandlers } from "./handlers/databaseHandlers";
import { SessionHandlers } from "./handlers/sessionHandlers";
import { StatsHandlers } from "./handlers/statsHandlers";
import { MigrationHandlers } from "./handlers/migrationHandlers";
import { ProjectHandlers } from "./handlers/projectHandlers";
import { GitHandlers } from "./handlers/gitHandlers";
import { GitAdvancedHandlers } from "./handlers/gitAdvancedHandlers";
import { discoveryService } from "./services/discoveryService";
import { Logger } from "pino";

/**
 * Main entry point for registering all RPC handlers
 * @param rpc - RPC interface for sending responses/errors
 * @param logger - Logger instance
 * @param sessions - Session manager instance
 */
export function registerDbHandlers(
  rpc: Rpc,
  logger: Logger,
  sessions: SessionManager
) {
  // Initialize services
  const dbService = new DatabaseService();
  const queryExecutor = new QueryExecutor();

  // Initialize handlers with dependencies
  const sessionHandlers = new SessionHandlers(rpc, logger, sessions);
  const queryHandlers = new QueryHandlers(
    rpc,
    logger,
    sessions,
    dbService,
    queryExecutor
  );
  const databaseHandlers = new DatabaseHandlers(
    rpc,
    logger,
    dbService,
    queryExecutor
  );
  const statsHandlers = new StatsHandlers(
    rpc,
    logger,
    dbService,
    queryExecutor
  );
  const migrationHandlers = new MigrationHandlers(
    rpc,
    logger,
    dbService,
    queryExecutor
  );
  const projectHandlers = new ProjectHandlers(rpc, logger);
  const gitHandlers = new GitHandlers(rpc, logger);
  const gitAdvancedHandlers = new GitAdvancedHandlers(rpc, logger);

  // ==========================================
  // SESSION MANAGEMENT HANDLERS
  // ==========================================
  rpcRegister("query.createSession", (p, id) =>
    sessionHandlers.handleCreateSession(p, id)
  );
  rpcRegister("query.cancel", (p, id) =>
    sessionHandlers.handleCancelSession(p, id)
  );
  rpcRegister("query.getSession", (p, id) =>
    sessionHandlers.handleGetSession(p, id)
  );
  rpcRegister("query.listSessions", (p, id) =>
    sessionHandlers.handleListSessions(p, id)
  );
  rpcRegister("query.destroySession", (p, id) =>
    sessionHandlers.handleDestroySession(p, id)
  );

  // ==========================================
  // QUERY HANDLERS
  // ==========================================
  rpcRegister("query.run", (p, id) => queryHandlers.handleQueryRun(p, id));
  rpcRegister("query.fetchTableData", (p, id) =>
    queryHandlers.handleFetchTableData(p, id)
  );
  rpcRegister("query.listPrimaryKeys", (p, id) =>
    queryHandlers.handleFetchPrimaryKeys(p, id)
  );
  rpcRegister("query.createTable", (p, id) =>
    queryHandlers.handleCreateTable(p, id)
  );
  rpcRegister("query.createIndexes", (p, id) =>
    queryHandlers.handleCreateIndexes(p, id)
  );
  rpcRegister("query.dropTable", (p, id) =>
    queryHandlers.handleDropTable(p, id)
  );
  rpcRegister("query.alterTable", (p, id) =>
    queryHandlers.handleAlterTable(p, id)
  );
  rpcRegister("query.connectToDatabase", (p, id) =>
    queryHandlers.connectToDatabase(p, id)
  );
  rpcRegister("query.insertRow", (p, id) =>
    queryHandlers.handleInsertRow(p, id)
  );
  rpcRegister("query.updateRow", (p, id) =>
    queryHandlers.handleUpdateRow(p, id)
  );
  rpcRegister("query.deleteRow", (p, id) =>
    queryHandlers.handleDeleteRow(p, id)
  );
  rpcRegister("query.searchTable", (p, id) =>
    queryHandlers.handleSearchTable(p, id)
  );

  // ==========================================
  // DATABASE CRUD HANDLERS
  // ==========================================
  rpcRegister("db.list", (p, id) =>
    databaseHandlers.handleListDatabases(p, id)
  );
  rpcRegister("db.get", (p, id) => databaseHandlers.handleGetDatabase(p, id));
  rpcRegister("db.add", (p, id) => databaseHandlers.handleAddDatabase(p, id));
  rpcRegister("db.delete", (p, id) => databaseHandlers.handleDeleteDatabase(p, id));
  rpcRegister("db.connectTest", (p, id) => databaseHandlers.handleTestConnection(p, id));
  rpcRegister("db.touch", (p, id) => databaseHandlers.handleTouchDatabase(p, id));

  // ==========================================
  // DATABASE METADATA HANDLERS
  // ==========================================
  rpcRegister("db.listTables", (p, id) =>
    databaseHandlers.handleListTables(p, id)
  );
  rpcRegister("db.getSchema", (p, id) =>
    databaseHandlers.handleGetSchema(p, id)
  );
  rpcRegister("db.listSchemas", (p, id) =>
    databaseHandlers.handleListSchemas(p, id)
  );

  // ==========================================
  // MIGRATION HANDLERS
  // ==========================================
  rpcRegister("migration.generateCreate", (p, id) =>
    migrationHandlers.handleGenerateCreateMigration(p, id)
  );
  rpcRegister("migration.generateAlter", (p, id) =>
    migrationHandlers.handleGenerateAlterMigration(p, id)
  );
  rpcRegister("migration.generateDrop", (p, id) =>
    migrationHandlers.handleGenerateDropMigration(p, id)
  );
  rpcRegister("migration.apply", (p, id) =>
    migrationHandlers.handleApplyMigration(p, id)
  );
  rpcRegister("migration.rollback", (p, id) =>
    migrationHandlers.handleRollbackMigration(p, id)
  );
  rpcRegister("migration.delete", (p, id) =>
    migrationHandlers.handleDeleteMigration(p, id)
  );
  rpcRegister("migration.getSQL", (p, id) =>
    migrationHandlers.handleGetMigrationSQL(p, id)
  );

  // ==========================================
  // STATISTICS HANDLERS
  // ==========================================
  rpcRegister("db.getStats", (p, id) => statsHandlers.handleGetStats(p, id));
  rpcRegister("db.getTotalStats", (p, id) =>
    statsHandlers.handleGetTotalStats(p, id)
  );

  // ==========================================
  // PROJECT HANDLERS
  // ==========================================
  rpcRegister("project.list", (p, id) =>
    projectHandlers.handleListProjects(p, id)
  );
  rpcRegister("project.get", (p, id) =>
    projectHandlers.handleGetProject(p, id)
  );
  rpcRegister("project.getByDatabaseId", (p, id) =>
    projectHandlers.handleGetProjectByDatabaseId(p, id)
  );
  rpcRegister("project.create", (p, id) =>
    projectHandlers.handleCreateProject(p, id)
  );
  rpcRegister("project.update", (p, id) =>
    projectHandlers.handleUpdateProject(p, id)
  );
  rpcRegister("project.delete", (p, id) =>
    projectHandlers.handleDeleteProject(p, id)
  );
  rpcRegister("project.getSchema", (p, id) =>
    projectHandlers.handleGetSchema(p, id)
  );
  rpcRegister("project.saveSchema", (p, id) =>
    projectHandlers.handleSaveSchema(p, id)
  );
  rpcRegister("project.getERDiagram", (p, id) =>
    projectHandlers.handleGetERDiagram(p, id)
  );
  rpcRegister("project.saveERDiagram", (p, id) =>
    projectHandlers.handleSaveERDiagram(p, id)
  );
  rpcRegister("project.getQueries", (p, id) =>
    projectHandlers.handleGetQueries(p, id)
  );
  rpcRegister("project.addQuery", (p, id) =>
    projectHandlers.handleAddQuery(p, id)
  );
  rpcRegister("project.updateQuery", (p, id) =>
    projectHandlers.handleUpdateQuery(p, id)
  );
  rpcRegister("project.deleteQuery", (p, id) =>
    projectHandlers.handleDeleteQuery(p, id)
  );
  rpcRegister("project.export", (p, id) =>
    projectHandlers.handleExportProject(p, id)
  );
  rpcRegister("project.getDir", (p, id) =>
    projectHandlers.handleGetProjectDir(p, id)
  );
  rpcRegister("project.getLocalConfig", (p, id) =>
    projectHandlers.handleGetLocalConfig(p, id)
  );
  rpcRegister("project.saveLocalConfig", (p, id) =>
    projectHandlers.handleSaveLocalConfig(p, id)
  );
  rpcRegister("project.ensureGitignore", (p, id) =>
    projectHandlers.handleEnsureGitignore(p, id)
  );
  rpcRegister("project.scanImport", (p, id) =>
    projectHandlers.handleScanImport(p, id)
  );
  rpcRegister("project.import", (p, id) =>
    projectHandlers.handleImportProject(p, id)
  );
  rpcRegister("project.linkDatabase", (p, id) =>
    projectHandlers.handleLinkDatabase(p, id)
  );

  // ==========================================
  // GIT HANDLERS
  // ==========================================
  rpcRegister("git.status", (p, id) => gitHandlers.handleStatus(p, id));
  rpcRegister("git.init", (p, id) => gitHandlers.handleInit(p, id));
  rpcRegister("git.changes", (p, id) => gitHandlers.handleChanges(p, id));
  rpcRegister("git.stage", (p, id) => gitHandlers.handleStage(p, id));
  rpcRegister("git.stageAll", (p, id) => gitHandlers.handleStageAll(p, id));
  rpcRegister("git.unstage", (p, id) => gitHandlers.handleUnstage(p, id));
  rpcRegister("git.commit", (p, id) => gitHandlers.handleCommit(p, id));
  rpcRegister("git.log", (p, id) => gitHandlers.handleLog(p, id));
  rpcRegister("git.branches", (p, id) => gitHandlers.handleBranches(p, id));
  rpcRegister("git.createBranch", (p, id) => gitHandlers.handleCreateBranch(p, id));
  rpcRegister("git.checkout", (p, id) => gitHandlers.handleCheckout(p, id));
  rpcRegister("git.discard", (p, id) => gitHandlers.handleDiscard(p, id));
  rpcRegister("git.stash", (p, id) => gitHandlers.handleStash(p, id));
  rpcRegister("git.stashPop", (p, id) => gitHandlers.handleStashPop(p, id));
  rpcRegister("git.diff", (p, id) => gitHandlers.handleDiff(p, id));
  rpcRegister("git.ensureIgnore", (p, id) => gitHandlers.handleEnsureIgnore(p, id));

  // ==========================================
  // GIT ADVANCED HANDLERS
  // ==========================================

  // Remote management
  rpcRegister("git.remoteList", (p, id) => gitAdvancedHandlers.handleRemoteList(p, id));
  rpcRegister("git.remoteAdd", (p, id) => gitAdvancedHandlers.handleRemoteAdd(p, id));
  rpcRegister("git.remoteRemove", (p, id) => gitAdvancedHandlers.handleRemoteRemove(p, id));
  rpcRegister("git.remoteGetUrl", (p, id) => gitAdvancedHandlers.handleRemoteGetUrl(p, id));
  rpcRegister("git.remoteSetUrl", (p, id) => gitAdvancedHandlers.handleRemoteSetUrl(p, id));

  // Push / Pull / Fetch
  rpcRegister("git.push", (p, id) => gitAdvancedHandlers.handlePush(p, id));
  rpcRegister("git.pull", (p, id) => gitAdvancedHandlers.handlePull(p, id));
  rpcRegister("git.fetch", (p, id) => gitAdvancedHandlers.handleFetch(p, id));

  // Rollback
  rpcRegister("git.revert", (p, id) => gitAdvancedHandlers.handleRevert(p, id));

  // ==========================================
  // DATABASE DISCOVERY HANDLERS
  // ==========================================
  rpcRegister("db.discover", async (_p, id) => {
    try {
      const discovered = await discoveryService.discoverLocalDatabases();
      rpc.sendResponse(id, { ok: true, data: discovered });
    } catch (error: any) {
      rpc.sendError(id, { code: "DISCOVERY_ERROR", message: error.message });
    }
  });

  logger?.info("All RPC handlers registered successfully");
}

/**
 * Helper function to register RPC methods
 * Uses global rpcRegister if available, otherwise stores in global handlers map
 */
function rpcRegister(
  method: string,
  fn: (params: any, id: number | string) => Promise<void> | void
) {
  if (
    (globalThis as any).rpcRegister &&
    typeof (globalThis as any).rpcRegister === "function"
  ) {
    (globalThis as any).rpcRegister(method, fn);
  } else {
    (globalThis as any).rpcHandlers = (globalThis as any).rpcHandlers || {};
    (globalThis as any).rpcHandlers[method] = fn;
  }
}

// Export for testing and external use
export { rpcRegister };
