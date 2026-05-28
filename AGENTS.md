# RelWave Agent Context

Welcome to the RelWave project. This document provides essential context for AI agents working on this codebase.

## 🏗️ Architecture

RelWave uses a **Bridge Architecture** to balance performance, security, and developer flexibility.

- **Frontend (Tauri + React):** A modern desktop UI built with React 19, TypeScript, and Tailwind CSS 4.
- **Bridge (Node.js):** A separate Node.js process that handles heavy lifting like database connections, Git operations, and file system tasks.
- **Communication:** The frontend and bridge communicate over **JSON-RPC via stdin/stdout**, managed by the Tauri Rust layer.

## 🛠️ Tech Stack

### Frontend
- **Framework:** React 19
- **Build Tool:** Vite
- **Styling:** Tailwind CSS 4, shadcn/ui (Radix UI)
- **State Management:** TanStack Query (React Query)
- **Visualizations:** React Flow (ER Diagrams), Recharts (Analytics), tldraw (Whiteboarding)
- **Editor:** CodeMirror 6 (SQL editing)

### Bridge (Node.js)
- **Runtime:** Node.js (bundled via `pkg`)
- **Database Drivers:** `pg` (PostgreSQL), `mysql2` (MySQL/MariaDB), `better-sqlite3` (SQLite)
- **Version Control:** `simple-git`
- **Logging:** `pino`
- **Security:** `@napi-rs/keyring` for encrypted credential storage

### Desktop Layer
- **Framework:** Tauri 2 (Rust)

## 📂 Key Directories

- `src/`: React frontend application.
  - `components/`: UI components (atomic, layout, shared).
  - `features/`: Business logic divided by domain (database, git, er-diagram, etc.).
  - `services/bridge/`: JSON-RPC client implementation for talking to the bridge.
- `bridge/`: Node.js bridge source code.
  - `src/connectors/`: Database-specific connection logic.
  - `src/handlers/`: JSON-RPC request handlers.
  - `src/services/`: Core business logic (GitService, DatabaseService).
- `src-tauri/`: Rust backend and Tauri configuration.
- `scripts/`: Development and build automation scripts.

## 🚦 Development Guidelines

1. **Type Safety:** Always prioritize TypeScript types. Ensure interfaces are shared or matched between the frontend and bridge.
2. **Bridge Protocol:** When adding new functionality that requires OS or DB access, implement a handler in `bridge/src/handlers` and a corresponding service method in `src/services/bridge`.
3. **Styling:** Use Tailwind CSS 4 utility classes. Prefer components from `src/components/ui`.
4. **Error Handling:** Use the established JSON-RPC error format to ensure errors from the bridge are gracefully handled in the UI via `sonner` notifications.
5. **Testing:** Bridge logic should be tested in `bridge/__tests__` using Jest.

## 📝 Conventions

- **File Naming:** PascalCase for components (`MyComponent.tsx`), camelCase for utilities and hooks.
- **Imports:** Use absolute paths where configured (e.g., `@/components/...`).
- **Icons:** Use `lucide-react` for all iconography.
