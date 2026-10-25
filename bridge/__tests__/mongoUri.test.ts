import { describe, expect, test } from "@jest/globals";
import {
  isMongoUri,
  extractMongoCredentials,
  sanitizeMongoUri,
  injectMongoPassword,
  normalizeMongoUriMeta,
  splitMongoUriCredentials,
  buildMongoConnectionUri,
} from "../src/utils/mongoUri";

describe("mongoUri", () => {
  test("isMongoUri recognizes mongodb and mongodb+srv schemes", () => {
    expect(isMongoUri("mongodb://localhost:27017")).toBe(true);
    expect(isMongoUri("mongodb+srv://cluster/db")).toBe(true);
    expect(isMongoUri("postgres://localhost")).toBe(false);
    expect(isMongoUri(undefined)).toBe(false);
    expect(isMongoUri("")).toBe(false);
  });

  test("extractMongoCredentials decodes percent-encoded credentials", () => {
    const creds = extractMongoCredentials("mongodb://user:p%40ss%23word@localhost:27017/testdb");
    expect(creds.user).toBe("user");
    expect(creds.password).toBe("p@ss#word");
  });

  test("sanitizeMongoUri removes the password but keeps user and options", () => {
    const sanitized = sanitizeMongoUri(
      "mongodb://user:secret@localhost:27017/testdb?authSource=admin&replicaSet=rs0",
    );
    expect(sanitized).toBe("mongodb://user@localhost:27017/testdb?authSource=admin&replicaSet=rs0");
    expect(sanitized).not.toContain("secret");
  });

  test("sanitizeMongoUri is idempotent and safe for SRV URIs", () => {
    const srv = "mongodb+srv://alice:p%40ss%23word@cluster0.example.net/prod";
    const s1 = sanitizeMongoUri(srv);
    expect(s1).toBe("mongodb+srv://alice@cluster0.example.net/prod");
    expect(sanitizeMongoUri(s1)).toBe(s1);
  });

  test("injectMongoPassword re-injects and round-trips to the original", () => {
    const original = "mongodb://user:p%40ss@localhost:27017/testdb";
    const sanitized = sanitizeMongoUri(original);
    const reconstructed = injectMongoPassword(sanitized, "p@ss");
    // decoded password is re-encoded identically
    expect(decodeURIComponent(reconstructed)).toBe(decodeURIComponent(original));
    expect(reconstructed).toContain("p%40ss");
  });

  test("injectMongoPassword without a username returns the URI unchanged", () => {
    const uri = "mongodb://localhost:27017/testdb";
    expect(injectMongoPassword(uri, "secret")).toBe(uri);
  });

  test("normalizeMongoUriMeta derives relational-meta fields", () => {
    const meta = normalizeMongoUriMeta(
      "mongodb://user:p%40ss%23word@example.net:27018/proddb?authSource=admin&replicaSet=rs0",
    );
    expect(meta.host).toBe("example.net");
    expect(meta.port).toBe(27018);
    expect(meta.user).toBe("user");
    expect(meta.database).toBe("proddb");
    expect(meta.authSource).toBe("admin");
    expect(meta.replicaSet).toBe("rs0");
  });

  test("normalizeMongoUriMeta defaults port to 27017", () => {
    const meta = normalizeMongoUriMeta("mongodb://localhost/testdb");
    expect(meta.port).toBe(27017);
    expect(meta.database).toBe("testdb");
  });

  test("splitMongoUriCredentials separates sanitized URI from the password", () => {
    const parts = splitMongoUriCredentials("mongodb://u:p%40ss%23word@h:27017/db");
    expect(parts.isMongoUri).toBe(true);
    expect(parts.hasCredentials).toBe(true);
    expect(parts.sanitizedUri).toBe("mongodb://u@h:27017/db");
    expect(parts.password).toBe("p@ss#word");
  });

  test("splitMongoUriCredentials passes non-URI values through", () => {
    const parts = splitMongoUriCredentials("not-a-uri");
    expect(parts.isMongoUri).toBe(false);
    expect(parts.hasCredentials).toBe(false);
    expect(parts.sanitizedUri).toBe("not-a-uri");
  });

  test("buildMongoConnectionUri re-injects runtime password into a sanitized URI", () => {
    const sanitized = "mongodb://testuser@127.0.0.1:27017/testdb";
    const uri = buildMongoConnectionUri({ url: sanitized }, "runtime-pw");
    expect(uri).toContain("testuser");
    expect(decodeURIComponent(uri)).toContain("runtime-pw");
  });

  test("buildMongoConnectionUri leaves a passwordless sanitized URI untouched", () => {
    const sanitized = "mongodb://127.0.0.1:27017/testdb";
    expect(buildMongoConnectionUri({ url: sanitized }, null)).toBe(sanitized);
  });

  test("buildMongoConnectionUri composes from host/port/user/password", () => {
    const uri = buildMongoConnectionUri(
      { host: "localhost", port: 27017, user: "u", database: "db" },
      "p@ss",
    );
    expect(uri).toBe("mongodb://u:p%40ss@localhost:27017/db");
  });

  test("buildMongoConnectionUri throws when neither uri nor host is present", () => {
    expect(() => buildMongoConnectionUri({}, "pw")).toThrow(/requires a url/i);
  });
});
