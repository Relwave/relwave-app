#!/usr/bin/env node

const { spawnSync } = require("child_process");

const targetScriptByPlatform = {
  win32: "build:pkg:win",
  linux: "build:pkg:linux",
};

const targetScript = targetScriptByPlatform[process.platform];

if (!targetScript) {
  console.error(`ERROR: Unsupported platform for bridge packaging: ${process.platform}`);
  process.exit(1);
}

const npmCommand = process.platform === "win32" ? "npm.cmd" : "npm";
const result = spawnSync(npmCommand, ["run", targetScript], {
  stdio: "inherit",
});

if (result.error) {
  console.error(result.error.message);
  process.exit(1);
}

process.exit(result.status ?? 1);
