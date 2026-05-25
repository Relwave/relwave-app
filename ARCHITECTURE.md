# RelWave Architecture

RelWave is a cross-platform desktop database visualizer built with a high-performance bridge architecture. This document provides a deep dive into the system's structure, data flows, and design patterns.

## 1. System Overview

RelWave consists of three distinct layers that communicate over a JSON-RPC protocol:

*   **Frontend (React/TypeScript):** A modern, responsive UI built with Vite, Tailwind CSS (optional), and Lucide icons. It manages state using TanStack Query and coordinates with the bridge via a service layer.
*   **Bridge (Node.js):** A standalone backend bundled with `pkg`. It handles all heavy-lifting tasks: database connectivity (PostgreSQL, MySQL, MariaDB, SQLite), Git version control, and file system operations.
*   **Tauri (Rust):** The native shell that hosts the web view and manages the bridge as a sidecar process. It acts as a secure pipe, forwarding standard I/O between the Frontend and the Bridge.

### Data Flow Diagram

```text
React UI (Renderer)
       ↕ [Webview Events / Invoke]
Tauri Rust Layer (Host)
       ↕ [stdin / stdout / stderr]
Node.js Bridge (Sidecar)
       ↕ [Native Drivers / CLI]
Databases / Git / Filesystem
```

---

## 2. Bridge Deep Dive

The bridge is the core engine of RelWave, designed to be fast, extensible, and isolated from the UI.

### JSON-RPC Dispatcher
The communication follows a standard JSON-RPC 2.0 pattern over `stdin` and `stdout`.
1.  **Entry Point (`bridge/src/index.ts`):** Initializes the `JsonStdio` instance and registers all handlers.
2.  **Protocol (`bridge/src/jsonRpc.ts`):** `JsonStdio` handles framing (newline-delimited JSON) and provides `sendResponse`, `sendError`, and `sendNotification`.
3.  **Dispatcher (`bridge/src/jsonRpcHandler.ts`):** The `JsonRpcHandler` maps incoming method names (e.g., `db.list`) to specific handler functions.

### Adding a New Command
To add a new command, follow these steps:
1.  Define the request/response types in `bridge/src/types/`.
2.  Implement the logic in a relevant handler (e.g., `bridge/src/handlers/databaseHandlers.ts`) or create a new handler in `bridge/src/handlers/`.
3.  Register the new handler/method in `bridge/src/jsonRpcHandler.ts` inside the `registerDbHandlers` function.
4.  Add a corresponding method to the frontend service layer in `src/services/bridge/`.

### Session Management (`bridge/src/sessionManager.ts`)
The `SessionManager` tracks active operations, particularly long-running queries.
*   Each query runs in a `Session`.
*   Sessions store a `cancel` callback and a `connectionId`.
*   A background sweep timer removes stale sessions (default 30 min idle).

### Connection Pooling (`bridge/src/services/connectionPool.ts`)
The `ConnectionPool` manages engine-specific connections.
*   Connections are keyed by `dbId`.
*   The `ConnectionPool` uses the `ConnectorRegistry` to obtain the correct connector (Postgres, MySQL, etc.).
*   Idle connections are automatically swept after 10 minutes.

### Connector Registry (`bridge/src/services/connectorRegistry.ts`)
A mapping of `DBType` to engine implementations. This decoupling allows adding new database support by simply implementing the `Connector` interface.

---

## 3. Frontend Deep Dive

The frontend is designed for speed and reliability, using a "local-first" philosophy where possible.

### Feature Structure
Features are modularly organized under `src/features/[feature-name]/`:
*   `types.ts`: TypeScript definitions for the feature.
*   `hooks/`: Feature-specific hooks (often wrapping TanStack Query).
*   `components/`: UI components.
*   `index.ts`: Public API for the feature.

### Bridge Service Layer
The frontend talks to the bridge through specialized services in `src/services/bridge/`:
*   `bridgeClient.ts`: Low-level wrapper for `invoke('bridge_write')` and `listen('bridge-stdout')`.
*   `database.ts`, `query.ts`, `git.ts`, etc.: High-level methods that wrap `bridgeRequest`.

### State Management
*   **TanStack Query:** Used for almost all bridge-related state. It handles caching, loading states, and automatic refetching.
*   **React Context:** Used for global UI state (themes, active connection).

---

## 4. Database Query Organization

Queries are organized by engine under `bridge/src/queries/`:
*   **`constraints.ts`:** Introspection for PKs, FKs, and indexes.
*   **`schema.ts`:** Listing tables, schemas, and databases.
*   **`stats.ts`:** Database size, row counts, and performance metrics.
*   **`crud.ts`:** Row-level operations (Insert, Update, Delete, Search).
*   **`migrations.ts`:** Schema migration management.

This engine-specific organization avoids the "leaky abstraction" problem of generic ORMs and allows RelWave to use powerful native features (like Postgres' `pg_query_stream` or MySQL's `KILL QUERY`).

---

## 5. Adding a New Feature (End-to-End Checklist)

1.  **Bridge Logic:**
    *   [ ] Add types to `bridge/src/types/`.
    *   [ ] (If needed) Add SQL queries to `bridge/src/queries/[engine]/`.
    *   [ ] Add method to a service in `bridge/src/services/`.
    *   [ ] Implement RPC method in `bridge/src/handlers/`.
    *   [ ] Register in `bridge/src/jsonRpcHandler.ts`.
2.  **Frontend Logic:**
    *   [ ] Add bridge call to `src/services/bridge/[service].ts`.
    *   [ ] Create a hook in `src/features/[feature]/hooks/` using `useQuery` or `useMutation`.
    *   [ ] Implement UI components in `src/features/[feature]/components/`.
    *   [ ] Integrate into a page or the main layout.

---

## 6. Key Data Flows

### Connect to a Database
1.  **UI:** User enters credentials and clicks "Connect".
2.  **Frontend:** `databaseService.addDatabase` calls `bridgeRequest('db.add', params)`.
3.  **Bridge:** `DatabaseHandlers.add` calls `DatabaseService.addDatabase`.
4.  **Bridge:** `DbStore` encrypts the password and saves meta to `relwave.json`.
5.  **Response:** The new `dbId` is returned to the UI.

### Execute a SQL Query and Stream Results
1.  **UI:** User executes SQL in the query editor.
2.  **Frontend:** `queryService.runQuery` calls `bridgeRequest('query.run', { sql, sessionId, dbId })`.
3.  **Bridge:** `QueryHandlers.run` initializes a `Session`.
4.  **Bridge:** `QueryExecutor` uses the specific connector (e.g., `postgres.ts`) to stream results.
5.  **Streaming:** The bridge sends `query.started` and multiple `query.batch` notifications via `stdout`.
6.  **Frontend:** `bridgeClient` listens for these events and dispatches them to the UI.

### Run a Migration
1.  **UI:** User selects a pending migration and clicks "Apply".
2.  **Frontend:** `migrationService.apply` calls `bridgeRequest('migration.apply', { connectionId, filename })`.
3.  **Bridge:** `MigrationHandlers.apply` calls `DatabaseService` to get the connection and then calls `applyMigration` in the engine connector (e.g., `postgres.ts`).
4.  **Connector:** Reads the `.sql` file, executes the `+up` section in a transaction, and records the version in `schema_migrations`.

### Monitor a live database metric
1.  **UI:** User opens the "Monitoring" tab for a database.
2.  **Frontend:** Opens a WebSocket connection to the bridge via `MonitoringWebSocketServer`.
3.  **Bridge:** `MonitoringService` starts a ticker that periodically queries the DB for metrics (health, active queries, throughput).
4.  **Streaming:** The bridge pushes these snapshots over the WebSocket.
5.  **UI:** React components (e.g., in `src/features/monitoring/`) subscribe to these events and update charts in real-time.

---

## 7. Testing

### Organization
*   **Bridge Unit Tests:** Located in `bridge/__tests__/`. Focus on services and utils.
*   **Bridge Integration Tests:** Located in `bridge/__tests__/connectors/`. Test actual DB connectivity.

### Running Tests
*   `npm test`: Runs all bridge tests.
*   `npm run test:watch`: Runs tests in watch mode.

### Docker Compose Test Setup
`bridge/docker-compose.test.yml` provides a standard environment with:
*   PostgreSQL 16
*   MySQL 8.0
*   MariaDB 11.2
Used for end-to-end connector validation.
