import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { parseConnectionUrl, buildConnectionUrl, parseMongoUrl } from "@/lib/parseConnectionUrl";
import { MONGODB_REQUIRED_FIELDS } from "@/features/home/types";

function expect(actual: any) {
  return {
    toBe(expected: any) {
      assert.strictEqual(actual, expected);
    },
    toEqual(expected: any) {
      assert.deepStrictEqual(actual, expected);
    },
    toBeNull() {
      assert.strictEqual(actual, null);
    },
    toBeUndefined() {
      assert.strictEqual(actual, undefined);
    },
    toBeDefined() {
      assert.notStrictEqual(actual, undefined);
    },
    toBeTruthy() {
      assert.ok(actual);
    },
    toBeFalsy() {
      assert.ok(!actual);
    },
    toContain(substr: string) {
      assert.ok(
        typeof actual === "string" && actual.includes(substr),
        `Expected "${actual}" to contain "${substr}"`,
      );
    },
    not: {
      toBeNull() {
        assert.notStrictEqual(actual, null);
      },
      toContain(substr: string) {
        assert.ok(
          typeof actual === "string" && !actual.includes(substr),
          `Expected "${actual}" not to contain "${substr}"`,
        );
      },
    },
  };
}

describe("MongoDB Connection URL Parsing & Round-Tripping", () => {
  it("parses plain mongodb:// single-host URI and retains originalUri", () => {
    const uri = "mongodb://localhost:27017/analytics";
    const parsed = parseConnectionUrl(uri);

    expect(parsed).not.toBeNull();
    expect(parsed!.type).toBe("mongodb");
    expect(parsed!.host).toBe("localhost");
    expect(parsed!.port).toBe("27017");
    expect(parsed!.database).toBe("analytics");
    expect(parsed!.ssl).toBe(false);
    expect(parsed!.originalUri).toBe(uri);
  });

  it("parses mongodb:// with authentication and query params", () => {
    const uri = "mongodb://admin:secretPass@127.0.0.1:27017/authDb?authSource=admin&tls=true";
    const parsed = parseConnectionUrl(uri);

    expect(parsed).not.toBeNull();
    expect(parsed!.type).toBe("mongodb");
    expect(parsed!.user).toBe("admin");
    expect(parsed!.password).toBe("secretPass");
    expect(parsed!.host).toBe("127.0.0.1");
    expect(parsed!.port).toBe("27017");
    expect(parsed!.database).toBe("authDb");
    expect(parsed!.ssl).toBe(true);
    expect(parsed!.originalUri).toBe(uri);
  });

  it("CRITICAL SRV INVARIANT: parses mongodb+srv:// and preserves originalUri verbatim", () => {
    const srvUri =
      "mongodb+srv://user1:pwd%40123@cluster0.abcde.mongodb.net/production?retryWrites=true&w=majority";
    const parsed = parseConnectionUrl(srvUri);

    expect(parsed).not.toBeNull();
    expect(parsed!.type).toBe("mongodb");
    expect(parsed!.ssl).toBe(true);
    expect(parsed!.originalUri).toBe(srvUri);
    expect(parsed!.originalUri).toBe(srvUri.trim());

    // Proves buildConnectionUrl preserves originalUri verbatim
    const rebuilt = buildConnectionUrl(parsed!);
    expect(rebuilt).toBe(srvUri);
  });

  it("preserves replica-set seed list verbatim via originalUri", () => {
    const rsUri =
      "mongodb://node1:27017,node2:27017,node3:27017/replicaDb?replicaSet=myRs&readPreference=secondaryPreferred";
    const parsed = parseConnectionUrl(rsUri);

    expect(parsed).not.toBeNull();
    expect(parsed!.type).toBe("mongodb");
    expect(parsed!.originalUri).toBe(rsUri);

    const rebuilt = buildConnectionUrl(parsed!);
    expect(rebuilt).toBe(rsUri);
  });

  it("MONGODB_REQUIRED_FIELDS matches ['name', 'type', 'host', 'port']", () => {
    expect(MONGODB_REQUIRED_FIELDS).toEqual(["name", "type", "host", "port"]);
  });

  it("parseMongoUrl retains originalUri verbatim for single-host, multi-host, and mongodb+srv://", () => {
    const singleHost = "mongodb://localhost:27017/mydb";
    const multiHost =
      "mongodb://user:pass@host1:27017,host2:27017,host3:27017/mydb?replicaSet=rs0&authSource=admin";
    const srv =
      "mongodb+srv://user:pass@cluster0.abcde.mongodb.net/production?retryWrites=true&w=majority";

    const parsedSingle = parseMongoUrl(singleHost);
    expect(parsedSingle).not.toBeNull();
    expect(parsedSingle!.originalUri).toBe(singleHost);

    const parsedMulti = parseMongoUrl(multiHost);
    expect(parsedMulti).not.toBeNull();
    expect(parsedMulti!.originalUri).toBe(multiHost);

    const parsedSrv = parseMongoUrl(srv);
    expect(parsedSrv).not.toBeNull();
    expect(parsedSrv!.originalUri).toBe(srv);
  });
});
