# RelWave System Architecture

RelWave is a local-first, cross-platform desktop database management and schema visualization client. It bridges the performance of low-level native database drivers with a modern desktop user experience, offering first-class Git-native schema versioning, visual ER modeling, and engine-aware query workspaces.

This document describes the system architecture, component boundaries, process interactions, data flows, and subsystem implementations across the codebase as of the official v1.3.0 release.

---

## Table of Contents

- [1. High-Level Architecture](#1-high-level-architecture)
  - [1.1 Process Model and Boundaries](#11-process-model-and-boundaries)
  - [1.2 High-Level Architecture Diagram](#12-high-level-architecture-diagram)
  - [1.3 Core Communication Flow](#13-core-communication-flow)
- [2. Frontend Architecture](#2-frontend-architecture)
  - [2.1 Technology Stack & Structure](#21-technology-stack--structure)
  - [2.2 Feature-Based Modular Organization](#22-feature-based-modular-organization)
  - [2.3 Dual-Workspace Pattern: SQL vs. Document](#23-dual-workspace-pattern-sql-vs-document)
  - [2.4 State Management Strategy](#24-state-management-strategy)
  - [2.5 Service Layer and Bridge Client](#25-service-layer-and-bridge-client)
- [3. Tauri / Rust Host Layer](#3-tauri--rust-host-layer)
  - [3.1 Application Bootstrapping](#31-application-bootstrapping)
  - [3.2 Bridge Process Lifecycle & Supervision](#32-bridge-process-lifecycle--supervision)
  - [3.3 Native Resource Resolution](#33-native-resource-resolution)
  - [3.4 Inter-Process Communication (IPC) Pipe](#34-inter-process-communication-ipc-pipe)
  - [3.5 Native Desktop Integrations](#35-native-desktop-integrations)
- [4. Node.js Bridge Subsystem](#4-nodejs-bridge-subsystem)
  - [4.1 Protocol Framing & Dispatching](#41-protocol-framing--dispatching)
  - [4.2 Session Management & Query Streaming](#42-session-management--query-streaming)
  - [4.3 Connection Pooling & Teardown](#43-connection-pooling--teardown)
  - [4.4 Structural Connector Registry](#44-structural-connector-registry)
  - [4.5 Error Normalization & Logging](#45-error-normalization--logging)
- [5. Database Connector Architecture](#5-database-connector-architecture)
  - [5.1 Summary Matrix](#51-summary-matrix)
  - [5.2 PostgreSQL Connector](#52-postgresql-connector)
  - [5.3 MySQL Connector](#53-mysql-connector)
  - [5.4 MariaDB Connector](#54-mariadb-connector)
  - [5.5 SQLite Connector](#55-sqlite-connector)
  - [5.6 DuckDB Connector](#56-duckdb-connector)
  - [5.7 ClickHouse Connector](#57-clickhouse-connector)
  - [5.8 MongoDB Connector Deep Dive](#58-mongodb-connector-deep-dive)
    - [5.8.1 MongoClient Pool & Topology Lifecycle](#581-mongoclient-pool--topology-lifecycle)
    - [5.8.2 Strict BSON & Canonical EJSON v2 Serialization](#582-strict-bson--canonical-ejson-v2-serialization)
    - [5.8.3 Document Browsing, Filtering & Pagination](#583-document-browsing-filtering--pagination)
    - [5.8.4 Guarded Document Mutations](#584-guarded-document-mutations)
    - [5.8.5 MQL Workspace & mongosh Parser](#585-mql-workspace--mongosh-parser)
    - [5.8.6 Visual Aggregation Pipeline Builder & Safety](#586-visual-aggregation-pipeline-builder--safety)
    - [5.8.7 Probabilistic Schema Inference](#587-probabilistic-schema-inference)
    - [5.8.8 Visual ER Diagrams & Relationship Detection](#588-visual-er-diagrams--relationship-detection)
    - [5.8.9 Streaming Bulk Operations Engine](#589-streaming-bulk-operations-engine)
    - [5.8.10 Declarative Migration Engine & Distributed Mutex](#5810-declarative-migration-engine--distributed-mutex)
    - [5.8.11 Index Management & Performance Analysis](#5811-index-management--performance-analysis)
- [6. Git-Native Schema Versioning](#6-git-native-schema-versioning)
  - [6.1 Repository Scaffolding & Storage](#61-repository-scaffolding--storage)
  - [6.2 Schema Snapshotting & Comparison](#62-schema-snapshotting--comparison)
  - [6.3 Drift Detection & Reversibility](#63-drift-detection--reversibility)
  - [6.4 Migration Tracking & Verification](#64-migration-tracking--verification)
- [7. AI Architecture](#7-ai-architecture)
  - [7.1 Provider Strategy](#71-provider-strategy)
  - [7.2 Engine-Aware Prompt Context](#72-engine-aware-prompt-context)
  - [7.3 Response Caching & Execution History](#73-response-caching--execution-history)
- [8. Security & Operational Reliability](#8-security--operational-reliability)
  - [8.1 Credential Storage & Encryption Implementation](#81-credential-storage--encryption-implementation)
  - [8.2 SSH Tunneling Architecture](#82-ssh-tunneling-architecture)
  - [8.3 Read-Only Guards & Defensive Boundaries](#83-read-only-guards--defensive-boundaries)
  - [8.4 Query Cancellation & Cleanup Guarantees](#84-query-cancellation--cleanup-guarantees)
- [9. Build and Release Architecture](#9-build-and-release-architecture)
  - [9.1 Multi-Stage Build Pipeline](#91-multi-stage-build-pipeline)
  - [9.2 Native Addon Handling & Sidecar Bundling](#92-native-addon-handling--sidecar-bundling)
  - [9.3 Target Platform Matrix](#93-target-platform-matrix)

---

## 1. High-Level Architecture

### 1.1 Process Model and Boundaries

RelWave employs a **tri-layer host/sidecar architecture**:

1. **Frontend Presentation (Webview / Chromium):** Runs React 19, TypeScript, Tailwind CSS 4, and CodeMirror inside Tauri's native webview. It is purely responsible for UI state, user events, data presentation, visual graph rendering, and theme application. It has zero direct access to network sockets or filesystem paths outside Tauri IPC.
2. **Desktop Shell (Tauri 2 / Rust):** Operates as the operating-system host. It creates the application window, registers OS tray icons and system shortcuts, supervises the Node.js bridge child process, handles native dialogs, and bridges standard I/O streams securely between webview IPC and the sidecar.
3. **Execution Engine (Node.js Bridge):** An isolated Node.js process running bundled native database drivers (`pg`, `mysql2`, `better-sqlite3`, `@duckdb/node-api`, `@clickhouse/client`, `mongodb`), SSH tunneling (`ssh2`), Git CLI interactions, and AES-256-CBC encrypted credential storage.

### 1.2 High-Level Architecture Diagram

```mermaid
flowchart TD
    subgraph Frontend ["Frontend Layer (Tauri Webview / React 19)"]
        UI["React UI Components & Pages"]
        State["State Layer: TanStack Query + React Context"]
        ServiceLayer["Service Layer: BridgeClient + Domain Services"]
        UI --> State
        State --> ServiceLayer
    end

    subgraph Host ["Host Layer (Tauri 2 / Rust Runtime)"]
        IPC["Tauri IPC Commands ('bridge_write')"]
        Supervision["Process Supervisor (Windows Job Object / Child Monitor)"]
        Reader["Async BufReader (Lines stdout / stderr)"]
        Events["Tauri Emitter ('bridge-stdout')"]

        IPC --> Supervision
        Supervision --> Reader
        Reader --> Events
    end

    subgraph Bridge ["Bridge Sidecar (Node.js 22 Standalone Runtime)"]
        StdioHandler["JsonRpcHandler (Framed JSON-RPC 2.0 stdio)"]
        SessionMgr["SessionManager & Query Cancellation"]
        Pool["ConnectionPool & Idle Sweeper"]
        Registry["Structural Connector Registry"]
        BulkEngine["Bulk Operations Engine"]
        GitService["Git Service (child_process.execFile)"]
        CryptoStore["DbStore (AES-256-CBC + scrypt)"]
        Keyring["KeyringService (@napi-rs/keyring for SSH)"]

        StdioHandler --> SessionMgr
        StdioHandler --> Pool
        Pool --> Registry
        StdioHandler --> BulkEngine
        StdioHandler --> GitService
        StdioHandler --> CryptoStore
        StdioHandler --> Keyring
    end

    subgraph External ["Databases & External Infrastructure"]
        PG["PostgreSQL (pg + pg-query-stream)"]
        MySQL["MySQL / MariaDB (mysql2)"]
        SQLite["SQLite (better-sqlite3 file)"]
        DuckDB["DuckDB (@duckdb/node-api columnar)"]
        ClickHouse["ClickHouse (@clickhouse/client HTTP/S)"]
        MongoDB["MongoDB (mongodb driver + BSON)"]
        SSH["SSH Bastion Host (ssh2 Tunnel)"]
        Git["Local File System (.git repository)"]
    end

    ServiceLayer -- "tauri.invoke('bridge_write', { message })" --> IPC
    Events -- "listen('bridge-stdout')" --> ServiceLayer

    Supervision -- "stdin.write(json + '\n')" --> StdioHandler
    StdioHandler -- "stdout.write(json + '\n')" --> Reader
    StdioHandler -- "stderr (pino logs)" --> Reader

    Registry --> PG
    Registry --> MySQL
    Registry --> SQLite
    Registry --> DuckDB
    Registry --> ClickHouse
    Registry --> MongoDB
    Pool --> SSH
    GitService --> Git
```

### 1.3 Core Communication Flow

Communication between the webview and the bridge follows strict JSON-RPC 2.0 semantics framed with newline characters (`\n`):

1. **Request Dispatch:** A frontend hook calls a domain service method (e.g. `databaseBridge.getTables(connectionId)`). `BridgeClient` constructs a JSON-RPC 2.0 payload `{ jsonrpc: "2.0", id: "<uuid>", method: "db.listTables", params: { ... } }`, records a pending Promise in its memory map, and invokes Tauri's `bridge_write` command.
2. **Standard Input Transport:** The Rust host receives the command string and writes it directly to the child process `stdin`.
3. **Bridge Handling:** The bridge's `JsonStdio` instance buffers incoming chunks until a newline is reached, parses the JSON object, and routes the call through `JsonRpcHandler.handleMessage()`.
4. **Execution & Connection Retrieval:** Handlers obtain a connection from `ConnectionPool` or `DatabaseService`, dispatch to the relevant connector module in `bridge/src/connectors/`, and await results.
5. **Standard Output Emission:** The bridge writes `{ jsonrpc: "2.0", id: "<uuid>", result: { ... } }\n` to `stdout`.
6. **Webview Event Forwarding:** The Rust reader thread captures the line and calls `app_handle.emit("bridge-stdout", line)`.
7. **Resolution:** `BridgeClient` parses the event payload, matches the `id` against its pending requests, and resolves the awaiting Promise.

---

## 2. Frontend Architecture

### 2.1 Technology Stack & Structure

The user interface is structured as a modern Single-Page Application (SPA) built with:

- **React 19:** Functional components with React hooks and modern transition primitives.
- **Vite:** High-performance ES module bundler.
- **Tailwind CSS 4:** Zero-runtime utility styling with CSS variable design tokens.
- **shadcn/ui (Radix UI):** Accessible, unstyled primitives for dialogs, sheets, tooltips, dropdowns, and contextual menus.
- **CodeMirror 6:** Extensible SQL and JSON code editor with syntax highlighting, auto-complete, and dark themes.
- **React Flow (`@xyflow/react`):** Interactive, node-based visual ER diagrams with pan, zoom, custom node rendering, and minimap navigation.
- **Recharts:** Responsive SVG charting for database metrics, query throughput, and field type distributions.

### 2.2 Feature-Based Modular Organization

Code is strictly organized by business domain under `src/features/`:

```text
src/
├── components/          # Shared atomic and layout UI (buttons, dialogs, inputs)
├── features/
│   ├── connection/      # Database connection dialogs, forms, and discovery
│   ├── database/        # Database selection sidebar, metadata inspector
│   ├── er-diagram/      # React Flow relational ER diagram components
│   ├── git/             # Branch switcher, commit dialogs, diff view
│   ├── migrations/      # Relational SQL migration panel, runners, cards
│   ├── mongodb/         # MongoDB-specific domain (MQL, aggregations, bulk, BSON)
│   ├── monitoring/      # Live performance charts, metrics ticker
│   ├── query-builder/   # Visual relational drag-and-drop query composer
│   ├── schema-explorer/ # Tree viewer for schemas, tables, views, and columns
│   ├── settings/        # AI settings, theme switcher, update manager
│   └── workspace/       # SQL editor, query tabs, tabular results viewer
├── lib/                 # Formatting utilities, converters, connection URL parsers
├── pages/               # Route endpoints (Index.tsx, DatabaseDetails.tsx)
└── services/bridge/     # JSON-RPC service clients (database, query, git, ai)
```

Each feature module exports a public contract through an `index.ts` file, isolating its internal hooks and subcomponents.

### 2.3 Dual-Workspace Pattern: SQL vs. Document

RelWave dynamically alters its workspace architecture based on the active database kind:

```mermaid
flowchart TD
    Route["DatabaseDetails Route (`/database/:id`)"] --> QueryHook["`useDatabase(id)` (Fetch DBMeta)"]
    QueryHook --> CheckKind{"`connectorKind(db.type)`"}

    CheckKind -- "`kind === 'sql'`" --> SQLWorkspace["`SQLWorkspacePanel.tsx`"]
    CheckKind -- "`kind === 'nosql'`" --> MongoWorkspace["`MongoWorkspacePanel.tsx`"]

    subgraph RelationalWorkspace ["Relational Workspace Surface"]
        SQLWorkspace --> SQLTabs["Query Tabs: CodeMirror SQL"]
        SQLWorkspace --> VisualBuilder["Visual Query Builder"]
        SQLWorkspace --> RelGrid["Tabular Row Grid (Pagination / Virtualized)"]
        SQLWorkspace --> RelMigrations["SQL Migration Panel (`+up` / `+down`)"]
        SQLWorkspace --> RelERD["Relational Foreign-Key ERD"]
    end

    subgraph DocumentWorkspace ["Document Workspace Surface"]
        MongoWorkspace --> MQLTabs["MQL Editor & mongosh Runner"]
        MongoWorkspace --> AggBuilder["Visual Aggregation Pipeline Builder"]
        MongoWorkspace --> DocViewers["Dual Viewers: JSON / Interactive Tree"]
        MongoWorkspace --> MongoBulk["Bulk Operations Panel (Import / Export / Mutate)"]
        MongoWorkspace --> MongoMigrations["Declarative Manifest Migrations"]
        MongoWorkspace --> MongoERD["Inferred Schema & Statistical ERD"]
    end
```

### 2.4 State Management Strategy

1. **Server & Database State (TanStack Query):** All data retrieved from the bridge (schema trees, query batches, migration lists, connection lists) is managed via `useQuery` and `useMutation`. Cache keys are hierarchical and strictly scoped by `connectionId` (e.g. `["database", connectionId, "schemas"]`).
2. **Global UI State (React Context):** UI theme tokens (`ThemeProvider`), active project selection, and modal dialog contexts use React Context.
3. **Custom External Stores (`useSyncExternalStore`):** State requiring high-frequency background synchronization without triggering full component tree re-renders (such as the `useMongoBulkOperationsStore`) uses `useSyncExternalStore`. To prevent React render loops, store snapshots retain reference stability across polling cycles using deep caching.

### 2.5 Service Layer and Bridge Client

The frontend communicates with the bridge via singleton services under `src/services/bridge/`:

- `bridgeClient.ts`: Core protocol implementation. Handles request ID generation, JSON string framing, pending Promise registries, and event routing.
- `databaseBridge.ts`: Connection CRUD, schema introspection, stats retrieval.
- `query.ts`: Cancelable query execution, batch listeners.
- `git.ts`: Branch management, commits, staging, diff generation.
- `migration.ts`: SQL migration generation, apply, rollback, baselining.
- `ai.ts`: Natural language query generation, provider configuration.

---

## 3. Tauri / Rust Host Layer

### 3.1 Application Bootstrapping

The application entry point is in `src-tauri/src/main.rs`, which invokes `relwave_lib::run()` (`src-tauri/src/lib.rs`). During startup:

1. Tauri initializes plugins: `tauri_plugin_opener`, `tauri_plugin_updater`, `tauri_plugin_dialog`, and `tauri_plugin_process`.
2. The Tauri `setup` hook calls `bridge::process::init_bridge(&app_handle)`.
3. The bridge child process is spawned, its standard streams are hooked, and the supervisor thread is initialized.
4. Window properties are configured (frameless custom titlebar, min dimensions 1200x800).

### 3.2 Bridge Process Lifecycle & Supervision

The bridge lifecycle is supervised by `src-tauri/src/bridge/process.rs`:

- **Child Spawning:** In development mode (`debug_assertions`), the host spawns `node` pointing to `bridge/dist/index.cjs` (or `ts-node-dev`). In release builds, it locates the standalone executable `bridge-x86_64-pc-windows-msvc.exe` (Windows) or `bridge-x86_64-unknown-linux-gnu` (Linux) in the bundled resources directory.
- **Environment & PID Binding:** The child is launched with `RELWAVE_PARENT_PID=<pid>` and `CREATE_NO_WINDOW` on Windows.
- **Windows Job Object Isolation:** On Windows, the process is assigned to a Windows Job Object configured with `JOB_OBJECT_LIMIT_KILL_ON_JOB_CLOSE`. If the Tauri process crashes, is force-killed via Task Manager, or exits abnormally, the Windows kernel guarantees that the bridge process and all spawned database driver threads/subprocesses are terminated immediately.
- **Unix Signal Handling:** On Linux/macOS, process termination traps ensure `SIGTERM` / `SIGKILL` are sent to the child process group upon host shutdown.

### 3.3 Native Resource Resolution

Because native C++ binary addons cannot be executed from inside a packaged `.zip` or memory buffer, the host resolves paths at runtime:

- `find_sqlite_native_binding()` locates `better_sqlite3.node` in `resources/` or `_up_/resources/`.
- `duckdb.dll` is located alongside the executable and injected into the bridge process `PATH`.

### 3.4 Inter-Process Communication (IPC) Pipe

Tauri exposes two primary commands in `src-tauri/src/bridge/commands.rs`:

- `bridge_write(message: String)`: Writes the payload string directly to the child process `stdin`.
- `bridge_restart()`: Kills and restarts the bridge sidecar if an unrecoverable failure occurs.

Stdout reader threads continuously consume the bridge stream:

```rust
let reader = BufReader::new(stdout);
for line in reader.lines() {
    if let Ok(line) = line {
        let _ = app_handle.emit("bridge-stdout", line);
    }
}
```

Structured logs written to `stderr` are intercepted and written to Tauri's logging facility or discarded in production to avoid console flooding.

---

## 4. Node.js Bridge Subsystem

### 4.1 Protocol Framing & Dispatching

The entry point of the bridge is `bridge/src/index.ts`. It initializes:

- `JsonStdio`: Wraps `process.stdin` and `process.stdout`. It splits incoming streams on `\n` boundaries, parses JSON objects, and handles formatted writes.
- `JsonRpcHandler`: A central dispatcher mapping RPC methods to strongly-typed handler functions.

Method routing is modularized:

- `db.*`: Handled by `databaseHandlers.ts` (connection management, stats, schema introspection).
- `query.*`: Handled by `queryHandlers.ts` (cancelable execution, explain plans, batch streaming).
- `git.*`: Handled by `gitHandlers.ts` and `gitAdvancedHandlers.ts` (versioning, commits, diffs).
- `migration.*`: Handled by `migrationHandlers.ts` (SQL migrations and MongoDB migrations).
- `mongo.*`: Handled by `mongoBulkHandlers.ts` and `mongoRelationshipHandlers.ts`.
- `ai.*`: Handled by `aiHandlers.ts` (natural language query generation, provider health).
- `monitoring.*`: Handled by `monitoringHandlers.ts`.

### 4.2 Session Management & Query Streaming

`bridge/src/sessionManager.ts` tracks active operations across all database engines:

- Each query execution is assigned a unique `Session` holding:
  - `sessionId`: Unique identifier.
  - `connectionId`: Associated database ID.
  - `cancel`: An asynchronous callback to abort the in-flight query.
  - `createdAt` / `lastActivity`: Timestamps for idle eviction.
- A background ticker evicts stale sessions older than 30 minutes.

### 4.3 Connection Pooling & Teardown

`bridge/src/services/connectionPool.ts` maintains active database connections:

- Connections are keyed by `dbId`.
- **Idle Sweep:** An automated background interval checks connection activity every 60 seconds and closes connections that have been idle for more than 10 minutes.
- **Safe Teardown:** When a connection is removed or updated, `triggerDeferredCleanup` schedules driver close routines asynchronously. It tracks active close promises in `inProgressCleanups` with `.finally()` teardown, avoiding Temporal Dead Zone (TDZ) reference errors.
- **Forced Teardown:** During process shutdown, `closeAll()` triggers `isForcedTeardownInitiated = true`, immediately terminates all connection pools, closes active SSH tunnels, and exits.

### 4.4 Structural Connector Registry

`bridge/src/services/connectorRegistry.ts` maps `DBType` to connector implementations:

```typescript
export type Connector =
  | typeof postgresConnector
  | typeof mysqlConnector
  | typeof mariadbConnector
  | typeof sqliteConnector
  | typeof duckdbConnector
  | typeof clickhouseConnector
  | typeof mongoConnector;

const registry: Record<DBType, Connector> = {
  [DBType.POSTGRES]: postgresConnector,
  [DBType.MYSQL]: mysqlConnector,
  [DBType.MARIADB]: mariadbConnector,
  [DBType.SQLITE]: sqliteConnector,
  [DBType.DUCKDB]: duckdbConnector,
  [DBType.CLICKHOUSE]: clickhouseConnector,
  [DBType.MONGODB]: mongoConnector,
};
```

Handler functions retrieve the target connector via `getConnector(dbType)`, completely eliminating hardcoded `switch(dbType)` chains.

### 4.5 Error Normalization & Logging

- **Logging:** Structured logging uses `pino` (`bridge/src/services/logger.ts`) directed strictly to file descriptor 2 (`stderr`). Standard output is reserved 100% for JSON-RPC messages.
- **Error Normalization:** Database-specific exceptions are caught and sanitized before transmission over RPC:
  - Database connection strings and embedded passwords (`mongodb://user:pass@host`) are redacted via regex replacement.
  - Standard JSON-RPC error codes are mapped: `-32600` (Invalid Request), `-32601` (Method Not Found), `-32602` (Invalid Params), `-32603` (Internal Error), and custom application error codes (e.g. `MONGO_NOT_FOUND`, `MONGO_VALIDATION_ERROR`).

---

## 5. Database Connector Architecture

### 5.1 Summary Matrix

| Database Engine | Driver Package                 | Protocol / Transport                    | Primary Data Model          | Introspection Mechanism                  | Cancellation Mechanism           | Streaming Support        |
| :-------------- | :----------------------------- | :-------------------------------------- | :-------------------------- | :--------------------------------------- | :------------------------------- | :----------------------- |
| **PostgreSQL**  | `pg` (^8.16.3)                 | TCP Socket (TLS/SSL)                    | Relational (Row)            | `information_schema` + `pg_catalog`      | `client.cancel()`                | Yes (`pg-query-stream`)  |
| **MySQL**       | `mysql2` (^3.15.3)             | TCP Socket (TLS/SSL)                    | Relational (Row)            | `information_schema`                     | `KILL QUERY <threadId>`          | Yes (Result stream)      |
| **MariaDB**     | `mysql2` (^3.15.3)             | TCP Socket (TLS/SSL)                    | Relational (Row)            | `information_schema`                     | `KILL QUERY <threadId>`          | Yes (Result stream)      |
| **SQLite**      | `better-sqlite3` (^11.9.0)     | Direct disk file                        | Relational (Row)            | `PRAGMA table_xinfo / foreign_key_list`  | In-process execution limit       | Synchronous batching     |
| **DuckDB**      | `@duckdb/node-api` (1.5.6-r.1) | In-process file / memory                | Relational (Columnar OLAP)  | `information_schema` + DuckDB catalog    | Abort / statement close          | Chunked vector stream    |
| **ClickHouse**  | `@clickhouse/client` (^1.24.1) | HTTP / HTTPS (8123/8443)                | Relational (Columnar OLAP)  | `system.tables` + `system.columns`       | `AbortController` (HTTP abort)   | Yes (JSONEachRow stream) |
| **MongoDB**     | `mongodb` (^6.21.0)            | TCP Socket (Standalone / Replica / SRV) | Document (Polymorphic BSON) | Natural-order `find()` with `limit` scan | `AbortController` + cursor close | Yes (`find().stream()`)  |

---

### 5.2 PostgreSQL Connector

- **Implementation:** `bridge/src/connectors/postgres.ts`
- **Capabilities:** Full support for PostgreSQL 12–17. Introspects tables, views, foreign keys, unique constraints, and schema search paths (`listSchemas`). Supports SSL modes: `disable`, `require`, `verify-ca`, and `verify-full`.
- **Query Execution:** Uses `pg-query-stream` to pipe query rows in configurable batches (default 100 rows per batch) over stdio.
- **Cancellation:** Saves the underlying backend process ID (`processID`) and secret key upon connection. When cancellation is requested, opens a temporary out-of-band client connection to invoke PostgreSQL's cancel API.
- **Migrations:** Tracks version history in `schema_migrations`. Applies migrations within an explicit `BEGIN ... COMMIT` transaction.

### 5.3 MySQL Connector

- **Implementation:** `bridge/src/connectors/mysql.ts`
- **Capabilities:** Supports MySQL 8.0+. Handles user authentication with `caching_sha2_password` and `mysql_native_password`. Introspects schemas from `information_schema.tables`, `columns`, and `key_column_usage`.
- **Query Execution:** Executes queries using streaming cursor mode, batching rows into JSON-RPC notification packets.
- **Cancellation:** Captures `connection.threadId`. When cancelled, acquires a separate administrative connection and executes `KILL QUERY <threadId>`.

### 5.4 MariaDB Connector

- **Implementation:** `bridge/src/connectors/mariadb.ts`
- **Capabilities:** Built on `mysql2` with MariaDB-specific introspection adjustments (handling MariaDB 10.x / 11.x sequence objects, virtual columns, and engine parameters). Shares the thread ID cancellation model.

### 5.5 SQLite Connector

- **Implementation:** `bridge/src/connectors/sqlite.ts`
- **Capabilities:** Connects directly to local SQLite files (`.db`, `.sqlite`, `.sqlite3`, `.s3db`). Supports read-only mode via `better-sqlite3` flags (`readonly: true`).
- **Introspection:** Executes PRAGMA queries: `PRAGMA table_xinfo()`, `PRAGMA foreign_key_list()`, `PRAGMA index_list()`, and `PRAGMA index_info()`.
- **Performance:** Synchronous execution avoids asynchronous event-loop hops. Because SQLite operates locally on file locks, multi-threading is constrained by database file access.

### 5.6 DuckDB Connector

- **Implementation:** `bridge/src/connectors/duckdb.ts`
- **Capabilities:** Embeds DuckDB for ultra-fast columnar analytical queries on `.duckdb`, `.db`, `.ddb`, or temporary memory databases. Supports local Parquet and CSV file querying via SQL (`SELECT * FROM 'data.parquet'`).
- **Packaging:** Native binary `duckdb.dll` is bundled on Windows and loaded via `@duckdb/node-api`.

### 5.7 ClickHouse Connector

- **Implementation:** `bridge/src/connectors/clickhouse.ts`
- **Capabilities:** Connects to ClickHouse clusters over HTTP (`8123`) or HTTPS (`8443`). Fully aware of ClickHouse engine families (`MergeTree`, `ReplacingMergeTree`, `Distributed`).
- **Query Execution:** Uses `@clickhouse/client`'s streaming interface `client.query({ query, format: 'JSONEachRow' })`.
- **Cancellation:** Leverages standard `AbortController` signals to immediately terminate the in-flight HTTP request.
- **Mutations:** Handles ClickHouse's asynchronous mutation semantics by issuing `ALTER TABLE ... UPDATE` and `ALTER TABLE ... DELETE` with `SETTINGS mutations_sync = 1`.

---

### 5.8 MongoDB Connector Deep Dive

The MongoDB subsystem is implemented across `bridge/src/connectors/mongo.ts`, `mongoBson.ts`, `bridge/src/services/mongoBulkEngine.ts`, `mongoMigrationEngine.ts`, `mongoRelationshipEngine.ts`, and frontend module `src/features/mongodb/`.

```mermaid
flowchart TD
    subgraph UI ["Frontend (src/features/mongodb/)"]
        Workspace["MongoWorkspacePanel.tsx"]
        MQLView["MongoMqlEditor.tsx (mongosh Parser)"]
        AggView["MongoAggregationBuilder.tsx"]
        Viewer["MongoResultsViewer.tsx / TreeViewer.tsx"]
        BulkUI["MongoBulkOperationsPanel.tsx"]
        MigrUI["MongoMigrationsPanel.tsx"]
        ERDUI["MongoERDiagramView.tsx"]
    end

    subgraph BridgeServices ["Bridge MongoDB Services"]
        Connector["connectors/mongo.ts"]
        BSONEngine["connectors/mongoBson.ts"]
        BulkEngine["services/mongoBulkEngine.ts"]
        MigrEngine["services/mongoMigrationEngine.ts"]
        LockEngine["services/mongoMigrationLock.ts"]
        RelEngine["services/mongoRelationshipEngine.ts"]
    end

    subgraph Cluster ["Live MongoDB Database"]
        Client["MongoClient Pool"]
        DB["Target Database"]
        Collections["Target Collections"]
        LockColl["_relwave_migrations_lock"]
        MigrColl["_relwave_migrations"]
    end

    Workspace --> MQLView
    Workspace --> AggView
    Workspace --> Viewer
    Workspace --> BulkUI
    Workspace --> MigrUI
    Workspace --> ERDUI

    MQLView -- "db.runMql" --> Connector
    AggView -- "db.runAggregation" --> Connector
    Viewer -- "BSON Deserialization" --> BSONEngine
    BulkUI -- "mongo.bulk.*" --> BulkEngine
    MigrUI -- "migration.mongo.*" --> MigrEngine
    ERDUI -- "mongo.relationships.*" --> RelEngine

    Connector --> Client
    BSONEngine --> Connector
    BulkEngine --> Client
    MigrEngine --> LockEngine
    LockEngine --> LockColl
    MigrEngine --> MigrColl
    RelEngine --> Client

    Client --> DB
    DB --> Collections
```

#### 5.8.1 MongoClient Pool & Topology Lifecycle

- **Driver:** Powered by official `mongodb` npm package (^6.21.0).
- **Topology Support:**
  - Standalone: `mongodb://127.0.0.1:27017/testdb`
  - Replica Set: `mongodb://host1,host2/?replicaSet=rs0`
  - MongoDB Atlas: `mongodb+srv://cluster.mongodb.net/testdb`
- **Lifecycle Management:** Managed in `bridge/src/services/connectionPool.ts`. The pool caches `MongoClient` instances, validates reachability with `db.command({ ping: 1 })`, introspects cluster topology and version, and performs graceful client closure via `safeCloseMongoClient`.

#### 5.8.2 Strict BSON & Canonical EJSON v2 Serialization

- **Implementation:** `bridge/src/connectors/mongoBson.ts` and `src/features/mongodb/parser/bson.ts`.
- **Fidelity Guarantee:** Standard JSON types are lossy with MongoDB BSON. RelWave enforces strict Canonical Extended JSON (EJSON v2, `{ relaxed: false }`):
  - `ObjectId`: `{"$oid": "507f1f77bcf86cd799439011"}`
  - `Date`: `{"$date": {"$numberLong": "1710672000000"}}`
  - `Decimal128`: `{"$numberDecimal": "99.95"}`
  - `Long` (int64): `{"$numberLong": "9223372036854775807"}`
  - `Binary`: `{"$binary": {"base64": "...", "subType": "00"}}`
  - `Timestamp`: `{"$timestamp": {"t": 1710672000, "i": 1}}`
  - `Regex`: `{"$regularExpression": {"pattern": "^abc", "options": "i"}}`
- In the UI, values are rendered with badge syntax (e.g. `ObjectId("...")`, `ISODate("...")`, `NumberDecimal("...")`), but editing parses back into exact canonical EJSON structures.

#### 5.8.3 Document Browsing, Filtering & Pagination

- **Browsing:** Bounded query windowing via `findDocuments` using filter, projection, sort, and pagination.
- **Pagination Strategy:** Interactive browsing uses offset windowing clamped by the bridge to a maximum of 100 documents per page (default 50). Deep pagination is discouraged in favor of targeted query filters.
- **Dual Presentation:** Results can be toggled between an editable Canonical JSON editor and an interactive polymorphic Tree View (`MongoTreeViewer.tsx`) that allows expanding nested objects, arrays, and primitive type badges.

#### 5.8.4 Guarded Document Mutations

- **Operations Supported:** `insertOne`, `insertMany`, `updateOne`, `updateMany`, `replaceOne`, `deleteOne`, `deleteMany`.
- **Semantic Empty Filter Guard:** In `src/features/mongodb/utils/mongoSemanticEmpty.ts` and `useMongoBulkMutations.ts`, queries are analyzed before RPC dispatch. Empty filters (`{}`, whitespace, or empty nested objects) on `updateMany` or `deleteMany` are blocked client-side unless the user explicitly checks the `allowUnrestricted` confirmation toggle.
- **Prototype Pollution Defense:** Keys containing `__proto__`, `constructor`, or `prototype` are rejected before dispatch.

#### 5.8.5 MQL Workspace & mongosh Parser

- **Implementation:** `src/features/mongodb/parser/mongoshParser.ts` and `bridge/src/handlers/queryHandlers.ts`.
- **Parser Capabilities:** Parses shell expressions such as `db.collection.find({ ... }).sort({ ... }).limit(10)` or `db.collection.aggregate([ ... ])`. It extracts the collection name, operation, query document, options, and executes the equivalent native driver method.
- **Explain Plans:** Includes built-in explain execution (`db.collection.explain('executionStats')`). Analyzes winning plan stages (`COLLSCAN` vs `IXSCAN`), execution timings, and documents examined vs returned (`docsExamined` / `nReturned`).

#### 5.8.6 Visual Aggregation Pipeline Builder & Safety

- **Visual Builder:** `src/features/mongodb/components/aggregation/MongoAggregationBuilder.tsx` allows composing multi-stage pipelines visually.
- **Stage Registry:** Dedicated editors for `$match`, `$project`, `$group`, `$sort`, `$unwind`, `$lookup`, and raw JSON stages. Stages can be reordered via drag-and-drop (`@dnd-kit`), toggled active/inactive, or tested in isolated preview mode.
- **Safety Restriction & Blacklisting:** `validatePipelineSafety` in `bridge/src/connectors/mongo.ts` inspects pipelines and strictly rejects dangerous operator stages:
  - Code execution: `$where`, `$function`, `$accumulator`.
  - Destructive output writing: `$out`, `$merge` (users must use Bulk Export to write results to disk or collections).

#### 5.8.7 Probabilistic Schema Inference

- **Implementation:** `bridge/src/connectors/mongo.ts` (`inferSchema`).
- **Sampling Algorithm:** Reads the first N documents (default 100, maximum 1,000) in natural collection order using `find()` with `limit`. The sample is non-random, so fields that appear only in later documents can be missed or underreported.
- **Statistical Output:** Computes field type distribution percentages, identifies polymorphic fields (e.g. `age: 80% integer, 20% string`), discovers sparse fields, and infers document schemas without blocking production databases.

#### 5.8.8 Visual ER Diagrams & Relationship Detection

- **Implementation:** `bridge/src/services/mongoRelationshipEngine.ts` and `src/features/mongodb/adapters/mongoErAdapter.ts`.
- **Relationship Discovery:** Automatically detects references between collections by analyzing:
  1. `ObjectId` references matching target collection IDs.
  2. Manual DBRef objects (`{ $ref: "users", $id: ObjectId(...) }`).
  3. Arrays of foreign keys.
- **Layout Persistence:** Visual ER diagram positions (x/y coordinates) and custom user-defined relationship links are persisted in the project's schema metadata.

#### 5.8.9 Streaming Bulk Operations Engine

- **Implementation:** `bridge/src/services/mongoBulkEngine.ts`.
- **Bulk Import:** Supports JSON array, Newline-Delimited JSON (NDJSON), and CSV with automatic dot-notation nesting expansion (e.g. `user.address.zip`). Import chunks are constrained to at most 1,000 documents and 4 MB per chunk with a 16 MB cumulative total import cap. Bulk mutation operations (`bulkInsert`) support batches of up to 5,000 documents or 16 MB.
- **Bulk Export:** Streams documents directly from cursor to disk using Node.js filesystem streams (`fs.createWriteStream`). Supports JSON, NDJSON, and CSV formatting.
- **Lifecycle & Cleanup:** `BulkOperationManager` tracks operation progress, handles client-side cancellation via `AbortController`, and automatically purges completed, failed, or orphaned jobs after 2 hours.

#### 5.8.10 Declarative Migration Engine & Distributed Mutex

- **Implementation:** `bridge/src/services/mongoMigrationEngine.ts` and `mongoMigrationLock.ts`.
- **Manifest Format:** Declarative JSON migration manifests using the `.mql.json` filename suffix, specifying typed steps (`createCollection`, `dropCollection`, `createIndex`, `dropIndex`, `setValidator`, `updateMany`).
- **Distributed Mutex Lock:** Protects against concurrent runs by acquiring a distributed lock in `_relwave_migrations_lock` with a 60-second lease, an automated 15-second heartbeat, and monotonic fencing tokens. Lock release clears ownership while preserving the monotonic token to guarantee safety against split-brain scenarios.
- **Audit History:** Migration execution events and step outputs are logged to `_relwave_migrations`. If a step fails, the engine runs automatic reverse compensation steps.

#### 5.8.11 Index Management & Performance Analysis

- **Implementation:** `bridge/src/connectors/mongo.ts` and `src/features/mongodb/components/indexes/`.
- **Management:** View, create, and drop standard, compound, unique, TTL, and sparse indexes. Supports MongoDB 4.4+ hidden indexes (`hideIndex`, `unhideIndex`) for safe performance testing prior to dropping indexes.

---

## 6. Git-Native Schema Versioning

### 6.1 Repository Scaffolding & Storage

RelWave projects can be linked to a local Git repository managed via `bridge/src/services/gitService.ts` and `projectStore.ts`. The repository structure stores declarative schemas:

```text
my-project/
├── .relwave/
│   ├── config.json             # Project connection reference & settings
│   ├── schema/
│   │   ├── tables/             # Relational table DDL schemas (.sql)
│   │   ├── collections/        # MongoDB collection schemas (.json)
│   │   └── relationships.json  # Inferred and custom ER relationships
│   └── migrations/             # Migration files
└── .gitignore                  # Automatically ignores credentials & temp data
```

Git operations are executed directly using `child_process.execFile("git", ...)` to ensure 100% fidelity with the user's local Git configuration, SSH keys, and GPG signing agents.

### 6.2 Schema Snapshotting & Comparison

When a user snapshots a database:

- **SQL Engines:** Introspects tables, columns, indexes, foreign keys, and constraints; formats them into clean, deterministic SQL DDL scripts.
- **MongoDB:** Extracts collection configurations, validator schemas, index specifications, and inferred field types into canonical JSON snapshots.

### 6.3 Drift Detection & Reversibility

RelWave compares the live database catalog against the schema committed in the active Git branch:

1. **Added Entities:** Tables/collections that exist in the live database but not in the Git snapshot.
2. **Modified Entities:** Column type mismatches, missing indexes, altered constraints, or modified MongoDB validators.
3. **Dropped Entities:** Tables/collections committed in Git that no longer exist in the database.

The UI displays a visual diff allowing developers to inspect drift before applying migrations or committing changes.

### 6.4 Migration Tracking & Verification

- **SQL Databases:** Tracks migrations in the standard `schema_migrations` table with version hashes and execution timestamps.
- **MongoDB:** Tracks migrations in `_relwave_migrations` with step execution summaries, duration metrics, and rollback manifests.

---

## 7. AI Architecture

### 7.1 Provider Strategy

The AI subsystem (`bridge/src/ai/`) provides natural language to query generation across multiple LLM providers:

- **Cloud Providers:** OpenAI (GPT-4o), Anthropic (Claude 3.5 Sonnet), Google Gemini (Gemini 1.5 Pro/Flash), Groq, Mistral AI, OpenRouter, and DeepSeek.
- **Local / Private Provider:** Ollama (executing local open-weights models like Llama 3, Mistral, and Qwen over `http://localhost:11434` without sending data off-device).

### 7.2 Engine-Aware Prompt Context

The AI engine (`bridge/src/services/nlSqlService.ts`) injects dialect-specific schema context:

- For SQL databases, it formats table DDL, column names, primary keys, and foreign keys.
- For MongoDB, it formats collection names, sample documents, and inferred field types, explicitly prompting the model for `mongosh` syntax (`db.collection.find(...)` or `db.collection.aggregate([...])`).

### 7.3 Response Caching & Execution History

- **Persistent Cache Storage:** `bridge/src/services/aiCacheService.ts` orchestrates cache-first AI invocations using local SQLite history storage (`aiHistoryStore.ts`). Its `getOrCall` workflow checks for cached entries via `aiHistoryStore.findByHash(hash, datasourceId)` using a deterministic SHA-256 hash of the feature and normalized input payload (schema structure, query details, or table metadata). On a cache miss, it calls the provider and stores the prompt, response, and token count via `aiHistoryStore.insert`.
- **Execution History & Privacy:** Past natural language queries and generated outputs persist locally in SQLite on disk; stored prompts and outputs reflect user inputs and may contain sensitive values if included in the query text. Note that valid write, destructive, and schema queries return early for user confirmation without being written to `aiHistoryStore`. When query interpretation is requested, `nlSqlService` sends non-empty query result sets to the configured cloud AI provider, but does not bypass provider calls via cached lookups.

---

## 8. Security & Operational Reliability

### 8.1 Credential Storage & Encryption Implementation

RelWave implements a strict, two-tier credential architecture:

```mermaid
flowchart TD
    subgraph DBCreds ["Database Connection Passwords"]
        RawPass["Raw Password / MongoDB URI with Auth"] --> Split["`splitMongoUriCredentials` / `dbStore.ts`"]
        Split --> Extract["Extract Password to Memory"]
        Split --> Sanitize["Sanitize URI (Strip Credentials)"]
        Sanitize --> DBJson["Save to `databases.json`"]
        Extract --> Encrypt["AES-256-CBC Encryption (scrypt + salt + IV)"]
        KeyFile["`relwave.key` (32-byte secret on disk, chmod 0o600)"] --> Encrypt
        Encrypt --> CredFile["Save to `.credentials` (credentialId: `db_<uuid>`)"]
    end

    subgraph SSHCreds ["SSH Bastion Tunnel Credentials"]
        RawSSH["SSH Private Key Passphrase / SSH Password"] --> KeyringService["`KeyringService` (`keyringService.ts`)"]
        KeyringService --> OSKeyring["OS Keychain (`@napi-rs/keyring`)<br/>Service: `relwave-ssh`"]
    end
```

- **Database Credentials:** Stored in `.credentials` within the user configuration folder. Encrypted using AES-256-CBC with an app-level 32-byte random secret (`relwave.key`, chmod 0o600 on POSIX). Database passwords are **not** stored in the OS keyring.
- **SSH Credentials:** SSH private key passphrases and passwords are stored in the OS keyring via `@napi-rs/keyring` under the service name `relwave-ssh`.
- **In-Flight Protection:** Connection URIs in error logs and exceptions pass through `safeMongoError`, which redacts URI userinfo (e.g. `username:password@`). Note that sensitive credentials passed in query parameters (such as `AWS_SESSION_TOKEN` in `authMechanismProperties`) are not stripped by this regex.

### 8.2 SSH Tunneling Architecture

For databases behind private networks, `bridge/src/services/sshTunnelService.ts` manages SSH port forwarding using `ssh2`:

- Connects to the bastion host using password or private key authentication (passphrases resolved from OS keyring).
- Forwards a local loopback port to the remote database host/port.
- Passes the local forwarded port to the database connector.
- Automatically tears down tunnels when the database connection is closed.

### 8.3 Read-Only Guards & Defensive Boundaries

- **Connection-Level Read-Only:** Connections marked `readOnly` block write DDL/DML at the handler level.
- **Operator Safety:** MongoDB queries and aggregations reject `$where`, `$function`, `$accumulator`, `$out`, and `$merge`.
- **Unrestricted Mutation Guards:** Bulk update/delete calls without filters require explicit client confirmation (`allowUnrestricted: true`).

### 8.4 Query Cancellation & Cleanup Guarantees

- **PostgreSQL:** Calls `client.cancel()` over a dedicated connection.
- **MySQL / MariaDB:** Issues `KILL QUERY <threadId>` over an administrative socket.
- **ClickHouse:** Aborts streaming HTTP requests via `AbortController`.
- **MongoDB:** Aborts operations via `AbortController` and signals the driver to close the active cursor.
- **Host Crash Protection:** On Windows, the bridge is attached to a Windows Job Object (`JOB_OBJECT_LIMIT_KILL_ON_JOB_CLOSE`), ensuring that if RelWave is terminated, all database sockets and child processes are killed immediately.

---

## 9. Build and Release Architecture

### 9.1 Multi-Stage Build Pipeline

The production build pipeline compiles both layers into a self-contained desktop package:

```text
1. Frontend Build:
   pnpm run build -> tsc --noEmit && vite build -> Output: dist/

2. Bridge Build & Packaging:
   cd bridge
   tsc -> Compile TypeScript to bridge/dist/
   esbuild -> Bundle into single file dist/index.bundled.cjs (externals: native C++ modules)
   copy-native.js -> Copy better_sqlite3.node, duckdb.dll to src-tauri/resources/
   pkg -> Compile Node 22 runtime + bundle -> src-tauri/resources/bridge-<target>

3. Tauri Application Packaging:
   cargo build --release -> Compiles Rust host
   Tauri Bundler -> Packages executable, resources, installer (NSIS on Windows, AppImage/Deb on Linux)
```

### 9.2 Native Addon Handling & Sidecar Bundling

Native C++ modules cannot be bundled inside Node bytecode:

- `better-sqlite3`: Prebuilt `.node` binding copied to `resources/better_sqlite3.node`.
- `@duckdb/node-api`: Native `duckdb.dll` runtime library copied to `resources/duckdb.dll`.
- `@napi-rs/keyring`: Prebuilt native keyring binary bundled for OS keychain access.

### 9.3 Target Platform Matrix

| Platform    | Target Architecture        | Installer Format    | Bridge Artifact                     | Notes                                             |
| :---------- | :------------------------- | :------------------ | :---------------------------------- | :------------------------------------------------ |
| **Windows** | `x86_64-pc-windows-msvc`   | NSIS (`.exe`)       | `bridge-x86_64-pc-windows-msvc.exe` | Job Object supervision, `duckdb.dll` bundled      |
| **Linux**   | `x86_64-unknown-linux-gnu` | `.deb`, `.AppImage` | `bridge-x86_64-unknown-linux-gnu`   | Unix signal handling, Linux native `.so` bindings |
