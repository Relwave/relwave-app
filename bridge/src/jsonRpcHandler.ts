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
  rpcRegister(rpc, "query.createSession", (p, id) =>
    sessionHandlers.handleCreateSession(p, id)
  );
  rpcRegister(rpc, "query.cancel", (p, id) =>
    sessionHandlers.handleCancelSession(p, id)
  );
  rpcRegister(rpc, "query.getSession", (p, id) =>
    sessionHandlers.handleGetSession(p, id)
  );
  rpcRegister(rpc, "query.listSessions", (p, id) =>
    sessionHandlers.handleListSessions(p, id)
  );
  rpcRegister(rpc, "query.destroySession", (p, id) =>
    sessionHandlers.handleDestroySession(p, id)
  );

  // ==========================================
  // QUERY HANDLERS
  // ==========================================
  rpcRegister(rpc, "query.run", (p, id) => queryHandlers.handleQueryRun(p, id));
  rpcRegister(rpc, "query.fetchTableData", (p, id) =>
    queryHandlers.handleFetchTableData(p, id)
  );
  rpcRegister(rpc, "query.listPrimaryKeys", (p, id) =>
    queryHandlers.handleFetchPrimaryKeys(p, id)
  );
  rpcRegister(rpc, "query.createTable", (p, id) =>
    queryHandlers.handleCreateTable(p, id)
  );
  rpcRegister(rpc, "query.createIndexes", (p, id) =>
    queryHandlers.handleCreateIndexes(p, id)
  );
  rpcRegister(rpc, "query.dropTable", (p, id) =>
    queryHandlers.handleDropTable(p, id)
  );
  rpcRegister(rpc, "query.alterTable", (p, id) =>
    queryHandlers.handleAlterTable(p, id)
  );
  rpcRegister(rpc, "query.connectToDatabase", (p, id) =>
    queryHandlers.connectToDatabase(p, id)
  );
  rpcRegister(rpc, "query.insertRow", (p, id) =>
    queryHandlers.handleInsertRow(p, id)
  );
  rpcRegister(rpc, "query.updateRow", (p, id) =>
    queryHandlers.handleUpdateRow(p, id)
  );
  rpcRegister(rpc, "query.deleteRow", (p, id) =>
    queryHandlers.handleDeleteRow(p, id)
  );
  rpcRegister(rpc, "query.searchTable", (p, id) =>
    queryHandlers.handleSearchTable(p, id)
  );

  // ==========================================
  // DATABASE CRUD HANDLERS
  // ==========================================
  rpcRegister(rpc, "db.list", (p, id) =>
    databaseHandlers.handleListDatabases(p, id)
  );
  rpcRegister(rpc, "db.get", (p, id) => databaseHandlers.handleGetDatabase(p, id));
  rpcRegister(rpc, "db.add", (p, id) => databaseHandlers.handleAddDatabase(p, id));
  rpcRegister(rpc, "db.delete", (p, id) => databaseHandlers.handleDeleteDatabase(p, id));
  rpcRegister(rpc, "db.connectTest", (p, id) => databaseHandlers.handleTestConnection(p, id));
  rpcRegister(rpc, "db.touch", (p, id) => databaseHandlers.handleTouchDatabase(p, id));

  // ==========================================
  // DATABASE METADATA HANDLERS
  // ==========================================
  rpcRegister(rpc, "db.listTables", (p, id) =>
    databaseHandlers.handleListTables(p, id)
  );
  rpcRegister(rpc, "db.getSchema", (p, id) =>
    databaseHandlers.handleGetSchema(p, id)
  );
  rpcRegister(rpc, "db.listSchemas", (p, id) =>
    databaseHandlers.handleListSchemas(p, id)
  );

  // ==========================================
  // MIGRATION HANDLERS
  // ==========================================
  rpcRegister(rpc, "migration.generateCreate", (p, id) =>
    migrationHandlers.handleGenerateCreateMigration(p, id)
  );
  rpcRegister(rpc, "migration.generateAlter", (p, id) =>
    migrationHandlers.handleGenerateAlterMigration(p, id)
  );
  rpcRegister(rpc, "migration.generateDrop", (p, id) =>
    migrationHandlers.handleGenerateDropMigration(p, id)
  );
  rpcRegister(rpc, "migration.apply", (p, id) =>
    migrationHandlers.handleApplyMigration(p, id)
  );
  rpcRegister(rpc, "migration.rollback", (p, id) =>
    migrationHandlers.handleRollbackMigration(p, id)
  );
  rpcRegister(rpc, "migration.delete", (p, id) =>
    migrationHandlers.handleDeleteMigration(p, id)
  );
  rpcRegister(rpc, "migration.getSQL", (p, id) =>
    migrationHandlers.handleGetMigrationSQL(p, id)
  );

  // ==========================================
  // STATISTICS HANDLERS
  // ==========================================
  rpcRegister(rpc, "db.getStats", (p, id) => statsHandlers.handleGetStats(p, id));
  rpcRegister(rpc, "db.getTotalStats", (p, id) =>
    statsHandlers.handleGetTotalStats(p, id)
  );

  // ==========================================
  // PROJECT HANDLERS
  // ==========================================
  rpcRegister(rpc, "project.list", (p, id) =>
    projectHandlers.handleListProjects(p, id)
  );
  rpcRegister(rpc, "project.get", (p, id) =>
    projectHandlers.handleGetProject(p, id)
  );
  rpcRegister(rpc, "project.getByDatabaseId", (p, id) =>
    projectHandlers.handleGetProjectByDatabaseId(p, id)
  );
  rpcRegister(rpc, "project.create", (p, id) =>
    projectHandlers.handleCreateProject(p, id)
  );
  rpcRegister(rpc, "project.update", (p, id) =>
    projectHandlers.handleUpdateProject(p, id)
  );
  rpcRegister(rpc, "project.delete", (p, id) =>
    projectHandlers.handleDeleteProject(p, id)
  );
  rpcRegister(rpc, "project.getSchema", (p, id) =>
    projectHandlers.handleGetSchema(p, id)
  );
  rpcRegister(rpc, "project.saveSchema", (p, id) =>
    projectHandlers.handleSaveSchema(p, id)
  );
  rpcRegister(rpc, "project.getERDiagram", (p, id) =>
    projectHandlers.handleGetERDiagram(p, id)
  );
  rpcRegister(rpc, "project.saveERDiagram", (p, id) =>
    projectHandlers.handleSaveERDiagram(p, id)
  );
  rpcRegister(rpc, "project.getAnnotations", (p, id) =>
    projectHandlers.handleGetAnnotations(p, id)
  );
  rpcRegister(rpc, "project.saveAnnotations", (p, id) =>
    projectHandlers.handleSaveAnnotations(p, id)
  );
  rpcRegister(rpc, "project.getQueries", (p, id) =>
    projectHandlers.handleGetQueries(p, id)
  );
  rpcRegister(rpc, "project.addQuery", (p, id) =>
    projectHandlers.handleAddQuery(p, id)
  );
  rpcRegister(rpc, "project.updateQuery", (p, id) =>
    projectHandlers.handleUpdateQuery(p, id)
  );
  rpcRegister(rpc, "project.deleteQuery", (p, id) =>
    projectHandlers.handleDeleteQuery(p, id)
  );
  rpcRegister(rpc, "project.export", (p, id) =>
    projectHandlers.handleExportProject(p, id)
  );
  rpcRegister(rpc, "project.getDir", (p, id) =>
    projectHandlers.handleGetProjectDir(p, id)
  );
  rpcRegister(rpc, "project.getLocalConfig", (p, id) =>
    projectHandlers.handleGetLocalConfig(p, id)
  );
  rpcRegister(rpc, "project.saveLocalConfig", (p, id) =>
    projectHandlers.handleSaveLocalConfig(p, id)
  );
  rpcRegister(rpc, "project.ensureGitignore", (p, id) =>
    projectHandlers.handleEnsureGitignore(p, id)
  );
  rpcRegister(rpc, "project.scanImport", (p, id) =>
    projectHandlers.handleScanImport(p, id)
  );
  rpcRegister(rpc, "project.import", (p, id) =>
    projectHandlers.handleImportProject(p, id)
  );
  rpcRegister(rpc, "project.linkDatabase", (p, id) =>
    projectHandlers.handleLinkDatabase(p, id)
  );

  // ==========================================
  // GIT HANDLERS
  // ==========================================
  rpcRegister(rpc, "git.status", (p, id) => gitHandlers.handleStatus(p, id));
  rpcRegister(rpc, "git.init", (p, id) => gitHandlers.handleInit(p, id));
  rpcRegister(rpc, "git.changes", (p, id) => gitHandlers.handleChanges(p, id));
  rpcRegister(rpc, "git.stage", (p, id) => gitHandlers.handleStage(p, id));
  rpcRegister(rpc, "git.stageAll", (p, id) => gitHandlers.handleStageAll(p, id));
  rpcRegister(rpc, "git.unstage", (p, id) => gitHandlers.handleUnstage(p, id));
  rpcRegister(rpc, "git.commit", (p, id) => gitHandlers.handleCommit(p, id));
  rpcRegister(rpc, "git.log", (p, id) => gitHandlers.handleLog(p, id));
  rpcRegister(rpc, "git.branches", (p, id) => gitHandlers.handleBranches(p, id));
  rpcRegister(rpc, "git.createBranch", (p, id) => gitHandlers.handleCreateBranch(p, id));
  rpcRegister(rpc, "git.checkout", (p, id) => gitHandlers.handleCheckout(p, id));
  rpcRegister(rpc, "git.discard", (p, id) => gitHandlers.handleDiscard(p, id));
  rpcRegister(rpc, "git.stash", (p, id) => gitHandlers.handleStash(p, id));
  rpcRegister(rpc, "git.stashPop", (p, id) => gitHandlers.handleStashPop(p, id));
  rpcRegister(rpc, "git.diff", (p, id) => gitHandlers.handleDiff(p, id));
  rpcRegister(rpc, "git.ensureIgnore", (p, id) => gitHandlers.handleEnsureIgnore(p, id));

  // ==========================================
  // GIT ADVANCED HANDLERS
  // ==========================================
  rpcRegister(rpc, "git.remoteList", (p, id) => gitAdvancedHandlers.handleRemoteList(p, id));
  rpcRegister(rpc, "git.remoteAdd", (p, id) => gitAdvancedHandlers.handleRemoteAdd(p, id));
  rpcRegister(rpc, "git.remoteRemove", (p, id) => gitAdvancedHandlers.handleRemoteRemove(p, id));
  rpcRegister(rpc, "git.remoteGetUrl", (p, id) => gitAdvancedHandlers.handleRemoteGetUrl(p, id));
  rpcRegister(rpc, "git.remoteSetUrl", (p, id) => gitAdvancedHandlers.handleRemoteSetUrl(p, id));

  rpcRegister(rpc, "git.push", (p, id) => gitAdvancedHandlers.handlePush(p, id));
  rpcRegister(rpc, "git.pull", (p, id) => gitAdvancedHandlers.handlePull(p, id));
  rpcRegister(rpc, "git.fetch", (p, id) => gitAdvancedHandlers.handleFetch(p, id));
  rpcRegister(rpc, "git.revert", (p, id) => gitAdvancedHandlers.handleRevert(p, id));

  // ==========================================
  // DATABASE DISCOVERY HANDLERS
  // ==========================================
  rpcRegister(rpc, "db.discover", async (_p, id) => {
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
 * Register an RPC method directly on the JsonStdio instance.
 * Falls back to the global handlers map for test environments that
 * provide a plain Rpc mock instead of a full JsonStdio instance.
 */
function rpcRegister(
  rpc: Rpc,
  method: string,
  fn: (params: any, id: number | string) => Promise<void> | void
) {
  if (typeof (rpc as any).register === "function") {
    (rpc as any).register(method, fn);
  } else {
    // Fallback for test mocks that don't implement register()
    (rpc as any)[method] = fn;
  }
}

// Export for testing and external use
export { rpcRegister };
