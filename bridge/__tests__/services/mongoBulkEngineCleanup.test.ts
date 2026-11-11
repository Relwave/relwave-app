import { describe, expect, test, jest, beforeEach, afterEach } from "@jest/globals";
import path from "path";
import fs from "fs";
import os from "os";
import {
  ExportCoordinationManager,
  MongoBulkEngine,
  EXPORT_ORPHAN_TTL_MS,
  EXPORT_FILENAME_REGEX,
} from "../../src/services/mongoBulkEngine";

describe("MongoBulkEngine Export Orphan Cleanup & Coordination Suite (AUD-09)", () => {
  let testExportDir: string;

  beforeEach(async () => {
    testExportDir = path.join(
      os.tmpdir(),
      `relwave-test-exports-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    );
    await fs.promises.mkdir(testExportDir, { recursive: true });
    ExportCoordinationManager.resetForTesting();
  });

  afterEach(async () => {
    ExportCoordinationManager.resetForTesting();
    try {
      await fs.promises.rm(testExportDir, { recursive: true, force: true });
    } catch {
      // safe cleanup
    }
  });

  test("1. ExportCoordinationManager process-wide singleton identity", () => {
    const inst1 = ExportCoordinationManager.getInstance();
    const inst2 = ExportCoordinationManager.getInstance();
    expect(inst1).toBe(inst2);

    const engineA = new MongoBulkEngine();
    const engineB = new MongoBulkEngine();
    // Both engines interact with the same underlying singleton
    expect(ExportCoordinationManager.getInstance()).toBe(inst1);
  });

  test("2. Cross-engine job protection: Active job registered in Engine A is protected from purge by Engine B even when > 2 hours old", async () => {
    const manager = ExportCoordinationManager.getInstance();
    const engineA = new MongoBulkEngine();
    const engineB = new MongoBulkEngine();

    const jobId = "job-active-cross-engine-12345";
    const filePath = path.join(testExportDir, `export-${jobId}.json`);

    // Register job under Engine A / singleton
    await manager.registerJobBeforeFileCreation(jobId, filePath);
    await fs.promises.writeFile(filePath, '{"test": 1}');

    // Set file mtime to 3 hours ago (> 2h threshold)
    const threeHoursAgo = Date.now() - (EXPORT_ORPHAN_TTL_MS + 3600000);
    await fs.promises.utimes(filePath, new Date(threeHoursAgo), new Date(threeHoursAgo));

    // Engine B executes purge
    const result = await engineB.purgeOrphanedExports(testExportDir);

    expect(result.purged).toBe(0);
    expect(result.skipped).toBe(1);
    expect(fs.existsSync(filePath)).toBe(true);

    // Unregister and purge again
    await manager.unregisterJob(jobId);
    const resultAfterUnregister = await engineB.purgeOrphanedExports(testExportDir);
    expect(resultAfterUnregister.purged).toBe(1);
    expect(fs.existsSync(filePath)).toBe(false);
  });

  test("3. Pre-creation registration under critical section prevents purge race", async () => {
    const manager = ExportCoordinationManager.getInstance();
    const jobId = "pre-reg-job-999";
    const filePath = path.join(testExportDir, `export-${jobId}.tmp`);

    // Register job BEFORE file creation
    await manager.registerJobBeforeFileCreation(jobId, filePath);
    expect(manager.isJobActive(jobId)).toBe(true);

    // File is created
    await fs.promises.writeFile(filePath, "pre-created data");

    // Even if timestamp is artificially aged, active registry shield holds
    const fourHoursAgo = Date.now() - (EXPORT_ORPHAN_TTL_MS * 2);
    await fs.promises.utimes(filePath, new Date(fourHoursAgo), new Date(fourHoursAgo));

    const purgeResult = await manager.purgeOrphanedExportsAsync(testExportDir);
    expect(purgeResult.purged).toBe(0);
    expect(purgeResult.skipped).toBe(1);
    expect(fs.existsSync(filePath)).toBe(true);

    await manager.unregisterJob(jobId);
  });

  test("4. Two-hour TTL age boundary (Option A: 2 * 60 * 60 * 1000 ms)", async () => {
    const manager = ExportCoordinationManager.getInstance();

    const freshJobId = "fresh-job-uuid-111";
    const staleJobId = "stale-job-uuid-222";

    const freshFile = path.join(testExportDir, `export-${freshJobId}.json`);
    const staleFile = path.join(testExportDir, `export-${staleJobId}.json`);

    await fs.promises.writeFile(freshFile, "fresh export data");
    await fs.promises.writeFile(staleFile, "stale export data");

    const now = Date.now();
    // Fresh: 1 hour ago (< 2h)
    const oneHourAgo = now - 3600000;
    await fs.promises.utimes(freshFile, new Date(oneHourAgo), new Date(oneHourAgo));

    // Stale: 2 hours and 5 minutes ago (> 2h)
    const twoHoursFiveMinAgo = now - (EXPORT_ORPHAN_TTL_MS + 300000);
    await fs.promises.utimes(staleFile, new Date(twoHoursFiveMinAgo), new Date(twoHoursFiveMinAgo));

    const result = await manager.purgeOrphanedExportsAsync(testExportDir);

    expect(result.purged).toBe(1); // Only stale file purged
    expect(result.skipped).toBe(1); // Fresh file skipped

    expect(fs.existsSync(freshFile)).toBe(true);
    expect(fs.existsSync(staleFile)).toBe(false);
  });

  test("5. Symlink rejection via lstat() protects target files", async () => {
    const manager = ExportCoordinationManager.getInstance();

    const targetFile = path.join(testExportDir, "important-target-data.json");
    await fs.promises.writeFile(targetFile, "CRITICAL DATA NEVER TOUCH");

    const symlinkPath = path.join(testExportDir, "export-symlink-target.json");

    try {
      await fs.promises.symlink(targetFile, symlinkPath);
    } catch (err: any) {
      // In some Windows environments without dev privileges, symlinks might require elevation
      if (err.code === "EPERM") {
        return; // skip if OS forbids symlink creation
      }
      throw err;
    }

    // Age the symlink target or symlink
    const threeHoursAgo = Date.now() - (EXPORT_ORPHAN_TTL_MS + 3600000);
    try {
      await fs.promises.utimes(symlinkPath, new Date(threeHoursAgo), new Date(threeHoursAgo));
    } catch {}

    const result = await manager.purgeOrphanedExportsAsync(testExportDir);

    // Symlinks are skipped
    expect(fs.existsSync(targetFile)).toBe(true);
    expect(fs.existsSync(symlinkPath)).toBe(true);
  });

  test("6. Keyed per-directory mutex serializes concurrent purge sweeps", async () => {
    const manager = ExportCoordinationManager.getInstance();
    const executionOrder: string[] = [];

    const p1 = manager.withDirLock(testExportDir, async () => {
      executionOrder.push("p1_start");
      await new Promise((resolve) => setTimeout(resolve, 50));
      executionOrder.push("p1_end");
    });

    const p2 = manager.withDirLock(testExportDir, async () => {
      executionOrder.push("p2_start");
      executionOrder.push("p2_end");
    });

    await Promise.all([p1, p2]);

    expect(executionOrder).toEqual(["p1_start", "p1_end", "p2_start", "p2_end"]);
  });

  test("7. Strict export filename regex matching ignores unrelated files", async () => {
    const manager = ExportCoordinationManager.getInstance();

    const validExport1 = path.join(testExportDir, "export-abc-123.csv");
    const validExport2 = path.join(testExportDir, "export-xyz_999.ndjson");
    const validExport3 = path.join(testExportDir, "export-temp-session.tmp");
    const invalidFile1 = path.join(testExportDir, "my-other-document.json");
    const invalidFile2 = path.join(testExportDir, "export.json");
    const invalidFile3 = path.join(testExportDir, "export-.csv");

    await fs.promises.writeFile(validExport1, "1");
    await fs.promises.writeFile(validExport2, "2");
    await fs.promises.writeFile(validExport3, "3");
    await fs.promises.writeFile(invalidFile1, "4");
    await fs.promises.writeFile(invalidFile2, "5");
    await fs.promises.writeFile(invalidFile3, "6");

    const ancientTime = Date.now() - (EXPORT_ORPHAN_TTL_MS + 10000000);
    for (const f of [validExport1, validExport2, validExport3, invalidFile1, invalidFile2, invalidFile3]) {
      await fs.promises.utimes(f, new Date(ancientTime), new Date(ancientTime));
    }

    const result = await manager.purgeOrphanedExportsAsync(testExportDir);

    expect(result.purged).toBe(3); // only validExport 1, 2, 3
    expect(result.skipped).toBe(3); // invalidFile 1, 2, 3 skipped

    expect(fs.existsSync(validExport1)).toBe(false);
    expect(fs.existsSync(validExport2)).toBe(false);
    expect(fs.existsSync(validExport3)).toBe(false);
    expect(fs.existsSync(invalidFile1)).toBe(true);
    expect(fs.existsSync(invalidFile2)).toBe(true);
    expect(fs.existsSync(invalidFile3)).toBe(true);
  });
});
