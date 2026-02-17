<div align="center">

<img src="public/wave.png" alt="RelWave Logo" width="140" />

# RelWave

### Modern Database Management, Visualization & Version Control

A powerful, cross-platform desktop application for database management with native Git version control — built with Tauri, React, and TypeScript.

[![Version](https://img.shields.io/badge/version-0.2.0--beta.1-0066ff?style=for-the-badge)](https://github.com/Relwave/relwave-app/releases)
[![License](https://img.shields.io/badge/license-MIT-00cc66?style=for-the-badge)](LICENSE)
[![Platform](https://img.shields.io/badge/platform-Windows%20%7C%20Linux-lightgray?style=for-the-badge)](https://github.com/Relwave/relwave-app/releases)

[**Download**](https://github.com/Relwave/relwave-app/releases) · [**Features**](FEATURES.md) · [**Quick Start**](#quick-start) · [**Documentation**](#documentation)

</div>

---

## Overview

**RelWave** is a desktop-native database management tool that brings together schema exploration, data visualization, query building, and Git version control into a single cohesive interface. It connects directly to your databases using native drivers — no browser, no cloud dependency, no compromise.

<table>
<tr>
<td width="25%" align="center">
<img src="https://raw.githubusercontent.com/PKief/vscode-material-icon-theme/main/icons/database.svg" width="48" /><br/>
<strong>Native Performance</strong><br/>
Direct database connections without browser overhead
</td>
<td width="25%" align="center">
<img src="https://raw.githubusercontent.com/PKief/vscode-material-icon-theme/main/icons/lock.svg" width="48" /><br/>
<strong>Secure by Design</strong><br/>
Encrypted credentials with machine-level protection
</td>
<td width="25%" align="center">
<img src="https://cdn.jsdelivr.net/gh/devicons/devicon@latest/icons/git/git-original.svg" width="48" /><br/>
<strong>Git Native</strong><br/>
Built-in version control for database projects
</td>
<td width="25%" align="center">
<img src="https://raw.githubusercontent.com/PKief/vscode-material-icon-theme/main/icons/settings.svg" width="48" /><br/>
<strong>Offline-First</strong><br/>
Full functionality without internet dependency
</td>
</tr>
</table>

## Features

For a comprehensive breakdown of all features, see the [Feature Reference](FEATURES.md).

### Database Management

- **Multi-database support** — PostgreSQL, MySQL, and MariaDB with native drivers
- **Auto-discovery** — Detect local and Docker-based databases automatically
- **Connection URL parsing** — Import connections via standard database URLs
- **Schema Explorer** — Navigate tables, columns, indexes, and relationships
- **Row operations** — Insert, edit, and delete rows with foreign key support
- **Migration management** — Track, apply, and rollback schema migrations

### Git Version Control

- **Repository management** — Initialize and manage Git repositories from within the app
- **Staging and commits** — Stage files individually or in bulk with full diff preview
- **Branch operations** — Create, switch, and manage branches
- **Remote sync** — Push, pull, and fetch with remote repository support
- **Change tracking** — View file-level diffs and full commit history
- **Stash management** — Save and restore work-in-progress changes
- **Smart .gitignore** — Automatic generation and management of ignore rules

### Visual Tools

- **ER Diagrams** — Auto-generated, interactive entity-relationship diagrams
- **Visual Query Builder** — Drag-and-drop query construction with live SQL preview
- **Data Visualization** — Bar, line, pie, and scatter charts with export to PNG/SVG
- **SQL Workspace** — Multi-tab CodeMirror editor with syntax highlighting and execution

### Developer Experience

- **Multi-format export** — CSV, JSON, and SQL export for tables and query results
- **Query history** — Persistent history with instant replay
- **Automatic updates** — Background downloads with cryptographically signed releases
- **Customizable themes** — Light/dark modes with multiple accent color variants

## Quick Start

### Installation

| Platform | Formats | Notes |
| -------- | ------- | ----- |
| **Windows** | `.exe` · `.msi` | NSIS installer (recommended) or MSI package |
| **Linux** | `.deb` · `.AppImage` | Debian package or portable AppImage |

**[Download the latest release](https://github.com/Relwave/relwave-app/releases)**

### Build from Source

#### Prerequisites

- Node.js 18+
- pnpm
- Rust toolchain (for Tauri)

#### Development

```bash
git clone https://github.com/Relwave/relwave-app.git
cd relwave-app

# Install frontend dependencies
pnpm install

# Install bridge dependencies
cd bridge && pnpm install && cd ..

# Start development mode
pnpm tauri dev
```

#### Production Build

**Windows:**

```bash
cd bridge && pnpm build && cd ..
npx pkg ./bridge/dist/index.cjs --target node18-win-x64 \
  --output ./src-tauri/resources/bridge-x86_64-pc-windows-msvc.exe
pnpm tauri build
```

**Linux:**

```bash
sudo apt install libwebkit2gtk-4.1-dev libappindicator3-dev librsvg2-dev patchelf

cd bridge && pnpm build && cd ..
npx pkg ./bridge/dist/index.cjs --target node18-linux-x64 \
  --output ./src-tauri/resources/bridge-x86_64-unknown-linux-gnu
pnpm tauri build
```

## Documentation

### Architecture

RelWave uses a **bridge architecture** — a Tauri/React frontend communicates with a Node.js process over JSON-RPC via stdin/stdout. The bridge handles all database and Git operations using native drivers.

```
┌──────────────────────────┐
│     Tauri + React UI     │
│      (TypeScript)        │
│                          │
│   Database Explorer      │
│   ER Diagrams            │
│   Query Builder          │
│   Git Interface          │
└────────────┬─────────────┘
             │ JSON-RPC (stdio)
             │
┌────────────┴─────────────┐
│     Node.js Bridge       │
│                          │
│   pg · mysql2            │
│   simple-git             │
│   Query Cache            │
└────────────┬─────────────┘
             │
       ┌─────┴──────┐
       │            │
   Databases    Git Repos
```

**Why this architecture?**

| Benefit | Description |
| ------- | ----------- |
| Performance | Native database drivers without complex Rust FFI bindings |
| Security | Process isolation prevents direct memory access vulnerabilities |
| Flexibility | New drivers and integrations added without modifying the Rust layer |
| Reliability | Independent process lifecycle — bridge crashes don't take down the UI |

### Project Structure

```
relwave-app/
├── src/                          # React frontend
│   ├── components/
│   │   ├── database/             # Database management UI
│   │   ├── er-diagram/           # ER diagram visualization
│   │   ├── git/                  # Git interface components
│   │   ├── query-builder/        # Visual query builder
│   │   └── schema-explorer/      # Schema navigation
│   ├── hooks/                    # Custom React hooks
│   ├── services/                 # API communication layer
│   └── types/                    # TypeScript type definitions
│
├── bridge/                       # Node.js bridge process
│   ├── src/
│   │   ├── connectors/           # Database drivers (pg, mysql2)
│   │   ├── handlers/             # JSON-RPC request handlers
│   │   │   ├── databaseHandlers.ts
│   │   │   ├── gitHandlers.ts
│   │   │   └── gitAdvancedHandlers.ts
│   │   ├── services/             # Business logic and Git service
│   │   └── queries/              # SQL query templates
│   └── __tests__/                # Test suite
│
└── src-tauri/                    # Tauri backend (Rust)
    ├── src/                      # Application entry point
    ├── capabilities/             # Permission definitions
    └── resources/                # Bundled bridge executable
```

### Configuration

**Connection storage locations:**

| Platform | Path |
| -------- | ---- |
| Windows | `%APPDATA%\relwave\databases.json` |
| Linux | `~/.config/relwave/databases.json` |

All credentials are encrypted using machine-specific keys. Connection strings and passwords are never stored in plain text.

**Environment variables:**

| Variable | Description | Default |
| -------- | ----------- | ------- |
| `RELWAVE_HOME` | Override configuration directory | — |
| `RELWAVE_LOG` | Enable debug logging | `false` |
| `RELWAVE_BRIDGE` | Custom bridge executable path | — |

## Testing

### Prerequisites

Start the test databases using Docker:

```bash
cd bridge
docker-compose -f docker-compose.test.yml up -d
```

Create `bridge/.env` with the test configuration:

```env
REAL_POSTGRES_HOST=localhost
REAL_POSTGRES_PORT=5432
REAL_POSTGRES_USER=testuser
REAL_POSTGRES_PASSWORD=testpass
REAL_POSTGRES_DATABASE=testdb

REAL_MYSQL_HOST=localhost
REAL_MYSQL_PORT=3306
REAL_MYSQL_USER=testuser
REAL_MYSQL_PASSWORD=testpass
REAL_MYSQL_DATABASE=testdb

REAL_MARIADB_HOST=localhost
REAL_MARIADB_PORT=3307
REAL_MARIADB_USER=testuser
REAL_MARIADB_PASSWORD=testpass
REAL_MARIADB_DATABASE=testdb
```

### Running Tests

```bash
cd bridge
pnpm test
```

### Coverage

| Area | Status |
| ---- | ------ |
| Database service operations | Covered |
| Connection management | Covered |
| PostgreSQL integration | Covered |
| MySQL integration | Covered |
| MariaDB integration | Covered |
| Query result caching | Covered |
| Encryption and persistence | Covered |
| Git operations (status, commit, branch, remote) | Covered |
| Git advanced features (push, pull, fetch, revert) | Covered |

## Contributing

Contributions are welcome. Whether fixing bugs, adding features, or improving documentation — all help is appreciated.

1. Fork the repository
2. Clone your fork: `git clone https://github.com/your-username/relwave-app.git`
3. Create a feature branch: `git checkout -b feature/your-feature-name`
4. Commit your changes: `git commit -m 'Add: description of change'`
5. Push to your fork: `git push origin feature/your-feature-name`
6. Open a Pull Request

**Guidelines:**

- Follow the existing TypeScript and React conventions
- Add tests for new functionality
- Update documentation when applicable
- Write clear, descriptive commit messages
- Provide context in Pull Request descriptions

## Technology Stack

<table>
<tr>
<td align="center" width="16%">
<img src="https://cdn.jsdelivr.net/gh/devicons/devicon@latest/icons/tauri/tauri-original.svg" width="40" /><br/>
<strong>Tauri</strong>
</td>
<td align="center" width="16%">
<img src="https://cdn.jsdelivr.net/gh/devicons/devicon@latest/icons/rust/rust-original.svg" width="40" /><br/>
<strong>Rust</strong>
</td>
<td align="center" width="16%">
<img src="https://cdn.jsdelivr.net/gh/devicons/devicon@latest/icons/react/react-original.svg" width="40" /><br/>
<strong>React 18</strong>
</td>
<td align="center" width="16%">
<img src="https://cdn.jsdelivr.net/gh/devicons/devicon@latest/icons/typescript/typescript-original.svg" width="40" /><br/>
<strong>TypeScript</strong>
</td>
<td align="center" width="16%">
<img src="https://cdn.jsdelivr.net/gh/devicons/devicon@latest/icons/nodejs/nodejs-original.svg" width="40" /><br/>
<strong>Node.js</strong>
</td>
<td align="center" width="16%">
<img src="https://cdn.jsdelivr.net/gh/devicons/devicon@latest/icons/git/git-original.svg" width="40" /><br/>
<strong>Git</strong>
</td>
</tr>
</table>

**Additional libraries:** Tailwind CSS, shadcn/ui, React Flow, Recharts, CodeMirror, React Query, simple-git, node-postgres, mysql2

### Acknowledgments

- [Freepik](https://www.freepik.com) — Logo design via [Flaticon](https://www.flaticon.com)
- [shadcn/ui](https://ui.shadcn.com/) — Component library

## License

This project is licensed under the MIT License. See [LICENSE](LICENSE) for details.

---

<div align="center">

**Database Management · Visual Schema Tools · Git Version Control**

[Star on GitHub](https://github.com/Relwave/relwave-app) · [Download](https://github.com/Relwave/relwave-app/releases) · [Report Issues](https://github.com/Relwave/relwave-app/issues) · [Request Features](https://github.com/Relwave/relwave-app/issues)

</div>