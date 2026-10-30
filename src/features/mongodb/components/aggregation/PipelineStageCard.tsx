import React from "react";
import { useSortable } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { PipelineStageItem } from "./types";
import { STAGE_DEFINITIONS } from "./stages/registry";
import { MongoMqlEditor } from "../editor/MongoMqlEditor";
import { Switch } from "@/components/ui/switch";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  GripVertical,
  ChevronDown,
  ChevronRight,
  ChevronUp,
  Copy,
  Trash2,
  Code2,
  Play,
} from "lucide-react";
import { cn } from "@/lib/utils";

export interface PipelineStageCardProps {
  stage: PipelineStageItem;
  index: number;
  totalStages: number;
  collections?: string[];
  onToggleEnabled: (id: string) => void;
  onToggleRaw: (id: string) => void;
  onToggleCollapsed: (id: string) => void;
  onUpdateConfig: (id: string, config: Record<string, any>) => void;
  onUpdateRawJson: (id: string, raw: string) => void;
  onDuplicate: (stage: PipelineStageItem) => void;
  onDelete: (id: string) => void;
  onMoveUp: (index: number) => void;
  onMoveDown: (index: number) => void;
  onPreviewStage: (index: number) => void;
}

export const PipelineStageCard: React.FC<PipelineStageCardProps> = ({
  stage,
  index,
  totalStages,
  collections = [],
  onToggleEnabled,
  onToggleRaw,
  onToggleCollapsed,
  onUpdateConfig,
  onUpdateRawJson,
  onDuplicate,
  onDelete,
  onMoveUp,
  onMoveDown,
  onPreviewStage,
}) => {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } =
    useSortable({
      id: stage.id,
      data: {
        type: "stage",
        stage,
      },
    });

  const style: React.CSSProperties = {
    transform: CSS.Translate.toString(transform),
    transition,
    opacity: isDragging ? 0.35 : stage.enabled ? 1 : 0.6,
  };

  const def = STAGE_DEFINITIONS[stage.type];
  const EditorComponent = def?.component;

  return (
    <div
      ref={setNodeRef}
      style={style}
      className={cn(
        "rounded-lg border bg-card/60 shadow-xs transition-all overflow-hidden",
        stage.enabled
          ? "border-border/80 hover:border-border"
          : "border-border/40 bg-muted/20",
        isDragging && "ring-2 ring-primary/40",
      )}
    >
      {/* Stage Header */}
      <div className="h-11 px-3 flex items-center justify-between gap-2 border-b border-border/40 bg-muted/30">
        <div className="flex items-center gap-2 min-w-0">
          {/* Drag Handle */}
          <button
            {...attributes}
            {...listeners}
            className="p-1 rounded cursor-grab active:cursor-grabbing text-muted-foreground hover:text-foreground hover:bg-muted"
            title="Drag to reorder stage"
          >
            <GripVertical className="h-3.5 w-3.5" />
          </button>

          {/* Stage Order Badge */}
          <Badge variant="outline" className="h-5 px-1.5 text-[10px] font-mono">
            #{index + 1}
          </Badge>

          {/* Stage Operator */}
          <span className="font-mono font-semibold text-xs text-primary">
            {stage.type}
          </span>

          {/* Stage Label */}
          <span className="text-xs text-muted-foreground truncate">
            {def?.label}
          </span>
        </div>

        {/* Stage Actions */}
        <div className="flex items-center gap-1">
          {/* Enable / Disable Switch */}
          <Switch
            checked={stage.enabled}
            onCheckedChange={() => onToggleEnabled(stage.id)}
            title={stage.enabled ? "Disable stage" : "Enable stage"}
          />

          {/* Raw Mode Toggle */}
          {stage.type !== "$raw" && (
            <Button
              type="button"
              variant={stage.isRaw ? "secondary" : "ghost"}
              size="sm"
              className="h-7 px-2 text-[11px] gap-1"
              onClick={() => onToggleRaw(stage.id)}
              title="Toggle raw JSON editor"
            >
              <Code2 className="h-3 w-3" />
              Raw
            </Button>
          )}

          {/* Move Up */}
          <Button
            type="button"
            variant="ghost"
            size="sm"
            disabled={index === 0}
            className="h-7 w-7 p-0"
            onClick={() => onMoveUp(index)}
            title="Move Up"
          >
            <ChevronUp className="h-3.5 w-3.5" />
          </Button>

          {/* Move Down */}
          <Button
            type="button"
            variant="ghost"
            size="sm"
            disabled={index >= totalStages - 1}
            className="h-7 w-7 p-0"
            onClick={() => onMoveDown(index)}
            title="Move Down"
          >
            <ChevronDown className="h-3.5 w-3.5" />
          </Button>

          {/* Duplicate */}
          <Button
            type="button"
            variant="ghost"
            size="sm"
            className="h-7 w-7 p-0"
            onClick={() => onDuplicate(stage)}
            title="Duplicate Stage"
          >
            <Copy className="h-3.5 w-3.5" />
          </Button>

          {/* Delete */}
          <Button
            type="button"
            variant="ghost"
            size="sm"
            className="h-7 w-7 p-0 text-muted-foreground hover:text-destructive"
            onClick={() => onDelete(stage.id)}
            title="Delete Stage"
          >
            <Trash2 className="h-3.5 w-3.5" />
          </Button>

          {/* Collapse / Expand */}
          <Button
            type="button"
            variant="ghost"
            size="sm"
            className="h-7 w-7 p-0"
            onClick={() => onToggleCollapsed(stage.id)}
            title={stage.collapsed ? "Expand" : "Collapse"}
          >
            {stage.collapsed ? (
              <ChevronRight className="h-3.5 w-3.5" />
            ) : (
              <ChevronDown className="h-3.5 w-3.5" />
            )}
          </Button>
        </div>
      </div>

      {/* Stage Body */}
      {!stage.collapsed && (
        <div className="p-3.5 space-y-3">
          {stage.isRaw ? (
            <div className="rounded-md border border-border/60 overflow-hidden bg-background">
              <MongoMqlEditor
                value={stage.rawJson}
                onChange={(val) => onUpdateRawJson(stage.id, val)}
                minHeight="100px"
              />
            </div>
          ) : EditorComponent ? (
            <EditorComponent
              stage={stage}
              onChange={(cfg) => onUpdateConfig(stage.id, cfg)}
              collections={collections}
            />
          ) : null}

          {/* Preview Partial Pipeline Button */}
          <div className="flex items-center justify-between pt-1 border-t border-border/40 text-xs text-muted-foreground">
            <span className="truncate">{def?.description}</span>
            <Button
              type="button"
              variant="outline"
              size="sm"
              className="h-6 text-[11px] gap-1 shrink-0"
              onClick={() => onPreviewStage(index)}
              title="Preview intermediate output up to this stage"
            >
              <Play className="h-2.5 w-2.5 fill-current" />
              Preview Stage
            </Button>
          </div>
        </div>
      )}
    </div>
  );
};