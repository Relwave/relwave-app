import { useState, useEffect, useMemo, useRef } from "react";
import {
  DndContext,
  closestCenter,
  KeyboardSensor,
  PointerSensor,
  useSensor,
  useSensors,
  DragEndEvent,
} from "@dnd-kit/core";
import {
  SortableContext,
  sortableKeyboardCoordinates,
  verticalListSortingStrategy,
} from "@dnd-kit/sortable";
import { useMongoCollections } from "@/features/project/hooks/useDbQueries";
import { useRunAggregation, useExplainMql } from "../../hooks/useMongoMql";
import { SupportedStageType, PipelineStageItem } from "./types";
import {
  createStageItem,
  duplicateStage,
  toggleStageEnabled,
  toggleStageRaw,
  toggleStageCollapsed,
  updateStageConfig,
  updateStageRawJson,
  deleteStage,
  reorderStages,
  moveStageUp,
  moveStageDown,
} from "./pipelineModel";
import { serializePipeline, formatPipelineScript } from "./pipelineSerializer";
import { validatePipeline } from "./pipelineValidation";
import { PipelineStageCard } from "./PipelineStageCard";
import { AddStageDialog } from "./AddStageDialog";
import { PipelinePreviewPane } from "./PipelinePreviewPane";
import { StagePreviewDialog } from "./StagePreviewDialog";
import { MongoResultsViewer } from "../results/MongoResultsViewer";
import { MongoExplainResult } from "../../types";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import {
  Database,
  Plus,
  Play,
  RotateCcw,
  Search,
  Layers,
  AlertCircle,
  Loader2,
} from "lucide-react";
import { toast } from "sonner";

export function MongoAggregationPanel({
  dbId,
  databaseName,
  onNavigateToWorkspace,
}: {
  dbId: string;
  databaseName: string;
  onNavigateToWorkspace?: (script: string) => void;
}) {
  const { data: collectionsData, isLoading: collectionsLoading } = useMongoCollections(dbId);
  const collections = collectionsData?.collections || [];
  const [selectedCollection, setSelectedCollection] = useState<string>("");

  const [stages, setStages] = useState<PipelineStageItem[]>([
    createStageItem("$match"),
    createStageItem("$group"),
  ]);

  const [addDialogOpen, setAddDialogOpen] = useState(false);
  const [previewStageIndex, setPreviewStageIndex] = useState<number | null>(null);

  // Active dbId ref to prevent stale executions
  const activeDbIdRef = useRef(dbId);
  useEffect(() => {
    activeDbIdRef.current = dbId;
    setExecutionResult(null);
    setExplainResult(null);
  }, [dbId]);

  useEffect(() => {
    if (collections.length > 0 && !collections.some((c) => c.name === selectedCollection)) {
      setSelectedCollection(collections[0].name);
    }
  }, [collections, selectedCollection]);

  // Drag and drop sensors
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 5 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  );

  const handleDragEnd = (event: DragEndEvent) => {
    const { active, over } = event;
    if (over && active.id !== over.id) {
      setStages((prev) => {
        const oldIndex = prev.findIndex((s) => s.id === active.id);
        const newIndex = prev.findIndex((s) => s.id === over.id);
        return reorderStages(prev, oldIndex, newIndex);
      });
    }
  };

  // Execution & Explain hooks
  const runAgg = useRunAggregation(dbId);
  const explainQuery = useExplainMql(dbId);

  const [executionResult, setExecutionResult] = useState<any>(null);
  const [explainResult, setExplainResult] = useState<MongoExplainResult | null>(null);
  const [executionError, setExecutionError] = useState<string | null>(null);

  const validation = useMemo(() => validatePipeline(stages), [stages]);
  const formattedScript = useMemo(
    () => formatPipelineScript(selectedCollection, stages),
    [selectedCollection, stages],
  );

  const handleRunPipeline = async () => {
    if (!validation.isValid) {
      toast.error(validation.errors[0]?.message || "Pipeline validation failed");
      return;
    }
    if (!selectedCollection) {
      toast.error("Please select a target collection");
      return;
    }

    setExecutionError(null);
    setExplainResult(null);

    const serialized = serializePipeline(stages);
    try {
      const res = await runAgg.mutateAsync({
        collection: selectedCollection,
        pipeline: serialized,
        options: { maxTimeMS: 30000, allowDiskUse: true },
      });
      if (activeDbIdRef.current === dbId) {
        setExecutionResult(res);
      }
    } catch (err: any) {
      if (activeDbIdRef.current === dbId) {
        setExecutionError(err.message || "Pipeline execution failed");
      }
    }
  };

  const handleExplain = async () => {
    if (!validation.isValid) {
      toast.error(validation.errors[0]?.message || "Pipeline validation failed");
      return;
    }
    if (!selectedCollection) {
      toast.error("Please select a target collection");
      return;
    }

    setExecutionError(null);
    setExecutionResult(null);

    const serialized = serializePipeline(stages);
    try {
      const res = await explainQuery.mutateAsync({
        collection: selectedCollection,
        target: { operation: "aggregate", pipeline: serialized, allowDiskUse: true },
        verbosity: "executionStats",
      });
      if (activeDbIdRef.current === dbId) {
        setExplainResult(res);
      }
    } catch (err: any) {
      if (activeDbIdRef.current === dbId) {
        setExecutionError(err.message || "Failed to explain aggregation plan");
      }
    }
  };

  const handleClearPipeline = () => {
    setStages([]);
    setExecutionResult(null);
    setExplainResult(null);
    setExecutionError(null);
    toast.success("Pipeline cleared");
  };

  const collectionNames = useMemo(() => collections.map((c) => c.name), [collections]);

  return (
    <div className="h-[calc(100vh-32px)] flex flex-col overflow-hidden bg-background text-foreground">
      {/* Top Toolbar */}
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

        {/* Toolbar Controls */}
        <div className="flex items-center gap-2">
          {/* Add Stage */}
          <Button
            size="sm"
            variant="outline"
            className="h-8 text-xs gap-1.5"
            onClick={() => setAddDialogOpen(true)}
          >
            <Plus className="h-3.5 w-3.5" />
            Add Stage
          </Button>

          {/* Clear Pipeline Alert Dialog */}
          <AlertDialog>
            <AlertDialogTrigger asChild>
              <Button
                size="sm"
                variant="ghost"
                className="h-8 text-xs gap-1.5 text-muted-foreground hover:text-destructive"
                disabled={stages.length === 0}
              >
                <RotateCcw className="h-3.5 w-3.5" />
                Clear
              </Button>
            </AlertDialogTrigger>
            <AlertDialogContent>
              <AlertDialogHeader>
                <AlertDialogTitle>Clear Aggregation Pipeline?</AlertDialogTitle>
                <AlertDialogDescription>
                  This will remove all {stages.length} configured pipeline stages. This action cannot be undone.
                </AlertDialogDescription>
              </AlertDialogHeader>
              <AlertDialogFooter>
                <AlertDialogCancel>Cancel</AlertDialogCancel>
                <AlertDialogAction onClick={handleClearPipeline}>Clear Pipeline</AlertDialogAction>
              </AlertDialogFooter>
            </AlertDialogContent>
          </AlertDialog>

          {/* Explain */}
          <Button
            size="sm"
            variant="outline"
            className="h-8 text-xs gap-1.5"
            onClick={handleExplain}
            disabled={!validation.isValid || explainQuery.isPending || runAgg.isPending}
          >
            <Search className="h-3.5 w-3.5" />
            Explain
          </Button>

          {/* Run Pipeline */}
          <Button
            size="sm"
            className="h-8 text-xs gap-1.5 bg-emerald-600 hover:bg-emerald-700 text-white"
            onClick={handleRunPipeline}
            disabled={!validation.isValid || runAgg.isPending || explainQuery.isPending}
          >
            {runAgg.isPending ? (
              <Loader2 className="h-3.5 w-3.5 animate-spin" />
            ) : (
              <Play className="h-3.5 w-3.5 fill-current" />
            )}
            Run Pipeline
          </Button>
        </div>
      </div>

      {/* Validation Banner if errors */}
      {!validation.isValid && stages.length > 0 && (
        <div className="px-4 py-1.5 bg-destructive/10 border-b border-destructive/20 text-destructive text-xs flex items-center gap-2">
          <AlertCircle className="h-3.5 w-3.5 shrink-0" />
          <span className="truncate">{validation.errors[0]?.message}</span>
        </div>
      )}

      {/* Two-Pane Canvas Layout */}
      <div className="flex-1 flex overflow-hidden min-h-0">
        {/* Left Pane: Visual Stage Pipeline Canvas */}
        <div className="flex-1 border-r border-border/40 overflow-y-auto p-4 space-y-3 bg-muted/5">
          {stages.length === 0 ? (
            <div className="h-full flex flex-col items-center justify-center text-center p-8">
              <div className="h-12 w-12 rounded-full bg-emerald-500/10 flex items-center justify-center mb-3">
                <Layers className="h-6 w-6 text-emerald-500" />
              </div>
              <h3 className="text-sm font-semibold text-foreground">Empty Pipeline</h3>
              <p className="text-xs text-muted-foreground max-w-sm mt-1 mb-4">
                Add stages to filter, reshape, join, and aggregate documents from{" "}
                <span className="font-mono text-foreground">{selectedCollection || "collection"}</span>.
              </p>
              <Button
                size="sm"
                className="text-xs gap-1.5"
                onClick={() => setAddDialogOpen(true)}
              >
                <Plus className="h-3.5 w-3.5" />
                Add First Stage
              </Button>
            </div>
          ) : (
            <DndContext
              sensors={sensors}
              collisionDetection={closestCenter}
              onDragEnd={handleDragEnd}
            >
              <SortableContext
                items={stages.map((s) => s.id)}
                strategy={verticalListSortingStrategy}
              >
                <div className="space-y-3">
                  {stages.map((stage, idx) => (
                    <PipelineStageCard
                      key={stage.id}
                      stage={stage}
                      index={idx}
                      totalStages={stages.length}
                      collections={collectionNames}
                      onToggleEnabled={(id) => setStages((p) => toggleStageEnabled(p, id))}
                      onToggleRaw={(id) => setStages((p) => toggleStageRaw(p, id))}
                      onToggleCollapsed={(id) => setStages((p) => toggleStageCollapsed(p, id))}
                      onUpdateConfig={(id, cfg) => setStages((p) => updateStageConfig(p, id, cfg))}
                      onUpdateRawJson={(id, raw) => setStages((p) => updateStageRawJson(p, id, raw))}
                      onDuplicate={(st) => setStages((p) => [...p, duplicateStage(st)])}
                      onDelete={(id) => setStages((p) => deleteStage(p, id))}
                      onMoveUp={(i) => setStages((p) => moveStageUp(p, i))}
                      onMoveDown={(i) => setStages((p) => moveStageDown(p, i))}
                      onPreviewStage={(i) => setPreviewStageIndex(i)}
                    />
                  ))}
                </div>
              </SortableContext>
            </DndContext>
          )}
        </div>

        {/* Right Pane: Top = MQL Preview, Bottom = Results / Explain */}
        <div className="w-[45%] flex flex-col min-h-0 bg-muted/5">
          {/* Top Half: Live Script Preview */}
          <div className="h-[42%] min-h-[160px]">
            <PipelinePreviewPane
              script={formattedScript}
              onExportScratchpad={
                onNavigateToWorkspace
                  ? () => onNavigateToWorkspace(formattedScript)
                  : undefined
              }
            />
          </div>

          {/* Bottom Half: Results Viewer */}
          <div className="flex-1 min-h-0 overflow-auto border-t border-border/40">
            <MongoResultsViewer
              result={explainResult || executionResult}
              isLoading={runAgg.isPending || explainQuery.isPending}
              error={executionError}
              onClear={() => {
                setExecutionResult(null);
                setExplainResult(null);
                setExecutionError(null);
              }}
            />
          </div>
        </div>
      </div>

      {/* Add Stage Dialog */}
      <AddStageDialog
        open={addDialogOpen}
        onOpenChange={setAddDialogOpen}
        onSelectStage={(type: SupportedStageType) => {
          setStages((p) => [...p, createStageItem(type)]);
        }}
      />

      {/* Stage Intermediate Preview Dialog */}
      {previewStageIndex !== null && (
        <StagePreviewDialog
          open={previewStageIndex !== null}
          onOpenChange={(op) => {
            if (!op) setPreviewStageIndex(null);
          }}
          dbId={dbId}
          collection={selectedCollection}
          stages={stages}
          stageIndex={previewStageIndex}
        />
      )}
    </div>
  );
}