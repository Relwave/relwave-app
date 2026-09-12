# Utilities (Bridge)

This folder contains small, reusable bridge helpers for paths, database type detection, migration file handling and configuration.

Layout

- `config.ts` - RelWave data directories and file paths. Honors `RELWAVE_HOME` when set.
- `dbTypeDetector.ts` - maps saved database records to `DBType`.
- `sqlitePath.ts` - SQLite path normalization and resolution helpers.
- `migrationGenerator.ts` - SQL migration file generation for create, alter and drop flows.
- `migrationFileReader.ts` - migration file parsing/reading helpers.
- `baselineMigration.ts` - local baseline migration loading and writing helpers.

How it fits

- Services and connectors use these helpers for filesystem paths, database type decisions and migration workflows.
- `config.ts` is the source of truth for bridge persistence locations, including databases, projects, migrations and connection folders.
- Migration utilities are used by migration handlers and connectors to generate, read and reconcile local migration files.

How to add a utility

1. Add utilities here only when they are reusable and do not own business state.
2. Keep functions deterministic where possible and pass dependencies in as parameters.
3. Use `config.ts` path helpers for filesystem locations instead of hardcoding OS-specific paths.
4. Add tests for parsing, path resolution or SQL generation behavior that can regress quietly.

Notes

- Utilities should not send JSON-RPC responses or import frontend code.
- Keep database-specific SQL in `src/queries`; use utility helpers for generation/parsing logic that is shared by workflows.
- Avoid storing secrets in files managed by utility paths. Credentials should go through `keyringService`.
