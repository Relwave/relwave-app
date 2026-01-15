import { useState } from "react";
import { toast } from "sonner";
import { useNavigate } from "react-router-dom";
import { bridgeApi } from "@/services/bridgeApi";
import { useBridgeQuery } from "@/hooks/useBridgeQuery";
import {
  useDatabases,
  useAddDatabase,
  useDeleteDatabase,
  usePrefetch
} from "@/hooks/useDbQueries";
import {
  useCachedConnectionStatus,
  useCachedTotalStats,
  useCachedDbStats,
} from "@/hooks/useCachedData";
import BridgeLoader from "@/components/feedback/BridgeLoader";
import BridgeFailed from "@/components/feedback/BridgeFailed";
import VerticalIconBar from "@/components/common/VerticalIconBar";
import { bytesToMBString } from "@/lib/bytesToMB";
import { useQuery } from "@tanstack/react-query";
import {
  ConnectionList,
  DatabaseDetail,
  WelcomeView,
  AddConnectionDialog,
  DeleteDialog,
  REQUIRED_FIELDS,
  ConnectionFormData,
} from "@/components/home";

const Index = () => {
  const navigate = useNavigate();
  const { data: bridgeReady, isLoading: bridgeLoading } = useBridgeQuery();

  // Caching hooks - load cached data instantly
  const { cachedStatus, updateCache: updateStatusCache } = useCachedConnectionStatus();
  const { cachedStats, updateCache: updateStatsCache } = useCachedTotalStats();
  const { getStats: getCachedDbStats, updateCache: updateDbStatsCache } = useCachedDbStats();

  const { data: databases = [], isLoading: loading, refetch: refetchDatabases } = useDatabases();

  const { data: stats, isLoading: statsLoading, refetch: refetchStats } = useQuery({
    queryKey: ["totalStats"],
    queryFn: async () => {
      const result = await bridgeApi.getTotalDatabaseStats();
      // Update cache when fresh data arrives
      if (result) updateStatsCache(result);
      return result;
    },
    enabled: !!bridgeReady && databases.length > 0,
    staleTime: 30 * 1000,
  });

  const { data: statusData, isLoading: statusLoading, refetch: refetchStatus } = useQuery({
    queryKey: ["connectionStatus"],
    queryFn: async () => {
      const res = await bridgeApi.testAllConnections();
      const statusMap = new Map<string, string>();
      res.forEach((r) => statusMap.set(r.id, r.result.status));
      // Update cache when fresh data arrives
      updateStatusCache(statusMap);
      return statusMap;
    },
    enabled: !!bridgeReady,
    staleTime: 60 * 1000,
  });

  const addDatabaseMutation = useAddDatabase();
  const deleteDatabaseMutation = useDeleteDatabase();
  const { prefetchTables, prefetchStats } = usePrefetch();

  const [searchQuery, setSearchQuery] = useState("");
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [dbToDelete, setDbToDelete] = useState<{ id: string; name: string } | null>(null);
  const [selectedDb, setSelectedDb] = useState<string | null>(null);

  // Use fresh data if available, fall back to cached data
  const status = statusData || cachedStatus;
  const effectiveStats = stats || cachedStats;
  const totalSize = effectiveStats?.sizeBytes ? bytesToMBString(effectiveStats.sizeBytes) : "—";
  const totalTables = effectiveStats?.tables ?? "—";
  const connectedCount = [...status.values()].filter(s => s === "connected").length;

  // Show loading state only if we have no cached data
  const showStatsLoading = statsLoading && !cachedStats;
  const showStatusLoading = statusLoading && cachedStatus.size === 0;

  // Fetch stats for the selected database
  const { data: selectedDbStats, isLoading: selectedDbStatsLoading } = useQuery({
    queryKey: ["dbStats", selectedDb],
    queryFn: async () => {
      const result = await bridgeApi.getDataBaseStats(selectedDb!);
      // Update cache when fresh data arrives
      if (result && selectedDb) updateDbStatsCache(selectedDb, result);
      return result;
    },
    enabled: !!bridgeReady && !!selectedDb && status.get(selectedDb) === "connected",
    staleTime: 30 * 1000,
  });

  // Get cached stats for selected db
  const cachedSelectedDbStats = selectedDb ? getCachedDbStats(selectedDb) : undefined;
  const effectiveSelectedDbStats = selectedDbStats || cachedSelectedDbStats;

  const recentDatabases = [...databases]
    .filter(db => db.lastAccessedAt)
    .sort((a, b) => new Date(b.lastAccessedAt!).getTime() - new Date(a.lastAccessedAt!).getTime())
    .slice(0, 5);

  const filteredDatabases = databases.filter(db =>
    db.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
    db.host.toLowerCase().includes(searchQuery.toLowerCase())
  );



  const handleAddDatabase = async (formData: ConnectionFormData) => {
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
      toast.success("Database connection added");
      setIsDialogOpen(false);
      await Promise.all([refetchStats(), refetchStatus()]);
    } catch (err: any) {
      toast.error("Failed to add database", { description: err.message });
    }
  };

  const handleDeleteDatabase = async () => {
    if (!dbToDelete) return;
    try {
      await deleteDatabaseMutation.mutateAsync(dbToDelete.id);
      toast.success("Database removed");
      setDeleteDialogOpen(false);
      setDbToDelete(null);
      if (selectedDb === dbToDelete.id) setSelectedDb(null);
      refetchStats();
    } catch (err: any) {
      toast.error("Failed to delete", { description: err.message });
    }
  };

  const handleTestConnection = async (id: string, name: string) => {
    const result = await bridgeApi.testConnection(id);
    if (result.ok) {
      toast.success("Connected", { description: name });
      refetchStatus();
    } else {
      toast.error("Failed", { description: result.message || "Could not connect" });
    }
  };

  const handleDatabaseClick = (dbId: string) => {
    bridgeApi.touchDatabase(dbId);
    navigate(`/${dbId}`);
  };

  const handleDatabaseHover = (dbId: string) => {
    prefetchTables(dbId);
    prefetchStats(dbId);
  };

  // Loading states
  if (bridgeLoading || bridgeReady === undefined) return <BridgeLoader />;
  if (!bridgeReady) return <BridgeFailed />;

  const selectedDatabase = selectedDb ? databases.find(db => db.id === selectedDb) : null;
  const isSelectedConnected = selectedDb ? status.get(selectedDb) === "connected" : false;

  return (
    <div className="h-[calc(100vh-32px)] flex bg-background text-foreground overflow-hidden">
      <VerticalIconBar />
      <main className="flex-1 ml-[60px] flex">
        {/* Left Panel - Database List */}
        <ConnectionList
          databases={databases}
          filteredDatabases={filteredDatabases}
          loading={loading}
          searchQuery={searchQuery}
          setSearchQuery={setSearchQuery}
          selectedDb={selectedDb}
          setSelectedDb={setSelectedDb}
          status={status}
          connectedCount={connectedCount}
          totalTables={totalTables}
          statsLoading={showStatsLoading}
          onAddClick={() => setIsDialogOpen(true)}
          onDatabaseHover={handleDatabaseHover}
          onDelete={(dbId, dbName) => {
            setDbToDelete({ id: dbId, name: dbName });
            setDeleteDialogOpen(true);
          }}
          onTest={handleTestConnection}
        />

        {/* Right Panel - Main Content */}
        <div className="flex-1 overflow-y-auto">
          {selectedDatabase ? (
            <DatabaseDetail
              database={selectedDatabase}
              isConnected={isSelectedConnected}
              tables={(selectedDbStatsLoading && !cachedSelectedDbStats) ? "—" : effectiveSelectedDbStats?.tables ?? "—"}
              size={(selectedDbStatsLoading && !cachedSelectedDbStats) ? "—" : effectiveSelectedDbStats?.sizeBytes ? bytesToMBString(effectiveSelectedDbStats.sizeBytes) : "—"}
              onTest={() => handleTestConnection(selectedDatabase.id, selectedDatabase.name)}
              onOpen={() => handleDatabaseClick(selectedDatabase.id)}
              onDelete={() => {
                setDbToDelete({ id: selectedDatabase.id, name: selectedDatabase.name });
                setDeleteDialogOpen(true);
              }}
            />
          ) : (
            <WelcomeView
              databases={databases}
              recentDatabases={recentDatabases}
              status={status}
              connectedCount={connectedCount}
              totalTables={totalTables}
              totalSize={totalSize}
              statsLoading={showStatsLoading}
              onAddClick={() => setIsDialogOpen(true)}
              onSelectDb={setSelectedDb}
              onDatabaseClick={handleDatabaseClick}
              onDatabaseHover={handleDatabaseHover}
            />
          )}
        </div>
      </main>

      {/* Add Database Dialog */}
      <AddConnectionDialog
        open={isDialogOpen}
        onOpenChange={setIsDialogOpen}
        onSubmit={(formData) => handleAddDatabase(formData)}
        isLoading={addDatabaseMutation.isPending}
      />

      {/* Delete Dialog */}
      <DeleteDialog
        open={deleteDialogOpen}
        onOpenChange={setDeleteDialogOpen}
        databaseName={dbToDelete?.name}
        onConfirm={handleDeleteDatabase}
      />
    </div>
  );
};

export default Index;
