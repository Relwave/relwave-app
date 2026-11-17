import React, { useState } from "react";
import { MongoMqlEditor } from "../editor/MongoMqlEditor";
import { Button } from "@/components/ui/button";
import { Copy, Check, ExternalLink, Code } from "lucide-react";
import { toast } from "sonner";

export interface PipelinePreviewPaneProps {
  script: string;
  onExportScratchpad?: (script: string) => void;
}

export const PipelinePreviewPane: React.FC<PipelinePreviewPaneProps> = ({
  script,
  onExportScratchpad,
}) => {
  const [copied, setCopied] = useState(false);

  const handleCopy = () => {
    navigator.clipboard.writeText(script);
    setCopied(true);
    toast.success("Aggregation script copied to clipboard");
    setTimeout(() => setCopied(false), 1500);
  };

  return (
    <div className="h-full flex flex-col bg-muted/10 border-b border-border/40">
      <div className="h-10 px-3 flex items-center justify-between border-b border-border/40 bg-muted/30 shrink-0">
        <div className="flex items-center gap-1.5 text-xs font-semibold text-muted-foreground">
          <Code className="h-3.5 w-3.5 text-primary" />
          <span>Live MQL / EJSON Script</span>
        </div>

        <div className="flex items-center gap-1">
          <Button
            type="button"
            variant="ghost"
            size="sm"
            className="h-7 text-xs gap-1 px-2"
            onClick={handleCopy}
          >
            {copied ? <Check className="h-3 w-3 text-emerald-500" /> : <Copy className="h-3 w-3" />}
            Copy Script
          </Button>

          {onExportScratchpad && (
            <Button
              type="button"
              variant="ghost"
              size="sm"
              className="h-7 text-xs gap-1 px-2"
              onClick={() => onExportScratchpad(script)}
            >
              <ExternalLink className="h-3 w-3" />
              Export to Scratchpad
            </Button>
          )}
        </div>
      </div>

      <div className="flex-1 min-h-0">
        <MongoMqlEditor value={script} onChange={() => {}} disabled={true} minHeight="100%" />
      </div>
    </div>
  );
};
