# Services (Bridge)

This folder contains bridge business logic and persistence services. Services sit between RPC handlers and low-level connectors, stores, keyrings, Git, filesystem and monitoring utilities.

Layout

- `databaseService.ts` - database metadata lifecycle, credential lookup and connection config retrieval.
- `queryExecutor.ts` - database-agnostic dispatcher for schema, table, query, CRUD and migration operations.
- `connectionBuilder.ts` - builds driver config objects and optional SSH tunnel wiring.
- `connectionPool.ts` - caches resolved connection configs and tunnel handles by database id.
- `connectorRegistry.ts` - maps database types to connector implementations.
- `dbStore.ts` - persisted database connection metadata and credential references.
- `projectStore.ts` - project files, schema snapshots, ER diagrams, annotations, saved queries and local project config.
- `gitService.ts` - local Git operations used by Git handlers.
- `keyringService.ts` - encrypted credential storage through `@napi-rs/keyring`.
- `sshTunnelService.ts` - SSH tunnel creation and cleanup.
- `discoveryService.ts` - local database discovery.
- `monitoringService.ts` and `monitoringWebSocketServer.ts` - database monitoring snapshots and websocket broadcast support.
- `ai.impl.ts`, `aiService.ts`, `aiCacheService.ts`, `aiHistoryStore.ts` - AI service factory, compatibility shim, cache and history persistence.
- `logger.ts` - shared pino logger.

How it fits

- Handlers call services to do real work; services should not know about UI components.
- Services call connectors, stores and utilities, then return plain data to handlers.
- Persistent paths are defined in `src/utils/config.ts`.
- Shared types come from `src/types`.

How to add service behavior

1. Put durable business logic here when it is shared by multiple handlers or has state/persistence concerns.
2. Keep public methods small and typed enough for handler use.
3. Let handlers translate thrown errors into JSON-RPC errors.
4. Invalidate connection or metadata caches when mutating database/project state.
5. Add focused tests under `bridge/__tests__` for services with persistence, Git, credential or connector logic.

Notes

- Keep secrets out of logs and return values.
- Avoid long-lived open database sockets unless the connection pool explicitly owns them.
- When adding filesystem writes, use paths derived from `src/utils/config.ts` so RelWave respects `RELWAVE_HOME`.
