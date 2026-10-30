import { useState, useEffect } from "react";
import { useMongoCollections } from "@/features/project/hooks/useDbQueries";
import { MongoMqlEditor } from "../editor/MongoMqlEditor";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Database, Plus, GitBranch, Layers, Sparkles } from "lucide-react";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";

export function MongoAggregationPanel({
  dbId,
  databaseName,
}: {
  dbId: string;
  databaseName: string;
}) {
  const { data: collectionsData, isLoading: collectionsLoading } = useMongoCollections(dbId);
  const collections = collectionsData?.collections || [];
  const [selectedCollection, setSelectedCollection] = useState<string>("");

  useEffect(() => {
    if (collections.length > 0 && !collections.some((c) => c.name === selectedCollection)) {
      setSelectedCollection(collections[0].name);
    }
  }, [collections, selectedCollection]);

  const defaultPipelinePreview = `[\n  {\n    "$match": {\n      "status": "active"\n    }\n  },\n  {\n    "$group": {\n      "_id": "$category",\n      "total": { "$sum": 1 }\n    }\n  }\n]`;

  return (
    <div className="h-[calc(100vh-32px)] flex flex-col overflow-hidden bg-background text-foreground">
      {/* Top Header */}
      <div className="h-13 px-4 border-b border-border/40 flex items-center justify-between bg-sidebar/40 shrink-0 gap-4">
        <div className="flex items-center gap-3">
          <div className="flex items-center gap-2">
            <div className="h-6 w-6 rounded bg-emerald-500/10 border border-emerald-500/20 flex items-center justify-center">
              <Database className="h-3.5 w-3.5 text-emerald-500" />
            </div>
            <span className="font-semibold text-sm">{databaseName}</span>
          </div>

          <span className="text-muted-foreground/40">/</span>

          {/* Collection Selector */}
          <div className="w-52">
            <Select
              value={selectedCollection}
              onValueChange={setSelectedCollection}
              disabled={collectionsLoading || collections.length === 0}
            >
              <SelectTrigger className="h-8 text-xs bg-muted/50">
                <SelectValue
                  placeholder={
                    collectionsLoading
                      ? "Loading collections..."
                      : collections.length === 0
                      ? "No collections"
                      : "Select collection"
                  }
                />
              </SelectTrigger>
              <SelectContent>
                {collections.map((col) => (
                  <SelectItem key={col.name} value={col.name} className="text-xs font-mono">
                    {col.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </div>

        {/* Add Stage disabled action for Phase 4 */}
        <div>
          <Tooltip>
            <TooltipTrigger asChild>
              <div>
                <Button
                  size="sm"
                  disabled
                  className="h-8 text-xs gap-1.5 opacity-60 cursor-not-allowed"
                >
                  <Plus className="h-3.5 w-3.5" />
                  Add Stage
                </Button>
              </div>
            </TooltipTrigger>
            <TooltipContent side="bottom">
              <p className="text-xs">Visual pipeline builder will be available in Phase 4</p>
            </TooltipContent>
          </Tooltip>
        </div>
      </div>

      {/* Two-Pane Canvas Layout */}
      <div className="flex-1 flex overflow-hidden min-h-0">
        {/* Left Pane: Stage Builder Canvas Placeholder */}
        <div className="flex-1 border-r border-border/40 p-6 flex flex-col items-center justify-center text-center bg-muted/5">
          <div className="h-12 w-12 rounded-full bg-emerald-500/10 flex items-center justify-center mb-3">
            <GitBranch className="h-6 w-6 text-emerald-500" />
          </div>
          <h3 className="text-sm font-semibold text-foreground">Pipeline Stages</h3>
          <p className="text-xs text-muted-foreground/80 max-w-sm mt-1 mb-4">
            Visual stage forms ($match, $project, $group, $lookup, $unwind) and drag-and-drop
            reordering will be available in Phase 4.
          </p>
          <div className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-muted border border-border/60 text-xs font-mono text-muted-foreground">
            <Sparkles className="h-3 w-3 text-amber-500" />
            Coming in Phase 4
          </div>
        </div>

        {/* Right Pane: Live Pipeline Code Mirror Preview */}
        <div className="w-[45%] flex flex-col p-4 bg-muted/10">
          <div className="text-xs font-semibold text-muted-foreground mb-2 flex items-center justify-between">
            <div className="flex items-center gap-1.5">
              <Layers className="h-3.5 w-3.5" />
              <span>Pipeline MQL Preview</span>
            </div>
            <span className="text-[11px] font-mono text-muted-foreground/60">Read-Only</span>
          </div>

          <div className="flex-1 min-h-0">
            <MongoMqlEditor
              value={defaultPipelinePreview}
              onChange={() => {}}
              disabled={true}
              minHeight="100%"
            />
          </div>
        </div>
      </div>
    </div>
  );
}
