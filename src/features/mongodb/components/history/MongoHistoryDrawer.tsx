import React, { useState, useEffect, useCallback } from "react";
import {
  History,
  Trash2,
  Copy,
  Check,
  CheckCircle2,
  AlertCircle,
  Shield,
  ShieldAlert,
  ArrowRight,
  Layers,
} from "lucide-react";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetDescription,
} from "@/components/ui/sheet";
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
import { Switch } from "@/components/ui/switch";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  MqlHistoryEntry,
  MqlHistorySettings,
  REDACTED_TEMPLATE_ADVISORY,
} from "../../history/types";
import {
  getHistory,
  clearHistory,
  getHistorySettings,
  updateHistorySettings,
} from "../../history/historyStorage";
import { toast } from "sonner";
import { cn } from "@/lib/utils";

export interface MongoHistoryDrawerProps {
  dbId: string;
  isOpen: boolean;
  onClose: () => void;
  onSelectEntry: (entry: MqlHistoryEntry) => void;
  className?: string;
}

export const MongoHistoryDrawer: React.FC<MongoHistoryDrawerProps> = ({
  dbId,
  isOpen,
  onClose,
  onSelectEntry,
  className,
}) => {
  const [entries, setEntries] = useState<MqlHistoryEntry[]>([]);
  const [settings, setSettings] = useState<MqlHistorySettings>({ storeRawQueries: false });
  const [copiedId, setCopiedId] = useState<string | null>(null);

  // Load history and settings whenever drawer opens or dbId changes
  const refreshHistory = useCallback(() => {
    if (!dbId) return;
    const currentHistory = getHistory(dbId);
    const currentSettings = getHistorySettings(dbId);
    setEntries(currentHistory);
    setSettings(currentSettings);
  }, [dbId]);

  useEffect(() => {
    if (isOpen) {
      refreshHistory();
    }
  }, [isOpen, refreshHistory]);

  const handleToggleStoreRaw = (checked: boolean) => {
    const updated = updateHistorySettings(dbId, { storeRawQueries: checked });
    setSettings(updated);
    if (checked) {
      toast.warning("Raw query storage enabled. Sensitive literals will be stored in your browser.");
    } else {
      toast.info("Literal value redaction enabled for future queries.");
    }
  };

  const handleClearHistory = () => {
    clearHistory(dbId);
    setEntries([]);
    toast.success("Query history cleared.");
  };

  const handleLoadEntry = (entry: MqlHistoryEntry) => {
    // Replay Safety Invariant: Redacted entries are query templates, not executable queries
    if (entry.isRedacted || !entry.rawQueryText) {
      toast.warning(REDACTED_TEMPLATE_ADVISORY, { duration: 6000 });
    } else {
      toast.info("Loaded query from history into editor.");
    }

    // Pass entry to workspace (without auto-executing)
    onSelectEntry(entry);
    onClose();
  };

  const handleCopyQuery = (e: React.MouseEvent, entry: MqlHistoryEntry) => {
    e.stopPropagation();
    const textToCopy = entry.rawQueryText || entry.redactedQueryText;
    navigator.clipboard.writeText(textToCopy);
    setCopiedId(entry.id);
    toast.success("Query text copied to clipboard");
    setTimeout(() => setCopiedId(null), 1500);
  };

  return (
    <Sheet open={isOpen} onOpenChange={(open) => !open && onClose()}>
      <SheetContent
        side="right"
        className={cn(
          "w-full sm:max-w-xl p-0 flex flex-col h-full bg-background border-l border-border/40",
          className
        )}
      >
        {/* Drawer Header */}
        <SheetHeader className="p-4 border-b border-border/40 shrink-0 bg-muted/20">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <div className="h-7 w-7 rounded-md bg-primary/10 flex items-center justify-center text-primary">
                <History className="h-4 w-4" />
              </div>
              <div>
                <SheetTitle className="text-sm font-semibold">Query History</SheetTitle>
                <SheetDescription className="text-xs text-muted-foreground truncate max-w-xs">
                  Connection: <code className="font-mono text-foreground">{dbId || "default"}</code>
                </SheetDescription>
              </div>
            </div>

            {entries.length > 0 && (
              <AlertDialog>
                <AlertDialogTrigger asChild>
                  <Button
                    variant="outline"
                    size="sm"
                    className="h-7 px-2 text-xs gap-1 text-destructive hover:bg-destructive/10 border-destructive/30"
                  >
                    <Trash2 className="h-3 w-3" />
                    Clear History
                  </Button>
                </AlertDialogTrigger>
                <AlertDialogContent>
                  <AlertDialogHeader>
                    <AlertDialogTitle>Clear Query History</AlertDialogTitle>
                    <AlertDialogDescription>
                      Are you sure you want to clear all query history for this connection? This action cannot be undone.
                    </AlertDialogDescription>
                  </AlertDialogHeader>
                  <AlertDialogFooter>
                    <AlertDialogCancel>Cancel</AlertDialogCancel>
                    <AlertDialogAction
                      onClick={handleClearHistory}
                      className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
                    >
                      Clear All History
                    </AlertDialogAction>
                  </AlertDialogFooter>
                </AlertDialogContent>
              </AlertDialog>
            )}
          </div>
        </SheetHeader>

        {/* Privacy Settings Section */}
        <div className="px-4 py-3 border-b border-border/40 bg-muted/10 shrink-0 text-xs space-y-2">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              {settings.storeRawQueries ? (
                <ShieldAlert className="h-4 w-4 text-amber-500 shrink-0" />
              ) : (
                <Shield className="h-4 w-4 text-emerald-500 shrink-0" />
              )}
              <div>
                <p className="font-medium text-foreground">Store Raw Queries Locally</p>
                <p className="text-[11px] text-muted-foreground leading-tight">
                  {settings.storeRawQueries
                    ? "Raw query strings with literal values are being stored in localStorage."
                    : "Literal values (emails, IDs, passwords) are redacted into templates by default."}
                </p>
              </div>
            </div>
            <Switch
              checked={settings.storeRawQueries}
              onCheckedChange={handleToggleStoreRaw}
              aria-label="Toggle raw query storage"
            />
          </div>

          {settings.storeRawQueries && (
            <div className="rounded p-2 bg-amber-500/10 border border-amber-500/20 text-[11px] text-amber-600 dark:text-amber-400">
              <strong>Privacy Warning:</strong> Storing raw queries may persist sensitive personal data, authorization tokens, or passwords to your browser's unencrypted local storage.
            </div>
          )}
        </div>

        {/* Entry List Body */}
        <div className="flex-1 overflow-auto p-4 space-y-3">
          {entries.length === 0 ? (
            <div className="h-full flex flex-col items-center justify-center p-8 text-center text-muted-foreground">
              <div className="h-10 w-10 rounded-full bg-muted/40 border border-border/50 flex items-center justify-center mb-2">
                <Layers className="h-5 w-5 text-muted-foreground/60" />
              </div>
              <p className="text-sm font-medium text-foreground">No Query History</p>
              <p className="text-xs text-muted-foreground/80 mt-1 max-w-xs">
                Queries executed in this database workspace will appear here (up to 50 entries).
              </p>
            </div>
          ) : (
            entries.map((entry) => {
              const displayText = entry.rawQueryText || entry.redactedQueryText;
              return (
                <div
                  key={entry.id}
                  className="rounded-lg border border-border/50 bg-card hover:border-border transition-colors p-3 text-xs space-y-2 group"
                >
                  {/* Top metadata line */}
                  <div className="flex items-center justify-between gap-2">
                    <div className="flex items-center gap-1.5 flex-wrap">
                      <Badge variant="outline" className="font-mono text-[10px] px-1 py-0 h-4">
                        {entry.operation}()
                      </Badge>
                      <span className="font-mono font-medium text-foreground text-[11px]">
                        db.{entry.collection}
                      </span>
                      {entry.isRedacted ? (
                        <Badge
                          variant="secondary"
                          className="text-[10px] px-1 py-0 h-4 bg-amber-500/10 text-amber-600 dark:text-amber-400 border-amber-500/20"
                        >
                          Template
                        </Badge>
                      ) : (
                        <Badge
                          variant="secondary"
                          className="text-[10px] px-1 py-0 h-4 bg-blue-500/10 text-blue-600 dark:text-blue-400 border-blue-500/20"
                        >
                          Raw Query
                        </Badge>
                      )}
                    </div>

                    <div className="flex items-center gap-1.5 text-muted-foreground text-[10px] shrink-0">
                      {entry.status === "success" ? (
                        <span className="inline-flex items-center text-emerald-500">
                          <CheckCircle2 className="h-3 w-3 mr-0.5" />
                          {entry.durationMs}ms
                        </span>
                      ) : (
                        <span className="inline-flex items-center text-destructive">
                          <AlertCircle className="h-3 w-3 mr-0.5" />
                          Failed
                        </span>
                      )}
                      <span>•</span>
                      <span>{new Date(entry.timestamp).toLocaleTimeString()}</span>
                    </div>
                  </div>

                  {/* Query preview block */}
                  <div className="relative rounded bg-muted/40 border border-border/40 p-2 font-mono text-[11px] max-h-24 overflow-auto select-text">
                    <pre className="whitespace-pre-wrap break-all text-muted-foreground group-hover:text-foreground transition-colors">
                      {displayText}
                    </pre>
                  </div>

                  {/* Error message snippet if query failed */}
                  {entry.status === "error" && entry.errorMessage && (
                    <div className="text-[11px] text-destructive bg-destructive/10 border border-destructive/20 rounded p-1.5 font-mono break-all">
                      {entry.errorMessage}
                    </div>
                  )}

                  {/* Actions footer */}
                  <div className="flex items-center justify-between pt-1">
                    <span className="text-[10px] text-muted-foreground/60">
                      {new Date(entry.timestamp).toLocaleDateString()}
                    </span>

                    <div className="flex items-center gap-1">
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={(e) => handleCopyQuery(e, entry)}
                        className="h-6 px-2 text-[11px] gap-1 text-muted-foreground hover:text-foreground"
                      >
                        {copiedId === entry.id ? (
                          <Check className="h-3 w-3 text-emerald-500" />
                        ) : (
                          <Copy className="h-3 w-3" />
                        )}
                        Copy
                      </Button>

                      <Button
                        size="sm"
                        onClick={() => handleLoadEntry(entry)}
                        className="h-6 px-2.5 text-[11px] gap-1 bg-primary text-primary-foreground hover:bg-primary/90"
                      >
                        Load
                        <ArrowRight className="h-3 w-3" />
                      </Button>
                    </div>
                  </div>
                </div>
              );
            })
          )}
        </div>
      </SheetContent>
    </Sheet>
  );
};
