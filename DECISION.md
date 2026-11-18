# RelWave — Architectural Decision Records (ADR)

This document records the foundational architectural decisions in the RelWave codebase. Each record explains the context, chosen approach, consequences, and current status, reflecting the codebase as of the official v1.3.0 release.

---

## Table of Contents

- [1. Product Philosophy & Platform](#1-product-philosophy--platform)
  - [ADR-001: Local-First Desktop Architecture over Web-Based SaaS](#adr-001-local-first-desktop-architecture-over-web-based-saas)
  - [ADR-002: Process Isolation: Tauri Shell + Node.js Bridge Sidecar](#adr-002-process-isolation-tauri-shell--nodejs-bridge-sidecar)
  - [ADR-003: Multi-Engine Support: Unified Experience with Engine-Native Semantics](#adr-003-multi-engine-support-unified-experience-with-engine-native-semantics)
- [2. Application Architecture & Communication](#2-application-architecture--communication)
  - [ADR-004: JSON-RPC 2.0 over Standard I/O (stdio) as the Bridge Protocol](#adr-004-json-rpc-20-over-standard-io-stdio-as-the-bridge-protocol)
  - [ADR-005: Packaging the Node.js Bridge into Standalone Binaries via pkg](#adr-005-packaging-the-nodejs-bridge-into-standalone-binaries-via-pkg)
  - [ADR-006: Asynchronous Event Notifications and Session-Based Streaming](#adr-006-asynchronous-event-notifications-and-session-based-streaming)
  - [ADR-007: TanStack Query (React Query) for Bridge State Management](#adr-007-tanstack-query-react-query-for-bridge-state-management)
- [3. Database Connectors & Query Execution](#3-database-connectors--query-execution)
  - [ADR-008: Structural Connector Registry over Rigid Interface Abstraction](#adr-008-structural-connector-registry-over-rigid-interface-abstraction)
  - [ADR-009: Explicit Database Kind Discriminator (`sql` vs. `nosql`)](#adr-009-explicit-database-kind-discriminator-sql-vs-nosql)
  - [ADR-010: Synchronous better-sqlite3 Driver in Dedicated Bridge Process](#adr-010-synchronous-better-sqlite3-driver-in-dedicated-bridge-process)
  - [ADR-011: Columnar Analytical Engine Integration (DuckDB & ClickHouse)](#adr-011-columnar-analytical-engine-integration-duckdb--clickhouse)
  - [ADR-012: Official MongoDB Node Driver with MongoClient Connection Pooling](#adr-012-official-mongodb-node-driver-with-mongoclient-connection-pooling)
  - [ADR-013: Strict Canonical Extended JSON (EJSON v2) for BSON Round-Trip Fidelity](#adr-013-strict-canonical-extended-json-ejson-v2-for-bson-round-trip-fidelity)
  - [ADR-014: Cursor Streaming vs. Offset/Limit Pagination Strategy](#adr-014-cursor-streaming-vs-offsetlimit-pagination-strategy)
- [4. Data & Schema Management](#4-data--schema-management)
  - [ADR-015: Git-Native Schema Versioning and Snapshot Tracking](#adr-015-git-native-schema-versioning-and-snapshot-tracking)
  - [ADR-016: Probabilistic Schema Inference with Stratified Sampling for Document Stores](#adr-016-probabilistic-schema-inference-with-stratified-sampling-for-document-stores)
  - [ADR-017: Distinct Migration Paradigms: Relational SQL DDL vs. MongoDB Manifests](#adr-017-distinct-migration-paradigms-relational-sql-ddl-vs-mongodb-manifests)
  - [ADR-018: Distributed Mutex Locking with Monotonic Fencing for MongoDB Migrations](#adr-018-distributed-mutex-locking-with-monotonic-fencing-for-mongodb-migrations)
- [5. Security & Operational Reliability](#5-security--operational-reliability)
  - [ADR-019: Two-Tier Credential Architecture: File AES-256-CBC vs. OS Keyring for SSH](#adr-019-two-tier-credential-architecture-file-aes-256-cbc-vs-os-keyring-for-ssh)
  - [ADR-020: Query Cancellation & Teardown Lifecycles](#adr-020-query-cancellation--teardown-lifecycles)
  - [ADR-021: Operator Safety Guards and Production Read-Only Enforcement](#adr-021-operator-safety-guards-and-production-read-only-enforcement)
  - [ADR-022: Isolated Background Bulk Operations Engine with Orphan Eviction](#adr-022-isolated-background-bulk-operations-engine-with-orphan-eviction)
- [6. AI Integration](#6-ai-integration)
  - [ADR-023: Multi-Provider LLM Abstraction with Local-First Fallbacks](#adr-023-multi-provider-llm-abstraction-with-local-first-fallbacks)
  - [ADR-024: Engine-Aware Schema Prompt Context and Persistent History Storage](#adr-024-engine-aware-schema-prompt-context-and-persistent-history-storage)

---

## 1. Product Philosophy & Platform

### ADR-001: Local-First Desktop Architecture over Web-Based SaaS

- **Decision:** Build RelWave as a cross-platform desktop application rather than a hosted web/cloud SaaS.
- **Context / Problem:** Database management tools handle sensitive intellectual property, production credentials, internal schemas, and proprietary data. In SaaS-based database GUIs, database network ports must be opened to third-party cloud IPs or relayed through intermediate proxy servers, creating security, compliance (SOC2/GDPR/HIPAA), and latency concerns.
- **Chosen Approach:** RelWave runs locally on the user's workstation using Tauri (Rust) and a local Node.js process. All database connections, SSH tunnels, Git commits, and file system operations execute locally within the user's private network or VPN perimeter. Database credentials and connection passwords never leave the local machine, and query execution is strictly local. When the optional natural language query interpretation feature is explicitly requested, `nlSqlService` sends non-empty query result sets to the configured cloud AI provider (e.g. Anthropic, OpenAI, Gemini, Groq, Mistral) for explanation; configuring a local Ollama model keeps interpretation entirely on-device.
- **Consequences and Trade-offs:**
  - _Pros:_ Direct database access without exposing internal ports; zero SaaS hosting costs for users; offline functionality for SQLite and DuckDB; native OS integration (file picker, process lifecycle, local Git).
  - _Cons:_ Binary distribution complexity across Windows and Linux; platform-specific native binary packaging (`.node`, `.dll`, `.so`).
- **Current Status:** Implemented and active across Windows (`x86_64-pc-windows-msvc`) and Linux (`x86_64-unknown-linux-gnu`).

---

### ADR-002: Process Isolation: Tauri Shell + Node.js Bridge Sidecar

- **Decision:** Separate the presentation layer (Tauri/Webview) from the database execution engine via a dedicated Node.js bridge child process.
- **Context / Problem:** Modern database clients need rich, reactive interfaces (CodeMirror, React Flow, Recharts) and robust database connectivity. Implementing all database drivers natively in Rust would be prohibitive due to driver ecosystem maturity (mature Rust drivers for ClickHouse, DuckDB, MySQL, SQLite, and MongoDB have divergent APIs and varying levels of feature parity compared to mature Node.js drivers like `pg`, `mysql2`, `@duckdb/node-api`, and `mongodb`). However, running Node.js directly embedded in a webview lacks desktop isolation and native window controls.
- **Chosen Approach:** RelWave splits execution into two cooperating processes:
  1. _Host/Frontend (Tauri + React 19):_ Lightweight native window management, system tray, menus, and webview rendering.
  2. _Bridge (Node.js):_ A separate background sidecar process handling all database connections, streaming queries, SSH tunnels, Git operations, and disk storage.
     The host launches the bridge, monitors its lifecycle, and terminates it when RelWave closes.
- **Consequences and Trade-offs:**
  - _Pros:_ Access to mature, official database drivers; heavy data crunching, cursor streaming, and BSON parsing cannot freeze the UI thread; clean crash isolation.
  - _Cons:_ IPC serialization overhead between frontend and bridge; managing two runtimes during packaging.
- **Current Status:** Implemented and active. Bridge process lifecycle managed via `src-tauri/src/bridge/process.rs`.

---

### ADR-003: Multi-Engine Support: Unified Experience with Engine-Native Semantics

- **Decision:** Support both relational engines (Postgres, MySQL, MariaDB, SQLite, DuckDB, ClickHouse) and document stores (MongoDB) within a unified desktop shell while respecting engine-native paradigms instead of forcing an abstraction.
- **Context / Problem:** Traditional database clients either force all databases into tabular SQL grids (breaking when confronted with polymorphic JSON/BSON documents) or require separate tools for relational vs. document databases.
- **Chosen Approach:** RelWave provides a consistent outer navigation, project structure, and Git versioning model, but tailors the workspace, query editor, schema viewer, and migration system to the database kind:
  - SQL databases get tabular editors, DDL generators, relational ER diagrams, and SQL migration files.
  - MongoDB gets an MQL/mongosh editor, visual aggregation pipeline builder, polymorphic tree/JSON document viewers, probabilistic schema inference, and declarative manifest migrations.
- **Consequences and Trade-offs:**
  - _Pros:_ Native developer experience without leaky abstractions; no artificial "SQL over Mongo" query translation.
  - _Cons:_ Requires maintaining dual workspace surfaces (`SQLWorkspacePanel.tsx` and `MongoWorkspacePanel.tsx`).
- **Current Status:** Implemented. Differentiated via `connectorKind(dbType)` in `bridge/src/services/connectorKind.ts`.

---

## 2. Application Architecture & Communication

### ADR-004: JSON-RPC 2.0 over Standard I/O (stdio) as the Bridge Protocol

- **Decision:** Use JSON-RPC 2.0 framed with newline-delimited JSON over process `stdin`/`stdout` for communication between Tauri and the Node.js bridge.
- **Context / Problem:** The frontend and bridge require a bi-directional, reliable, low-overhead communication channel. Network sockets (TCP/HTTP/WebSocket) open local ports that can trigger OS firewall prompts, create security vulnerabilities on multi-user systems, and introduce socket lifecycle bugs.
- **Chosen Approach:** Standard input/output pipes:
  - Frontend invokes Tauri command `bridge_write`, which writes a JSON string + `\n` to the bridge child process `stdin`.
  - Bridge stdout stream is read line-by-line via Rust `BufReader` and forwarded to the frontend webview via Tauri event `bridge-stdout`.
  - Standard error (`stderr`) is dedicated exclusively to structured logging (`pino.destination(2)`), preventing logs from corrupting protocol messages.
- **Consequences and Trade-offs:**
  - _Pros:_ Zero network exposure, zero firewall warnings, guaranteed pipe closure on parent death, standard protocol specification (JSON-RPC 2.0).
  - _Cons:_ String-based serialization; binary payloads must be encoded as Base64 or Canonical EJSON.
- **Current Status:** Implemented in `src-tauri/src/bridge/` and `bridge/src/jsonRpc.ts`.

---

### ADR-005: Packaging the Node.js Bridge into Standalone Binaries via pkg

- **Decision:** Bundle the Node.js bridge into a single standalone executable using `@yao-pkg/pkg` with external native module sidecars.
- **Context / Problem:** End users cannot be expected to install Node.js, pnpm, or C++ build tools on their machines. The bridge must ship as an autonomous executable inside the Tauri installer package.
- **Chosen Approach:**
  - Bridge JavaScript source code is bundled into a single CommonJS file via `esbuild`.
  - `@yao-pkg/pkg` compiles the bundle with an embedded Node.js 22 runtime into `bridge-x86_64-pc-windows-msvc.exe` (Windows) and `bridge-x86_64-unknown-linux-gnu` (Linux).
  - Native C/C++ binary addons (`better_sqlite3.node`, `@napi-rs/keyring`, `duckdb.dll`) are marked external in `esbuild`, copied by `bridge/scripts/copy-native.js` into Tauri's `resources/` directory, and resolved dynamically at runtime.
- **Consequences and Trade-offs:**
  - _Pros:_ User requires no external dependencies; consistent Node 22 runtime across all user machines.
  - _Cons:_ Increases application download size (~80 MB per binary); requires precise native binding path resolution in `src-tauri/src/bridge/process.rs`.
- **Current Status:** Implemented in `bridge/package.json` (`build:pkg:win`, `build:pkg:linux`) and `tauri.conf.json`.

---

### ADR-006: Asynchronous Event Notifications and Session-Based Streaming

- **Decision:** Use JSON-RPC notifications (messages without `id`) tagged with `sessionId` or `operationId` for streaming query results, monitoring telemetry, and bulk operation progress.
- **Context / Problem:** Synchronous request/response cycles block client responsiveness during multi-gigabyte queries or lengthy bulk exports, and cannot provide real-time chunked progress updates.
- **Chosen Approach:**
  - Long-running operations generate a unique `sessionId` or `operationId`.
  - The bridge returns an initial acknowledgment response, then streams notifications (`query.batch`, `query.completed`, `mongo.bulk.progress`) over stdout.
  - The frontend `BridgeClient` dispatches these events to topic-specific listeners registered by active React components.
- **Consequences and Trade-offs:**
  - _Pros:_ Scalable streaming; backpressure handling; independent query cancellation without breaking the RPC connection.
  - _Cons:_ Requires client-side session tracking and cleanup to prevent memory leaks in unmounted tabs.
- **Current Status:** Implemented in `bridge/src/sessionManager.ts`, `bridge/src/services/mongoBulkEngine.ts`, and `src/services/bridge/bridgeClient.ts`.

---

### ADR-007: TanStack Query (React Query) for Bridge State Management

- **Decision:** Adopt TanStack Query v5 as the primary data-fetching, caching, and state synchronization layer in the React frontend.
- **Context / Problem:** Desktop database clients constantly fetch schema trees, table rows, connection metrics, and query metadata. Managing manual loading states, cache invalidations, and refetches across dozens of views leads to spaghetti state code and race conditions.
- **Chosen Approach:** All read-oriented bridge RPC calls are wrapped in TanStack Query hooks (`useQuery`) with deterministic query keys (e.g., `["mongo", "collections", connectionId]`). Mutations use `useMutation` with automatic cache invalidation on success.
- **Consequences and Trade-offs:**
  - _Pros:_ Automatic deduplication of concurrent requests, background caching, standardized loading/error states.
  - _Cons:_ Must ensure stable snapshot identity in custom stores (e.g., `useMongoBulkOperationsStore`) to avoid infinite re-render loops with `useSyncExternalStore`.
- **Current Status:** Implemented across all frontend features.

---

## 3. Database Connectors & Query Execution

### ADR-008: Structural Connector Registry over Rigid Interface Abstraction

- **Decision:** Implement database connectors using structural module exports registered in a centralized dispatch table (`connectorRegistry.ts`) rather than forcing an object-oriented class hierarchy.
- **Context / Problem:** Object-oriented `abstract class Connector` models struggle when engines have fundamentally incompatible capabilities (e.g., SQLite has no network users; MongoDB has no foreign keys; DuckDB has no transaction savepoints). Forcing an identical interface leads to endless `throw new UnsupportedError()` methods and lowest-common-denominator interfaces.
- **Chosen Approach:** Each connector is an independent module exporting standard functions where concepts overlap (`testConnection`, `listTables`, `getDBStats`) and engine-specific functions where they diverge (`runMql`, `inferMongoSchema`, `streamDuckDB`). `connectorRegistry.ts` maintains a type-safe union registry `Record<DBType, Connector>`.
- **Consequences and Trade-offs:**
  - _Pros:_ Connectors can evolve independently and leverage unique driver capabilities; straightforward addition of new engines.
  - _Cons:_ Cross-engine dispatch in `queryExecutor.ts` occasionally requires checked type narrowing or structural duck-typing.
- **Current Status:** Implemented in `bridge/src/services/connectorRegistry.ts`.

---

### ADR-009: Explicit Database Kind Discriminator (`sql` vs. `nosql`)

- **Decision:** Introduce a single top-level discriminator `connectorKind(dbType): "sql" | "nosql"` to govern UI rendering, query workspaces, and schema serialization.
- **Context / Problem:** Codebases expanding from SQL to NoSQL often litter components with engine checks like `if (dbType === 'mongodb')`. As more engines arrive, these checks become fragile and unmaintainable.
- **Chosen Approach:** Define `DatabaseKind = "sql" | "nosql"` in `bridge/src/services/connectorKind.ts` and mirror it in the frontend (`src/features/mongodb/types.ts`). High-level components use this discriminator to branch cleanly between relational workspaces and document workspaces.
- **Consequences and Trade-offs:**
  - _Pros:_ Centralized architectural boundary; clean isolation between SQL editor/ER diagrams and MongoDB document/aggregation tools.
  - _Cons:_ Features must be cleanly categorized into either relational or document patterns.
- **Current Status:** Implemented in `bridge/src/services/connectorKind.ts`.

---

### ADR-010: Synchronous better-sqlite3 Driver in Dedicated Bridge Process

- **Decision:** Use `better-sqlite3` (synchronous native C++ binding) rather than asynchronous drivers like `sqlite3`.
- **Context / Problem:** Asynchronous SQLite drivers in Node.js incur significant execution overhead due to thread pool trampolining for each SQLite step, resulting in subpar query throughput on local files.
- **Chosen Approach:** Because the Node.js bridge runs in its own process separate from the Tauri UI, synchronous execution does not block UI rendering. `better-sqlite3` delivers 5x–10x higher throughput for local introspection and tabular data reading.
- **Consequences and Trade-offs:**
  - _Pros:_ Maximum SQLite performance and simpler synchronous code paths in `bridge/src/connectors/sqlite.ts`.
  - _Cons:_ During a heavy query, the bridge event loop cannot process concurrent RPC requests for other tabs (mitigated by fast query timeouts and read-only connections).
- **Current Status:** Implemented and tested in `bridge/src/connectors/sqlite.ts`.

---

### ADR-011: Columnar Analytical Engine Integration (DuckDB & ClickHouse)

- **Decision:** Support modern OLAP engines (DuckDB for local files, ClickHouse for networked servers) alongside standard OLTP databases.
- **Context / Problem:** Developers increasingly use columnar databases for data science, log analysis, and analytical workflows. RelWave needs first-class support for columnar table engines (`MergeTree`) and vectorized execution without treating them like traditional row-store databases.
- **Chosen Approach:**
  - _DuckDB:_ Embedded via official `@duckdb/node-api`. Supports native file selection, in-memory databases, and high-throughput parquet/csv querying.
  - _ClickHouse:_ Connected via official `@clickhouse/client` over HTTP/HTTPS. Introspects `system.tables` and `system.data_skipping_indices` with sorting and partition key awareness. Queries are streamed with `AbortController` cancellation.
- **Consequences and Trade-offs:**
  - _Pros:_ High performance on analytical datasets containing millions of rows; specialized introspection for columnar features.
  - _Cons:_ Heavy native binary distribution (`duckdb.dll`); ClickHouse lightweight mutations (`ALTER TABLE UPDATE/DELETE`) require specialized execution handling.
- **Current Status:** Implemented in `bridge/src/connectors/duckdb.ts` and `bridge/src/connectors/clickhouse.ts`.

---

### ADR-012: Official MongoDB Node Driver with MongoClient Connection Pooling

- **Decision:** Use the official `mongodb` npm driver (^6.21.0) with managed `MongoClient` connection pooling and explicit lifecycle controls.
- **Context / Problem:** MongoDB requires robust topology management (Standalone, Replica Sets, Atlas SRV clusters) and SCRAM authentication. Creating a new client per query is slow and exhausts sockets. Conversely, unbounded client reuse can cause stale socket leaks.
- **Chosen Approach:** `ConnectionPool` in `bridge/src/services/connectionPool.ts` maintains active `MongoClient` instances keyed by database ID with a 10-minute idle sweep. Client closing is centralized in `safeCloseMongoClient` with an async deferred cleanup set to prevent resource leaks during rapid reconnects.
- **Consequences and Trade-offs:**
  - _Pros:_ Full support for modern MongoDB features (Atlas SRV, SCRAM-SHA-256, replica set failover); optimal connection reuse.
  - _Cons:_ Must ensure clean connection teardown when databases are deleted or edited.
- **Current Status:** Implemented in `bridge/src/services/connectionPool.ts` and `bridge/src/connectors/mongo.ts`.

---

### ADR-013: Strict Canonical Extended JSON (EJSON v2) for BSON Round-Trip Fidelity

- **Decision:** Serialize MongoDB BSON documents across the JSON-RPC boundary using strict Canonical Extended JSON v2 format.
- **Context / Problem:** Standard JSON lacks native representations for essential MongoDB data types (`ObjectId`, `Date`, `Decimal128`, 64-bit `Long`, `Binary`, `Timestamp`, `Regex`). Converting an `ObjectId` to a plain string or a `Long` to a JavaScript IEEE-754 float leads to precision loss, corrupted mutations, and broken round-trips.
- **Chosen Approach:** `bridge/src/connectors/mongoBson.ts` and frontend parser `src/features/mongodb/parser/bson.ts` use Canonical EJSON formatting:
  - `ObjectId` → `{"$oid": "..."}`
  - `Date` → `{"$date": {"$numberLong": "..."}}`
  - `Long` → `{"$numberLong": "..."}`
  - `Decimal128` → `{"$numberDecimal": "..."}`
  - `Binary` → `{"$binary": {"base64": "...", "subType": "..."}}`
    The frontend UI displays human-readable representations while preserving the underlying canonical structures for edits and mutations.
- **Consequences and Trade-offs:**
  - _Pros:_ 100% lossless BSON round-trip fidelity; prevents 64-bit integer truncation in JavaScript.
  - _Cons:_ Slightly larger JSON payload size over stdio.
- **Current Status:** Implemented and verified by comprehensive test suites in `bridge/__tests__/connectors/mongoBsonRoundTrip.test.ts`.

---

### ADR-014: Cursor Streaming vs. Offset/Limit Pagination Strategy

- **Decision:** Use cursor streaming for export and large result sets, but bounded skip/limit pagination for interactive UI document browsing.
- **Context / Problem:** MongoDB cursors hold open server-side resources that timeout after 10 minutes (`CursorNotFound`). However, unbounded `skip()` on millions of documents has $O(N)$ performance degradation.
- **Chosen Approach:**
  - _Interactive Workspace:_ Uses page-based windowing with a hard limit (default 50 documents, clamped to a maximum of 100 by the bridge) and index-supported sort keys.
  - _Bulk Export:_ Uses native driver cursors (`collection.find().stream()`) piped through Node.js transform streams directly to disk, avoiding client-side memory exhaustion.
- **Consequences and Trade-offs:**
  - _Pros:_ Fast, responsive UI browsing; memory-bounded export streaming.
  - _Cons:_ Deep pagination (>10,000 documents) via UI skip becomes slower; users are encouraged to use targeted filter queries.
- **Current Status:** Implemented in `bridge/src/connectors/mongo.ts` and `bridge/src/services/mongoBulkEngine.ts`.

---

## 4. Data & Schema Management

### ADR-015: Git-Native Schema Versioning and Snapshot Tracking

- **Decision:** Integrate Git directly into the project model to track database schema snapshots, migration histories, and drift detection.
- **Context / Problem:** Schema drift between developer workstations, staging, and production is a primary cause of deployment failures. Traditional tools store migration state solely in a database table without tying it to application Git commits.
- **Chosen Approach:** RelWave projects store declarative schema snapshots inside a local project repository. The application can compare the live database catalog against the committed snapshot in the current Git branch, highlighting drift (added, modified, or dropped tables, columns, collections, or indexes) directly in the UI.
- **Consequences and Trade-offs:**
  - _Pros:_ Version control workflow built into the database client; audit trail of all schema changes; seamless branch switching.
  - _Cons:_ Requires Git to be installed on the user's workstation.
- **Current Status:** Implemented in `bridge/src/services/gitService.ts` and `bridge/src/services/projectStore.ts`.

---

### ADR-016: Probabilistic Schema Inference with Stratified Sampling for Document Stores

- **Decision:** Infer MongoDB collection schemas through statistical sampling rather than attempting full collection scans.
- **Context / Problem:** MongoDB collections have no fixed DDL schema and may contain millions of polymorphic documents. Scanning every document to build a schema explorer or ER diagram would take minutes or hours and overload production clusters.
- **Chosen Approach:** `bridge/src/connectors/mongo.ts` implements schema sampling:
  - Reads up to the configured sample size (default 100 documents, maximum 1,000) using `find()` with `limit` in natural collection order. The read is non-random, so fields that appear only in later documents can be missed or underreported.
  - Analyzes field paths, types, presence frequency, and polymorphism percentages.
  - Detects foreign key relationships by checking for `ObjectId` references matching target collection `_id` values, DBRefs, and embedded arrays.
- **Consequences and Trade-offs:**
  - _Pros:_ Sub-second schema generation; zero noticeable impact on database CPU/IO.
  - _Cons:_ Non-random natural scan may miss or underreport polymorphic fields appearing only in later documents.
- **Current Status:** Implemented in `bridge/src/connectors/mongo.ts` and `bridge/src/services/mongoRelationshipEngine.ts`.

---

### ADR-017: Distinct Migration Paradigms: Relational SQL DDL vs. MongoDB Manifests

- **Decision:** Retain SQL DDL files (`.sql` with `+up`/`+down`) for relational engines, while implementing a declarative JSON manifest migration engine (`.mql.json`) for MongoDB.
- **Context / Problem:** Relational databases have standard DDL statements (`CREATE TABLE`, `ALTER TABLE ADD COLUMN`). MongoDB has no DDL for adding document fields, and applying migrations requires collection operations, index changes, or bulk update pipelines.
- **Chosen Approach:**
  - _SQL Databases:_ Sequential SQL scripts applied within a transaction where supported, tracked via `schema_migrations` table.
  - _MongoDB:_ Declarative `.mql.json` migration manifests specifying typed steps (`createCollection`, `dropCollection`, `createIndex`, `dropIndex`, `setValidator`, `updateMany`) with automated dry-run validation, progress logging in `_relwave_migrations`, and auto-rollback execution.
- **Consequences and Trade-offs:**
  - _Pros:_ Idiomatic migration management for both database paradigms.
  - _Cons:_ Two migration UI cards and serialization engines in the frontend.
- **Current Status:** Implemented in `bridge/src/services/mongoMigrationEngine.ts` and `src/features/mongodb/components/migrations/`.

---

### ADR-018: Distributed Mutex Locking with Monotonic Fencing for MongoDB Migrations

- **Decision:** Protect concurrent MongoDB migration runs using a distributed mutex lock collection (`_relwave_migrations_lock`) with heartbeat renewal and monotonic fencing tokens.
- **Context / Problem:** If two instances of RelWave (or multiple developers) run migrations simultaneously against the same MongoDB database, collections and indexes can be corrupted by interleaved execution.
- **Chosen Approach:** `bridge/src/services/mongoMigrationLock.ts`:
  - Acquires lock via atomic `findOneAndUpdate` with upsert, assigning a unique `ownerId`, `fencingToken`, and a 60-second lease expiration (`expiresAt`).
  - Active migrations renew the lease every 15 seconds via a heartbeat loop with in-flight guard protection.
  - Releasing the lock updates the document to clear ownership while **preserving the monotonic fencing token** (preventing split-brain token reuse).
- **Consequences and Trade-offs:**
  - _Pros:_ Prevents concurrent migration collisions; recovers automatically from crashed processes when lease expires.
  - _Cons:_ Requires write access to the target database.
- **Current Status:** Implemented and verified in `bridge/__tests__/mongoMigrationLock.test.ts`.

---

## 5. Security & Operational Reliability

### ADR-019: Two-Tier Credential Architecture: File AES-256-CBC vs. OS Keyring for SSH

- **Decision:** Store database connection credentials in a local AES-256-CBC encrypted file using an app-level random key, while reserving the OS keyring exclusively for SSH private key passphrases.
- **Context / Problem:** Initial designs proposed storing all database passwords in the system keychain via `@napi-rs/keyring`. In practice, accessing the OS keyring for every background connection pool sweep or automated query triggers frequent OS authentication prompts or fails in headless/CI environments.
- **Chosen Approach:**
  1. _Database Credentials:_ Stored in `.credentials` within the user configuration folder. Encrypted using AES-256-CBC with an app-level 32-byte cryptographically random secret (`relwave.key`, chmod 0o600).
  2. _SSH Passphrases:_ Managed by `KeyringService` using `@napi-rs/keyring` under the service name `relwave-ssh`, providing hardware-backed protection for SSH private keys.
- **Consequences and Trade-offs:**
  - _Pros:_ Seamless database connection pooling without disruptive OS keyring popups; high security for SSH private keys; works consistently across dev and CI.
  - _Cons:_ Database passwords are bound to the local `relwave.key` file rather than the OS login keychain.
- **Current Status:** Implemented in `bridge/src/services/dbStore.ts` and `bridge/src/services/keyringService.ts`.

---

### ADR-020: Query Cancellation & Teardown Lifecycles

- **Decision:** Implement active server-side query cancellation for all supported database engines, coordinated with process teardown guards.
- **Context / Problem:** Long-running analytical queries or unindexed scans can consume server resources indefinitely if the user cancels the query, navigates away, or closes the tab.
- **Chosen Approach:**
  - Each query execution registers a cancel callback in `SessionManager`:
    - PostgreSQL: Calls `client.cancel()`.
    - MySQL/MariaDB: Executes `KILL QUERY <threadId>` over a separate administrative connection.
    - ClickHouse: Aborts the HTTP streaming request via `AbortController`.
    - MongoDB: Aborts the operation via `AbortController` and signals the driver to close the active cursor.
  - Windows Process Teardown: Host process binds the bridge to a Windows Job Object (`JOB_OBJECT_LIMIT_KILL_ON_JOB_CLOSE`), ensuring that if the Tauri UI crashes, Windows terminates the bridge and severs database sockets immediately.
- **Consequences and Trade-offs:**
  - _Pros:_ Immediate server resource recovery upon client cancellation; no orphaned server queries.
  - _Cons:_ Requires managing dedicated out-of-band connections for query killing.
- **Current Status:** Implemented across connectors and `bridge/src/sessionManager.ts`.

---

### ADR-021: Operator Safety Guards and Production Read-Only Enforcement

- **Decision:** Block dangerous MongoDB code execution operators, require explicit confirmations for unrestricted mutations, and enforce read-only connection flags at the bridge handler level.
- **Context / Problem:** In developer database GUIs, accidental execution of unrestricted updates/deletes (e.g. `db.collection.deleteMany({})`) or malicious injection through JavaScript execution operators (`$where`, `$function`) can wipe or compromise databases.
- **Chosen Approach:**
  - _Read-Only Enforcement:_ If a connection is marked `readOnly`, write RPC calls (`db.mutation`, `db.execute`, `migration.apply`, `mongo.bulk.mutate`) are blocked immediately in the bridge before dispatching to the driver.
  - _Dangerous Operator Blacklisting:_ `validatePipelineSafety` in `bridge/src/connectors/mongo.ts` rejects MQL queries or aggregation pipelines containing `$where`, `$function`, `$accumulator`, `$out`, or `$merge`.
  - _Semantic Empty Filter Guard:_ `useMongoBulkMutations` and `mongoSemanticEmpty.ts` detect top-level empty filters (`{}`, whitespace, or empty objects) and require the user to explicitly toggle `allowUnrestricted` before executing mass updates or deletions.
- **Consequences and Trade-offs:**
  - _Pros:_ Defense in depth against catastrophic data loss and code injection.
  - _Cons:_ Legitimate use of `$out` in aggregation workspaces requires exporting to a collection via bulk export instead.
- **Current Status:** Implemented in `bridge/src/connectors/mongo.ts` and `src/features/mongodb/utils/mongoSemanticEmpty.ts`.

---

### ADR-022: Isolated Background Bulk Operations Engine with Orphan Eviction

- **Decision:** Execute bulk imports, bulk exports, and bulk mutations inside a stateful background manager (`mongoBulkEngine.ts`) with chunking, progress telemetry, and automatic orphan eviction.
- **Context / Problem:** Importing or exporting gigabytes of data or running 50,000 document mutations can freeze client memory and crash if UI components unmount during upload.
- **Chosen Approach:**
  - Bulk operations run as background tasks managed by `BulkOperationManager`.
  - Imports are chunked into batches of at most 1,000 documents and 4 MB per chunk (with a 16 MB total cumulative import payload cap), while bulk mutations (`bulkInsert`) support batches up to 5,000 documents or 16 MB.
  - Exports stream directly from cursor to disk using Node.js filesystem streams (supporting JSON, NDJSON, and CSV with dot-notation flattening).
  - Operations are assigned a 2-hour TTL. An automatic background sweep evicts completed, failed, or orphaned operations and deletes temporary export files.
- **Consequences and Trade-offs:**
  - _Pros:_ Safe from UI unmounts; bounded memory consumption; real-time progress percentages.
  - _Cons:_ Export files temporarily consume local disk space until cleaned up.
- **Current Status:** Implemented in `bridge/src/services/mongoBulkEngine.ts` and `src/features/mongodb/hooks/useMongoBulkImport.ts`.

---

## 6. AI Integration

### ADR-023: Multi-Provider LLM Abstraction with Local-First Fallbacks

- **Decision:** Support both cloud-hosted (OpenAI, Anthropic, Gemini, Groq, Mistral, OpenRouter, DeepSeek) and local/private (Ollama) LLM providers through a unified provider interface.
- **Context / Problem:** Different organizations have strict data privacy requirements. Some allow cloud LLM usage for query assistance, while enterprise or privacy-conscious users require completely air-gapped, local LLM execution.
- **Chosen Approach:** `bridge/src/ai/` implements a provider strategy pattern (`aiService.ts`, `ai.impl.ts`). Users configure their preferred provider and model in settings. Local Ollama instances communicate over localhost without sending schemas or data to external clouds.
- **Consequences and Trade-offs:**
  - _Pros:_ Freedom of provider choice; air-gapped privacy option via Ollama.
  - _Cons:_ Must normalize prompt schemas and response formats across differing provider APIs.
- **Current Status:** Implemented in `bridge/src/ai/`.

---

### ADR-024: Engine-Aware Schema Prompt Context and Persistent History Storage

- **Decision:** Inject dialect-specific schema context into LLM prompts and persist query generation history and cache records in a local SQLite store.
- **Context / Problem:** LLMs frequently produce syntax errors when unaware of the target database dialect (e.g., generating Postgres SQL for ClickHouse, or generating SQL for MongoDB). Furthermore, inspecting past AI interactions requires persistent local history.
- **Chosen Approach:**
  - The AI service introspects the active database schema and constructs a minimal, dialect-specific context (e.g., table columns and foreign keys for SQL; collection names, inferred field types, and sample structures for MongoDB).
  - System prompts instruct the LLM to output valid SQL for relational engines and valid MQL/mongosh code for MongoDB.
  - In `NLSqlService.naturalLanguageToSQL`, the service computes a content hash and persists question-to-query history into SQLite via `aiHistoryStore.insert`, calling the provider directly on each query generation request.
  - Cache-first AI features (such as schema analysis and query explanation) use `aiCacheService.getOrCall`, which checks the SQLite history via `aiHistoryStore.findByHash` and stores misses via `aiHistoryStore.insert`, persisting prompts and responses on disk.
- **Consequences and Trade-offs:**
  - _Pros:_ High query generation accuracy across diverse dialects; persistent audit and history log on local disk across restarts.
  - _Cons:_ Natural-language to SQL calls invoke the provider on each request; schema prompt context must be trimmed for massive databases with hundreds of tables to avoid exceeding LLM context windows.
- **Current Status:** Implemented in `bridge/src/services/nlSqlService.ts` and `bridge/src/services/aiCacheService.ts`.
