import React, { useState, useMemo } from "react";
import { MongoCollectionInfo } from "../types";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Layers, Search, RefreshCw, Eye, Plus, Trash2 } from "lucide-react";

export function MongoCollectionsSidebar({
  collections,
  selectedCollection,
  onSelectCollection,
  isLoading,
  onRefresh,
  onCreateCollection,
  onDropCollection,
  isReadOnly,
}: {
  collections: MongoCollectionInfo[];
  selectedCollection: string | null;
  onSelectCollection: (name: string) => void;
  isLoading: boolean;
  onRefresh: () => void;
  onCreateCollection?: () => void;
  onDropCollection?: (name: string) => void;
  isReadOnly?: boolean;
}) {
  const [search, setSearch] = useState("");

  const filtered = useMemo(() => {
    return collections.filter((col) =>
      col.name.toLowerCase().includes(search.toLowerCase().trim()),
    );
  }, [collections, search]);

  return (
    <div className="w-64 h-full border-r border-border/40 bg-sidebar/50 flex flex-col shrink-0">
      <div className="p-3 border-b border-border/40 flex items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <Layers className="h-4 w-4 text-emerald-500" />
          <span className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
            Collections ({collections.length})
          </span>
        </div>
        <div className="flex items-center gap-1">
          {onCreateCollection && (
            <Button
              variant="ghost"
              size="icon"
              onClick={onCreateCollection}
              disabled={isReadOnly}
              title={isReadOnly ? "Database is read-only" : "Create new collection"}
              className="h-6 w-6 text-muted-foreground hover:text-emerald-500 hover:bg-emerald-500/10 disabled:opacity-40 disabled:cursor-not-allowed"
            >
              <Plus className="h-3.5 w-3.5" />
            </Button>
          )}
          <Button
            variant="ghost"
            size="icon"
            onClick={onRefresh}
            className="h-6 w-6 text-muted-foreground hover:text-foreground"
            title="Refresh collections"
          >
            <RefreshCw className={`h-3.5 w-3.5 ${isLoading ? "animate-spin" : ""}`} />
          </Button>
        </div>
      </div>

      <div className="p-2 border-b border-border/30">
        <div className="relative">
          <Search className="absolute left-2.5 top-2.5 h-3.5 w-3.5 text-muted-foreground/60" />
          <Input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search collections..."
            className="pl-8 text-xs h-8 bg-background/50 border-border/40"
          />
        </div>
      </div>

      <ScrollArea className="flex-1">
        <div className="p-2 space-y-0.5">
          {isLoading && collections.length === 0 ? (
            <div className="py-6 text-center text-xs text-muted-foreground">
              Loading collections...
            </div>
          ) : filtered.length === 0 ? (
            <div className="py-6 text-center text-xs text-muted-foreground">
              No collections found
            </div>
          ) : (
            filtered.map((col) => {
              const isSelected = col.name === selectedCollection;
              const isSystem = col.name.startsWith("system.");
              return (
                <div
                  key={col.name}
                  className={`group/col w-full flex items-center justify-between px-2.5 py-1.5 rounded-md text-xs font-mono transition-colors ${
                    isSelected
                      ? "bg-emerald-500/15 text-emerald-600 dark:text-emerald-400 font-medium"
                      : "text-muted-foreground hover:bg-muted/50 hover:text-foreground"
                  }`}
                >
                  <button
                    onClick={() => onSelectCollection(col.name)}
                    className="flex-1 flex items-center gap-2 truncate text-left"
                  >
                    <Layers className="h-3.5 w-3.5 shrink-0 opacity-70" />
                    <span className="truncate">{col.name}</span>
                  </button>

                  <div className="flex items-center gap-1 shrink-0">
                    {col.type === "view" && (
                      <span className="text-[10px] px-1 py-0.2 rounded bg-muted text-muted-foreground uppercase flex items-center gap-0.5">
                        <Eye className="h-2.5 w-2.5" /> view
                      </span>
                    )}

                    {!isSystem && !isReadOnly && onDropCollection && (
                      <Button
                        variant="ghost"
                        size="icon"
                        onClick={(e) => {
                          e.stopPropagation();
                          onDropCollection(col.name);
                        }}
                        className="h-5 w-5 opacity-0 group-hover/col:opacity-100 hover:text-destructive hover:bg-destructive/10 transition-opacity p-0"
                        title={`Drop ${col.name}`}
                      >
                        <Trash2 className="h-3 w-3" />
                      </Button>
                    )}
                  </div>
                </div>
              );
            })
          )}
        </div>
      </ScrollArea>
    </div>
  );
}
