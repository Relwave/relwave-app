import { useState } from "react";
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
import { cn, formatRelativeTime } from "@/lib/utils";
import { WelcomeViewProps } from "../types";
import { DiscoveredDatabasesCard } from "./DiscoveredDatabasesCard";
import { Spinner } from "@/components/ui/spinner";
import { Card, CardAction, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { DropdownMenu, DropdownMenuContent, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetTrigger } from "@/components/ui/sheet";
import { ScrollArea } from "@/components/ui/scroll-area";
import { useDbStats, useTables } from "@/features/project/hooks/useDbQueries";
import { bytesToMBString } from "@/lib/bytesToMB";
import { DatabaseConnection } from "@/features/database/types";
import { useCountUp } from "@/hooks/useCountUp";


const DB_COLORS: Record<string, { bg: string; text: string }> = {
  postgresql: { bg: "bg-blue-500/10", text: "text-blue-500" },
  mysql: { bg: "bg-orange-500/10", text: "text-orange-500" },
  mariadb: { bg: "bg-teal-500/10", text: "text-teal-500" },
  sqlite: { bg: "bg-cyan-500/10", text: "text-cyan-500" },
};

function getDbColors(type: string) {
  return DB_COLORS[type] || { bg: "bg-primary/10", text: "text-primary" };
}

function ConnectionSizeItem({ db }: { db: DatabaseConnection }) {
  const { data: stats, isLoading } = useDbStats(db.id);
  const sizeStr = stats?.sizeBytes ? bytesToMBString(stats.sizeBytes) : "—";
  return (
    <div className="flex justify-between items-center py-2 px-3 hover:bg-accent/50 rounded-md transition-colors">
      <div className="flex items-center gap-2 overflow-hidden">
        <Database className={cn("h-3.5 w-3.5 shrink-0", getDbColors(db.type).text)} />
        <span className="text-sm font-medium truncate">{db.name}</span>
      </div>
      <span className="text-sm text-muted-foreground tabular-nums shrink-0 ml-4">{isLoading ? "..." : sizeStr}</span>
    </div>
  );
}

function ConnectionTablesList({ db }: { db: DatabaseConnection }) {
  const { data: tables, isLoading } = useTables(db.id);
  if (isLoading) return <div className="p-3 text-sm text-muted-foreground flex items-center gap-2"><Spinner className="w-4 h-4"/> Loading tables for {db.name}...</div>;
  if (!tables || tables.length === 0) return null;
  return (
    <div className="mb-6">
      <div className="flex items-center gap-2 mb-3">
        <div className={cn("p-1.5 rounded-md", getDbColors(db.type).bg)}>
          <Database className={cn("h-4 w-4", getDbColors(db.type).text)} />
        </div>
        <h4 className="font-semibold text-sm">{db.name}</h4>
      </div>
      <div className="space-y-1.5 pl-3 border-l-2 border-border/50 ml-3.5">
        {tables.map(t => (
          <div key={`${t.schema}-${t.name}`} className="text-sm text-muted-foreground flex items-center gap-2">
            <Layers className="h-3 w-3 opacity-50" />
            <span className="truncate">{t.schema !== 'public' && t.schema !== db.database ? `${t.schema}.` : ''}{t.name}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

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
  onDatabaseHover,
  onDiscoveredDatabaseAdd,
  onOnlineFilterClick,
}: WelcomeViewProps) {
  const [showAllActivity, setShowAllActivity] = useState(false);

  const hour = new Date().getHours();
  let timeGreeting = "Good morning";
  if (hour >= 12 && hour < 17) timeGreeting = "Good afternoon";
  else if (hour >= 17) timeGreeting = "Good evening";

  const lastActiveName = recentDatabases[0]?.name;

  const animatedConnections = useCountUp(databases.length);
  const animatedOnline = useCountUp(connectedCount);
  const animatedTables = useCountUp(typeof totalTables === 'number' ? totalTables : 0);

  return (
    <div className="h-full flex flex-col p-6 xl:p-8 motion-safe:animate-in fade-in duration-500">
      {/* Welcome Header (Subtle Greeting) */}
      <div className="mb-6 text-sm text-muted-foreground flex items-center gap-2">
        {databases.length === 0 ? (
          <>
            <span>{timeGreeting}</span>
            <span className="text-muted-foreground/30">•</span>
            <button
              onClick={onAddClick}
              className="hover:text-primary transition-colors inline-flex items-center"
            >
              Add your first connection <ChevronRight className="h-3.5 w-3.5 ml-0.5 inline" />
            </button>
          </>
        ) : (
          <>
            <span>{timeGreeting}</span>
            <span className="text-muted-foreground/30">•</span>
            <span>{connectedCount} connections online</span>
            {lastActiveName && (
              <>
                <span className="text-muted-foreground/30">•</span>
                <span>Last active: {lastActiveName}</span>
              </>
            )}
          </>
        )}
      </div>

      {/* Stats Overview */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-8">
        <Card 
          className="@container/card premium-card hover:-translate-y-[2px] hover:border-primary/50 transition-all duration-150 cursor-pointer"
          onClick={() => document.getElementById('connection-search')?.focus()}
        >
          <CardHeader className="flex flex-row items-start justify-between">
            <div className="space-y-1">
              <CardDescription>Total Connections</CardDescription>
              <CardTitle className="text-2xl font-semibold tabular-nums @[250px]/card:text-3xl">
                {animatedConnections}
              </CardTitle>
            </div>
            <CardAction>
              <Database className="h-4.5 w-4.5 text-primary" />
            </CardAction>
          </CardHeader>
        </Card>

        <Card 
          className="@container/card premium-card hover:-translate-y-[2px] hover:border-emerald-500/50 transition-all duration-150 cursor-pointer"
          onClick={onOnlineFilterClick}
        >
          <CardHeader className="flex flex-row items-start justify-between">
            <div className="space-y-1">
              <CardDescription>Online Now</CardDescription>
              <CardTitle className="text-2xl font-semibold tabular-nums @[250px]/card:text-3xl">
                {animatedOnline}
              </CardTitle>
            </div>
            <CardAction>
              <CircleDot className="h-4.5 w-4.5 text-emerald-500" />
            </CardAction>
          </CardHeader>
        </Card>

        <Sheet>
          <SheetTrigger asChild>
            <Card className="@container/card premium-card hover:-translate-y-[2px] hover:border-violet-500/50 transition-all duration-150 cursor-pointer">
              <CardHeader className="flex flex-row items-start justify-between">
                <div className="space-y-1">
                  <CardDescription>Total Tables</CardDescription>
                  <CardTitle className="text-2xl font-semibold tabular-nums @[250px]/card:text-3xl">
                    {statsLoading ? (
                      <div className="flex justify-center text-primary text-center items-center gap-2">
                        <Spinner className="h-8.5 w-8.5 " />
                      </div>
                    ) : (
                      typeof totalTables === 'number' ? animatedTables : totalTables
                    )}
                  </CardTitle>
                </div>
                <CardAction>
                  <Layers className="h-4.5 w-4.5 text-violet-500" />
                </CardAction>
              </CardHeader>
            </Card>
          </SheetTrigger>
          <SheetContent side="right" className="w-[400px] sm:w-[540px] flex flex-col p-0">
            <SheetHeader className="p-6 border-b border-border/30">
              <SheetTitle>All Tables</SheetTitle>
            </SheetHeader>
            <ScrollArea className="flex-1 p-6">
              {databases.length === 0 ? (
                <div className="text-sm text-muted-foreground">No databases connected.</div>
              ) : (
                databases.map(db => <ConnectionTablesList key={db.id} db={db} />)
              )}
            </ScrollArea>
          </SheetContent>
        </Sheet>

        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Card className="@container/card premium-card hover:-translate-y-[2px] hover:border-foreground/30 transition-all duration-150 cursor-pointer">
              <CardHeader className="flex flex-row items-start justify-between">
                <div className="space-y-1">
                  <CardDescription>Data Size</CardDescription>
                  <CardTitle className="text-2xl font-semibold tabular-nums @[250px]/card:text-3xl">
                    {statsLoading ? (
                      <div className="flex justify-center text-primary text-center items-center gap-2">
                        <Spinner className="h-8.5 w-8.5 " />
                      </div>
                    ) : (
                      totalSize
                    )}
                  </CardTitle>
                </div>
                <CardAction>
                  <HardDrive className="h-4.5 w-4.5 " />
                </CardAction>
              </CardHeader>
            </Card>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="w-64 p-2">
            {databases.length === 0 ? (
              <div className="text-sm text-muted-foreground p-2">No databases connected.</div>
            ) : (
              databases.map(db => <ConnectionSizeItem key={db.id} db={db} />)
            )}
          </DropdownMenuContent>
        </DropdownMenu>
      </div>

      {/* Discovered Databases */}
      {
        onDiscoveredDatabaseAdd && (
          <DiscoveredDatabasesCard 
            onAddDatabase={onDiscoveredDatabaseAdd} 
            existingConnections={databases}
          />
        )
      }

      {/* Recent Activity */}
      {
        recentDatabases.length > 0 && (() => {
          const itemsToShow = showAllActivity ? recentDatabases : recentDatabases.slice(0, 5);
          const emptySlots = Math.max(0, 5 - itemsToShow.length);

          return (
            <div className="flex-1">
              <div className="flex items-center gap-2 mb-4">
                <Clock className="h-4 w-4 text-muted-foreground" />
                <h2 className="scroll-m-20 text-xl font-semibold tracking-tight">
                  Recent Activity
                </h2>
              </div>
              <div className="rounded-lg border border-border/50 bg-card/80 overflow-hidden shadow-sm">
                {itemsToShow.map((db, index) => {
                  const isConnected = status.get(db.id) === "connected";
                  return (
                    <Button
                      variant="ghost"
                      key={db.id}
                      onClick={() => onSelectDb(db.id)}
                      onMouseEnter={() => onDatabaseHover(db.id)}
                      disabled={!isConnected}
                      style={{ animationDelay: `${index * 50}ms`, animationFillMode: "both" }}
                      className={cn(
                        "motion-safe:animate-in fade-in slide-in-from-bottom-2 duration-300 w-full h-auto justify-start flex items-center gap-4 px-4 py-3 rounded-none text-left transition-colors",
                        (index !== itemsToShow.length - 1 || emptySlots > 0 || recentDatabases.length > 5) &&
                        "border-b border-border/30",
                        isConnected
                          ? "hover:bg-accent/50 text-foreground"
                          : "opacity-50 cursor-not-allowed"
                      )}
                    >
                      <div
                        className={cn(
                          "h-10 w-10 rounded-lg flex items-center justify-center shrink-0 ring-1 ring-border/50",
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
                          {db.type} • {db.host}:{db.port}
                        </p>
                      </div>
                      <div className="text-xs text-muted-foreground whitespace-nowrap">
                        {formatRelativeTime(db.lastAccessedAt)}
                      </div>
                    </Button>
                  );
                })}
                
                {/* Empty Padding Slots */}
                {Array.from({ length: emptySlots }).map((_, i) => (
                  <div
                    key={`empty-${i}`}
                    className={cn(
                      "w-full h-[66px] flex items-center px-4 py-3 bg-transparent pointer-events-none",
                      (i !== emptySlots - 1 || recentDatabases.length > 5) && "border-b border-border/30"
                    )}
                  />
                ))}

                {/* View All Toggle */}
                {recentDatabases.length > 5 && (
                  <Button
                    variant="ghost"
                    onClick={() => setShowAllActivity(!showAllActivity)}
                    className="w-full h-10 rounded-none text-xs text-muted-foreground hover:text-foreground transition-colors"
                  >
                    {showAllActivity ? "Show less" : "View all \u2192"}
                  </Button>
                )}
              </div>
            </div>
          );
        })()
      }

      {/* Empty State */}
      {
        databases.length === 0 && (
          <div className="flex-1 flex flex-col items-center justify-center">
            <div className="h-20 w-20 rounded-lg bg-muted/50 flex items-center justify-center mb-4 ring-1 ring-border/50">
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
