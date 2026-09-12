/**
 * Database Discovery Service
 *
 * Automatically discovers locally running databases by scanning common ports
 * and detecting Docker containers with database images.
 */

import { exec } from "child_process";
import { promisify } from "util";
import * as net from "net";

const execAsync = promisify(exec);

// Port configurations for each database type
const DATABASE_PORTS: Record<string, number[]> = {
  postgresql: [5432, 5433, 5434],
  mysql: [3306, 3307, 3308],
  mariadb: [3306, 3307, 3308],
};

// Fun adjectives and nouns for generating database names
const ADJECTIVES = [
  "swift",
  "cosmic",
  "stellar",
  "nimble",
  "turbo",
  "quantum",
  "neon",
  "cyber",
  "atomic",
  "hyper",
  "mega",
  "ultra",
  "blazing",
  "electric",
  "dynamic",
  "rapid",
  "mighty",
  "brave",
  "clever",
  "noble",
  "fierce",
  "silent",
  "golden",
  "crystal",
  "shadow",
  "frost",
  "thunder",
  "ember",
  "azure",
  "crimson",
  "violet",
  "lunar",
];

const NOUNS = [
  "phoenix",
  "dragon",
  "falcon",
  "panther",
  "tiger",
  "wolf",
  "hawk",
  "eagle",
  "lion",
  "bear",
  "shark",
  "cobra",
  "viper",
  "raven",
  "storm",
  "blaze",
  "nova",
  "comet",
  "nebula",
  "galaxy",
  "cosmos",
  "orbit",
  "pulse",
  "flux",
  "spark",
  "bolt",
  "wave",
  "surge",
  "core",
  "nexus",
  "vertex",
  "matrix",
];

export interface DiscoveredDatabase {
  type: "postgresql" | "mysql" | "mariadb";
  host: string;
  port: number;
  source: "local" | "docker";
  containerName?: string;
  suggestedName: string;
  defaultUser: string;
  defaultDatabase: string;
  defaultPassword?: string; // Only available for Docker containers
}

export class DiscoveryService {
  private connectionTimeout = 500; // ms to wait for port response

  /**
   * Generate a fun name for a database connection
   */
  generateFunName(type: string, port: number): string {
    const adjective = ADJECTIVES[Math.floor(Math.random() * ADJECTIVES.length)];
    const noun = NOUNS[Math.floor(Math.random() * NOUNS.length)];
    const suffix = port !== this.getDefaultPort(type) ? `-${port}` : "";
    return `${adjective}-${noun}${suffix}`;
  }

  /**
   * Get the default port for a database type
   */
  private getDefaultPort(type: string): number {
    switch (type) {
      case "postgresql":
        return 5432;
      case "mysql":
      case "mariadb":
        return 3306;
      default:
        return 0;
    }
  }

  /**
   * Get default username for a database type
   */
  private getDefaultUser(type: string): string {
    switch (type) {
      case "postgresql":
        return "postgres";
      case "mysql":
      case "mariadb":
        return "root";
      default:
        return "";
    }
  }

  /**
   * Get default database name for a database type
   */
  private getDefaultDatabase(type: string): string {
    switch (type) {
      case "postgresql":
        return "postgres";
      case "mysql":
      case "mariadb":
        return "mysql";
      default:
        return "";
    }
  }

  /**
   * Check if a specific port is open on a host
   */
  private async isPortOpen(host: string, port: number): Promise<boolean> {
    return new Promise((resolve) => {
      const socket = new net.Socket();

      socket.setTimeout(this.connectionTimeout);

      socket.on("connect", () => {
        socket.destroy();
        resolve(true);
      });

      socket.on("timeout", () => {
        socket.destroy();
        resolve(false);
      });

      socket.on("error", () => {
        socket.destroy();
        resolve(false);
      });

      socket.connect(port, host);
    });
  }

  /**
   * Scan localhost for open database ports
   */
  private async scanLocalPorts(): Promise<DiscoveredDatabase[]> {
    const discovered: DiscoveredDatabase[] = [];
    const hosts = ["127.0.0.1", "localhost"];
    const scannedPorts = new Set<string>();

    for (const host of hosts) {
      for (const [dbType, ports] of Object.entries(DATABASE_PORTS)) {
        for (const port of ports) {
          const key = `${port}`;
          if (scannedPorts.has(key)) continue;

          const isOpen = await this.isPortOpen(host, port);
          if (isOpen) {
            scannedPorts.add(key);

            // Determine the actual type based on the port
            let actualType: "postgresql" | "mysql" | "mariadb" = dbType as any;
            if (port >= 5432 && port <= 5434) {
              actualType = "postgresql";
            } else if (port >= 3306 && port <= 3308) {
              // Can't distinguish MySQL from MariaDB by port alone
              actualType = "mysql";
            }

            discovered.push({
              type: actualType,
              host: "localhost",
              port,
              source: "local",
              suggestedName: this.generateFunName(actualType, port),
              defaultUser: this.getDefaultUser(actualType),
              defaultDatabase: this.getDefaultDatabase(actualType),
            });
          }
        }
      }
    }

    return discovered;
  }

  /**
   * Get environment variables from a Docker container
   */
  private async getContainerEnvVars(containerName: string): Promise<Map<string, string>> {
    const envMap = new Map<string, string>();

    try {
      const { stdout } = await execAsync(
        `docker inspect --format "{{range .Config.Env}}{{println .}}{{end}}" "${containerName}"`,
        { timeout: 3000 },
      );

      const lines = stdout.trim().split("\n").filter(Boolean);
      for (const line of lines) {
        const eqIndex = line.indexOf("=");
        if (eqIndex > 0) {
          const key = line.substring(0, eqIndex);
          const value = line.substring(eqIndex + 1);
          envMap.set(key, value);
        }
      }
    } catch {
      // Ignore errors - we'll just use defaults
    }

    return envMap;
  }

  /**
   * Extract database credentials from container environment variables
   */
  private extractCredentialsFromEnv(
    dbType: "postgresql" | "mysql" | "mariadb",
    envVars: Map<string, string>,
  ): { user: string; password: string; database: string } {
    if (dbType === "postgresql") {
      return {
        user: envVars.get("POSTGRES_USER") || "postgres",
        password: envVars.get("POSTGRES_PASSWORD") || "",
        database: envVars.get("POSTGRES_DB") || envVars.get("POSTGRES_USER") || "postgres",
      };
    } else if (dbType === "mysql") {
      // MySQL can use MYSQL_USER or root with MYSQL_ROOT_PASSWORD
      const user = envVars.get("MYSQL_USER") || "root";
      const password =
        user === "root"
          ? envVars.get("MYSQL_ROOT_PASSWORD") || ""
          : envVars.get("MYSQL_PASSWORD") || "";
      return {
        user,
        password,
        database: envVars.get("MYSQL_DATABASE") || "mysql",
      };
    } else {
      // MariaDB - similar to MySQL
      const user = envVars.get("MARIADB_USER") || envVars.get("MYSQL_USER") || "root";
      const password =
        user === "root"
          ? envVars.get("MARIADB_ROOT_PASSWORD") || envVars.get("MYSQL_ROOT_PASSWORD") || ""
          : envVars.get("MARIADB_PASSWORD") || envVars.get("MYSQL_PASSWORD") || "";
      return {
        user,
        password,
        database: envVars.get("MARIADB_DATABASE") || envVars.get("MYSQL_DATABASE") || "mysql",
      };
    }
  }

  /**
   * Discover databases running in Docker containers
   */
  private async discoverDockerDatabases(): Promise<DiscoveredDatabase[]> {
    const discovered: DiscoveredDatabase[] = [];

    try {
      // Check if Docker is available
      const { stdout } = await execAsync('docker ps --format "{{.Names}}|{{.Image}}|{{.Ports}}"', {
        timeout: 5000,
      });

      const lines = stdout.trim().split("\n").filter(Boolean);

      for (const line of lines) {
        const [containerName, image, ports] = line.split("|");

        // Determine database type from image name
        let dbType: "postgresql" | "mysql" | "mariadb" | null = null;
        if (image.includes("postgres") || image.includes("pg") || image.includes("postgresql")) {
          dbType = "postgresql";
        } else if (image.includes("mariadb")) {
          dbType = "mariadb";
        } else if (image.includes("mysql")) {
          dbType = "mysql";
        }

        if (dbType && ports) {
          // Parse port mappings like "0.0.0.0:5432->5432/tcp"
          const portMatch = ports.match(/0\.0\.0\.0:(\d+)->(\d+)/);
          if (portMatch) {
            const hostPort = parseInt(portMatch[1], 10);

            // Get environment variables from the container
            const envVars = await this.getContainerEnvVars(containerName);
            const credentials = this.extractCredentialsFromEnv(dbType, envVars);

            discovered.push({
              type: dbType,
              host: "localhost",
              port: hostPort,
              source: "docker",
              containerName,
              suggestedName: this.generateFunName(dbType, hostPort),
              defaultUser: credentials.user,
              defaultDatabase: credentials.database,
              defaultPassword: credentials.password,
            });
          }
        }
      }
    } catch {
      // Docker not available or error running command - silently ignore
    }

    return discovered;
  }

  /**
   * Discover all locally running databases
   * Combines local port scanning and Docker container detection
   */
  async discoverLocalDatabases(): Promise<DiscoveredDatabase[]> {
    // Run both discovery methods in parallel
    const [localDbs, dockerDbs] = await Promise.all([
      this.scanLocalPorts(),
      this.discoverDockerDatabases(),
    ]);

    // Merge results, preferring Docker source info when available
    const merged = new Map<string, DiscoveredDatabase>();

    for (const db of localDbs) {
      const key = `${db.host}:${db.port}`;
      merged.set(key, db);
    }

    // Docker info takes precedence (has container name)
    for (const db of dockerDbs) {
      const key = `${db.host}:${db.port}`;
      merged.set(key, db);
    }

    return Array.from(merged.values());
  }
}

// Export singleton instance
export const discoveryService = new DiscoveryService();
