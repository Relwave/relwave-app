import { useState, useEffect } from "react";
import { toast } from "sonner";
import { bridgeApi, type DatabaseConnection } from "@/services/bridgeApi";
import { startBridgeListeners, stopBridgeListeners, isBridgeReady } from "@/services/bridgeClient";
import DashboardContent from "@/components/DashboardContent";
import BridgeNotInitLoader from "@/components/bridge/BridgeNotInitLoader";
import BridgeFailed from "@/components/bridge/BridgeFailed";
import Header from "@/components/Header";

// Type for database stats
interface DatabaseStats {
  total_tables: string;
  total_db_size: string;
  total_db_size_mb: string;
}

const Index = () => {
  const [searchQuery, setSearchQuery] = useState("");
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [databases, setDatabases] = useState<DatabaseConnection[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [bridgeReady, setBridgeReady] = useState(false);
  const [statsLoading, setStatsLoading] = useState(false);
  const [databaseStats, setDatabaseStats] = useState<Record<string, DatabaseStats>>({});
  const [formData, setFormData] = useState({
    name: "",
    type: "",
    host: "",
    port: "",
    user: "",
    password: "",
    database: "",
    sslmode: "",
    ssl: false
  });

  // Initialize bridge listeners on mount
  useEffect(() => {
    const initBridge = async () => {
      try {
        await startBridgeListeners();

        // Listen for bridge.ready notification
        const handleBridgeReady = () => {
          console.log('Bridge ready event received');
          setBridgeReady(true);
          loadDatabases();
        };

        window.addEventListener('bridge:bridge.ready', handleBridgeReady);

        // Check if bridge is already ready
        if (isBridgeReady()) {
          setBridgeReady(true);
          loadDatabases();
        }

        return () => {
          window.removeEventListener('bridge:bridge.ready', handleBridgeReady);
          stopBridgeListeners();
        };
      } catch (error: any) {
        console.error('Failed to initialize bridge:', error);
        toast.error("Failed to connect to database bridge", {
          description: error.message
        });
        setLoading(false);
      }
    };

    initBridge();
  }, []);

  const loadDatabases = async () => {
    if (!isBridgeReady()) {
      console.warn('Bridge not ready, skipping database load');
      return;
    }

    try {
      setLoading(true);
      const startTime = performance.now();

      // Load databases list first - this should be fast
      const dbs = await bridgeApi.listDatabases();
      const dbLoadTime = performance.now() - startTime;
      console.log(`Loaded ${dbs.length} databases in ${dbLoadTime.toFixed(0)}ms`);

      setDatabases(dbs);
      setLoading(false); // Show databases immediately

      // Load stats in the background - don't block UI
      if (dbs.length > 0) {
        loadDatabasesStats(dbs);
      }
    } catch (error: any) {
      console.error('Failed to load databases:', error);
      toast.error("Failed to load databases", {
        description: error.message
      });
      setLoading(false);
    }
  };

  const loadDatabasesStats = async (dbs?: DatabaseConnection[]) => {
    const databasesToLoad = dbs || databases;

    if (!isBridgeReady() || databasesToLoad.length === 0) {
      console.warn('Bridge not ready or no databases to load stats for');
      return;
    }

    setStatsLoading(true);
    const startTime = performance.now();

    // Helper to normalize various API shapes into DatabaseStats
    const normalizeStats = (raw: any): DatabaseStats | null => {
      if (!raw) return null;

      // If API returns an array, prefer the first item
      const item = Array.isArray(raw) ? raw[0] : raw;

      if (typeof item !== "object") return null;

      const total_tables = item.total_tables ?? item.totalTables ?? item.tables;
      const total_db_size = item.total_db_size ?? item.totalDbSize ?? item.data_size;
      const total_db_size_mb = item.total_db_size_mb ?? item.totalDbSizeMb ?? item.data_size_mb;

      if (total_tables == null || total_db_size == null || total_db_size_mb == null) {
        return null;
      }

      return {
        total_tables: String(total_tables),
        total_db_size: String(total_db_size),
        total_db_size_mb: String(total_db_size_mb),
      };
    };

    try {
      console.log(`Loading stats for ${databasesToLoad.length} databases...`);

      // Fetch stats for all databases in parallel with error handling
      const statsPromises = databasesToLoad.map(async (db) => {
        try {
          const stats = await bridgeApi.getDatabaseStats(db.id);
          return { id: db.id, stats, error: null };
        } catch (error) {
          console.error(`Failed to load stats for ${db.name}:`, error);
          return { id: db.id, stats: null, error };
        }
      });

      const results = await Promise.all(statsPromises);
      const elapsed = performance.now() - startTime;

      // Count successes and failures
      const successful = results.filter(r => r.stats !== null).length;
      const failed = results.length - successful;
      console.log(
        `Stats loaded in ${elapsed.toFixed(0)}ms: ${successful} successful, ${failed} failed`
      );

      // Update stats state incrementally
      const statsMap: Record<string, DatabaseStats> = {};
      results.forEach(({ id, stats }) => {
        const normalized = normalizeStats(stats);
        if (normalized) {
          statsMap[id] = normalized;
        }
      });

      setDatabaseStats(statsMap);

      if (failed > 0) {
        toast.warning(`Could not load stats for ${failed} database(s)`, {
          description: "Some statistics may be unavailable"
        });
      }
    } catch (error) {
      console.error('Failed to load database stats:', error);
      toast.error("Failed to load database statistics", {
        description: "Statistics will be unavailable"
      });
    } finally {
      setStatsLoading(false);
    }
  };

  const handleRefresh = async () => {
    setRefreshing(true);
    await loadDatabases();
    setRefreshing(false);
    toast.success("Databases refreshed");
  };

  const filteredDatabases = databases.filter((db) =>
    db.name.toLowerCase().includes(searchQuery.toLowerCase())
  );

  const handleInputChange = (field: string, value: string) => {
    setFormData(prev => ({ ...prev, [field]: value }));
  };

  const handleAddDatabase = async () => {
    // Validate required fields
    const required = ["name", "type", "host", "port", "user", "database"];
    const missing = required.filter(field => !formData[field as keyof typeof formData]);

    if (missing.length > 0) {
      toast.error("Missing required fields", {
        description: `Please fill in: ${missing.join(", ")}`
      });
      return;
    }

    try {
      const newDb = await bridgeApi.addDatabase({
        name: formData.name,
        type: formData.type,
        host: formData.host,
        port: parseInt(formData.port),
        user: formData.user,
        ssl: formData.ssl,
        sslmode: formData.ssl ? (formData.sslmode || 'require') : 'disable',
        password: formData.password,
        database: formData.database
      });

      toast.success("Database connection added successfully", {
        description: `${newDb.name} is now available.`
      });

      // Reset form
      setFormData({
        name: "",
        type: "",
        host: "",
        port: "",
        user: "",
        password: "",
        database: "",
        sslmode: "",
        ssl: false
      });

      setIsDialogOpen(false);
      await loadDatabases();
    } catch (error: any) {
      toast.error("Failed to add database", {
        description: error.message
      });
    }
  };

  const handleDeleteDatabase = async (id: string, name: string) => {
    try {
      await bridgeApi.deleteDatabase(id);
      toast.success("Database connection removed", {
        description: `${name} has been deleted.`
      });
      await loadDatabases();
    } catch (error: any) {
      toast.error("Failed to delete database", {
        description: error.message
      });
    }
  };

  const handleTestConnection = async (id: string, name: string) => {
    try {
      const result = await bridgeApi.testConnection(id);
      if (result.ok) {
        toast.success("Connection successful", {
          description: `Successfully connected to ${name}`
        });
      } else {
        toast.error("Connection failed", {
          description: result.message || "Could not connect to database"
        });
      }
    } catch (error: any) {
      toast.error("Connection test failed", {
        description: error.message
      });
    }
  };

  // Calculate aggregate stats
  const connectedCount = databases.length;
  const totalTables = Object.values(databaseStats).reduce((sum, stats) => {
    return sum + parseInt(stats.total_tables || '0');
  }, 0);
  const totalSizeMB = Object.values(databaseStats).reduce((sum, stats) => {
    return sum + parseFloat(stats.total_db_size_mb || '0');
  }, 0);
  const totalSize = totalSizeMB > 1024
    ? `${(totalSizeMB / 1024).toFixed(2)} GB`
    : `${totalSizeMB.toFixed(2)} MB`;

  // Show bridge initialization status
  if (!bridgeReady && loading) {
    return (
      <BridgeNotInitLoader />
    );
  }

  // Show error if bridge failed to initialize
  if (!bridgeReady && !loading) {
    return (
      <BridgeFailed />
    );
  }

  return (
    <div className="min-h-screen flex flex-col bg-background dark:bg-[#050505] text-foreground overflow-hidden">
      <Header
        refreshing={refreshing}
        handleRefresh={handleRefresh}
        isDialogOpen={isDialogOpen}
        setIsDialogOpen={setIsDialogOpen}
        formData={formData}
        handleInputChange={handleInputChange}
        setFormData={setFormData}
        handleAddDatabase={handleAddDatabase}
      />

      <DashboardContent
        databases={databases}
        loading={loading}
        searchQuery={searchQuery}
        setSearchQuery={setSearchQuery}
        handleDeleteDatabase={handleDeleteDatabase}
        handleTestConnection={handleTestConnection}
        connectedCount={connectedCount}
        totalTables={totalTables}
        totalSize={totalSize}
        filteredDatabases={filteredDatabases}
        setIsDialogOpen={setIsDialogOpen}
        statsLoading={statsLoading}
      />
    </div>
  );
};

export default Index;