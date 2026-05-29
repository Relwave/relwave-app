# Contributing to RelWave

Thanks for helping improve RelWave. This project is a Tauri desktop app with a React frontend and a Node.js bridge, so changes usually touch one of those layers.

## Getting Started

1. Fork the repository and create a feature branch.
2. Install dependencies in both the app and bridge packages.
3. Make your change with focused commits.
4. Run the relevant tests before opening a pull request.

## Development Workflow

```bash
pnpm install
pnpm --dir bridge install
pnpm tauri dev
```

If you are working on bridge-related code, you can run bridge tests directly:

```bash
cd bridge
pnpm test
```

## Code Guidelines

- Keep TypeScript strict and prefer shared types across the frontend and bridge.
- Keep bridge handlers thin and move logic into services.
- Use the existing UI patterns and Tailwind utilities for frontend changes.
- Avoid unrelated refactors in the same pull request.

## Testing

- Run focused tests for the files you touch.
- For bridge integration work, start the Docker test services from `bridge/docker-compose.test.yml` when needed.
- If a test depends on environment values, copy `bridge/.env.example` to `bridge/.env` and adjust the local settings.

## Pull Request Checklist

- The app builds locally.
- Relevant tests pass.
- Documentation is updated when behavior changes.
- The PR description includes the user-visible impact of the change.
