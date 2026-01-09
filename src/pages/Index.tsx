import { useState } from "react";
import { toast } from "sonner";
import { Plus } from "lucide-react";
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
import VerticalIconBar from "@/components/common/VerticalIconBar";
import FloatingActionButton from "@/components/common/FloatingActionButton";
import CommandPalette from "@/components/common/CommandPalette";
import { bytesToMBString } from "@/lib/bytesToMB";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Checkbox } from "@/components/ui/checkbox";
import { Button } from "@/components/ui/button";
import { Database, Link } from "lucide-react";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { parseConnectionUrl } from "@/lib/parseConnectionUrl";

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
  const [commandPaletteOpen, setCommandPaletteOpen] = useState(false);

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
  const [useUrl, setUseUrl] = useState(false);
  const [connectionUrl, setConnectionUrl] = useState("");

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

  // Global keyboard shortcut for command palette
  useState(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key === 'k') {
        e.preventDefault();
        setCommandPaletteOpen(true);
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  });

  // --- Render based on bridge state ---
  // Show loader if bridge is loading OR if bridgeReady is undefined (initial state)
  if (bridgeLoading || bridgeReady === undefined) return <BridgeLoader />;
  if (!bridgeReady) return <BridgeFailed />;

  return (
    <div className="h-[calc(100vh-32px)] flex bg-background text-foreground overflow-hidden">
      <VerticalIconBar />
      <CommandPalette isOpen={commandPaletteOpen} onClose={() => setCommandPaletteOpen(false)} />

      <main className="flex-1 ml-[60px]">
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
      </main>

      <FloatingActionButton
        icon={<Plus className="h-6 w-6" />}
        label="Add New Database"
        onClick={() => setIsDialogOpen(true)}
      />

      {/* Add Database Dialog */}
      <Dialog open={isDialogOpen} onOpenChange={setIsDialogOpen}>
        <DialogContent className="sm:max-w-[480px]">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-base">
              <Database className="h-4 w-4 text-muted-foreground/60" />
              New Database Connection
            </DialogTitle>
            <DialogDescription className="text-xs">
              Connect to a local, Docker, or remote database
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4 py-4">
            {/* Connection Mode Tabs */}
            <Tabs value={useUrl ? "url" : "params"} onValueChange={(v) => setUseUrl(v === "url")}>
              <TabsList className="grid w-full grid-cols-2">
                <TabsTrigger value="params" className="text-xs">Parameters</TabsTrigger>
                <TabsTrigger value="url" className="text-xs">
                  <Link className="h-3 w-3 mr-1" />
                  Connection URL
                </TabsTrigger>
              </TabsList>
            </Tabs>

            {/* URL Input (shown when URL mode) */}
            {useUrl && (
              <div className="space-y-2">
                <Label className="text-xs">Connection URL</Label>
                <Input
                  placeholder="postgres://user:password@localhost:5432/database"
                  value={connectionUrl}
                  onChange={(e) => {
                    const url = e.target.value;
                    setConnectionUrl(url);
                    // Auto-parse and fill form
                    const parsed = parseConnectionUrl(url);
                    if (parsed) {
                      setFormData(prev => ({
                        ...prev,
                        type: parsed.type,
                        host: parsed.host,
                        port: parsed.port,
                        user: parsed.user,
                        password: parsed.password,
                        database: parsed.database,
                        ssl: parsed.ssl,
                        sslmode: parsed.sslmode,
                      }));
                    }
                  }}
                  className="text-sm font-mono"
                />
                <p className="text-xs text-muted-foreground">
                  Example: postgres://user:pass@localhost:5432/mydb?sslmode=require
                </p>
              </div>
            )}

            <div className="space-y-2">
              <Label className="text-xs">Connection Name</Label>
              <Input
                placeholder="My Production DB"
                value={formData.name}
                onChange={(e) => handleInputChange('name', e.target.value)}
                className="text-sm"
              />
            </div>

            <div className="space-y-2">
              <Label className="text-xs">Database Type</Label>
              <Select
                value={formData.type}
                onValueChange={(val) => handleInputChange('type', val)}
              >
                <SelectTrigger className="text-sm">
                  <SelectValue placeholder="Select database type" />
                </SelectTrigger>
                <SelectContent>
                  {['postgresql', 'mysql'].map((db) => (
                    <SelectItem key={db} value={db} className="text-sm">
                      {db.charAt(0).toUpperCase() + db.slice(1)}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-2">
                <Label className="text-xs">Host</Label>
                <Input
                  placeholder="localhost"
                  value={formData.host}
                  onChange={(e) => handleInputChange('host', e.target.value)}
                  className="text-sm"
                />
              </div>
              <div className="space-y-2">
                <Label className="text-xs">Port</Label>
                <Input
                  placeholder="5432"
                  value={formData.port}
                  onChange={(e) => handleInputChange('port', e.target.value)}
                  className="text-sm"
                />
              </div>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-2">
                <Label className="text-xs">Username</Label>
                <Input
                  placeholder="postgres"
                  value={formData.user}
                  onChange={(e) => handleInputChange('user', e.target.value)}
                  className="text-sm"
                />
              </div>
              <div className="space-y-2">
                <Label className="text-xs">Password</Label>
                <Input
                  type="password"
                  placeholder="••••••••"
                  value={formData.password}
                  onChange={(e) => handleInputChange('password', e.target.value)}
                  className="text-sm"
                />
              </div>
            </div>

            <div className="space-y-2">
              <Label className="text-xs">Database Name</Label>
              <Input
                placeholder="myapp_db"
                value={formData.database}
                onChange={(e) => handleInputChange('database', e.target.value)}
                className="text-sm"
              />
            </div>

            <div className="flex items-center gap-2 p-3 rounded-lg bg-muted/30 border border-border/20">
              <Checkbox
                id="ssl"
                checked={formData.ssl}
                onCheckedChange={(checked) =>
                  setFormData((prev) => ({ ...prev, ssl: checked as boolean }))
                }
              />
              <Label htmlFor="ssl" className="cursor-pointer text-xs">
                Enable SSL Connection
              </Label>
            </div>
          </div>

          <div className="flex justify-end gap-2 pt-2">
            <Button variant="outline" onClick={() => setIsDialogOpen(false)} size="sm" className="text-xs">
              Cancel
            </Button>
            <Button onClick={handleAddDatabase} size="sm" className="text-xs">
              Connect
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
};

export default Index;