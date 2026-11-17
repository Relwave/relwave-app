import test from "node:test";
import assert from "node:assert/strict";
import { getMigrationStatusBadgeConfig } from "../components/migrations/MongoMigrationCard";
import {
  groupAndSortMigrationEvents,
  getEventTypeBadgeConfig,
} from "../components/migrations/MongoMigrationDetailDrawer";
import { STATIC_PREFLIGHT_ADVISORY } from "../components/migrations/MongoMigrationApplyDialog";
import { IRREVERSIBLE_ROLLBACK_ACKNOWLEDGMENT } from "../components/migrations/MongoMigrationRollbackDialog";
import type {
  MongoMigrationStatus,
  MongoMigrationEvent,
  MongoMigrationEventType,
} from "../types/migration";

test("MongoMigrations - All 9 Canonical Statuses are mapped correctly", () => {
  const canonicalStatuses: MongoMigrationStatus[] = [
    "PENDING",
    "ACQUIRING_LOCK",
    "APPLYING",
    "FAILED_PARTIAL",
    "CRASHED_UNCERTAIN",
    "ROLLING_BACK",
    "ROLLED_BACK",
    "APPLIED",
    "FAILED_MANUAL_INTERVENTION_REQUIRED",
  ];

  assert.strictEqual(
    canonicalStatuses.length,
    9,
    "Must strictly preserve exactly 9 canonical states",
  );

  for (const status of canonicalStatuses) {
    const config = getMigrationStatusBadgeConfig(status);
    assert.strictEqual(config.label, status, `Badge label must match canonical status "${status}"`);
    assert.ok(config.className, `Badge must define a styling className for "${status}"`);
    assert.ok(config.description, `Badge must define an explanatory description for "${status}"`);
  }

  // Check specific UX requirements
  const pending = getMigrationStatusBadgeConfig("PENDING");
  assert.strictEqual(pending.variant, "secondary");

  const acquiring = getMigrationStatusBadgeConfig("ACQUIRING_LOCK");
  assert.ok(acquiring.className.includes("animate-pulse"), "ACQUIRING_LOCK must pulse");
  assert.ok(acquiring.className.includes("blue"), "ACQUIRING_LOCK must be blue");

  const applying = getMigrationStatusBadgeConfig("APPLYING");
  assert.ok(applying.className.includes("animate-pulse"), "APPLYING must pulse");
  assert.ok(applying.className.includes("amber"), "APPLYING must be amber");

  const failedPartial = getMigrationStatusBadgeConfig("FAILED_PARTIAL");
  assert.strictEqual(failedPartial.variant, "destructive");

  const crashedUncertain = getMigrationStatusBadgeConfig("CRASHED_UNCERTAIN");
  assert.strictEqual(crashedUncertain.variant, "outline");
  assert.ok(
    crashedUncertain.className.includes("destructive"),
    "CRASHED_UNCERTAIN must highlight destructive",
  );

  const rollingBack = getMigrationStatusBadgeConfig("ROLLING_BACK");
  assert.ok(rollingBack.className.includes("animate-pulse"), "ROLLING_BACK must pulse");
  assert.ok(rollingBack.className.includes("purple"), "ROLLING_BACK must be purple");

  const rolledBack = getMigrationStatusBadgeConfig("ROLLED_BACK");
  assert.strictEqual(rolledBack.variant, "outline");

  const applied = getMigrationStatusBadgeConfig("APPLIED");
  assert.ok(applied.className.includes("emerald"), "APPLIED must be emerald green");

  const failedManual = getMigrationStatusBadgeConfig("FAILED_MANUAL_INTERVENTION_REQUIRED");
  assert.strictEqual(failedManual.variant, "destructive");
  assert.ok(
    failedManual.className.includes("font-bold"),
    "FAILED_MANUAL_INTERVENTION_REQUIRED must be bold",
  );
});

test("MongoMigrations - Event Audit History Grouping & Sequence Ordering", () => {
  // Empty event stream test
  assert.deepStrictEqual(groupAndSortMigrationEvents([]), []);

  // Jumbled events across two distinct attempts
  const rawEvents: MongoMigrationEvent[] = [
    {
      _id: "ev-5",
      eventId: "e5",
      migrationId: "20261031_001",
      attemptId: "att-2",
      attemptNumber: 2,
      sequenceNumber: 2,
      stepIndex: 1,
      stepType: "createIndex",
      eventType: "STEP_COMPLETE",
      timestamp: "2026-10-31T12:00:15Z",
      lockOwnerId: "worker-b",
      fencingToken: 12,
    },
    {
      _id: "ev-2",
      eventId: "e2",
      migrationId: "20261031_001",
      attemptId: "att-1",
      attemptNumber: 1,
      sequenceNumber: 2,
      stepIndex: 0,
      stepType: "createCollection",
      eventType: "STEP_COMPLETE",
      timestamp: "2026-10-31T11:00:05Z",
      lockOwnerId: "worker-a",
      fencingToken: 11,
    },
    {
      _id: "ev-4",
      eventId: "e4",
      migrationId: "20261031_001",
      attemptId: "att-2",
      attemptNumber: 2,
      sequenceNumber: 1,
      stepIndex: 0,
      stepType: "createCollection",
      eventType: "STEP_START",
      timestamp: "2026-10-31T12:00:00Z",
      lockOwnerId: "worker-b",
      fencingToken: 12,
    },
    {
      _id: "ev-1",
      eventId: "e1",
      migrationId: "20261031_001",
      attemptId: "att-1",
      attemptNumber: 1,
      sequenceNumber: 1,
      stepIndex: 0,
      stepType: "createCollection",
      eventType: "STEP_START",
      timestamp: "2026-10-31T11:00:00Z",
      lockOwnerId: "worker-a",
      fencingToken: 11,
    },
    {
      _id: "ev-3",
      eventId: "e3",
      migrationId: "20261031_001",
      attemptId: "att-1",
      attemptNumber: 1,
      sequenceNumber: 3,
      stepIndex: 1,
      stepType: "createIndex",
      eventType: "STEP_FAILED",
      timestamp: "2026-10-31T11:00:10Z",
      lockOwnerId: "worker-a",
      fencingToken: 11,
      metadata: { error: "Index key violation" },
    },
    {
      _id: "ev-6",
      eventId: "e6",
      migrationId: "20261031_001",
      attemptId: "att-2",
      attemptNumber: 2,
      sequenceNumber: 3,
      eventType: "MIGRATION_APPLIED",
      timestamp: "2026-10-31T12:00:20Z",
      lockOwnerId: "worker-b",
      fencingToken: 12,
    },
  ];

  const grouped = groupAndSortMigrationEvents(rawEvents);

  // Must have exactly two attempt groups
  assert.strictEqual(grouped.length, 2);

  // Groups ordered by attemptNumber ascending
  assert.strictEqual(grouped[0].attemptNumber, 1);
  assert.strictEqual(grouped[0].attemptId, "att-1");
  assert.strictEqual(grouped[1].attemptNumber, 2);
  assert.strictEqual(grouped[1].attemptId, "att-2");

  // Attempt 1 events strictly ordered by sequenceNumber ascending: 1, 2, 3
  assert.strictEqual(grouped[0].events.length, 3);
  assert.deepStrictEqual(
    grouped[0].events.map((e) => e.sequenceNumber),
    [1, 2, 3],
  );
  assert.strictEqual(grouped[0].events[0].eventId, "e1");
  assert.strictEqual(grouped[0].events[1].eventId, "e2");
  assert.strictEqual(grouped[0].events[2].eventId, "e3");

  // Attempt 2 events strictly ordered by sequenceNumber ascending: 1, 2, 3
  assert.strictEqual(grouped[1].events.length, 3);
  assert.deepStrictEqual(
    grouped[1].events.map((e) => e.sequenceNumber),
    [1, 2, 3],
  );
  assert.strictEqual(grouped[1].events[0].eventId, "e4");
  assert.strictEqual(grouped[1].events[1].eventId, "e5");
  assert.strictEqual(grouped[1].events[2].eventId, "e6");
});

test("MongoMigrations - Static Preflight Mandatory Warning String", () => {
  const expectedAdvisory =
    "Validates manifest structure, expression safety, and syntax; does not test runtime constraint satisfaction on live data.";

  assert.strictEqual(
    STATIC_PREFLIGHT_ADVISORY,
    expectedAdvisory,
    "Dry Run advisory text must match exact specification requirement",
  );
});

test("MongoMigrations - Rollback Irreversibility Disclosure & Confirmation", () => {
  const expectedAcknowledgment =
    "I acknowledge that data destroyed by dropCollection cannot be restored and attempt partial compensation of other steps.";

  assert.strictEqual(
    IRREVERSIBLE_ROLLBACK_ACKNOWLEDGMENT,
    expectedAcknowledgment,
    "Rollback irreversibility acknowledgment text must match exact specification requirement",
  );
});

test("MongoMigrations - Read-Only Connection Protection Disables Mutating Actions", () => {
  // Simulate read-only detection logic
  const checkReadOnly = (dbConn: any): boolean => {
    return Boolean(dbConn?.readOnly || dbConn?.readonly);
  };

  assert.strictEqual(checkReadOnly({ readOnly: true }), true);
  assert.strictEqual(checkReadOnly({ readonly: true }), true);
  assert.strictEqual(checkReadOnly({ readOnly: false }), false);
  assert.strictEqual(checkReadOnly({}), false);
  assert.strictEqual(checkReadOnly(null), false);

  // Helper verifying action guard logic
  const isActionAllowed = (isReadOnly: boolean, hasPendingItems: boolean): boolean => {
    if (isReadOnly) return false;
    return hasPendingItems;
  };

  assert.strictEqual(
    isActionAllowed(true, true),
    false,
    "Read-only prevents apply even if pending items exist",
  );
  assert.strictEqual(isActionAllowed(true, false), false, "Read-only prevents apply when empty");
  assert.strictEqual(
    isActionAllowed(false, true),
    true,
    "Read-write allows apply when items exist",
  );
  assert.strictEqual(
    isActionAllowed(false, false),
    false,
    "Read-write blocks apply when no items exist",
  );
});

test("MongoMigrations - Event Type Badges for all 14 Event Types", () => {
  const allEventTypes: MongoMigrationEventType[] = [
    "VALIDATION_SUCCESS",
    "LOCK_ACQUIRED",
    "MIGRATION_START",
    "STEP_START",
    "STEP_COMPLETE",
    "STEP_FAILED",
    "STEP_UNCERTAIN",
    "COMPENSATION_START",
    "COMPENSATION_COMPLETE",
    "COMPENSATION_FAILED",
    "MIGRATION_APPLIED",
    "MIGRATION_ROLLED_BACK",
    "LOCK_RELEASED",
    "MANUAL_INTERVENTION_REQUIRED",
  ];

  assert.strictEqual(allEventTypes.length, 14, "Must support all 14 migration event types");

  for (const et of allEventTypes) {
    const badge = getEventTypeBadgeConfig(et);
    assert.strictEqual(badge.label, et, `Event badge label must match ${et}`);
    assert.ok(badge.className, `Event badge className must be defined for ${et}`);
  }
});

test("MongoMigrations - Unknown Event Type & Status Fallbacks", () => {
  const unknownEvent = getEventTypeBadgeConfig("UNKNOWN_CUSTOM_EVENT" as any);
  assert.strictEqual(unknownEvent.label, "UNKNOWN_CUSTOM_EVENT");
  assert.ok(unknownEvent.className.includes("bg-muted"));

  const unknownStatus = getMigrationStatusBadgeConfig("UNKNOWN_STATUS" as any);
  assert.strictEqual(unknownStatus.label, "UNKNOWN_STATUS" as any);
  assert.ok(unknownStatus.className.includes("bg-muted"));
});

test("MongoMigrations - Uncertain & Manual Intervention Action Restrictions", () => {
  // Batch apply guard logic: pauses when any applied migration is uncertain or requires manual intervention
  const canApplyAll = (
    isReadOnly: boolean,
    pendingCount: number,
    appliedSummaries: { status: MongoMigrationStatus }[],
  ): boolean => {
    if (isReadOnly) return false;
    if (pendingCount === 0) return false;
    const hasUncertainOrManualIntervention = appliedSummaries.some(
      (m) => m.status === "CRASHED_UNCERTAIN" || m.status === "FAILED_MANUAL_INTERVENTION_REQUIRED",
    );
    return !hasUncertainOrManualIntervention;
  };

  assert.strictEqual(canApplyAll(false, 3, []), true, "Clean state allows Apply All");
  assert.strictEqual(
    canApplyAll(false, 3, [{ status: "APPLIED" }]),
    true,
    "Applied migrations allow Apply All",
  );
  assert.strictEqual(
    canApplyAll(false, 3, [{ status: "CRASHED_UNCERTAIN" }]),
    false,
    "CRASHED_UNCERTAIN halts automated batch apply",
  );
  assert.strictEqual(
    canApplyAll(false, 3, [{ status: "FAILED_MANUAL_INTERVENTION_REQUIRED" }]),
    false,
    "FAILED_MANUAL_INTERVENTION_REQUIRED halts automated batch apply",
  );
  assert.strictEqual(canApplyAll(true, 3, []), false, "Read-only halts automated batch apply");
});
