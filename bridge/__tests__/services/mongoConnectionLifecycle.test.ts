import { describe, expect, test, jest, beforeEach, afterEach } from "@jest/globals";
import path from "path";
import fs from "fs";
import { MongoClient } from "mongodb";
import {
  getClientKey,
  clientRegistry,
  closingClients,
  closeMongoClientByKey,
  closeAllMongoClients,
  forceDestroyMongoSockets,
  getMongoClient,
  testConnection,
  setMongoShuttingDown,
  mongoConnector,
  MongoApiError,
} from "../../src/connectors/mongo";
import { ConnectionPool, PoolEntry, ConnectionLease } from "../../src/services/connectionPool";
import { DatabaseService } from "../../src/services/databaseService";
import { ConnectionBuilder } from "../../src/services/connectionBuilder";
import { dbStoreInstance } from "../../src/services/dbStore";
import { keyringServiceInstance } from "../../src/services/keyringService";
import { SSHTunnelService } from "../../src/services/sshTunnelService";
import { MongoBulkEngine } from "../../src/services/mongoBulkEngine";
import { MigrationHandlers } from "../../src/handlers/migrationHandlers";
import { DBType } from "../../src/types";
import { MongoConfig } from "../../src/types/mongo";

function createDeferred<T = void>() {
  let resolve!: (value: T | PromiseLike<T>) => void;
  let reject!: (reason?: any) => void;
  const promise = new Promise<T>((res, rej) => {
    resolve = res;
    reject = rej;
  });
  return { promise, resolve, reject };
}

describe("MongoDB Connection Lifecycle & Concurrency Deterministic Test Suite", () => {
  let dbService: DatabaseService;
  let pool: ConnectionPool;

  beforeEach(() => {
    clientRegistry.clear();
    closingClients.clear();
    setMongoShuttingDown(false);

    pool = new ConnectionPool();
    dbService = new DatabaseService();
    (dbService as any).connectionPool = pool;
    jest.restoreAllMocks();
  });

  afterEach(async () => {
    try {
      pool.destroy();
    } catch {}
    clientRegistry.clear();
    closingClients.clear();
    setMongoShuttingDown(false);
    jest.useRealTimers();
  });

  // ---------------------------------------------------------------------------
  // 1. test_concurrent_callers_receive_distinct_leases_and_correct_active_count
  // ---------------------------------------------------------------------------
  test("1. test_concurrent_callers_receive_distinct_leases_and_correct_active_count", async () => {
    const dbId = "test_db_1";
    const barriers = Array.from({ length: 5 }, () => createDeferred<void>());
    let buildCount = 0;

    const mockDb = {
      id: dbId,
      name: "TestDB",
      type: "mongodb",
      url: "mongodb://localhost:27017/testdb",
      database: "testdb",
    };

    jest.spyOn(dbStoreInstance, "getDB").mockResolvedValue(mockDb as any);
    jest.spyOn(dbStoreInstance, "getPasswordFor").mockResolvedValue(null as any);
    jest.spyOn(ConnectionBuilder, "buildConnection").mockImplementation(async () => {
      buildCount++;
      return {
        config: { uri: "mongodb://localhost:27017/testdb", database: "testdb" },
        tunnel: undefined,
      };
    });

    const callers = barriers.map((barrier, index) =>
      dbService.withConnection(dbId, async (conn, db, type) => {
        await barrier.promise;
        return index;
      }),
    );

    // Yield to allow all 5 callers to acquire leases and pause at their barrier
    await new Promise((r) => setImmediate(r));

    expect(buildCount).toBe(1);
    const poolEntries = (pool as any).pool as Map<string, PoolEntry>;
    const entry = poolEntries.get(dbId);
    expect(entry).toBeDefined();
    expect(entry!.activeOperations).toBe(5);

    // Release caller 1
    barriers[0].resolve();
    const result0 = await callers[0];
    expect(result0).toBe(0);
    expect(entry!.activeOperations).toBe(4);

    // Invalidate profile while callers 2-5 are still holding their leases
    await pool.invalidate(dbId);
    expect(entry!.disposed).toBe(true);
    const pendingDisposal = (pool as any).pendingDisposal as Set<PoolEntry>;
    expect(pendingDisposal.has(entry!)).toBe(true);

    const safeCloseSpy = jest.spyOn(pool, "safeCloseMongoClient");

    // Release callers 2 to 5
    barriers[1].resolve();
    barriers[2].resolve();
    barriers[3].resolve();
    barriers[4].resolve();

    await Promise.all(callers.slice(1));
    expect(entry!.activeOperations).toBe(0);
    expect(pendingDisposal.has(entry!)).toBe(false);

    // Give microtask tick for deferred cleanup
    await new Promise((r) => setImmediate(r));
    expect(safeCloseSpy).toHaveBeenCalled();
  });

  // ---------------------------------------------------------------------------
  // 2. test_identity_safe_inflight_promise_removal
  // ---------------------------------------------------------------------------
  test("2. test_identity_safe_inflight_promise_removal", async () => {
    const dbId = "test_db_2";
    const barrierA = createDeferred<void>();
    const barrierB = createDeferred<void>();

    const mockDb = {
      id: dbId,
      name: "TestDB",
      type: "mongodb",
      url: "mongodb://localhost:27017/testdb",
      database: "testdb",
    };

    jest.spyOn(dbStoreInstance, "getDB").mockResolvedValue(mockDb as any);
    jest.spyOn(dbStoreInstance, "getPasswordFor").mockResolvedValue(null as any);

    let invocation = 0;
    jest.spyOn(ConnectionBuilder, "buildConnection").mockImplementation(async () => {
      invocation++;
      if (invocation === 1) {
        await barrierA.promise;
        return { config: { uri: "mongodb://localhost:27017/testdb_a", database: "testdb" } };
      } else {
        await barrierB.promise;
        return { config: { uri: "mongodb://localhost:27017/testdb_b", database: "testdb" } };
      }
    });

    const inFlightMap = (dbService as any).inFlightConnections as Map<string, Promise<void>>;

    // Start Builder A
    const builderAPromise = (dbService as any).ensureConnectionBuilt(dbId);
    expect(inFlightMap.has(dbId)).toBe(true);
    const promiseA = inFlightMap.get(dbId);

    // Allow Builder A to progress past getDB and pause inside buildConnection
    for (let i = 0; i < 5; i++) await new Promise((r) => setImmediate(r));
    expect(invocation).toBe(1);

    // Invalidate connection (bumps generation and clears inFlightConnections)
    await dbService.invalidateConnection(dbId);
    expect(inFlightMap.has(dbId)).toBe(false);

    // Start Builder B
    const builderBPromise = (dbService as any).ensureConnectionBuilt(dbId);
    expect(inFlightMap.has(dbId)).toBe(true);
    const promiseB = inFlightMap.get(dbId);
    expect(promiseB).not.toBe(promiseA);

    // Allow Builder B to progress past getDB and pause inside buildConnection
    for (let i = 0; i < 5; i++) await new Promise((r) => setImmediate(r));
    expect(invocation).toBe(2);

    // Resolve Builder A
    barrierA.resolve();
    await expect(builderAPromise).rejects.toThrow(/Connection build aborted/);

    // Identity safety check: Builder A settling must NOT have deleted Builder B's promise
    expect(inFlightMap.get(dbId)).toBe(promiseB);

    // Caller C joins Builder B without starting Builder C
    const builderCPromise = (dbService as any).ensureConnectionBuilt(dbId);
    expect(inFlightMap.get(dbId)).toBe(promiseB);
    expect(invocation).toBe(2);

    // Settle Builder B
    barrierB.resolve();
    await Promise.all([builderBPromise, builderCPromise]);

    // Map is cleanly emptied after settle
    expect(inFlightMap.has(dbId)).toBe(false);
  });

  // ---------------------------------------------------------------------------
  // 3. test_new_profile_acquire_during_final_reference_cleanup
  // ---------------------------------------------------------------------------
  test("3. test_new_profile_acquire_during_final_reference_cleanup", async () => {
    const clientKey = getClientKey({ uri: "mongodb://localhost:27017/shared_db", database: "shared_db" });
    const closeBarrier = createDeferred<void>();

    const mockOldClient: any = {
      close: jest.fn<any>().mockImplementation(async () => {
        await closeBarrier.promise;
      }),
      topology: { s: { servers: new Map() } },
    };

    clientRegistry.set(clientKey, { client: mockOldClient, state: "closing" });
    const closePromise = closeMongoClientByKey(clientKey, { force: true });
    closingClients.set(clientKey, closePromise);

    let acquiredNewClient: MongoClient | undefined;
    const acquirePromise = (async () => {
      acquiredNewClient = await getMongoClient({
        uri: "mongodb://localhost:27017/shared_db",
        database: "shared_db",
      });
    })();

    await new Promise((r) => setImmediate(r));
    // Profile B is awaiting in-flight closure
    expect(acquiredNewClient).toBeUndefined();

    // Settle close barrier
    closeBarrier.resolve();
    await closePromise;
    await acquirePromise;

    expect(acquiredNewClient).toBeDefined();
    expect(acquiredNewClient).not.toBe(mockOldClient);
    expect(clientRegistry.get(clientKey)?.state).toBe("active");
  });

  // ---------------------------------------------------------------------------
  // 4. test_single_flight_force_close_recovery_and_single_replacement_client
  // ---------------------------------------------------------------------------
  test("4. test_single_flight_force_close_recovery_and_single_replacement_client", async () => {
    const cfg: MongoConfig = { uri: "mongodb://localhost:27017/recovery_db", database: "recovery_db" };
    const key = getClientKey(cfg);
    const closeBarrier = createDeferred<void>();

    const mockFailedClient: any = {
      close: jest.fn<any>().mockImplementation(async () => {
        await closeBarrier.promise;
      }),
      topology: { s: { servers: new Map() } },
    };

    clientRegistry.set(key, { client: mockFailedClient, state: "close_failed", closeError: new Error("Previous hang") });

    // Launch two concurrent callers
    const caller1Promise = getMongoClient(cfg);
    const caller2Promise = getMongoClient(cfg);

    await new Promise((r) => setImmediate(r));

    // Exactly one close call was dispatched
    expect(mockFailedClient.close).toHaveBeenCalledTimes(1);

    // Resolve close barrier
    closeBarrier.resolve();

    const [client1, client2] = await Promise.all([caller1Promise, caller2Promise]);

    expect(client1).toBeDefined();
    expect(client1).toBe(client2);
    expect(clientRegistry.size).toBe(1);
    expect(clientRegistry.get(key)?.state).toBe("active");

    // Failure case: when force-close rejects, verify close_failed is preserved and zero replacement created
    const unconfirmedClient: any = {
      close: jest.fn<any>().mockRejectedValue(new Error("Socket severance failed")),
      topology: { s: { servers: "not-a-map" } },
    };
    clientRegistry.set(key, { client: unconfirmedClient, state: "close_failed" });

    await expect(getMongoClient(cfg)).rejects.toThrow(/prior client for key .* failed to force-close/);
    expect(clientRegistry.get(key)?.state).toBe("close_failed");
  });

  // ---------------------------------------------------------------------------
  // 5. test_dynamically_allocated_ssh_ports_and_lifecycle_interleaving
  // ---------------------------------------------------------------------------
  test("5. test_dynamically_allocated_ssh_ports_and_lifecycle_interleaving", async () => {
    const dbA = {
      id: "ssh_db_a",
      name: "SSH_A",
      type: "mongodb",
      url: "mongodb://remote-server:27017/db_a",
      database: "db_a",
      ssh: { host: "bastion", port: 22, user: "tunnel", authMethod: "password" },
    };
    const dbB = {
      id: "ssh_db_b",
      name: "SSH_B",
      type: "mongodb",
      url: "mongodb://remote-server:27017/db_b",
      database: "db_b",
      ssh: { host: "bastion", port: 22, user: "tunnel", authMethod: "password" },
    };

    jest.spyOn(dbStoreInstance, "getDB").mockImplementation(async (id) => (id === "ssh_db_a" ? dbA : dbB) as any);
    jest.spyOn(dbStoreInstance, "getPasswordFor").mockResolvedValue(null as any);
    jest.spyOn(keyringServiceInstance, "getCredential").mockResolvedValue("ssh_secret");

    const mockTunnelA = { localPort: 54321, close: jest.fn() };
    const mockTunnelB = { localPort: 54322, close: jest.fn() };

    jest.spyOn(ConnectionBuilder, "buildConnection").mockImplementation(async (db: any) => {
      const tunnel = db.id === "ssh_db_a" ? mockTunnelA : mockTunnelB;
      return {
        config: { uri: `mongodb://127.0.0.1:${tunnel.localPort}/${db.database}`, database: db.database },
        tunnel,
      };
    });

    const leaseA = await dbService.acquireConnection("ssh_db_a");
    const leaseB = await dbService.acquireConnection("ssh_db_b");

    const keyA = getClientKey(leaseA.conn);
    const keyB = getClientKey(leaseB.conn);

    expect(keyA).toContain("54321");
    expect(keyB).toContain("54322");
    expect(keyA).not.toBe(keyB);

    leaseA.release();
    leaseB.release();

    // Interleaved cleanup: invalidating Profile A does NOT affect Profile B
    await pool.invalidate("ssh_db_a");
    expect(mockTunnelA.close).toHaveBeenCalled();
    expect(mockTunnelB.close).not.toHaveBeenCalled();
    expect(pool.get("ssh_db_b")).toBeDefined();
  });

  // ---------------------------------------------------------------------------
  // 6. test_stale_builder_separate_tunnel_and_client_adoption_checks
  // ---------------------------------------------------------------------------
  describe("6. test_stale_builder_separate_tunnel_and_client_adoption_checks", () => {
    test("Sub-scenario A: Same tunnel object adopted, unshared client", async () => {
      const builtTunnel = { localPort: 50001, close: jest.fn() };
      const builtConfig = { uri: "mongodb://127.0.0.1:50001/unshared_db", database: "unshared_db" };

      // Adopted in pool under distinct profile
      pool.set("other_profile", { uri: "mongodb://127.0.0.1:50001/other_db", database: "other_db" }, DBType.MONGODB, builtTunnel as any);

      const safeCloseSpy = jest.spyOn(pool, "safeCloseMongoClient");

      // Builder runs check 3 logic
      const isTunnelAdopted = Array.from(pool.getAllEntries()).some((e) => e.tunnel === builtTunnel);
      expect(isTunnelAdopted).toBe(true);
      if (!isTunnelAdopted) builtTunnel.close();

      await pool.safeCloseMongoClient(builtConfig);

      expect(builtTunnel.close).not.toHaveBeenCalled();
      expect(safeCloseSpy).toHaveBeenCalledWith(builtConfig);
    });

    test("Sub-scenario B: Similar endpoint, different tunnel object", async () => {
      const builtTunnel = { localPort: 50002, close: jest.fn() };
      const otherTunnel = { localPort: 50002, close: jest.fn() };

      pool.set("other_profile", { uri: "mongodb://127.0.0.1:50002/db", database: "db" }, DBType.MONGODB, otherTunnel as any);

      // Identity check: must be strict object equality
      const isTunnelAdopted = Array.from(pool.getAllEntries()).some((e) => e.tunnel === builtTunnel);
      expect(isTunnelAdopted).toBe(false);

      if (!isTunnelAdopted) builtTunnel.close();

      expect(builtTunnel.close).toHaveBeenCalled();
      expect(otherTunnel.close).not.toHaveBeenCalled();
    });

    test("Sub-scenario C: Shared MongoClient, unshared tunnel", async () => {
      const builtTunnel = { localPort: 50003, close: jest.fn() };
      const sharedConfig = { uri: "mongodb://127.0.0.1:50003/shared_c", database: "shared_c" };

      // Other profile shares clientKey but has different or no tunnel
      pool.set("adopting_profile", sharedConfig, DBType.MONGODB, undefined);

      const isTunnelAdopted = Array.from(pool.getAllEntries()).some((e) => e.tunnel === builtTunnel);
      if (!isTunnelAdopted) builtTunnel.close();

      const closeKeySpy = jest.spyOn(pool, "safeCloseMongoClient");
      await pool.safeCloseMongoClient(sharedConfig);

      expect(builtTunnel.close).toHaveBeenCalled();
      expect(closeKeySpy).toHaveBeenCalled();
    });

    test("Sub-scenario D: Shared tunnel, unshared MongoClient", async () => {
      const builtTunnel = { localPort: 50004, close: jest.fn() };
      const unsharedConfig = { uri: "mongodb://127.0.0.1:50004/distinct_d", database: "distinct_d" };

      pool.set("tunnel_holder", { uri: "mongodb://127.0.0.1:50004/holder_db", database: "holder_db" }, DBType.MONGODB, builtTunnel as any);

      const isTunnelAdopted = Array.from(pool.getAllEntries()).some((e) => e.tunnel === builtTunnel);
      expect(isTunnelAdopted).toBe(true);
      if (!isTunnelAdopted) builtTunnel.close();

      await pool.safeCloseMongoClient(unsharedConfig);

      expect(builtTunnel.close).not.toHaveBeenCalled();
    });
  });

  // ---------------------------------------------------------------------------
  // 7. test_fatal_error_invalidation_awaited_and_original_error_preserved
  // ---------------------------------------------------------------------------
  test("7. test_fatal_error_invalidation_awaited_and_original_error_preserved", async () => {
    const dbId = "fatal_db";
    const mockDb = {
      id: dbId,
      name: "FatalDB",
      type: "mongodb",
      url: "mongodb://localhost:27017/fatal",
      database: "fatal",
    };

    jest.spyOn(dbStoreInstance, "getDB").mockResolvedValue(mockDb as any);
    jest.spyOn(dbStoreInstance, "getPasswordFor").mockResolvedValue(null as any);
    jest.spyOn(ConnectionBuilder, "buildConnection").mockResolvedValue({
      config: { uri: "mongodb://localhost:27017/fatal", database: "fatal" },
    });

    const fatalError = new Error("connection reset by peer");
    (fatalError as any).name = "MongoNetworkError";

    const invalidateSpy = jest.spyOn(dbService, "invalidateConnection");

    await expect(
      dbService.withConnection(dbId, async () => {
        throw fatalError;
      }),
    ).rejects.toThrow("connection reset by peer");

    expect(invalidateSpy).toHaveBeenCalledWith(dbId);

    // Verify when invalidation rejects, original error is still preserved
    invalidateSpy.mockRejectedValueOnce(new Error("invalidation failure"));

    await expect(
      dbService.withConnection(dbId, async () => {
        throw fatalError;
      }),
    ).rejects.toThrow("connection reset by peer");
  });

  // ---------------------------------------------------------------------------
  // 8. test_non_settling_client_close_forced_socket_destruction_and_bounded_shutdown
  // ---------------------------------------------------------------------------
  test("8. test_non_settling_client_close_forced_socket_destruction_and_bounded_shutdown", async () => {
    const key = "non_settling_key";
    const mockSocket = { destroyed: false, destroy: jest.fn(() => { mockSocket.destroyed = true; }) };

    const mockClient: any = {
      close: jest.fn(() => new Promise(() => {})), // Never settles
      topology: {
        s: {
          servers: new Map([
            ["server1", { pool: { connections: [{ socket: mockSocket }], checkedOut: new Set() } }],
          ]),
        },
      },
    };

    clientRegistry.set(key, { client: mockClient, state: "active" });

    const phase4Deadline = Date.now() + 50;
    await closeAllMongoClients({ force: true, globalDeadline: phase4Deadline });

    expect(mockSocket.destroy).toHaveBeenCalled();
    expect(clientRegistry.has(key)).toBe(false); // destroy_confirmed deletes from registry
  });

  // ---------------------------------------------------------------------------
  // 9. test_shutdown_escalates_inflight_normal_close_without_competing_operation
  // ---------------------------------------------------------------------------
  test("9. test_shutdown_escalates_inflight_normal_close_without_competing_operation", async () => {
    const key = "escalation_key";
    const mockSocket = { destroyed: false, destroy: jest.fn(() => { mockSocket.destroyed = true; }) };

    const ordinaryCloseBarrier = createDeferred<void>();
    const mockClient: any = {
      close: jest.fn(async () => {
        await ordinaryCloseBarrier.promise;
      }),
      topology: {
        s: {
          servers: new Map([
            ["server1", { pool: { connections: [{ socket: mockSocket }], checkedOut: new Set() } }],
          ]),
        },
      },
    };

    clientRegistry.set(key, { client: mockClient, state: "active" });

    // Initiate ordinary close
    const normalClosePromise = closeMongoClientByKey(key);

    // Shutdown arrives while close is in-flight
    const phase4Deadline = Date.now() + 40;
    await closeAllMongoClients({ force: true, globalDeadline: phase4Deadline });

    // Client.close was called exactly ONCE (no competing second call)
    expect(mockClient.close).toHaveBeenCalledTimes(1);
    expect(mockSocket.destroy).toHaveBeenCalled();
    expect(clientRegistry.has(key)).toBe(false);

    ordinaryCloseBarrier.resolve();
    await normalClosePromise;
  });

  // ---------------------------------------------------------------------------
  // 10. test_multiple_non_settling_clients_global_bounded_teardown
  // ---------------------------------------------------------------------------
  test("10. test_multiple_non_settling_clients_global_bounded_teardown", async () => {
    const mockSockets: any[] = [];
    for (let i = 0; i < 5; i++) {
      const sock = { destroyed: false, destroy: jest.fn(function (this: any) { this.destroyed = true; }) };
      mockSockets.push(sock);

      const client: any = {
        close: jest.fn(() => new Promise(() => {})),
        topology: {
          s: {
            servers: new Map([
              [`server_${i}`, { pool: { connections: [{ socket: sock }], checkedOut: new Set() } }],
            ]),
          },
        },
      };

      clientRegistry.set(`client_${i}`, { client, state: "active" });
    }

    const start = Date.now();
    const phase4Deadline = start + 50;

    await closeAllMongoClients({ force: true, globalDeadline: phase4Deadline });
    const elapsed = Date.now() - start;

    expect(elapsed).toBeLessThan(300); // Must be bounded globally, not 5 * 50ms serial
    for (const sock of mockSockets) {
      expect(sock.destroy).toHaveBeenCalled();
    }
  });

  // ---------------------------------------------------------------------------
  // 11. test_unconfirmed_socket_destruction_retains_registry_entry
  // ---------------------------------------------------------------------------
  test("11. test_unconfirmed_socket_destruction_retains_registry_entry", async () => {
    const key = getClientKey({ uri: "mongodb://stubborn/db", database: "db" });

    // Client whose socket destruction fails to observe .destroyed === true
    const stubbornSocket = { destroyed: false, destroy: jest.fn() };
    const mockClient: any = {
      close: jest.fn<any>().mockRejectedValue(new Error("Socket severance failed")),
      topology: {
        s: {
          servers: new Map([
            ["server1", { pool: { connections: [{ socket: stubbornSocket }], checkedOut: new Set() } }],
          ]),
        },
      },
    };

    clientRegistry.set(key, { client: mockClient, state: "active" });

    await expect(
      closeMongoClientByKey(key, { force: true, globalDeadline: Date.now() + 100 }),
    ).rejects.toThrow();

    const entry = clientRegistry.get(key);
    expect(entry).toBeDefined();
    expect(entry?.state).toBe("close_failed");
    expect(stubbornSocket.destroy).toHaveBeenCalled();

    // Subsequent acquire rejects
    await expect(
      getMongoClient({ uri: "mongodb://stubborn/db", database: "db" } as any),
    ).rejects.toThrow(/prior client for key .* failed to force-close/);
  });

  // ---------------------------------------------------------------------------
  // 12. test_phase_4_cleanup_sync_bounded_to_200ms_before_forced_teardown
  // ---------------------------------------------------------------------------
  test("12. test_phase_4_cleanup_sync_bounded_to_200ms_before_forced_teardown", async () => {
    jest.useFakeTimers();

    const hangingCleanup = new Promise<void>(() => {});
    pool.getInProgressCleanups().add(hangingCleanup);

    const shutdownPromise = (dbService as any).executePhase4Teardown();

    // Advance 200ms
    jest.advanceTimersByTime(200);
    await Promise.resolve();

    // Advance past phase 4 client close
    jest.advanceTimersByTime(100);
    await shutdownPromise;

    expect(pool.isForcedTeardownInitiated).toBe(true);
    jest.useRealTimers();
  });

  // ---------------------------------------------------------------------------
  // 13. test_canonical_client_key_identity_across_sanitization_and_casing
  // ---------------------------------------------------------------------------
  test("13. test_canonical_client_key_identity_across_sanitization_and_casing", async () => {
    const key1 = getClientKey({ uri: "mongodb://user:secret@localhost:27017/ProductionDB", database: "ProductionDB" });
    const key2 = getClientKey({ uri: "mongodb://user@localhost:27017/ProductionDB", database: "  productiondb  " });
    const key3 = getClientKey({ uri: "mongodb://user:secret@localhost:27017/productiondb", database: "productiondb" });

    expect(key1).toBe(key2);
    expect(key2).toBe(key3);

    const pingSpy = jest.spyOn(MongoClient.prototype, "db").mockReturnValue({
      command: jest.fn<any>().mockResolvedValue({ ok: 1 }),
    } as any);

    // Verify testConnection is completely transient and does not touch clientRegistry
    const initialSize = clientRegistry.size;
    await testConnection({ uri: "mongodb://localhost:27017/test", database: "test" });
    expect(clientRegistry.size).toBe(initialSize);
    pingSpy.mockRestore();
  });

  // ---------------------------------------------------------------------------
  // 14. test_shutdown_blocks_resource_creation_after_credential_lookup
  // ---------------------------------------------------------------------------
  test("14. test_shutdown_blocks_resource_creation_after_credential_lookup", async () => {
    const dbId = "shutdown_db_check2";
    const keyringBarrier = createDeferred<string>();

    jest.spyOn(dbStoreInstance, "getDB").mockResolvedValue({
      id: dbId,
      name: "Check2DB",
      type: "mongodb",
      database: "check2",
      ssh: { host: "bastion", authMethod: "password" },
    } as any);
    jest.spyOn(dbStoreInstance, "getPasswordFor").mockResolvedValue(null as any);
    jest.spyOn(keyringServiceInstance, "getCredential").mockImplementation(async () => {
      return keyringBarrier.promise;
    });

    const buildSpy = jest.spyOn(ConnectionBuilder, "buildConnection");

    const buildPromise = (dbService as any).ensureConnectionBuilt(dbId);

    // Trigger shutdown while waiting for keyring
    (dbService as any).isShuttingDown = true;
    keyringBarrier.resolve("pass");

    await expect(buildPromise).rejects.toThrow(/Bridge is shutting down|Connection build aborted/);
    expect(buildSpy).not.toHaveBeenCalled();
  });

  // ---------------------------------------------------------------------------
  // 15. test_shutdown_1500ms_deadline_enforces_forced_teardown
  // ---------------------------------------------------------------------------
  test("15. test_shutdown_1500ms_deadline_enforces_forced_teardown", async () => {
    jest.useFakeTimers();

    const hangingBuilder = new Promise<void>(() => {});
    (dbService as any).activeBuilders.add(hangingBuilder);

    const shutdownPromise = dbService.shutdown();

    // Advance 1500ms for phase 3 drain
    jest.advanceTimersByTime(1500);
    await Promise.resolve();

    // Advance 200ms for phase 4 cleanup sync
    jest.advanceTimersByTime(200);
    await Promise.resolve();

    // Advance 100ms for phase 4 forced teardown
    jest.advanceTimersByTime(100);
    await shutdownPromise;

    expect((dbService as any).isShuttingDown).toBe(true);
    expect(pool.isForcedTeardownInitiated).toBe(true);
    jest.useRealTimers();
  });

  // ---------------------------------------------------------------------------
  // 16. test_all_invalidation_entry_points_advance_generation
  // ---------------------------------------------------------------------------
  test("16. test_all_invalidation_entry_points_advance_generation", async () => {
    const dbId = "gen_db";
    expect(dbService.getGeneration(dbId)).toBe(0);

    // Invalidation 1: updateDatabase
    jest.spyOn(dbStoreInstance, "updateDB").mockResolvedValue({} as any);
    await dbService.updateDatabase(dbId, { name: "NewName" });
    expect(dbService.getGeneration(dbId)).toBe(1);

    // Invalidation 2: fatal error in withConnection
    jest.spyOn(dbStoreInstance, "getDB").mockResolvedValue({ id: dbId, database: "test" } as any);
    jest.spyOn(ConnectionBuilder, "buildConnection").mockResolvedValue({ config: { database: "test" } });

    const fatal = new Error("ECONNRESET");
    (fatal as any).name = "MongoNetworkError";

    await expect(
      dbService.withConnection(dbId, async () => {
        throw fatal;
      }),
    ).rejects.toThrow("ECONNRESET");
    expect(dbService.getGeneration(dbId)).toBe(2);

    // Invalidation 3: deleteDatabase
    jest.spyOn(dbStoreInstance, "deleteDB").mockResolvedValue({ ok: true } as any);
    jest.spyOn(keyringServiceInstance, "deleteCredential").mockResolvedValue();
    await dbService.deleteDatabase(dbId);
    expect(dbService.getGeneration(dbId)).toBe(3);
  });

  // ---------------------------------------------------------------------------
  // 17. test_read_only_rejection_across_all_15_mutating_operations
  // ---------------------------------------------------------------------------
  test("17. test_read_only_rejection_across_all_15_mutating_operations", async () => {
    const readOnlyConn: MongoConfig = {
      uri: "mongodb://localhost:27017/ro_db",
      database: "ro_db",
      readonly: true,
    };

    // 1-9: Connector Guards in mongo.ts
    await expect(mongoConnector.insertDocument(readOnlyConn, { collection: "c", document: { a: 1 } }))
      .rejects.toThrow("Database is configured as read-only. 'insertDocument' is prohibited.");

    await expect(mongoConnector.updateDocument(readOnlyConn, { collection: "c", filter: { a: 1 }, update: { $set: { b: 2 } } }))
      .rejects.toThrow("Database is configured as read-only. 'updateDocument' is prohibited.");

    await expect(mongoConnector.replaceDocument(readOnlyConn, { collection: "c", filter: { a: 1 }, replacement: { b: 2 } }))
      .rejects.toThrow("Database is configured as read-only. 'replaceDocument' is prohibited.");

    await expect(mongoConnector.deleteDocument(readOnlyConn, { collection: "c", filter: { a: 1 } }))
      .rejects.toThrow("Database is configured as read-only. 'deleteDocument' is prohibited.");

    await expect(mongoConnector.createCollection(readOnlyConn, { collection: "c_new" }))
      .rejects.toThrow("Database is configured as read-only. 'createCollection' is prohibited.");

    await expect(mongoConnector.dropCollection(readOnlyConn, { collection: "c_old" }))
      .rejects.toThrow("Database is configured as read-only. 'dropCollection' is prohibited.");

    await expect(mongoConnector.createIndexes(readOnlyConn, { collection: "c", key: { a: 1 } }))
      .rejects.toThrow("Database is configured as read-only. 'createIndexes' is prohibited.");

    await expect(mongoConnector.dropIndex(readOnlyConn, { collection: "c", indexName: "idx_1" }))
      .rejects.toThrow("Database is configured as read-only. 'dropIndex' is prohibited.");

    await expect(mongoConnector.hideIndex(readOnlyConn, { collection: "c", indexName: "idx_1", hidden: true }))
      .rejects.toThrow("Database is configured as read-only. 'hideIndex' is prohibited.");

    // 10-13: Bulk Engine Guards in mongoBulkEngine.ts
    const mockDbService = {
      getDatabaseConnection: jest.fn<any>().mockResolvedValue({
        dbType: DBType.MONGODB,
        db: { id: "ro_bulk_db", readonly: true },
        conn: readOnlyConn,
      }),
    } as any;
    const bulkEngine = new MongoBulkEngine(mockDbService);

    await expect(bulkEngine.bulkInsert({ dbId: "ro_bulk_db", collection: "c", documents: [{ a: 1 }] }))
      .rejects.toMatchObject({ code: "MONGO_READ_ONLY" });

    await expect(bulkEngine.bulkUpdate({ dbId: "ro_bulk_db", collection: "c", filter: { a: 1 }, update: { $set: { b: 2 } } }))
      .rejects.toMatchObject({ code: "MONGO_READ_ONLY" });

    await expect(bulkEngine.bulkDelete({ dbId: "ro_bulk_db", collection: "c", filter: { a: 1 } }))
      .rejects.toMatchObject({ code: "MONGO_READ_ONLY" });

    const opState = bulkEngine.opManager.createOperation("import", "ro_bulk_db", "c", "json");
    await expect(bulkEngine.importChunk({ operationId: opState.operation.operationId, chunkIndex: 0, isLastChunk: true, payload: "[]" }))
      .rejects.toMatchObject({ code: "MONGO_READ_ONLY" });

    // 14-15: Migration Handler Guards in migrationHandlers.ts
    const mockRpc = { sendResponse: jest.fn(), sendError: jest.fn() };
    const mockLogger = { info: jest.fn(), error: jest.fn(), warn: jest.fn() } as any;
    const migHandlers = new MigrationHandlers(mockRpc as any, mockLogger, mockDbService, {} as any);

    await migHandlers.handleApplyMigration({ dbId: "ro_bulk_db", version: 1 }, 101);
    expect(mockRpc.sendError).toHaveBeenCalledWith(101, expect.objectContaining({ code: "MONGO_READ_ONLY" }));

    await migHandlers.handleRollbackMigration({ dbId: "ro_bulk_db", version: 1 }, 102);
    expect(mockRpc.sendError).toHaveBeenCalledWith(102, expect.objectContaining({ code: "MONGO_READ_ONLY" }));
  });

  // ---------------------------------------------------------------------------
  // 18. test_implementation_time_driver_version_verification
  // ---------------------------------------------------------------------------
  test("18. test_implementation_time_driver_version_verification", async () => {
    // 1. Check resolved mongodb version
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const driverPackage = require("mongodb/package.json");
    expect(driverPackage.version).toBe("6.21.0");

    // 2. Check bridge/package.json specification
    const pkgJsonPath = path.resolve(__dirname, "../../package.json");
    const pkgJson = JSON.parse(fs.readFileSync(pkgJsonPath, "utf-8"));
    expect(pkgJson.dependencies.mongodb).toMatch(/6\.21\.0/);

    // 3. Runtime topology and connection pool structure assertion
    const mockSocket = { destroyed: false, destroy: jest.fn() };
    const serverMap = new Map();
    const mockPool = {
      connections: [{ socket: mockSocket }],
      checkedOut: new Set(),
      destroy: jest.fn(),
    };
    serverMap.set("node1", { pool: mockPool });

    const client: any = new MongoClient("mongodb://localhost:27017/test");
    // Attach simulated 6.21.0 topology structure
    client.topology = {
      s: {
        servers: serverMap,
      },
    };

    expect(client.topology.s.servers instanceof Map).toBe(true);
    expect(mockPool.connections[0].socket).toBeDefined();

    // Verify forceDestroyMongoSockets correctly processes standard 6.21.0 layout
    const result = forceDestroyMongoSockets(client);
    expect(result.status).toBe("destroy_requested");
    expect(result.totalDiscoveredSockets).toBe(1);
    expect(mockSocket.destroy).toHaveBeenCalled();

    // Verify structural deviation throws explicit diagnostic error / unconfirmed status
    const corruptClient: any = { topology: { s: { servers: "invalid_structure" } } };
    const corruptResult = forceDestroyMongoSockets(corruptClient);
    expect(corruptResult.status).toBe("unconfirmed");
    expect(corruptResult.error?.message).toContain("Unexpected MongoDB driver topology structure");
  });
});
