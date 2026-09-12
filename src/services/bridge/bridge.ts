import { bridgeRequest } from "./bridgeClient";

class BridgeService {
  /**
   * Ping the bridge to check if it's alive
   */
  async ping(): Promise<boolean> {
    try {
      const result = await bridgeRequest("ping", {});
      return result?.ok === true;
    } catch {
      return false;
    }
  }

  /**
   * Get bridge health status
   */
  async healthCheck(): Promise<{
    ok: boolean;
    uptimeSec: number;
    pid: number;
  }> {
    try {
      const result = await bridgeRequest("health.ping", {});
      return result?.data || { ok: false, uptimeSec: 0, pid: 0 };
    } catch (error: any) {
      throw new Error(`Health check failed: ${error.message}`);
    }
  }
}

export const bridgeService = new BridgeService();
