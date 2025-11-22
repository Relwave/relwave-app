import { useState } from "react";
import { Database, Plus, Search, Server } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { DatabaseCard } from "@/components/DatabaseCard";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { toast } from "sonner";

// Mock database connections (kept the same)
const mockDatabases = [
  {
    id: "prod-db-1",
    name: "Production DB",
    type: "PostgreSQL",
    status: "connected" as const,
    tables: 42,
    size: "2.4 GB",
    host: "prod.db.company.com:5432",
  },
  {
    id: "dev-db-1",
    name: "Development DB",
    type: "MySQL",
    status: "connected" as const,
    tables: 28,
    size: "850 MB",
    host: "localhost:3306",
  },
  {
    id: "staging-db-1",
    name: "Staging DB",
    type: "PostgreSQL",
    status: "disconnected" as const,
    tables: 35,
    size: "1.8 GB",
    host: "staging.db.company.com:5432",
  },
  {
    id: "analytics-db",
    name: "Analytics DB",
    type: "MongoDB",
    status: "connected" as const,
    tables: 15,
    size: "4.2 GB",
    host: "analytics.company.com:27017",
  },
];

const Index = () => {
  const [searchQuery, setSearchQuery] = useState("");
  const [isDialogOpen, setIsDialogOpen] = useState(false);

  const filteredDatabases = mockDatabases.filter((db) =>
    db.name.toLowerCase().includes(searchQuery.toLowerCase())
  );

  const handleAddDatabase = () => {
    toast.success("Database connection added successfully", {
      description: "Your new connection is now available for visualization.",
    });
    setIsDialogOpen(false);
  };

  return (
    <div className="min-h-screen bg-[#050505] text-white">
      <header className="border-b border-primary/10 bg-black/30 backdrop-blur-xl sticky top-0 z-50 shadow-lg">
        <div className="container mx-auto px-4 py-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="p-3 bg-gradient-to-br from-cyan-500 to-violet-600 rounded-xl shadow-lg">
                <Server className="h-6 w-6 text-white" />
              </div>
              <div>
                <h1 className="text-3xl font-extrabold bg-clip-text text-transparent bg-gradient-to-r from-cyan-400 to-fuchsia-600">
                  Data Portal
                </h1>
                <p className="text-sm text-gray-400">Manage and visualize your connections</p>
              </div>
            </div>
            <Dialog open={isDialogOpen} onOpenChange={setIsDialogOpen}>
              <DialogTrigger asChild>
                <Button className="bg-linear-to-r from-cyan-500 to-fuchsia-600 hover:from-cyan-600 hover:to-fuchsia-700 transition-all shadow-xl shadow-fuchsia-500/20">
                  <Plus className="h-4 w-4 mr-2" />
                  Add Connection
                </Button>
              </DialogTrigger>
              {/* ENHANCEMENT: Applying backdrop-blur and specific dark theme styles to DialogContent */}
              <DialogContent
                className="sm:max-w-[500px] 
               bg-gray-900/90 backdrop-blur-sm 
               text-white border-primary/20 
               rounded-xl shadow-2xl"
              >
                <DialogHeader>
                  <DialogTitle className="text-2xl font-bold text-white">
                    Add New Database Connection 🔌
                  </DialogTitle>
                  <DialogDescription className="text-gray-400">
                    Connect to a local, Docker, or remote database instance.
                  </DialogDescription>
                </DialogHeader>
                <div className="space-y-5 py-4">
                  {/* Input Fields - Consistent Dark Style */}
                  <div className="space-y-2">
                    <Label htmlFor="db-name" className="text-gray-300">Connection Name</Label>
                    <Input
                      id="db-name"
                      placeholder="My Production DB"
                      className="bg-gray-800/70 border-gray-700 focus:border-cyan-500 text-white transition-colors"
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="db-type" className="text-gray-300">Database Type</Label>
                    <Select>
                      <SelectTrigger id="db-type" className="bg-gray-800/70 border-gray-700 focus:border-cyan-500 text-white transition-colors">
                        <SelectValue placeholder="Select database type" />
                      </SelectTrigger>
                      {/* Select Content - Ensure it stays dark themed */}
                      <SelectContent className="bg-gray-900 border-primary/20 text-white shadow-xl">
                        <SelectItem value="postgresql">PostgreSQL</SelectItem>
                        <SelectItem value="mysql">MySQL</SelectItem>
                        <SelectItem value="mongodb">MongoDB</SelectItem>
                        <SelectItem value="sqlite">SQLite</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="host" className="text-gray-300">Host</Label>
                    <Input
                      id="host"
                      placeholder="prod.company.com:5432"
                      className="bg-gray-800/70 border-gray-700 focus:border-cyan-500 text-white transition-colors"
                    />
                  </div>
                  <div className="grid grid-cols-2 gap-4">
                    <div className="space-y-2">
                      <Label htmlFor="username" className="text-gray-300">Username</Label>
                      <Input
                        id="username"
                        placeholder="postgres"
                        className="bg-gray-800/70 border-gray-700 focus:border-cyan-500 text-white transition-colors"
                      />
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="password" className="text-gray-300">Password</Label>
                      <Input
                        id="password"
                        type="password"
                        placeholder="••••••••"
                        className="bg-gray-800/70 border-gray-700 focus:border-cyan-500 text-white transition-colors"
                      />
                    </div>
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="database" className="text-gray-300">Database Name</Label>
                    <Input
                      id="database"
                      placeholder="myapp_db"
                      className="bg-gray-800/70 border-gray-700 focus:border-cyan-500 text-white transition-colors"
                    />
                  </div>
                </div>
                <div className="flex justify-end gap-2 pt-4 border-t border-gray-700/50">
                  <Button
                    variant="outline"
                    onClick={() => setIsDialogOpen(false)}
                    className="border-gray-600 text-gray-300 bg-gray-500 hover:bg-gray-800 transition-colors"
                  >
                    Cancel
                  </Button>
                  {/* Connect Button - Vibrant Gradient */}
                  <Button
                    onClick={handleAddDatabase}
                    className="bg-gradient-to-r from-cyan-500 to-fuchsia-600 hover:from-cyan-600 hover:to-fuchsia-700 transition-all shadow-md shadow-fuchsia-500/30"
                  >
                    Connect
                  </Button>
                </div>
              </DialogContent>
            </Dialog>
          </div>
        </div>
      </header>

      {/* Main Content */}
      <main className="container mx-auto px-4 py-8">
        {/* Stats Grid: Responsive adjustment for desktop */}
        <div className="grid grid-cols-2 sm:grid-cols-2 lg:grid-cols-4 gap-6 mb-10">
          <div className="bg-gray-800/50 border border-primary/10 rounded-xl p-6 shadow-2xl hover:border-cyan-500/50 transition-all duration-300">
            <div className="flex items-center gap-4">
              <div className="p-3 bg-cyan-500/20 rounded-xl">
                <Database className="h-6 w-6 text-cyan-400" />
              </div>
              <div>
                <p className="text-3xl font-extrabold text-white">{mockDatabases.length}</p>
                <p className="text-sm text-gray-400">Total Connections</p>
              </div>
            </div>
          </div>
          <div className="bg-gray-800/50 border border-primary/10 rounded-xl p-6 shadow-2xl hover:border-emerald-500/50 transition-all duration-300">
            <div className="flex items-center gap-4">
              <div className="p-3 bg-emerald-500/20 rounded-xl">
                <Database className="h-6 w-6 text-emerald-400" />
              </div>
              <div>
                <p className="text-3xl font-extrabold text-white">
                  {mockDatabases.filter((db) => db.status === "connected").length}
                </p>
                <p className="text-sm text-gray-400">Currently Connected</p>
              </div>
            </div>
          </div>
          <div className="bg-gray-800/50 border border-primary/10 rounded-xl p-6 shadow-2xl hover:border-violet-500/50 transition-all duration-300">
            <div className="flex items-center gap-4">
              <div className="p-3 bg-violet-500/20 rounded-xl">
                <Database className="h-6 w-6 text-violet-400" />
              </div>
              <div>
                <p className="text-3xl font-extrabold text-white">
                  {mockDatabases.reduce((acc, db) => acc + db.tables, 0)}
                </p>
                <p className="text-sm text-gray-400">Total Schemas/Tables</p>
              </div>
            </div>
          </div>
          <div className="bg-gray-800/50 border border-primary/10 rounded-xl p-6 shadow-2xl hover:border-amber-500/50 transition-all duration-300">
            <div className="flex items-center gap-4">
              <div className="p-3 bg-amber-500/20 rounded-xl">
                <Database className="h-6 w-6 text-amber-400" />
              </div>
              <div>
                <p className="text-3xl font-extrabold text-white">9.25 GB</p>
                <p className="text-sm text-gray-400">Total Data Size</p>
              </div>
            </div>
          </div>
        </div>

        {/* Search Input: Uses full width but caps at 'lg' to look good on wide screens */}
        <div className="mb-8">
          <div className="relative max-w-full lg:max-w-xl">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-500" />
            <Input
              placeholder="Search by connection name..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="pl-10 h-11 bg-gray-800/70 border-primary/20 text-white focus:border-cyan-500 transition-colors"
            />
          </div>
        </div>

        <h2 className="text-2xl font-bold mb-6 text-gray-200">Active Connections</h2>

        {/* Database Grid: Adapt from 1 to 4 columns based on viewport width */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-3 gap-6">
          {filteredDatabases.map((db) => (
            <DatabaseCard key={db.id} {...db} />
          ))}
        </div>

        {filteredDatabases.length === 0 && (
          <div className="text-center py-20 border border-dashed border-gray-700 rounded-xl mt-8">
            <Database className="h-16 w-16 text-gray-600 mx-auto mb-6" />
            <h3 className="text-xl font-semibold mb-3 text-gray-200">No matching connections found</h3>
            <p className="text-gray-400 mb-6">
              Try adjusting your search or create a new database connection.
            </p>
            <Button onClick={() => setIsDialogOpen(true)} className="bg-gradient-to-r from-cyan-500 to-fuchsia-600 hover:from-cyan-600 hover:to-fuchsia-700 transition-all shadow-xl shadow-fuchsia-500/20">
              <Plus className="h-4 w-4 mr-2" />
              New Connection
            </Button>
          </div>
        )}
      </main>
    </div>
  );
};

export default Index;