# Claude's Guide to RelWave

Welcome, Claude. This document outlines project-specific instructions and preferences to help you provide the best possible assistance.

## 🎯 High-Level Goals
RelWave is a modern, high-performance database management tool. Our priority is a seamless developer experience, visual clarity, and rock-solid reliability.

## 🛠️ Code Style & Preferences

- **React:** 
  - Use functional components with hooks.
  - Prefer TanStack Query for data fetching and state synchronization.
  - Use `lucide-react` for icons.
  - Follow shadcn/ui patterns for new components.
- **TypeScript:**
  - **Strict Typing:** Avoid `any`. Use interfaces for data structures.
  - **Shared Types:** When adding features that span frontend and bridge, ensure types are consistent.
- **Tailwind CSS 4:**
  - Use utility classes primarily.
  - Leverage the new features of Tailwind 4 (e.g., simplified config, better performance).
- **Bridge Logic:**
  - Keep the bridge lean. It should handle I/O and DB operations, not UI state.
  - Use `pino` for logging in the bridge.

## 🌉 The Bridge Protocol

When implementing a new feature that requires the Bridge:
1.  **Define the Interface:** Decide on the JSON-RPC method name and parameters.
2.  **Bridge Handler:** Add a handler in `bridge/src/handlers/`.
3.  **Bridge Service:** Implement the logic in a service within `bridge/src/services/`.
4.  **Frontend Service:** Add a caller in `src/services/bridge/`.
5.  **Hook/Feature:** Use the service in a React hook or feature component.

## 🧪 Testing Strategy

- **Bridge:** Always add tests for new bridge services in `bridge/__tests__`. Use the existing Docker-based test environment.
- **Frontend:** Focus on component isolation and logic testing.

## 🔍 Context Reminders

- The app is a **Tauri** app. `window.__TAURI__` is available, but prefer using `@tauri-apps/api`.
- Database credentials are encrypted via the OS keyring (macOS Keychain, Windows Credential Manager, etc.) using `@napi-rs/keyring` in the bridge.
- The UI uses `react-router-dom` for navigation.

## 🚫 What to Avoid

- **No browser-only APIs:** Remember this runs in a desktop environment.
- **No heavy logic in handlers:** Handlers should just route requests to services.
- **No direct DB calls from Frontend:** All database interaction *must* go through the bridge.
