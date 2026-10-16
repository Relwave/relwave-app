import { cleanClickHouseUrl, parseClickHouseUrl } from "../src/utils/clickhouseUrl";
import { describe, expect, it } from "@jest/globals";

describe("ClickHouse URL Utilities", () => {
  describe("cleanClickHouseUrl", () => {
    it("should handle empty or undefined input", () => {
      expect(cleanClickHouseUrl("")).toBe("");
      expect(cleanClickHouseUrl(undefined)).toBe("");
      expect(cleanClickHouseUrl("   ")).toBe("");
    });

    it("should strip markdown links", () => {
      expect(
        cleanClickHouseUrl(
          "[https://demo.clickhouse.cloud:8443](https://demo.clickhouse.cloud:8443)",
        ),
      ).toBe("https://demo.clickhouse.cloud:8443");
      expect(cleanClickHouseUrl("[https://demo.clickhouse.cloud:8443]()")).toBe(
        "https://demo.clickhouse.cloud:8443",
      );
    });

    it("should strip enclosing single/double quotes and backticks", () => {
      expect(cleanClickHouseUrl("'https://demo.clickhouse.cloud:8443'")).toBe(
        "https://demo.clickhouse.cloud:8443",
      );
      expect(cleanClickHouseUrl('"https://demo.clickhouse.cloud:8443"')).toBe(
        "https://demo.clickhouse.cloud:8443",
      );
      expect(cleanClickHouseUrl("`https://demo.clickhouse.cloud:8443`")).toBe(
        "https://demo.clickhouse.cloud:8443",
      );
    });

    it("should convert clickhouses:// protocol to https://", () => {
      expect(cleanClickHouseUrl("clickhouses://demo.clickhouse.cloud:8443")).toBe(
        "https://demo.clickhouse.cloud:8443",
      );
    });

    it("should convert clickhouse:// protocol properly based on SSL / port", () => {
      expect(cleanClickHouseUrl("clickhouse://demo.clickhouse.cloud:8443")).toBe(
        "https://demo.clickhouse.cloud:8443",
      );
      expect(cleanClickHouseUrl("clickhouse://localhost:8123")).toBe("http://localhost:8123");
    });

    it("should prepend https:// for clickhouse.cloud or port 8443 if no scheme provided", () => {
      expect(cleanClickHouseUrl("demo.clickhouse.cloud:8443")).toBe(
        "https://demo.clickhouse.cloud:8443",
      );
      expect(cleanClickHouseUrl("demo.clickhouse.cloud")).toBe("https://demo.clickhouse.cloud");
    });

    it("should prepend http:// for localhost:8123 if no scheme provided", () => {
      expect(cleanClickHouseUrl("localhost:8123")).toBe("http://localhost:8123");
    });

    it("should strip trailing slashes", () => {
      expect(cleanClickHouseUrl("https://demo.clickhouse.cloud:8443/")).toBe(
        "https://demo.clickhouse.cloud:8443",
      );
    });
  });

  describe("parseClickHouseUrl", () => {
    it("should parse standard cloud url", () => {
      const parsed = parseClickHouseUrl("https://of8remuy3t.ap-south-1.aws.clickhouse.cloud:8443");
      expect(parsed.host).toBe("of8remuy3t.ap-south-1.aws.clickhouse.cloud");
      expect(parsed.port).toBe(8443);
      expect(parsed.ssl).toBe(true);
      expect(parsed.database).toBe("default");
    });

    it("should parse url with embedded user and password", () => {
      const parsed = parseClickHouseUrl(
        "https://myuser:secret123@of8remuy3t.ap-south-1.aws.clickhouse.cloud:8443/analytics",
      );
      expect(parsed.host).toBe("of8remuy3t.ap-south-1.aws.clickhouse.cloud");
      expect(parsed.port).toBe(8443);
      expect(parsed.ssl).toBe(true);
      expect(parsed.user).toBe("myuser");
      expect(parsed.password).toBe("secret123");
      expect(parsed.database).toBe("analytics");
    });

    it("should parse localhost http url", () => {
      const parsed = parseClickHouseUrl("http://localhost:8123/default");
      expect(parsed.host).toBe("localhost");
      expect(parsed.port).toBe(8123);
      expect(parsed.ssl).toBe(false);
      expect(parsed.database).toBe("default");
    });
  });
});
