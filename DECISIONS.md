# Architectural Decisions

This document records the non-obvious architectural decisions in the RelWave codebase.

---

## 1. Node.js sidecar over native Tauri Rust commands for DB access
**What:** Using a standalone Node.js process (the "Bridge") to handle database drivers instead of writing them in Rust.
**Why:** The JavaScript ecosystem has extremely mature, well-tested, and performant database drivers (e.g., `pg`, `mysql2`, `better-sqlite3`). Re-implementing these or integrating their Rust counterparts would have significantly increased complexity and slowed development.
**Trade-off:** Higher memory overhead due to a separate Node.js runtime and the need for a serialization layer (JSON-RPC) between the UI and the driver.

## 2. JSON-RPC over stdin/stdout as the bridge protocol
**What:** Choosing standard input/output streams with newline-delimited JSON-RPC 2.0 as the communication channel.
**Why:** It is a language-agnostic, lightweight, and reliable way to communicate between the Tauri host and the Node.js sidecar without the overhead of a network socket or the security risks of an open port.
**Trade-off:** Limited to string-based communication; binary data must be base64-encoded, which increases payload size.

## 3. better-sqlite3 (synchronous) over async SQLite drivers
**What:** Using the `better-sqlite3` library which executes queries synchronously.
**Why:** `better-sqlite3` is significantly faster than asynchronous alternatives like `sqlite3`. Since the bridge is already a separate process, its synchronous nature does not block the main UI thread.
**Trade-off:** The bridge event loop is blocked during heavy SQLite operations, which is why the bridge uses a separate process per query session for other engines (but SQLite is still limited by file locks).

## 4. Per-engine query modules instead of a single abstracted query layer
**What:** Organizing SQL queries into engine-specific files (e.g., `queries/postgres`, `queries/mysql`) rather than using a generic ORM or abstraction layer.
**Why:** Every database engine has unique introspection queries, metadata structures, and performance optimizations. A single abstraction layer often results in "lowest common denominator" features or overly complex "leaky" abstractions.
**Trade-off:** More boilerplate when adding a new engine, as similar queries must be implemented multiple times.

## 5. Custom AES-256-CBC encryption for credential storage
**What:** Implementing a custom encryption layer for passwords using Node.js `crypto` module, stored in a local `.credentials` file.
**Why:** Provides a consistent, cross-platform way to protect sensitive database passwords without requiring platform-specific native dependencies during initial development. 
**Trade-off:** Not as secure as using the system-native keychain (like Windows Credential Manager or macOS Keychain). *Note: `@napi-rs/keyring` is present in package.json for future migration.*

## 6. Shelling out to the git binary over a library
**What:** Using `child_process.execFile` to run `git` commands directly instead of using a library like `simple-git`.
**Why:** Minimizes dependencies and ensures that the user's existing Git configuration and version are respected. It also avoids the performance overhead of a large JS wrapper.
**Trade-off:** Requires the user to have Git installed and on their system PATH.

## 7. React Query (TanStack Query) for all bridge call state
**What:** Using TanStack Query as the primary mechanism for managing data fetched from the bridge.
**Why:** It provides "out-of-the-box" support for caching, deduplication of concurrent requests, loading/error states, and background refetching, which is essential for a data-heavy application.
**Trade-off:** Adds a layer of complexity to the frontend and requires a specific mental model for data management.

## 8. pino for logging in the bridge
**What:** Using the `pino` logger and redirecting its output to `stderr`.
**Why:** High-performance, low-overhead logging. By using `stderr` (via `pino.destination(2)`), logs do not interfere with the JSON-RPC messages on `stdout`.
**Trade-off:** Log levels must be filtered on the Tauri side to prevent flooding the developer console.

## 9. pkg for bundling the Node.js bridge into a single binary
**What:** Using `@yao-pkg/pkg` to compile the Node.js bridge into a standalone executable.
**Why:** Simplifies distribution by ensuring the user does not need to have Node.js installed on their machine. It also protects the source code of the bridge to some extent.
**Trade-off:** Increases the size of the final application bundle and can be tricky to configure for native modules like `better-sqlite3`.

## 10. The connector registry pattern
**What:** A centralized registry (`connectorRegistry.ts`) that maps database types to their connector implementations.
**Why:** Decouples the RPC handlers from the specific engine logic. This makes it trivial to add support for new databases (like ClickHouse or DuckDB) without modifying the core handler logic.
**Trade-off:** Requires a strict interface (`Connector`) that all database engines must adhere to.

## 11. Session-based event filtering for streaming query results
**What:** Tagging streaming notifications (like `query.batch`) with a `sessionId`.
**Why:** Allows the frontend to distinguish between results from multiple concurrent queries running in different tabs or windows.
**Trade-off:** Requires the frontend to maintain a mapping of active sessions and their corresponding UI components.

## 12. Separate monitoring connection pool
**What:** Using a dedicated connection pool for the `MonitoringService` that is independent of the main query pool.
**Why:** Ensures that we can still collect database metrics even if the main connection pool is exhausted or if a query is currently blocking the connection.
**Trade-off:** Increases the number of active connections to the database server.
