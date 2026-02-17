# RelWave — Feature Reference

This document provides a comprehensive breakdown of all features and capabilities in RelWave. For installation and setup instructions, see the main [README](README.md).

**Tech Stack:** Tauri + React 18 + TypeScript + Tailwind CSS + shadcn/ui + React Query + ReactFlow + Recharts + CodeMirror

---

## Table of Contents

- [Core Pages and Navigation](#core-pages-and-navigation)
- [Git Version Control](#git-version-control)
- [Visual Tools](#visual-tools)
- [UI and Design System](#ui-and-design-system)
- [Integration and Architecture](#integration-and-architecture)
- [Performance](#performance)
- [Cross-Platform Support](#cross-platform-support)
- [Design Principles](#design-principles)

---

## Core Pages and Navigation

### 1. Dashboard

The main landing page for managing database connections. Features a clean, IDE-inspired design.

**Connection Management**

- Add new database connections with detailed configuration (name, type, host, port, user, password, SSL options)
- Connect via URL — paste connection strings like `postgres://user:pass@host:port/db`
- Auto-parse URLs to populate connection form fields
- Delete existing database connections
- Test connections with real-time feedback
- Connection status indicators for all databases

**Auto-Discovery**

- Automatically discover databases running on the local machine
- TCP port scanning for PostgreSQL (5432–5434) and MySQL (3306–3308)
- Docker container detection with image recognition
- Docker credential extraction — reads `POSTGRES_USER`, `POSTGRES_PASSWORD`, `MYSQL_ROOT_PASSWORD`, etc. from container environment variables
- One-click add with pre-filled connection details
- Auto-generated connection names
- Visual indicators for database source (local or Docker)
- Manual rescan capability

**Statistics Overview**

- Total connected databases count
- Aggregate table count across all databases
- Total row count across all databases
- Total database size (displayed in MB)
- Real-time loading indicators

**Search and Filtering**

- Search databases by name with instant filtering
- Empty state messaging when no databases match

**Performance Optimizations**

- Hover-based prefetching for faster navigation
- Cached queries using React Query
- Optimistic UI updates
- Manual refresh with automatic cache invalidation

---

### 2. Database Details

Detailed view for individual database operations with a split-panel layout.

**Layout:**
- Left panel — Tables Explorer with collapsible table list
- Right panel — Content Viewer with data table, pagination, and actions
- Slide-out panels — Chart visualization and migrations

**Tables Explorer**

- Collapsible table list with search
- Click to select and load table data
- Visual indicators for the selected table
- Table count display

**Content Viewer**

- Table name and row count header
- Quick action buttons: Insert, Chart, Export, Refresh
- Search bar for filtering table data
- DataTable component with:
  - Row numbers column
  - Enhanced data type formatting (booleans as colored pills, numbers in indigo, dates in violet, JSON in amber, NULL as muted badges)
  - Edit and delete actions on row hover
  - Empty state with messaging

**Pagination**

- Compact button-based navigation
- Page size selector (10, 25, 50, 100, 250 rows)
- Row range indicator ("Showing X to Y of Z rows")
- First, previous, next, and last page controls

**Search**

- Cross-column search across all table fields
- Case-insensitive matching (ILIKE for PostgreSQL, LIKE for MySQL/MariaDB)
- Paginated search results
- Real-time result count display
- Clear search to return to the default view

**Row Operations**

- Insert data dialog — add new rows with foreign key dropdown support
- Edit row dialog — modify existing row data with form fields
- Delete confirmation — styled alert dialog with row preview

**Chart Visualization** (slide-out panel)

- Bar, Line, Pie, and Scatter chart types
- Icon-based chart type selector
- X/Y axis column selection
- Chart title customization
- Export as PNG or SVG

**Migrations Panel** (slide-out panel)

- View local migrations (pending)
- View applied migrations with timestamps
- Rollback functionality for applied migrations
- Baseline support for migration management

**Header Actions**

- SQL Workspace quick access
- Migrations panel toggle
- Export All dropdown (CSV/JSON)
- Refresh button

---

### 3. SQL Workspace

A full IDE-style SQL editor for writing and executing queries.

**Layout:**
- Top bar — database breadcrumb, execution status, Run/Stop buttons
- Left sidebar — collapsible with Tables and History sections
- Main area — split between editor (top) and results (bottom)
- Status bar — connection info, row count, execution time

**Multi-Tab Support**

- Create multiple query tabs
- Tab status indicators (idle, running, success, error)
- Close tabs with unsaved warning
- Rename tabs by double-clicking

**Sidebar**

- Tables section with complete table list; click to insert `SELECT * FROM table`
- History section with recent queries, timestamps, and clear option

**Editor**

- CodeMirror-based editor with SQL syntax highlighting
- Auto-resize based on content
- Keyboard shortcut: Ctrl+Enter to execute

**Query Execution**

- Real-time progress indicator (rows fetched, elapsed time)
- Cancel running queries
- Streaming results display
- Detailed error handling

**Results Panel**

- DataTable with row numbers and type-aware formatting
- Row count and execution time display
- Empty state when no results

---

### 4. Query Builder

Visual SQL query builder with drag-and-drop canvas.

**Layout:**
- Top bar — database breadcrumb, Generate and Execute buttons, progress indicator
- Left sidebar — collapsible Explorer with Tables, Configuration, and History
- Main canvas — ReactFlow diagram for visual table relationships
- Bottom panel — SQL preview (1/3) and results table (2/3)
- Status bar — table count, join count, filter count, limit

**Tables**

- Click to add or remove tables from the canvas (toggle behavior)
- Checkmark indicator for added tables
- Table count badge

**Configuration**

- Columns — select columns for the SELECT clause
- Filters — add WHERE conditions with column, operator, and value
- Sort By — ORDER BY with ascending/descending toggle
- Group By — GROUP BY column selection
- Limit — quick select buttons (10, 50, 100, 500)

**Visual Canvas**

- Drag-and-drop table nodes
- Connect tables to create JOINs
- Click edges to change join type (INNER, LEFT, RIGHT, FULL)
- Color-coded join types
- Zoom and pan controls

**SQL Generation**

- Real-time SQL preview
- Auto-save to query history
- Execute generated queries directly
- Streaming results with progress

---

### 5. Schema Explorer

Comprehensive database schema visualization and management.

**Tree View**

- Hierarchical display: Database > Schema > Tables > Columns
- Expandable and collapsible nodes
- Visual indicators for primary keys, foreign keys, column types, and constraints

**Metadata Panel**

- Detailed information for the selected database, schema, or table
- Column details: name, type, nullable, primary key, foreign key references, defaults, auto-increment
- Index information
- Foreign key relationships

**Table Operations**

- Create Table — define columns with types, NOT NULL, primary key, defaults; auto-generate migrations
- Alter Table — add, drop, rename columns; change types; modify constraints; auto-generate migrations
- Drop Table — safe deletion with confirmation, cascade/restrict options; auto-generate migrations

**Index Management**

- Create indexes with multiple columns
- Specify index type (B-tree, Hash, etc.)
- Set unique constraints
- View existing indexes

**Foreign Key Management**

- Create foreign key relationships
- Reference columns across tables
- Set cascade rules (CASCADE, SET NULL, RESTRICT)
- Visual foreign key indicators

**Auto-Migration**

- Automatically generate migrations for all schema modifications
- Immediate application with rollback support

---

### 6. ER Diagram

Interactive entity-relationship diagram visualization.

- ReactFlow-based interactive canvas
- Automatic table node generation with column and type information
- Primary key highlighting
- Foreign key relationship lines between tables
- Auto-layout algorithms
- Minimap for large diagrams
- Pan, zoom, and fit-to-screen controls
- Drag to reposition tables
- Hover tooltips for relationship details

---

### 7. Settings

Application appearance and preference management.

**Theme Mode**

- Light, dark, and system-preference (auto) modes
- Real-time theme switching

**Accent Colors**

- Multiple color variants: Blue (default), Purple, Green, Pink, Orange, and more
- Visual color preview with live UI element updates
- Persistent preferences

**Preview**

- Live preview of buttons, text, and border colors with the selected theme

---

## Git Version Control

RelWave includes native Git integration powered by `simple-git`, providing a full version control workflow directly within the application.

### Core Operations

| Operation | Description |
| --------- | ----------- |
| `git.status` | Repository status including branch, dirty state, ahead/behind counts |
| `git.init` | Initialize a new repository with configurable default branch |
| `git.changes` | List all changed files with status indicators |
| `git.stage` | Stage specific files for commit |
| `git.stageAll` | Stage all changed files |
| `git.unstage` | Unstage files from the index |
| `git.commit` | Commit staged changes with a message |
| `git.log` | View recent commit history |
| `git.diff` | View file-level diff output |
| `git.discard` | Discard changes to specific files |

### Branch Management

| Operation | Description |
| --------- | ----------- |
| `git.branches` | List all local branches |
| `git.createBranch` | Create and checkout a new branch |
| `git.checkout` | Switch to an existing branch |

### Stash Operations

| Operation | Description |
| --------- | ----------- |
| `git.stash` | Stash current work-in-progress changes |
| `git.stashPop` | Restore the most recent stash |

### Remote Management

| Operation | Description |
| --------- | ----------- |
| `git.remoteList` | List all configured remotes |
| `git.remoteAdd` | Add a new remote with name and URL |
| `git.remoteRemove` | Remove an existing remote |
| `git.remoteGetUrl` | Get the URL of a remote |
| `git.remoteSetUrl` | Update the URL of a remote |

### Sync Operations

| Operation | Description |
| --------- | ----------- |
| `git.push` | Push commits to a remote repository |
| `git.pull` | Pull changes from a remote repository |
| `git.fetch` | Fetch updates from a remote without merging |
| `git.revert` | Revert a specific commit |

### Additional Features

- Automatic `.gitignore` generation when initializing repositories
- Smart ignore rules for database credentials and application configuration
- Full error forwarding with descriptive messages

---

## Visual Tools

### Chart Visualization

**Supported chart types:**

- Bar Chart (vertical bars)
- Line Chart (with data points)
- Pie Chart (with labels)
- Scatter Chart (data point distribution)

**Configuration:**

- Icon-based chart type selector
- X-axis and Y-axis column selection via dropdowns
- Chart title input
- Compact three-column layout

**Export:**

- PNG export for raster output
- SVG export for vector output

**Styling:**

- Theme-aware coloring using CSS variables
- shadcn ChartContainer integration
- Responsive sizing

### Data Table

- Row numbers column
- Type-aware cell formatting:
  - Booleans displayed as colored pills (green/red)
  - Numbers in indigo
  - Dates in violet
  - JSON/objects in amber with `{ }` indicator
  - NULL values as muted badges
  - Long text truncated with ellipsis
- Edit and delete action buttons on row hover
- Sortable columns
- Paginated results
- Empty state with messaging

---

## UI and Design System

### Layout Components

**Title Bar (Tauri)**
- 32px fixed height, draggable area for window movement
- Native minimize, maximize, and close buttons
- Proper z-index layering

**Vertical Icon Bar**
- Fixed 60px left sidebar with navigation icons
- Pages: Home, Settings, SQL Workspace, Query Builder, Schema Explorer, ER Diagram
- Active state indicators and tooltip labels

**Slide-Out Panels**
- Right-side panels for charts and migrations
- Backdrop overlay with click-to-close
- Smooth slide animation

**Collapsible Sidebars**
- Toggle to collapse/expand with smooth width transition
- Persistent state across sessions

### Theming

- Dark and light mode with seamless switching
- CSS variable-based color system
- Multiple accent color variants
- Persistent preferences via localStorage

### Loading and Feedback

- Bridge loader displayed during Tauri backend initialization
- Skeleton loaders for data tables
- Progress indicators for long-running queries
- Toast notifications: success (green), error (red), warning (yellow), info (blue)
- Auto-dismiss with configurable duration

### Form Handling

- Required field validation with real-time error feedback
- Custom validation rules
- Form state management
- Keyboard-accessible controls (Tab, Enter, Escape)

### Dialogs

- Create Table, Alter Table, Drop Table
- Add Database Connection
- Add Indexes
- Insert Data (with FK dropdown support)
- Edit Row
- Delete Confirmation (with row preview)

---

## Integration and Architecture

### React Query

- Automatic query caching with configurable stale time
- Background refetching and cache invalidation
- Optimistic updates for responsive UI
- Loading, error, success, and refetching state management

### Tauri Bridge API

- Type-safe API calls to the Node.js bridge
- Session management for concurrent queries
- Real-time event listeners for streaming query results
- Custom events: `bridge:query.result`, `bridge:query.progress`, `bridge:query.done`, `bridge:query.error`
- Session-based event filtering

### Event-Driven Architecture

All database and Git operations use a JSON-RPC protocol over stdin/stdout. The bridge process runs independently of the UI, providing process isolation and crash resilience.

---

## Performance

### Optimization Techniques

- Hover-based data prefetching for predictive loading
- Component-level code splitting and lazy loading
- `React.memo`, `useCallback`, and `useMemo` for render optimization

### Caching Strategy

| Layer | Purpose |
| ----- | ------- |
| React Query | API response caching |
| localStorage | User preferences and theme settings |
| Session storage | Temporary data and session state |
| Query history | Persistent query log |

---

## Cross-Platform Support

### Desktop (Tauri)

- Custom 32px title bar with draggable area and window controls
- All pages use `h-[calc(100vh-32px)]` for proper layout
- Fixed elements offset with `top-8` (32px)
- Z-index layering: title bar (z-100), panels (z-50), sidebar (z-40)
- File system access, native notifications, and system tray support

### Web Technologies

- React 18 with concurrent features
- Vite for development and bundling
- TypeScript for full type coverage
- CSS variables for runtime theming

---

## Design Principles

1. **Minimalistic UI** — Clean interfaces with subtle borders and muted backgrounds
2. **IDE-Inspired Layout** — Familiar sidebar, panel, and status bar patterns
3. **Theme Consistency** — Single primary color system using CSS variables
4. **Responsive Layout** — Precise height calculations to eliminate unnecessary scrollbars
5. **Progressive Disclosure** — Collapsible sections to reduce visual complexity
6. **Immediate Feedback** — Loading states, progress indicators, and toast notifications
7. **Keyboard First** — Shortcuts for common actions (Ctrl+Enter to execute queries)
8. **Error Resilience** — Graceful error handling with retry mechanisms and fallback states

---

**Last Updated:** February 2026

This document is maintained alongside the application and updated with each release.