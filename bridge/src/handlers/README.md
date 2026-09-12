# RPC Handlers (Bridge)

This folder contains JSON-RPC handler classes. Handlers translate frontend RPC calls into service/query work and send normalized RPC responses or errors.

Layout

- `databaseHandlers.ts` - database connection CRUD, connection tests and schema/table metadata entry points.
- `queryHandlers.ts` - query execution, table browsing and table/row mutation handlers.
- `sessionHandlers.ts` - query session lifecycle and cancellation.
- `statsHandlers.ts` - database and aggregate statistics.
- `migrationHandlers.ts` - migration generation, application, rollback, deletion and SQL retrieval.
- `projectHandlers.ts` - project persistence, schema snapshots, ER diagrams, annotations, saved queries and import/export.
- `gitHandlers.ts` - core local Git actions.
- `gitAdvancedHandlers.ts` - remotes, push/pull/fetch and revert operations.
- `monitoringHandlers.ts` - database monitoring snapshot and websocket info endpoints.
- `aiHandlers.ts` - AI provider tests, schema analysis, query explanation, chart recommendation and history.

How it fits

- `src/jsonRpcHandler.ts` constructs handlers and registers public method names such as `db.list`, `query.run`, `project.create`, `git.status` and `ai.analyzeSchema`.
- Handlers depend on services like `DatabaseService`, `QueryExecutor`, `MonitoringService` and `GitService`.
- Handlers own RPC validation and error mapping. Services and connectors should throw normal errors rather than calling `rpc.sendResponse` directly.

How to add an RPC method

1. Add a handler method in the correct handler class.
2. Validate required params near the top of the handler.
3. Call service/query logic and return `{ ok: true, data }` through `rpc.sendResponse`.
4. Convert failures to `rpc.sendError(id, { code, message })`.
5. Register the method in `src/jsonRpcHandler.ts`.
6. Add or update the matching frontend bridge service in `src/services/bridge`.

Notes

- Keep handler classes thin. If logic grows beyond request validation and orchestration, move it into `src/services`.
- Avoid leaking credentials in responses; strip or omit password and credential identifiers before responding.
- Use stable error codes because the frontend may surface them in notifications.
