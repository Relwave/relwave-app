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
import { WelcomeViewProps } from "../types";
import { formatRelativeTime } from "../utils";
import { DiscoveredDatabasesCard } from "./DiscoveredDatabasesCard";
import { Spinner } from "@/components/ui/spinner";
import { Card, CardAction, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";


const DB_COLORS: Record<string, { bg: string; text: string }> = {
  postgresql: { bg: "bg-blue-500/10", text: "text-blue-500" },
  mysql: { bg: "bg-orange-500/10", text: "text-orange-500" },
  mariadb: { bg: "bg-teal-500/10", text: "text-teal-500" },
  sqlite: { bg: "bg-cyan-500/10", text: "text-cyan-500" },
};

function getDbColors(type: string) {
  return DB_COLORS[type] || { bg: "bg-primary/10", text: "text-primary" };
}

export function WelcomeView({
  databases,
  recentDatabases,
  status,
  connectedCount,
  totalTables,
  totalSize,
  statsLoading,
  welcomeMessage,
  onAddClick,
  onSelectDb,
  onDatabaseHover,
  onDiscoveredDatabaseAdd,
}: WelcomeViewProps) {

  return (
    <div className="h-full flex flex-col p-6">
      {/* Welcome Header */}
      <div className="mb-8">
        <div className="flex flex-col gap-1 mb-2">
          <div className="flex items-center gap-3">
            <div className="h-10 w-10 rounded-xl bg-primary/10 flex items-center justify-center shrink-0">
              <Sparkles className="h-6 w-6 text-primary" />
            </div>
            <h2 className="scroll-m-20 pb-0 text-3xl font-semibold tracking-tight first:mt-0">
              {welcomeMessage}
            </h2>
          </div>
          <p className="leading-7 text-muted-foreground ml-[52px]">
            Select a connection or add a new one
          </p>
        </div>
      </div>

      {/* Stats Overview */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-8">
        <Card className="@container/card">
          <CardHeader>
            <CardDescription>Total Connections</CardDescription>
            <CardTitle className="text-2xl font-semibold tabular-nums @[250px]/card:text-3xl">
              {databases.length}
            </CardTitle>
            <CardAction>
              <Database className="h-4.5 w-4.5 text-primary" />
            </CardAction>
          </CardHeader>
        </Card>
        <Card className="@container/card">
          <CardHeader>
            <CardDescription>Online Now</CardDescription>
            <CardTitle className="text-2xl font-semibold tabular-nums @[250px]/card:text-3xl">
              {connectedCount}
            </CardTitle>
            <CardAction>
              <CircleDot className="h-4.5 w-4.5 text-emerald-500" />
            </CardAction>
          </CardHeader>
        </Card>
        <Card className="@container/card">
          <CardHeader>
            <CardDescription>Total Tables</CardDescription>
            <CardTitle className="text-2xl font-semibold tabular-nums @[250px]/card:text-3xl">
              {statsLoading ? <Spinner className="h-4.5 w-4.5 text-violet-500" /> : totalTables}
            </CardTitle>
            <CardAction>
              <Layers className="h-4.5 w-4.5 text-violet-500" />
            </CardAction>
          </CardHeader>
        </Card>
        <Card className="@container/card">
          <CardHeader>
            <CardDescription>Data Size</CardDescription>
            <CardTitle className="text-2xl font-semibold tabular-nums @[250px]/card:text-3xl">
              {statsLoading ? <Spinner className="h-4.5 w-4.5 text-amber-500" /> : totalSize}
            </CardTitle>
            <CardAction>
              <HardDrive className="h-4.5 w-4.5 text-amber-500" />
            </CardAction>
          </CardHeader>
        </Card>
      </div>

      {/* Discovered Databases */}
      {
        onDiscoveredDatabaseAdd && (
          <DiscoveredDatabasesCard onAddDatabase={onDiscoveredDatabaseAdd} />
        )
      }

      {/* Recent Activity */}
      {
        recentDatabases.length > 0 && (
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
                    onClick={() => onSelectDb(db.id)}
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
                        getDbColors(db.type).bg
                      )}
                    >
                      <Database
                        className={cn(
                          "h-5 w-5",
                          getDbColors(db.type).text
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
        )
      }

      {/* Empty State */}
      {
        databases.length === 0 && (
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
        )
      }
    </div >
  );
}
