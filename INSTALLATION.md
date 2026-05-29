# Installation

This guide covers local setup for RelWave and the bridge package.

## Prerequisites

- Node.js 22 or newer
- `pnpm`
- Rust toolchain for Tauri builds
- Platform-specific build tooling for desktop packaging

## Install the App

1. Clone the repository.
2. Install the frontend dependencies.
3. Install the bridge dependencies.
4. Start the app in development mode.

```bash
git clone https://github.com/Relwave/relwave-app.git
cd relwave-app
pnpm install
pnpm --dir bridge install
pnpm tauri dev
```

## Bridge Configuration

If you need custom local database values for the bridge, copy the template file and edit it:

```bash
copy bridge\.env.example bridge\.env
```

The default example values are set up for local test databases.

## Running the Bridge Tests

Use the Docker test environment when validating bridge behavior:

```bash
docker-compose -f bridge/docker-compose.test.yml up -d
cd bridge
pnpm test
```

## Production Build

Build the frontend and bridge artifacts before packaging:

```bash
pnpm build
cd bridge
pnpm build
```

If you are preparing release assets, follow the existing bridge packaging scripts in `bridge/package.json` and the root package scripts.
