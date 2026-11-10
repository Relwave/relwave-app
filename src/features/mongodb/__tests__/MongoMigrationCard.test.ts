import test from "node:test";
import assert from "node:assert/strict";
import React from "react";
import ReactDOMServer from "react-dom/server";
import {
  MongoMigrationCard,
  MigrationCardData,
} from "../components/migrations/MongoMigrationCard";

test("MongoMigrationCard - renders amber 'Drift Detected' badge with CHECKSUM_MISMATCH explanation and checksum hashes", () => {
  const migration: MigrationCardData = {
    id: "20261031120000",
    name: "Drifted User Schema",
    checksum: "a1b2c3d4e5f6a1b2c3d4e5f6a1b2c3d4e5f6a1b2c3d4e5f6a1b2c3d4e5f6a1b2",
    status: "APPLIED",
    driftStatus: "DRIFTED",
    drifted: true,
    driftDetails: {
      status: "DRIFTED",
      reason: "CHECKSUM_MISMATCH",
      expectedChecksum: "a1b2c3d4e5f6a1b2c3d4e5f6a1b2c3d4e5f6a1b2c3d4e5f6a1b2c3d4e5f6a1b2",
      actualChecksum: "f6e5d4c3b2a1f6e5d4c3b2a1f6e5d4c3b2a1f6e5d4c3b2a1f6e5d4c3b2a1f6e5",
      message: "On-disk manifest content has been altered since application",
    },
  };

  const html = ReactDOMServer.renderToStaticMarkup(
    React.createElement(MongoMigrationCard, { migration })
  );

  assert.ok(html.includes('data-testid="migration-drift-badge"'), "Must render drift badge");
  assert.ok(html.includes("Drift Detected"), "Badge label must say 'Drift Detected'");
  assert.ok(html.includes("text-amber-500"), "Must have amber styling");
  assert.ok(html.includes("Manifest Checksum Mismatch"), "Tooltip title must be Manifest Checksum Mismatch");
  assert.ok(html.includes("a1b2c3d4e5"), "Tooltip must include applied checksum prefix");
  assert.ok(html.includes("f6e5d4c3b2"), "Tooltip must include on-disk checksum prefix");
  assert.ok(html.includes("APPLIED"), "Execution status APPLIED badge must remain visible");
});

test("MongoMigrationCard - renders neutral 'Unverifiable' badge with MANIFEST_MISSING explanation", () => {
  const migration: MigrationCardData = {
    id: "20261031120000",
    name: "Deleted Manifest",
    checksum: "a1b2c3d4e5f6",
    status: "APPLIED",
    driftStatus: "UNVERIFIABLE",
    drifted: false,
    driftDetails: {
      status: "UNVERIFIABLE",
      reason: "MANIFEST_MISSING",
      message: "Manifest file not found in migrations directory",
    },
  };

  const html = ReactDOMServer.renderToStaticMarkup(
    React.createElement(MongoMigrationCard, { migration })
  );

  assert.ok(html.includes('data-testid="migration-unverifiable-badge"'), "Must render unverifiable badge");
  assert.ok(html.includes("Unverifiable"), "Badge label must say 'Unverifiable'");
  assert.ok(html.includes("text-muted-foreground"), "Must have neutral styling");
  assert.ok(html.includes("Manifest File Missing"), "Tooltip title must be 'Manifest File Missing'");
  assert.ok(html.includes("not found on disk"), "Tooltip description must explain file absence");
  assert.ok(html.includes("APPLIED"), "Execution status APPLIED badge must remain visible");
});

test("MongoMigrationCard - renders neutral 'Unverifiable' badge with RECORDED_CHECKSUM_MISSING explanation", () => {
  const migration: MigrationCardData = {
    id: "20261031120000",
    name: "Legacy Migration",
    checksum: "",
    status: "APPLIED",
    driftStatus: "UNVERIFIABLE",
    drifted: false,
    driftDetails: {
      status: "UNVERIFIABLE",
      reason: "RECORDED_CHECKSUM_MISSING",
      message: "Recorded migration summary contains no baseline checksum",
    },
  };

  const html = ReactDOMServer.renderToStaticMarkup(
    React.createElement(MongoMigrationCard, { migration })
  );

  assert.ok(html.includes('data-testid="migration-unverifiable-badge"'), "Must render unverifiable badge");
  assert.ok(html.includes("Unverifiable"), "Badge label must say 'Unverifiable'");
  assert.ok(html.includes("No Recorded Checksum"), "Tooltip title must be 'No Recorded Checksum'");
  assert.ok(html.includes("legacy migration"), "Tooltip description must explain legacy migration");
  assert.ok(html.includes("APPLIED"), "Execution status APPLIED badge must remain visible");
});

test("MongoMigrationCard - renders neutral 'Unverifiable' badge with MANIFEST_PARSE_ERROR explanation", () => {
  const migration: MigrationCardData = {
    id: "20261031120000",
    name: "Corrupt Manifest",
    checksum: "abc123456789",
    status: "APPLIED",
    driftStatus: "UNVERIFIABLE",
    drifted: false,
    driftDetails: {
      status: "UNVERIFIABLE",
      reason: "MANIFEST_PARSE_ERROR",
      message: "Manifest file exceeds 1MB limit (1500000 bytes)",
    },
  };

  const html = ReactDOMServer.renderToStaticMarkup(
    React.createElement(MongoMigrationCard, { migration })
  );

  assert.ok(html.includes('data-testid="migration-unverifiable-badge"'), "Must render unverifiable badge");
  assert.ok(html.includes("Manifest Parse Error"), "Tooltip title must be 'Manifest Parse Error'");
  assert.ok(html.includes("exceeds 1MB limit"), "Tooltip description must include error message");
  assert.ok(html.includes("APPLIED"), "Execution status APPLIED badge must remain visible");
});

test("MongoMigrationCard - suppresses drift and unverifiable badges when driftStatus is VERIFIED", () => {
  const migration: MigrationCardData = {
    id: "20261031120000",
    name: "Healthy Verified Migration",
    checksum: "validhash123",
    status: "APPLIED",
    driftStatus: "VERIFIED",
    drifted: false,
    driftDetails: {
      status: "VERIFIED",
      reason: "CHECKSUM_MATCH",
      expectedChecksum: "validhash123",
      actualChecksum: "validhash123",
    },
  };

  const html = ReactDOMServer.renderToStaticMarkup(
    React.createElement(MongoMigrationCard, { migration })
  );

  assert.strictEqual(
    html.includes('data-testid="migration-drift-badge"'),
    false,
    "Must NOT render drift badge when VERIFIED"
  );
  assert.strictEqual(
    html.includes('data-testid="migration-unverifiable-badge"'),
    false,
    "Must NOT render unverifiable badge when VERIFIED"
  );
  assert.ok(html.includes("APPLIED"), "Execution status APPLIED badge must remain visible");
});

test("MongoMigrationCard - preserves canonical status badge (APPLIED, PENDING) unchanged without implying verification", () => {
  const pendingMigration: MigrationCardData = {
    id: "20261031130000",
    name: "Unapplied Manifest",
    checksum: "pendinghash123",
    status: "PENDING",
  };

  const html = ReactDOMServer.renderToStaticMarkup(
    React.createElement(MongoMigrationCard, { migration: pendingMigration })
  );

  assert.ok(html.includes("PENDING"), "Must render PENDING badge");
  assert.strictEqual(html.includes('data-testid="migration-drift-badge"'), false);
  assert.strictEqual(html.includes('data-testid="migration-unverifiable-badge"'), false);
});
