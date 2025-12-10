import { useState, useEffect, useCallback } from "react";
import { toast } from "sonner";
import { bridgeApi, type DatabaseConnection } from "@/services/bridgeApi";
import { useBridgeQuery } from "@/hooks/useBridgeQuery";
import DashboardContent from "@/components/DashboardContent";
import BridgeNotInitLoader from "@/components/bridge/BridgeNotInitLoader";
import BridgeFailed from "@/components/bridge/BridgeFailed";
import Header from "@/components/header";
import { bytesToMBString } from "@/lib/bytesToMB";

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
  const { data: bridgeReady, isLoading: bridgeLoading, error: bridgeError } = useBridgeQuery();

  const [searchQuery, setSearchQuery] = useState("");
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [databases, setDatabases] = useState<DatabaseConnection[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [statsLoading, setStatsLoading] = useState(false);
  const [stats, setStats] = useState({ totalRows: 0, size: 0, totalTables: 0 });
  const [formData, setFormData] = useState(INITIAL_FORM_DATA);

  // --- Load databases ---
  const loadDatabases = useCallback(async () => {
    if (!bridgeReady) return;

    try {
      setLoading(true);
      const dbs = await bridgeApi.listDatabases();
      setDatabases(dbs);

      if (dbs.length > 0) await loadDatabaseStats();
    } catch (err: any) {
      console.error("Failed to load databases:", err);
      toast.error("Failed to load databases", { description: err.message });
    } finally {
      setLoading(false);
    }
  }, [bridgeReady]);

  // --- Load stats ---
  const loadDatabaseStats = useCallback(async () => {
    try {
      setStatsLoading(true);
      const res = await bridgeApi.getTotalDatabaseStats();
      if (res) {
        setStats({ totalRows: res.rows, size: res.sizeBytes, totalTables: res.tables });
      }
    } catch (err) {
      console.error("Failed to load stats:", err);
    } finally {
      setStatsLoading(false);
    }
  }, []);

  // --- Effects ---
  useEffect(() => {
    if (!bridgeReady) return;  // <-- don't fetch yet
    loadDatabases();
  }, [bridgeReady]);


  // --- Refresh handler ---
  const handleRefresh = async () => {
    setRefreshing(true);
    await loadDatabases();
    setRefreshing(false);
    toast.success("Databases refreshed");
  };

  // --- Form handlers ---
  const handleInputChange = (field: string, value: string) => {
    setFormData(prev => ({ ...prev, [field]: value }));
  };

  const handleAddDatabase = async () => {
    const missing = REQUIRED_FIELDS.filter(field => !formData[field as keyof typeof formData]);
    if (missing.length) {
      toast.error("Missing required fields", { description: `Please fill in: ${missing.join(", ")}` });
      return;
    }

    try {
      const newDb = await bridgeApi.addDatabase({
        ...formData,
        port: parseInt(formData.port),
        sslmode: formData.ssl ? (formData.sslmode || "require") : "disable"
      });

      toast.success("Database connection added successfully", { description: `${newDb.name} is now available.` });
      setFormData(INITIAL_FORM_DATA);
      setIsDialogOpen(false);
      await loadDatabases();
    } catch (err: any) {
      toast.error("Failed to add database", { description: err.message });
    }
  };

  // --- Database actions ---
  const handleDeleteDatabase = async (id: string, name: string) => {
    try {
      await bridgeApi.deleteDatabase(id);
      toast.success("Database connection removed", { description: `${name} has been deleted.` });
      await loadDatabases();
    } catch (err: any) {
      toast.error("Failed to delete database", { description: err.message });
    }
  };

  const handleTestConnection = async (id: string, name: string) => {
    try {
      const result = await bridgeApi.testConnection(id);
      if (result.ok) {
        toast.success("Connection successful", { description: `Successfully connected to ${name}` });
      } else {
        toast.error("Connection failed", { description: result.message || "Could not connect to database" });
      }
    } catch (err: any) {
      toast.error("Connection test failed", { description: err.message });
    }
  };

  const filteredDatabases = databases.filter(db =>
    db.name.toLowerCase().includes(searchQuery.toLowerCase())
  );

  // --- Render based on bridge state ---
  if (bridgeLoading) return <BridgeNotInitLoader />;
  if (!bridgeReady) return <BridgeFailed />;

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
