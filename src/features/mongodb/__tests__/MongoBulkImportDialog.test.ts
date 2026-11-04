/**
 * MongoDB Milestone 7 Phase 4 — Bulk Import Dialog Unit Tests
 *
 * Exercises:
 * - File format detection heuristics
 * - Byte formatting utilities
 * - File size pre-screening thresholds
 * - Collection name validation
 */

import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  detectFormatFromFileName,
  formatBytes,
} from "../components/bulk/MongoBulkImportDialog";
import {
  validateFileSize,
  MAX_FILE_SIZE_BYTES,
  ADVISORY_FILE_SIZE_BYTES,
} from "../utils/payloadAccounting";
import { validateCollectionName } from "../utils/validation";

describe("MongoBulkImportDialog Helpers & Validation", () => {
  describe("detectFormatFromFileName", () => {
    it("detects .json as JSON format", () => {
      assert.equal(detectFormatFromFileName("export.json"), "json");
      assert.equal(detectFormatFromFileName("DATA.JSON"), "json");
    });

    it("detects .ndjson and .jsonl as NDJSON format", () => {
      assert.equal(detectFormatFromFileName("stream.ndjson"), "ndjson");
      assert.equal(detectFormatFromFileName("EVENTS.NDJSON"), "ndjson");
      assert.equal(detectFormatFromFileName("backup.jsonl"), "ndjson");
      assert.equal(detectFormatFromFileName("LOGS.JSONL"), "ndjson");
    });

    it("detects .csv as CSV format", () => {
      assert.equal(detectFormatFromFileName("customers.csv"), "csv");
      assert.equal(detectFormatFromFileName("SPREADSHEET.CSV"), "csv");
    });

    it("returns null for unsupported or unrecognized extensions", () => {
      assert.equal(detectFormatFromFileName("data.txt"), null);
      assert.equal(detectFormatFromFileName("dump.sql"), null);
      assert.equal(detectFormatFromFileName("table.parquet"), null);
      assert.equal(detectFormatFromFileName("noextension"), null);
      assert.equal(detectFormatFromFileName(""), null);
    });
  });

  describe("formatBytes", () => {
    it("formats 0 or negative bytes as '0 B'", () => {
      assert.equal(formatBytes(0), "0 B");
      assert.equal(formatBytes(-100), "0 B");
    });

    it("formats bytes under 1 KB without decimals", () => {
      assert.equal(formatBytes(512), "512 B");
      assert.equal(formatBytes(1023), "1023 B");
    });

    it("formats kilobytes with 2 decimal places", () => {
      assert.equal(formatBytes(1024), "1.00 KB");
      assert.equal(formatBytes(1536), "1.50 KB");
    });

    it("formats megabytes with 2 decimal places", () => {
      assert.equal(formatBytes(1024 * 1024), "1.00 MB");
      assert.equal(formatBytes(2.5 * 1024 * 1024), "2.50 MB");
    });

    it("formats gigabytes with 2 decimal places", () => {
      assert.equal(formatBytes(1024 * 1024 * 1024), "1.00 GB");
    });
  });

  describe("validateFileSize Pre-screening", () => {
    it("rejects 0 or negative file sizes", () => {
      const res0 = validateFileSize(0);
      assert.equal(res0.valid, false);
      assert.ok(res0.error?.includes("empty"));

      const resNeg = validateFileSize(-10);
      assert.equal(resNeg.valid, false);
      assert.ok(resNeg.error?.includes("empty"));
    });

    it("accepts valid sizes under 16 MB without advisory", () => {
      const res = validateFileSize(5 * 1024 * 1024);
      assert.equal(res.valid, true);
      assert.equal(res.advisory, undefined);
      assert.equal(res.error, undefined);
    });

    it("accepts sizes between 16 MB and 32 MB with an advisory warning", () => {
      const res = validateFileSize(ADVISORY_FILE_SIZE_BYTES + 1024);
      assert.equal(res.valid, true);
      assert.ok(res.advisory?.includes("larger than 16 MB on disk"));
      assert.equal(res.error, undefined);
    });

    it("rejects sizes strictly exceeding MAX_FILE_SIZE_BYTES (32 MB)", () => {
      const res = validateFileSize(MAX_FILE_SIZE_BYTES + 1);
      assert.equal(res.valid, false);
      assert.ok(res.error?.includes("32 MB"));
    });
  });

  describe("validateCollectionName for Import Target", () => {
    it("accepts valid alphanumeric collection names", () => {
      assert.equal(validateCollectionName("users").valid, true);
      assert.equal(validateCollectionName("user_events_2026").valid, true);
      assert.equal(validateCollectionName("my-collection").valid, true);
    });

    it("rejects empty collection names", () => {
      assert.equal(validateCollectionName("").valid, false);
      assert.equal(validateCollectionName("   ").valid, false);
    });

    it("rejects system collection prefixes", () => {
      assert.equal(validateCollectionName("system.users").valid, false);
      assert.equal(validateCollectionName("system.indexes").valid, false);
    });

    it("rejects forbidden characters in collection names", () => {
      assert.equal(validateCollectionName("user$data").valid, false);
      assert.equal(validateCollectionName("user\0data").valid, false);
    });
  });
});
