# Database Connectors (Bridge)

This folder contains database-specific connector implementations used by the bridge to execute metadata, query, migration and CRUD operations.

Layout

- `postgres.ts` - PostgreSQL connector, cache manager, metadata helpers, streaming query support and PostgreSQL-specific DDL/DML behavior.
- `mysql.ts` - MySQL connector for schema/table metadata, stats, migrations and query execution.
- `mariadb.ts` - MariaDB connector. Keep MariaDB behavior separate when it diverges from MySQL.
- `sqlite.ts` - SQLite connector using `better-sqlite3`, local file handling and SQLite-specific migration/query behavior.

How it fits

- `src/services/queryExecutor.ts` routes bridge operations to the correct connector based on `DBType`.
- SQL strings should come from `src/queries/*` where practical, not be duplicated inline.
- Shared result shapes come from `src/types/common.ts`; database-specific config and metadata types live in `src/types/postgres.ts`, `src/types/mysql.ts` and `src/types/sqlite.ts`.
- Connection config objects are built by `src/services/connectionBuilder.ts`; connectors generally create their own driver client from that config for each operation.

How to add connector behavior

1. Add database-specific SQL to `src/queries/<db>/` when the operation needs raw SQL.
2. Add or update typed method support in the relevant connector file.
3. Route the operation from `QueryExecutor` or the owning service.
4. Register any new public RPC method through a handler in `src/handlers`.

Notes

- Keep connector methods focused on database interaction. Do not read UI payloads directly or handle RPC responses here.
- Invalidate or bypass connector caches when an operation mutates schema, table data or migration state.
- Prefer shared common types unless a database really needs extra metadata fields.
