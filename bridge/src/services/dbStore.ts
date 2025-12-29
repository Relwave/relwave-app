// ----------------------------
// services/dbStore.ts
// ----------------------------

import path from "path";
import os from "os";
import fs from "fs/promises";
import fsSync from "fs";
import { v4 as uuidv4 } from "uuid";
import { createCipheriv, createDecipheriv, randomBytes, scrypt } from "crypto";
import { promisify } from "util";

const scryptAsync = promisify(scrypt);

const CONFIG_FOLDER =
  process.env.DBVISUALIZER_HOME ||
  path.join(
    os.homedir(),
    process.platform === "win32"
      ? "AppData\\Roaming\\DBVisualizer"
      : ".dbvisualizer"
  );

const CONFIG_FILE = path.join(CONFIG_FOLDER, "databases.json");
const CREDENTIALS_FILE = path.join(CONFIG_FOLDER, ".credentials");

// Use machine-specific key for encryption
const ENCRYPTION_KEY_SOURCE = os.hostname() + os.userInfo().username;

// Cache configuration
const DEFAULT_CACHE_TTL = 30000; // 30 seconds TTL for cache entries

/**
 * Generic cache entry with TTL support
 */
type CacheEntry<T> = {
  data: T;
  timestamp: number;
  ttl: number;
};

/**
 * In-memory cache for database store
 */
class DbStoreCache {
  private configCache: CacheEntry<ConfigData> | null = null;
  private credentialsCache: CacheEntry<CredentialStore> | null = null;
  private dbCache: Map<string, CacheEntry<DBMeta>> = new Map();
  private defaultTtl: number;

  constructor(ttl: number = DEFAULT_CACHE_TTL) {
    this.defaultTtl = ttl;
  }

  /**
   * Check if a cache entry is still valid
   */
  private isValid<T>(entry: CacheEntry<T> | null | undefined): boolean {
    if (!entry) return false;
    return Date.now() - entry.timestamp < entry.ttl;
  }

  /**
   * Get cached config data
   */
  getConfig(): ConfigData | null {
    if (this.isValid(this.configCache)) {
      return this.configCache!.data;
    }
    return null;
  }

  /**
   * Set config cache
   */
  setConfig(data: ConfigData, ttl: number = this.defaultTtl): void {
    this.configCache = {
      data,
      timestamp: Date.now(),
      ttl,
    };
    // Also update individual DB cache entries
    this.dbCache.clear();
    data.databases.forEach((db) => {
      this.dbCache.set(db.id, {
        data: db,
        timestamp: Date.now(),
        ttl,
      });
    });
  }

  /**
   * Get cached credentials
   */
  getCredentials(): CredentialStore | null {
    if (this.isValid(this.credentialsCache)) {
      return this.credentialsCache!.data;
    }
    return null;
  }

  /**
   * Set credentials cache
   */
  setCredentials(data: CredentialStore, ttl: number = this.defaultTtl): void {
    this.credentialsCache = {
      data,
      timestamp: Date.now(),
      ttl,
    };
  }

  /**
   * Get cached DB by ID
   */
  getDB(id: string): DBMeta | null {
    const entry = this.dbCache.get(id);
    if (this.isValid(entry)) {
      return entry!.data;
    }
    return null;
  }

  /**
   * Invalidate all caches (call after write operations)
   */
  invalidateAll(): void {
    this.configCache = null;
    this.credentialsCache = null;
    this.dbCache.clear();
  }

  /**
   * Invalidate config and DB caches
   */
  invalidateConfig(): void {
    this.configCache = null;
    this.dbCache.clear();
  }

  /**
   * Invalidate credentials cache
   */
  invalidateCredentials(): void {
    this.credentialsCache = null;
  }

  /**
   * Invalidate a specific DB entry
   */
  invalidateDB(id: string): void {
    this.dbCache.delete(id);
    this.configCache = null; // Also invalidate config since it contains the DB list
  }
}

type DBMeta = {
  id: string;
  name: string;
  host: string;
  port: number;
  user: string;
  database: string;
  type?: string;
  credentialId?: string;
  notes?: string;
  tags?: string[];
  ssl?: boolean;
  sslmode?: string;
  createdAt: string;
  updatedAt: string;
};

type CredentialStore = {
  [key: string]: string;
};

type ConfigData = {
  version: number;
  databases: DBMeta[];
};

/**
 * Database Store Service
 * Handles persistence and encryption of database connections
 * Includes in-memory caching for fast data retrieval
 */
export class DbStore {
  private configFolder: string;
  private configFile: string;
  private credentialsFile: string;
  private encryptionKeySource: string;
  private cache: DbStoreCache;
  private preloadPromise: Promise<void> | null = null;
  private isPreloaded: boolean = false;

  constructor(
    configFolder: string = CONFIG_FOLDER,
    configFile: string = CONFIG_FILE,
    credentialsFile: string = CREDENTIALS_FILE,
    encryptionKeySource: string = ENCRYPTION_KEY_SOURCE,
    cacheTtl: number = DEFAULT_CACHE_TTL,
    autoPreload: boolean = true
  ) {
    this.configFolder = configFolder;
    this.configFile = configFile;
    this.credentialsFile = credentialsFile;
    this.encryptionKeySource = encryptionKeySource;
    this.cache = new DbStoreCache(cacheTtl);

    // Auto-preload cache on instantiation for faster first access
    if (autoPreload) {
      this.preloadPromise = this.preloadCache();
    }
  }

  /**
   * Preload cache from disk for faster first retrieval
   * Can be called manually or automatically on instantiation
   */
  async preloadCache(): Promise<void> {
    if (this.isPreloaded && this.cache.getConfig() !== null) {
      return; // Already preloaded and cache is valid
    }

    try {
      // Ensure config directory exists
      if (!fsSync.existsSync(this.configFolder)) {
        await fs.mkdir(this.configFolder, { recursive: true });
      }

      // Load config file
      if (fsSync.existsSync(this.configFile)) {
        const configData = await fs.readFile(this.configFile, "utf-8");
        const config = JSON.parse(configData);
        this.cache.setConfig(config);
      } else {
        // Create empty config and cache it
        const emptyConfig: ConfigData = { version: 1, databases: [] };
        await fs.writeFile(
          this.configFile,
          JSON.stringify(emptyConfig, null, 2),
          "utf-8"
        );
        this.cache.setConfig(emptyConfig);
      }

      // Preload credentials too
      if (fsSync.existsSync(this.credentialsFile)) {
        const credData = await fs.readFile(this.credentialsFile, "utf-8");
        const credentials = JSON.parse(credData);
        this.cache.setCredentials(credentials);
      } else {
        this.cache.setCredentials({});
      }

      this.isPreloaded = true;
    } catch (error) {
      console.error("Failed to preload cache:", error);
      // Don't throw - allow fallback to normal loading
    }
  }

  /**
   * Wait for preload to complete (if in progress)
   */
  private async ensurePreloaded(): Promise<void> {
    if (this.preloadPromise) {
      await this.preloadPromise;
    }
  }

  /**
   * Encrypt password using AES-256-CBC
   */
  private async encryptPassword(password: string): Promise<string> {
    const iv = randomBytes(16);
    const key = (await scryptAsync(
      this.encryptionKeySource,
      "salt",
      32
    )) as Buffer;
    const cipher = createCipheriv("aes-256-cbc", key, iv);

    const encrypted = Buffer.concat([
      cipher.update(password, "utf8"),
      cipher.final(),
    ]);

    // Return IV + encrypted data as base64
    return Buffer.concat([iv, encrypted]).toString("base64");
  }

  /**
   * Decrypt password
   */
  private async decryptPassword(encryptedData: string): Promise<string> {
    const buffer = Buffer.from(encryptedData, "base64");
    const iv = buffer.slice(0, 16);
    const encrypted = buffer.slice(16);

    const key = (await scryptAsync(
      this.encryptionKeySource,
      "salt",
      32
    )) as Buffer;
    const decipher = createDecipheriv("aes-256-cbc", key, iv);

    const decrypted = Buffer.concat([
      decipher.update(encrypted),
      decipher.final(),
    ]);

    return decrypted.toString("utf8");
  }

  /**
   * Load credentials from file (with caching)
   */
  private async loadCredentials(): Promise<CredentialStore> {
    // Wait for preload if in progress
    await this.ensurePreloaded();

    // Check cache first
    const cached = this.cache.getCredentials();
    if (cached !== null) {
      return cached;
    }

    try {
      if (!fsSync.existsSync(this.credentialsFile)) {
        const empty = {};
        this.cache.setCredentials(empty);
        return empty;
      }
      const data = await fs.readFile(this.credentialsFile, "utf-8");
      const credentials = JSON.parse(data);
      this.cache.setCredentials(credentials);
      return credentials;
    } catch (error) {
      console.error("Failed to load credentials:", error);
      return {};
    }
  }

  /**
   * Save credentials to file (invalidates cache)
   */
  private async saveCredentials(credentials: CredentialStore): Promise<void> {
    try {
      await fs.writeFile(
        this.credentialsFile,
        JSON.stringify(credentials, null, 2),
        "utf-8"
      );
      // Set file permissions to user-only (Unix systems)
      if (process.platform !== "win32") {
        await fs.chmod(this.credentialsFile, 0o600);
      }
      // Update cache with new credentials
      this.cache.setCredentials(credentials);
    } catch (error) {
      console.error("Failed to save credentials:", error);
      // Invalidate cache on error
      this.cache.invalidateCredentials();
      throw new Error("Failed to store credentials securely");
    }
  }

  /**
   * Ensure config directory and files exist
   */
  private async ensureConfigDir(): Promise<void> {
    // Create directory if it doesn't exist
    if (!fsSync.existsSync(this.configFolder)) {
      await fs.mkdir(this.configFolder, { recursive: true });
    }

    // Create empty config file if it doesn't exist
    if (!fsSync.existsSync(this.configFile)) {
      await fs.writeFile(
        this.configFile,
        JSON.stringify({ version: 1, databases: [] }, null, 2),
        "utf-8"
      );
    }
  }

  /**
   * Load all database configurations (with caching)
   */
  private async loadAll(): Promise<ConfigData> {
    // Wait for preload if in progress
    await this.ensurePreloaded();

    // Check cache first
    const cached = this.cache.getConfig();
    if (cached !== null) {
      return cached;
    }

    await this.ensureConfigDir();
    const txt = await fs.readFile(this.configFile, "utf-8");
    const config = JSON.parse(txt);
    this.cache.setConfig(config);
    return config;
  }

  /**
   * Save all database configurations (invalidates cache)
   */
  private async saveAll(data: ConfigData): Promise<void> {
    // Only ensure directory exists, don't call ensureConfigDir to avoid recursion
    if (!fsSync.existsSync(this.configFolder)) {
      await fs.mkdir(this.configFolder, { recursive: true });
    }
    await fs.writeFile(this.configFile, JSON.stringify(data, null, 2), "utf-8");
    // Update cache with new data
    this.cache.setConfig(data);
  }

  /**
   * List all database connections
   */
  async listDBs(): Promise<DBMeta[]> {
    const all = await this.loadAll();
    return all.databases;
  }

  /**
   * Get a specific database connection by ID (with caching)
   */
  async getDB(id: string): Promise<DBMeta | undefined> {
    // Wait for preload if in progress
    await this.ensurePreloaded();

    // Check individual DB cache first
    const cachedDB = this.cache.getDB(id);
    if (cachedDB !== null) {
      return cachedDB;
    }

    // Fall back to loading all and finding
    const all = await this.loadAll();
    return all.databases.find((db) => db.id === id);
  }

  /**
   * Add a new database connection
   */
  async addDB(payload: {
    name: string;
    host: string;
    port: number;
    user: string;
    database: string;
    type?: string;
    ssl?: boolean;
    sslmode?: string;
    password?: string;
    notes?: string;
    tags?: string[];
  }): Promise<DBMeta> {
    const all = await this.loadAll();
    const id = uuidv4();
    const now = new Date().toISOString();
    const credentialId = payload.password ? `db_${id}` : undefined;

    const meta: DBMeta = {
      id,
      name: payload.name,
      host: payload.host,
      port: payload.port,
      user: payload.user,
      database: payload.database,
      type: payload.type,
      ssl: payload.ssl,
      sslmode: payload.sslmode,
      credentialId,
      notes: payload.notes,
      tags: payload.tags || [],
      createdAt: now,
      updatedAt: now,
    };

    all.databases.push(meta);
    await this.saveAll(all);

    if (payload.password && credentialId) {
      try {
        const credentials = await this.loadCredentials();
        credentials[credentialId] = await this.encryptPassword(
          payload.password
        );
        await this.saveCredentials(credentials);
      } catch (error) {
        console.error("Failed to store password:", error);
        // Optionally handle error - you might want to throw or handle gracefully
      }
    }

    return meta;
  }

  /**
   * Update an existing database connection
   */
  async updateDB(
    id: string,
    patch: Partial<DBMeta> & { password?: string }
  ): Promise<boolean> {
    const all = await this.loadAll();
    const idx = all.databases.findIndex((db) => db.id === id);
    if (idx === -1) throw new Error("Database not found");

    const now = new Date().toISOString();
    const curr = all.databases[idx];
    const updated = {
      ...curr,
      ...patch,
      updatedAt: now,
    };

    if (patch.password) {
      const credentialId = updated.credentialId || `db_${id}`;
      updated.credentialId = credentialId;

      try {
        const credentials = await this.loadCredentials();
        credentials[credentialId] = await this.encryptPassword(patch.password);
        await this.saveCredentials(credentials);
      } catch (error) {
        console.error("Failed to update password:", error);
        throw new Error("Failed to store password securely");
      }
    }

    all.databases[idx] = updated;
    await this.saveAll(all);
    return true;
  }

  /**
   * Delete a database connection
   */
  async deleteDB(id: string): Promise<boolean> {
    const all = await this.loadAll();
    const idx = all.databases.findIndex((db) => db.id === id);
    if (idx === -1) throw new Error("Database not found");

    const meta = all.databases[idx];
    all.databases.splice(idx, 1);
    await this.saveAll(all);

    if (meta.credentialId) {
      try {
        const credentials = await this.loadCredentials();
        delete credentials[meta.credentialId];
        await this.saveCredentials(credentials);
      } catch (error) {
        console.error("Failed to delete password:", error);
        // Continue anyway since the database entry is already removed
      }
    }

    return true;
  }

  /**
   * Get the decrypted password for a database connection
   */
  async getPasswordFor(meta: DBMeta): Promise<string | null> {
    if (!meta.credentialId) return null;

    try {
      const credentials = await this.loadCredentials();
      const encrypted = credentials[meta.credentialId];
      if (!encrypted) return null;
      return await this.decryptPassword(encrypted);
    } catch (error) {
      console.error("Failed to retrieve password:", error);
      return null;
    }
  }

  /**
   * Manually invalidate all caches
   * Useful when external changes might have occurred
   */
  invalidateCache(): void {
    this.cache.invalidateAll();
    this.isPreloaded = false;
  }

  /**
   * Get cache statistics (useful for debugging)
   */
  getCacheStats(): { 
    configCached: boolean; 
    credentialsCached: boolean; 
    dbCount: number;
    isPreloaded: boolean;
  } {
    return {
      configCached: this.cache.getConfig() !== null,
      credentialsCached: this.cache.getCredentials() !== null,
      dbCount: this.cache.getConfig()?.databases.length ?? 0,
      isPreloaded: this.isPreloaded,
    };
  }

  /**
   * Check if cache is ready (preloaded)
   */
  isReady(): boolean {
    return this.isPreloaded && this.cache.getConfig() !== null;
  }

  /**
   * Wait until cache is ready
   */
  async waitUntilReady(): Promise<void> {
    await this.ensurePreloaded();
  }
}

// Export singleton instance for backward compatibility
export const dbStoreInstance = new DbStore();

// Export convenience functions for backward compatibility
export const listDBs = () => dbStoreInstance.listDBs();
export const getDB = (id: string) => dbStoreInstance.getDB(id);
export const addDB = (payload: any) => dbStoreInstance.addDB(payload);
export const updateDB = (id: string, patch: any) =>
  dbStoreInstance.updateDB(id, patch);
export const deleteDB = (id: string) => dbStoreInstance.deleteDB(id);
export const getPasswordFor = (meta: DBMeta) =>
  dbStoreInstance.getPasswordFor(meta);
export const invalidateCache = () => dbStoreInstance.invalidateCache();

// Export types
export type { DBMeta, CredentialStore, ConfigData };
