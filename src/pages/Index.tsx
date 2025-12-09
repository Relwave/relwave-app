import { useState, useEffect } from "react";
import { toast } from "sonner";
import { bridgeApi, type DatabaseConnection } from "@/services/bridgeApi";
import { startBridgeListeners, stopBridgeListeners, isBridgeReady } from "@/services/bridgeClient";
import DashboardContent from "@/components/DashboardContent";
import BridgeNotInitLoader from "@/components/bridge/BridgeNotInitLoader";
import BridgeFailed from "@/components/bridge/BridgeFailed";
import Header from "@/components/header";
import { bytesToMBString } from "@/lib/bytesToMb";

const INITIAL_FORM_DATA = {
  name: "",
  type: "",
  host: "",
  port: "",
  user: "",
  password: "",
  database: "",
  sslmode: "",
  ssl: false
};

const REQUIRED_FIELDS = ["name", "type", "host", "port", "user", "database"];

const Index = () => {
  const [searchQuery, setSearchQuery] = useState("");
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [databases, setDatabases] = useState<DatabaseConnection[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [bridgeReady, setBridgeReady] = useState(false);
  const [statsLoading, setStatsLoading] = useState(false);
  const [stats, setStats] = useState({
    totalRows: 0,
    size: 0,
    totalTables: 0
  });
  const [formData, setFormData] = useState(INITIAL_FORM_DATA);

  useEffect(() => {
    let cleanup: (() => void) | undefined;

    const initBridge = async () => {
      try {
        await startBridgeListeners();

        const handleBridgeReady = () => {
          console.log('Bridge ready event received');
          setBridgeReady(true);
          loadDatabases();
        };

        window.addEventListener('bridge:bridge.ready', handleBridgeReady);

        if (isBridgeReady()) {
          setBridgeReady(true);
          loadDatabases();
        }

        cleanup = () => {
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
    return () => cleanup?.();
  }, []);

  const loadDatabases = async () => {
    if (!isBridgeReady()) {
      console.warn('Bridge not ready, skipping database load');
      return;
    }

    try {
      setLoading(true);
      const startTime = performance.now();
      const dbs = await bridgeApi.listDatabases();
      const dbLoadTime = performance.now() - startTime;
      console.log(`Loaded ${dbs.length} databases in ${dbLoadTime.toFixed(0)}ms`);

      setDatabases(dbs);

      if (dbs.length > 0) {
        await loadDatabaseStats();
      }
    } catch (error: any) {
      console.error('Failed to load databases:', error);
      toast.error("Failed to load databases", {
        description: error.message
      });
    } finally {
      setLoading(false);
    }
  };

  const loadDatabaseStats = async () => {
    try {
      setStatsLoading(true);
      const res = await bridgeApi.getTotalDatabaseStats();

      if (res) {
        setStats({
          totalRows: res.rows,
          size: res.sizeBytes,
          totalTables: res.tables
        });
      }
    } catch (error) {
      console.error('Failed to load stats:', error);
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

  const handleInputChange = (field: string, value: string) => {
    setFormData(prev => ({ ...prev, [field]: value }));
  };

  const handleAddDatabase = async () => {
    const missing = REQUIRED_FIELDS.filter(field => !formData[field as keyof typeof formData]);

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

      setFormData(INITIAL_FORM_DATA);
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



  const filteredDatabases = databases.filter((db) =>
    db.name.toLowerCase().includes(searchQuery.toLowerCase())
  );

  if (!bridgeReady && loading) {
    return <BridgeNotInitLoader />;
  }

  if (!bridgeReady && !loading) {
    return <BridgeFailed />;
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
        connectedCount={databases.length}
        totalTables={stats.totalTables}
        totalRows={stats.totalRows}
        totalSize={stats.size > 0 ? bytesToMBString(stats.size) : "0 MB"}
        filteredDatabases={filteredDatabases}
        setIsDialogOpen={setIsDialogOpen}
        statsLoading={statsLoading}
      />
    </div>
  );
};

export default Index;