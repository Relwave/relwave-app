/**
 * Parse a database connection URL into its components
 * Supports formats:
 * - postgres://user:password@host:port/database?sslmode=require
 * - postgresql://user:password@host:port/database
 * - mysql://user:password@host:port/database
 */

export interface ParsedConnectionUrl {
  type: string;
  host: string;
  port: string;
  user: string;
  password: string;
  database: string;
  ssl: boolean;
  sslmode: string;
}

function normalizeSqlitePathFromUrl(parsed: URL): string {
  const hostname = parsed.hostname || "";
  const pathname = parsed.pathname || "";

  if (hostname && /^[A-Za-z]$/.test(hostname) && pathname.startsWith("/")) {
    return decodeURIComponent(`${hostname}:${pathname}`);
  }

  if (!hostname && /^\/[A-Za-z]:\//.test(pathname)) {
    return decodeURIComponent(pathname.slice(1));
  }

  return decodeURIComponent(`${hostname}${pathname}`);
}

function encodeSqlitePathSegments(database: string): string {
  return database
    .replace(/\\/g, "/")
    .replace(/^\/+/, "")
    .split("/")
    .map((segment) => encodeURIComponent(segment))
    .join("/");
}

export function cleanClickHouseUrl(raw?: string): string {
  let url = (raw || "").trim();
  if (!url) return "";

  // Strip markdown link brackets e.g. [https://...](https://...)
  const mdMatch = url.match(/\[(.*?)\]\((.*?)\)/);
  if (mdMatch) {
    url = mdMatch[2] || mdMatch[1];
  }

  // Strip enclosing quotes
  url = url.replace(/^['"`]+|['"`]+$/g, "").trim();

  // If starts with clickhouses:// -> https://
  if (url.startsWith("clickhouses://")) {
    url = "https://" + url.slice("clickhouses://".length);
  } else if (url.startsWith("clickhouse://")) {
    const rest = url.slice("clickhouse://".length);
    const isSsl =
      rest.includes(":8443") || rest.includes(":443") || rest.includes("clickhouse.cloud");
    url = (isSsl ? "https://" : "http://") + rest;
  }

  // If no scheme was provided, determine http vs https
  if (!url.startsWith("http://") && !url.startsWith("https://")) {
    const isSsl = url.includes(":8443") || url.includes(":443") || url.includes("clickhouse.cloud");
    url = (isSsl ? "https://" : "http://") + url;
  }

  // Strip trailing slashes
  url = url.replace(/\/+$/, "");

  return url;
}

export function parseClickHouseUrl(raw?: string): {
  url: string;
  host: string;
  port: string;
  ssl: boolean;
  database: string;
  user: string;
  password?: string;
} {
  const cleanUrl = cleanClickHouseUrl(raw);
  try {
    const u = new URL(cleanUrl);
    const ssl = u.protocol === "https:";
    const defaultPort = ssl ? "8443" : "8123";
    const port = u.port || defaultPort;
    const database = decodeURIComponent(u.pathname.replace(/^\//, "")) || "default";
    const user = decodeURIComponent(u.username) || "default";
    const password = decodeURIComponent(u.password) || undefined;

    return {
      url: cleanUrl,
      host: u.hostname,
      port,
      ssl,
      database,
      user,
      password,
    };
  } catch {
    const isSsl = cleanUrl.includes(":8443") || cleanUrl.startsWith("https:");
    const port = isSsl ? "8443" : "8123";
    return {
      url: cleanUrl,
      host: cleanUrl,
      port,
      ssl: isSsl,
      database: "default",
      user: "default",
    };
  }
}

export function parseConnectionUrl(url: string): ParsedConnectionUrl | null {
  try {
    // Trim whitespace
    url = url.trim();

    // Handle empty string
    if (!url) return null;

    // Parse the URL
    const parsed = new URL(cleanClickHouseUrl(url));

    // Determine database type from protocol
    let type = "";
    let isSslProtocol = false;
    const protocol = parsed.protocol.replace(":", "").toLowerCase();

    if (protocol === "postgres" || protocol === "postgresql") {
      type = "postgresql";
    } else if (protocol === "mysql") {
      type = "mysql";
    } else if (protocol === "sqlite") {
      type = "sqlite";
    } else if (protocol === "duckdb") {
      type = "duckdb";
    } else if (protocol === "clickhouse" || protocol === "clickhouses") {
      type = "clickhouse";
      if (protocol === "clickhouses") {
        isSslProtocol = true;
      }
    } else if (
      parsed.hostname.includes("clickhouse") ||
      parsed.port === "8443" ||
      parsed.port === "8123"
    ) {
      type = "clickhouse";
      isSslProtocol = protocol === "https";
    } else {
      return null; // Unsupported protocol
    }

    // SQLite and DuckDB use path only, no host/port/auth
    if (type === "sqlite" || type === "duckdb") {
      const dbPath = normalizeSqlitePathFromUrl(parsed);
      return {
        type,
        host: "",
        port: "",
        user: "",
        password: "",
        database: dbPath,
        ssl: false,
        sslmode: "",
      };
    }

    // Extract components
    const host = parsed.hostname || "localhost";
    const defaultPort =
      type === "postgresql"
        ? "5432"
        : type === "clickhouse"
          ? isSslProtocol
            ? "8443"
            : "8123"
          : "3306";
    const port = parsed.port || defaultPort;
    const user = decodeURIComponent(parsed.username || (type === "clickhouse" ? "default" : ""));
    const password = decodeURIComponent(parsed.password || "");

    // Database name is the pathname without leading slash
    const database = decodeURIComponent(
      parsed.pathname.replace(/^\//, "") || (type === "clickhouse" ? "default" : ""),
    );

    // Parse SSL parameters from query string
    const sslmode = parsed.searchParams.get("sslmode") || (isSslProtocol ? "require" : "");
    const ssl = isSslProtocol || (sslmode !== "" && sslmode !== "disable");

    return {
      type,
      host,
      port,
      user,
      password,
      database,
      ssl,
      sslmode,
    };
  } catch {
    // Invalid URL format
    return null;
  }
}

/**
 * Build a connection URL from components
 */
export function buildConnectionUrl(params: {
  type: string;
  host: string;
  port: string;
  user: string;
  password: string;
  database: string;
  sslmode?: string;
}): string {
  if (params.type === "sqlite" || params.type === "duckdb") {
    return `${params.type}:///${encodeSqlitePathSegments(params.database)}`;
  }
  const isClickHouseSsl =
    params.type === "clickhouse" && (params.sslmode === "require" || params.port === "8443");
  const protocol =
    params.type === "mysql"
      ? "mysql"
      : params.type === "clickhouse"
        ? isClickHouseSsl
          ? "clickhouses"
          : "clickhouse"
        : "postgres";
  const auth = params.password
    ? `${encodeURIComponent(params.user)}:${encodeURIComponent(params.password)}`
    : encodeURIComponent(params.user);

  let url = `${protocol}://${auth}@${params.host}:${params.port}/${encodeURIComponent(params.database)}`;

  if (params.sslmode && params.sslmode !== "disable" && !isClickHouseSsl) {
    url += `?sslmode=${params.sslmode}`;
  }

  return url;
}
