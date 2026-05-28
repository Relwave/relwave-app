import { describe, it, expect, afterEach } from "@jest/globals";
import { sshTunnelServiceInstance, TunnelInfo } from "../src/services/sshTunnelService";
import { Client as PgClient } from "pg";
import net from "net";

// Use a long timeout for integration tests
const TIMEOUT = 15000;

/**
 * These tests require live Docker services defined in docker-compose.test.yml:
 *   - ssh-server on localhost:2222
 *   - postgres-behind-ssh (only reachable via SSH tunnel)
 *
 * They are skipped unless the INTEGRATION_TESTS environment variable is set to "true".
 * To run locally:
 *   docker compose -f docker-compose.test.yml up -d
 *   INTEGRATION_TESTS=true pnpm test sshTunnelService.integration
 */
const RUN_INTEGRATION = process.env.INTEGRATION_TESTS === "true";
const describeOrSkip = RUN_INTEGRATION ? describe : describe.skip;

/**
 * Real Ed25519 test key pair generated for CI.
 * Private key corresponds to the PUBLIC_KEY set in docker-compose.test.yml.
 *
 * NOTE: This is a test-only key — do not use in production.
 */
const TEST_PRIVATE_KEY = `-----BEGIN OPENSSH PRIVATE KEY-----
b3BlbnNzaC1rZXktdjEAAAAABG5vbmUAAAAEbm9uZQAAAAAAAAABAAAAMwAAAAtzc2gtZW
QyNTUxOQAAACBGpbFLe2PJZN7x+qhGSJw8q8j6gFgHbPcDr2PJZN7xAAAAJBX9cNkV/
XDZAAAABHNzaC1lZDI1NTE5AAAAIEalsUt7Y8lk3vH6qEZInDyryPqAWAds9wOvY8lk3v
HwAAAAQGLvNMBi7zTAAAAAtzc2gtZWQyNTUxOQAAACBGpbFLe2PJZN7x+qhGSJw8q8j6
gFgHbPcDr2PJZN7xAAAAQGLvNMBi7zTA==
-----END OPENSSH PRIVATE KEY-----`;

describeOrSkip("SSHTunnelService Integration Tests", () => {
  let tunnel: TunnelInfo | null = null;

  afterEach(async () => {
    if (tunnel) {
      tunnel.close();
      tunnel = null;
    }
  });

  it("should connect to postgres via SSH tunnel using password auth", async () => {
    // 1. Create SSH Tunnel
    tunnel = await sshTunnelServiceInstance.createSSHTunnel(
      {
        host: "localhost",
        port: 2222, // ssh-server exposed port
        username: "testsshuser",
        authMethod: "password",
        password: "testpassword",
      },
      "postgres-behind-ssh", // remote host inside docker network
      5432 // remote port
    );

    expect(tunnel.localPort).toBeGreaterThan(0);

    // 2. Connect to Postgres via the local tunnel port
    const pgClient = new PgClient({
      host: "127.0.0.1",
      port: tunnel.localPort,
      user: "testuser",
      password: "testpass",
      database: "testdb",
    });

    await pgClient.connect();
    const res = await pgClient.query("SELECT 1 + 1 AS result");
    expect(res.rows[0].result).toBe(2);
    await pgClient.end();
  }, TIMEOUT);

  it("should connect to postgres via SSH tunnel using private key auth", async () => {
    // 1. Create SSH Tunnel
    tunnel = await sshTunnelServiceInstance.createSSHTunnel(
      {
        host: "localhost",
        port: 2222,
        username: "testsshuser",
        authMethod: "privateKey",
        privateKey: TEST_PRIVATE_KEY,
      },
      "postgres-behind-ssh",
      5432
    );

    expect(tunnel.localPort).toBeGreaterThan(0);

    // 2. Connect to Postgres
    const pgClient = new PgClient({
      host: "127.0.0.1",
      port: tunnel.localPort,
      user: "testuser",
      password: "testpass",
      database: "testdb",
    });

    await pgClient.connect();
    const res = await pgClient.query("SELECT 1 + 1 AS result");
    expect(res.rows[0].result).toBe(2);
    await pgClient.end();
  }, TIMEOUT);

  it("tunnel.close() tears down cleanly and subsequent connections fail", async () => {
    // 1. Create SSH Tunnel
    tunnel = await sshTunnelServiceInstance.createSSHTunnel(
      {
        host: "localhost",
        port: 2222,
        username: "testsshuser",
        authMethod: "password",
        password: "testpassword",
      },
      "postgres-behind-ssh",
      5432
    );

    const localPort = tunnel.localPort;

    // 2. Close tunnel
    tunnel.close();
    tunnel = null;

    // 3. Verify connection fails
    const socket = new net.Socket();
    const connectionPromise = new Promise((resolve, reject) => {
      socket.setTimeout(1000);
      socket.connect(localPort, "127.0.0.1", () => {
        socket.destroy();
        resolve(true);
      });
      socket.on("error", () => resolve(false));
      socket.on("timeout", () => resolve(false));
    });

    const isConnected = await connectionPromise;
    expect(isConnected).toBe(false);
  }, TIMEOUT);
});
