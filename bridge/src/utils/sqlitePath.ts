export function normalizeSQLitePath(rawPath: unknown): string {
  if (typeof rawPath !== "string") {
    return "";
  }

  const trimmed = rawPath.trim();
  if (!trimmed) {
    return "";
  }

  if (/^\/[A-Za-z]:\//.test(trimmed)) {
    return trimmed.slice(1);
  }

  if (/^(?:file|sqlite):\/\//i.test(trimmed)) {
    try {
      const parsed = new URL(trimmed);
      const hostname = parsed.hostname || "";
      const pathname = parsed.pathname || "";

      if (hostname && /^[A-Za-z]$/.test(hostname) && pathname.startsWith("/")) {
        return `${hostname}:${pathname}`;
      }

      if (!hostname && /^\/[A-Za-z]:\//.test(pathname)) {
        return pathname.slice(1);
      }

      return decodeURIComponent(`${hostname}${pathname}`);
    } catch {
      return trimmed;
    }
  }

  return trimmed;
}

export function isWindowsDriveRootPath(dbPath: string): boolean {
  return /^[A-Za-z]:(?:[\\/])?$/.test(dbPath);
}
