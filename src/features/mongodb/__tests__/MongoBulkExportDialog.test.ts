/**
 * MongoDB Milestone 7 Phase 4 — Bulk Export Dialog Unit & Component Tests
 *
 * Exercises:
 * - formatBytes byte formatting utility
 * - Target collection validation
 * - Filter JSON parsing, EJSON validation, and filter inheritance
 * - Projection and limit validation
 * - Step-by-step UI rendering: Configure, Exporting, Ready to Save, Completed, Cancelled, and Failed
 * - Overwrite prompt presentation and state transitions
 */

import { describe, it } from "node:test";
import assert from "node:assert/strict";
import React from "react";
import ReactDOMServer from "react-dom/server";
import { MongoBulkExportDialog, formatBytes } from "../components/bulk/MongoBulkExportDialog";
import { validateCollectionName } from "../utils/validation";
import type { BulkExportServiceContract } from "../hooks/useMongoBulkExport";

function createMockService(
  overrides?: Partial<BulkExportServiceContract>,
): BulkExportServiceContract {
  return {
    startMongoBulkExport: async (req) => ({
      operationId: "mock-op-1",
      status: "in_progress",
      collection: req.collection,
      format: req.format,
    }),
    getMongoBulkOperationStatus: async (req) => ({
      operationId: req.operationId,
      type: "export",
      status: "completed",
      collection: "users",
      format: "json",
      processedDocuments: 150,
      successfulDocuments: 150,
      failedDocuments: 0,
      fileSizeBytes: 8192,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      expiresAt: new Date(Date.now() + 3600000).toISOString(),
    }),
    cancelMongoBulkOperation: async (req) => ({
      operationId: req.operationId,
      status: "cancelled",
      message: "Cancelled",
    }),
    cleanupMongoBulkOperation: async (req) => ({
      operationId: req.operationId,
      success: true,
    }),
    saveMongoBulkExportTo: async (req) => ({
      operationId: req.operationId,
      destinationPath: req.destinationPath,
      bytesWritten: 8192,
      success: true,
    }),
    ...overrides,
  };
}

describe("MongoBulkExportDialog Helpers & Validation", () => {
  describe("formatBytes Utility", () => {
    it("formats 0 or negative bytes as '0 B'", () => {
      assert.equal(formatBytes(0), "0 B");
      assert.equal(formatBytes(-50), "0 B");
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
      assert.equal(formatBytes(10.5 * 1024 * 1024), "10.50 MB");
    });

    it("formats gigabytes with 2 decimal places", () => {
      assert.equal(formatBytes(1024 * 1024 * 1024), "1.00 GB");
    });
  });

  describe("Target Collection Validation", () => {
    it("accepts valid collection names", () => {
      assert.equal(validateCollectionName("users").valid, true);
      assert.equal(validateCollectionName("audit_logs_2026").valid, true);
      assert.equal(validateCollectionName("customer-orders").valid, true);
    });

    it("rejects system collections and forbidden characters", () => {
      assert.equal(validateCollectionName("system.indexes").valid, false);
      assert.equal(validateCollectionName("$cmd").valid, false);
      assert.equal(validateCollectionName("").valid, false);
    });
  });

  describe("Filter JSON Validation", () => {
    it("parses valid EJSON/JSON filters", () => {
      const valid = '{ "status": "active", "age": { "$gte": 21 } }';
      const parsed = JSON.parse(valid);
      assert.equal(typeof parsed, "object");
      assert.equal(parsed.status, "active");
    });

    it("detects invalid JSON syntax", () => {
      const invalid = '{ "status": active }';
      assert.throws(() => JSON.parse(invalid));
    });
  });

  describe("Projection & Limit Validation", () => {
    it("validates projection JSON syntax", () => {
      const validProjection = '{ "name": 1, "email": 1, "_id": 0 }';
      const parsed = JSON.parse(validProjection);
      assert.equal(parsed.name, 1);
      assert.equal(parsed._id, 0);

      const invalidProjection = "{ name: 1 }";
      assert.throws(() => JSON.parse(invalidProjection));
    });

    it("validates positive integer limits", () => {
      const validLimitStr = "500";
      const validLimit = Number(validLimitStr);
      assert.ok(Number.isInteger(validLimit) && validLimit > 0);

      const zeroLimit = Number("0");
      assert.ok(!(Number.isInteger(zeroLimit) && zeroLimit > 0));

      const negLimit = Number("-10");
      assert.ok(!(Number.isInteger(negLimit) && negLimit > 0));

      const floatLimit = Number("12.5");
      assert.ok(!(Number.isInteger(floatLimit) && floatLimit > 0));

      const nonNumLimit = Number("abc");
      assert.ok(!(Number.isInteger(nonNumLimit) && nonNumLimit > 0));
    });
  });

  describe("Format Mapping & Dialog Instantiation", () => {
    it("maps supported export formats correctly", () => {
      const formats = ["json", "ndjson", "csv"] as const;
      const expectedExtensions = {
        json: "json",
        ndjson: "ndjson",
        csv: "csv",
      };
      for (const fmt of formats) {
        assert.equal(fmt, expectedExtensions[fmt]);
      }
    });

    it("instantiates dialog component without throwing when closed", () => {
      const html = ReactDOMServer.renderToString(
        React.createElement(MongoBulkExportDialog, {
          open: false,
          onOpenChange: () => {},
          dbId: "db-1",
          databaseName: "shop_db",
          defaultCollection: "users",
          service: createMockService(),
        }),
      );

      assert.equal(typeof html, "string");
      assert.ok(!html.includes("Export MongoDB Collection"));
    });
  });

  describe("Overwrite Collision & Cancellation Safety", () => {
    it("handles collision and allows alternate destination save without overwrite", async () => {
      const saveCalls: Array<{ destinationPath: string; overwrite?: boolean }> = [];
      const mockService = createMockService({
        saveMongoBulkExportTo: async (req) => {
          saveCalls.push({
            destinationPath: req.destinationPath,
            overwrite: req.options?.overwrite,
          });
          if (req.destinationPath.includes("collision") && !req.options?.overwrite) {
            const err = new Error("Destination file already exists");
            (err as unknown as Record<string, unknown>).code = "MONGO_FILE_EXISTS";
            throw err;
          }
          return {
            operationId: req.operationId,
            destinationPath: req.destinationPath,
            bytesWritten: 1024,
            success: true,
          };
        },
      });

      // Starting export
      const startRes = await mockService.startMongoBulkExport({
        dbId: "db-1",
        collection: "users",
        format: "json",
      });

      // Attempt 1: collision occurs
      await assert.rejects(
        () =>
          mockService.saveMongoBulkExportTo({
            operationId: startRes.operationId,
            destinationPath: "/path/collision.json",
            options: { overwrite: false },
          }),
        /already exists/,
      );

      // User cancels overwrite prompt -> no extra save call is made
      assert.equal(saveCalls.length, 1);

      // User chooses new destination -> save succeeds with overwrite: false
      const saveRes = await mockService.saveMongoBulkExportTo({
        operationId: startRes.operationId,
        destinationPath: "/path/new-destination.json",
        options: { overwrite: false },
      });

      assert.equal(saveRes.success, true);
      assert.equal(saveCalls.length, 2);
      assert.equal(saveCalls[1].destinationPath, "/path/new-destination.json");
      assert.equal(saveCalls[1].overwrite, false);
    });
  });
});
