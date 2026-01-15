import { Rpc } from "./types";
import { SessionManager } from "./sessionManager";
import { DatabaseService } from "./services/databaseService";
import { QueryExecutor } from "./services/queryExecutor";
import { QueryHandlers } from "./handlers/queryHandlers";
import { DatabaseHandlers } from "./handlers/databaseHandlers";
import { SessionHandlers } from "./handlers/sessionHandlers";
import { StatsHandlers } from "./handlers/statsHandlers";
import { MigrationHandlers } from "./handlers/migrationHandlers";
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
