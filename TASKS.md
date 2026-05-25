You are working on RelWave, a Tauri-based desktop database visualizer.
Before doing anything else, read the following files completely:

1. AGENTS.md — conventions, stack, and guidelines you must follow
2. Every file listed in the directory structure below

Read them silently. Do not summarize them back to me. Once you have
read everything, generate two markdown files and place them in the
project root.

---

## Step 1 — Files to read before writing anything

Read these files in this order:

### Root
- AGENTS.md
- package.json (root, if present)

### Bridge entry point and protocol
- bridge/src/index.ts
- bridge/src/jsonRpc.ts
- bridge/src/jsonRpcHandler.ts
- bridge/src/sessionManager.ts

### Bridge handlers (read all of them)
- bridge/src/handlers/databaseHandlers.ts
- bridge/src/handlers/queryHandlers.ts
- bridge/src/handlers/sessionHandlers.ts
- bridge/src/handlers/statsHandlers.ts
- bridge/src/handlers/migrationHandlers.ts
- bridge/src/handlers/monitoringHandlers.ts
- bridge/src/handlers/projectHandlers.ts
- bridge/src/handlers/gitHandlers.ts
- bridge/src/handlers/gitAdvancedHandlers.ts

### Bridge services (read all of them)
- bridge/src/services/connectionBuilder.ts
- bridge/src/services/connectionPool.ts
- bridge/src/services/connectorRegistry.ts
- bridge/src/services/databaseService.ts
- bridge/src/services/dbStore.ts
- bridge/src/services/discoveryService.ts
- bridge/src/services/gitService.ts
- bridge/src/services/monitoringService.ts
- bridge/src/services/monitoringWebSocketServer.ts
- bridge/src/services/projectStore.ts
- bridge/src/services/queryExecutor.ts
- bridge/src/services/logger.ts

### Bridge connectors
- bridge/src/connectors/postgres.ts
- bridge/src/connectors/mysql.ts
- bridge/src/connectors/mariadb.ts
- bridge/src/connectors/sqlite.ts

### Bridge types
- bridge/src/types/common.ts
- bridge/src/types/index.ts
- bridge/src/types/postgres.ts
- bridge/src/types/mysql.ts
- bridge/src/types/sqlite.ts
- bridge/src/types/cache.ts

### Bridge utils
- bridge/src/utils/config.ts
- bridge/src/utils/dbTypeDetector.ts
- bridge/src/utils/migrationGenerator.ts
- bridge/src/utils/migrationFileReader.ts
- bridge/src/utils/baselineMigration.ts
- bridge/src/utils/sqlitePath.ts

### Bridge query modules (scan, do not read line by line)
- bridge/src/queries/postgres/
- bridge/src/queries/mysql/
- bridge/src/queries/sqlite/

### Frontend entry and routing
- src/main.tsx (or src/App.tsx — whichever is the entry point)

### Frontend bridge service layer
- Every file under src/services/bridge/

### Frontend features (read the types and hooks, scan the components)
- Every types.ts under src/features/
- Every hooks file under src/features/
- One representative component per feature to understand structure

### Tauri layer
- src-tauri/tauri.conf.json
- src-tauri/src/main.rs (or src-tauri/src/lib.rs)

---

## Step 2 — Generate ARCHITECTURE.md

Write a thorough, accurate ARCHITECTURE.md that covers:

### 1. System Overview
A prose description of how the three layers (Frontend, Bridge, Tauri)
fit together. Include a simple ASCII diagram showing the data flow:
  React UI → JSON-RPC → Tauri Rust layer → stdin/stdout → Node.js bridge

### 2. Bridge Deep Dive
- How the JSON-RPC dispatcher works (index.ts → jsonRpcHandler.ts flow)
- How to add a new command: exact steps with file names
- How sessions are managed (sessionManager.ts)
- How connection pools are created and torn down
- How the connector registry maps DB types to connector implementations
- How query results are streamed back to the frontend

### 3. Frontend Deep Dive
- How features are structured (the pattern every feature follows)
- How bridge calls are made from the frontend (the service layer pattern)
- How state is managed (TanStack Query caching strategy)
- How errors from the bridge surface to the user

### 4. Database Query Organization
- How queries are organized per engine under bridge/src/queries/
- What each module (tables, schema, crud, migrations, stats, constraints) is responsible for
- How to add queries for a new operation

### 5. Adding a New Feature (end-to-end checklist)
A numbered checklist an agent or contributor can follow to add a
feature that touches both bridge and frontend. Be specific about
file names and locations, not generic.

### 6. Key Data Flows
Trace these specific flows through the actual code, naming real
files and functions:
- Connect to a database
- Execute a SQL query and stream results
- Run a migration
- Monitor a live database metric

### 7. Testing
- Where tests live and how they are organized
- How to run unit tests vs integration tests
- What the Docker Compose test setup provides
- How to add a test for a new handler

---

## Step 3 — Generate DECISIONS.md

Write a DECISIONS.md that documents the non-obvious architectural
decisions in this codebase. For each decision, use this format:

## [Short title of the decision]
**What:** One sentence describing what was chosen.
**Why:** The actual reason — inferred from the code and stack if not
explicitly documented. Be specific, not generic.
**Trade-off:** What was given up or what this makes harder.

Decisions to document (infer the why from the code):

1. Node.js sidecar over native Tauri Rust commands for DB access
2. JSON-RPC over stdin/stdout as the bridge protocol
3. better-sqlite3 (synchronous) over async SQLite drivers
4. Per-engine query modules (queries/postgres, queries/mysql, etc.)
   instead of a single abstracted query layer
5. @napi-rs/keyring for credential storage over config file encryption
6. simple-git over shelling out to the git binary
7. React Query (TanStack Query) for all bridge call state
8. pino for logging in the bridge
9. pkg for bundling the Node.js bridge into a single binary
10. The connector registry pattern (connectorRegistry.ts) over direct
    imports in handlers
11. Session-based event filtering for streaming query results
12. Separate monitoring connection pool from the main pool

If you find additional non-obvious decisions while reading the code
that are not in the list above, include those too.

---

## Output requirements

- Write both files in clean, well-structured markdown
- Use headers, subheaders, and code blocks where appropriate
- Be specific — use real file paths, real function names, real type
  names from the code you read
- Do not pad with generic advice that applies to any project
- Do not include anything you are not certain about from reading
  the actual files — if something is ambiguous, say so inline
- Place both files in the project root as ARCHITECTURE.md and
  DECISIONS.md
