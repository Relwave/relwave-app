#!/usr/bin/env node
/**
 * Packaging helper: copy a better-sqlite3 native addon that matches the
 * packaged bridge runtime, not necessarily the host Node.js runtime.
 *
 * pkg 5.8.x embeds a Node 18.5.0 runtime for this project, so a host-built
 * Node 22 addon will load in development but fail inside the packaged bridge
 * with a NODE_MODULE_VERSION mismatch.
 */

const { execFileSync } = require("child_process");
const fs = require("fs");
const os = require("os");
const path = require("path");

const PKG_RUNTIME = {
  nodeVersion: "22.12.0",
  nodeModules: "127",
  platform: process.platform,
  arch: process.arch,
};

function findFirstExisting(candidates) {
  return candidates.find((candidate) => fs.existsSync(candidate));
}

function findFirstNodeBinary(rootDir) {
  const queue = [rootDir];

  while (queue.length > 0) {
    const currentDir = queue.shift();
    const entries = fs.readdirSync(currentDir, { withFileTypes: true });

    for (const entry of entries) {
      const fullPath = path.join(currentDir, entry.name);
      if (entry.isDirectory()) {
        queue.push(fullPath);
        continue;
      }
      if (entry.isFile() && fullPath.endsWith(".node")) {
        return fullPath;
      }
    }
  }

  return undefined;
}

function downloadPkgRuntimeBinary(betterSqlite3Dir) {
  const packageJsonPath = path.join(betterSqlite3Dir, "package.json");
  const tempDir = fs.mkdtempSync(
    path.join(os.tmpdir(), "relwave-better-sqlite3-"),
  );
  const prebuildInstallBin = require.resolve("prebuild-install/bin.js", {
    paths: [betterSqlite3Dir],
  });

  fs.copyFileSync(packageJsonPath, path.join(tempDir, "package.json"));

  try {
    execFileSync(
      process.execPath,
      [
        prebuildInstallBin,
        "--target",
        PKG_RUNTIME.nodeVersion,
        "--runtime",
        "node",
        "--platform",
        PKG_RUNTIME.platform,
        "--arch",
        PKG_RUNTIME.arch,
        "--path",
        tempDir,
      ],
      {
        cwd: betterSqlite3Dir,
        stdio: "inherit",
      },
    );
  } catch (error) {
    console.error(
      "ERROR: Failed to fetch a better-sqlite3 binary for the packaged bridge runtime.",
    );
    console.error(
      `       Packaged bridge runtime: Node ${PKG_RUNTIME.nodeVersion} (NODE_MODULE_VERSION ${PKG_RUNTIME.nodeModules})`,
    );
    console.error(
      `       Current build runtime: ${process.version} (NODE_MODULE_VERSION ${process.versions.modules})`,
    );
    console.error(
      "       Re-run the build with internet access, or rebuild better-sqlite3 for Node 18 before packaging.",
    );
    process.exit(error.status || 1);
  }

  const downloadedBinary = findFirstNodeBinary(tempDir);
  if (!downloadedBinary) {
    console.error(
      "ERROR: prebuild-install completed, but no better_sqlite3.node was extracted.",
    );
    process.exit(1);
  }

  return downloadedBinary;
}

function resolveNativeBinarySource(betterSqlite3Dir) {
  const runtimeSpecificCandidates = [
    path.join(
      betterSqlite3Dir,
      "lib",
      "binding",
      `node-v${PKG_RUNTIME.nodeModules}-${PKG_RUNTIME.platform}-${PKG_RUNTIME.arch}`,
      "better_sqlite3.node",
    ),
    path.join(
      betterSqlite3Dir,
      "compiled",
      PKG_RUNTIME.nodeVersion,
      PKG_RUNTIME.platform,
      PKG_RUNTIME.arch,
      "better_sqlite3.node",
    ),
  ];

  const runtimeSpecificBinary = findFirstExisting(runtimeSpecificCandidates);
  if (runtimeSpecificBinary) {
    return runtimeSpecificBinary;
  }

  if (process.versions.modules === PKG_RUNTIME.nodeModules) {
    const localBuildBinary = findFirstExisting([
      path.join(betterSqlite3Dir, "build", "Release", "better_sqlite3.node"),
      path.join(betterSqlite3Dir, "build", "Debug", "better_sqlite3.node"),
    ]);

    if (localBuildBinary) {
      return localBuildBinary;
    }
  }

  return downloadPkgRuntimeBinary(betterSqlite3Dir);
}

const betterSqlite3Pkg = require.resolve("better-sqlite3/package.json");
const betterSqlite3Dir = path.dirname(betterSqlite3Pkg);
const src = resolveNativeBinarySource(betterSqlite3Dir);

if (!src || !fs.existsSync(src)) {
  console.error("ERROR: Could not resolve better_sqlite3.node for packaging.");
  process.exit(1);
}

const repoRoot = path.resolve(__dirname, "..", "..");
const dest = path.join(
  repoRoot,
  "src-tauri",
  "resources",
  "better_sqlite3.node",
);

fs.mkdirSync(path.dirname(dest), { recursive: true });
fs.copyFileSync(src, dest);
console.log("Copied better_sqlite3.node");
console.log("    from:", src);
console.log("    to:  ", dest);
