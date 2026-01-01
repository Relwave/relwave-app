import { useState } from "react";
import { toast } from "sonner";
import { bridgeApi } from "@/services/bridgeApi";
import { useBridgeQuery } from "@/hooks/useBridgeQuery";
import {
  useDatabases,
  useAddDatabase,
  useDeleteDatabase,
  usePrefetch
} from "@/hooks/useDbQueries";
import DashboardContent from "@/components/dashboard/DashboardContent";
import BridgeLoader from "@/components/feedback/BridgeLoader";
import BridgeFailed from "@/components/feedback/BridgeFailed";
import Header from "@/components/common/Header";
import { bytesToMBString } from "@/lib/bytesToMB";
import { useQuery, useQueryClient } from "@tanstack/react-query";

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
  const queryClient = useQueryClient();
  const { data: bridgeReady, isLoading: bridgeLoading } = useBridgeQuery();

  //   React Query: Databases list with caching
  const {
    data: databases = [],
    isLoading: loading,
    refetch: refetchDatabases,
    isRefetching: refreshing
  } = useDatabases();

  //   React Query: Total stats with caching
  const {
    data: stats,
    isLoading: statsLoading,
    refetch: refetchStats
  } = useQuery({
    queryKey: ["totalStats"],
    queryFn: () => bridgeApi.getTotalDatabaseStats(),
    enabled: !!bridgeReady && databases.length > 0,
    staleTime: 30 * 1000, // 30 seconds
  });

  //   React Query: Connection status
  const { data: statusData, refetch: refetchStatus } = useQuery({
    queryKey: ["connectionStatus"],
    queryFn: async () => {
      const res = await bridgeApi.testAllConnections();
      const statusMap = new Map<string, string>();
      res.forEach((r) => statusMap.set(r.id, r.result.status));
      return statusMap;
    },
    enabled: !!bridgeReady,
    staleTime: 60 * 1000, // 1 minute
  });

  //   React Query: Mutations
  const addDatabaseMutation = useAddDatabase();
  const deleteDatabaseMutation = useDeleteDatabase();

  //   Prefetch for better UX
  const { prefetchTables, prefetchStats } = usePrefetch();

  // Local UI state only
  const [searchQuery, setSearchQuery] = useState("");
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [formData, setFormData] = useState(INITIAL_FORM_DATA);

  // Derived state
  const status = statusData || new Map<string, string>();
  const totalRows = stats?.rows || 0;
  const totalSize = stats?.sizeBytes ? bytesToMBString(stats.sizeBytes) : "0 MB";
  const totalTables = stats?.tables || 0;

  // --- Refresh handler ---
  const handleRefresh = async () => {
    await Promise.all([refetchDatabases(), refetchStats(), refetchStatus()]);
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
      await addDatabaseMutation.mutateAsync({
        ...formData,
        port: parseInt(formData.port),
        sslmode: formData.ssl ? (formData.sslmode || "require") : "disable"
      });

      toast.success("Database connection added successfully");
      setFormData(INITIAL_FORM_DATA);
      setIsDialogOpen(false);

      // Refetch stats and connection status after adding database
      await Promise.all([refetchStats(), refetchStatus()]);
    } catch (err: any) {
      toast.error("Failed to add database", { description: err.message });
    }
  };

  // --- Database actions ---
  const handleDeleteDatabase = async (id: string, name: string) => {
    try {
      await deleteDatabaseMutation.mutateAsync(id);
      toast.success("Database connection removed", { description: `${name} has been deleted.` });
      refetchStats();
    } catch (err: any) {
      toast.error("Failed to delete database", { description: err.message });
    }
  };

  const handleTestConnection = async (id: string, name: string) => {
    try {
      const result = await bridgeApi.testConnection(id);
      console.log(result);
      if (result.ok) {
        toast.success("Connection successful", { description: `Successfully connected to ${name}` });
      } else {
        toast.error("Connection failed", { description: result.message || "Could not connect to database" });
      }
    } catch (err: any) {
      toast.error("Connection test failed", { description: err.message });
    }
  };

  // --- Prefetch on hover for faster navigation ---
  const handleDatabaseHover = (dbId: string) => {
    prefetchTables(dbId);
    prefetchStats(dbId);
  };

  const filteredDatabases = databases.filter(db =>
    db.name.toLowerCase().includes(searchQuery.toLowerCase())
  );

  // --- Render based on bridge state ---
  if (bridgeLoading) return <BridgeLoader />;
  if (!bridgeReady) return <BridgeFailed />;

  return (
    <div className="min-h-screen flex flex-col bg-background text-foreground">
      <Header
        refreshing={refreshing || addDatabaseMutation.isPending}
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
        totalTables={totalTables}
        totalRows={totalRows}
        totalSize={totalSize}
        filteredDatabases={filteredDatabases}
        setIsDialogOpen={setIsDialogOpen}
        statsLoading={statsLoading}
        status={status}
        onDatabaseHover={handleDatabaseHover}
      />
    </div>
  );
};

export default Index;