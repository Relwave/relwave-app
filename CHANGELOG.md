# Changelog

All notable changes to the RelWave project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

---

## [Unreleased]

## [1.3.0] - 2026-11-17

### Added

- **MongoDB Document Database Support:**
  - Official `mongodb` driver v6 integration with connection support for standalone (`mongodb://`), replica sets, and MongoDB Atlas SRV (`mongodb+srv://`).
  - Structural connector registry integration with runtime `connectorKind` dispatch (`"nosql"`).
  - High-performance collection tree explorer and database stats visualizer.
  - Full document CRUD operations with paginated viewing and inline editing dialogs.
  - Canonical Extended JSON v2 (EJSON) serialization preserving BSON fidelity (`ObjectId`, `ISODate`, `Long`, `Decimal128`, `Binary`, `Timestamp`, `Regex`).
  - Probabilistic schema inference with stratified sampling (100–1,000 documents), polymorphic type detection, and presence frequency calculation.
  - Visual Aggregation Pipeline Composer supporting `$match`, `$group`, `$project`, `$sort`, `$unwind`, and `$lookup` stages with live preview and explain visualizer.
  - Client-side mongosh query parser translating shell syntax (`db.collection.find(...)`, `aggregate(...)`) into structured driver calls.
  - Declarative migrations runner with compensation rollback logic and distributed mutex locking (`_relwave_migrations_lock`) using monotonic fencing tokens.
  - MongoDB Index Management panel to inspect, create, drop, and hide indexes (single-field, compound, text, TTL, 2dsphere).
  - Interactive React Flow ER diagrams with ObjectId and DBRef relationship inference and persistent canvas layouts.
  - Streaming background bulk operations engine supporting NDJSON, JSON array, and CSV imports and exports with progress notifications and pause/resume capabilities.

### Security & Reliability

- Connection-level `readOnly` mode validation enforced at the JSON-RPC bridge boundary before driver dispatch.
- Mandatory semantic empty filter validation (`allowUnrestricted: true`) blocking accidental whole-collection wipeouts.
- Pipeline safety blacklisting preventing execution of dangerous server-side operators (`$where`, `$function`, `$accumulator`, `$out`, `$merge`).
- Automated MongoDB URI credential sanitization in logs, exceptions, and error payloads (`safeMongoError` / `redactMongoUri`).
- Windows Job Object containment (`JOB_OBJECT_LIMIT_KILL_ON_JOB_CLOSE`) ensuring child process and socket teardown on host shutdown.
- Request-scoped query cancellation via `AbortController` across cursor streams and bulk data transfers.

---

## [1.2.0] - 2026-10-15

### Added

- **Analytical & Columnar Database Engines:**
  - ClickHouse connector via `@clickhouse/client` over HTTP/HTTPS with `MergeTree` introspection and data skipping index detection.
  - Embedded DuckDB analytical engine via `@duckdb/node-api` with in-process columnar querying.
- **Embedded Database Support:**
  - SQLite connector via `better-sqlite3` with native file dialog integration.
- **Git-Native Schema Versioning:**
  - Direct branch switching, commit dialogs, and schema snapshot tracking within the desktop client.
  - Visual schema drift detection comparing live database schemas against committed Git snapshots.
- Query history drawer with execution timing and row count metrics.

---

## [1.1.0] - 2026-09-01

### Added

- **Relational Database Connectors:**
  - PostgreSQL connector via `pg` and `pg-query-stream` with server-side cancellation (`client.cancel()`).
  - MySQL and MariaDB connectors via `mysql2` with cancelable thread execution (`KILL QUERY`).
- **Interactive SQL Workspace:**
  - CodeMirror 6 SQL editor with syntax highlighting, autocomplete, and multi-tab query execution.
  - Visual query builder for relational schemas.
- **AI Query Assistant:**
  - Natural-language-to-SQL generation with multi-provider integration (OpenAI, Anthropic, Google Gemini, Ollama).
  - Dialect-aware schema context injection and LRU prompt caching.
- **Security & Tunneling:**
  - Two-tier credential storage: AES-256-CBC local encrypted storage for database passwords; OS keyring integration via `@napi-rs/keyring` for SSH private key passphrases.
  - Integrated SSH bastion host tunneling via `ssh2`.

---

## [1.0.0] - 2026-07-20

### Added

- Initial public release of RelWave desktop application.
- Tri-layer desktop architecture: React 19 SPA + Tauri 2 Rust Shell + Node.js 22 Bridge Engine.
- JSON-RPC 2.0 protocol framed with newline-delimited JSON over standard streams (`stdin` / `stdout`).
- Cross-platform packaging support for Windows (NSIS) and Linux (AppImage / Deb).
