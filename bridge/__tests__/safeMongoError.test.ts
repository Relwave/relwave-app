import { describe, expect, test } from "@jest/globals";
import { safeMongoError, redactMongoUri } from "../src/connectors/mongo";

describe("safeMongoError and redactMongoUri", () => {
  test("masks standard mongodb:// credentials", () => {
    const input = "mongodb://user:password@host:27017/db";
    expect(safeMongoError(input)).toBe("mongodb://<credentials>@host:27017/db");
  });

  test("masks standard mongodb+srv:// credentials", () => {
    const input = "mongodb+srv://user:password@cluster.mongodb.net/db";
    expect(safeMongoError(input)).toBe("mongodb+srv://<credentials>@cluster.mongodb.net/db");
  });

  test("masks mongodb+srv:// credentials containing raw '/', '?', '#'", () => {
    expect(safeMongoError("mongodb+srv://user:pass/word?#@cluster0.mongodb.net/db")).toBe(
      "mongodb+srv://<credentials>@cluster0.mongodb.net/db",
    );
    expect(safeMongoError("mongodb+srv://user:p/a?s#s@cluster0.mongodb.net/db")).toBe(
      "mongodb+srv://<credentials>@cluster0.mongodb.net/db",
    );
  });

  test("leaves credential-free URI with @ in query unchanged", () => {
    expect(safeMongoError("mongodb://db-host/?authSource=user@admin")).toBe(
      "mongodb://db-host/?authSource=user@admin",
    );
    expect(safeMongoError("mongodb+srv://cluster0.mongodb.net/?authSource=user@admin")).toBe(
      "mongodb+srv://cluster0.mongodb.net/?authSource=user@admin",
    );
    expect(safeMongoError("mongodb://host:27017/mydb?authSource=user@admin&replicaSet=rs0")).toBe(
      "mongodb://host:27017/mydb?authSource=user@admin&replicaSet=rs0",
    );
    expect(safeMongoError("mongodb+srv://cluster.net/mydb?authSource=user@admin")).toBe(
      "mongodb+srv://cluster.net/mydb?authSource=user@admin",
    );
    expect(safeMongoError("mongodb://db-host/?readPreference=primary&authSource=user@admin")).toBe(
      "mongodb://db-host/?readPreference=primary&authSource=user@admin",
    );
    expect(
      safeMongoError("mongodb+srv://cluster.net/mydb?readPreference=primary&authSource=user@admin"),
    ).toBe("mongodb+srv://cluster.net/mydb?readPreference=primary&authSource=user@admin");
  });

  test("handles URI with credentials and @ in query parameter", () => {
    expect(
      safeMongoError("mongodb://appuser:secret@db-host:27017/mydb?authSource=user@admin"),
    ).toBe("mongodb://<credentials>@db-host:27017/mydb?authSource=user@admin");
    expect(
      safeMongoError(
        "mongodb+srv://user:pass/word?#@cluster0.mongodb.net/db?authSource=user@admin",
      ),
    ).toBe("mongodb+srv://<credentials>@cluster0.mongodb.net/db?authSource=user@admin");
  });

  test("handles multi-host replica set", () => {
    expect(safeMongoError("mongodb://user:password@host1:27017,host2:27017/db")).toBe(
      "mongodb://<credentials>@host1:27017,host2:27017/db",
    );
    expect(safeMongoError("mongodb://host1:27017,host2:27017/?authSource=user@admin")).toBe(
      "mongodb://host1:27017,host2:27017/?authSource=user@admin",
    );
  });

  test("masks credentials in malformed comma-separated hosts or hostnames with underscores", () => {
    expect(safeMongoError("mongodb+srv://user:secret@host1,host2/db")).toBe(
      "mongodb+srv://<credentials>@host1,host2/db",
    );
    expect(safeMongoError("mongodb+srv://user:secret@my_host_name.net/db")).toBe(
      "mongodb+srv://<credentials>@my_host_name.net/db",
    );
    expect(safeMongoError("mongodb://user:secret@host1,host2:27017/db")).toBe(
      "mongodb://<credentials>@host1,host2:27017/db",
    );
    expect(safeMongoError("mongodb://user:secret@my_host_name:27017/db")).toBe(
      "mongodb://<credentials>@my_host_name:27017/db",
    );
  });

  test("handles Error instances and plain strings", () => {
    const error = new Error(
      "connect ECONNREFUSED mongodb+srv://user:p/a?s#s@cluster0.mongodb.net/db",
    );
    expect(safeMongoError(error)).toBe(
      "connect ECONNREFUSED mongodb+srv://<credentials>@cluster0.mongodb.net/db",
    );
  });

  test("redactMongoUri export is identical to safeMongoError", () => {
    expect(redactMongoUri).toBe(safeMongoError);
  });
});
