import { execSync } from 'child_process';

const platform = process.platform;
const script = platform === 'win32'
  ? 'build:pkg:win'
  : platform === 'linux'
  ? 'build:pkg:linux'
  : null;

if (!script) {
  console.error(`Unsupported platform for bridge packaging: ${platform}`);
  process.exit(1);
}

execSync(`npm --prefix bridge run ${script}`, { stdio: 'inherit' });