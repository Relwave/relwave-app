# RelWave — Product & Engineering Roadmap

This document outlines the strategic vision, prioritized milestones, and architectural direction for the **RelWave** desktop database manager.

---

## 🧭 Core Architectural Pillars

1. **Local-First & Zero Telemetry:** RelWave operates directly on your workstation. Database connections and credentials never transit third-party cloud servers.
2. **True Engine-Native Ergonomics:** Polyglot support without least-common-denominator approximations. Document databases receive native BSON fidelity and visual aggregation builders; relational databases receive SQL query analyzers and transactional migrations.
3. **Tri-Layer Stability & Isolation:** The React frontend remains responsive while heavy I/O, native drivers, and stream processing run within the supervised Node.js bridge.
4. **Git-Native Versioning:** Database schemas, snapshots, and migration histories integrate seamlessly with Git workflows.

---

## 🎯 Current Status

- **Latest Stable Version:** `v1.3.0` (Polyglot: Relational, Columnar, Embedded, and MongoDB Document Support)
- **Upcoming Target:** `v1.3.1` / `v1.4.0`
- **Active Focus:** Keyset pagination, JSON schema validator editor, and index utilization analytics.

---

## 🗺️ Roadmap Phases

### Phase 1: Near-Term Enhancements (v1.3.x)

- [ ] **MongoDB Keyset (Cursor-Based) Pagination:**
  - Transition from offset-based windowing (`skip` / `limit`) to `_id > lastSeenId` keyset pagination in the document viewer.
  - Enables smooth $O(1)$ infinite-scroll browsing across massive collections without server-side scan degradation.
- [ ] **Visual Collection JSON Schema Validator Editor:**
  - Interactive visual composer for MongoDB collection `$jsonSchema` validation rules.
  - Schema rule linting, live document testing, and versioned migration generation.
- [ ] **Index Access & Performance Analytics:**
  - Query `$indexStats` aggregation in MongoDB to inspect index access frequencies and identify unused or redundant indexes.
  - Visual heatmaps for index utilization.

---

### Phase 2: Medium-Term Enhancements (v1.4.0)

- [ ] **Advanced Visual Aggregation Stages:**
  - Expand the pipeline builder to support complex stages: `$facet`, `$bucketAuto`, `$graphLookup`, and correlated `$lookup` with nested pipelines.
  - Visual stage dependency graphs and sub-pipeline composers.
- [ ] **Unified Multi-Engine ER Diagrams:**
  - Enable visual cross-engine relationship mapping in hybrid projects combining relational databases (e.g. PostgreSQL) and document collections (MongoDB).
- [ ] **AI-Assisted Index & Query Recommendations:**
  - Static query plan analysis using local or cloud LLMs to suggest optimal compound indexes and detect inefficient pipeline stages.
- [ ] **Custom Theme & Layout Presets:**
  - User-configurable workspace layouts, custom syntax themes, and detachable query editor windows.

---

### Phase 3: Exploratory & Long-Term (v2.0)

- [ ] **Key-Value Engine Support (Redis Connector):**
  - Integrate Redis as an in-memory key-value database using the established `connectorRegistry` pattern.
  - Dedicated key explorer, TTL monitor, and Pub/Sub debugger.
- [ ] **WebAssembly (WASM) Embedded Connectors:**
  - Compile SQLite and DuckDB to WebAssembly to allow instant in-memory querying without spawning the sidecar bridge process.
- [ ] **Bi-Directional Database Migrations Generator:**
  - Automatic migration script generation by computing the diff between live database schemas and target branch Git snapshots.

---

## 🤝 Community Feedback & Contributions

Roadmap priorities are continuously calibrated based on real-world engineering workflows. If you would like to request an engine connector or suggest a feature, please open an issue or start a discussion on our GitHub repository.
