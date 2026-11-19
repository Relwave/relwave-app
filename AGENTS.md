# RelWave Agent Context & Guidelines

Welcome to the RelWave project. This document provides essential, actionable instructions for AI coding agents and human engineers working on this codebase.

> **Before Starting Work:**
>
> 1. Read [DECISION.md](DECISION.md) for architectural decision records and non-obvious engineering trade-offs.
> 2. Read [ARCHITECTURE.md](ARCHITECTURE.md) for deep-dive component diagrams, data flows, and subsystem layouts.
> 3. Read [ROADMAP.md](ROADMAP.md) and [CHANGELOG.md](CHANGELOG.md) for current release status, verified capabilities, and prioritized roadmap.

---

## 🏗️ Architecture & Component Boundaries

RelWave operates as a **tri-layer desktop architecture**:

1. **Frontend (`src/`):** React 19 + TypeScript + Tailwind CSS 4 SPA running inside Tauri's webview. Purely handles UI, routing, and state. Has zero direct network socket or filesystem access.
2. **Desktop Shell (`src-tauri/`):** Tauri 2 + Rust application host. Manages windowing, system tray, native file dialogs, and supervises the bridge child process via standard I/O pipes.
3. **Bridge Engine (`bridge/`):** Standalone Node.js 22 runtime (compiled via `@yao-pkg/pkg`). Executes all database drivers, SSH tunneling, Git CLI commands, and file operations.
4. **Communication:** JSON-RPC 2.0 framed with newline-delimited JSON (`\n`) over standard streams (`stdin` / `stdout`). Standard error (`stderr`) is strictly reserved for `pino` structured logs (`pino.destination(2)`).

---

## 🛠️ Technology Stack & Key Drivers

- **Frontend:** React 19, Vite, Tailwind CSS 4, shadcn/ui (Radix UI), TanStack Query v5, CodeMirror 6, React Flow (`@xyflow/react`), Recharts.
- **Bridge Core:** Node.js 22, `pino`, `uuid`, `dotenv`, `ws`.
- **Database Connectors (`bridge/src/connectors/`):**
  - PostgreSQL: `pg` (^8.16.3) + `pg-query-stream`
  - MySQL / MariaDB: `mysql2` (^3.15.3)
  - SQLite: `better-sqlite3` (^11.9.0, synchronous C++ addon)
  - DuckDB: `@duckdb/node-api` (1.5.6-r.1, in-process columnar engine)
  - ClickHouse: `@clickhouse/client` (^1.24.1, HTTP/HTTPS client)
  - MongoDB: `mongodb` (^6.21.0, official driver) + BSON Canonical Extended JSON v2
- **Security & Version Control:**
  - Database Credential Storage: AES-256-CBC with scrypt key derivation and local 32-byte app secret (`relwave.key`) in `bridge/src/services/dbStore.ts`.
  - SSH Keychain: `@napi-rs/keyring` (used **exclusively** for SSH private key passphrases and passwords in `bridge/src/services/keyringService.ts`).
  - Version Control: `child_process.execFile` invoking system `git`.

---

## 📂 Key Directory Layout

```text
RelWave/
├── src/                          # React frontend
│   ├── components/               # Atomic UI components (shadcn/ui, layout)
│   ├── features/                 # Modular domain features
│   │   ├── mongodb/              # MongoDB MQL, aggregations, bulk, BSON
│   │   ├── workspace/            # SQL editor, query tabs, grid viewer
│   │   ├── schema-explorer/      # Database & collection tree explorer
│   │   ├── er-diagram/           # React Flow ER diagrams
│   │   └── migrations/           # SQL migration runners
│   └── services/bridge/          # JSON-RPC service wrappers
├── bridge/                       # Node.js backend
│   ├── src/
│   │   ├── connectors/           # Engine-specific driver modules
│   │   ├── handlers/             # JSON-RPC request & notification handlers
│   │   ├── services/             # Core business logic (Pool, Git, Bulk, Migrations)
│   │   ├── ai/                   # Multi-provider LLM integrations
│   │   └── jsonRpcHandler.ts     # Central RPC method router
│   ├── scripts/                  # Seeding & native module packaging scripts
│   └── __tests__/                # Jest unit and integration tests
├── src-tauri/                    # Rust host application
│   ├── src/bridge/process.rs     # Child process spawning & Job Object supervision
│   └── tauri.conf.json           # Packaging & resource mapping configuration
└── docs/                         # Specifications and architectural references
```

---

## 🚦 Engineering Rules & Invariants

### 1. Adding a New Database Connector

To add a new database engine:

1. Define the engine in `bridge/src/types/index.ts` (`DBType`).
2. Add the engine kind (`"sql"` or `"nosql"`) to `bridge/src/services/connectorKind.ts`.
3. Implement driver logic in `bridge/src/connectors/<engine>.ts` exporting standard functions (`testConnection`, `listTables`, `getDBStats`).
4. Register the module in `bridge/src/services/connectorRegistry.ts`.
5. Update `ConnectionBuilder` in `bridge/src/services/connectionBuilder.ts` to construct the engine's configuration.
6. In the frontend, add the connection form fields in `src/features/connection/` and hook UI workspaces based on `connectorKind`.

### 2. Bridge Protocol & JSON-RPC Conventions

- All RPC method names follow domain prefixes: `db.*`, `query.*`, `git.*`, `migration.*`, `mongo.*`, `ai.*`.
- Requests require a unique `id` and return `{ jsonrpc: "2.0", id, result }` or `{ jsonrpc: "2.0", id, error: { code, message, data } }`.
- Streaming notifications omit `id` and must include a `sessionId` or `operationId` (e.g. `query.batch`, `mongo.bulk.progress`).
- **Never write non-protocol text to `stdout`**: All logs must use `logger` (`stderr`). Writing `console.log` to stdout corrupts the JSON-RPC framing and crashes the bridge pipe.

### 3. Security Invariants

- **Credential Storage Boundary:** Database passwords are encrypted via AES-256-CBC and stored in `.credentials`. Do **not** route database connection passwords through `@napi-rs/keyring`. Keyring access is strictly reserved for SSH credentials in `keyringService.ts`.
- **Credential Redaction:** Any error message, exception, or log that may contain connection strings must pass through URI sanitization (e.g. `safeMongoError` / `redactMongoUri`).
- **Read-Only Enforcement:** If `config.readOnly` is true, write operations (`insert`, `update`, `delete`, `drop`, `alter`, `migration.apply`, `bulk.mutate`) must be blocked in the bridge handler before reaching the driver.
- **Dangerous Operator Blacklisting:** In document/NoSQL engines, dangerous code execution operators (`$where`, `$function`, `$accumulator`, `$out`, `$merge`) must be validated and rejected.
- **Semantic Empty Filter Defense:** Massive mutations without filters (`{}`) must require an explicit user override flag (`allowUnrestricted: true`).

### 4. Connection Lifecycle & Teardown

- Never leave open database sockets or cursors. When closing or reconnecting a database, call `connectionPool.safeClose*()` or `closeAll()`.
- Attach `.finally()` to asynchronous deferred cleanup promises to prevent Temporal Dead Zone (TDZ) reference errors during synchronous promise execution.
- In long-running queries, always register cancellation callbacks with `SessionManager`.

### 5. Native Modules & Packaging Constraints

- Native C++ addons (`better_sqlite3.node`, `duckdb.dll`, `@napi-rs/keyring`) must be marked as external in `bridge/package.json` esbuild configuration.
- Native binaries must be copied into `src-tauri/resources/` via `bridge/scripts/copy-native.js`.
- Any new native dependency must be verified for both development execution (`pnpm dev`) and packaged Tauri release builds (`pnpm run build:tauri-assets`).

---

## 🧪 Testing & Verification Requirements

Before submitting code, all three validation suites must pass with zero errors:

1. **Frontend Tests:**

   ```bash
   pnpm test
   ```

   Runs Node test runner across `src/__tests__` and `src/features/mongodb/__tests__` (470+ tests).

2. **Bridge Tests:**

   ```bash
   pnpm --dir bridge test
   ```

   Runs Jest across `bridge/__tests__` (54 suites, 1070+ tests). Requires local or Docker test containers for live database connector tests.

3. **Linter & Formatting:**

   ```bash
   pnpm lint
   pnpm format:check
   ```

   Strict rule: **Zero ESLint errors and zero ESLint warnings**. Format must match Prettier.

4. **TypeScript Type Checking:**
   ```bash
   npx tsc --noEmit
   ```

---

## 📝 Conventions

- **File Naming:** PascalCase for React components (`MongoMqlEditor.tsx`), camelCase for utilities, hooks, and services (`useMongoBulkImport.ts`, `connectionPool.ts`).
- **Path Imports:** Use absolute path aliases `@/...` in the frontend (mapping to `src/...`).
- **Icons:** Use `lucide-react` exclusively for iconography.
- **Documentation Updates:** When adding, changing, or deprecating architectural patterns, update [DECISION.md](DECISION.md), [ARCHITECTURE.md](ARCHITECTURE.md), and [CHANGELOG.md](CHANGELOG.md) in the same change.
