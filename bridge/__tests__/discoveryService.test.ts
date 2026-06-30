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

        test("should add port suffix for non-default MySQL port", () => {
            const name = service.generateFunName("mysql", 3307);
            expect(name).toMatch(/^[a-z]+-[a-z]+-3307$/);
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
            dbType: "postgresql" | "mysql" | "mariadb",
            envVars: Map<string, string>
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
                const envVars = new Map<string, string>([
                    ["POSTGRES_USER", "customuser"],
                ]);

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
                const envVars = new Map<string, string>([
                    ["MARIADB_ROOT_PASSWORD", "mariarootpass"],
                ]);

                const result = extractCredentials(service, "mariadb", envVars);

                expect(result.user).toBe("root");
                expect(result.password).toBe("mariarootpass");
            });

            test("should fall back to MYSQL_ROOT_PASSWORD for root user", () => {
                const envVars = new Map<string, string>([
                    ["MYSQL_ROOT_PASSWORD", "mysqlrootpass"],
                ]);

                const result = extractCredentials(service, "mariadb", envVars);

                expect(result.user).toBe("root");
                expect(result.password).toBe("mysqlrootpass");
            });
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

            expect(pgDb.type).toBe("postgresql");
            expect(mysqlDb.type).toBe("mysql");
            expect(mariaDb.type).toBe("mariadb");
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
                expect(["postgresql", "mysql", "mariadb"]).toContain(db.type);
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
