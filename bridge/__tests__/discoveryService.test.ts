import { describe, expect, test, beforeEach } from "@jest/globals";
import { DiscoveryService, DiscoveredDatabase } from "../src/services/discoveryService";

describe("DiscoveryService", () => {
  let service: DiscoveryService;

  beforeEach(() => {
    service = new DiscoveryService();
  });

  describe("generateFunName", () => {
    test("should generate a name in format adjective-noun", () => {
      const name = service.generateFunName("postgresql", 5432);
      expect(name).toMatch(/^[a-z]+-[a-z]+$/);
    });

    test("should add port suffix for non-default PostgreSQL port", () => {
      const name = service.generateFunName("postgresql", 5433);
      expect(name).toMatch(/^[a-z]+-[a-z]+-5433$/);
    });

    test("should not add port suffix for default PostgreSQL port", () => {
      const name = service.generateFunName("postgresql", 5432);
      expect(name).not.toContain("-5432");
    });

    test("should not add port suffix for default MySQL port", () => {
      const name = service.generateFunName("mysql", 3306);
      expect(name).not.toContain("-3306");
    });

    test("should not add port suffix for default MariaDB port", () => {
      const name = service.generateFunName("mariadb", 3306);
      expect(name).not.toContain("-3306");
    });

    test("should not add port suffix for default ClickHouse port", () => {
      const name = service.generateFunName("clickhouse", 8123);
      expect(name).not.toContain("-8123");
    });

    test("should add port suffix for non-default ClickHouse port", () => {
      const name = service.generateFunName("clickhouse", 8124);
      expect(name).toMatch(/^[a-z]+-[a-z]+-8124$/);
    });

    test("should add port suffix for non-default MySQL port", () => {
      const name = service.generateFunName("mysql", 3307);
      expect(name).toMatch(/^[a-z]+-[a-z]+-3307$/);
    });

    test("should not add port suffix for default MongoDB port", () => {
      const name = service.generateFunName("mongodb", 27017);
      expect(name).not.toContain("-27017");
    });

    test("should add port suffix for non-default MongoDB port", () => {
      const name = service.generateFunName("mongodb", 27018);
      expect(name).toMatch(/^[a-z]+-[a-z]+-27018$/);
    });

    test("should generate different names on multiple calls", () => {
      // Given the randomness, most calls should produce different names
      const names = new Set<string>();
      for (let i = 0; i < 20; i++) {
        names.add(service.generateFunName("postgresql", 5432));
      }
      // At least some variety expected (not all same)
      expect(names.size).toBeGreaterThan(1);
    });
  });

  describe("extractCredentialsFromEnv (via reflection)", () => {
    // Access private method via prototype for testing
    const extractCredentials = (
      svc: DiscoveryService,
      dbType: "postgresql" | "mysql" | "mariadb" | "clickhouse" | "mongodb",
      envVars: Map<string, string>,
    ) => {
      return (svc as any).extractCredentialsFromEnv(dbType, envVars);
    };

    describe("PostgreSQL", () => {
      test("should extract PostgreSQL credentials from env vars", () => {
        const envVars = new Map<string, string>([
          ["POSTGRES_USER", "testuser"],
          ["POSTGRES_PASSWORD", "testpass"],
          ["POSTGRES_DB", "testdb"],
        ]);

        const result = extractCredentials(service, "postgresql", envVars);

        expect(result.user).toBe("testuser");
        expect(result.password).toBe("testpass");
        expect(result.database).toBe("testdb");
      });

      test("should use defaults when PostgreSQL env vars are missing", () => {
        const envVars = new Map<string, string>();

        const result = extractCredentials(service, "postgresql", envVars);

        expect(result.user).toBe("postgres");
        expect(result.password).toBe("");
        expect(result.database).toBe("postgres");
      });

      test("should use POSTGRES_USER as database when POSTGRES_DB is missing", () => {
        const envVars = new Map<string, string>([["POSTGRES_USER", "customuser"]]);

        const result = extractCredentials(service, "postgresql", envVars);

        expect(result.user).toBe("customuser");
        expect(result.database).toBe("customuser");
      });
    });

    describe("MySQL", () => {
      test("should extract MySQL credentials with custom user", () => {
        const envVars = new Map<string, string>([
          ["MYSQL_USER", "myuser"],
          ["MYSQL_PASSWORD", "mypass"],
          ["MYSQL_DATABASE", "mydb"],
        ]);

        const result = extractCredentials(service, "mysql", envVars);

        expect(result.user).toBe("myuser");
        expect(result.password).toBe("mypass");
        expect(result.database).toBe("mydb");
      });

      test("should use root password when user is root", () => {
        const envVars = new Map<string, string>([
          ["MYSQL_ROOT_PASSWORD", "rootpass"],
          ["MYSQL_DATABASE", "mydb"],
        ]);

        const result = extractCredentials(service, "mysql", envVars);

        expect(result.user).toBe("root");
        expect(result.password).toBe("rootpass");
        expect(result.database).toBe("mydb");
      });

      test("should use defaults when MySQL env vars are missing", () => {
        const envVars = new Map<string, string>();

        const result = extractCredentials(service, "mysql", envVars);

        expect(result.user).toBe("root");
        expect(result.password).toBe("");
        expect(result.database).toBe("mysql");
      });
    });

    describe("MariaDB", () => {
      test("should extract MariaDB credentials with MARIADB_ prefix", () => {
        const envVars = new Map<string, string>([
          ["MARIADB_USER", "mariauser"],
          ["MARIADB_PASSWORD", "mariapass"],
          ["MARIADB_DATABASE", "mariadb"],
        ]);

        const result = extractCredentials(service, "mariadb", envVars);

        expect(result.user).toBe("mariauser");
        expect(result.password).toBe("mariapass");
        expect(result.database).toBe("mariadb");
      });

      test("should fall back to MYSQL_ prefix for MariaDB", () => {
        const envVars = new Map<string, string>([
          ["MYSQL_USER", "fallbackuser"],
          ["MYSQL_PASSWORD", "fallbackpass"],
          ["MYSQL_DATABASE", "fallbackdb"],
        ]);

        const result = extractCredentials(service, "mariadb", envVars);

        expect(result.user).toBe("fallbackuser");
        expect(result.password).toBe("fallbackpass");
        expect(result.database).toBe("fallbackdb");
      });

      test("should use MARIADB_ROOT_PASSWORD for root user", () => {
        const envVars = new Map<string, string>([["MARIADB_ROOT_PASSWORD", "mariarootpass"]]);

        const result = extractCredentials(service, "mariadb", envVars);

        expect(result.user).toBe("root");
        expect(result.password).toBe("mariarootpass");
      });

      test("should fall back to MYSQL_ROOT_PASSWORD for root user", () => {
        const envVars = new Map<string, string>([["MYSQL_ROOT_PASSWORD", "mysqlrootpass"]]);

        const result = extractCredentials(service, "mariadb", envVars);

        expect(result.user).toBe("root");
        expect(result.password).toBe("mysqlrootpass");
      });
    });

    describe("ClickHouse", () => {
      test("should extract ClickHouse credentials with CLICKHOUSE_USER", () => {
        const envVars = new Map<string, string>([
          ["CLICKHOUSE_USER", "chuser"],
          ["CLICKHOUSE_PASSWORD", "chpass"],
          ["CLICKHOUSE_DB", "analytics"],
        ]);

        const result = extractCredentials(service, "clickhouse", envVars);

        expect(result.user).toBe("chuser");
        expect(result.password).toBe("chpass");
        expect(result.database).toBe("analytics");
      });

      test("should fall back to CLICKHOUSE_DEFAULT_USER and CLICKHOUSE_DEFAULT_PASSWORD", () => {
        const envVars = new Map<string, string>([
          ["CLICKHOUSE_DEFAULT_USER", "defaultadmin"],
          ["CLICKHOUSE_DEFAULT_PASSWORD", "secret123"],
        ]);

        const result = extractCredentials(service, "clickhouse", envVars);

        expect(result.user).toBe("defaultadmin");
        expect(result.password).toBe("secret123");
        expect(result.database).toBe("default");
      });

      test("should use defaults when ClickHouse env vars are missing", () => {
        const envVars = new Map<string, string>();

        const result = extractCredentials(service, "clickhouse", envVars);

        expect(result.user).toBe("default");
        expect(result.password).toBe("");
        expect(result.database).toBe("default");
      });
    });

    describe("MongoDB", () => {
      test("should extract MongoDB credentials from env vars and default root db to admin", () => {
        const envVars = new Map<string, string>([
          ["MONGO_INITDB_ROOT_USERNAME", "mongouser"],
          ["MONGO_INITDB_ROOT_PASSWORD", "mongopass"],
          ["MONGO_INITDB_DATABASE", "customdb"],
        ]);

        const result = extractCredentials(service, "mongodb", envVars);

        expect(result.user).toBe("mongouser");
        expect(result.password).toBe("mongopass");
        expect(result.database).toBe("admin");
      });

      test("should extract Bitnami MongoDB credentials with root default user", () => {
        const envVars = new Map<string, string>([["MONGODB_ROOT_PASSWORD", "secret"]]);

        const result = extractCredentials(service, "mongodb", envVars);

        expect(result.user).toBe("root");
        expect(result.password).toBe("secret");
        expect(result.database).toBe("admin");
      });

      test("should extract non-root MongoDB credentials with custom database", () => {
        const envVars = new Map<string, string>([
          ["MONGODB_USERNAME", "appuser"],
          ["MONGODB_PASSWORD", "apppass"],
          ["MONGODB_DATABASE", "appdb"],
        ]);

        const result = extractCredentials(service, "mongodb", envVars);

        expect(result.user).toBe("appuser");
        expect(result.password).toBe("apppass");
        expect(result.database).toBe("appdb");
      });

      test("should use defaults when MongoDB env vars are missing", () => {
        const envVars = new Map<string, string>();

        const result = extractCredentials(service, "mongodb", envVars);

        expect(result.user).toBe("");
        expect(result.password).toBe("");
        expect(result.database).toBe("admin");
      });
    });
  });

  describe("Docker image matching & port mapping (via reflection)", () => {
    const matchImageType = (svc: DiscoveryService, image: string) => {
      return (svc as any).matchImageType(image);
    };

    const parsePortMapping = (svc: DiscoveryService, ports: string, dbType: any) => {
      return (svc as any).parsePortMapping(ports, dbType);
    };

    test("should exclude mongo-express:latest from MongoDB detection", () => {
      expect(matchImageType(service, "mongo-express:latest")).toBeNull();
      expect(matchImageType(service, "mongo:latest")).toBe("mongodb");
      expect(matchImageType(service, "bitnami/mongodb:latest")).toBe("mongodb");
      expect(matchImageType(service, "percona-server-mongodb:latest")).toBe("mongodb");
    });

    test("should accept 127.0.0.1:37017->27017/tcp and exclude 28017 port for MongoDB", () => {
      const valid = parsePortMapping(service, "127.0.0.1:37017->27017/tcp", "mongodb");
      expect(valid).toEqual({ hostPort: 37017, containerPort: 27017 });

      const excluded = parsePortMapping(service, "127.0.0.1:28017->28017/tcp", "mongodb");
      expect(excluded).toBeNull();
    });

    test("should accept loopback, 0.0.0.0, and IPv6 bindings", () => {
      expect(parsePortMapping(service, "0.0.0.0:27017->27017/tcp", "mongodb")).toEqual({
        hostPort: 27017,
        containerPort: 27017,
      });
      expect(parsePortMapping(service, "[::]:27017->27017/tcp", "mongodb")).toEqual({
        hostPort: 27017,
        containerPort: 27017,
      });
      expect(parsePortMapping(service, ":::27017->27017/tcp", "mongodb")).toEqual({
        hostPort: 27017,
        containerPort: 27017,
      });
    });

    test("should accept [::1] and ::1 IPv6 loopback bindings", () => {
      expect(parsePortMapping(service, "[::1]:37017->27017/tcp", "mongodb")).toEqual({
        hostPort: 37017,
        containerPort: 27017,
      });
      expect(parsePortMapping(service, "::1:37017->27017/tcp", "mongodb")).toEqual({
        hostPort: 37017,
        containerPort: 27017,
      });
    });

    test("should parse multiple port mappings and skip excluded MongoDB 28017 port", () => {
      const multiPort = parsePortMapping(
        service,
        "0.0.0.0:28017->28017/tcp, 0.0.0.0:37017->27017/tcp",
        "mongodb",
      );
      expect(multiPort).toEqual({ hostPort: 37017, containerPort: 27017 });

      const singleExcluded = parsePortMapping(service, "0.0.0.0:28017->28017/tcp", "mongodb");
      expect(singleExcluded).toBeNull();
    });
  });

  describe("getDefaultPort (private)", () => {
    const getDefaultPort = (svc: DiscoveryService, type: string) => {
      return (svc as any).getDefaultPort(type);
    };

    test("should return 5432 for postgresql", () => {
      expect(getDefaultPort(service, "postgresql")).toBe(5432);
    });

    test("should return 3306 for mysql", () => {
      expect(getDefaultPort(service, "mysql")).toBe(3306);
    });

    test("should return 3306 for mariadb", () => {
      expect(getDefaultPort(service, "mariadb")).toBe(3306);
    });

    test("should return 8123 for clickhouse", () => {
      expect(getDefaultPort(service, "clickhouse")).toBe(8123);
    });

    test("should return 27017 for mongodb", () => {
      expect(getDefaultPort(service, "mongodb")).toBe(27017);
    });

    test("should return 0 for unknown type", () => {
      expect(getDefaultPort(service, "unknown")).toBe(0);
    });
  });

  describe("getDefaultUser (private)", () => {
    const getDefaultUser = (svc: DiscoveryService, type: string) => {
      return (svc as any).getDefaultUser(type);
    };

    test("should return postgres for postgresql", () => {
      expect(getDefaultUser(service, "postgresql")).toBe("postgres");
    });

    test("should return root for mysql", () => {
      expect(getDefaultUser(service, "mysql")).toBe("root");
    });

    test("should return root for mariadb", () => {
      expect(getDefaultUser(service, "mariadb")).toBe("root");
    });

    test("should return default for clickhouse", () => {
      expect(getDefaultUser(service, "clickhouse")).toBe("default");
    });

    test("should return empty string for mongodb", () => {
      expect(getDefaultUser(service, "mongodb")).toBe("");
    });

    test("should return empty string for unknown type", () => {
      expect(getDefaultUser(service, "unknown")).toBe("");
    });
  });

  describe("getDefaultDatabase (private)", () => {
    const getDefaultDatabase = (svc: DiscoveryService, type: string) => {
      return (svc as any).getDefaultDatabase(type);
    };

    test("should return postgres for postgresql", () => {
      expect(getDefaultDatabase(service, "postgresql")).toBe("postgres");
    });

    test("should return mysql for mysql", () => {
      expect(getDefaultDatabase(service, "mysql")).toBe("mysql");
    });

    test("should return mysql for mariadb", () => {
      expect(getDefaultDatabase(service, "mariadb")).toBe("mysql");
    });

    test("should return default for clickhouse", () => {
      expect(getDefaultDatabase(service, "clickhouse")).toBe("default");
    });

    test("should return admin for mongodb", () => {
      expect(getDefaultDatabase(service, "mongodb")).toBe("admin");
    });

    test("should return empty string for unknown type", () => {
      expect(getDefaultDatabase(service, "unknown")).toBe("");
    });
  });

  describe("DiscoveredDatabase interface", () => {
    test("should have all required properties for local source", () => {
      const db: DiscoveredDatabase = {
        type: "postgresql",
        host: "localhost",
        port: 5432,
        source: "local",
        suggestedName: "test-db",
        defaultUser: "postgres",
        defaultDatabase: "postgres",
      };

      expect(db.type).toBe("postgresql");
      expect(db.host).toBe("localhost");
      expect(db.port).toBe(5432);
      expect(db.source).toBe("local");
      expect(db.suggestedName).toBe("test-db");
      expect(db.defaultUser).toBe("postgres");
      expect(db.defaultDatabase).toBe("postgres");
      expect(db.containerName).toBeUndefined();
      expect(db.defaultPassword).toBeUndefined();
    });

    test("should accept optional properties for Docker containers", () => {
      const db: DiscoveredDatabase = {
        type: "mysql",
        host: "localhost",
        port: 3306,
        source: "docker",
        containerName: "mysql-container",
        suggestedName: "test-mysql",
        defaultUser: "root",
        defaultDatabase: "mydb",
        defaultPassword: "secret123",
      };

      expect(db.source).toBe("docker");
      expect(db.containerName).toBe("mysql-container");
      expect(db.defaultPassword).toBe("secret123");
    });

    test("should accept all database types", () => {
      const pgDb: DiscoveredDatabase = {
        type: "postgresql",
        host: "localhost",
        port: 5432,
        source: "local",
        suggestedName: "pg-db",
        defaultUser: "postgres",
        defaultDatabase: "postgres",
      };

      const mysqlDb: DiscoveredDatabase = {
        type: "mysql",
        host: "localhost",
        port: 3306,
        source: "local",
        suggestedName: "mysql-db",
        defaultUser: "root",
        defaultDatabase: "mysql",
      };

      const mariaDb: DiscoveredDatabase = {
        type: "mariadb",
        host: "localhost",
        port: 3306,
        source: "docker",
        suggestedName: "maria-db",
        defaultUser: "root",
        defaultDatabase: "mysql",
      };

      const clickhouseDb: DiscoveredDatabase = {
        type: "clickhouse",
        host: "localhost",
        port: 8123,
        source: "local",
        suggestedName: "clickhouse-db",
        defaultUser: "default",
        defaultDatabase: "default",
      };

      const mongoDb: DiscoveredDatabase = {
        type: "mongodb",
        host: "localhost",
        port: 27017,
        source: "local",
        suggestedName: "mongo-db",
        defaultUser: "",
        defaultDatabase: "admin",
      };

      expect(pgDb.type).toBe("postgresql");
      expect(mysqlDb.type).toBe("mysql");
      expect(mariaDb.type).toBe("mariadb");
      expect(clickhouseDb.type).toBe("clickhouse");
      expect(mongoDb.type).toBe("mongodb");
    });
  });

  describe("discoverLocalDatabases", () => {
    test("should return an array", async () => {
      // This test just verifies the method exists and returns an array
      // Actual discovery depends on system state
      const result = await service.discoverLocalDatabases();
      expect(Array.isArray(result)).toBe(true);
    }, 30000); // Increased timeout for docker commands

    test("each discovered database should have required fields", async () => {
      const result = await service.discoverLocalDatabases();

      for (const db of result) {
        expect(db.type).toBeDefined();
        expect(["postgresql", "mysql", "mariadb", "clickhouse", "mongodb"]).toContain(db.type);
        expect(db.host).toBeDefined();
        expect(typeof db.port).toBe("number");
        expect(db.source).toBeDefined();
        expect(["local", "docker"]).toContain(db.source);
        expect(db.suggestedName).toBeDefined();
        expect(db.defaultUser).toBeDefined();
        expect(db.defaultDatabase).toBeDefined();
      }
    }, 30000); // Increased timeout for docker commands
  });
});
