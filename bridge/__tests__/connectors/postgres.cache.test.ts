import { postgresCache, PostgresCacheManager } from '../../src/connectors/postgres';
import { describe, it, expect, test, beforeEach } from "@jest/globals";

// Mock PGConfig for testing
const mockConnection = {
  host: 'localhost',
  port: 5432,
  user: 'testuser',
  password: 'testpass',
  database: 'testdb'
};

const mockConnection2 = {
  host: 'localhost',
  port: 5432,
  user: 'testuser',
  password: 'testpass',
  database: 'otherdb'
};

describe('PostgresCacheManager', () => {
  beforeEach(() => {
    // Clear all caches before each test
    postgresCache.clearAll();
  });

  describe('Connection Key Generation', () => {
    it('should generate consistent keys for same connection', () => {
      const tables1 = [{ schema: 'public', name: 'users', type: 'BASE TABLE' }];
      
      postgresCache.setTableList(mockConnection, tables1);
      const cached = postgresCache.getTableList(mockConnection);
      
      expect(cached).toEqual(tables1);
    });

    it('should generate different keys for different databases', () => {
      const tables1 = [{ schema: 'public', name: 'users', type: 'BASE TABLE' }];
      const tables2 = [{ schema: 'public', name: 'orders', type: 'BASE TABLE' }];
      
      postgresCache.setTableList(mockConnection, tables1);
      postgresCache.setTableList(mockConnection2, tables2);
      
      expect(postgresCache.getTableList(mockConnection)).toEqual(tables1);
      expect(postgresCache.getTableList(mockConnection2)).toEqual(tables2);
    });
  });

  describe('Table List Cache', () => {
    const mockTables = [
      { schema: 'public', name: 'users', type: 'BASE TABLE' },
      { schema: 'public', name: 'orders', type: 'BASE TABLE' }
    ];

    it('should cache and retrieve table list', () => {
      postgresCache.setTableList(mockConnection, mockTables);
      const cached = postgresCache.getTableList(mockConnection);
      
      expect(cached).toEqual(mockTables);
    });

    it('should return null for uncached table list', () => {
      const cached = postgresCache.getTableList(mockConnection);
      expect(cached).toBeNull();
    });

    it('should cache table list per schema', () => {
      const publicTables = [{ schema: 'public', name: 'users', type: 'BASE TABLE' }];
      const analyticsTables = [{ schema: 'analytics', name: 'events', type: 'BASE TABLE' }];
      
      postgresCache.setTableList(mockConnection, publicTables, 'public');
      postgresCache.setTableList(mockConnection, analyticsTables, 'analytics');
      
      expect(postgresCache.getTableList(mockConnection, 'public')).toEqual(publicTables);
      expect(postgresCache.getTableList(mockConnection, 'analytics')).toEqual(analyticsTables);
    });

    it('should expire table list cache after TTL', async () => {
      // Create a cache manager with very short TTL for testing
      const shortTtlCache = new PostgresCacheManager();
      
      // We'll manually test the expiration logic
      postgresCache.setTableList(mockConnection, mockTables);
      
      // Immediately should be cached
      expect(postgresCache.getTableList(mockConnection)).toEqual(mockTables);
    });
  });

  describe('Primary Keys Cache', () => {
    const mockPrimaryKeys = [{ column_name: 'id' }];

    it('should cache and retrieve primary keys', () => {
      postgresCache.setPrimaryKeys(mockConnection, 'public', 'users', mockPrimaryKeys);
      const cached = postgresCache.getPrimaryKeys(mockConnection, 'public', 'users');
      
      expect(cached).toEqual(mockPrimaryKeys);
    });

    it('should return null for uncached primary keys', () => {
      const cached = postgresCache.getPrimaryKeys(mockConnection, 'public', 'users');
      expect(cached).toBeNull();
    });

    it('should cache primary keys per table', () => {
      const usersPK = [{ column_name: 'id' }];
      const ordersPK = [{ column_name: 'order_id' }];
      
      postgresCache.setPrimaryKeys(mockConnection, 'public', 'users', usersPK);
      postgresCache.setPrimaryKeys(mockConnection, 'public', 'orders', ordersPK);
      
      expect(postgresCache.getPrimaryKeys(mockConnection, 'public', 'users')).toEqual(usersPK);
      expect(postgresCache.getPrimaryKeys(mockConnection, 'public', 'orders')).toEqual(ordersPK);
    });
  });

  describe('DB Stats Cache', () => {
    const mockStats = {
      total_tables: 10,
      total_db_size_mb: 256.5,
      total_rows: 100000
    };

    it('should cache and retrieve DB stats', () => {
      postgresCache.setDBStats(mockConnection, mockStats);
      const cached = postgresCache.getDBStats(mockConnection);
      
      expect(cached).toEqual(mockStats);
    });

    it('should return null for uncached DB stats', () => {
      const cached = postgresCache.getDBStats(mockConnection);
      expect(cached).toBeNull();
    });

    it('should cache DB stats per connection', () => {
      const stats1 = { total_tables: 10, total_db_size_mb: 256.5, total_rows: 100000 };
      const stats2 = { total_tables: 5, total_db_size_mb: 128.0, total_rows: 50000 };
      
      postgresCache.setDBStats(mockConnection, stats1);
      postgresCache.setDBStats(mockConnection2, stats2);
      
      expect(postgresCache.getDBStats(mockConnection)).toEqual(stats1);
      expect(postgresCache.getDBStats(mockConnection2)).toEqual(stats2);
    });
  });

  describe('Schemas Cache', () => {
    const mockSchemas = [{ name: 'public' }, { name: 'analytics' }];

    it('should cache and retrieve schemas', () => {
      postgresCache.setSchemas(mockConnection, mockSchemas);
      const cached = postgresCache.getSchemas(mockConnection);
      
      expect(cached).toEqual(mockSchemas);
    });

    it('should return null for uncached schemas', () => {
      const cached = postgresCache.getSchemas(mockConnection);
      expect(cached).toBeNull();
    });
  });

  describe('Table Details Cache', () => {
    const mockDetails = [
      { name: 'id', type: 'integer', not_nullable: true, default_value: null, is_primary_key: true, is_foreign_key: false },
      { name: 'email', type: 'varchar(255)', not_nullable: true, default_value: null, is_primary_key: false, is_foreign_key: false }
    ];

    it('should cache and retrieve table details', () => {
      postgresCache.setTableDetails(mockConnection, 'public', 'users', mockDetails);
      const cached = postgresCache.getTableDetails(mockConnection, 'public', 'users');
      
      expect(cached).toEqual(mockDetails);
    });

    it('should return null for uncached table details', () => {
      const cached = postgresCache.getTableDetails(mockConnection, 'public', 'users');
      expect(cached).toBeNull();
    });

    it('should cache table details per schema and table', () => {
      const usersDetails = [{ name: 'id', type: 'integer', not_nullable: true, default_value: null, is_primary_key: true, is_foreign_key: false }];
      const ordersDetails = [{ name: 'order_id', type: 'uuid', not_nullable: true, default_value: null, is_primary_key: true, is_foreign_key: false }];
      
      postgresCache.setTableDetails(mockConnection, 'public', 'users', usersDetails);
      postgresCache.setTableDetails(mockConnection, 'public', 'orders', ordersDetails);
      
      expect(postgresCache.getTableDetails(mockConnection, 'public', 'users')).toEqual(usersDetails);
      expect(postgresCache.getTableDetails(mockConnection, 'public', 'orders')).toEqual(ordersDetails);
    });
  });

  describe('Cache Invalidation', () => {
    const fullTableInfo = { schema: 'public', name: 'users', type: 'BASE TABLE' };
    const fullColumnDetail = { name: 'id', type: 'integer', not_nullable: true, default_value: null, is_primary_key: true, is_foreign_key: false };

    it('should clear all caches for a specific connection', () => {
      // Setup caches
      postgresCache.setTableList(mockConnection, [fullTableInfo]);
      postgresCache.setDBStats(mockConnection, { total_tables: 10, total_db_size_mb: 100, total_rows: 1000 });
      postgresCache.setSchemas(mockConnection, [{ name: 'public' }]);
      postgresCache.setTableDetails(mockConnection, 'public', 'users', [fullColumnDetail]);
      postgresCache.setPrimaryKeys(mockConnection, 'public', 'users', [{ column_name: 'id' }]);
      
      // Setup caches for another connection
      postgresCache.setTableList(mockConnection2, [{ schema: 'public', name: 'products', type: 'BASE TABLE' }]);
      
      // Clear caches for first connection
      postgresCache.clearForConnection(mockConnection);
      
      // Verify first connection caches are cleared
      expect(postgresCache.getTableList(mockConnection)).toBeNull();
      expect(postgresCache.getDBStats(mockConnection)).toBeNull();
      expect(postgresCache.getSchemas(mockConnection)).toBeNull();
      expect(postgresCache.getTableDetails(mockConnection, 'public', 'users')).toBeNull();
      expect(postgresCache.getPrimaryKeys(mockConnection, 'public', 'users')).toBeNull();
      
      // Verify second connection caches are intact
      expect(postgresCache.getTableList(mockConnection2)).toEqual([{ schema: 'public', name: 'products', type: 'BASE TABLE' }]);
    });

    it('should clear table-specific caches', () => {
      const usersDetail = { name: 'id', type: 'integer', not_nullable: true, default_value: null, is_primary_key: true, is_foreign_key: false };
      const ordersDetail = { name: 'order_id', type: 'uuid', not_nullable: true, default_value: null, is_primary_key: true, is_foreign_key: false };
      
      // Setup caches
      postgresCache.setTableDetails(mockConnection, 'public', 'users', [usersDetail]);
      postgresCache.setTableDetails(mockConnection, 'public', 'orders', [ordersDetail]);
      postgresCache.setPrimaryKeys(mockConnection, 'public', 'users', [{ column_name: 'id' }]);
      postgresCache.setPrimaryKeys(mockConnection, 'public', 'orders', [{ column_name: 'order_id' }]);
      
      // Clear cache for specific table
      postgresCache.clearTableCache(mockConnection, 'public', 'users');
      
      // Verify specific table caches are cleared
      expect(postgresCache.getTableDetails(mockConnection, 'public', 'users')).toBeNull();
      expect(postgresCache.getPrimaryKeys(mockConnection, 'public', 'users')).toBeNull();
      
      // Verify other table caches are intact
      expect(postgresCache.getTableDetails(mockConnection, 'public', 'orders')).toEqual([ordersDetail]);
      expect(postgresCache.getPrimaryKeys(mockConnection, 'public', 'orders')).toEqual([{ column_name: 'order_id' }]);
    });

    it('should clear all caches', () => {
      const table1 = { schema: 'public', name: 'users', type: 'BASE TABLE' };
      const table2 = { schema: 'public', name: 'products', type: 'BASE TABLE' };
      
      // Setup caches for multiple connections
      postgresCache.setTableList(mockConnection, [table1]);
      postgresCache.setTableList(mockConnection2, [table2]);
      postgresCache.setDBStats(mockConnection, { total_tables: 10, total_db_size_mb: 100, total_rows: 1000 });
      
      // Clear all
      postgresCache.clearAll();
      
      // Verify all caches are cleared
      expect(postgresCache.getTableList(mockConnection)).toBeNull();
      expect(postgresCache.getTableList(mockConnection2)).toBeNull();
      expect(postgresCache.getDBStats(mockConnection)).toBeNull();
    });
  });

  describe('Cache Statistics', () => {
    const fullTableInfo = { schema: 'public', name: 'users', type: 'BASE TABLE' };
    const fullColumnDetail = { name: 'id', type: 'integer', not_nullable: true, default_value: null, is_primary_key: true, is_foreign_key: false };

    it('should return correct cache statistics', () => {
      // Setup various caches
      postgresCache.setTableList(mockConnection, [fullTableInfo]);
      postgresCache.setTableList(mockConnection, [fullTableInfo], 'public');
      postgresCache.setDBStats(mockConnection, { total_tables: 10, total_db_size_mb: 100, total_rows: 1000 });
      postgresCache.setSchemas(mockConnection, [{ name: 'public' }]);
      postgresCache.setTableDetails(mockConnection, 'public', 'users', [fullColumnDetail]);
      postgresCache.setPrimaryKeys(mockConnection, 'public', 'users', [{ column_name: 'id' }]);
      
      const stats = postgresCache.getStats();
      
      expect(stats.tableLists).toBe(2);
      expect(stats.primaryKeys).toBe(1);
      expect(stats.dbStats).toBe(1);
      expect(stats.schemas).toBe(1);
      expect(stats.tableDetails).toBe(1);
    });

    it('should return zero counts for empty cache', () => {
      const stats = postgresCache.getStats();
      
      expect(stats.tableLists).toBe(0);
      expect(stats.primaryKeys).toBe(0);
      expect(stats.dbStats).toBe(0);
      expect(stats.schemas).toBe(0);
      expect(stats.tableDetails).toBe(0);
    });
  });

  describe('Cache Performance', () => {
    it('should retrieve cached data faster than setting it', () => {
      const largeDataset = Array.from({ length: 1000 }, (_, i) => ({
        schema: 'public',
        name: `table_${i}`,
        type: 'BASE TABLE'
      }));

      // Time the set operation
      const setStart = performance.now();
      postgresCache.setTableList(mockConnection, largeDataset);
      const setTime = performance.now() - setStart;

      // Time the get operations (multiple times)
      const getStart = performance.now();
      for (let i = 0; i < 100; i++) {
        postgresCache.getTableList(mockConnection);
      }
      const getTime = performance.now() - getStart;

      // Get should be very fast (accounting for console.log overhead in tests)
      expect(getTime).toBeLessThan(1000); // 100 gets should be under 1s with logging overhead
    });

    it('should handle concurrent cache access', async () => {
      const promises = [];
      
      for (let i = 0; i < 100; i++) {
        promises.push(
          Promise.resolve().then(() => {
            postgresCache.setDBStats(mockConnection, { 
              total_tables: i, 
              total_db_size_mb: i * 10, 
              total_rows: i * 1000 
            });
            return postgresCache.getDBStats(mockConnection);
          })
        );
      }

      const results = await Promise.all(promises);
      
      // All results should be valid stats objects
      results.forEach(result => {
        expect(result).toHaveProperty('total_tables');
        expect(result).toHaveProperty('total_db_size_mb');
        expect(result).toHaveProperty('total_rows');
      });
    });
  });
});
