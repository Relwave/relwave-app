# 📘 DB Visualizer — Documentation Index

Welcome to the **DB Visualizer** documentation. This repository contains all technical docs related to architecture, backend design, API reference, features, and implementation checklists.

Use this README as the main entry point to navigate the project.

---

## 📚 Documentation

### 🔧 Core Technical Docs

* **[Architecture.md](./docs/architecture.md)**
  High-level and low-level system architecture, components, diagrams, data flow, security model, and system design decisions.

* **[Backend.md](./docs/backend.md)**
  Backend/bridge implementation plan, connector interface, IPC structure, jobs, sessions, and developer workflow.

* **[API.md](./docs/api.md)**
  Full JSON-RPC / IPC API reference for the bridge. Includes method specs, payloads, events, streaming model, and error codes.

---

### 🌟 Feature & Roadmap Docs

* **[Features.md](./docs/features.md)**
  Complete feature list, UI wireframes, and planned enhancements.

* **[Checklist.md](./docs/checklist.md)**
  Implementation checklist for tracking milestones (MVP → V1 → V2 → Pro).

---

## 🧭 Navigation

Use the links above to read specific documents.
If you're new, start with:

1. **Architecture.md** → overview of how everything fits together.
2. **Backend.md** → how to implement the bridge backend.
3. **API.md** → how the UI communicates with the backend.

---

## 🛠️ Repository Structure (recommended)

```
/docs
  - README.md
  - Architecture.md
  - Backend.md
  - API.md
  - Features.md
  - Checklist.md
/src
  /renderer
  /bridge
  /connectors
  /workers
```
