/**
 * MongoDB URI utilities.
 *
 * Implements the decision-#11 credential handling: a MongoDB connection URI that
 * embeds credentials is parsed, the password is extracted (to be stored through
 * the existing dbStore AES path), and a *sanitized* URI (credentials removed) is
 * what gets persisted in databases.json. The authenticated URI is reconstructed
 * only at runtime from the sanitized URI + the decrypted password, and is never
 * written back.
 *
 * Uses a zero-dependency parser that safely handles single-host, mongodb+srv://,
 * and multi-host comma-separated seedlists (which WHATWG URL rejects with ERR_INVALID_URL).
 * All returned strings are JSON-safe and free of plaintext passwords
 * unless explicitly re-injecting at runtime.
 */

import type { MongoUriParts } from "../types/mongo";

const MONGO_URI_RE = /^mongodb(\+srv)?:\/\//i;

/** True when the string is a MongoDB connection URI. */
export function isMongoUri(raw?: string): boolean {
  return typeof raw === "string" && MONGO_URI_RE.test(raw.trim());
}

type MongoUriComponents = {
  scheme: "mongodb" | "mongodb+srv";
  hosts: string;
  host: string;
  port?: number;
  user?: string;
  password?: string; // decoded
  database?: string;
  options: string; // raw query string, without leading '?'
};

/** Parse a MongoDB URI into its components (password decoded). */
function parseMongoUriComponents(raw: string): MongoUriComponents {
  const trimmed = raw.trim();
  const isSrv = trimmed.toLowerCase().startsWith("mongodb+srv://");
  const scheme: "mongodb" | "mongodb+srv" = isSrv ? "mongodb+srv" : "mongodb";
  const prefix = isSrv ? "mongodb+srv://" : "mongodb://";
  const rest = trimmed.toLowerCase().startsWith(prefix)
    ? trimmed.slice(prefix.length)
    : trimmed.replace(/^mongodb(\+srv)?:\/\//i, "");

  const queryIndex = rest.indexOf("?");
  const hashIndex = rest.indexOf("#");
  let endOfPathIndex = rest.length;
  if (queryIndex !== -1) endOfPathIndex = queryIndex;
  if (hashIndex !== -1 && (queryIndex === -1 || hashIndex < queryIndex)) {
    endOfPathIndex = hashIndex;
  }

  const authorityAndPath = rest.slice(0, endOfPathIndex);
  let options = "";
  if (queryIndex !== -1) {
    if (hashIndex !== -1 && hashIndex > queryIndex) {
      options = rest.slice(queryIndex + 1, hashIndex);
    } else {
      options = rest.slice(queryIndex + 1);
    }
  }

  const slashIndex = authorityAndPath.indexOf("/");
  const authority = slashIndex !== -1 ? authorityAndPath.slice(0, slashIndex) : authorityAndPath;
  const rawDb = slashIndex !== -1 ? authorityAndPath.slice(slashIndex + 1) : "";
  let database: string | undefined = undefined;
  if (rawDb) {
    try {
      database = decodeURIComponent(rawDb);
    } catch {
      database = rawDb;
    }
  }

  let user: string | undefined;
  let password: string | undefined;
  let hosts = authority;

  const atIndex = authority.lastIndexOf("@");
  if (atIndex !== -1) {
    const creds = authority.slice(0, atIndex);
    hosts = authority.slice(atIndex + 1);
    const colonIndex = creds.indexOf(":");
    if (colonIndex !== -1) {
      const rawUser = creds.slice(0, colonIndex);
      const rawPass = creds.slice(colonIndex + 1);
      try {
        user = decodeURIComponent(rawUser);
      } catch {
        user = rawUser;
      }
      try {
        password = decodeURIComponent(rawPass);
      } catch {
        password = rawPass;
      }
    } else {
      try {
        user = decodeURIComponent(creds);
      } catch {
        user = creds;
      }
    }
    if (user === "") user = undefined;
    if (password === "") password = undefined;
  }

  let host = "";
  let port: number | undefined;

  const firstHost = hosts.split(",")[0].trim();
  if (firstHost.startsWith("[")) {
    const closeBracket = firstHost.indexOf("]");
    if (closeBracket !== -1) {
      host = firstHost.slice(1, closeBracket);
      const after = firstHost.slice(closeBracket + 1);
      if (after.startsWith(":")) {
        const p = Number(after.slice(1));
        if (!isNaN(p)) port = p;
      }
    } else {
      host = firstHost;
    }
  } else {
    const colonIndex = firstHost.lastIndexOf(":");
    if (colonIndex !== -1) {
      host = firstHost.slice(0, colonIndex);
      const p = Number(firstHost.slice(colonIndex + 1));
      if (!isNaN(p)) port = p;
    } else {
      host = firstHost;
    }
  }

  return { scheme, hosts, host, port, user, password, database, options };
}

/** Rebuild a MongoDB URI string from components. */
function buildMongoUriString(c: MongoUriComponents, includePassword: boolean): string {
  let auth = "";
  if (c.user) {
    auth += encodeURIComponent(c.user);
    if (includePassword && c.password) {
      auth += ":" + encodeURIComponent(c.password);
    }
    auth += "@";
  }
  const hosts = c.hosts || (c.host ? (c.port ? `${c.host}:${c.port}` : c.host) : "");
  const path = c.database ? `/${encodeURIComponent(c.database)}` : "";
  const qs = c.options ? `?${c.options}` : "";
  return `${c.scheme}://${auth}${hosts}${path}${qs}`;
}

type MongoUriOptions = { authSource?: string; replicaSet?: string };

function parseMongoOptions(rawOptions: string): MongoUriOptions {
  const out: MongoUriOptions = {};
  if (!rawOptions) return out;
  for (const pair of rawOptions.split("&")) {
    const idx = pair.indexOf("=");
    if (idx === -1) continue;
    const key = pair.slice(0, idx);
    const value = decodeURIComponent(pair.slice(idx + 1));
    if (key === "authSource") out.authSource = value;
    else if (key === "replicaSet") out.replicaSet = value;
  }
  return out;
}

/**
 * Extract credentials from a MongoDB URI. The password returned here is meant to
 * be stored through the dbStore AES credential path — never persisted in the URI.
 */
export function extractMongoCredentials(uri: string): { user?: string; password?: string } {
  const c = parseMongoUriComponents(uri);
  return { user: c.user, password: c.password };
}

/**
 * Return a copy of the URI with any embedded password removed. The username and
 * all query options are preserved (only the secret is stripped).
 */
export function sanitizeMongoUri(uri: string): string {
  return buildMongoUriString(parseMongoUriComponents(uri), false);
}

/**
 * Reconstruct the authenticated URI at runtime by re-injecting the password into
 * a sanitized URI. If the URI has no username there is nowhere to attach the
 * password, so the URI is returned unchanged.
 */
export function injectMongoPassword(sanitizedUri: string, password: string): string {
  const c = parseMongoUriComponents(sanitizedUri);
  if (!c.user) return sanitizedUri;
  return buildMongoUriString({ ...c, password }, true);
}

/**
 * Split a URI (if any) into a persisted-safe shape: the sanitized URI plus the
 * extracted password (to be AES-stored). When the input is not a MongoDB URI the
 * original value is passed through untouched with no credentials.
 */
export function splitMongoUriCredentials(uri: string): MongoUriParts & { isMongoUri: boolean } {
  if (!isMongoUri(uri)) {
    return { sanitizedUri: uri, hasCredentials: false, isMongoUri: false };
  }
  const c = parseMongoUriComponents(uri);
  const sanitizedUri = buildMongoUriString(c, false);
  const hasCredentials = Boolean(c.password);
  return {
    sanitizedUri,
    username: c.user,
    password: c.password,
    hasCredentials,
    isMongoUri: true,
  };
}

/**
 * Derive the relational-meta fields (host/port/user/database/options) from a
 * MongoDB URI so dbStore's required fields are populated. Options such as
 * authSource / replicaSet remain in the (sanitized) URI query and are therefore
 * preserved on the wire; they are also surfaced here for convenience.
 */
export function normalizeMongoUriMeta(uri: string): {
  host: string;
  port: number;
  user: string;
  database: string;
  authSource?: string;
  replicaSet?: string;
} {
  const c = parseMongoUriComponents(uri);
  const opts = parseMongoOptions(c.options);
  return {
    host: c.host,
    port: c.port || 27017,
    user: c.user || "",
    database: c.database || "",
    authSource: opts.authSource,
    replicaSet: opts.replicaSet,
  };
}

/**
 * Build the authenticated connection URI handed to the driver.
 * - If a MongoDB URI is present it is treated as the persisted (sanitized) form
 *   and the runtime password is re-injected when both a username and a password
 *   exist.
 * - Otherwise a URI is composed from host/port/user/password.
 */
export function buildMongoConnectionUri(
  db: {
    url?: string;
    uri?: string;
    host?: string;
    port?: number;
    user?: string;
    password?: string;
    database?: string;
    authSource?: string;
    replicaSet?: string;
    tls?: boolean;
    directConnection?: boolean;
  },
  pwd: string | null,
): string {
  const rawUri = db.url || db.uri;

  if (rawUri && isMongoUri(rawUri)) {
    const c = parseMongoUriComponents(rawUri);
    const pass = pwd ?? undefined;
    // Only attach the runtime password when there is a username to attach it to.
    const finalPassword = c.user && pass ? pass : c.password;
    return buildMongoUriString({ ...c, password: finalPassword }, true);
  }

  const host = db.host;
  if (!host) {
    throw new Error("MongoDB connection requires a url (mongodb://...) or host");
  }
  const port = db.port || 27017;
  const user = db.user;
  const pass = pwd ?? db.password;

  let auth = "";
  if (user) {
    auth += encodeURIComponent(user);
    if (pass) auth += ":" + encodeURIComponent(pass);
    auth += "@";
  }

  let uri = `mongodb://${auth}${host}:${port}`;
  if (db.database) uri += `/${encodeURIComponent(db.database)}`;

  const params = new URLSearchParams();
  if (db.authSource) params.set("authSource", db.authSource);
  if (db.replicaSet) params.set("replicaSet", db.replicaSet);
  if (db.tls) params.set("tls", "true");
  if (db.directConnection) params.set("directConnection", "true");
  const qs = params.toString();
  if (qs) uri += `?${qs}`;

  return uri;
}
