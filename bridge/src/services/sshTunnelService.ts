import { Client } from "ssh2";
import net from "net";
import fs from "fs";
import { SSHConfig } from "../types/common";
import logger from "./logger";

export interface TunnelInfo {
  localPort: number;
  close: () => void;
}

export class SSHTunnelService {
  /**
   * Create an SSH tunnel to a remote database host.
   */
  async createSSHTunnel(
    ssh: SSHConfig,
    remoteHost: string,
    remotePort: number
  ): Promise<TunnelInfo> {
    return new Promise((resolve, reject) => {
      const sshClient = new Client();
      const localPortServer = net.createServer();
      let isClosed = false;

      const cleanup = () => {
        if (isClosed) return;
        isClosed = true;
        localPortServer.close();
        sshClient.end();
      };

      sshClient.on("ready", () => {
        this.getFreePort()
          .then((localPort) => {
            localPortServer.listen(localPort, "127.0.0.1", () => {
              logger.info(`SSH Tunnel local server listening on 127.0.0.1:${localPort}`);
              resolve({
                localPort,
                close: cleanup,
              });
            });

            localPortServer.on("connection", (socket) => {
              sshClient.forwardOut(
                "127.0.0.1",
                localPort,
                remoteHost,
                remotePort,
                (err, stream) => {
                  if (err) {
                    logger.error({ err }, "SSH forwardOut failed");
                    socket.end();
                    return;
                  }
                  socket.pipe(stream).pipe(socket);
                }
              );
            });
          })
          .catch(reject);
      });

      sshClient.on("error", (err) => {
        logger.error({ err }, "SSH Client error");
        cleanup();
        reject(err);
      });

      sshClient.on("close", () => {
        logger.info("SSH Client connection closed");
        cleanup();
      });

      try {
        const connectConfig: any = {
          host: ssh.host,
          port: ssh.port || 22,
          username: ssh.username,
        };

        if (ssh.authMethod === "password") {
          connectConfig.password = ssh.password;
        } else if (ssh.authMethod === "privateKey") {
          connectConfig.privateKey = this.resolvePrivateKey(ssh.privateKey!);
          if (ssh.passphrase) {
            connectConfig.passphrase = ssh.passphrase;
          }
        }

        sshClient.connect(connectConfig);
      } catch (err) {
        cleanup();
        reject(err);
      }
    });
  }

  /**
   * Resolve a private key which could be a file path or a raw PEM string.
   */
  private resolvePrivateKey(privateKey: string): Buffer {
    if (privateKey.trim().startsWith("-----BEGIN")) {
      return Buffer.from(privateKey);
    }
    // Assume it's a file path
    return fs.readFileSync(privateKey);
  }

  /**
   * Find an available port on the local machine.
   */
  private getFreePort(): Promise<number> {
    return new Promise((resolve, reject) => {
      const server = net.createServer();
      server.unref();
      server.on("error", reject);
      server.listen(0, "127.0.0.1", () => {
        const address = server.address() as net.AddressInfo;
        const port = address.port;
        server.close(() => resolve(port));
      });
    });
  }
}

export const sshTunnelServiceInstance = new SSHTunnelService();
