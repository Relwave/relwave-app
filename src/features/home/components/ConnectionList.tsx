import { Plus, Database, Search, Trash2, Zap } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import {
  ContextMenu,
  ContextMenuContent,
  ContextMenuItem,
  ContextMenuSeparator,
  ContextMenuTrigger,
} from "@/components/ui/context-menu";
import { cn } from "@/lib/utils";
import { ConnectionListProps } from "../types";
import { Spinner } from "@/components/ui/spinner";
import { Card, CardContent, CardDescription, CardTitle } from "@/components/ui/card";

export function ConnectionList({
  databases,
  filteredDatabases,
  loading,
  searchQuery,
  setSearchQuery,
  selectedDb,
  setSelectedDb,
  status,
  connectedCount,
  totalTables,
  statsLoading,
  onAddClick,
  onDatabaseHover,
  onDelete,
  onTest,
}: ConnectionListProps) {
  return (
    <div className="w-78 border-r border-border/50 flex flex-col bg-card/55 backdrop-blur-xl">
      {/* Header */}
      <div className="p-4 border-b border-border/50 bg-background/35">
        <div className="flex items-center justify-between mb-3">
          <h2 className="scroll-m-20 pb-1 text-xl font-semibold tracking-tight first:mt-0">
            Connections
          </h2>
          <Button
            variant="ghost"
            size="icon"
            className="h-7 w-7"
            onClick={onAddClick}
          >
            <Plus className="h-4 w-4" />
          </Button>
        </div>
        <div className="relative">
          <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground/60" />
          <Input
            placeholder="Search..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="h-8 pl-8 text-xs bg-background/65 border-border/60 shadow-inner"
          />
        </div>
      </div>

      {/* Database List */}
      <div className="flex-1 overflow-y-auto py-2">
        {loading ? (
          <div className="flex items-center justify-center py-8">
            <div className="h-5 w-5 border-2 border-primary/30 border-t-primary rounded-full animate-spin" />
          </div>
        ) : filteredDatabases.length === 0 ? (
          <div className="px-4 py-8 text-center">
            <Database className="h-8 w-8 text-muted-foreground/30 mx-auto mb-2" />
            <p className="text-xs text-muted-foreground">
              {databases.length === 0 ? "No connections" : "No matches"}
            </p>
          </div>
        ) : (
          <div className="space-y-0.5 px-2">
            {filteredDatabases.map((db) => {
              const isConnected = status.get(db.id) === "connected";
              const isSelected = selectedDb === db.id;
              return (
                <ContextMenu key={db.id}>
                  <ContextMenuTrigger asChild>
                    <button
                      onClick={() => setSelectedDb(db.id)}
                      onMouseEnter={() => onDatabaseHover(db.id)}
                      className={cn(
                        "w-full flex items-center gap-2.5 px-2.5 py-2.5 rounded-md text-left transition-all duration-150 border border-transparent",
                        isSelected
                          ? "bg-accent/85 text-accent-foreground border-primary/20 shadow-sm"
                          : "hover:bg-accent/45 hover:border-border/60",
                        !isConnected && "opacity-50"
                      )}
                    >
                      <div
                        className={cn(
                          "h-2.5 w-2.5 rounded-full shrink-0 ring-4",
                          isConnected ? "bg-emerald-500 ring-emerald-500/10" : "bg-muted-foreground/30 ring-muted/40"
                        )}
                      />
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-medium truncate">{db.name}</p>
                        <p className="text-[10px] text-muted-foreground truncate font-mono">
                          {db.type} • {db.type === "sqlite" ? db.database : db.host}
                        </p>
                      </div>
                    </button>
                  </ContextMenuTrigger>
                  <ContextMenuContent className="w-48">
                    <ContextMenuItem
                      onClick={() => onTest(db.id, db.name)}
                      className="gap-2"
                    >
                      <Zap className="h-4 w-4" />
                      Test Connection
                    </ContextMenuItem>
                    <ContextMenuSeparator />
                    <ContextMenuItem
                      onClick={() => onDelete(db.id, db.name)}
                      className="gap-2 text-destructive focus:text-destructive"
                    >
                      <Trash2 className="h-4 w-4" />
                      Delete Connection
                    </ContextMenuItem>
                  </ContextMenuContent>
                </ContextMenu>
              );
            })}
          </div>
        )}
      </div>

      {/* Quick Stats Footer */}
      <div className="p-3 border-t border-border/50 bg-background/55">
        <div className="grid grid-cols-2 gap-2">
          <Card className="text-center p-2 rounded-md premium-card">
            <CardContent className="px-2">
              <CardTitle className="text-lg font-bold tabular-nums font-mono">
                {connectedCount}/{databases.length}
              </CardTitle>
              <CardDescription className="text-[10px] text-muted-foreground">Online</CardDescription>
            </CardContent>
          </Card>
          <Card className="text-center p-2 rounded-md premium-card">
            <CardContent className="px-2">
              <CardTitle className="text-lg font-bold tabular-nums font-mono">
                {statsLoading ? <Spinner className="h-4.5 w-4.5 text-amber-500" /> : totalTables}
              </CardTitle>
              <CardDescription className="text-[10px] text-muted-foreground">Tables</CardDescription>
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}
