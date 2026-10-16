/**
 * Utility to clean and resolve ClickHouse URLs
 */

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
  port: number;
  ssl: boolean;
  database: string;
  user?: string;
  password?: string;
} {
  const cleanUrl = cleanClickHouseUrl(raw);
  try {
    const u = new URL(cleanUrl);
    const ssl = u.protocol === "https:";
    const defaultPort = ssl ? 8443 : 8123;
    const port = u.port ? parseInt(u.port, 10) : defaultPort;
    const database = decodeURIComponent(u.pathname.replace(/^\//, "")) || "default";
    const user = decodeURIComponent(u.username) || undefined;
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
    const port = isSsl ? 8443 : 8123;
    return {
      url: cleanUrl,
      host: cleanUrl,
      port,
      ssl: isSsl,
      database: "default",
    };
  }
}
