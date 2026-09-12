# Types (Bridge)

This folder contains TypeScript types shared across bridge handlers, services, connectors and query result mapping.

Layout

- `index.ts` - central export plus `DBType`, `Rpc`, `DatabaseConfig` and `QueryParams`.
- `common.ts` - shared database metadata shapes such as tables, columns, keys, indexes, constraints, stats, migrations and SSH config.
- `postgres.ts` - PostgreSQL config and PostgreSQL-specific metadata/DDL types.
- `mysql.ts` - MySQL and MariaDB config and metadata types.
- `sqlite.ts` - SQLite config and metadata types.
- `cache.ts` - cache entry and TTL types used by connector caches.
- `ai.ts` - AI provider, prompt, result, history and error types.

How it fits

- Connectors use these types for database-specific configs and normalized result shapes.
- Services use these types to avoid duplicating payload contracts.
- Handlers should return data that matches these types where possible, then frontend bridge services mirror the same shape.

How to add or change types

1. Prefer extending `common.ts` when a shape applies across database engines.
2. Use database-specific files only for engine-specific fields or operations.
3. Re-export new public types from `index.ts`.
4. Update connector and frontend types together when changing RPC response shapes.

Notes

- Keep these files type-only. Runtime helpers belong in `src/utils` or `src/services`.
- Avoid widening everything to `any`; use explicit optional fields when a database can omit metadata.
- Be careful with credential-bearing types. Public response shapes should not include plaintext passwords.
