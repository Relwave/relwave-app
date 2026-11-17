import { describe, it, beforeEach } from "node:test";
import assert from "node:assert/strict";
import {
  getHistory,
  addHistoryEntry,
  clearHistory,
  getHistorySettings,
  updateHistorySettings,
  setStorageAdapterForTesting,
  validateDbId,
  isValidHistoryEntry,
  StorageAdapter,
} from "../history/historyStorage";
import { redactQueryText, isRedactedQuery, sanitizeErrorMessage } from "../history/redaction";
import {
  MAX_HISTORY_ENTRIES,
  CURRENT_HISTORY_SCHEMA_VERSION,
  REDACTED_TEMPLATE_ADVISORY,
} from "../history/types";

// In-memory test storage adapter
function createMockStorage(): StorageAdapter & {
  store: Map<string, string>;
  throwOnSet?: boolean;
} {
  const store = new Map<string, string>();
  return {
    store,
    throwOnSet: false,
    getItem: (key: string) => store.get(key) ?? null,
    setItem: function (key: string, value: string) {
      if (this.throwOnSet) {
        throw new Error("QuotaExceededError: LocalStorage quota exceeded");
      }
      store.set(key, value);
    },
    removeItem: (key: string) => {
      store.delete(key);
    },
  };
}

describe("MongoDB Query History & Privacy Storage", () => {
  let mockStorage: ReturnType<typeof createMockStorage>;

  beforeEach(() => {
    mockStorage = createMockStorage();
    setStorageAdapterForTesting(mockStorage);
  });

  describe("Token-Aware Literal Redaction", () => {
    it("redacts string literals in filter value position while preserving field names", () => {
      const query = `{ email: "alice@company.com", status: "ACTIVE" }`;
      const redacted = redactQueryText(query);

      assert.strictEqual(redacted, `{ email: "<string>", status: "<string>" }`);
      assert.ok(!redacted.includes("alice@company.com"));
      assert.ok(!redacted.includes("ACTIVE"));
      assert.ok(redacted.includes("email:"));
      assert.ok(redacted.includes("status:"));
    });

    it("redacts numeric and boolean literals while preserving operators", () => {
      const query = `{ age: { $gte: 21 }, score: 99.5, isVerified: true, isBanned: false }`;
      const redacted = redactQueryText(query);

      assert.strictEqual(
        redacted,
        `{ age: { $gte: <number> }, score: <number>, isVerified: <boolean>, isBanned: <boolean> }`,
      );
      assert.ok(!redacted.includes("21"));
      assert.ok(!redacted.includes("99.5"));
      assert.ok(redacted.includes("$gte:"));
    });

    it("redacts mongosh BSON constructors (ISODate, Date, NumberLong, ObjectId, UUID)", () => {
      const query = `db.orders.find({
  _id: ObjectId("507f1f77bcf86cd799439011"),
  createdAt: ISODate("2026-10-30T10:00:00.000Z"),
  updatedAt: new Date("2026-10-30T12:00:00.000Z"),
  amount: NumberLong("9007199254740993"),
  uuid: UUID("550e8400-e29b-41d4-a716-446655440000")
})`;
      const redacted = redactQueryText(query);

      assert.ok(redacted.includes(`ObjectId("<string>")`));
      assert.ok(redacted.includes(`ISODate("<date>")`));
      assert.ok(redacted.includes(`new Date("<date>")`));
      assert.ok(redacted.includes(`NumberLong("<number>")`));
      assert.ok(redacted.includes(`UUID("<string>")`));

      // Assert literal secrets are absent
      assert.ok(!redacted.includes("507f1f77bcf86cd799439011"));
      assert.ok(!redacted.includes("2026-10-30T10:00:00.000Z"));
      assert.ok(!redacted.includes("9007199254740993"));
      assert.ok(!redacted.includes("550e8400-e29b-41d4-a716-446655440000"));
    });

    it("redacts EJSON v2 extended objects ($date, $oid, $numberLong)", () => {
      const query = JSON.stringify(
        {
          _id: { $oid: "507f1f77bcf86cd799439011" },
          created: { $date: "2026-10-30T10:00:00.000Z" },
          bigInt: { $numberLong: "9999999999" },
        },
        null,
        2,
      );
      const redacted = redactQueryText(query);

      assert.ok(redacted.includes(`"$oid": "<string>"`));
      assert.ok(redacted.includes(`"$date": "<date>"`));
      assert.ok(redacted.includes(`"$numberLong": "<number>"`));
      assert.ok(!redacted.includes("507f1f77bcf86cd799439011"));
      assert.ok(!redacted.includes("2026-10-30T10:00:00.000Z"));
      assert.ok(!redacted.includes("9999999999"));
    });

    it("preserves collection name and method calls in mongosh syntax", () => {
      const query = `db.getCollection("sensitive_customers").find({ token: "xyz-secret" })`;
      const redacted = redactQueryText(query);

      assert.ok(redacted.includes(`db.getCollection("sensitive_customers").find`));
      assert.ok(redacted.includes(`token: "<string>"`));
      assert.ok(!redacted.includes("xyz-secret"));
    });

    it("preserves distinct field name in distinct() operations", () => {
      const query = `db.users.distinct("department", { active: true })`;
      const redacted = redactQueryText(query);

      assert.ok(redacted.includes(`db.users.distinct("department"`));
      assert.ok(redacted.includes(`active: <boolean>`));
    });

    it("handles escaped string literals properly without escaping corruption", () => {
      const query = `{ text: "He said \\"secret value\\"" }`;
      const redacted = redactQueryText(query);

      assert.strictEqual(redacted, `{ text: "<string>" }`);
      assert.ok(!redacted.includes("secret value"));
    });

    it("accurately identifies redacted queries via isRedactedQuery", () => {
      assert.strictEqual(isRedactedQuery(`{ email: "<string>" }`), true);
      assert.strictEqual(isRedactedQuery(`{ age: <number> }`), true);
      assert.strictEqual(isRedactedQuery(`{ date: "<date>" }`), true);
      assert.strictEqual(isRedactedQuery(`{ active: <boolean> }`), true);

      assert.strictEqual(isRedactedQuery(`{ email: "john@doe.com" }`), false);
      assert.strictEqual(isRedactedQuery(`{ age: 25 }`), false);
      assert.strictEqual(isRedactedQuery(""), false);
    });

    it("sanitizes error messages containing database credentials and URIs", () => {
      const rawError =
        "MongoServerSelectionError: connect to mongodb://admin:SuperSecretPass123!@cluster0.abc.mongodb.net:27017/admin failed";
      const sanitized = sanitizeErrorMessage(rawError);

      assert.ok(sanitized);
      assert.ok(!sanitized.includes("SuperSecretPass123!"));
      assert.ok(sanitized.includes("<redacted-password>"));
      assert.ok(sanitized.includes("cluster0.abc.mongodb.net"));
    });
  });

  describe("History Storage Architecture & Invariants", () => {
    it("maintains strict connection isolation between databases", () => {
      const db1 = "conn-atlas-prod";
      const db2 = "conn-local-dev";

      addHistoryEntry(db1, {
        collection: "users",
        operation: "find",
        queryText: `{ email: "prod@company.com" }`,
        durationMs: 12,
        status: "success",
      });

      addHistoryEntry(db2, {
        collection: "orders",
        operation: "aggregate",
        queryText: `[{ $match: { total: 100 } }]`,
        durationMs: 25,
        status: "success",
      });

      const history1 = getHistory(db1);
      const history2 = getHistory(db2);

      assert.strictEqual(history1.length, 1);
      assert.strictEqual(history1[0].collection, "users");

      assert.strictEqual(history2.length, 1);
      assert.strictEqual(history2[0].collection, "orders");

      // Verify localStorage isolation keys
      assert.ok(mockStorage.store.has(`relwave_mql_history_${db1}`));
      assert.ok(mockStorage.store.has(`relwave_mql_history_${db2}`));
    });

    it("enforces strict 50-entry FIFO eviction limit", () => {
      const dbId = "fifo-test-db";

      // Add 55 entries sequentially
      for (let i = 1; i <= 55; i++) {
        addHistoryEntry(dbId, {
          collection: "items",
          operation: "find",
          queryText: `{ index: ${i} }`,
          durationMs: i,
          status: "success",
          id: `entry-${i}`,
          timestamp: new Date(Date.now() + i * 1000).toISOString(),
        });
      }

      const history = getHistory(dbId);

      // Exactly 50 entries
      assert.strictEqual(history.length, MAX_HISTORY_ENTRIES);
      assert.strictEqual(history.length, 50);

      // Newest entry is first (entry-55)
      assert.strictEqual(history[0].id, "entry-55");

      // 51st oldest entries (entry-1 through entry-5) must be evicted
      const entryIds = new Set(history.map((e) => e.id));
      assert.ok(!entryIds.has("entry-1"), "entry-1 should be evicted");
      assert.ok(!entryIds.has("entry-2"), "entry-2 should be evicted");
      assert.ok(!entryIds.has("entry-5"), "entry-5 should be evicted");
      assert.ok(entryIds.has("entry-6"), "entry-6 should be retained");
      assert.ok(entryIds.has("entry-55"), "entry-55 should be retained");
    });

    it("clears connection history without affecting other connections", () => {
      const db1 = "clear-target-db";
      const db2 = "clear-preserve-db";

      addHistoryEntry(db1, {
        collection: "col1",
        operation: "find",
        queryText: "{}",
        durationMs: 5,
        status: "success",
      });

      addHistoryEntry(db2, {
        collection: "col2",
        operation: "find",
        queryText: "{}",
        durationMs: 5,
        status: "success",
      });

      clearHistory(db1);

      assert.strictEqual(getHistory(db1).length, 0);
      assert.strictEqual(getHistory(db2).length, 1);
      assert.strictEqual(mockStorage.store.has(`relwave_mql_history_${db1}`), false);
      assert.strictEqual(mockStorage.store.has(`relwave_mql_history_${db2}`), true);
    });

    it("recovers gracefully from malformed or corrupted JSON in localStorage", () => {
      const dbId = "corrupt-json-db";
      mockStorage.store.set(`relwave_mql_history_${dbId}`, "INVALID_MALFORMED_JSON{{{");

      const history = getHistory(dbId);
      assert.deepStrictEqual(history, []);
    });

    it("filters out corrupted entries without crashing", () => {
      const dbId = "corrupt-entry-db";
      const malformedPayload = {
        version: CURRENT_HISTORY_SCHEMA_VERSION,
        dbId,
        entries: [
          {
            id: "valid-1",
            timestamp: "2026-10-30T10:00:00Z",
            collection: "c",
            operation: "find",
            redactedQueryText: "{}",
            durationMs: 1,
            status: "success",
            isRedacted: true,
          },
          { id: 12345, missingFields: true }, // Corrupted
          null,
          {
            id: "valid-2",
            timestamp: "2026-10-30T10:00:01Z",
            collection: "c",
            operation: "find",
            redactedQueryText: "{}",
            durationMs: 2,
            status: "success",
            isRedacted: true,
          },
        ],
      };
      mockStorage.store.set(`relwave_mql_history_${dbId}`, JSON.stringify(malformedPayload));

      const history = getHistory(dbId);
      assert.strictEqual(history.length, 2);
      assert.strictEqual(history[0].id, "valid-1");
      assert.strictEqual(history[1].id, "valid-2");
    });

    it("handles localStorage quota failures gracefully", () => {
      const dbId = "quota-db";
      mockStorage.throwOnSet = true;

      // Should not throw even when storage quota is exceeded
      assert.doesNotThrow(() => {
        addHistoryEntry(dbId, {
          collection: "orders",
          operation: "find",
          queryText: `{ user: "alice" }`,
          durationMs: 10,
          status: "success",
        });
      });
    });

    it("validates dbId and safely rejects empty or whitespace-only keys", () => {
      assert.strictEqual(validateDbId(""), false);
      assert.strictEqual(validateDbId("   "), false);
      assert.strictEqual(validateDbId(null as any), false);
      assert.strictEqual(validateDbId(undefined as any), false);
      assert.strictEqual(validateDbId("conn_valid_123"), true);

      assert.deepStrictEqual(getHistory(""), []);
      assert.doesNotThrow(() => clearHistory(""));
    });
  });

  describe("Privacy Invariants & Raw-Query Opt-In", () => {
    it("strictly never persists query result documents or output arrays", () => {
      const dbId = "privacy-result-db";

      const entry = addHistoryEntry(dbId, {
        collection: "secrets",
        operation: "find",
        queryText: `{ ssn: "000-11-2222" }`,
        durationMs: 15,
        status: "success",
        resultCount: 42,
      });

      // Verify returned entry has no result payload
      assert.strictEqual((entry as any).documents, undefined);
      assert.strictEqual((entry as any).results, undefined);
      assert.strictEqual((entry as any).data, undefined);

      // Verify raw storage payload contains no result documents
      const rawStored = mockStorage.store.get(`relwave_mql_history_${dbId}`);
      assert.ok(rawStored);
      assert.ok(!rawStored.includes("000-11-2222"));
      assert.ok(!rawStored.includes("documents"));
    });

    it("enforces raw query storage is disabled by default", () => {
      const dbId = "opt-in-default-db";
      const settings = getHistorySettings(dbId);

      assert.strictEqual(settings.storeRawQueries, false);

      const entry = addHistoryEntry(dbId, {
        collection: "users",
        operation: "find",
        queryText: `{ password: "MySecretPassword123!" }`,
        durationMs: 5,
        status: "success",
      });

      // Assert entry is marked as redacted template
      assert.strictEqual(entry.isRedacted, true);
      assert.strictEqual(entry.rawQueryText, undefined);
      assert.strictEqual(entry.redactedQueryText, `{ password: "<string>" }`);

      // Assert raw storage does not contain the password
      const stored = mockStorage.store.get(`relwave_mql_history_${dbId}`);
      assert.ok(!stored?.includes("MySecretPassword123!"));
    });

    it("stores raw queries only after explicit user opt-in", () => {
      const dbId = "opt-in-active-db";

      // Explicit opt-in
      updateHistorySettings(dbId, { storeRawQueries: true });
      const settings = getHistorySettings(dbId);
      assert.strictEqual(settings.storeRawQueries, true);

      const entry = addHistoryEntry(dbId, {
        collection: "users",
        operation: "find",
        queryText: `{ email: "test@example.com" }`,
        durationMs: 8,
        status: "success",
      });

      assert.strictEqual(entry.isRedacted, false);
      assert.strictEqual(entry.rawQueryText, `{ email: "test@example.com" }`);
      assert.strictEqual(entry.redactedQueryText, `{ email: "<string>" }`);
    });

    it("disabling raw queries affects future entries without corrupting past ones", () => {
      const dbId = "opt-in-toggle-db";

      // 1. Opt in and write entry 1
      updateHistorySettings(dbId, { storeRawQueries: true });
      addHistoryEntry(dbId, {
        collection: "c1",
        operation: "find",
        queryText: `{ val: "raw-val-1" }`,
        durationMs: 1,
        status: "success",
      });

      // 2. Opt out and write entry 2
      updateHistorySettings(dbId, { storeRawQueries: false });
      addHistoryEntry(dbId, {
        collection: "c2",
        operation: "find",
        queryText: `{ val: "secret-val-2" }`,
        durationMs: 2,
        status: "success",
      });

      const history = getHistory(dbId);
      assert.strictEqual(history.length, 2);

      // Entry 2 (newest) must be redacted
      assert.strictEqual(history[0].isRedacted, true);
      assert.strictEqual(history[0].rawQueryText, undefined);
      assert.strictEqual(history[0].redactedQueryText, `{ val: "<string>" }`);

      // Entry 1 (oldest) retains raw text from when setting was active
      assert.strictEqual(history[1].isRedacted, false);
      assert.strictEqual(history[1].rawQueryText, `{ val: "raw-val-1" }`);
    });
  });

  describe("Replay Safety & Template Advisory Invariants", () => {
    it("exposes the exact mandatory advisory string required by M5 specification", () => {
      assert.strictEqual(
        REDACTED_TEMPLATE_ADVISORY,
        "Loaded query template from history with redacted placeholders. Replace <string> or <number> placeholders with actual query values before executing.",
      );
    });

    it("marks redacted history entries as templates with isRedacted: true", () => {
      const dbId = "template-mark-db";
      const entry = addHistoryEntry(dbId, {
        collection: "orders",
        operation: "find",
        queryText: `{ customerId: "cust_123" }`,
        durationMs: 4,
        status: "success",
      });

      assert.strictEqual(entry.isRedacted, true);
      assert.strictEqual(isValidHistoryEntry(entry), true);
    });
  });
});
