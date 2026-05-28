import { describe, it, expect, jest, beforeEach, afterEach } from "@jest/globals";
import { SSHTunnelService } from "../src/services/sshTunnelService";
import { Client } from "ssh2";
import net from "net";
import fs from "fs";
import { SSHConfig } from "../src/types/common";

jest.mock("ssh2");
jest.mock("net");
jest.mock("fs");

describe("SSHTunnelService", () => {
  let service: SSHTunnelService;
  let mockSshClient: any;
  let mockServer: any;

  const mockSshConfig: SSHConfig = {
    host: "ssh-host",
    port: 22,
    username: "testuser",
    authMethod: "password",
    password: "testpassword",
  };

  beforeEach(() => {
    service = new SSHTunnelService();

    // Setup SSH Client mock
    mockSshClient = {
      on: jest.fn().mockReturnThis(),
      connect: jest.fn().mockReturnThis(),
      forwardOut: jest.fn(),
      end: jest.fn(),
    };
    (Client as unknown as jest.Mock).mockReturnValue(mockSshClient);

    // Setup net.createServer mock
    mockServer = {
      listen: jest.fn((port, host, cb: any) => {
        if (cb) cb();
        return mockServer;
      }),
      on: jest.fn().mockReturnThis(),
      close: jest.fn((cb: any) => {
        if (cb) cb();
        return mockServer;
      }),
      address: jest.fn().mockReturnValue({ port: 12345 }),
      unref: jest.fn().mockReturnThis(),
    };
    (net.createServer as unknown as jest.Mock).mockReturnValue(mockServer);
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  it("should resolve TunnelInfo with a valid localPort when ssh2 Client emits 'ready'", async () => {
    const tunnelPromise = service.createSSHTunnel(mockSshConfig, "db-host", 5432);

    // Simulate 'ready' event
    const readyCallback = mockSshClient.on.mock.calls.find((call: any) => call[0] === "ready")[1];
    readyCallback();

    const tunnelInfo = await tunnelPromise;

    expect(tunnelInfo.localPort).toBe(12345);
    expect(mockServer.listen).toHaveBeenCalledWith(expect.any(Number), "127.0.0.1", expect.any(Function));
    expect(mockSshClient.connect).toHaveBeenCalled();
  });

  it("should reject when ssh2 Client emits 'error'", async () => {
    const tunnelPromise = service.createSSHTunnel(mockSshConfig, "db-host", 5432);

    // Simulate 'error' event
    const errorCallback = mockSshClient.on.mock.calls.find((call: any) => call[0] === "error")[1];
    const testError = new Error("Connection failed");
    errorCallback(testError);

    await expect(tunnelPromise).rejects.toThrow("Connection failed");
  });

  it("resolvePrivateKey returns buffer from fs.readFileSync for a file path", () => {
    const filePath = "/path/to/key";
    (fs.readFileSync as jest.Mock).mockReturnValue(Buffer.from("file-content"));

    const result = (service as any).resolvePrivateKey(filePath);

    expect(fs.readFileSync).toHaveBeenCalledWith(filePath);
    expect(result.toString()).toBe("file-content");
  });

  it("resolvePrivateKey returns buffer directly for raw PEM string without calling fs", () => {
    const pemString = "-----BEGIN RSA PRIVATE KEY-----\nMIIEpAIBAAKCAQEA...";
    
    const result = (service as any).resolvePrivateKey(pemString);

    expect(fs.readFileSync).not.toHaveBeenCalled();
    expect(result.toString()).toBe(pemString);
  });

  it("tunnel.close() calls both server.close() and sshClient.end()", async () => {
    const tunnelPromise = service.createSSHTunnel(mockSshConfig, "db-host", 5432);

    // Simulate 'ready'
    const readyCallback = mockSshClient.on.mock.calls.find((call: any) => call[0] === "ready")[1];
    readyCallback();

    const tunnelInfo = await tunnelPromise;
    tunnelInfo.close();

    expect(mockServer.close).toHaveBeenCalled();
    expect(mockSshClient.end).toHaveBeenCalled();
  });

  it("handles tunnel drop mid-session (sshClient emits 'close' after 'ready')", async () => {
    const tunnelPromise = service.createSSHTunnel(mockSshConfig, "db-host", 5432);

    // Simulate 'ready'
    const readyCallback = mockSshClient.on.mock.calls.find((call: any) => call[0] === "ready")[1];
    readyCallback();

    await tunnelPromise;

    // Simulate 'close' after being ready
    const closeCallback = mockSshClient.on.mock.calls.find((call: any) => call[0] === "close")[1];
    closeCallback();

    expect(mockServer.close).toHaveBeenCalled();
    expect(mockSshClient.end).toHaveBeenCalled();
  });
});
