import { useState } from "react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
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
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import {
  Bot,
  Copy,
  Check,
  Trash2,
  ChevronDown,
  Clock,
  Cpu,
  Hash,
  FileText,
} from "lucide-react";
import { MarkdownRenderer } from "./AIResultDialog";
import type { AIHistoryEntry } from "@/services/bridge/ai";
import { cn } from "@/lib/utils";

interface AIHistoryDetailDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  entry: AIHistoryEntry | null;
  onDelete?: (id: number) => void;
}

const FEATURE_LABELS: Record<string, string> = {
  "schema-analysis": "Schema Analysis",
  "query-explanation": "Query Explanation",
  "chart-recommendation": "Chart Recommendation",
};

const PROVIDER_LABELS: Record<string, string> = {
  anthropic: "Anthropic",
  openai: "OpenAI",
  gemini: "Gemini",
  groq: "Groq",
  mistral: "Mistral",
  ollama: "Ollama",
};

function formatDate(iso: string): string {
  try {
    return new Date(iso).toLocaleString(undefined, {
      dateStyle: "medium",
      timeStyle: "short",
    });
  } catch {
    return iso;
  }
}

export function AIHistoryDetailDialog({
  open,
  onOpenChange,
  entry,
  onDelete,
}: AIHistoryDetailDialogProps) {
  const [copiedField, setCopiedField] = useState<"prompt" | "response" | null>(null);
  const [promptOpen, setPromptOpen] = useState(false);

  if (!entry) return null;

  const handleCopy = async (text: string, field: "prompt" | "response") => {
    try {
      await navigator.clipboard.writeText(text);
      setCopiedField(field);
      setTimeout(() => setCopiedField(null), 2000);
    } catch (err) {
      console.error("Failed to copy:", err);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-2xl max-h-[85vh] flex flex-col">
        <DialogHeader className="shrink-0">
          <DialogTitle className="flex items-center gap-2 text-sm">
            <div className="p-1.5 rounded-md bg-primary/10 ring-1 ring-primary/20">
              <Bot className="h-3.5 w-3.5 text-primary" />
            </div>
            Analysis Details
            <Badge
              variant="outline"
              className="ml-auto text-[10px] font-medium px-1.5 py-0 border-primary/30 text-primary bg-primary/8"
            >
              {FEATURE_LABELS[entry.feature] ?? entry.feature}
            </Badge>
          </DialogTitle>
        </DialogHeader>

        <div className="flex-1 min-h-0 overflow-y-auto space-y-4">
          {/* Metadata grid */}
          <div className="grid grid-cols-2 gap-3 p-3 rounded-lg bg-muted/30 border border-border/20">
            <MetaItem
              icon={<Cpu className="h-3 w-3" />}
              label="Provider"
              value={PROVIDER_LABELS[entry.provider] ?? entry.provider}
            />
            <MetaItem
              icon={<Hash className="h-3 w-3" />}
              label="Model"
              value={entry.model}
            />
            <TooltipProvider>
              <Tooltip>
                <TooltipTrigger asChild>
                  <div>
                    <MetaItem
                      icon={<Clock className="h-3 w-3" />}
                      label="Created"
                      value={formatDate(entry.created_at)}
                    />
                  </div>
                </TooltipTrigger>
                <TooltipContent side="bottom" className="text-[10px]">
                  {entry.created_at}
                </TooltipContent>
              </Tooltip>
            </TooltipProvider>
            <MetaItem
              icon={<FileText className="h-3 w-3" />}
              label="Tokens"
              value={entry.tokens_used != null ? entry.tokens_used.toLocaleString() : "N/A"}
            />
          </div>

          {/* Prompt (collapsible) */}
          <Collapsible open={promptOpen} onOpenChange={setPromptOpen}>
            <div className="flex items-center justify-between">
              <CollapsibleTrigger asChild>
                <Button
                  variant="ghost"
                  size="sm"
                  className="gap-1.5 h-7 text-xs text-muted-foreground hover:text-foreground px-2"
                >
                  <ChevronDown
                    className={cn(
                      "h-3 w-3 transition-transform",
                      promptOpen && "rotate-180"
                    )}
                  />
                  Prompt
                </Button>
              </CollapsibleTrigger>
              <Button
                variant="ghost"
                size="sm"
                className="h-6 px-2 text-[10px] gap-1 text-muted-foreground"
                onClick={() => handleCopy(entry.prompt, "prompt")}
              >
                {copiedField === "prompt" ? (
                  <Check className="h-3 w-3 text-emerald-500" />
                ) : (
                  <Copy className="h-3 w-3" />
                )}
                {copiedField === "prompt" ? "Copied" : "Copy Prompt"}
              </Button>
            </div>
            <CollapsibleContent>
              <pre className="mt-1.5 p-3 rounded-md bg-muted/40 border border-border/20 text-[11px] font-mono leading-relaxed overflow-x-auto max-h-48 overflow-y-auto whitespace-pre-wrap">
                {entry.prompt}
              </pre>
            </CollapsibleContent>
          </Collapsible>

          {/* Response */}
          <div>
            <div className="flex items-center justify-between mb-2">
              <span className="text-xs font-medium text-foreground/80">Response</span>
              <Button
                variant="ghost"
                size="sm"
                className="h-6 px-2 text-[10px] gap-1 text-muted-foreground"
                onClick={() => handleCopy(entry.response, "response")}
              >
                {copiedField === "response" ? (
                  <Check className="h-3 w-3 text-emerald-500" />
                ) : (
                  <Copy className="h-3 w-3" />
                )}
                {copiedField === "response" ? "Copied" : "Copy Response"}
              </Button>
            </div>
            <div className="rounded-md border border-border/20 p-3 bg-background/50">
              <MarkdownRenderer content={entry.response} />
            </div>
          </div>

          {/* Delete action */}
          {onDelete && (
            <div className="pt-2 border-t border-border/20 flex justify-end">
              <AlertDialog>
                <AlertDialogTrigger asChild>
                  <Button
                    variant="ghost"
                    size="sm"
                    className="h-7 px-3 text-xs gap-1.5 text-destructive/70 hover:text-destructive hover:bg-destructive/8"
                  >
                    <Trash2 className="h-3 w-3" />
                    Delete Analysis
                  </Button>
                </AlertDialogTrigger>
                <AlertDialogContent>
                  <AlertDialogHeader>
                    <AlertDialogTitle className="text-sm">Delete this analysis?</AlertDialogTitle>
                    <AlertDialogDescription className="text-xs">
                      This will permanently remove this AI analysis from your local history.
                      This action cannot be undone.
                    </AlertDialogDescription>
                  </AlertDialogHeader>
                  <AlertDialogFooter>
                    <AlertDialogCancel className="text-xs h-8">Cancel</AlertDialogCancel>
                    <AlertDialogAction
                      className="text-xs h-8 bg-destructive text-destructive-foreground hover:bg-destructive/90"
                      onClick={() => {
                        onDelete(entry.id);
                        onOpenChange(false);
                      }}
                    >
                      Delete
                    </AlertDialogAction>
                  </AlertDialogFooter>
                </AlertDialogContent>
              </AlertDialog>
            </div>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}

function MetaItem({
  icon,
  label,
  value,
}: {
  icon: React.ReactNode;
  label: string;
  value: string;
}) {
  return (
    <div className="flex items-center gap-2">
      <span className="text-muted-foreground/60">{icon}</span>
      <div className="min-w-0">
        <p className="text-[10px] text-muted-foreground/60 uppercase tracking-wider">{label}</p>
        <p className="text-xs text-foreground/80 truncate">{value}</p>
      </div>
    </div>
  );
}
