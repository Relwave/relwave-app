// bridge/src/bootstrap.ts
// Must execute before any database connector or native binding is imported or loaded.
import path from "path";
import fs from "fs";

if (process.platform === "win32") {
  const exeDir = path.dirname(process.execPath);
  const cwd = process.cwd();

  const candidateDirs = [
    process.env.RELWAVE_DUCKDB_DLL_DIR,
    exeDir,
    path.join(exeDir, "resources"),
    path.join(exeDir, "Resources"),
    path.join(exeDir, "_up_"),
    path.join(exeDir, "_up_", "resources"),
    path.join(exeDir, ".."),
    path.join(exeDir, "..", "resources"),
    path.join(cwd, "resources"),
    cwd,
  ].filter((d): d is string => Boolean(d));

  const dllDirs = new Set<string>();
  let foundDuckdbDll: string | null = null;

  for (const dir of candidateDirs) {
    try {
      const resolved = path.resolve(dir);
      if (fs.existsSync(resolved)) {
        const duckdbDll = path.join(resolved, "duckdb.dll");
        if (fs.existsSync(duckdbDll)) {
          dllDirs.add(resolved);
          if (!foundDuckdbDll) foundDuckdbDll = duckdbDll;
        }
        if (fs.existsSync(path.join(resolved, "better_sqlite3.node"))) {
          dllDirs.add(resolved);
        }
      }
    } catch {}
  }

  // Prepend to PATH so Windows LoadLibrary finds duckdb.dll and sibling dependencies
  if (dllDirs.size > 0) {
    const currentPath = process.env.PATH || "";
    const prefix = Array.from(dllDirs).join(";");
    process.env.PATH = `${prefix};${currentPath}`;
  }

  // Extra resilience for pkg runtime:
  // If running inside pkg, duckdb.node gets unpacked to %USERPROFILE%\.cache\pkg\<hash>\...
  // If we found duckdb.dll and the pkg cache folder exists, copy duckdb.dll right next to duckdb.node.
  try {
    if (foundDuckdbDll && (process as any).pkg) {
      const userProfile = process.env.USERPROFILE || process.env.HOME;
      if (userProfile) {
        const pkgCacheDir = path.join(userProfile, ".cache", "pkg");
        if (fs.existsSync(pkgCacheDir)) {
          const findAndCopy = (dir: string, depth = 0) => {
            if (depth > 6) return;
            const entries = fs.readdirSync(dir, { withFileTypes: true });
            for (const entry of entries) {
              const fullPath = path.join(dir, entry.name);
              if (entry.isDirectory()) {
                findAndCopy(fullPath, depth + 1);
              } else if (entry.isFile() && entry.name === "duckdb.node") {
                const targetDll = path.join(dir, "duckdb.dll");
                if (!fs.existsSync(targetDll) && foundDuckdbDll) {
                  try {
                    fs.copyFileSync(foundDuckdbDll, targetDll);
                  } catch {}
                }
              }
            }
          };
          findAndCopy(pkgCacheDir);
        }
      }
    }
  } catch {}
}
