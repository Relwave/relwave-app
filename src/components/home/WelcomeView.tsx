import {
  Plus,
  Database,
  Clock,
  HardDrive,
  Sparkles,
  CircleDot,
  ChevronRight,
  Layers,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { WelcomeViewProps } from "./types";
import { formatRelativeTime } from "./utils";

export function WelcomeView({
  databases,
  recentDatabases,
  status,
  connectedCount,
  totalTables,
  totalSize,
  statsLoading,
  onAddClick,
  onSelectDb,
  onDatabaseClick,
  onDatabaseHover,
}: WelcomeViewProps) {
  return (
    <div className="h-full flex flex-col p-6">
      {/* Welcome Header */}
      <div className="mb-8">
        <div className="flex items-center gap-3 mb-2">
          <div className="h-10 w-10 rounded-xl bg-primary/10 flex items-center justify-center">
            <Sparkles className="h-5 w-5 text-primary" />
          </div>
          <div>
            <h1 className="text-xl font-semibold">Welcome to RelWave</h1>
            <p className="text-sm text-muted-foreground">
              Select a connection or add a new one
            </p>
          </div>
        </div>
      </div>

      {/* Stats Overview */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-8">
        <div className="p-5 rounded-xl border border-border/50 bg-card hover:border-border transition-colors">
          <div className="flex items-center justify-between mb-3">
            <div className="h-9 w-9 rounded-lg bg-primary/10 flex items-center justify-center">
              <Database className="h-4.5 w-4.5 text-primary" />
            </div>
          </div>
          <p className="text-2xl font-bold tabular-nums font-mono">{databases.length}</p>
          <p className="text-xs text-muted-foreground mt-1">Total Connections</p>
        </div>
        <div className="p-5 rounded-xl border border-border/50 bg-card hover:border-border transition-colors">
          <div className="flex items-center justify-between mb-3">
            <div className="h-9 w-9 rounded-lg bg-emerald-500/10 flex items-center justify-center">
              <CircleDot className="h-4.5 w-4.5 text-emerald-500" />
            </div>
          </div>
          <p className="text-2xl font-bold tabular-nums font-mono">{connectedCount}</p>
          <p className="text-xs text-muted-foreground mt-1">Online Now</p>
        </div>
        <div className="p-5 rounded-xl border border-border/50 bg-card hover:border-border transition-colors">
          <div className="flex items-center justify-between mb-3">
            <div className="h-9 w-9 rounded-lg bg-violet-500/10 flex items-center justify-center">
              <Layers className="h-4.5 w-4.5 text-violet-500" />
            </div>
          </div>
          <p className="text-2xl font-bold tabular-nums font-mono">
            {statsLoading ? "—" : totalTables}
          </p>
          <p className="text-xs text-muted-foreground mt-1">Total Tables</p>
        </div>
        <div className="p-5 rounded-xl border border-border/50 bg-card hover:border-border transition-colors">
          <div className="flex items-center justify-between mb-3">
            <div className="h-9 w-9 rounded-lg bg-amber-500/10 flex items-center justify-center">
              <HardDrive className="h-4.5 w-4.5 text-amber-500" />
            </div>
          </div>
          <p className="text-2xl font-bold tabular-nums font-mono">
            {statsLoading ? "—" : totalSize}
          </p>
          <p className="text-xs text-muted-foreground mt-1">Data Size</p>
        </div>
      </div>

      {/* Recent Activity */}
      {recentDatabases.length > 0 && (
        <div className="flex-1">
          <div className="flex items-center gap-2 mb-4">
            <Clock className="h-4 w-4 text-muted-foreground" />
            <h2 className="text-sm font-medium">Recent Activity</h2>
          </div>
          <div className="rounded-xl border border-border/50 bg-card overflow-hidden">
            {recentDatabases.map((db, index) => {
              const isConnected = status.get(db.id) === "connected";
              return (
                <button
                  key={db.id}
                  onClick={() => {
                    onSelectDb(db.id);
                    if (isConnected) onDatabaseClick(db.id);
                  }}
                  onMouseEnter={() => onDatabaseHover(db.id)}
                  disabled={!isConnected}
                  className={cn(
                    "w-full flex items-center gap-4 px-4 py-3 text-left transition-colors",
                    index !== recentDatabases.length - 1 &&
                      "border-b border-border/30",
                    isConnected
                      ? "hover:bg-muted/50"
                      : "opacity-50 cursor-not-allowed"
                  )}
                >
                  <div
                    className={cn(
                      "h-10 w-10 rounded-lg flex items-center justify-center shrink-0",
                      db.type === "postgresql"
                        ? "bg-blue-500/10"
                        : "bg-orange-500/10"
                    )}
                  >
                    <Database
                      className={cn(
                        "h-5 w-5",
                        db.type === "postgresql"
                          ? "text-blue-500"
                          : "text-orange-500"
                      )}
                    />
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="font-medium truncate">{db.name}</p>
                    <p className="text-xs text-muted-foreground">
                      {formatRelativeTime(db.lastAccessedAt)} • <span className="font-mono">{db.type}</span>
                    </p>
                  </div>
                  <ChevronRight className="h-4 w-4 text-muted-foreground/50" />
                </button>
              );
            })}
          </div>
        </div>
      )}

      {/* Empty State */}
      {databases.length === 0 && (
        <div className="flex-1 flex flex-col items-center justify-center">
          <div className="h-20 w-20 rounded-2xl bg-muted/50 flex items-center justify-center mb-4">
            <Database className="h-10 w-10 text-muted-foreground/30" />
          </div>
          <h3 className="text-lg font-medium mb-1">No connections yet</h3>
          <p className="text-sm text-muted-foreground mb-6">
            Add your first database to get started
          </p>
          <Button onClick={onAddClick} className="gap-2">
            <Plus className="h-4 w-4" />
            Add Connection
          </Button>
        </div>
      )}
    </div>
  );
}
