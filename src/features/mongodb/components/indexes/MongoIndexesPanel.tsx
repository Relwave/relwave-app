import React, { useState, useMemo } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Layers, Plus, RefreshCw, Search, AlertTriangle, HardDrive } from "lucide-react";
import { useMongoIndexes } from "../../hooks/useMongoIndexes";
import { MongoIndexTable } from "./MongoIndexTable";
import { MongoCreateIndexDialog } from "./MongoCreateIndexDialog";
import { MongoDropIndexDialog } from "./MongoDropIndexDialog";
import { MongoHideIndexDialog } from "./MongoHideIndexDialog";
import { MongoIndexDetailsDialog } from "./MongoIndexDetailsDialog";
import { formatBytes, MongoIndexWithStats } from "../../utils/indexHelpers";

interface MongoIndexesPanelProps {
  dbId: string;
  collection: string;
}

export function MongoIndexesPanel({ dbId, collection }: MongoIndexesPanelProps) {
  const [searchQuery, setSearchQuery] = useState("");

  // Dialog states
  const [isCreateOpen, setIsCreateOpen] = useState(false);
  const [detailsIndex, setDetailsIndex] = useState<MongoIndexWithStats | null>(null);
  const [dropIndexTarget, setDropIndexTarget] = useState<MongoIndexWithStats | null>(null);
  const [hideIndexTarget, setHideIndexTarget] = useState<MongoIndexWithStats | null>(null);

  const { indexes, totalSizeBytes, isLoading, isFetching, refetch } = useMongoIndexes(
    dbId,
    collection,
  );

  // Filter indexes by name or key path
  const filteredIndexes = useMemo(() => {
    if (!searchQuery.trim()) return indexes;
    const q = searchQuery.toLowerCase().trim();
    return indexes.filter((idx) => {
      if (idx.name.toLowerCase().includes(q)) return true;
      const keyFields = Object.keys(idx.key || {});
      return keyFields.some((k) => k.toLowerCase().includes(q));
    });
  }, [indexes, searchQuery]);

  const redundantCount = useMemo(() => {
    return indexes.filter((idx) => idx.isRedundant).length;
  }, [indexes]);

  return (
    <div className="flex-1 flex flex-col h-full overflow-hidden bg-background">
      {/* Top Toolbar */}
      <div className="p-3 border-b border-border/40 flex flex-wrap items-center justify-between gap-3 bg-sidebar/20 shrink-0">
        <div className="flex items-center gap-3">
          <div className="flex items-center gap-2">
            <Layers className="h-4 w-4 text-emerald-500" />
            <span className="font-semibold text-xs text-foreground">Collection Indexes</span>
          </div>

          <Badge variant="outline" className="font-mono text-[11px] bg-muted/60 text-foreground">
            {collection}
          </Badge>

          <Badge
            variant="outline"
            className="text-[10px] bg-muted/40 font-mono text-muted-foreground"
          >
            {indexes.length} {indexes.length === 1 ? "Index" : "Indexes"}
          </Badge>

          <Badge
            variant="outline"
            className="text-[10px] bg-muted/40 font-mono text-muted-foreground flex items-center gap-1"
          >
            <HardDrive className="h-2.5 w-2.5" />
            Total: {formatBytes(totalSizeBytes)}
          </Badge>
        </div>

        <div className="flex items-center gap-2">
          <Button
            variant="outline"
            size="sm"
            className="h-8 text-xs gap-1.5"
            onClick={() => refetch()}
            disabled={isLoading || isFetching}
            title="Refresh index list"
          >
            <RefreshCw className={`h-3.5 w-3.5 ${isFetching ? "animate-spin" : ""}`} />
            Refresh
          </Button>

          <Button
            size="sm"
            className="h-8 text-xs bg-emerald-600 hover:bg-emerald-700 text-white gap-1.5"
            onClick={() => setIsCreateOpen(true)}
          >
            <Plus className="h-3.5 w-3.5" />
            Create Index
          </Button>
        </div>
      </div>

      {/* Filter and Advisory Bar */}
      <div className="p-3 border-b border-border/40 bg-sidebar/10 flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-3 shrink-0">
        <div className="relative flex-1 max-w-sm">
          <Search className="absolute left-2.5 top-2.5 h-3.5 w-3.5 text-muted-foreground" />
          <Input
            placeholder="Filter by index name or key field..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="h-8 pl-8 text-xs font-mono"
          />
        </div>

        {redundantCount > 0 && (
          <div className="flex items-center gap-2 px-3 py-1.5 rounded-lg border border-amber-500/30 bg-amber-500/10 text-amber-600 dark:text-amber-400 text-xs">
            <AlertTriangle className="h-3.5 w-3.5 shrink-0" />
            <span>
              <strong>Heuristic Advisory:</strong> {redundantCount}{" "}
              {redundantCount === 1 ? "redundant index" : "redundant indexes"} detected. Review
              redundant candidates before taking action. RelWave never deletes indexes
              automatically.
            </span>
          </div>
        )}
      </div>

      {/* Main Index Table Content */}
      <div className="flex-1 overflow-auto p-4">
        <MongoIndexTable
          indexes={filteredIndexes}
          isLoading={isLoading}
          onViewDetails={(idx) => setDetailsIndex(idx)}
          onToggleHide={(idx) => setHideIndexTarget(idx)}
          onDrop={(idx) => setDropIndexTarget(idx)}
        />
      </div>

      {/* Create Index Dialog */}
      <MongoCreateIndexDialog
        open={isCreateOpen}
        onOpenChange={setIsCreateOpen}
        dbId={dbId}
        collection={collection}
        onSuccess={() => refetch()}
      />

      {/* Drop Index Confirmation Dialog */}
      <MongoDropIndexDialog
        open={!!dropIndexTarget}
        onOpenChange={(open) => !open && setDropIndexTarget(null)}
        dbId={dbId}
        collection={collection}
        index={dropIndexTarget}
        onIndexDropped={() => {
          setDropIndexTarget(null);
          refetch();
        }}
      />

      {/* Hide / Unhide Index Dialog */}
      <MongoHideIndexDialog
        open={!!hideIndexTarget}
        onOpenChange={(open) => !open && setHideIndexTarget(null)}
        dbId={dbId}
        collection={collection}
        index={hideIndexTarget}
        onToggled={() => {
          setHideIndexTarget(null);
          refetch();
        }}
      />

      {/* Index Details Inspector Dialog */}
      <MongoIndexDetailsDialog
        open={!!detailsIndex}
        onOpenChange={(open) => !open && setDetailsIndex(null)}
        collection={collection}
        index={detailsIndex}
      />
    </div>
  );
}
