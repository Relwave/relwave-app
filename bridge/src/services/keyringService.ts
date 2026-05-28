import { Entry } from "@napi-rs/keyring";
import logger from "./logger";

const SERVICE_NAME = "relwave-ssh";

function credentialEntry(id: string): Entry {
  return new Entry(SERVICE_NAME, id);
}

export class KeyringService {
  /**
   * Store a password or passphrase securely in the OS keychain.
   */
  async storeCredential(id: string, secret: string): Promise<void> {
    try {
      credentialEntry(id).setPassword(secret);
    } catch (err) {
      logger.error({ err, id }, "Failed to store credential in keyring");
      throw new Error(`Failed to store credential securely: ${err}`);
    }
  }

  /**
   * Retrieve a password or passphrase from the OS keychain.
   */
  async getCredential(id: string): Promise<string | null> {
    try {
      return credentialEntry(id).getPassword();
    } catch (err) {
      // If it doesn't exist, getPassword might throw or return null depending on platform/impl.
      // Usually it throws if not found.
      logger.debug({ id }, "Credential not found in keyring or error occurred");
      return null;
    }
  }

  /**
   * Delete a credential from the OS keychain.
   */
  async deleteCredential(id: string): Promise<void> {
    try {
      credentialEntry(id).deletePassword();
    } catch (err) {
      logger.warn({ err, id }, "Failed to delete credential from keyring");
    }
  }
}

export const keyringServiceInstance = new KeyringService();
