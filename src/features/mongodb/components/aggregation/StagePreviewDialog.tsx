import React, { useState, useEffect } from "react";
import { PipelineStageItem } from "./types";
import { serializePipeline } from "./pipelineSerializer";
import { canPrependSample } from "./pipelineValidation";
import { useRunAggregation } from "../../hooks/useMongoMql";
import { MongoResultsViewer } from "../results/MongoResultsViewer";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Switch } from "@/components/ui/switch";
import { Button } from "@/components/ui/button";
import { AlertCircle, Play, Info } from "lucide-react";

export interface StagePreviewDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  dbId: string;
  collection: string;
  stages: PipelineStageItem[];
  stageIndex: number;
}

export const StagePreviewDialog: React.FC<StagePreviewDialogProps> = ({
  open,
  onOpenChange,
  dbId,
  collection,
  stages,
  stageIndex,
}) => {
  const [sampled, setSampled] = useState(false);
  const runAgg = useRunAggregation(dbId);

  // Partial pipeline up to stageIndex
  const partialStages = stages.slice(0, stageIndex + 1);
  const sampleSafety = canPrependSample(partialStages);

  const runPreview = () => {
    let serialized = serializePipeline(partialStages);
    if (sampled && sampleSafety.allowed) {
      serialized = [{ $sample: { size: 500 } }, ...serialized];
    }
    // Append limit 10
    serialized = [...serialized, { $limit: 10 }];

    runAgg.mutate({
      collection,
      pipeline: serialized,
      options: { maxTimeMS: 3000, allowDiskUse: false },
    });
  };

  useEffect(() => {
    if (open && collection) {
      runPreview();
    }
  }, [open, stageIndex, sampled]);

  const currentStage = stages[stageIndex];

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-4xl h-[70vh] flex flex-col p-0 overflow-hidden">
        <DialogHeader className="p-4 border-b border-border/40 shrink-0">
          <div className="flex items-center justify-between">
            <DialogTitle className="text-sm font-semibold flex items-center gap-2">
              <span>Preview Output — Stage {stageIndex + 1}</span>
              <span className="font-mono text-xs text-primary">
                ({currentStage?.type})
              </span>
            </DialogTitle>

            <div className="flex items-center gap-3">
              {/* Sampled Preview Toggle */}
              <div className="flex items-center gap-2 text-xs">
                <span className={sampleSafety.allowed ? "text-foreground" : "text-muted-foreground/60"}>
                  Sampled Preview ($sample: 500)
                </span>
                <Switch
                  checked={sampled}
                  disabled={!sampleSafety.allowed}
                  onCheckedChange={setSampled}
                />
              </div>

              <Button
                size="sm"
                className="h-7 text-xs gap-1"
                onClick={runPreview}
                disabled={runAgg.isPending}
              >
                <Play className="h-3 w-3 fill-current" />
                Refresh
              </Button>
            </div>
          </div>

          {/* Safety Advisory */}
          {!sampleSafety.allowed && (
            <div className="mt-2 text-xs text-amber-500 bg-amber-500/10 border border-amber-500/20 rounded p-2 flex items-start gap-2">
              <AlertCircle className="h-4 w-4 shrink-0 mt-0.5" />
              <span>{sampleSafety.reason}</span>
            </div>
          )}

          {/* Computation Advisory */}
          <div className="mt-2 text-[11px] text-muted-foreground bg-muted/40 rounded p-1.5 flex items-center gap-1.5">
            <Info className="h-3.5 w-3.5 shrink-0" />
            <span>
              Preview executes with a strict 3,000ms timeout and $limit: 10. Prior pipeline stages still scan source collection documents.
            </span>
          </div>
        </DialogHeader>

        <div className="flex-1 min-h-0 overflow-auto">
          <MongoResultsViewer
            result={runAgg.data}
            isLoading={runAgg.isPending}
            error={runAgg.error}
          />
        </div>
      </DialogContent>
    </Dialog>
  );
};