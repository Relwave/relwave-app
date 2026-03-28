import { spawn } from "child_process";
import { join, dirname } from "path";
import { fileURLToPath } from "url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const bridgeDir = join(__dirname, "..", "bridge");

const proc = spawn("npm", ["run", "dev"], {
  cwd: bridgeDir,
  stdio: "inherit",
  shell: true,
});

proc.on("exit", (code) => process.exit(code));
