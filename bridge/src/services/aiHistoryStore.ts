/**
 * AI History Store — SQLite-backed repository for AI analysis history.
 *
 * Stores AI responses locally so the user can browse previous analyses,
 * and provides the persistence layer for the cache system.
 */

import Database from "better-sqlite3";
import path from "path";
import fs from "fs";
import { CONFIG_FOLDER } from "../utils/config";

// ── Types ─────────────────────────────────────────────────────────────────

export interface AIHistoryRow {
  id: number;
  feature: string;
  datasource_id: string | null;
  table_name: string | null;
  content_hash: string | null;
  provider: string;
  model: string;
  prompt: string;
  response: string;
  tokens_used: number | null;
  created_at: string;
}

/** Subset returned when listing (no prompt/response to keep payloads small). */
export interface AIHistoryListItem {
  id: number;
  feature: string;
  datasource_id: string | null;
  table_name: string | null;
  provider: string;
  model: string;
  tokens_used: number | null;
  created_at: string;
}

export interface AIHistoryInsert {
  feature: string;
  datasource_id?: string | null;
  table_name?: string | null;
  content_hash?: string | null;
  provider: string;
  model: string;
  prompt: string;
  response: string;
  tokens_used?: number | null;
}

export interface AIHistoryListParams {
  feature?: string;
  provider?: string;
  limit?: number;
  offset?: number;
}

export interface AIHistoryListResult {
  items: AIHistoryListItem[];
  total: number;
}

// ── DDL ───────────────────────────────────────────────────────────────────

const CREATE_TABLE_SQL = `
CREATE TABLE IF NOT EXISTS ai_history (
  id              INTEGER PRIMARY KEY AUTOINCREMENT,
  feature         TEXT NOT NULL,
  datasource_id   TEXT,
  table_name      TEXT,
  content_hash    TEXT,
  provider        TEXT NOT NULL,
  model           TEXT NOT NULL,
  prompt          TEXT NOT NULL,
  response        TEXT NOT NULL,
  tokens_used     INTEGER,
  created_at      DATETIME DEFAULT CURRENT_TIMESTAMP
);
`;

const CREATE_INDEX_HASH = `CREATE INDEX IF NOT EXISTS idx_ai_history_hash ON ai_history(content_hash);`;
const CREATE_INDEX_HASH_DS = `CREATE INDEX IF NOT EXISTS idx_ai_history_hash_ds ON ai_history(content_hash, datasource_id);`;
const CREATE_INDEX_FEATURE = `CREATE INDEX IF NOT EXISTS idx_ai_history_feature ON ai_history(feature);`;
const CREATE_INDEX_CREATED = `CREATE INDEX IF NOT EXISTS idx_ai_history_created_at ON ai_history(created_at);`;

// ── Store ─────────────────────────────────────────────────────────────────

export class AIHistoryStore {
  private db: Database.Database | null = null;
  private dbPath: string;

  constructor(dbPath?: string) {
    this.dbPath = dbPath ?? path.join(CONFIG_FOLDER, "ai_history.db");
  }

  /** Lazily open the database and run migrations. */
  private getDb(): Database.Database {
    if (this.db) return this.db;

    // Ensure the config directory exists
    const dir = path.dirname(this.dbPath);
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }

    // Resolve native binding for pkg builds (reuse existing pattern)
    let nativeBinding: string | undefined;
    try {
      const { resolvePkgNativeBindingPath } = require("../connectors/sqlite");
      if (typeof resolvePkgNativeBindingPath === "function") {
        nativeBinding = resolvePkgNativeBindingPath() ?? undefined;
      }
    } catch {
      // Not in a pkg environment or function not exported; ignore.
    }

    const opts: Database.Options = {};
    if (nativeBinding) opts.nativeBinding = nativeBinding;

    this.db = new Database(this.dbPath, opts);

    // Enable WAL mode for better concurrent read performance
    this.db.pragma("journal_mode = WAL");

    // Run migrations
    this.db.exec(CREATE_TABLE_SQL);
    this.db.exec(CREATE_INDEX_HASH);
    this.db.exec(CREATE_INDEX_HASH_DS);
    this.db.exec(CREATE_INDEX_FEATURE);
    this.db.exec(CREATE_INDEX_CREATED);

    return this.db;
  }

  /** Insert a new history record. Returns the new row ID. */
  insert(record: AIHistoryInsert): number {
    const db = this.getDb();
    const stmt = db.prepare(`
      INSERT INTO ai_history (feature, datasource_id, table_name, content_hash, provider, model, prompt, response, tokens_used, created_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);
    const info = stmt.run(
      record.feature,
      record.datasource_id ?? null,
      record.table_name ?? null,
      record.content_hash ?? null,
      record.provider,
      record.model,
      record.prompt,
      record.response,
      record.tokens_used ?? null,
      new Date().toISOString()
    );
    return info.lastInsertRowid as number;
  }

  /**
   * Look up a cached result by content_hash AND datasource_id.
   * Both must match — a cached response for Database A won't be
   * returned when querying Database B, even with the same schema.
   */
  findByHash(contentHash: string, datasourceId?: string | null): AIHistoryRow | null {
    const db = this.getDb();
    let row: AIHistoryRow | undefined;

    if (datasourceId) {
      // Match both hash and the specific datasource
      row = db
        .prepare(
          `SELECT * FROM ai_history WHERE content_hash = ? AND datasource_id = ? ORDER BY created_at DESC LIMIT 1`
        )
        .get(contentHash, datasourceId) as AIHistoryRow | undefined;
    } else {
      // No datasource specified — only match rows that also have no datasource
      row = db
        .prepare(
          `SELECT * FROM ai_history WHERE content_hash = ? AND datasource_id IS NULL ORDER BY created_at DESC LIMIT 1`
        )
        .get(contentHash) as AIHistoryRow | undefined;
    }

    return row ?? null;
  }

  /** List history entries with optional filters and pagination. */
  list(params: AIHistoryListParams = {}): AIHistoryListResult {
    const db = this.getDb();
    const conditions: string[] = [];
    const values: unknown[] = [];

    if (params.feature) {
      conditions.push("feature = ?");
      values.push(params.feature);
    }
    if (params.provider) {
      conditions.push("provider = ?");
      values.push(params.provider);
    }

    const where = conditions.length
      ? `WHERE ${conditions.join(" AND ")}`
      : "";

    const limit = params.limit ?? 20;
    const offset = params.offset ?? 0;

    // Count
    const countRow = db
      .prepare(`SELECT COUNT(*) AS total FROM ai_history ${where}`)
      .get(...values) as { total: number };

    // Fetch items (no prompt/response for list view)
    const items = db
      .prepare(
        `SELECT id, feature, datasource_id, table_name, provider, model, tokens_used, created_at
         FROM ai_history ${where}
         ORDER BY created_at DESC
         LIMIT ? OFFSET ?`
      )
      .all(...values, limit, offset) as AIHistoryListItem[];

    return { items, total: countRow.total };
  }

  /** Get a single history entry by ID (full record). */
  getById(id: number): AIHistoryRow | null {
    const db = this.getDb();
    const row = db
      .prepare(`SELECT * FROM ai_history WHERE id = ?`)
      .get(id) as AIHistoryRow | undefined;
    return row ?? null;
  }

  /** Delete a single history entry. Returns true if deleted. */
  deleteById(id: number): boolean {
    const db = this.getDb();
    const info = db.prepare(`DELETE FROM ai_history WHERE id = ?`).run(id);
    return info.changes > 0;
  }

  /** Clear all history entries. Returns number of rows deleted. */
  clearAll(): number {
    const db = this.getDb();
    const info = db.prepare(`DELETE FROM ai_history`).run();
    return info.changes;
  }

  /** Close the database connection (for clean shutdown). */
  close(): void {
    if (this.db) {
      this.db.close();
      this.db = null;
    }
  }
}

// Singleton instance
export const aiHistoryStore = new AIHistoryStore();
