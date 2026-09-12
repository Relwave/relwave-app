# SQL Queries (Bridge)

This folder contains centralized SQL query strings and SQL helper functions for supported database engines.

Layout

- `index.ts` - central export for all query modules.
- `postgres/` - PostgreSQL SQL grouped by schema, tables, constraints, stats, migrations and CRUD.
- `mysql/` - MySQL SQL grouped by schema, tables, columns, constraints, stats, migrations and CRUD.
- `sqlite/` - SQLite SQL grouped by schema, tables, constraints, stats, migrations and CRUD.

How it fits

- Connectors import query constants from this folder and bind parameters through their database driver.
- Query modules keep SQL text out of service and handler code.
- Database-specific quoting helpers, such as CRUD identifier quoting, live beside the SQL for that engine.

How to add a query

1. Add the SQL constant or helper to the matching database folder.
2. Export it from that database folder's `index.ts` if other modules need central imports.
3. Use parameter placeholders supported by the target driver.
4. Keep result column aliases compatible with `src/types/common.ts` where possible.
5. Add database-specific types under `src/types` only when the common shape is not enough.

Notes

- Do not concatenate user-controlled identifiers or values directly into SQL. Use driver parameters for values and vetted quote helpers for identifiers.
- Keep equivalent queries across PostgreSQL, MySQL/MariaDB and SQLite aligned so `QueryExecutor` can return consistent frontend shapes.
- If a query intentionally excludes system schemas or internal tables, document that behavior near the SQL constant.
